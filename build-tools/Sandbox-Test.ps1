param([switch]$KeepOpen)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:USERNAME -ne 'WDAGUtilityAccount'){throw 'Guest only'}
Start-Transcript C:\TestExport\test.log
. C:\DemoRunner\Cdp.ps1
$results=@();$build=Get-Content C:\Artifacts\result.json -Raw | ConvertFrom-Json
if(Test-Path C:\TestExport\selection.json){$selection=Get-Content C:\TestExport\selection.json -Raw | ConvertFrom-Json;if($selection.Count){$build.apps=@($build.apps | Where-Object {$_.id -in $selection})}}
$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
@{nodeAvailable=[bool](Get-Command node.exe -ErrorAction SilentlyContinue);pythonAvailable=[bool](Get-Command python.exe -ErrorAction SilentlyContinue);offline=$true} | ConvertTo-Json | Set-Content C:\TestExport\host-tools.json
function Wait-State($folder){for($n=0;$n -lt 120;$n++){if(Test-Path "$folder\portable-state.json"){try{$s=Get-Content "$folder\portable-state.json" -Raw|ConvertFrom-Json;$r=Invoke-WebRequest $s.url -UseBasicParsing;if($r.StatusCode -eq 200){return $s}}catch{}};Start-Sleep 1};throw 'App did not start'}
try{
 foreach($item in $build.apps){
  if($item.status -ne 'packaged'){continue}
  $id=$item.id;$record=@{id=$id;sha256=$item.sha256;status='failed';checks=@();offline=$true};$folder="C:\Relocated Apps With Spaces\$id-"+(Get-Date -Format HHmmss);$recorder=$null;$browser=$null
  try{
   if((Get-FileHash "C:\Artifacts\$($item.artifact)").Hash -ne $item.sha256){throw 'Input hash mismatch'}
   New-Item -ItemType Directory -Force $folder | Out-Null
   & tar.exe -xf "C:\Artifacts\$($item.artifact)" -C $folder
   if($LASTEXITCODE){throw 'Extraction failed'}
   if($id -eq '001_S_I'){
    Push-Location $folder
    & cmd.exe /d /c Start.cmd
    $null=Wait-State $folder
    & cmd.exe /d /c Stop.cmd
    Pop-Location
    Start-Sleep 2
    if(Test-Path "$folder\portable-state.json"){throw 'Start.cmd/Stop.cmd lifecycle failed'}
    $record.checks+='actual-start-and-stop-command-files'
   }
   $launcher=Start-Process "$folder\runtime\node.exe" -ArgumentList ('"'+$folder+'\launcher.cjs" --no-browser') -WindowStyle Hidden -PassThru
   $state=Wait-State $folder;$record.checks+='relocated-offline-http-200'
   if($id -eq '003_GS_Platform'){
    Push-Location "$folder\app"
    & "$folder\runtime\node.exe" C:\TestRunner\Smoke-Python.cjs "$folder\python\python.exe" C:\TestExport
    if($LASTEXITCODE){throw 'Bundled Python bridge/schema smoke failed; inspect exported stdout/stderr'}
    Pop-Location;$record.checks+='bundled-python-imports','packaged-bridge-stages','empty-schema-initialization'
   }else{
    $browser=Start-Process $edge -ArgumentList @('--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9222',"--user-data-dir=C:\Browser-$id",$state.url) -WindowStyle Hidden -PassThru
    $target=$null;for($n=0;$n -lt 45 -and !$target;$n++){Start-Sleep 1;try{$targets=Invoke-RestMethod http://127.0.0.1:9222/json/list;$target=$targets | Where-Object {$_.type -eq 'page' -and $_.url -eq $state.url} | Select-Object -First 1}catch{}}
    if(!$target){throw 'Edge renderer unavailable'}
    $script:socket=[Net.WebSockets.ClientWebSocket]::new();$script:socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult();$script:messageId=0;$script:appId=$id
    Send $script:socket 'Emulation.setDeviceMetricsOverride' @{width=1280;height=800;deviceScaleFactor=1;mobile=$false} | Out-Null
    Send $script:socket 'Page.setDownloadBehavior' @{behavior='allow';downloadPath='C:\TestExport'} | Out-Null
    $frameDirectory="C:\TestExport\frames-$id"
    $recorder=Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File C:\DemoRunner\Capture-Frames.ps1 -Directory '+$frameDirectory) -WindowStyle Hidden -PassThru
    Start-Sleep 2
    if($id -eq '001_S_I'){
     # Hold startup discovery pending to verify the welcome page never becomes loading text.
     Send $script:socket 'Page.enable' @{} | Out-Null
     $startupScript='window.__startupPending=false;window.__startupGate=new Promise(resolve=>window.__releaseStartup=resolve);const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>{if(String(url).includes("/api/workbook")&&options?.method==="GET"){window.__startupPending=true;return window.__startupGate.then(()=>originalFetch(url,options))}return originalFetch(url,options)};'
     $injection=Send $script:socket 'Page.addScriptToEvaluateOnNewDocument' @{source=$startupScript}
     Send $script:socket 'Page.navigate' @{url=$state.url} | Out-Null
     $pending=$false
     for($attempt=0;$attempt -lt 30 -and !$pending;$attempt++){Start-Sleep -Milliseconds 500;$pending=Eval 'window.__startupPending===true'}
     if(!$pending){throw 'Startup test did not reach hydrated workbook discovery'}
     $welcome=Eval 'document.querySelector("main").innerText'
     if($welcome -notmatch 'Welcome to Personal' -or $welcome -match 'Looking for|Opening workbook'){throw 'Welcome page replaced during startup loading'}
     Eval (Click 'Manage & Import') | Out-Null
     if((Eval 'document.querySelector("main").innerText') -ne $welcome){throw 'Opening sidebar changed initial page'}
     Eval 'window.__releaseStartup();true' | Out-Null
     Start-Sleep 1
     if((Eval 'document.querySelector("main").innerText') -ne $welcome){throw 'Empty startup changed initial page'}
     # Exercise the actual Open workbook button with a pending/cancelled picker request.
     Eval 'window.__beforePickerFetch=window.fetch;window.fetch=(url,options)=>String(url).includes("/api/workbook")&&options?.method==="POST"?new Promise(resolve=>{window.__cancelPicker=()=>resolve(new Response(JSON.stringify({cancelled:true}),{headers:{"Content-Type":"application/json"}}))}):window.__beforePickerFetch(url,options);true' | Out-Null
     Eval (Click 'Open workbook') | Out-Null
     Start-Sleep 1
     if((Eval 'document.querySelector("main").innerText') -ne $welcome){throw 'Pending workbook picker changed initial page'}
     Eval 'window.__cancelPicker();window.fetch=window.__beforePickerFetch;delete window.__beforePickerFetch;true' | Out-Null
     Start-Sleep -Milliseconds 300
     Eval (Click 'Close') | Out-Null
     Send $script:socket 'Page.removeScriptToEvaluateOnNewDocument'  @{identifier=$injection.identifier} | Out-Null
    }
    . C:\DemoRunner\Workflows.ps1 -DemoApp $id -Folder $folder
    if($id -eq '001_S_I'){. C:\TestRunner\Savings-Portfolio-Checks.ps1}
    $png=Send $script:socket 'Page.captureScreenshot' @{format='png'};[IO.File]::WriteAllBytes("C:\TestExport\$id.png",[Convert]::FromBase64String($png.data))
    $record.checks+='synthetic-ui-workflow-output-verified';Start-Sleep 3
   }
   $record.status='passed'
  }catch{$record.error="$_";Write-Output "FAILED $id $_"}finally{
   if($recorder){New-Item -ItemType File "$frameDirectory\stop" -Force|Out-Null;if(!$recorder.WaitForExit(15000)){$recorder.Kill()}}
   if($script:socket){$script:socket.Dispose();$script:socket=$null}
   if($browser){& taskkill.exe /PID $browser.Id /T /F | Out-Null}
   if(Test-Path "$folder\application.log"){Copy-Item "$folder\application.log" "C:\TestExport\$id-application.log"}
   if(Test-Path "$folder\runtime\node.exe"){& "$folder\runtime\node.exe" "$folder\launcher.cjs" --stop;Start-Sleep 2;if(Test-Path "$folder\portable-state.json"){$record.status='failed';$record.error='Shutdown did not remove state'}else{$record.checks+='stop-command-cleanup'}}
   $results+=$record;$results|ConvertTo-Json -Depth 10|Set-Content C:\TestExport\progress.json
  }
 }
}catch{$results+=@{status='failed';error="$_"}}finally{Stop-Transcript;$results|ConvertTo-Json -Depth 10|Set-Content C:\TestExport\results.tmp.json;Move-Item C:\TestExport\results.tmp.json C:\TestExport\results.json -Force}
if(!$KeepOpen){shutdown.exe /s /t 10}
