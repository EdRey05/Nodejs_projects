@echo off
setlocal
cd /d "%~dp0"
if not exist ".local-runtime\runtime\node.exe" exit /b 0
".local-runtime\runtime\node.exe" "dev-launcher.cjs" --stop
pause
