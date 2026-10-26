const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Deferred scroll events model the browser behavior that defeated the old
// setTimeout(0) guard. Drain the queue with a strict bound to catch feedback.
function harness() {
  const queue = [];
  class Pane {
    constructor(range) { this.scrollHeight = range + 500; this.clientHeight = 500; this.top = 0; this.listeners = new Map(); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type).delete(fn); }
    emit(type, detail = {}) { for (const fn of this.listeners.get(type) || []) fn(detail); }
    get scrollTop() { return this.top; }
    set scrollTop(value) { const next = Math.round(Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight))); if (this.top !== next) { this.top = next; queue.push(() => this.emit('scroll')); } }
  }
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), context);
  const editor = new Pane(100000), preview = new Pane(70000);
  let enabled = true;
  const disconnect = context.connectSplitScroll(editor, preview, () => enabled);
  const flush = () => { let count = 0; while (queue.length) { assert.ok(++count < 20, 'scroll synchronization fed back indefinitely'); queue.shift()(); } };
  return { editor, preview, flush, disconnect, disable: () => { enabled = false; } };
}

test('wheel input stops in the middle despite deferred peer scroll events', () => {
  const { editor, preview, flush } = harness();
  editor.emit('wheel'); editor.scrollTop = 40180; flush();
  assert.equal(editor.scrollTop, 40180);
  assert.equal(preview.scrollTop, 28126);
  // A preview change without user input must not move the active editor.
  preview.scrollTop += 200; flush();
  assert.equal(editor.scrollTop, 40180);
  preview.emit('wheel'); preview.scrollTop = 35000; flush();
  assert.equal(editor.scrollTop, 50000);
});

test('keyboard, scrollbar and touch can take over in either direction', () => {
  const { editor, preview, flush } = harness();
  for (const [pane, target, type, detail] of [
    [editor, preview, 'keydown', { key: 'ArrowDown' }],
    [preview, editor, 'keydown', { key: 'PageUp' }],
    [editor, preview, 'pointerdown', {}],
    [preview, editor, 'touchstart', {}]
  ]) {
    pane.emit(type, detail); pane.scrollTop = (pane.scrollHeight - pane.clientHeight) * .45; flush();
    assert.equal(target.scrollTop, Math.round((target.scrollHeight - target.clientHeight) * .45));
    pane.scrollTop = 0; flush(); assert.equal(target.scrollTop, 0);
    pane.scrollTop = pane.scrollHeight; flush(); assert.equal(target.scrollTop, target.scrollHeight - target.clientHeight);
  }
});

test('sync off, non-scrollable panes and detached views do not move the peer', () => {
  const a = harness(); a.disable(); a.editor.emit('wheel'); a.editor.scrollTop = 20000; a.flush(); assert.equal(a.preview.scrollTop, 0);
  const b = harness(); b.editor.scrollHeight = b.editor.clientHeight; b.editor.emit('wheel'); b.editor.emit('scroll'); b.flush(); assert.equal(b.preview.scrollTop, 0);
  const c = harness(); c.disconnect(); c.editor.emit('wheel'); c.editor.scrollTop = 20000; c.flush(); assert.equal(c.preview.scrollTop, 0);
});
