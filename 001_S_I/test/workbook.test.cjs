const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const XLSX = require('xlsx');
const load = require('./load-ts.cjs');
const { WorkbookStore, checkWorkbookRequest } = load('workbook-store');
const { readWorkbook } = load('workbook');
const { generateGrowthData, calculateProjectionData, generateAssetPerformanceData } = load('calculations');
const source = path.join(process.env.NODEJS_DEMO_DATA || path.resolve(__dirname, '../../demo-data'), '001/Synthetic_Portfolio.xlsx');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-workbook-'));
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('si-workbook-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'Portfolio with spaces.xlsx');
  await fs.copyFile(source, file);
  return { root, file, store: new WorkbookStore(path.join(root, 'settings')) };
}
function deposit(data, id = 'test_extra', amount = 100) {
  return { ...data, transactions: [...data.transactions, { id, accountId: 'demo_savings', type: 'contribution', date: new Date().toISOString(), amount }] };
}

test('open is read-only; edits save to the selected file; a fresh process rediscovers it', async t => {
  const { root, file, store } = await fixture(t);
  const before = await fs.readFile(file);
  assert.equal((await store.startup()).binding, null);
  const opened = await store.open(file);
  assert.deepEqual(await fs.readFile(file), before);
  const saved = await store.save({ binding: opened.binding, data: deposit(opened.data) });
  assert.notEqual(saved.binding.revision, opened.binding.revision);
  const fresh = await new WorkbookStore(path.join(root, 'settings')).startup();
  assert.equal(fresh.path, file);
  assert.equal(fresh.data.transactions.length, 452);
  assert.equal(fresh.data.transactions.find(txn => txn.id === 'test_extra').amount, 100);
  const backups = await fs.readdir(path.join(root, 'settings/backups'));
  assert.equal(backups.length, 2);
  assert.deepEqual(await fs.readFile(path.join(root, 'settings/backups', backups.find(name => name.endsWith('.original.xlsx')))), before);
});

test('external edits and stale pages cannot silently overwrite a workbook', async t => {
  const { file, store } = await fixture(t);
  const opened = await store.open(file);
  const external = XLSX.readFile(file, { cellDates: true });
  XLSX.utils.book_append_sheet(external, XLSX.utils.aoa_to_sheet([['Keep this note']]), 'Notes');
  XLSX.writeFile(external, file);
  const changed = await fs.readFile(file);
  await assert.rejects(store.save({ binding: opened.binding, data: deposit(opened.data) }), /changed outside/);
  assert.deepEqual(await fs.readFile(file), changed);
  const reloaded = await store.open(file);
  const first = await store.save({ binding: reloaded.binding, data: deposit(reloaded.data) });
  await assert.rejects(store.save({ binding: reloaded.binding, data: deposit(reloaded.data, 'stale', 200) }), /changed outside/);
  assert.equal(XLSX.readFile(file).Sheets.Notes.A1.v, 'Keep this note');
  assert.equal(readWorkbook(await fs.readFile(file)).transactions.length, 452);
  assert.equal(first.binding.path, file);
});

test('invalid, missing and switched files never become blank auto-saves', async t => {
  const { root, file, store } = await fixture(t);
  const opened = await store.open(file);
  const original = await fs.readFile(file);
  await assert.rejects(store.save({ binding: opened.binding, data: { accounts: [], transactions: opened.data.transactions } }), /Transactions/);
  assert.deepEqual(await fs.readFile(file), original);
  const other = path.join(root, 'Other.xlsx'); await fs.copyFile(file, other);
  await store.open(other);
  await assert.rejects(store.save({ binding: opened.binding, data: deposit(opened.data) }), /selected workbook changed/);
  await fs.unlink(other);
  const missing = await new WorkbookStore(path.join(root, 'settings')).startup();
  assert.equal(missing.binding, null); assert.equal(missing.path, other); assert.match(missing.error, /missing/);
  await fs.writeFile(other, 'not an Excel workbook');
  const invalid = await new WorkbookStore(path.join(root, 'settings')).startup();
  assert.equal(invalid.binding, null); assert.ok(invalid.error);
  assert.equal(await fs.readFile(other, 'utf8'), 'not an Excel workbook');
});

test('local workbook API rejects cross-site access and missing mutation headers', () => {
  const make = headers => new Request('http://127.0.0.1:9002/api/workbook', { headers: { host: '127.0.0.1:9002', ...headers } });
  checkWorkbookRequest(make({}));
  checkWorkbookRequest(make({ origin: 'http://127.0.0.1:9002', 'x-si-request': '1' }), true);
  checkWorkbookRequest(new Request('http://localhost:9002/api/workbook', { headers: { host: '127.0.0.1:9002', origin: 'http://127.0.0.1:9002', 'x-si-request': '1' } }), true);
  assert.throws(() => checkWorkbookRequest(make({ origin: 'https://other.example', 'x-si-request': '1' }), true), /Cross-origin/);
  assert.throws(() => checkWorkbookRequest(make({}), true), /Cross-origin/);
  assert.throws(() => checkWorkbookRequest(make({ host: 'other.example:9002' })), /Local requests/);
});

test('history, projection and performance dates all show four-digit years', async () => {
  const data = readWorkbook(await fs.readFile(source));
  const rows = data.transactions.filter(txn => txn.accountId === 'demo_self');
  for (const points of [generateGrowthData(rows), calculateProjectionData(1000, 500, 7, 30), generateAssetPerformanceData(rows).monthlyData]) {
    assert.ok(points.length);
    for (const point of points) assert.match(point.month, /^[A-Z][a-z]{2} \d{4}$/);
  }
});
