// ─── Toast Notification ─────────────────────────────────────────────

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Only a pane receiving user input may drive synchronization. Browser scroll
// events caused by assigning the peer's scrollTop can arrive in a later frame;
// they must never take ownership and feed the movement back to the first pane.
function connectSplitScroll(editor, preview, isEnabled) {
  let driver = null;
  const cleanup = [];
  const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);
  function listen(pane, event, handler) {
    pane.addEventListener(event, handler, { passive: true });
    cleanup.push(() => pane.removeEventListener(event, handler));
  }
  for (const [source, target] of [[editor, preview], [preview, editor]]) {
    const claim = () => { driver = source; };
    for (const event of ['wheel', 'pointerdown', 'touchstart']) listen(source, event, claim);
    listen(source, 'keydown', event => { if (navigationKeys.has(event.key)) claim(); });
    listen(source, 'scroll', () => {
      if (!isEnabled() || driver !== source) return;
      const sourceRange = source.scrollHeight - source.clientHeight;
      const targetRange = target.scrollHeight - target.clientHeight;
      if (sourceRange <= 0 || targetRange <= 0) return;
      const ratio = Math.max(0, Math.min(1, source.scrollTop / sourceRange));
      const top = ratio * targetRange;
      if (Math.abs(target.scrollTop - top) >= 1) target.scrollTop = top;
    });
  }
  return () => { cleanup.forEach(remove => remove()); driver = null; };
}

// ─── API Helpers ─────────────────────────────────────────────────────

const API = {
  async browseWorkspace() {
    const res = await fetch('/api/workspace/browse', { method: 'POST' });
    return res.json();
  },
  async getWorkspace() {
    const res = await fetch('/api/workspace');
    return res.json();
  },
  async setWorkspace(dirPath) {
    const res = await fetch('/api/workspace/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath })
    });
    return res.json();
  },
  async clearWorkspace() {
    const res = await fetch('/api/workspace/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },
  async listFiles(dirPath = '') {
    const res = await fetch(`/api/files/list?path=${encodeURIComponent(dirPath)}`);
    return res.json();
  },
  async readFile(filePath) {
    const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
    return res.json();
  },
  async writeFile(filePath, content) {
    const res = await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content })
    });
    return res.json();
  },
  async deleteFile(filePath) {
    const res = await fetch(`/api/files/delete?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
    return res.json();
  },
  async renderMarkdown(markdown) {
    const res = await fetch('/api/markdown/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.html;
  }
};
