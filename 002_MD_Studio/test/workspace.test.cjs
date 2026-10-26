const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('workspace selection persists, cancellation/errors preserve it, and concurrent pickers are refused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-workspace-'));
  const first = path.join(root, 'First folder');
  const second = path.join(root, 'Notes é & quotes');
  fs.mkdirSync(first); fs.mkdirSync(second);
  process.env.WORKSPACE = first;
  const { app } = require('../server');
  let saved;
  app.locals.saveConfig = cfg => { saved = cfg; };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const workspace = async () => (await (await fetch(url + '/api/workspace')).json()).workspace;
  try {
    assert.equal(await workspace(), first);
    app.locals.pickFolder = async initial => { assert.equal(initial, first); return second; };
    assert.equal((await (await post('/api/workspace/browse')).json()).workspace, second);
    assert.equal(saved.workspace, second);
    app.locals.pickFolder = async () => null;
    assert.deepEqual(await (await post('/api/workspace/browse')).json(), { cancelled: true });
    assert.equal(await workspace(), second);
    app.locals.pickFolder = async () => { throw Error('Picker failed'); };
    assert.equal((await post('/api/workspace/browse')).status, 500);
    assert.equal(await workspace(), second);
    for (const value of [null, 123, {}, '', path.join(root, 'missing')]) {
      assert.equal((await post('/api/workspace/set', { path: value })).status, 400);
      assert.equal(await workspace(), second);
    }
    app.locals.saveConfig = () => { throw Error('Cannot save'); };
    assert.equal((await post('/api/workspace/set', { path: first })).status, 500);
    assert.equal(await workspace(), second);
    app.locals.saveConfig = cfg => { saved = cfg; };
    assert.equal((await (await post('/api/workspace/set', { path: first })).json()).workspace, first);
    assert.equal(saved.workspace, first);
    let release, opened;
    const started = new Promise(resolve => { opened = resolve; });
    app.locals.pickFolder = () => new Promise(resolve => { release = resolve; opened(); });
    const pending = post('/api/workspace/browse');
    await started;
    assert.equal((await post('/api/workspace/browse')).status, 409);
    assert.equal((await post('/api/workspace/set', { path: second })).status, 409);
    assert.equal((await post('/api/workspace/clear')).status, 409);
    release(null); await pending;
    const denied = await fetch(url + '/api/workspace/browse', { method: 'POST', headers: { Origin: 'https://example.com' } });
    assert.equal(denied.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unavailable startup workspace returns to folder selection', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const {app} = require('./server');
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const data = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/workspace')).json();
        require('node:assert/strict').deepEqual(data, {workspace:null,mounted:false});
      } finally { server.close(); }
    });
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, WORKSPACE: path.join(os.tmpdir(), 'md-does-not-exist-' + process.pid) }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
