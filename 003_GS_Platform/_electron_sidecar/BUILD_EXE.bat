@echo off
rem One-command reproduction of the portable exe. Run inside _electron_sidecar.
rem Requires: Node >= 20, Python >= 3.10, uv (recommended) or pip on PATH.
cd /d "%~dp0"
if not exist ..\node_modules (
  echo [1/4] Installing Node deps...
  pushd ..
  call npm install
  popd
)
if not exist ..\.next\standalone\server.js (
  echo [2/4] Building Next.js production standalone...
  pushd ..
  set NODE_ENV=production
  call npx next build
  popd
)
if not exist runtime\node\node.exe (
  echo [3/4] Fetching portable Node runtime...
  call npm run fetch:runtime --silent
)
if not exist runtime\python\python.exe (
  echo [4/4] Building Python runtime...
  call npm run build:python --silent
)
call npm run package:win