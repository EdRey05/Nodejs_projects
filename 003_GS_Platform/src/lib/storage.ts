import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/** @deprecated DuckDB is now the primary data store. Use processAndPersist server action instead. */
export async function saveDatabaseFile(logType: string, buffer: ArrayBuffer) {
  await ensureDataDir();
  const fileName = `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`;
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return fileName;
}

/** @deprecated DuckDB is now the primary data store. Use fetchPersistedData server action instead. */
export async function loadDatabaseFile(logType: string): Promise<ArrayBuffer | null> {
  const fileName = `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`;
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const buffer = await fs.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return arrayBuffer as ArrayBuffer;
  } catch {
    return null;
  }
}

export async function getDuckDBPath() {
  await ensureDataDir();
  return path.join(DATA_DIR, 'GeneSyn_db_v2.duckdb');
}

function logTypeDir(logType: string) {
  return path.join(DATA_DIR, 'images', logType.toLowerCase().replace(/ /g, '_'));
}

/** Remove characters that are unsafe in image filenames. Must stay in sync with the python-side naming. */
function sanitizeEntryCode(entryCode: string): string {
  return entryCode.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Canonical image filename scheme: entryCode_Pplate_Img.ext
 * e.g. U0102-ColonyPCR-FL_P1_I1.png — plates are 1-based, images are 1-based,
 * and multiple images per plate are supported (I1, I2, ...).
 */
function buildImageFileName(entryCode: string, plate: number, image: number, ext: string): string {
  return `${sanitizeEntryCode(entryCode)}_P${plate}_I${image}.${ext}`;
}

type ParsedImageFile = { entryCode: string; plate: number; image: number; ext: string };

/**
 * Parse an image filename in either scheme:
 *  - NEW: entryCode_Pplate_Img.ext (plate 1-based, img 1-based)
 *  - OLD (legacy, migration fallback): entryCode_plate_imgIdx.ext (plate 1-based, imgIdx 0-based)
 * Returns null for files that match neither.
 */
function parseImageFileName(fileName: string): ParsedImageFile | null {
  const newMatch = fileName.match(/^(.+)_P(\d+)_I(\d+)\.(\w+)$/);
  if (newMatch) {
    return {
      entryCode: newMatch[1],
      plate: parseInt(newMatch[2], 10),
      image: parseInt(newMatch[3], 10),
      ext: newMatch[4],
    };
  }
  const oldMatch = fileName.match(/^(.+)_(\d+)_(\d+)\.(\w+)$/);
  if (oldMatch) {
    return {
      entryCode: oldMatch[1],
      plate: parseInt(oldMatch[2], 10),
      image: parseInt(oldMatch[3], 10) + 1, // legacy imgIdx was 0-based
      ext: oldMatch[4],
    };
  }
  return null;
}

/**
 * Save images for the given entries. Image record keys are "<entryCode>_P<plate>"
 * (plate 1-based, matching the DB plate_id); each value is an ordered array of
 * data URIs written as I1, I2, ...
 *
 * Only image files belonging to the entries present in this save set are removed
 * before writing — files of any other entry in the same log-type dir are never
 * touched.
 */
export async function saveImages(logType: string, images: Record<string, string[]>) {
  await ensureDataDir();
  const imagesDir = logTypeDir(logType);
  await fs.mkdir(imagesDir, { recursive: true });

  const entryCodes = new Set<string>();
  for (const key of Object.keys(images)) {
    const match = key.match(/^(.+)_P(\d+)$/);
    if (match) entryCodes.add(sanitizeEntryCode(match[1]));
  }

  const files = await fs.readdir(imagesDir).catch(() => [] as string[]);
  for (const file of files) {
    const parsed = parseImageFileName(file);
    if (parsed && entryCodes.has(parsed.entryCode)) {
      await fs.rm(path.join(imagesDir, file), { force: true });
    }
  }

  for (const [key, dataUris] of Object.entries(images)) {
    const match = key.match(/^(.+)_P(\d+)$/);
    if (!match) continue;
    const entryCode = sanitizeEntryCode(match[1]);
    const plate = parseInt(match[2], 10);

    for (let i = 0; i < dataUris.length; i++) {
      const dataUri = dataUris[i];
      const uriMatch = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!uriMatch) continue;

      const fileName = buildImageFileName(entryCode, plate, i + 1, uriMatch[1]);
      await fs.writeFile(path.join(imagesDir, fileName), Buffer.from(uriMatch[2], 'base64'));
    }
  }
}

/**
 * Load images for a log type, grouped as "<entryCode>_P<plate>" -> dataUri[].
 * Reads both the new naming scheme and legacy files (pre-migration), sorted
 * ascending by image number.
 */
export async function loadImages(logType: string): Promise<Record<string, string[]>> {
  const imagesDir = logTypeDir(logType);
  const result: Record<string, { image: number; dataUri: string }[]> = {};

  try {
    const files = await fs.readdir(imagesDir);
    for (const file of files) {
      const parsed = parseImageFileName(file);
      if (!parsed) continue;

      const key = `${parsed.entryCode}_P${parsed.plate}`;
      const filePath = path.join(imagesDir, file);
      const buffer = await fs.readFile(filePath);
      const dataUri = `data:image/${parsed.ext};base64,${buffer.toString('base64')}`;

      if (!result[key]) {
        result[key] = [];
      }
      result[key].push({ image: parsed.image, dataUri });
    }
  } catch {
    // Directory might not exist
  }

  const sortedResult: Record<string, string[]> = {};
  for (const key in result) {
    sortedResult[key] = result[key]
      .sort((a, b) => a.image - b.image)
      .map(item => item.dataUri);
  }

  return sortedResult;
}

export async function createDataZip(): Promise<Buffer> {
  await ensureDataDir();
  const zip = new AdmZip();
  zip.addLocalFolder(DATA_DIR);
  return zip.toBuffer();
}