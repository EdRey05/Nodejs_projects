param([Parameter(Mandatory=$true)][string]$BuildOutput,[string]$Output="$env:USERPROFILE\Desktop\Nodejs_standarization\validation",[string[]]$Apps,[switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$BuildOutput=(Resolve-Path $BuildOutput).Path
$run=Join-Path $Output (Get-Date -Format yyyyMMdd-HHmmss-fff);New-Item -ItemType Directory -Force $run | Out-Null
if($Apps){
 $selected=@($Apps | ForEach-Object {$_ -split ','})
 $known=(Get-Content (Join-Path $BuildOutput 'result.json') -Raw | ConvertFrom-Json).apps.id
 foreach($id in $selected){if($id -notin $known){throw "Unknown test app: $id"}}
 ConvertTo-Json -InputObject $selected | Set-Content "$run\selection.json" -Encoding UTF8
}
$repo=Split-Path $PSScriptRoot -Parent
function Xml($s){[Security.SecurityElement]::Escape($s)}
@"
<Configuration><MemoryInMB>8192</MemoryInMB><Networking>Disable</Networking><ClipboardRedirection>Disable</ClipboardRedirection><AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput><PrinterRedirection>Disable</PrinterRedirection><MappedFolders>
<MappedFolder><HostFolder>$(Xml $BuildOutput)</HostFolder><SandboxFolder>C:\Artifacts</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>$(Xml $PSScriptRoot)</HostFolder><SandboxFolder>C:\TestRunner</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>$(Xml (Join-Path $repo 'demo-tools'))</HostFolder><SandboxFolder>C:\DemoRunner</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>$(Xml (Join-Path $repo 'demo-data'))</HostFolder><SandboxFolder>C:\Fixtures</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>$(Xml $run)</HostFolder><SandboxFolder>C:\TestExport</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
</MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\TestRunner\Sandbox-Test.ps1</Command></LogonCommand></Configuration>
"@ | Set-Content "$run\test.wsb" -Encoding UTF8
Write-Output "Validation: $run"
if($PrepareOnly){return}
$sandboxJson=& wsb.exe list --raw
if($LASTEXITCODE -ne 0 -or !$sandboxJson){throw 'Windows Sandbox state query failed; restart its stale client before retrying. No environment was stopped.'}
if(@(($sandboxJson | Out-String | ConvertFrom-Json).WindowsSandboxEnvironments | Where-Object {$_}).Count){throw 'Close existing sandbox first; no environment was stopped.'}
Start-Process "$env:WINDIR\System32\WindowsSandbox.exe" -ArgumentList ('"'+$run+'\test.wsb"') -WindowStyle Hidden
$deadline=(Get-Date).AddMinutes(30)
while(!(Test-Path "$run\results.json")){if((Get-Date) -gt $deadline){throw "Validation timeout: $run"};Start-Sleep 2}
$results=Get-Content "$run\results.json" -Raw | ConvertFrom-Json
$results | ConvertTo-Json -Depth 10
if(!$results -or @($results | Where-Object {$_.status -ne 'passed'}).Count){throw "Validation failed; inspect $run"}
