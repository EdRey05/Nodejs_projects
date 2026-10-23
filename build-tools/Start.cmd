@echo off
cd /d "%~dp0"
start "" /min "%~dp0runtime\node.exe" "%~dp0launcher.cjs"
