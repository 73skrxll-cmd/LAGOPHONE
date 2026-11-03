param([ValidateSet('info','protect','connect','disconnect','watch')][string]$Mode,[string]$LeaseId,[string]$ResponseId,[string]$ProfilePathBase64,[string]$ExpectedSid,[int]$ParentId)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$root=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'GTMPCVPN'
$private=Join-Path $root 'Private';$public=Join-Path $root 'State'
$wireguard=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'WireGuard/wireguard.exe';$wg=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'WireGuard/wg.exe'
$wireguard=[IO.Path]::GetFullPath($wireguard);$wg=[IO.Path]::GetFullPath($wg)
$stage='initialization'
function Json($value){[Console]::WriteLine(($value|ConvertTo-Json -Depth 8 -Compress))}
function AtomicJson($filename,$value){$tmp=$filename+'.'+[Guid]::NewGuid().ToString('N')+'.tmp';try{[IO.File]::WriteAllText($tmp,($value|ConvertTo-Json -Depth 8 -Compress),(New-Object Text.UTF8Encoding($false)));if(Test-Path -LiteralPath $filename){[IO.File]::Replace($tmp,$filename,($tmp+'.bak'));Remove-Item -LiteralPath ($tmp+'.bak') -Force -ErrorAction SilentlyContinue}else{[IO.File]::Move($tmp,$filename)}}finally{Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}}
function Signed($file){if(-not(Test-Path -LiteralPath $file -PathType Leaf)){return $false};$s=Get-AuthenticodeSignature -LiteralPath $file;return $s.Status -eq 'Valid' -and $s.SignerCertificate -and ($s.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -replace ',','').TrimEnd('.') -eq 'WireGuard LLC'}
function Identity {return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
function AssertAdmin {
 if(-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Admin required'}
 if($ExpectedSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$' -or (Identity) -ne $ExpectedSid){throw 'Identity mismatch'}
}
function SecureDirectories {
 foreach($dir in @($root,$private,$public)){
  if(Test-Path -LiteralPath $dir){if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point rejected'}}else{[void](New-Item -ItemType Directory -Path $dir)}
  $acl=New-Object Security.AccessControl.DirectorySecurity;$sddl='D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)';if($dir -eq $public){$sddl+='(A;OICI;GRGX;;;BU)'}
  $acl.SetSecurityDescriptorSddlForm($sddl);Set-Acl -LiteralPath $dir -AclObject $acl
 }
}
function TunnelName([string]$lease){if($lease -notmatch '^[a-f0-9]{32}$'){throw 'Invalid lease'};return 'GTMPC'+$lease.Substring(0,20)}
function ValidateConfig([string]$text){
 if($text.Length -gt 32768){throw 'Invalid configuration'};$section='';$count=@{Interface=0;Peer=0};$values=@{Interface=@{};Peer=@{}}
 foreach($raw in ($text -split "`r?`n")){
  $line=$raw.Trim();if(-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')){continue}
  if($line -in @('[Interface]','[Peer]')){$section=$line.Trim('[',']');$count[$section]++;continue}
  if(-not $section -or $line -notmatch '^([A-Za-z]+)\s*=\s*([^\r\n#;]+)$'){throw 'Invalid configuration'}
  $key=$Matches[1];$value=$Matches[2].Trim();$keys=$(if($section -eq 'Interface'){@('PrivateKey','Address','DNS','MTU')}else{@('PublicKey','PresharedKey','AllowedIPs','Endpoint','PersistentKeepalive')})
  if($key -cnotin $keys -or $values[$section].ContainsKey($key)){throw 'Configuration commands rejected'};$values[$section][$key]=$value
 }
 if($count.Interface -ne 1 -or $count.Peer -ne 1){throw 'One peer required'}
 foreach($key in @($values.Interface.PrivateKey,$values.Peer.PublicKey)){if($key -cnotmatch '^[A-Za-z0-9+/]{43}=$' -or [Convert]::FromBase64String($key).Length -ne 32){throw 'Invalid key'}}
 if($values.Peer.PresharedKey -and ($values.Peer.PresharedKey -cnotmatch '^[A-Za-z0-9+/]{43}=$' -or [Convert]::FromBase64String($values.Peer.PresharedKey).Length -ne 32)){throw 'Invalid key'}
 foreach($cidr in ($values.Interface.Address -split ',')){$parts=$cidr.Trim() -split '/';$ip=$null;if($parts.Count -ne 2 -or -not[Net.IPAddress]::TryParse($parts[0],[ref]$ip) -or $parts[1] -notmatch '^\d+$' -or [int]$parts[1] -gt $(if($ip.AddressFamily -eq 'InterNetwork'){32}else{128})){throw 'Invalid interface'}}
 $dns=@($values.Interface.DNS -split ','|ForEach-Object {$_.Trim()});if(-not $dns.Count){throw 'DNS required'};foreach($server in $dns){$ip=$null;if(-not[Net.IPAddress]::TryParse($server,[ref]$ip)){throw 'Invalid DNS'}}
 $allowed=@($values.Peer.AllowedIPs -split ','|ForEach-Object {$_.Trim()});if($allowed -notcontains '0.0.0.0/0' -or @($allowed|Where-Object {$_ -notin @('0.0.0.0/0','::/0')}).Count){throw 'Full tunnel required'}
 if($values.Peer.Endpoint -notmatch '^(\d+\.\d+\.\d+\.\d+):(\d+)$'){throw 'IPv4 endpoint required'};$endpoint=$Matches[1];$port=[int]$Matches[2];$ip=$null
 if(-not[Net.IPAddress]::TryParse($endpoint,[ref]$ip) -or $ip.AddressFamily -ne 'InterNetwork' -or $port -lt 1 -or $port -gt 65535){throw 'Invalid endpoint'}
 $b=$ip.GetAddressBytes();if($b[0] -in @(0,10,127) -or $b[0] -ge 224 -or ($b[0] -eq 169 -and $b[1] -eq 254) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168)){throw 'Public endpoint required'}
 if($values.Interface.MTU -and ($values.Interface.MTU -notmatch '^\d+$' -or [int]$values.Interface.MTU -lt 1280 -or [int]$values.Interface.MTU -gt 1500)){throw 'Invalid MTU'}
 if($values.Peer.PersistentKeepalive -and ($values.Peer.PersistentKeepalive -notmatch '^\d+$' -or [int]$values.Peer.PersistentKeepalive -gt 65535)){throw 'Invalid keepalive'}
 return @{dns=$dns;fullTunnel=$true;endpoint=$endpoint}
}
function WgCommand($arguments){$out=& $wg @arguments 2>$null;if($LASTEXITCODE -ne 0){throw 'WireGuard IPC failed'};return ($out -join "`n")}
function State([string]$name){
 $service=Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue
 $base=@{at=[DateTime]::UtcNow.ToString('o');serviceRunning=($null -ne $service -and $service.Status -eq 'Running');routeOk=$false;dnsOk=$false;handshakeAgeSec=$null;rxBytes=0;txBytes=0;ipv6Policy='blocked-by-full-tunnel-policy'}
 if(-not $base.serviceRunning){return $base}
 try{
  $owner=Get-Content -LiteralPath (Join-Path $private ($name+'/owner.json')) -Raw|ConvertFrom-Json
  $adapter=Get-NetAdapter -Name $name -IncludeHidden -ErrorAction Stop;$index=[int]$adapter.ifIndex
  $selection=@(Find-NetRoute -RemoteIPAddress '1.1.1.1');$indexes=@($selection|ForEach-Object {$_.InterfaceIndex}|Select-Object -Unique);$base.routeOk=$indexes.Count -eq 1 -and $indexes[0] -eq $index
  $default=@(Get-NetRoute -InterfaceIndex $index -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue);$base.routeOk=$base.routeOk -and $default.Count -gt 0
  $configured=@(Get-DnsClientServerAddress -InterfaceIndex $index|ForEach-Object {$_.ServerAddresses});$base.dnsOk=@($owner.dns|Where-Object {$_ -notin $configured}).Count -eq 0 -and @($owner.dns).Count -gt 0
  $h=(WgCommand @('show',$name,'latest-handshakes')).Trim() -split '\s+';if($h.Count -eq 2 -and [long]$h[1] -gt 0){$base.handshakeAgeSec=[math]::Max(0,[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-[long]$h[1])}
  $transfer=(WgCommand @('show',$name,'transfer')).Trim() -split '\s+';if($transfer.Count -eq 3){$base.rxBytes=[long]$transfer[1];$base.txBytes=[long]$transfer[2]}
  $v6=@(Get-NetRoute -InterfaceIndex $index -AddressFamily IPv6 -DestinationPrefix '::/0' -ErrorAction SilentlyContinue);if($v6.Count){$base.ipv6Policy='routed-through-tunnel'}
 }catch{}
 return $base
}
function Cleanup([string]$name,[string]$lease){
 $dir=Join-Path $private $name;$ownerFile=Join-Path $dir 'owner.json'
 if(-not(Test-Path -LiteralPath $ownerFile)){if(Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue){throw 'Unowned service refused'};return}
 $owner=Get-Content -LiteralPath $ownerFile -Raw|ConvertFrom-Json
 if($owner.leaseId -ne $lease -or $owner.sid -ne (Identity)){throw 'Unowned service refused'}
 if(Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue){$registered=Get-CimInstance Win32_Service -Filter ("Name='WireGuardTunnel$"+$name+"'") -ErrorAction Stop;$expected=Join-Path $dir ($name+'.conf');if($registered.PathName.IndexOf($wireguard,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or $registered.PathName.IndexOf($expected,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'Changed service refused'};$p=Start-Process -FilePath $wireguard -ArgumentList @('/uninstalltunnelservice',$name) -Wait -PassThru -WindowStyle Hidden;if($p.ExitCode -ne 0){throw 'Uninstall failed'}}
 for($i=0;$i -lt 30;$i++){if(-not(Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 300}
 if(Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue){throw 'Service still present'}
 Remove-Item -LiteralPath $dir -Recurse -Force;AtomicJson (Join-Path $public ($name+'.json')) @{at=[DateTime]::UtcNow.ToString('o');serviceRunning=$false;removed=$true;routeOk=$false;dnsOk=$false}
}
function Response($value){if($ResponseId -notmatch '^[a-f0-9]{32}$'){throw 'Invalid response'};AtomicJson (Join-Path $public ($ResponseId+'.json')) $value}
try{
 if($Mode -eq 'info'){Json @{installed=(Test-Path -LiteralPath $wireguard);verified=((Signed $wireguard) -and (Signed $wg));sid=(Identity);stateRoot=$public};exit}
 if($Mode -eq 'protect'){
  Add-Type -AssemblyName System.Security;$inputData=[Console]::In.ReadToEnd()|ConvertFrom-Json;$meta=ValidateConfig ([string]$inputData.config)
  $bytes=[Text.Encoding]::UTF8.GetBytes([string]$inputData.config);try{$cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);Json @{cipher=[Convert]::ToBase64String($cipher)}}finally{[Array]::Clear($bytes,0,$bytes.Length)};exit
 }
 if($Mode -in @('connect','disconnect','watch')){
  $stage='identity';AssertAdmin;$name=TunnelName $LeaseId;$stage='signature';if(-not(Signed $wireguard) -or -not(Signed $wg)){throw 'Signature invalid'}
  $stage='directories';SecureDirectories
 }
 if($Mode -eq 'connect'){
  $stage='profile';$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ProfilePathBase64));if([IO.Path]::GetFileName($source) -ne 'gtm-proton-profile.bin' -or $source.StartsWith('\\')){throw 'Invalid encrypted profile path'}
  Add-Type -AssemblyName System.Security;$cipher=[IO.File]::ReadAllBytes($source);if($cipher.Length -gt 65536){throw 'Invalid encrypted profile'}
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{$config=[Text.Encoding]::UTF8.GetString($bytes);$meta=ValidateConfig $config
   $stage='ownership';$dir=Join-Path $private $name;if(Test-Path -LiteralPath $dir){throw 'Tunnel already exists'};if(Get-Service -Name ('WireGuardTunnel$'+$name) -ErrorAction SilentlyContinue){throw 'Tunnel already exists'}
   $parent=Get-Process -Id $ParentId -ErrorAction Stop
   [void](New-Item -ItemType Directory -Path $dir);$owner=@{leaseId=$LeaseId;sid=(Identity);parentId=$ParentId;parentStart=$parent.StartTime.Ticks;helperId=$PID;helperStart=(Get-Process -Id $PID).StartTime.Ticks;stopFile=(Join-Path ([IO.Path]::GetDirectoryName($source)) ('gtm-proton-stop-'+$LeaseId+'.json'));dns=$meta.dns}
   AtomicJson (Join-Path $dir 'owner.json') $owner
   $conf=Join-Path $dir ($name+'.conf');[IO.File]::WriteAllText($conf,$config,(New-Object Text.UTF8Encoding($false)))
   $stage='watchdog';$watchArgs=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Mode','watch','-LeaseId',$LeaseId,'-ExpectedSid',$ExpectedSid)
   $child=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -ArgumentList $watchArgs -WindowStyle Hidden -PassThru
   if($child.HasExited){throw 'Watchdog failed'}
   $stage='service';if(Test-Path -LiteralPath $owner.stopFile){throw 'Cancelled'};$p=Start-Process -FilePath $wireguard -ArgumentList @('/installtunnelservice',('"'+$conf+'"')) -Wait -PassThru -WindowStyle Hidden
   if($p.ExitCode -ne 0){throw 'Install failed'};Response @{ok=$true;tunnel=$name};exit
  }finally{[Array]::Clear($bytes,0,$bytes.Length);$config=$null}
 }
 if($Mode -eq 'disconnect'){$stage='cleanup';Cleanup $name $LeaseId;Response @{ok=$true;removed=$true};exit}
 if($Mode -eq 'watch'){
  $owner=Get-Content -LiteralPath (Join-Path $private ($name+'/owner.json')) -Raw|ConvertFrom-Json
  if($owner.leaseId -ne $LeaseId -or $owner.sid -ne (Identity)){exit 1};$deadline=[DateTime]::UtcNow.AddHours(12);$started=[DateTime]::UtcNow
  while($true){
   if(-not(Test-Path -LiteralPath (Join-Path $private ($name+'/owner.json')))){exit}
   $parent=Get-Process -Id $owner.parentId -ErrorAction SilentlyContinue
   $helper=Get-Process -Id $owner.helperId -ErrorAction SilentlyContinue;$installing=$helper -and $helper.StartTime.Ticks -eq $owner.helperStart
   $stopRequested=-not $parent -or $parent.StartTime.Ticks -ne $owner.parentStart -or [DateTime]::UtcNow -gt $deadline -or (Test-Path -LiteralPath $owner.stopFile)
   if($stopRequested -and -not $installing){Cleanup $name $LeaseId;exit}
   $state=State $name;AtomicJson (Join-Path $public ($name+'.json')) $state
   if(-not $state.serviceRunning -and -not $installing -and ([DateTime]::UtcNow-$started).TotalSeconds -gt 100){Cleanup $name $LeaseId;exit}
   Start-Sleep -Seconds 3
  }
 }
}catch{
 if($Mode -in @('connect','watch') -and $name){try{Cleanup $name $LeaseId}catch{}}
 $result=@{ok=$false;code=$stage;error=('WireGuard: операция не выполнена ('+$stage+'). Проверь установку компонента и разрешение Windows.')}
 if($ResponseId -match '^[a-f0-9]{32}$' -and (Test-Path -LiteralPath $public)){try{Response $result}catch{}}else{Json $result};exit 1
}
