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

// ─── API Helpers ─────────────────────────────────────────────────────

const API = {
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
