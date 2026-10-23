$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:USERNAME -ne 'WDAGUtilityAccount' -or !(Test-Path C:\Runner\recipe.json)){throw 'Guest-only script'}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Start-Transcript C:\Export\build.log
function Run($exe,$arguments){$previous=$ErrorActionPreference;$ErrorActionPreference="Continue";& $exe @arguments 2>&1 | ForEach-Object {"$_"} | Tee-Object C:\Export\tools.log -Append | Out-Host;$code=$LASTEXITCODE;$ErrorActionPreference=$previous;if($code -ne 0){throw "$exe failed: $code"}}
$result=@{status='failed';apps=@()}
try{
 $recipe=Get-Content C:\Runner\recipe.json -Raw | ConvertFrom-Json
 $registry=Get-Content C:\Runner\apps.json -Raw | ConvertFrom-Json
 Copy-Item C:\Runner\recipe.json,C:\Runner\source-manifest.json C:\Export
 New-Item -ItemType Directory C:\Build -Force | Out-Null
 $v=$recipe.nodeVersion;$zip="node-v$v-win-x64.zip";$url="https://nodejs.org/dist/v$v"
 Invoke-WebRequest "$url/$zip" -OutFile "C:\Build\$zip" -UseBasicParsing
 $sums=(Invoke-WebRequest "$url/SHASUMS256.txt" -UseBasicParsing).Content
 $sums | Set-Content C:\Export\node-SHASUMS256.txt
 $expected=(@($sums -split "`n" | Where-Object {$_.Trim().EndsWith(" $zip")})[0].Trim() -split '\s+')[0]
 if((Get-FileHash "C:\Build\$zip").Hash -ne $expected){throw 'Node checksum mismatch'}
 if(!(Test-Path "C:\Build\node-v$v-win-x64")){Expand-Archive "C:\Build\$zip" C:\Build}
 $node="C:\Build\node-v$v-win-x64";$env:PATH="$node;$env:PATH";$env:npm_config_cache='C:\Build\npm-cache';$env:NEXT_TELEMETRY_DISABLED='1'
 Run node.exe @('--version');Run npm.cmd @('--version')
 foreach($id in $recipe.apps){
  $record=@{id=$id;status='failed'}
  try{
   $profile=$registry.apps | Where-Object {$_.id -eq $id};$app="C:\Build\$id-"+(Get-Date -Format HHmmss)
   Copy-Item "C:\Runner\source\$id" $app -Recurse;Set-Location $app
   # Refresh lock metadata only when declarations changed; exported locks become reviewed source inputs.
   if($recipe.refreshLocks){Run npm.cmd @('install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund')}
   Copy-Item package-lock.json "C:\Export\$id-package-lock.json"
   Run npm.cmd @('ci','--no-audit','--no-fund')
   if($profile.kind -eq 'next'){
    Run npm.cmd @('run','typecheck')
    Run npm.cmd @('run','build')
   }else{Run npm.cmd @('test')}
   $pkg=Get-Content package.json -Raw | ConvertFrom-Json
   $folder="C:\Build\portable-$id-"+(Get-Date -Format HHmmss);New-Item -ItemType Directory "$folder\runtime","$folder\app" -Force | Out-Null
   Copy-Item "$node\node.exe","$node\LICENSE" "$folder\runtime"
   Copy-Item C:\Runner\launcher.cjs,C:\Runner\Start.cmd,C:\Runner\Stop.cmd $folder
   @{entry=$profile.entry;route=$profile.route} | ConvertTo-Json | Set-Content "$folder\portable.json" -Encoding UTF8
   if($profile.kind -eq 'next'){
    Copy-Item "$app\.next\standalone\*" "$folder\app" -Recurse -Force
    # wildcard hidden directories require an explicit copy
    if(!(Test-Path "$folder\app\.next")){Copy-Item "$app\.next\standalone\.next" "$folder\app\.next" -Recurse -Force}
    Copy-Item "$app\.next\static" "$folder\app\.next\static" -Recurse -Force
    if(Test-Path "$app\public"){Copy-Item "$app\public" "$folder\app\public" -Recurse}
   }else{
    Copy-Item "$app\server.js","$app\package.json" "$folder\app"
    Copy-Item "$app\public","$app\node_modules" "$folder\app" -Recurse
   }
   if($profile.python){
    Copy-Item "$app\python_tools","$app\scripts" "$folder\app" -Recurse
    New-Item -ItemType Directory "$folder\app\data" -Force | Out-Null
    $spec=Get-Content C:\Runner\python-runtime.json -Raw | ConvertFrom-Json
    Invoke-WebRequest $spec.url -OutFile C:\Build\python.tar.gz -UseBasicParsing
    if((Get-FileHash C:\Build\python.tar.gz).Hash -ne $spec.sha256){throw 'Python checksum mismatch'}
    New-Item -ItemType Directory C:\Build\py-stage -Force | Out-Null
    Run tar.exe @('-xzf','C:\Build\python.tar.gz','-C','C:\Build\py-stage')
    Move-Item C:\Build\py-stage\python "$folder\python"
    Run "$folder\python\python.exe" @('-m','pip','install','--disable-pip-version-check','-r',"$app\requirements.txt")
    Run "$folder\python\python.exe" @('-m','pip','check')
    Run "$folder\python\python.exe" @("$app\python_tools\check_stages.py")
    & "$folder\python\python.exe" -m pip freeze | Set-Content "C:\Export\$id-python-resolved.txt"
    Copy-Item C:\Runner\python-runtime.json C:\Export
   }
   $demoId=$id.Substring(0,3)
   if(Test-Path "C:\Runner\source\demo-data\$demoId"){Copy-Item "C:\Runner\source\demo-data\$demoId" "$folder\examples" -Recurse}
   'Extract this entire folder to a writable location. Double-click Start.cmd to open the app. Double-click Stop.cmd when finished. Closing the browser tab does not stop the background service. No developer tools are required. See README.md for data locations and limitations.' | Set-Content "$folder\START-HERE.txt"
   Copy-Item C:\Runner\source\LICENSE $folder
   if(Test-Path "$app\README.md"){Copy-Item "$app\README.md" $folder}
   # Package licenses accompany resolved dependency trees.
   Get-ChildItem "$app\node_modules" -Recurse -File -Include LICENSE,LICENSE.txt,LICENSE.md,NOTICE,NOTICE.txt | ForEach-Object {
    $relative=$_.FullName.Substring(("$app\node_modules").Length+1);$dest=Join-Path "$folder\third-party-notices" $relative;New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null;Copy-Item $_.FullName $dest
   }
   $artifact="$($pkg.name)-$($pkg.version)-win-x64-portable.zip"
   # tar's zip writer handles large portable trees faster than Compress-Archive.
   Run tar.exe @('-a','-cf',"C:\Export\$artifact",'-C',$folder,'.')
   $record=@{id=$id;status='packaged';artifact=$artifact;sha256=(Get-FileHash "C:\Export\$artifact").Hash;version=$pkg.version;validation='pending clean runtime test'}
  }catch{$record.error="$_";Write-Output "APP FAILED: $id $_"}
  $result.apps+= $record
 }
 if(@($result.apps | Where-Object {$_.status -ne 'packaged'}).Count -eq 0){$result.status='packaged'}
}catch{$result.error="$_"}finally{Stop-Transcript;$result | ConvertTo-Json -Depth 10 | Set-Content C:\Export\result.tmp.json -Encoding UTF8;Move-Item C:\Export\result.tmp.json C:\Export\result.json -Force}
# Diagnostics are exported even on failure; always discard the owned build environment.
if($result.status -eq 'packaged' -or !$recipe.keepOnFailure){shutdown.exe /s /t 10}
