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
 '002_MD_Studio'{
  New-Item -ItemType Directory C:\SyntheticMarkdown -Force | Out-Null
  Copy-Item C:\Fixtures\002\Notebook.md C:\SyntheticMarkdown\Notebook.md
  Step 'Mount a disposable folder of Markdown notes' (Fill '#mount-path' 'C:\SyntheticMarkdown') 2
  Step 'Open the workspace' (Click 'Mount Workspace') 2
  Step 'Open source and live preview side by side' 'openFile("Notebook.md");true' 3
  $content="# Synthetic project notebook`n`n## Updated in MD Studio`n`n- [x] Edit source`n- [x] Inspect live preview`n- [x] Save a real Markdown file`n`n**Everything here is fictional.**"
  Step 'Edit the source; the preview updates automatically' (Fill '.split-editor textarea' $content) 4
  if((Eval 'document.getElementById("split-preview-content").innerText') -notmatch 'Updated in MD Studio'){throw 'Live preview did not update'}
  Step 'Save changes to the original Markdown file' (Click 'Save') 3
  if((Get-Content C:\SyntheticMarkdown\Notebook.md -Raw) -ne $content){throw 'Saved Markdown differs from editor'}
  Copy-Item C:\SyntheticMarkdown\Notebook.md C:\TestExport\Notebook-edited.md
  Step 'Reopen and verify the saved result' 'openFile("Notebook.md");true' 3
  if((Eval 'document.querySelector(".split-editor textarea").value') -ne $content){throw 'Reopened content differs'}
 }
}
