/**
 * fetch-node.js — ensures runtime/node/ holds a portable Node.exe for the exe bundle.
 * Usage: node scripts/fetch-node.js [version]  (default v22.14.0)
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const sidecar = path.resolve(__dirname, "..");
const runtimeDir = path.join(sidecar, "runtime");
const nodeDir = path.join(runtimeDir, "node");
const version = process.argv[2] || "v22.14.0";

function main() {
  if (fs.existsSync(path.join(nodeDir, "node.exe"))) {
    console.log("node runtime already present:", nodeDir);
    return;
  }
  const flat = `https://nodejs.org/dist/${version}/node-${version}-win-x64.zip`;
  execFileSync("curl", ["-sSL", "-o", path.join(runtimeDir, "node.zip"), flat], { stdio: "inherit" });
  const tmpDir = path.join(runtimeDir, "_node_tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  execFileSync("tar", ["-xf", path.join(runtimeDir, "node.zip"), "-C", tmpDir, "--force-local"], { stdio: "inherit" });
  const inner = path.join(tmpDir, `node-${version}-win-x64`);
  fs.rmSync(nodeDir, { recursive: true, force: true });
  fs.renameSync(inner, nodeDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(path.join(runtimeDir, "node.zip"), { force: true });
  console.log("node runtime installed:", nodeDir);
}

main();