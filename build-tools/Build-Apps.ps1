param([string[]]$Apps,[switch]$All,[string]$Output="$env:USERPROFILE\Desktop\Nodejs_standarization",[switch]$PrepareOnly,[switch]$RefreshLocks,[switch]$KeepOnFailure,[int]$TimeoutMinutes=90)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$registry=Get-Content "$PSScriptRoot\apps.json" -Raw | ConvertFrom-Json
if($All){$Apps=@($registry.apps.id)}
$Apps=@($Apps | ForEach-Object { $_ -split ',' } | Select-Object -Unique)
if(!$Apps){throw 'Specify -All or -Apps 001_S_I,002_MD_Studio'}
foreach($id in $Apps){if($id -notin $registry.apps.id){throw "Unknown app: $id"}}
$run=Join-Path $Output ('runs\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$inputs=Join-Path $run 'inputs';$export=Join-Path $run 'output'
New-Item -ItemType Directory -Force $inputs,$export | Out-Null
Copy-Item "$PSScriptRoot\*" $inputs -Recurse
$files=@(& git -C $repo ls-files --cached --others --exclude-standard) | Where-Object {$_ -notmatch '(^|/)(\.env[^/]*|config\.json|node_modules|\.next|dist|release|data)(/|$)' -and $_ -notmatch '^003_GS_Platform/_electron_sidecar/' }
# Staging is a snapshot: sandbox never sees ignored/private files or the live checkout.
$source=Join-Path $inputs 'source';New-Item -ItemType Directory -Force $source | Out-Null
$manifest=@(foreach($file in $files){$src=Join-Path $repo $file;if(Test-Path -LiteralPath $src -PathType Leaf){$dst=Join-Path $source $file;New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null;Copy-Item -LiteralPath $src -Destination $dst;@{path=$file;sha256=(Get-FileHash $dst).Hash}}})
$manifest | ConvertTo-Json -Depth 5 | Set-Content "$inputs\source-manifest.json" -Encoding UTF8
@{keepOnFailure=[bool]$KeepOnFailure;refreshLocks=[bool]$RefreshLocks;apps=$Apps;nodeVersion=$registry.nodeVersion;commit=(& git -C $repo rev-parse HEAD);workingTree=(@(& git -C $repo status --porcelain) -join "`n");createdAt=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content "$inputs\recipe.json" -Encoding UTF8
function Xml($x){[Security.SecurityElement]::Escape($x)}
@"
<Configuration><MemoryInMB>12288</MemoryInMB><Networking>Enable</Networking><ClipboardRedirection>Disable</ClipboardRedirection><AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput><PrinterRedirection>Disable</PrinterRedirection><MappedFolders>
<MappedFolder><HostFolder>$(Xml $inputs)</HostFolder><SandboxFolder>C:\Runner</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>$(Xml $export)</HostFolder><SandboxFolder>C:\Export</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
</MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Runner\Sandbox-Build.ps1</Command></LogonCommand></Configuration>
"@ | Set-Content "$run\build.wsb" -Encoding UTF8
Write-Output "Run folder: $run"
if($PrepareOnly){return}
$sandboxJson=& wsb.exe list --raw
if($LASTEXITCODE -ne 0 -or !$sandboxJson){throw 'Windows Sandbox state query failed. Close its stale client and retry; no environment was stopped.'}
if(@(($sandboxJson | Out-String | ConvertFrom-Json).WindowsSandboxEnvironments | Where-Object {$_}).Count){throw 'An existing Sandbox is open; it will not be touched.'}
Start-Process "$env:WINDIR\System32\WindowsSandbox.exe" -ArgumentList ('"'+$run+'\build.wsb"') -WindowStyle Hidden | Out-Null
$deadline=(Get-Date).AddMinutes($TimeoutMinutes)
while(!(Test-Path "$export\result.json")){if((Get-Date) -gt $deadline){
 $owned=@((& wsb.exe list --raw | Out-String | ConvertFrom-Json).WindowsSandboxEnvironments)
 if(!$KeepOnFailure -and $owned.Count -eq 1){& wsb.exe stop --id $owned[0].Id | Out-Null}
 throw "Timed out. Evidence: $run"
};Start-Sleep 2}
$result=Get-Content "$export\result.json" -Raw | ConvertFrom-Json
foreach($item in $result.apps){if($item.status -eq 'packaged'){if((Get-FileHash (Join-Path $export $item.artifact)).Hash -ne $item.sha256){throw 'Artifact checksum mismatch'}}}
$result | ConvertTo-Json -Depth 10
if($result.status -ne 'packaged'){throw "One or more builds failed. Evidence: $export"}
