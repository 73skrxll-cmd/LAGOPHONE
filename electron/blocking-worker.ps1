param([Parameter(Mandatory=$true)][string]$PayloadBase64)
$ErrorActionPreference='Stop'
$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))|ConvertFrom-Json
if($p.session -notmatch '^[a-f0-9]{32}$' -or !(Test-Path -LiteralPath $p.directory -PathType Container)){exit 2}
$dir=[string]$p.directory;$root=[string]$p.resources;$stop=Join-Path $dir 'stop';$heartbeat=Join-Path $dir 'heartbeat'
$zapret=$null;$fnport=$null;$parent=$null;$ownedDriver=$false;$last='';$profile='';$fnphase='idle';$failure='';$commandError='';$ready=$false;$finished=$false
function Save-State {
 $fn=@{phase=$fnphase};$fp=Join-Path $dir 'fnport-state.json'
 if($fnport -and (Test-Path -LiteralPath $fp)){try{$fn=Get-Content -LiteralPath $fp -Raw -Encoding UTF8|ConvertFrom-Json}catch{}}
 if($fnport -and !$fnport.Running -and $fn.phase -notin @('checked','stopped','error')){$fn=@{phase='error';message='fnport завершился до подтверждения работы.'}}
 $zr=$zapret -and $zapret.Running
 $data=@{phase=$(if($failure){'error'}elseif($finished){'stopped'}elseif($ready){'ready'}else{'starting'});message=$failure;lastCommand=$last;commandError=$commandError;updatedAt=[datetime]::UtcNow.ToString('o');zapret=@{running=[bool]$zr;profile=$profile;exitCode=$(if($zapret){$zapret.ExitCode}else{0})};fnport=$fn}
 $file=Join-Path $dir 'state.json';[IO.File]::WriteAllText($file+'.tmp',($data|ConvertTo-Json -Depth 15 -Compress),[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath ($file+'.tmp') -Destination $file -Force
}
function Quote-Args($argv){return (($argv|ForEach-Object {'"'+([string]$_).Replace('"','\"')+'"'}) -join ' ')}
function Assert-GameClosed {
 $games=@(Get-Process -Name 'FortniteClient-Win64-Shipping','TslGame','EscapeFromTarkov','cs2','r5apex','VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue)
 if($games.Count){throw 'Сначала закройте игру: менять сетевой режим во время сеанса нельзя.'}
}
function Stop-Fnport {
 if($fnport){[IO.File]::WriteAllText((Join-Path $dir 'fnport-stop'),'1');$until=[datetime]::UtcNow.AddSeconds(6);while($fnport.Running -and [datetime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100};$fnport.Dispose();$script:fnport=$null};$script:fnphase='stopped'
}
function Stop-Zapret {if($zapret){$zapret.Dispose();$script:zapret=$null};$script:profile=''}
function Cleanup-Driver {
 if(!$ownedDriver){return}
 if(@(Get-Process -Name 'winws','winws2','goodbyedpi' -ErrorAction SilentlyContinue).Count){return}
 # Remove only a service absent before GTM and whose binary points at this exact package.
 $service=Get-CimInstance Win32_SystemDriver -Filter "Name='WinDivert'" -ErrorAction SilentlyContinue
 if($service){$expected=[IO.Path]::GetFullPath((Join-Path $root 'zapret/bin/WinDivert64.sys'));$actual=([string]$service.PathName).Trim('"').Replace('\??\','');if($actual -ieq $expected){& "$env:SystemRoot\System32\sc.exe" stop WinDivert|Out-Null;$after=Get-CimInstance Win32_SystemDriver -Filter "Name='WinDivert'" -ErrorAction SilentlyContinue;if($after -and $after.State -eq 'Stopped'){& "$env:SystemRoot\System32\sc.exe" delete WinDivert|Out-Null}}}
}
try{
 if(Test-Path -LiteralPath $stop){exit 0}
 $parent=[Diagnostics.Process]::GetProcessById([int]$p.parentPid)
 if([Math]::Abs(($parent.StartTime.ToUniversalTime()-([datetime]$p.parentStartedAt).ToUniversalTime()).TotalSeconds) -gt 15){throw 'Процесс GTM PC изменился.'}
 $manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
 foreach($entry in $manifest.files.PSObject.Properties){$file=[IO.Path]::GetFullPath((Join-Path $root $entry.Name));if(!$file.StartsWith([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Недопустимый путь компонента.'};if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw 'Компонент изменён или отсутствует. Переустановите GTM PC.'}}
 Add-Type -Path (Join-Path $PSScriptRoot 'blocking-native.cs')
 $profiles=Get-Content -LiteralPath (Join-Path $root 'profiles.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $working=Join-Path $dir 'lists';New-Item -ItemType Directory -Path $working -Force|Out-Null;Copy-Item -Path (Join-Path $root 'zapret/lists/*') -Destination $working -Force
 $ready=$true;Save-State
 while(!$parent.HasExited -and !(Test-Path -LiteralPath $stop) -and (Test-Path -LiteralPath $heartbeat) -and (([datetime]::UtcNow-(Get-Item -LiteralPath $heartbeat).LastWriteTimeUtc).TotalSeconds -lt 12)){
  $file=Join-Path $dir 'command.json'
  if(Test-Path -LiteralPath $file){$cmd=$null;try{$cmd=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
   if($cmd -and $cmd.id -match '^[a-f0-9]{32}$' -and $cmd.id -ne $last){$commandError=''
    try{switch($cmd.action){
     'check-safe' {Assert-GameClosed}
     'zapret-start' {
      Assert-GameClosed
      $candidate=@($profiles|Where-Object {$_.id -ceq $cmd.profile});if($candidate.Count -ne 1){throw 'Стратегия не найдена.'}
      if($cmd.gameFilter -notin @('off','tcp','udp','all')){throw 'Недопустимый игровой фильтр.'}
      if($fnport -and $fnport.Running -and $cmd.gameFilter -ne 'off'){throw 'Игровой фильтр Zapret несовместим с работающим fnport.'}
      if(@(Get-Process -Name 'winws','winws2' -ErrorAction SilentlyContinue|Where-Object {!$zapret -or $_.Id -ne $zapret.Pid}).Count){throw 'Другой Zapret уже запущен. Остановите его в его приложении.'}
      if(!$zapret){$existing=Get-CimInstance Win32_SystemDriver -Filter "Name='WinDivert'" -ErrorAction SilentlyContinue;if($existing){$expected=[IO.Path]::GetFullPath((Join-Path $root 'zapret/bin/WinDivert64.sys'));$actual=([string]$existing.PathName).Trim('"').Replace('\??\','');if($actual -ieq $expected){$ownedDriver=$true}else{throw 'WinDivert уже используется другой программой; GTM PC не будет менять её драйвер.'}};if(!$existing){$ownedDriver=$true}}
      $tcp='12';$udp='12';if($cmd.gameFilter -in @('tcp','all')){$tcp='1024-65535'};if($cmd.gameFilter -in @('udp','all')){$udp='1024-65535'}
      $winwsArgs=@($candidate[0].args|ForEach-Object {([string]$_).Replace('%BIN%',(Join-Path $root 'zapret/bin/') ).Replace('%LISTS%',($working+'\')).Replace('%GameFilterTCP%',$tcp).Replace('%GameFilterUDP%',$udp)})
      $ipset=Join-Path $working 'ipset-all.txt';if($cmd.ipset -eq $true){Copy-Item -LiteralPath (Join-Path $working 'ipset-all.txt.backup') -Destination $ipset -Force}else{[IO.File]::WriteAllText($ipset,'203.0.113.113')}
      Stop-Zapret;$zapret=[GTMBlockingChild]::new();$zapret.Start((Join-Path $root 'zapret/bin/winws.exe'),(Quote-Args $winwsArgs),(Join-Path $root 'zapret/bin'));Start-Sleep -Milliseconds 900;if(!$zapret.Running){throw 'Zapret не запустился. Windows или другая программа могла заблокировать WinDivert.'};$profile=$cmd.profile
     }
     'zapret-stop' {Stop-Zapret;Cleanup-Driver}
     'fnport-start' {
      Assert-GameClosed;if($fnport -and $fnport.Running){throw 'fnport уже работает или выполняет проверку.'};if($cmd.gameFilter -ne 'off' -and $zapret -and $zapret.Running){throw 'Сначала выключите игровой фильтр Zapret.'}
      $fnphase='starting'
     }
     'fnport-check' {Assert-GameClosed;if($fnport -and $fnport.Running){throw 'Сначала отключите fnport.'};$fnphase='checking'}
     'fnport-stop' {Stop-Fnport}
     'stop-all' {Stop-Fnport;Stop-Zapret;Cleanup-Driver}
     default {throw 'Недопустимое действие.'}
    }
    if($cmd.action -in @('fnport-start','fnport-check')){
     if([int]$cmd.ttl -lt 1 -or [int]$cmd.ttl -gt 9 -or $cmd.fake -notin @('','quic_initial_vk_com.bin','quic_initial_gosuslugi_ru.bin','quic_initial_ozon_ru.bin')){throw 'Недопустимые параметры fnport.'}
     if($fnport){$fnport.Dispose()};Remove-Item -LiteralPath (Join-Path $dir 'fnport-stop'),(Join-Path $dir 'fnport-state.json') -Force -ErrorAction SilentlyContinue
     $mode=if($cmd.action -eq 'fnport-check'){'check'}else{'run'}
     $argv=@('--mode',$mode,'--control',$dir,'--parent',[string]$PID,'--parent-start',([Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o')),'--fake',[string]$cmd.fake,'--ttl',[string]$cmd.ttl)
     $fnport=[GTMBlockingChild]::new();$fnport.Start((Join-Path $root 'fnport/gtm-fnport.exe'),(Quote-Args $argv),(Join-Path $root 'fnport'))
    }
    }catch{$commandError=$_.Exception.Message}
    $last=$cmd.id
   }
  }
  Save-State;Start-Sleep -Milliseconds 250
 }
}catch{$failure=$_.Exception.Message}
finally{
 try{Stop-Fnport}catch{};try{Stop-Zapret}catch{};try{Cleanup-Driver}catch{}
 $ready=$false;$finished=$true;if(!$failure){$failure=''};try{Save-State; $end=Join-Path $dir 'stopped';[IO.File]::WriteAllText($end,'1')}catch{};if($parent){$parent.Dispose()}
}
