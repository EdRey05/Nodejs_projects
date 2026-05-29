const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked: markedModule } = require('marked');
const marked = markedModule.parse ? markedModule : markedModule.marked;

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// ─── Workspace Resolution ───────────────────────────────────────────

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (_) { /* ignore */ }
  }
  return {};
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

const config = loadConfig();

// Priority: env var > CLI arg 2 > persisted config > default
let WORKSPACE = process.env.WORKSPACE || process.argv[2] || config.workspace || '';
if (!WORKSPACE) {
  WORKSPACE = null; // null signals "not mounted" — will serve launcher
}

// Normalize workspace path slashes for cross-platform sanity
if (WORKSPACE) {
  WORKSPACE = path.resolve(WORKSPACE);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Workspace API ──────────────────────────────────────────────────

// GET /api/workspace — current workspace, or null if none
app.get('/api/workspace', (req, res) => {
  res.json({
    workspace: WORKSPACE,
    mounted: !!WORKSPACE
  });
});

// POST /api/workspace/set — change workspace at runtime (persists it)
app.post('/api/workspace/set', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) {
    return res.status(400).json({ error: 'Missing path' });
  }

  const absPath = path.resolve(newPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return res.status(400).json({ error: 'Not a valid directory: ' + newPath });
  }

  WORKSPACE = absPath;
  config.workspace = absPath;
  saveConfig(config);
  res.json({ workspace: WORKSPACE, success: true });
});

// POST /api/workspace/clear — forget workspace (for explicit reset)
app.post('/api/workspace/clear', (req, res) => {
  WORKSPACE = null;
  delete config.workspace;
  saveConfig(config);
  res.json({ success: true });
});

// ─── File API Routes (workspace-relative) ──────────────────────────

function ensureWorkspace() {
  if (!WORKSPACE) {
    const err = new Error('Workspace not mounted');
    err.status = 400;
    throw err;
  }
}

function checkPath(relPath) {
  ensureWorkspace();
  const absPath = path.join(WORKSPACE, relPath);
  const resolved = path.resolve(absPath);
  const workspaceResolved = path.resolve(WORKSPACE);
  // Cross-platform safe: normalize both to forward slashes for the prefix check
  if (!resolved.toLowerCase().startsWith(workspaceResolved.toLowerCase())) {
    const err = new Error('Path outside workspace');
    err.status = 403;
    throw err;
  }
  return absPath;
}

const EXCLUDED_NAMES = new Set([
  '$recycle.bin', 'system volume information', 'msoCache',
  'config.msi', 'recovery', 'rubbish'
]);

app.get('/api/files/list', (req, res) => {
  try {
    const absPath = checkPath(req.query.path || '');
    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    const files = entries
      .filter(e => {
        const name = e.name.toLowerCase();
        return !name.startsWith('.') && !EXCLUDED_NAMES.has(name);
      })
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: path.join(req.query.path || '', e.name).replace(/\\/g, '/')
      }));
    res.json(files);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/files/read', (req, res) => {
  try {
    const absPath = checkPath(req.query.path || '');
    const content = fs.readFileSync(absPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/files/write', (req, res) => {
  try {
    const { path: relPath, content } = req.body;
    const absPath = checkPath(relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/files/delete', (req, res) => {
  try {
    const absPath = checkPath(req.query.path || '');
    fs.unlinkSync(absPath);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Render markdown to HTML
app.post('/api/markdown/render', (req, res) => {
  try {
    const html = marked.parse(req.body.markdown || '');
    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve SPA: always return index.html so client handles routing/rendering
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Server Startup ─────────────────────────────────────────────────

function startServer(port, maxRetries = 5) {
  if (maxRetries <= 0) {
    console.error('Could not find an available port');
    process.exit(1);
  }
  const server = app.listen(port, () => {
    console.log(`📝 MD Studio running at http://localhost:${port}`);
    if (WORKSPACE) {
      console.log(`   Workspace: ${WORKSPACE}`);
    } else {
      console.log(`   No workspace mounted — open the app to select a folder`);
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1, maxRetries - 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
