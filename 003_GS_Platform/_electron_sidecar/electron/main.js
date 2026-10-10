/**
 * Gene Synthesis Automations — Electron desktop shell.
 *
 * Boots the Next.js standalone server with the bundled portable Node,
 * points PYTHONHOME/PYTHONPATH at the bundled portable Python so the
 * app's python-bridge falls through to it, then loads the app in a
 * BrowserWindow. The repo checkout (parent folder) supplies the
 * Next.js bundle, python_tools/ and data/, so this exe always shows
 * the CURRENT state of the app.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Chromium's native window occlusion tracker misfires inside RDP sessions
// (window marked occluded/hidden -> compositor throttled -> blank dark window).
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

/** True when running from the packaged exe (resources/ layout). */
const isPackaged = app.isPackaged;

/** Packaged: <install>/resources/ ; Dev: <sidecar>/ */
const resourcesDir = isPackaged ? process.resourcesPath : path.join(__dirname, "..");

/**
 * Find the app repo (needs python_tools/bridge.py + .next/standalone/server.js).
 * The single-file portable exe self-extracts to %TEMP%, and win-unpacked copies can
 * be moved around, so relative climbing alone is not enough: probe GSA_REPO_ROOT,
 * then climb from cwd, then climb from the exe's folder.
 */
function findRepoRoot() {
  const marker = (p) =>
    fs.existsSync(path.join(p, "python_tools", "bridge.py")) &&
    fs.existsSync(path.join(p, ".next", "standalone", "server.js"));
  const cands = [];
  if (process.env.GSA_REPO_ROOT) cands.push(process.env.GSA_REPO_ROOT);
  let d = process.cwd();
  for (let i = 0; i < 5; i++) {
    cands.push(d);
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  let e = path.dirname(process.execPath);
  for (let i = 0; i < 6; i++) {
    cands.push(e);
    const up = path.dirname(e);
    if (up === e) break;
    e = up;
  }
  for (const c of cands) if (c && marker(c)) return path.resolve(c);
  return null;
}

const repoRoot = findRepoRoot();

const serverRoot = repoRoot ? path.join(repoRoot, ".next", "standalone") : null;
const port = process.env.GSA_PORT ? parseInt(process.env.GSA_PORT, 10) : 4177;

let nodeProc = null;
let mainWindow = null;

function bundledNodeExe() {
  const cand = path.join(resourcesDir, "runtime", "node", "node.exe");
  return fs.existsSync(cand) ? cand : process.execPath;
}

function pythonEnv() {
  const pyRoot = path.join(resourcesDir, "runtime", "python");
  const env = Object.assign({}, process.env);
  if (fs.existsSync(path.join(pyRoot, "python.exe"))) {
    env.GSA_PYTHON = path.join(pyRoot, "python.exe");
    // Embedded-distribution stdlib lives beside python.exe
    env.PYTHONHOME = pyRoot;
    // python_tools/parsers do `from parsers import ...`, so python_tools must be on path.
    // repoRoot can be null (repo not found) — never hand path.join a null here or
    // TypeError crashes the IPC handler; guard, matching startNextServer's serverJs guard.
    env.PYTHONPATH = repoRoot ? path.join(String(repoRoot), "python_tools") : "";
    env.PATH = `${pyRoot};${env.PATH || env.Path || ""}`;
  }
  return env;
}

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on("error", retry);
      req.setTimeout(3000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error("Next.js server did not start in time"));
      setTimeout(tick, 400);
    };
    tick();
  });
}

function startNextServer() {
  const nodeExe = bundledNodeExe();
  // serverRoot is null when repo discovery failed — path.join(null, ...) would
  // throw "Path must be a string" instead of the friendly discovery error below.
  const serverJs = serverRoot ? path.join(serverRoot, "server.js") : null;
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Next.js standalone build not found at ${serverJs}.\n\n` +
        `The repo ( Gene_Synthesis_Automations, with .next/standalone + python_tools ) must be reachable ` +
        `from the exe location, from the working directory, or via the GSA_REPO_ROOT environment variable.\n` +
        `Searched exe dir / cwd, 5-6 levels up each.`
    );
  }

  const env = Object.assign({}, process.env, {
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: undefined,
  });

  nodeProc = spawn(nodeExe, [serverJs], {
    cwd: serverRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  nodeProc.stdout.on("data", (d) => console.log(`[next] ${d}`.trim()));
  nodeProc.on("error", (err) => console.error("[next] spawn error:", err));
  nodeProc.on("exit", (code) => {
    console.log(`[next] exited code=${code}`);
    nodeProc = null;
  });
  return nodeProc;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    title: "Gene Synthesis Automations",
    autoHideMenuBar: true,
    backgroundColor: "#0b0f19",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/home`);
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render] gone:", details.reason);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ---------------- Python bridge IPC (mirrors python-bridge.ts) ---------------- */

function extractJsonFromOutput(stdout) {
  const pairs = [
    [stdout.indexOf("{"), stdout.lastIndexOf("}")],
    [stdout.indexOf("["), stdout.lastIndexOf("]")],
  ].filter((p) => p[0] !== -1 && p[1] !== -1 && p[1] > p[0]);
  if (!pairs.length) throw new Error("No JSON found in python output");
  const [startIdx, endIdx] = pairs.sort((a, b) => (a[0] <= b[0] ? -1 : 1))[0];
  return JSON.parse(stdout.substring(startIdx, endIdx + 1));
}

ipcMain.handle("python:runBridge", async (_evt, inputData) => {
  const env = pythonEnv();
  const pythonCmd = env.GSA_PYTHON || "python";
  if (!repoRoot) {
    return { success: false, message: "App repo root not found (needs python_tools/bridge.py; set GSA_REPO_ROOT)" };
  }
  const scriptPath = path.join(repoRoot, "python_tools", "bridge.py");
  if (!fs.existsSync(scriptPath)) {
    return { success: false, message: `bridge.py not found at ${scriptPath}` };
  }
  return new Promise((resolve) => {
    const py = spawn(pythonCmd, [scriptPath], { cwd: repoRoot, env });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));
    py.stdin.write(JSON.stringify(inputData));
    py.stdin.end();
    py.on("close", (code) => {
      if (code !== 0) {
        resolve({ success: false, message: `Script exited with code ${code}`, error: stderr });
      } else {
        try {
          resolve({ success: true, data: extractJsonFromOutput(stdout) });
        } catch (e) {
          resolve({ success: true, data: stdout.trim() });
        }
      }
    });
    py.on("error", (err) => resolve({ success: false, message: `Process error: ${err.message}` }));
  });
});

/* ---------------- misc IPC ---------------- */

ipcMain.handle("shell:openExternal", (_evt, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});

/* Desktop save dialog for bridge-generated xlsx (P2_4 spec §1.3: saveExcel IPC).
   Mirrors the python-bridge pattern: invoke with { base64, suggestedFilename },
   returns the chosen path or null when the user cancels. */
ipcMain.handle("dialog:saveExcel", async (_evt, payload) => {
  try {
    const suggested = (payload && payload.suggestedFilename) || "download.xlsx";
    const base64 = payload && payload.base64;
    if (typeof base64 !== "string") return null;
    const win = BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows()[0] ?? null);
    const result = await dialog.showSaveDialog(win, {
      title: "Save Excel As",
      defaultPath: suggested,
      filters: [{ name: "Excel files", extensions: ["xlsx"] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
    return result.filePath;
  } catch (e) {
    console.error("saveExcel failed:", e);
    return null;
  }
});

app.whenReady().then(async () => {
  try {
    startNextServer();
    await waitForServer(`http://127.0.0.1:${port}/home`, 45000);
  } catch (err) {
    dialog.showErrorBox("Gene Synthesis Automations", String(err.message || err));
    app.quit();
    return;
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (nodeProc && !nodeProc.killed) {
    try {
      nodeProc.kill();
    } catch (_) {}
  }
  if (process.platform !== "darwin") app.quit();
});