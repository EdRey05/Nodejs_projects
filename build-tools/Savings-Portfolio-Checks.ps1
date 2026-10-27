# Sourced inside the offline guest, after the original import/export smoke workflow.
function Import-Portfolio {
 Eval (Click 'Manage Accounts') | Out-Null
 $doc=Send $script:socket 'DOM.getDocument' @{}
 $input=Send $script:socket 'DOM.querySelector' @{nodeId=$doc.root.nodeId;selector='input[type=file]'}
 Send $script:socket 'DOM.setFileInputFiles' @{nodeId=$input.nodeId;files=@('C:\Fixtures\001\Synthetic_Portfolio.xlsx')} | Out-Null
 Start-Sleep 2
 Eval '(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Close");if(b)b.click();return true})()' | Out-Null
 Start-Sleep 1
}
function Select-PortfolioAccount([string]$name) {
 Eval 'document.getElementById("account-select").click();true' | Out-Null
 Start-Sleep -Milliseconds 300
 $encoded=$name|ConvertTo-Json -Compress
 Eval "(()=>{const e=[...document.querySelectorAll('[role=option]')].find(e=>e.innerText.includes($encoded));if(!e)throw Error('Account missing');e.click();return true})()" | Out-Null
 Start-Sleep 1
}
function Portfolio-Screenshot([string]$name) {
 $png=Send $script:socket 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes("C:\TestExport\portfolio-$name.png",[Convert]::FromBase64String($png.data))
}
function Click-PortfolioTab([string]$name) {
 $encoded=$name|ConvertTo-Json -Compress
 $point=Eval "(()=>{const e=[...document.querySelectorAll('[role=tab]')].find(e=>e.innerText===$encoded);if(!e)throw Error('Tab missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"
 Send $script:socket 'Input.dispatchMouseEvent' @{type='mousePressed';x=$point.x;y=$point.y;button='left';clickCount=1} | Out-Null
 Send $script:socket 'Input.dispatchMouseEvent' @{type='mouseReleased';x=$point.x;y=$point.y;button='left';clickCount=1} | Out-Null
 Start-Sleep -Milliseconds 300
 if(!(Eval "[...document.querySelectorAll('[role=tab]')].some(e=>e.innerText===$encoded && e.getAttribute('aria-selected')==='true')")){throw "Tab did not activate: $name"}
}
Import-Portfolio
if((Eval 'document.body.innerText') -notmatch '25,399.89'){throw 'Full savings fixture balance mismatch'}
Select-PortfolioAccount 'Investing - Managed'
if((Eval 'document.body.innerText') -notmatch '32,802.48'){throw 'Managed fixture balance mismatch'}
Select-PortfolioAccount 'Investing - Self-directed'
if((Eval 'document.querySelectorAll("[data-performance-metric]").length') -ne 6){throw 'Expected six asset-performance charts'}
$text=Eval 'document.body.innerText'
foreach($expected in @('65,905.67','11,305.66','Stock ETF','Individual Stock','REIT')){
 if(!$text.Contains($expected)){throw "Self-directed expected text missing: $expected"}
}
Eval 'document.getElementById("demo-caption")?.remove();window.scrollTo(0,0);true' | Out-Null
$layouts=@()
foreach($width in @(1440,1280,1024,390)) {
 Send $script:socket 'Emulation.setDeviceMetricsOverride' @{width=$width;height=1000;deviceScaleFactor=1;mobile=$false} | Out-Null
 Start-Sleep 1
 $layout=Eval '(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,summary:rect("[data-testid=account-summary-card]"),allocation:rect("[data-testid=asset-allocation-card]"),segments:document.querySelectorAll("[data-testid=asset-allocation-card] .recharts-pie-sector").length}})()'
 if($width -ge 1280 -and ([Math]::Abs($layout.summary.y-$layout.allocation.y) -gt 1 -or [Math]::Abs($layout.summary.height-$layout.allocation.height) -gt 1)){throw 'Overview/allocation cards do not align'}
 if($width -ge 1280 -and $layout.overflow){throw 'Desktop dashboard overflows horizontally'}
 if($layout.segments -ne 6){throw 'Allocation donut is blank or missing a category'}
 $layouts+=$layout
 Portfolio-Screenshot "$width"
}
$layouts|ConvertTo-Json -Depth 8|Set-Content C:\TestExport\portfolio-layouts.json
Send $script:socket 'Emulation.setDeviceMetricsOverride' @{width=1440;height=1000;deviceScaleFactor=1;mobile=$false} | Out-Null
# Both allocation charts are displayed together.
Start-Sleep 1
if((Eval 'document.querySelectorAll("[data-allocation-view=gains] .recharts-pie-sector").length') -ne 3){throw 'Income allocation chart is blank'}
Portfolio-Screenshot 'income'
Click-PortfolioTab 'Trades & income'
# A radio change resets both the stored asset and the visible controlled Select.
foreach($nextType in @('sell','dividend','stock-lending','distribution','buy')) {
 Eval '(()=>{const p=document.querySelector("[role=tabpanel][data-state=active]");p.querySelector("[role=combobox]").click();return true})()' | Out-Null
 Start-Sleep -Milliseconds 150
 Eval '(()=>{const option=[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.includes("AAPL"));if(!option)throw Error("AAPL option missing");option.click();return true})()' | Out-Null
 $type=$nextType|ConvertTo-Json -Compress
 Eval "document.getElementById($type).click();true" | Out-Null
 Start-Sleep -Milliseconds 150
 if(!(Eval 'document.querySelector("[role=tabpanel][data-state=active] [role=combobox]").textContent.includes("Select an existing asset")')){throw "Asset label not cleared after switching to $nextType"}
}
Eval 'document.getElementById("interest").click();true' | Out-Null
Start-Sleep -Milliseconds 300
if(Eval '[...document.querySelectorAll("[role=tabpanel][data-state=active] label")].some(e=>e.textContent==="Asset")'){throw 'Cash interest must not require an asset'}
Eval (Fill 'input[name=amount]' '5') | Out-Null
Eval (Click 'Log Interest') | Out-Null
Start-Sleep 1
if((Eval 'document.querySelector("[data-testid=account-summary-card]").innerText') -notmatch '65,910.67'){throw 'Account interest did not accumulate as cash'}
# Explicitly discard only the fictional unsaved interest entry to restore the fixture.
Eval 'window.fixtureConfirm=window.confirm;window.confirm=()=>true;true' | Out-Null
Import-Portfolio
Eval 'window.confirm=window.fixtureConfirm;delete window.fixtureConfirm;true' | Out-Null
Select-PortfolioAccount 'Investing - Self-directed'
Click-PortfolioTab 'Cash movements'
Eval 'document.querySelector("[role=tabpanel][data-state=active] [role=combobox]").click();true' | Out-Null
Start-Sleep -Milliseconds 300
$options=Eval '[...document.querySelectorAll("[role=option]")].map(e=>e.innerText)'
if(($options -join ',') -ne 'Contribution,Withdrawal'){throw "Unexpected cash movement options: $options"}
Eval 'document.querySelector("[role=option]").click();true' | Out-Null
Eval (Fill 'input[name=amount]' '100') | Out-Null
Eval (Click 'Add Transaction') | Out-Null
Start-Sleep 1
if((Eval 'document.querySelector("[data-testid=account-summary-card]").innerText') -notmatch '66,005.67'){throw 'Self-directed cash deposit did not increase balance correctly'}
Eval (Click 'Manage Accounts') | Out-Null
Start-Sleep -Milliseconds 400
$footer=Eval '(()=>{const d=document.querySelector("[role=dialog]");const buttons=[...d.querySelectorAll("button")].filter(e=>["Add New Account","Open workbook","Export"].includes(e.innerText.trim()));return {manual:!!d.querySelector("#workbook-path"),overflow:d.scrollWidth>d.clientWidth,buttons:buttons.map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText,x:r.x,y:r.y,w:r.width}})}})()'
if($footer.manual -or $footer.overflow -or $footer.buttons.Count -ne 3){throw 'Workbook sidebar layout or actions incorrect'}
$add=$footer.buttons|Where-Object {$_.text.Trim() -eq 'Add New Account'}
$open=$footer.buttons|Where-Object {$_.text.Trim() -eq 'Open workbook'}
$export=$footer.buttons|Where-Object {$_.text.Trim() -eq 'Export'}
if($open.y -le $add.y -or [Math]::Abs($open.y-$export.y) -gt 1 -or $open.w -lt 100){throw 'Workbook sidebar buttons are crowded or misaligned'}
Portfolio-Screenshot 'workbook-sidebar'
New-Item -ItemType Directory C:\TestExport\portfolio-export -Force | Out-Null
Send $script:socket 'Page.setDownloadBehavior' @{behavior='allow';downloadPath='C:\TestExport\portfolio-export'} | Out-Null
Eval (Click 'Export') | Out-Null
Start-Sleep 2
if(!(Test-Path C:\TestExport\portfolio-export\FinancialData.xlsx)){throw 'Full portfolio export missing'}
$doc=Send $script:socket 'DOM.getDocument' @{}
$input=Send $script:socket 'DOM.querySelector' @{nodeId=$doc.root.nodeId;selector='input[type=file]'}
Send $script:socket 'DOM.setFileInputFiles' @{nodeId=$input.nodeId;files=@('C:\TestExport\portfolio-export\FinancialData.xlsx')} | Out-Null
Start-Sleep 1
Eval '(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Close");if(b)b.click();return true})()' | Out-Null
if((Eval 'document.querySelector("[data-testid=account-summary-card]").innerText') -notmatch '66,005.67'){throw 'Full portfolio roundtrip balance mismatch'}
Start-Sleep 1
Eval 'document.querySelector("[aria-label=\"Asset performance\"]").scrollIntoView();true' | Out-Null
Start-Sleep 1
Portfolio-Screenshot 'performance'
Eval (Click 'Deselect All') | Out-Null
if((Eval 'document.body.innerText') -notmatch 'Select one or more assets'){throw 'Asset filter empty state failed'}
Eval (Click 'Select All') | Out-Null
'Full workbook imported; three account balances, allocation, responsive geometry, cash entry, export and chart filters passed.' | Set-Content C:\TestExport\portfolio-checks.txt
