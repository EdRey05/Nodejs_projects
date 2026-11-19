@echo off
setlocal
title Gene Synthesis Development
cd /d "%~dp0"
if not exist ".local-runtime\runtime\node.exe" (
  echo Local development runtime is missing. See README: Live development.
  pause
  exit /b 1
)
".local-runtime\runtime\node.exe" "dev-launcher.cjs" --foreground
if errorlevel 1 pause
