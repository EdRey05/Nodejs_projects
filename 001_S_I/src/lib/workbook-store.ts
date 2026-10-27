import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import * as XLSX from 'xlsx';
import { readWorkbook, createWorkbook, validateWorkbookData, type WorkbookData, type WorkbookBinding } from './workbook';

export class WorkbookError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const maxSize = 25 * 1024 * 1024;

export function pickWorkbook(initialPath = ''): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.reject(new WorkbookError('Use a full workbook path on this platform.'));
  // Fixed script: file paths are passed as environment data, never interpolated code.
  const script = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Open your Savings & Investing workbook'
    $dialog.Filter = 'Excel workbook (*.xlsx)|*.xlsx'
    $dialog.CheckFileExists = $true
    if ($env:SI_PICKER_START) { $dialog.InitialDirectory = [IO.Path]::GetDirectoryName($env:SI_PICKER_START) }
    $owner = New-Object System.Windows.Forms.Form
    $owner.ShowInTaskbar = $false
    $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.Opacity = 0
    $owner.TopMost = $true
    try { $owner.Show(); $owner.Activate(); if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) } }
    finally { $dialog.Dispose(); $owner.Dispose() }
  `;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => execFile(executable, ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true, encoding: 'utf8', timeout: 300000, env: { ...process.env, SI_PICKER_START: initialPath },
  }, (error, stdout) => error ? reject(new WorkbookError('Could not open the file picker. Try again or enter the full path.')) : resolve(stdout.trim() || null)));
}

export class WorkbookStore {
  private binding: WorkbookBinding | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory = process.env.SI_SETTINGS_DIR || path.join(process.env.LOCALAPPDATA || homedir(), 'SavingsInvestingTracker')) {}
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action, action);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async atomicWrite(file: string, bytes: Uint8Array | string) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx');
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
  private async readBytes(file: string) {
    if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw new WorkbookError('Choose an existing .xlsx workbook using its full path.');
    const actual = await fs.realpath(file);
    const stat = await fs.stat(actual);
    if (!stat.isFile() || stat.size > maxSize) throw new WorkbookError('Choose a workbook smaller than 25 MB.');
    const bytes = await fs.readFile(actual);
    return { actual, bytes, revision: digest(bytes) };
  }
  private async read(file: string) {
    const loaded = await this.readBytes(file);
    return { ...loaded, data: readWorkbook(loaded.bytes) };
  }
  private async remember(file: string) {
    await fs.mkdir(this.directory, { recursive: true });
    await this.atomicWrite(path.join(this.directory, 'settings.json'), JSON.stringify({ workbookPath: file }, null, 2));
  }
  async startup() {
    return this.exclusive(async () => {
      let file: string | null = null;
      try {
        const config = JSON.parse(await fs.readFile(path.join(this.directory, 'settings.json'), 'utf8'));
        if (typeof config.workbookPath !== 'string') throw new Error('Invalid saved workbook location.');
        file = config.workbookPath;
        const loaded = await this.read(file!);
        if (this.binding?.path !== loaded.actual || this.binding?.revision !== loaded.revision) this.binding = { path: loaded.actual, revision: loaded.revision, token: randomUUID() };
        return { binding: this.binding, data: loaded.data, path: loaded.actual };
      } catch (error) {
        this.binding = null;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !file) return { binding: null, path: null };
        return { binding: null, path: file, error: file ? 'The previous workbook is missing, unreadable or invalid. Choose it again or open another workbook.' : 'The saved workbook location could not be read. Open a workbook to choose it again.' };
      }
    });
  }
  async open(file: string) {
    return this.exclusive(async () => {
      const loaded = await this.read(file);
      await this.remember(loaded.actual);
      this.binding = { path: loaded.actual, revision: loaded.revision, token: randomUUID() };
      return { binding: this.binding, data: loaded.data, path: loaded.actual };
    });
  }
  async save(input: { binding: WorkbookBinding; data: WorkbookData }) {
    return this.exclusive(async () => {
      const selected = this.binding;
      if (!selected || input.binding?.token !== selected.token || input.binding.path !== selected.path) throw new WorkbookError('The selected workbook changed. Reload it before saving.', 409);
      const current = await this.readBytes(selected.path);
      if (current.revision !== input.binding.revision) throw new WorkbookError('The workbook changed outside this page. Export your unsaved edits or reload the file before continuing.', 409);
      const data = validateWorkbookData(input.data);
      const bytes = XLSX.write(createWorkbook(data, current.bytes), { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const backups = path.join(this.directory, 'backups');
      await fs.mkdir(backups, { recursive: true });
      const prefix = path.join(backups, digest(selected.path));
      try { await fs.writeFile(`${prefix}.original.xlsx`, current.bytes, { flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      await this.atomicWrite(`${prefix}.previous.xlsx`, current.bytes);
      if (digest(await fs.readFile(selected.path)) !== current.revision) throw new WorkbookError('The workbook changed while saving. Your edits are still in this page.', 409);
      await this.atomicWrite(selected.path, bytes);
      this.binding = { ...selected, revision: digest(bytes) };
      return { binding: this.binding };
    });
  }
}

export function checkWorkbookRequest(request: Request, mutation = false) {
  const host = request.headers.get('host');
  // Next's internal Request URL can use a normalized hostname. Validate the
  // actual Host/Origin pair instead, keeping the public surface loopback-only.
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new WorkbookError('Local requests only.', 403);
  const origin = request.headers.get('origin');
  const expected = `http://${host}`;
  if ((origin && origin !== expected) || (mutation && (origin !== expected || request.headers.get('x-si-request') !== '1'))) throw new WorkbookError('Cross-origin request denied.', 403);
}
