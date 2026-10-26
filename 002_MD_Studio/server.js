const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { marked: markedModule } = require('marked');
const marked = markedModule.parse ? markedModule : markedModule.marked;

const app = express();
const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw Error('Invalid PORT');
const sanitizeHtml = require('sanitize-html');

// When packaged as .exe (via pkg), writes inside __dirname are read-only.
// Save config.json next to the executable instead.
const isBundled = typeof process.pkg !== 'undefined';
const BASE_DIR = isBundled ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

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
  try { if (!fs.statSync(WORKSPACE).isDirectory()) WORKSPACE = null; }
  catch (_) { WORKSPACE = null; }
}

function selectWorkspace(newPath) {
  if (typeof newPath !== 'string' || !newPath.trim()) {
    const err = new Error('Please enter a directory path'); err.status = 400; throw err;
  }
  const absPath = path.resolve(newPath.trim());
  try { if (!fs.statSync(absPath).isDirectory()) throw new Error('Not a directory'); }
  catch (_) { const err = new Error('Not a valid directory: ' + newPath); err.status = 400; throw err; }
  const nextConfig = { ...config, workspace: absPath };
  app.locals.saveConfig(nextConfig);
  Object.assign(config, nextConfig);
  WORKSPACE = absPath;
  return { workspace: WORKSPACE, success: true };
}

function pickFolder(initialPath) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Folder browsing requires Windows. Paste a path and save it instead.'));
  // Fixed script only: paths are data in the environment, never shell source.
  const script = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choose your Markdown workspace'
    $dialog.ShowNewFolderButton = $false
    $dialog.SelectedPath = $env:MD_STUDIO_PICKER_START
    $owner = New-Object System.Windows.Forms.Form
    $owner.ShowInTaskbar = $false
    $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.Opacity = 0
    $owner.TopMost = $true
    try {
      # A never-shown owner has no visible topmost window for the native dialog
      # to stay above. Show the transparent owner before opening its modal UI.
      $owner.Show()
      $owner.Activate()
      if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Write($dialog.SelectedPath)
      }
    } finally { $dialog.Dispose(); $owner.Dispose() }
  `;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, encoding: 'utf8', timeout: 300000,
      env: { ...process.env, MD_STUDIO_PICKER_START: initialPath || '' }
    }, (err, stdout) => err ? reject(new Error('Could not open the folder picker. Try again or paste a path and save it.')) : resolve(stdout.trim() || null));
  });
}

app.locals.saveConfig = saveConfig;
app.locals.pickFolder = pickFolder;
let pickerOpen = false;

app.use((req, res, next) => {
  const host = req.headers.host;
  if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) return res.status(403).json({error:'Invalid host'});
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({error:'Cross-origin request denied'});
  res.setHeader('X-Content-Type-Options','nosniff'); next();
});
app.use(express.json({limit:'5mb'}));
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
  try {
    if (pickerOpen) return res.status(409).json({ error: 'Close the folder picker first' });
    res.json(selectWorkspace(req.body.path));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// A browser directory-upload control cannot supply the real local folder path.
app.post('/api/workspace/browse', async (req, res) => {
  if (pickerOpen) return res.status(409).json({ error: 'A folder picker is already open' });
  pickerOpen = true;
  try {
    const selected = await app.locals.pickFolder(WORKSPACE || config.workspace || '');
    if (!selected) return res.json({ cancelled: true });
    res.json(selectWorkspace(selected));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally { pickerOpen = false; }
});

// POST /api/workspace/clear — forget workspace (for explicit reset)
app.post('/api/workspace/clear', (req, res) => {
  if (pickerOpen) return res.status(409).json({ error: 'Close the folder picker first' });
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
  if (typeof relPath !== 'string' || path.isAbsolute(relPath)) { const err = new Error('Invalid relative path'); err.status = 403; throw err; }
  const base = fs.realpathSync(WORKSPACE), target = path.resolve(base, relPath);
  const inside = p => { const relative = path.relative(base,p); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
  if (!inside(target)) { const err=new Error('Path outside workspace');err.status=403;throw err; }
  let candidate=target;
  const exists = p => { try { fs.lstatSync(p); return true; } catch (err) { if (err.code === 'ENOENT') return false; throw err; } };
  while (!exists(candidate)) { const parent=path.dirname(candidate); if(parent===candidate)throw Error('Invalid path');candidate=parent; }
  if (!inside(fs.realpathSync(candidate))) {const err=new Error('Link outside workspace');err.status=403;throw err;}
  return target;
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
    const html = sanitizeHtml(marked.parse(req.body.markdown || ''), {allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','input']), allowedAttributes: {...sanitizeHtml.defaults.allowedAttributes, img:['src','alt','title'], input:['type','checked','disabled']}, transformTags:{input:(_tag, attrs)=>({tagName:'input',attribs:{type:'checkbox',disabled:'disabled',...(Object.hasOwn(attrs,'checked')?{checked:'checked'}:{})}})}, allowedSchemes:['http','https','mailto']});
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
  const server = app.listen(port, '127.0.0.1', () => {
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

if (require.main === module) startServer(PORT);
module.exports = {app, checkPath};
