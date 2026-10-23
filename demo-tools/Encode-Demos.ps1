param([Parameter(Mandatory=$true)][string]$Validation,[string]$Output,[string[]]$Apps=@('001_S_I','002_MD_Studio'))
$ErrorActionPreference='Stop'
$Validation=(Resolve-Path $Validation).Path
if(!$Output){$Output=Join-Path (Split-Path $PSScriptRoot -Parent) 'Images_GIFs_Videos'}
New-Item -ItemType Directory -Force $Output | Out-Null
$results=Get-Content (Join-Path $Validation 'results.json') -Raw | ConvertFrom-Json
$receipts=@()
if(Test-Path (Join-Path $Output 'recordings.json')){$existing=Get-Content (Join-Path $Output 'recordings.json') -Raw | ConvertFrom-Json;$receipts=@($existing | Where-Object {$_.app -notin $Apps})}
foreach($id in $Apps){
 $test=$results | Where-Object id -eq $id
 if($test.status -ne 'passed'){throw "Cannot publish a demo from failed validation: $id"}
 $frames=Join-Path $Validation "frames-$id\frames.txt"
 if(!(Test-Path $frames)){throw "No frames: $id"}
 $video=Join-Path $Output "$id.mp4"
 & ffmpeg.exe -hide_banner -loglevel warning -y -f concat -safe 0 -i $frames -r 12 -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -movflags +faststart $video
 if($LASTEXITCODE){throw 'MP4 encoding failed'}
 & ffmpeg.exe -hide_banner -loglevel error -y -i $video -vf 'setpts=0.5*PTS,fps=5,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4' -loop 0 (Join-Path $Output "$id.gif")
 if($LASTEXITCODE){throw 'GIF encoding failed'}
 [IO.File]::WriteAllBytes((Join-Path $Output "$id.png"),[IO.File]::ReadAllBytes((Join-Path $Validation "$id.png")))
 $meta=(& ffprobe.exe -v error -show_entries 'format=duration,size:stream=codec_name,width,height,nb_frames' -of json $video | Out-String | ConvertFrom-Json)
 $receipts+=@{app=$id;artifactSha256=$test.sha256;videoSha256=(Get-FileHash $video).Hash;gifSha256=(Get-FileHash (Join-Path $Output "$id.gif")).Hash;posterSha256=(Get-FileHash (Join-Path $Output "$id.png")).Hash;metadata=$meta;capture='Real Edge renderer, measured frame timing; no audio; CDP UI automation';gifSpeed='2x'}
}
$receipts | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $Output 'recordings.json') -Encoding UTF8
