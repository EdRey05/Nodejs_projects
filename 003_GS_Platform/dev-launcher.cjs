// Local development only: serves this checkout, never the packaged build.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = __dirname;
const local = path.join(root, '.local-runtime');
const stateFile = path.join(local, 'development-state.json');
const logFile = path.join(local, 'development.log');
const python = path.join(local, 'python', 'python.exe');
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(local, { recursive: true });

async function current() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const response = await fetch(`http://127.0.0.1:${state.control}/health`, { signal: AbortSignal.timeout(2000) });
    return await response.text() === state.token ? state : null;
  } catch { return null; }
}

function openBrowser(url) {
  spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' }).unref();
}

async function availablePort() {
  for (let port = 9002; port <= 9012; port++) {
    const available = await new Promise(resolve => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw Error('Development ports 9002–9012 are busy. Stop an unused server and retry.');
}

async function serve() {
  const port = await availablePort();
  const token = crypto.randomBytes(24).toString('hex');
  const log = fs.openSync(logFile, 'a');
  fs.appendFileSync(logFile, `\nDevelopment started ${new Date().toISOString()}\n`);
  const child = spawn(process.execPath, [next, 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', GSA_PYTHON: python },
  });
  const control = http.createServer((request, response) => {
    if (request.url === '/health') return response.end(token);
    if (request.url === `/stop?token=${token}`) {
      response.end('Stopping development server');
      // Next dev has worker processes; stop only this controller's child tree.
      if (child.exitCode === null && child.pid) {
        spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      }
      return;
    }
    response.statusCode = 403;
    response.end();
  });
  const cleanup = () => {
    control.close();
    try {
      if (JSON.parse(fs.readFileSync(stateFile, 'utf8')).token === token) fs.unlinkSync(stateFile);
    } catch { /* State may already be gone. */ }
    fs.closeSync(log);
  };
  child.once('error', error => { fs.appendFileSync(logFile, `${error}\n`); cleanup(); });
  child.once('exit', cleanup);
  await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(stateFile, JSON.stringify({ control: control.address().port, token, url: `http://127.0.0.1:${port}/home` }));
}

async function main() {
  if (process.argv.includes('--serve')) return serve();
  let state = await current();
  if (process.argv.includes('--stop')) {
    if (state) {
      await fetch(`http://127.0.0.1:${state.control}/stop?token=${state.token}`, { signal: AbortSignal.timeout(5000) });
      for (let attempt = 0; attempt < 40 && await current(); attempt++) await sleep(250);
      if (await current()) throw Error('Server is still stopping. See .local-runtime/development.log.');
    }
    console.log('Development server stopped.');
    return;
  }
  if (!fs.existsSync(python) || !fs.existsSync(next)) {
    throw Error('Local runtimes or development dependencies are missing. See README: Live development.');
  }
  if (!state) {
    if (process.argv.includes('--foreground')) {
      console.log('Starting development. Leave this window open while using the app.');
      await serve();
    } else {
      spawn(process.execPath, [__filename, '--serve'], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    }
    for (let attempt = 0; attempt < 40 && !state; attempt++) { await sleep(250); state = await current(); }
    if (!state) throw Error('Could not start development server. See .local-runtime/development.log.');
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    try {
      const response = await fetch(state.url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        console.log(`Development ready: ${state.url}`);
        if (!process.argv.includes('--no-browser')) openBrowser(state.url);
        return;
      }
    } catch { /* Initial compilation may take a moment. */ }
    await sleep(500);
  }
  throw Error('Server started but the page is not ready. Check .local-runtime/development.log.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
