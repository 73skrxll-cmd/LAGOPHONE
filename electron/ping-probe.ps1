param([ValidateSet('resolve','measure','route')][string]$Mode,[string]$PayloadBase64)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
function Emit($value){[Console]::Out.WriteLine(($value|ConvertTo-Json -Depth 8 -Compress))}
function PublicIPv4([string]$value){
 $ip=$null
 if(-not [Net.IPAddress]::TryParse($value,[ref]$ip) -or $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){return $false}
 $b=$ip.GetAddressBytes()
 if($b[0] -in @(0,10,127) -or $b[0] -ge 224){return $false}
 if($b[0] -eq 100 -and $b[1] -ge 64 -and $b[1] -le 127){return $false}
 if($b[0] -eq 169 -and $b[1] -eq 254){return $false}
 if($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31){return $false}
 if($b[0] -eq 192 -and ($b[1] -eq 168 -or ($b[1] -eq 0 -and $b[2] -in @(0,2)))){return $false}
 if($b[0] -eq 198 -and ($b[1] -in @(18,19) -or ($b[1] -eq 51 -and $b[2] -eq 100))){return $false}
 if($b[0] -eq 203 -and $b[1] -eq 0 -and $b[2] -eq 113){return $false}
 return $true
}
try{
 $inputData=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))|ConvertFrom-Json
 $hosts=@{'fortnite-de'='ping-de.ds.on.epicgames.com';'fortnite-fr'='ping-fr.ds.on.epicgames.com';'fortnite-gb'='ping-gb.ds.on.epicgames.com';'discord-api'='discord.com';'discord-gateway'='gateway.discord.gg';'epic-launcher'='launcher-public-service-prod06.ol.epicgames.com';'epic-download'='download.epicgames.com'}
 $tcpTargets=@('discord-api','discord-gateway','epic-launcher','epic-download')
 if(-not $hosts.ContainsKey([string]$inputData.targetId)){throw 'Unknown target'}
 if($Mode -eq 'resolve'){
  $addresses=@([Net.Dns]::GetHostAddresses($hosts[$inputData.targetId])|Where-Object {PublicIPv4 $_.ToString()}|ForEach-Object {$_.ToString()})
  if($addresses.Count -eq 0){throw 'No public IPv4 address'}
  Emit @{type='resolved';targetId=$inputData.targetId;host=$hosts[$inputData.targetId];address=$addresses[0];resolvedAt=[DateTime]::UtcNow.ToString('o')};exit 0
 }
 if(-not (PublicIPv4 ([string]$inputData.address))){throw 'Invalid public endpoint'}
 if($Mode -eq 'route'){
  $selection=@(Find-NetRoute -RemoteIPAddress ([string]$inputData.address) -ErrorAction Stop)
  $indexes=@($selection|ForEach-Object {$_.InterfaceIndex}|Where-Object {$null -ne $_}|Select-Object -Unique)
  if($indexes.Count -ne 1){throw 'Ambiguous destination route'}
  $adapter=@(Get-NetAdapter -IncludeHidden -ErrorAction Stop|Where-Object {$_.ifIndex -eq $indexes[0]})
  if($adapter.Count -ne 1){throw 'Unknown destination interface'}
  $warp=$adapter[0].Name -eq 'CloudflareWARP' -or $adapter[0].InterfaceDescription -match '^Cloudflare\s?WARP(\sAdapter)?$'
  Emit @{type='route';targetId=$inputData.targetId;address=$inputData.address;viaWarp=[bool]$warp};exit 0
 }
 if(($inputData.count -isnot [int] -and $inputData.count -isnot [long]) -or $inputData.count -lt 1 -or $inputData.count -gt 100){throw 'Invalid sample count'}
 $tcp=$inputData.targetId -in $tcpTargets
 $ping=$(if(-not $tcp){New-Object Net.NetworkInformation.Ping}else{$null})
 $buffer=[Text.Encoding]::ASCII.GetBytes('GTM-PC-latency-measurement-0000000')
 $options=New-Object Net.NetworkInformation.PingOptions(128,$true)
 try{
  for($i=0;$i -lt $inputData.count;$i++){
   $clock=[Diagnostics.Stopwatch]::StartNew();$status='error';$rtt=$null
   try{
    if($tcp){
     $client=New-Object Net.Sockets.TcpClient;$connection=$null
     try{
      $clock.Restart();$connection=$client.BeginConnect([string]$inputData.address,443,$null,$null)
      if($connection.AsyncWaitHandle.WaitOne(1200,$false)){$client.EndConnect($connection);$rtt=[math]::Round($clock.Elapsed.TotalMilliseconds,2);$status='success'}else{$status='timeout'}
     }finally{if($connection){$connection.AsyncWaitHandle.Close()};$client.Close()}
    }else{
     $reply=$ping.Send([string]$inputData.address,1200,$buffer,$options)
     if($reply.Status -eq [Net.NetworkInformation.IPStatus]::Success){$status='success';$rtt=[double]$reply.RoundtripTime}
     elseif($reply.Status -eq [Net.NetworkInformation.IPStatus]::TimedOut){$status='timeout'}
     else{$status='unreachable'}
    }
   }catch{$status='error'}
   Emit @{type='sample';sample=@{sequence=$i;at=[DateTime]::UtcNow.ToString('o');status=$status;rttMs=$rtt}}
   $pause=350-$clock.ElapsedMilliseconds
   if($pause -gt 0 -and $i -lt $inputData.count-1){Start-Sleep -Milliseconds $pause}
  }
 }finally{if($ping){$ping.Dispose()}}
 Emit @{type='complete';count=$inputData.count};exit 0
}catch{
 Emit @{type='error';message=$(if($Mode -eq 'resolve'){'Не удалось определить адрес выбранного сервиса. Проверьте подключение и DNS.'}else{'Не удалось выполнить измерение задержки или проверить маршрут. Повторите попытку.'})};exit 1
}
