param([Parameter(Mandatory=$true)][string]$PayloadBase64)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))|ConvertFrom-Json
if($p.sessionName -notmatch '^GTMPC-FPS-[a-f0-9]{32}$' -or !(Test-Path -LiteralPath $p.directory -PathType Container)){exit 2}
$stopFile=Join-Path $p.directory 'stop';$heartbeat=Join-Path $p.directory 'heartbeat';$stateFile=Join-Path $p.directory 'state.json'
function Save-State($state){$temporary=$stateFile+'.tmp';[IO.File]::WriteAllText($temporary,($state|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $temporary -Destination $stateFile -Force}
$collector=$null;$sessions=@();$phase='starting';$message='';$parent=$null
try{
 if(Test-Path -LiteralPath $stopFile){$phase='stopped';exit 0}
 $parent=[Diagnostics.Process]::GetProcessById([int]$p.parentPid)
 if([Math]::Abs(($parent.StartTime.ToUniversalTime()-[datetime]$p.parentStartedAt).TotalSeconds) -gt 15){throw 'Parent process changed'}
 if((Get-FileHash -LiteralPath $p.binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af'){throw 'Component hash mismatch'}
 Add-Type -Path (Join-Path $PSScriptRoot 'fps-native.cs')
 $collector=[GTMFpsCollector]::new([string[]]@($p.games.exe),[string[]]@($p.games.id),[string[]]@($p.games.name))
 $arguments='--session_name '+$p.sessionName+' --output_stdout --v1_metrics --no_console_stats --no_track_gpu --no_track_input --no_track_display'
 foreach($game in $p.games){if($game.exe -notmatch '^[^<>:"/\\|?*\x00-\x1f]+\.exe$'){throw 'Invalid target'};$arguments+=' --process_name "'+$game.exe+'"'}
 if($parent.HasExited -or (Test-Path -LiteralPath $stopFile) -or !(Test-Path -LiteralPath $heartbeat) -or (([datetime]::UtcNow-(Get-Item -LiteralPath $heartbeat).LastWriteTimeUtc).TotalSeconds -gt 10)){$phase='stopped';return}
 $collector.Start([string]$p.binary,$arguments)
 $lastSave=[datetime]::MinValue
 while(!$collector.Exited){
  if($parent.HasExited -or (Test-Path -LiteralPath $stopFile) -or !(Test-Path -LiteralPath $heartbeat) -or (([datetime]::UtcNow-(Get-Item -LiteralPath $heartbeat).LastWriteTimeUtc).TotalSeconds -gt 10)){break}
  if((([datetime]::UtcNow)-$lastSave).TotalSeconds -ge 2){$sessions=@($collector.Snapshot($false));Save-State @{phase='watching';sessions=$sessions;headerSeen=$collector.HeaderSeen;invalidRows=$collector.InvalidRows;updatedAt=[datetime]::UtcNow.ToString('o')};$lastSave=[datetime]::UtcNow}
  Start-Sleep -Milliseconds 250
 }
 if($collector.Exited -and !(Test-Path -LiteralPath $stopFile) -and !$parent.HasExited){
  if($collector.ExitCode -eq 5 -or $collector.Error -match 'access.denied|privilege|\(5\)'){$phase='needs-permission';$message='Для сбора кадров Windows нужны права администратора.'}else{$phase='error';$message='PresentMon не смог начать или продолжить захват кадров.'}
 }else{$phase='stopped'}
}catch{$phase='error';$message='Не удалось запустить сбор кадров Windows. Проверьте установленную версию GTM PC.'}
finally{
 if($collector){$collector.Stop([string]$p.binary,[string]$p.sessionName);$sessions=@($collector.Snapshot($true));$collector.Dispose()}
 try{Save-State @{phase=$phase;message=$message;sessions=$sessions}}catch{}
 if($parent){$parent.Dispose()}
}
