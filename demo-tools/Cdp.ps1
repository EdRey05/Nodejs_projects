function Send($Socket,[string]$Method,$Parameters){
 $script:messageId++;$id=$script:messageId
 $bytes=[Text.Encoding]::UTF8.GetBytes((@{id=$id;method=$Method;params=$Parameters}|ConvertTo-Json -Depth 35 -Compress))
 $Socket.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()|Out-Null
 $timeout=[Threading.CancellationTokenSource]::new(60000)
 try{do{$stream=[IO.MemoryStream]::new();do{$buffer=[byte[]]::new(65536);$r=$Socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),$timeout.Token).GetAwaiter().GetResult();$stream.Write($buffer,0,$r.Count)}while(!$r.EndOfMessage);$reply=[Text.Encoding]::UTF8.GetString($stream.ToArray())|ConvertFrom-Json;$stream.Dispose()}while($reply.id -ne $id);if($reply.error){throw ($reply.error|ConvertTo-Json -Compress)};return $reply.result}finally{$timeout.Dispose()}
}
function Eval([string]$Expression,[switch]$Main){$s=$script:socket;if($Main){$s=$script:mainSocket};$r=Send $s 'Runtime.evaluate' @{expression=$Expression;awaitPromise=$true;returnByValue=$true};if($r.exceptionDetails){throw ($r.exceptionDetails|ConvertTo-Json -Depth 10 -Compress)};return $r.result.value}
function Observe([string]$Label){$dom=Eval '({text:document.body.innerText,inputs:[...document.querySelectorAll("input,textarea,select")].map(e=>({tag:e.tagName,type:e.type,placeholder:e.placeholder,value:e.value})),buttons:[...document.querySelectorAll("button")].map(e=>({text:e.innerText,title:e.title,disabled:e.disabled}))})';$safe=$Label -replace '[^A-Za-z0-9_-]','_';$dom|ConvertTo-Json -Depth 10|Set-Content "C:\TestExport\$script:appId-$safe.json";return $dom}
function Step([string]$Label,[string]$Expression,[int]$Seconds=3){
 Write-Output "$script:appId $Label"
 Eval ('(()=>{let e=document.getElementById("demo-caption");if(!e){e=document.createElement("div");e.id="demo-caption";e.style="position:fixed;bottom:10px;right:16px;z-index:2147483647;background:#101828ee;color:white;padding:10px 18px;border-radius:8px;font:15px Arial;pointer-events:none";document.body.append(e)}e.textContent='+($Label|ConvertTo-Json -Compress)+';return true})()')|Out-Null
 if($Expression){Eval $Expression|Out-Null}
 Start-Sleep -Seconds $Seconds
 Observe $Label|Out-Null
}
function Click([string]$Text){$t=$Text|ConvertTo-Json -Compress;return "(()=>{const a=[...document.querySelectorAll('button')].filter(e=>e.innerText.trim()===$t);if(a.length!==1||a[0].disabled)throw Error('Button unavailable: '+$t);a[0].scrollIntoView({block:'center'});a[0].click();return true})()"}
function Fill([string]$Selector,[string]$Value){$a=$Selector|ConvertTo-Json -Compress;$b=$Value|ConvertTo-Json -Compress;return "(()=>{const e=document.querySelector($a);if(!e)throw Error('Input missing');e.scrollIntoView({block:'center'});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,$b);e.dispatchEvent(new Event('input',{bubbles:true}));return true})()"}
