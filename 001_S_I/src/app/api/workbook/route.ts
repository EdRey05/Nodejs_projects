import { WorkbookStore, WorkbookError, checkWorkbookRequest, pickWorkbook } from '../../../lib/workbook-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const globalStore = globalThis as typeof globalThis & { siWorkbookStore?: WorkbookStore; siPickerOpen?: boolean };
const store = globalStore.siWorkbookStore ||= new WorkbookStore();
const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const failed = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException)?.code;
  const message = ['EACCES', 'EPERM', 'EBUSY'].includes(code || '') ? 'The workbook is not writable or is open in another program. Your edits are still in this page; close it in Excel and retry saving.'
    : code === 'ENOENT' ? 'The workbook could not be found. Choose it again.' : error instanceof Error ? error.message : 'Could not access the workbook.';
  return respond({ error: message }, error instanceof WorkbookError ? error.status : 500);
};

export async function GET(request: Request) {
  try { checkWorkbookRequest(request); return respond(await store.startup()); } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    checkWorkbookRequest(request, true);
    if (globalStore.siPickerOpen) throw new WorkbookError('Close the current file picker first.', 409);
    const input = await request.json();
    if (input.action === 'pick') {
      globalStore.siPickerOpen = true;
      try {
        const current = await store.startup();
        const file = await pickWorkbook(current.path || '');
        return file ? respond(await store.open(file)) : respond({ cancelled: true });
      } finally { globalStore.siPickerOpen = false; }
    }
    if (input.action !== 'open' || typeof input.path !== 'string') throw new WorkbookError('Choose a workbook path.');
    return respond(await store.open(input.path));
  } catch (error) { return failed(error); }
}
export async function PUT(request: Request) {
  try {
    checkWorkbookRequest(request, true);
    const body = await request.text();
    if (Buffer.byteLength(body) > 25 * 1024 * 1024) throw new WorkbookError('Workbook data is too large.', 413);
    return respond(await store.save(JSON.parse(body)));
  } catch (error) { return failed(error); }
}
