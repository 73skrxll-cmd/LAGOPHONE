param([ValidateSet('roots','snapshot','measure','processes','bits','pause','restore','watch','preflight','vpn-check','audit')][string]$Mode,[string]$PayloadBase64='e30=',[string]$SessionPathBase64,[int]$ParentId,[string]$LeaseId)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))|ConvertFrom-Json
$journalPath=$(if($SessionPathBase64){[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($SessionPathBase64))}else{$null})
function Emit($value){[Console]::WriteLine(($value|ConvertTo-Json -Depth 12 -Compress))}
function Journal($value){$temporary=$journalPath+'.'+[Guid]::NewGuid().ToString('N')+'.tmp';try{$value|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $temporary -Encoding UTF8;if(Test-Path -LiteralPath $journalPath){[IO.File]::Replace($temporary,$journalPath,($journalPath+'.backup'));Remove-Item -LiteralPath ($journalPath+'.backup') -Force -ErrorAction SilentlyContinue}else{[IO.File]::Move($temporary,$journalPath)}}finally{Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}}
function BitsJobs {Import-Module BitsTransfer -ErrorAction Stop;return @(Get-BitsTransfer -ErrorAction Stop)}
function Restore([string]$expectedLease='') {
 if(-not(Test-Path -LiteralPath $journalPath)){return @{restored=0;remaining=0}}
 $state=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json
 if(-not $state.owned -or ($expectedLease -and $state.leaseId -ne $expectedLease)){return @{restored=0;remaining=0}}
 $restored=0;$remaining=@();$jobs=@();if(@($state.jobs).Count){$jobs=@(BitsJobs)}
 foreach($entry in @($state.jobs)){
  if(-not $entry.intent){continue}
  $current=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json;if($current.leaseId -ne $state.leaseId){return @{restored=$restored;remaining=0}}
  $job=$jobs|Where-Object {$_.JobId.ToString() -eq $entry.id}|Select-Object -First 1
  try{if($job -and [string]$job.JobState -eq 'Suspended'){Resume-BitsTransfer -BitsJob $job -Asynchronous -ErrorAction Stop|Out-Null;$restored++}}catch{$remaining+=@($entry)}
 }
 $current=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json;if($current.leaseId -ne $state.leaseId){return @{restored=$restored;remaining=0}}
 $state.jobs=@($remaining);$state.owned=$remaining.Count -gt 0;Journal $state
 return @{restored=$restored;remaining=$remaining.Count}
}
function PauseSession([string]$lease) {
  $state=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json
  if(-not $state.owned -or $state.leaseId -ne $lease){throw 'Журнал сессии изменился.'}
  $jobs=@(BitsJobs);$paused=0
  foreach($entry in @($state.jobs)){
   $job=$jobs|Where-Object {$_.JobId.ToString() -eq $entry.id -and [string]$_.JobState -in @('Transferring','Queued','Connecting')}|Select-Object -First 1
   if(-not $job){continue}
   $entry.intent=$true;Journal $state
   Suspend-BitsTransfer -BitsJob $job -ErrorAction Stop|Out-Null;$verified=@(BitsJobs|Where-Object {$_.JobId.ToString() -eq $entry.id -and [string]$_.JobState -eq 'Suspended'});if(-not $verified.Count){throw 'Пауза BITS не подтверждена.'};$paused++
  }
  return @{paused=$paused}
}
function Snapshot {
 $interfaces=@(Get-NetIPInterface -AddressFamily IPv4 -ErrorAction Stop)
 $adapters=@(Get-NetAdapter -IncludeHidden -ErrorAction Stop)
 $routes=@(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop|Where-Object {$index=$_.InterfaceIndex;@($adapters|Where-Object {$_.ifIndex -eq $index -and $_.Status -eq 'Up'}).Count -gt 0}|Sort-Object @{Expression={$index=$_.InterfaceIndex;$iface=$interfaces|Where-Object {$_.InterfaceIndex -eq $index}|Select-Object -First 1;[long]$_.RouteMetric+[long]$iface.InterfaceMetric}})
 if(-not $routes.Count){throw 'Нет активного IPv4-подключения.'}
 $route=$routes[0];$adapter=$adapters|Where-Object {$_.ifIndex -eq $route.InterfaceIndex}|Select-Object -First 1
 $wifi=([string]$adapter.NdisPhysicalMedium -match '802|Wireless') -or ([int]$adapter.NdisPhysicalMedium -in @(1,9))
 $signal=$null
 if($wifi){try{$wlan=& (Join-Path $env:SystemRoot 'System32/netsh.exe') wlan show interfaces;$percent=@($wlan|ForEach-Object {if($_ -match ':\s*(\d{1,3})\s*%\s*$'){[int]$Matches[1]}});if($percent.Count -eq 1){$signal=$percent[0]}}catch{}}
 $stats=Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop
 $link=$null;try{if([double]$adapter.ReceiveLinkSpeed -gt 0){$link=[math]::Round([double]$adapter.ReceiveLinkSpeed/1e6,2)}}catch{}
 @{interfaceIndex=[int]$route.InterfaceIndex;name=[string]$adapter.Name;description=[string]$adapter.InterfaceDescription;gateway=$(if($route.NextHop -and $route.NextHop -ne '0.0.0.0'){[string]$route.NextHop}else{$null});wifi=[bool]$wifi;signalPct=$signal;linkMbps=$link;rxBytes=[double]$stats.ReceivedBytes;txBytes=[double]$stats.SentBytes;at=[DateTime]::UtcNow.ToString('o')}
}
try{
 if($Mode -eq 'roots'){
  $steam=@();foreach($root in @('HKCU:/Software/Valve/Steam','HKLM:/SOFTWARE/WOW6432Node/Valve/Steam','HKLM:/SOFTWARE/Valve/Steam')){try{$entry=Get-ItemProperty $root -ErrorAction Stop;if($entry.SteamPath){$steam+=@($entry.SteamPath)};if($entry.InstallPath){$steam+=@($entry.InstallPath)}}catch{}}
  $tarkov=@('C:\Battlestate Games\EFT','C:\Battlestate Games\BsgLauncher');
  foreach($root in @('HKLM:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/SOFTWARE/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*','HKCU:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*')){Get-ItemProperty $root -ErrorAction SilentlyContinue|Where-Object {$_.DisplayName -match 'Escape from Tarkov|Battlestate|BSG\s*Launcher'}|ForEach-Object {if($_.InstallLocation){$tarkov+=@([string]$_.InstallLocation)}}}
  Emit @{steam=@($steam|Select-Object -Unique);epic=@((Join-Path $env:ProgramData 'Epic/EpicGamesLauncher/Data/Manifests'));tarkov=@($tarkov|Select-Object -Unique)};exit
 }
 if($Mode -eq 'snapshot'){Emit (Snapshot);exit}
 if($Mode -eq 'processes'){
  $names=@('TslGame.exe','FortniteClient-Win64-Shipping.exe','EscapeFromTarkov.exe')
  $rows=@(Get-CimInstance Win32_Process -Filter "Name='TslGame.exe' OR Name='FortniteClient-Win64-Shipping.exe' OR Name='EscapeFromTarkov.exe'"|ForEach-Object {@{name=[string]$_.Name;path=$(if($_.ExecutablePath){[string]$_.ExecutablePath}else{$null});processId=[int]$_.ProcessId}})
  Emit @{games=$rows};exit
 }
 if($Mode -eq 'preflight'){
  $games=@(Get-Process -Name TslGame,FortniteClient-Win64-Shipping,EscapeFromTarkov -ErrorAction SilentlyContinue|ForEach-Object {@{name=$_.ProcessName}})
  $epic=@(Get-Process -Name EpicGamesLauncher -ErrorAction SilentlyContinue).Count -gt 0
  $settings=Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Internet Settings' -ErrorAction SilentlyContinue
  $other=@(Get-NetAdapter -IncludeHidden -ErrorAction Stop|Where-Object {$_.Status -eq 'Up' -and ($_.InterfaceDescription -match 'WireGuard|Proton|Windscribe|Cloudflare|GearUP|TAP-Windows|OpenVPN' -or $_.Name -match 'VPN|TUN|TAP|GearUP') -and $_.Name -notmatch '^GTMPC[a-f0-9]{20}$'}).Count -gt 0
  Emit @{games=$games;epicRunning=$epic;proxyEnabled=([int]$settings.ProxyEnable -eq 1 -or [bool]$settings.AutoConfigURL);otherVpn=$other};exit
 }
 if($Mode -eq 'vpn-check'){
  $name=[string]$data.tunnelName;if($name -notmatch '^GTMPC[a-f0-9]{20}$'){throw 'Неизвестный туннель.'}
  $adapter=Get-NetAdapter -Name $name -IncludeHidden -ErrorAction Stop;$index=[int]$adapter.ifIndex;$routeOk=$true;$dnsOk=$true;$ipv6Bypass=$false;$checked=0
  foreach($hostName in @('www.cloudflare.com','www.epicgames.com','launcher-public-service-prod06.ol.epicgames.com')){
   $addresses=@(Resolve-DnsName -Name $hostName -Type A -ErrorAction Stop|Where-Object {$_.IPAddress}|ForEach-Object {$_.IPAddress})
   if(-not $addresses.Count){$dnsOk=$false};foreach($address in $addresses){$indexes=@(Find-NetRoute -RemoteIPAddress $address|ForEach-Object {$_.InterfaceIndex}|Select-Object -Unique);if($indexes.Count -ne 1 -or $indexes[0] -ne $index){$routeOk=$false};$checked++}
  }
  $client=New-Object Net.Sockets.TcpClient([Net.Sockets.AddressFamily]::InterNetworkV6)
  try{$connection=$client.BeginConnect([Net.IPAddress]::Parse('2606:4700:4700::1111'),443,$null,$null);if($connection.AsyncWaitHandle.WaitOne(1200,$false)){$client.EndConnect($connection);$indexes=@(Find-NetRoute -RemoteIPAddress '2606:4700:4700::1111'|ForEach-Object {$_.InterfaceIndex}|Select-Object -Unique);$ipv6Bypass=$indexes.Count -ne 1 -or $indexes[0] -ne $index}}catch{}finally{if($connection){$connection.AsyncWaitHandle.Close()};$client.Close()}
  Emit @{routeOk=($routeOk -and $checked -gt 0);dnsOk=$dnsOk;ipv6Bypass=[bool]$ipv6Bypass;checkedAddresses=$checked};exit
 }
 if($Mode -eq 'audit'){
  $adapters=@(Get-NetAdapter -IncludeHidden -ErrorAction Stop);$interfaces=@(Get-NetIPInterface -ErrorAction Stop)
  $proxy=Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Internet Settings' -ErrorAction SilentlyContinue
  $virtual=@($adapters|Where-Object {$_.InterfaceDescription -match 'WireGuard|VPN|Proton|Windscribe|Cloudflare|GearUP|TAP|TUN'}|ForEach-Object {@{kind=$(if($_.InterfaceDescription -match 'Cloudflare'){'warp'}elseif($_.InterfaceDescription -match 'WireGuard'){'wireguard'}else{'vpn-or-virtual'});up=($_.Status -eq 'Up');gtm=($_.Name -match '^GTMPC[a-f0-9]{20}$')}})
  $dns=@(Get-DnsClientServerAddress|Where-Object {$_.ServerAddresses}|ForEach-Object {@{interfaceIndex=[int]$_.InterfaceIndex;count=@($_.ServerAddresses).Count}})
  $defaults=@(Get-NetRoute -ErrorAction Stop|Where-Object {$_.DestinationPrefix -in @('0.0.0.0/0','::/0')}|ForEach-Object {@{family=[string]$_.AddressFamily;interfaceIndex=[int]$_.InterfaceIndex;metric=[int]$_.RouteMetric;gtm=($_.InterfaceAlias -match '^GTMPC[a-f0-9]{20}$')}})
  $firewall=$null;try{$firewall=@(Get-NetFirewallProfile -ErrorAction Stop|ForEach-Object {@{profile=[string]$_.Name;enabled=[bool]$_.Enabled}})}catch{}
  $qos=$null;try{$qos=@(Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction Stop).Count}catch{}
  Emit @{at=[DateTime]::UtcNow.ToString('o');defaultRoutes=$defaults;dnsInterfaces=$dns;proxyEnabled=([int]$proxy.ProxyEnable -eq 1);pacConfigured=[bool]$proxy.AutoConfigURL;virtualAdapters=$virtual;firewall=$firewall;qosPolicyCount=$qos;notice='Read-only snapshot. No reset, DNS, proxy or firewall changes performed.'};exit
 }
 if($Mode -eq 'bits'){
  try{$jobs=@(BitsJobs|Where-Object {[string]$_.JobState -in @('Transferring','Queued','Connecting')}|ForEach-Object {@{id=$_.JobId.ToString();state=[string]$_.JobState}});Emit @{supported=$true;jobs=$jobs}}catch{Emit @{supported=$false;jobs=@()}};exit
 }
 if($Mode -eq 'pause'){Emit (PauseSession ([string]$data.leaseId));exit}
 if($Mode -eq 'restore'){Emit (Restore);exit}
 if($Mode -eq 'watch'){
  $parent=Get-Process -Id $ParentId -ErrorAction SilentlyContinue;$ticks=$(if($parent){$parent.StartTime.Ticks}else{0});$deadline=[DateTime]::UtcNow.AddHours(12)
  while($true){
   try{$state=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json}catch{Start-Sleep -Milliseconds 300;continue}
   if(-not $state.owned -or $state.leaseId -ne $LeaseId){exit}
   $parent=Get-Process -Id $ParentId -ErrorAction SilentlyContinue
   if(-not $parent -or $parent.StartTime.Ticks -ne $ticks -or [DateTime]::UtcNow -gt $deadline){[void](Restore $LeaseId);exit}
   Start-Sleep -Seconds 3
  }
 }
 if($Mode -eq 'measure'){
  if($data.controlAddress -notin @('1.1.1.1','8.8.8.8')){throw 'Неизвестный контрольный узел.'}
  $network=Snapshot;$gateway=$network.gateway;$control=[string]$data.controlAddress
  $targets=@($control);if($gateway -and $gateway -ne $control){$targets+=@($gateway)}
  $samples=@{};foreach($target in $targets){$samples[$target]=New-Object Collections.ArrayList}
  $first=$network;$previous=$network;$clock=[Diagnostics.Stopwatch]::StartNew();$lastTime=0.0
  $pings=@{};foreach($target in $targets){$pings[$target]=New-Object Net.NetworkInformation.Ping}
  try{
   for($i=0;$i -lt 20;$i++){
    $tasks=@{};foreach($target in $targets){$tasks[$target]=$pings[$target].SendPingAsync($target,800)}
    $stats=Get-NetAdapterStatistics -Name $network.name -ErrorAction Stop
    $elapsed=$clock.Elapsed.TotalSeconds;$interval=$elapsed-$lastTime
    $rx=$(if($interval -gt 0.01){[math]::Max(0,([double]$stats.ReceivedBytes-$previous.rxBytes)*8/$interval/1e6)}else{$null})
    $tx=$(if($interval -gt 0.01){[math]::Max(0,([double]$stats.SentBytes-$previous.txBytes)*8/$interval/1e6)}else{$null})
    foreach($target in $targets){
     $status='error';$rtt=$null
     try{$reply=$tasks[$target].GetAwaiter().GetResult();if($reply.Status -eq [Net.NetworkInformation.IPStatus]::Success -and $null -ne $reply.RoundtripTime -and [long]$reply.RoundtripTime -ge 0){$status='success';$rtt=[long]$reply.RoundtripTime}elseif($reply.Status -eq 'TimedOut'){$status='timeout'}else{$status='unreachable'}}catch{}
     [void]$samples[$target].Add(@{sequence=$i;at=[DateTime]::UtcNow.ToString('o');status=$status;rttMs=$rtt;resolutionMs=1;rxMbps=$rx;txMbps=$tx})
    }
    $previous=@{rxBytes=[double]$stats.ReceivedBytes;txBytes=[double]$stats.SentBytes};$lastTime=$elapsed
    Start-Sleep -Milliseconds 300
   }
  }finally{foreach($ping in $pings.Values){$ping.Dispose()}}
  $end=Snapshot;if($end.interfaceIndex -ne $network.interfaceIndex -or $end.gateway -ne $network.gateway){throw 'Подключение изменилось во время замера. Повтори проверку.'}
  $duration=$clock.Elapsed.TotalSeconds
  Emit @{network=$network;gateway=$(if($gateway){@{address=$gateway;method='icmp';resolutionMs=1;measuredAt=[DateTime]::UtcNow.ToString('o');interfaceIndex=$network.interfaceIndex;samples=@($samples[$gateway])}}else{$null});control=@{address=$control;method='icmp';resolutionMs=1;measuredAt=[DateTime]::UtcNow.ToString('o');interfaceIndex=$network.interfaceIndex;samples=@($samples[$control])};traffic=@{rxMbps=[math]::Round([math]::Max(0,($end.rxBytes-$first.rxBytes)*8/$duration/1e6),3);txMbps=[math]::Round([math]::Max(0,($end.txBytes-$first.txBytes)*8/$duration/1e6),3)};at=[DateTime]::UtcNow.ToString('o')};exit
 }
}catch{Emit @{error=$_.Exception.Message};exit 1}
