$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$configFile = Join-Path $scriptDir "config.json"

function ConvertTo-WslPath($winPath) {
  $output = (& wsl wslpath -u "`"$winPath`"").Trim()
  return $output
}

function Show-Picker {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select workspace folder for MD Studio"
  if ($dialog.ShowDialog() -ne "OK") { return $null }
  return $dialog.SelectedPath
}

# ─── Always show picker ──────────────────────────────────────────────

$winPath = Show-Picker
if (-not $winPath) {
  Write-Host "No folder selected. Exiting." -ForegroundColor Red
  exit 1
}

$wslWorkspace = ConvertTo-WslPath $winPath
@{ workspace = $wslWorkspace } | ConvertTo-Json | Set-Content $configFile
Write-Host "Saved workspace: $wslWorkspace" -ForegroundColor Green

# ─── Paths in WSL ────────────────────────────────────────────────────

$wslDir = (& wsl wslpath -u "`"$scriptDir`"").Trim()

# ─── Launch ───────────────────────────────────────────────────────────

Write-Host "Starting MD Studio..." -ForegroundColor Green
Start-Process "http://localhost:3000"

wsl bash -lc "cd '$wslDir' && WORKSPACE='$wslWorkspace' node server.js"
