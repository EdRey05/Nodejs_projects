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

export async function saveDatabaseFile(logType: string, buffer: ArrayBuffer) {
  await ensureDataDir();
  const fileName = `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`;
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return fileName;
}

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

export async function saveImages(logType: string, images: Record<string, string[]>) {
  await ensureDataDir();
  const imagesDir = path.join(DATA_DIR, 'images', logType.toLowerCase().replace(/ /g, '_'));

  // Clear old images for this log type to avoid stale data
  try {
    await fs.rm(imagesDir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }

  await fs.mkdir(imagesDir, { recursive: true });

  for (const [key, dataUris] of Object.entries(images)) {
    // Sanitize key to prevent path traversal
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');

    for (let i = 0; i < dataUris.length; i++) {
      const dataUri = dataUris[i];
      const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) continue;

      const ext = match[1];
      const base64Data = match[2];
      const fileName = `${sanitizedKey}_${i}.${ext}`;
      const filePath = path.join(imagesDir, fileName);
      await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
    }
  }
}

export async function loadImages(logType: string): Promise<Record<string, string[]>> {
  const imagesDir = path.join(DATA_DIR, 'images', logType.toLowerCase().replace(/ /g, '_'));
  const result: Record<string, { index: number, dataUri: string }[]> = {};

  try {
    const files = await fs.readdir(imagesDir);
    for (const file of files) {
      const match = file.match(/^(.+)_(\d+)\.(\w+)$/);
      if (!match) continue;

      const key = match[1];
      const index = parseInt(match[2], 10);
      const filePath = path.join(imagesDir, file);
      const buffer = await fs.readFile(filePath);
      const ext = match[3];
      const dataUri = `data:image/${ext};base64,${buffer.toString('base64')}`;

      if (!result[key]) {
        result[key] = [];
      }
      result[key].push({ index, dataUri });
    }
  } catch {
    // Directory might not exist
  }

  // Sort by index and return as string[]
  const sortedResult: Record<string, string[]> = {};
  for (const key in result) {
    sortedResult[key] = result[key]
      .sort((a, b) => a.index - b.index)
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
