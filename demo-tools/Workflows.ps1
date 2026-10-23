param([string]$DemoApp,[string]$Folder)
switch($DemoApp){
 '001_S_I'{
  Step 'Import a fictional finance workbook' (Click 'Manage & Import') 3
  $doc=Send $script:socket 'DOM.getDocument' @{}
  $input=Send $script:socket 'DOM.querySelector' @{nodeId=$doc.root.nodeId;selector='input[type=file]'}
  Send $script:socket 'DOM.setFileInputFiles' @{nodeId=$input.nodeId;files=@('C:\Fixtures\001\Synthetic_FinancialData.xlsx')} | Out-Null
  Start-Sleep 3
  $text=Eval 'document.body.innerText'
  if($text -notmatch 'Demo Emergency Fund' -or $text -notmatch '4,290'){throw 'Imported account/balance mismatch'}
  Step 'Three synthetic accounts; savings balance verified at $4,290' '' 4
  Eval '(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.innerText.trim()==="Close");if(b)b.click();return true})()' | Out-Null
  Step 'Inspect the savings charts and transaction history' '' 4
  Step 'Add a fictional $100 contribution' (Fill 'input[name=amount]' '100') 2
  Step 'Save the contribution in the dashboard' (Click 'Add Transaction') 3
  if((Eval 'document.body.innerText') -notmatch '4,390'){throw 'Added contribution balance mismatch'}
  Step 'Open workbook export' (Click 'Manage Accounts') 2
  Step 'Export the workbook through the real application' (Click 'Export') 3
  if(!(Test-Path C:\TestExport\FinancialData.xlsx)){throw 'Workbook export missing'}
  # Inspect actual saved XLSX XML rather than claiming success from a toast.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead('C:\TestExport\FinancialData.xlsx')
  try{if(!($zip.Entries.FullName -contains 'xl/workbook.xml')){throw 'Invalid workbook output'};$entry=$zip.GetEntry('xl/worksheets/sheet1.xml');$reader=[IO.StreamReader]::new($entry.Open());$xml=$reader.ReadToEnd();$reader.Dispose();if($xml -notmatch 'demo_savings'){throw 'Account missing from exported workbook'}}finally{$zip.Dispose()}
  $doc=Send $script:socket 'DOM.getDocument' @{}
  $input=Send $script:socket 'DOM.querySelector' @{nodeId=$doc.root.nodeId;selector='input[type=file]'}
  Send $script:socket 'DOM.setFileInputFiles' @{nodeId=$input.nodeId;files=@('C:\TestExport\FinancialData.xlsx')} | Out-Null
  Start-Sleep 2
  if((Eval 'document.body.innerText') -notmatch '4,390'){throw 'Export/reimport roundtrip balance mismatch'}
  Step 'Re-import the saved workbook; the $4,390 balance persists' '' 3
  Eval 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true' | Out-Null
  # Close the sheet using its actual close button.
  Eval '(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.innerText.trim()==="Close");if(b)b.click();return true})()' | Out-Null
  Step 'Local charts and transaction history; export before closing' '' 4
 }
}
