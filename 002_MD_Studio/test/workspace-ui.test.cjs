const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('saved, pasted and browsed workspaces open directly; changing/cancelling preserves edits', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const source = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, value: '', hidden: false });
    return elements.get(id);
  };
  let result = { success: true, workspace: 'C:\\Second' };
  let savedPath, clearCount = 0, allowDiscard = false;
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
    window: { addEventListener() {} }, setTimeout, clearTimeout,
    confirm: () => allowDiscard, showToast() {},
    API: {
      getWorkspace: async () => ({ mounted: true, workspace: 'C:\\Saved' }),
      listFiles: async () => [],
      setWorkspace: async value => { savedPath = value; return result; },
      browseWorkspace: async () => result,
      clearWorkspace: async () => { clearCount++; return { success: true }; }
    }
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('workspace-display').textContent, 'C:\\Saved');
  assert.equal(element('editor-screen').style.display, '');
  vm.runInContext("currentFile='old.md'; currentContent='unsaved'; isDirty=true; changeWorkspace();", context);
  assert.equal(element('mount-screen').style.display, 'none');
  allowDiscard = true;
  vm.runInContext('changeWorkspace()', context);
  assert.equal(clearCount, 0);
  result = { cancelled: true };
  await vm.runInContext('browseWorkspace()', context);
  vm.runInContext('cancelWorkspaceChange()', context);
  assert.equal(vm.runInContext('currentContent', context), 'unsaved');
  assert.equal(vm.runInContext('isDirty', context), true);
  result = { success: true, workspace: 'C:\\Second' };
  vm.runInContext('changeWorkspace()', context);
  await vm.runInContext('browseWorkspace()', context);
  assert.equal(vm.runInContext('currentFile', context), null);
  assert.equal(vm.runInContext('isDirty', context), false);
  assert.equal(element('save-btn').disabled, true);
  assert.equal(element('workspace-display').textContent, 'C:\\Second');
  vm.runInContext('changeWorkspace()', context);
  element('mount-path').value = '  C:\\Pasted  ';
  result = { success: true, workspace: 'C:\\Pasted' };
  await vm.runInContext('doMount()', context);
  assert.equal(savedPath, 'C:\\Pasted');
  assert.equal(element('workspace-display').textContent, 'C:\\Pasted');
  assert.doesNotMatch(html, />Mount Workspace</);
});
