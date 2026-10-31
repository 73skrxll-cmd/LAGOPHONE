param(
  [ValidateSet('apply','restore','inspect')][string]$Mode,
  [string]$PayloadBase64,
  [string]$ResultPath
)
$ErrorActionPreference='Stop'
# An elevated process or a direct caller may also inherit PowerShell 7's environment.
# Restrict module loading to the native Windows PowerShell paths before importing anything.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')+[IO.Path]::PathSeparator+[IO.Path]::Combine($env:ProgramFiles,'WindowsPowerShell','Modules')
[Environment]::SetEnvironmentVariable('PSModuleAnalysisCachePath',$null,'Process')
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$payload=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64)) | ConvertFrom-Json
$sid=[string]$payload.sid
if($sid -notmatch '^S-1-(?:5-21|12-1)-\d+-\d+-\d+-\d+$') { throw 'Invalid user SID' }
$root=Join-Path $env:ProgramData 'LAGOPHONE'
$statePath=Join-Path $root 'optimization-state.json'
$script:report=New-Object System.Collections.ArrayList
function Load-RegistryCatalog($file) {
  $data=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $map=@{}
  foreach($property in $data.PSObject.Properties){$map[$property.Name]=@($property.Value)}
  return $map
}
$registry=Load-RegistryCatalog (Join-Path $PSScriptRoot 'registry-specs.json')
$services=@{spooler='Spooler';bluetooth='bthserv';fax='Fax';search='WSearch';maps='MapsBroker';media='WMPNetworkSvc';'remote-registry'='RemoteRegistry';sysmain='SysMain'}
$plans=@{balanced='381b4222-f694-41f0-9685-ff5bb260df2e';high='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';ultimate='e9a42b02-d5df-448d-aa00-03f14749eb61'}
$managedPlan='b9e86298-7324-4f93-9066-faf25aa1c0a3'
function Resolve-RegistryPath($spec) {
  if($spec.hive -eq 'machine'){return "Registry::HKEY_LOCAL_MACHINE\$($spec.path)"}
  return "Registry::HKEY_USERS\$sid\$($spec.path)"
}
function Power-Exists($guid) {
  $list=(& powercfg.exe /list) -join ''
  if($LASTEXITCODE -ne 0){throw 'Cannot enumerate power plans'}
  return ($list -match [regex]::Escape($guid))
}
function Protect-StateFile($file) {
  $security=[Security.AccessControl.FileSecurity]::new()
  $security.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
  $security.SetAccessRuleProtection($true,$false)
  foreach($principal in @('S-1-5-18','S-1-5-32-544','S-1-5-32-545')){
    $rights=if($principal -eq 'S-1-5-32-545'){'Read'}else{'FullControl'}
    $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($principal),$rights,'Allow'))
  }
  Set-Acl -LiteralPath $file -AclObject $security
}
function Note($id,$status,$message) { [void]$script:report.Add(@{id=$id;status=$status;message=$message}) }
function Get-Registry($path,$name) {
  $key=Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  if($key -and $key.GetValueNames() -contains $name) { return @{exists=$true;value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);kind=[string]$key.GetValueKind($name)} }
  return @{exists=$false;value=$null;kind='DWord'}
}
function Equal-Value($a,$b) { return (($a | ConvertTo-Json -Compress -Depth 8) -ceq ($b | ConvertTo-Json -Compress -Depth 8)) }
function Same-Registry($a,$b) { return ($a.exists -eq $b.exists -and (!$a.exists -or ($a.kind -eq $b.kind -and (Equal-Value $a.value $b.value)))) }
function Write-Registry($path,$name,$value) {
  if($value.exists) {
    if(!(Test-Path -LiteralPath $path)){ New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -Value $value.value -PropertyType $value.kind -Force | Out-Null
  } else { Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue }
}
function Active-Plan {
  $text=& powercfg.exe /getactivescheme
  if($LASTEXITCODE -ne 0){throw 'Cannot read active power plan'}
  $match=[regex]::Match(($text -join ''),'[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}')
  if(!$match.Success){throw 'Cannot parse active power plan'}
  return $match.Value.ToLowerInvariant()
}
function Service-State($name) {
  $service=Get-Service -Name $name -ErrorAction SilentlyContinue
  if(!$service){return $null}
  $path="Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\$name"
  return @{start=[int](Get-ItemPropertyValue -LiteralPath $path -Name Start);running=($service.Status -eq 'Running');delayed=(Get-Registry $path 'DelayedAutoStart')}
}
function Save-State($state) {
  $temp=Join-Path $root ([guid]::NewGuid().ToString()+'.tmp')
  [IO.File]::WriteAllText($temp,($state | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
  Protect-StateFile $temp
  if(Test-Path -LiteralPath $statePath){ [IO.File]::Replace($temp,$statePath,[NullString]::Value) } else { [IO.File]::Move($temp,$statePath) }
  Protect-StateFile $statePath
}
function Read-State {
  if(!(Test-Path -LiteralPath $statePath)){return $null}
  $state=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if($state.schema -ne 1 -or $state.sid -ne $sid){throw 'Backup belongs to another user or has an unsupported format'}
  foreach($entry in @($state.entries)){
    if($entry.kind -eq 'registry'){
      $valid=$false
      if($registry.ContainsKey([string]$entry.id)){
        foreach($spec in $registry[[string]$entry.id]){
          if($entry.path -eq (Resolve-RegistryPath $spec) -and $entry.name -eq $spec.name){$valid=$true}
        }
      } elseif($entry.id -in @('game-gpu','game-fullscreen')){
        $expected=if($entry.id -eq 'game-gpu'){"Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences"}else{"Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"}
        $valid=($entry.path -eq $expected -and [IO.Path]::IsPathRooted($entry.name) -and [IO.Path]::GetExtension($entry.name) -eq '.exe')
      }
      if(!$valid -or $entry.before.kind -notin @('DWord','String','ExpandString','QWord','MultiString','Binary')){throw 'Invalid registry backup entry'}
    } elseif($entry.kind -eq 'service'){
      if(!$services.ContainsKey([string]$entry.id) -or $services[[string]$entry.id] -ne $entry.name -or $entry.before.start -notin @(2,3,4)){throw 'Invalid service backup entry'}
    } elseif($entry.kind -eq 'power'){
      if($entry.id -ne 'power' -or $entry.before -notmatch '^[0-9a-fA-F-]{36}$' -or ($entry.after -notin $plans.Values -and !($entry.managed -eq $true -and $entry.after -eq $managedPlan))){throw 'Invalid power backup entry'}
    } else {throw 'Invalid backup kind'}
  }
  return $state
}
function Restore-Entry($entry) {
  if($entry.kind -eq 'registry') {
    $current=Get-Registry $entry.path $entry.name
    if(Same-Registry $current $entry.before){return}
    if(!(Same-Registry $current $entry.after)){throw 'Setting changed outside LAGOPHONE; retained for manual review'}
    Write-Registry $entry.path $entry.name $entry.before
    if(!(Same-Registry (Get-Registry $entry.path $entry.name) $entry.before)){throw 'Registry restore verification failed'}
  } elseif($entry.kind -eq 'service') {
    $current=Service-State $entry.name
    if(!$current){throw 'Service no longer exists'}
    # Allow retry after restoring the startup mode but failing to restart the service.
    if($current.start -ne 4 -and $current.start -ne $entry.before.start){throw 'Service startup changed outside LAGOPHONE'}
    $startup=@{2='Automatic';3='Manual';4='Disabled'}[[int]$entry.before.start]
    if(!$startup){throw 'Unsupported original service startup mode'}
    Set-Service -Name $entry.name -StartupType $startup
    Write-Registry "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\$($entry.name)" 'DelayedAutoStart' $entry.before.delayed
    $service=Get-Service -Name $entry.name
    if($entry.before.running -and $service.Status -ne 'Running'){Start-Service -Name $entry.name; (Get-Service $entry.name).WaitForStatus('Running',[TimeSpan]::FromSeconds(15))}
    if(!$entry.before.running -and $service.Status -ne 'Stopped'){Stop-Service -Name $entry.name; (Get-Service $entry.name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(15))}
    $verified=Service-State $entry.name
    if($verified.start -ne $entry.before.start -or $verified.running -ne $entry.before.running -or !(Same-Registry $verified.delayed $entry.before.delayed)){throw 'Service restore verification failed'}
  } elseif($entry.kind -eq 'power') {
    $current=Active-Plan
    if($current -ne $entry.before){
      if($current -ne $entry.after){throw 'Power plan changed outside LAGOPHONE'}
      & powercfg.exe /setactive $entry.before | Out-Null
      if($LASTEXITCODE -ne 0 -or (Active-Plan) -ne $entry.before){throw 'Power plan restore failed'}
    }
    if($entry.managed -eq $true -and $entry.after -eq $managedPlan -and (Power-Exists $entry.after)){
      & powercfg.exe /delete $entry.after | Out-Null
      if($LASTEXITCODE -ne 0 -or (Power-Exists $entry.after)){throw 'Cannot remove the plan created by LAGOPHONE'}
    }
  } else {throw 'Unknown backup entry'}
}
function Restore-State($state) {
  $remaining=New-Object System.Collections.ArrayList
  $items=@($state.entries)
  [array]::Reverse($items)
  foreach($entry in $items){
    try {Restore-Entry $entry; Note $entry.id 'restored' 'Исходное значение восстановлено и проверено.'}
    catch {[void]$remaining.Add($entry); Note $entry.id 'error' $_.Exception.Message}
  }
  if($remaining.Count){$state.entries=@($remaining); if($state -is [Collections.IDictionary]){$state['phase']='recovery'}elseif($state.PSObject.Properties['phase']){$state.phase='recovery'}else{$state | Add-Member -NotePropertyName phase -NotePropertyValue 'recovery'}; Save-State $state; return $false}
  Remove-Item -LiteralPath $statePath -Force
  return $true
}
function Registry-Compatible($id,$build) {
  return @($registry[$id] | Where-Object {(!$_.minBuild -or $build -ge $_.minBuild) -and (!$_.maxBuild -or $build -le $_.maxBuild)}).Count -gt 0
}
function Optimization-Audit($build) {
  $rows=@()
  foreach($id in @($registry.Keys | Where-Object {$registry[$_][0].audit} | Sort-Object)){
    $supported=@();$enabled=$true
    foreach($spec in $registry[$id]){
      if(($spec.minBuild -and $build -lt $spec.minBuild) -or ($spec.maxBuild -and $build -gt $spec.maxBuild)){continue}
      $actual=Get-Registry (Resolve-RegistryPath $spec) $spec.name
      if($spec.requireExisting -and !$actual.exists){continue}
      $supported+=,$spec
      $expected=@{exists=(!$spec.afterAbsent);value=$spec.value;kind=$spec.kind}
      $matchesTarget=Same-Registry $actual $expected
      if($id -eq 'game-mode' -and !$actual.exists){$matchesTarget=$true}
      if(!$matchesTarget){$enabled=$false}
    }
    $available=$supported.Count -gt 0
    $rows+=@{id=$id;available=$available;enabled=$(if($available){[bool]$enabled}else{$null});reason=$(if(!$available){'Не поддерживается этой сборкой Windows.'}else{$null})}
  }
  return @{basis='baseline-v1';checks=@($rows);checkedAt=[DateTime]::UtcNow.ToString('o')}
}
# Re-read the applied plan, including unchanged targets omitted from the rollback entries.
# Personal features protected by the user's answers are absent from this plan.
function Profile-Audit($build,$state) {
  if(!$state -or $state.phase -ne 'applied' -or !$state.ratingPlan -or $state.ratingPlan.basis -ne 'profiles-v2'){return $null}
  $rows=@()
  foreach($id in @($state.ratingPlan.ids)){
    if($registry.ContainsKey($id)){
      $tier=$registry[$id][0].tier
      if($tier -notin @(1,2)){continue}
      $supported=@($registry[$id] | Where-Object {(!$_.minBuild -or $build -ge $_.minBuild) -and (!$_.maxBuild -or $build -le $_.maxBuild)})
      $enabled=$true;$available=$supported.Count -gt 0
      foreach($spec in $supported){
        $actual=Get-Registry (Resolve-RegistryPath $spec) $spec.name
        if($spec.requireExisting -and !$actual.exists){$available=$false;continue}
        if(!(Same-Registry $actual @{exists=(!$spec.afterAbsent);value=$spec.value;kind=$spec.kind})){$enabled=$false}
      }
    } elseif($services.ContainsKey($id)) {
      $tier=if($id -in @('search','maps','media','remote-registry','sysmain')){2}else{1}
      $service=Service-State $services[$id];$available=$null -ne $service
      $enabled=$available -and $service.start -eq 4 -and !$service.running
    } else {continue}
    $rows+=@{id=$id;tier=$tier;available=[bool]$available;enabled=$(if($available){[bool]$enabled}else{$null})}
  }
  # An actual EXE and verified GPU preference are required; selecting a game name earns nothing.
  $game=$state.ratingPlan.gamePath
  if($game){
    $value=Get-Registry "Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences" $game
    $enabled=($build -ge 17134) -and (Test-Path -LiteralPath $game -PathType Leaf) -and $value.exists -and $value.kind -eq 'String' -and [string]$value.value -match '(^|;)GpuPreference=2(;|$)'
    $rows+=@{id='game-gpu';tier=3;available=$true;enabled=[bool]$enabled}
  }
  return @{basis='profiles-v2';profile=$state.profile;expectedIds=@($rows | ForEach-Object {$_.id});checks=@($rows)}
}
function Inspect {
  $build=[int](Get-CimInstance Win32_OperatingSystem).BuildNumber
  $availability=@{}
  foreach($id in $registry.Keys){
    $available=$false
    foreach($spec in $registry[$id]){
      if(($spec.minBuild -and $build -lt $spec.minBuild) -or ($spec.maxBuild -and $build -gt $spec.maxBuild)){continue}
      if($spec.requireExisting -and !(Get-Registry (Resolve-RegistryPath $spec) $spec.name).exists){continue}
      $available=$true
    }
    $availability[$id]=@{available=$available;reason=$(if(!$available){'Не поддерживается сборкой Windows или нужная настройка отсутствует.'}else{$null})}
  }
  foreach($id in $services.Keys){
    $service=Get-Service -Name $services[$id] -ErrorAction SilentlyContinue
    $availability[$id]=@{available=($null -ne $service);reason=$(if(!$service){'Служба отсутствует на этом ПК.'}else{$null})}
  }
  $checks=@()
  foreach($id in @('game-mode','transparency')){
    $spec=$registry[$id][0]
    $value=Get-Registry "Registry::HKEY_USERS\$sid\$($spec.path)" $spec.name
    $checks+=@{id=$id;enabled=(($id -eq 'game-mode' -and !$value.exists) -or ($value.exists -and [string]$value.value -eq [string]$spec.value))}
  }
  # Read every compatible registry action, not only the two old summary checks.
  foreach($id in $registry.Keys){
    if($registry[$id][0].legacy){continue}
    $supported=@($registry[$id] | Where-Object {(!$_.minBuild -or $build -ge $_.minBuild) -and (!$_.maxBuild -or $build -le $_.maxBuild)})
    if(!$supported.Count){continue}
    $enabled=$true
    foreach($spec in $supported){
      $actualValue=Get-Registry (Resolve-RegistryPath $spec) $spec.name
      if($id -eq 'game-mode' -and !$actualValue.exists){continue}
      if(!(Same-Registry $actualValue @{exists=(!$spec.afterAbsent);value=$spec.value;kind=$spec.kind})){$enabled=$false}
    }
    $checks+=@{id=$id;enabled=[bool]$enabled}
  }
  foreach($id in $services.Keys){
    $service=Service-State $services[$id]
    $checks+=@{id=$id;enabled=[bool]($service -and $service.start -eq 4 -and !$service.running)}
  }
  $state=Read-State
  if($state){
    foreach($entry in @($state.entries)){
      $enabled=$false
      if($entry.kind -eq 'registry'){ $enabled=Same-Registry (Get-Registry $entry.path $entry.name) $entry.after }
      elseif($entry.kind -eq 'service'){ $service=Service-State $entry.name; $enabled=($service -and $service.start -eq 4 -and !$service.running) }
      elseif($entry.kind -eq 'power'){ $enabled=((Active-Plan) -eq $entry.after) }
      $checks+=@{id=$entry.id;enabled=[bool]$enabled}
    }
  }
  # Windows PowerShell 5.1 does not group hashtable keys as object properties.
  # Aggregate explicitly so IDs and false results survive on both PS 5.1 and 7.
  $byId=@{}
  foreach($check in $checks){
    $checkId=[string]$check.id
    if(!$byId.ContainsKey($checkId)){$byId[$checkId]=$true}
    if(!$check.enabled){$byId[$checkId]=$false}
  }
  $grouped=@(foreach($checkId in $byId.Keys){@{id=$checkId;enabled=[bool]$byId[$checkId]}})
  return @{ok=$true;windows=@{version=$(if($build -ge 22000){'11'}else{'10'});build=$build};audit=(Optimization-Audit $build);profileAudit=(Profile-Audit $build $state);availability=$availability;needsRecovery=($state -and $state.phase -ne 'applied');checks=@($grouped);active=($null -ne $state);profile=$(if($state){$state.profile}else{$null});remaining=$(if($state){@($state.entries).Count}else{0});created=$(if($state){$state.created}else{$null});power=(Active-Plan)}
}
$mutex=$null;$locked=$false
try {
  if($Mode -eq 'inspect') { $result=Inspect }
  else {
    Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=[Security.Principal.WindowsPrincipal]::new($identity)
    if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator permission is required'}
    $mutex=[Threading.Mutex]::new($false,'Global\LAGOPHONE.Optimization')
    try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true}
    if(!$locked){throw 'Another optimization is running'}
    if(!(Test-Path -LiteralPath $root)){New-Item -ItemType Directory -Path $root | Out-Null}
    if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup directory must not be a reparse point'}
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
    $acl.SetAccessRuleProtection($true,$false)
    foreach($principal in @('S-1-5-18','S-1-5-32-544','S-1-5-32-545')){
      $rights=if($principal -eq 'S-1-5-32-545'){'ReadAndExecute'}else{'FullControl'}
      $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($principal),$rights,'ContainerInherit,ObjectInherit','None','Allow')
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $root -AclObject $acl
    if($Mode -eq 'restore') {
      $state=Read-State
      if(!$state){throw 'No active backup to restore'}
      $ok=Restore-State $state
      $result=@{ok=$ok;restored=$ok;report=@($script:report)}
    } else {
      if(Read-State){throw 'Restore the existing optimization before applying a new profile'}
      $build=[int](Get-CimInstance Win32_OperatingSystem).BuildNumber
      $actual=if($build -ge 22000){'11'}else{'10'}
      if($actual -ne $payload.version){throw 'Selected Windows does not match this computer'}
      $allowed=@($registry.Keys | Where-Object {!$registry[$_][0].legacy -and (Registry-Compatible $_ $build)})+@($services.Keys)+@('power')
      if($build -ge 17134){$allowed+=,'game-gpu'}
      if($build -ge 15063){$allowed+=,'game-fullscreen'}
      if(!$payload.ids.Count -or @($payload.ids | Where-Object {$_ -notin $allowed}).Count -or @($payload.ids | Select-Object -Unique).Count -ne $payload.ids.Count){throw 'Invalid action list'}
      $entries=New-Object System.Collections.ArrayList
      foreach($id in $payload.ids){
        if($registry.ContainsKey($id) -or $id -in @('game-gpu','game-fullscreen')){
          $specs=$registry[$id]
          if($id -eq 'game-fullscreen'){
            if(!$payload.gamePath -or [IO.Path]::GetExtension($payload.gamePath) -ne '.exe' -or !(Test-Path -LiteralPath $payload.gamePath -PathType Leaf)){throw 'Game executable is unavailable'}
            $layerPath="Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
            $existing=Get-Registry $layerPath ([string]$payload.gamePath)
            if($existing.exists -and $existing.kind -notin @('String','ExpandString')){Note $id 'skipped' 'Неизвестный формат параметров совместимости игры.';continue}
            $value=[string]$existing.value
            if(!$value){$value='~ DISABLEDXMAXIMIZEDWINDOWEDMODE'}elseif($value -notmatch '(?i)(^|\s)DISABLEDXMAXIMIZEDWINDOWEDMODE(\s|$)'){$value=$value.TrimEnd()+' DISABLEDXMAXIMIZEDWINDOWEDMODE'}
            $kind=if($existing.exists){$existing.kind}else{'String'}
            $specs=@(@{path='Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers';name=[string]$payload.gamePath;value=$value;kind=$kind;minBuild=15063;restart=$true})
          }
          if($id -eq 'game-gpu'){
            if(!$payload.gamePath -or [IO.Path]::GetExtension($payload.gamePath) -ne '.exe' -or !(Test-Path -LiteralPath $payload.gamePath -PathType Leaf)){throw 'Game executable is unavailable'}
            $gpuPath="Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences"
            $existing=Get-Registry $gpuPath ([string]$payload.gamePath)
            if($existing.exists -and $existing.kind -ne 'String'){Note $id 'skipped' 'Неизвестный формат графических настроек игры.';continue}
            $parts=@(([string]$existing.value -split ';') | Where-Object {$_ -and $_ -notmatch '^GpuPreference='})
            $value='GpuPreference=2;'
            if($parts.Count){$value+=($parts -join ';')+';'}
            $specs=@(@{path='Software\Microsoft\DirectX\UserGpuPreferences';name=[string]$payload.gamePath;value=$value;kind='String';minBuild=17134})
          }
          foreach($spec in $specs){
            $path=Resolve-RegistryPath $spec
            if(($spec.minBuild -and $build -lt $spec.minBuild) -or ($spec.maxBuild -and $build -gt $spec.maxBuild)){Note $id 'skipped' 'Настройка не поддерживается этой сборкой Windows.';continue}
            $before=Get-Registry $path $spec.name
            $after=@{exists=(!$spec.afterAbsent);value=$spec.value;kind=$spec.kind}
            if($spec.requireExisting -and !$before.exists){Note $id 'skipped' 'Настройка отсутствует на этом ПК; не создавалась принудительно.';continue}
            if(Same-Registry $before $after){Note $id 'skipped' 'Нужное значение уже установлено.';continue}
            [void]$entries.Add(@{id=$id;kind='registry';path=$path;name=$spec.name;before=$before;after=$after;restart=[bool]$spec.restart})
          }
        } elseif($services.ContainsKey($id)) {
          $name=$services[$id];$service=Get-Service -Name $name -ErrorAction SilentlyContinue
          if(!$service){Note $id 'skipped' 'Служба отсутствует.';continue}
          if(@($service.DependentServices | Where-Object Status -ne 'Stopped').Count){Note $id 'skipped' 'Есть активные зависимые службы. Каскадное отключение запрещено.';continue}
          if($service.Status -eq 'Running' -and !$service.CanStop){Note $id 'skipped' 'Служба не принимает команду остановки.';continue}
          if($service.Status -notin @('Running','Stopped')){Note $id 'skipped' 'Служба меняет состояние или приостановлена.';continue}
          $before=Service-State $name
          if($before.start -notin @(2,3,4)){Note $id 'skipped' 'Системный тип запуска не изменяется.';continue}
          if($before.start -eq 4 -and !$before.running){Note $id 'skipped' 'Служба уже отключена.';continue}
          [void]$entries.Add(@{id=$id;kind='service';name=$name;before=$before})
        } elseif($id -eq 'power') {
          if($payload.power -ne 'lagophone' -and !$plans.ContainsKey([string]$payload.power)){throw 'Invalid power plan'}
          $available=(& powercfg.exe /list) -join ''
          if($LASTEXITCODE -ne 0){throw 'Cannot enumerate power plans'}
          if($payload.power -eq 'lagophone'){
            if($available -match [regex]::Escape($managedPlan)){Note $id 'skipped' 'План LAGOPHONE уже существует; не перезаписывался.';continue}
            [void]$entries.Add(@{id=$id;kind='power';before=(Active-Plan);after=$managedPlan;managed=$true})
            continue
          }
          $target=$plans[[string]$payload.power]
          if($available -notmatch [regex]::Escape($target)){Note $id 'skipped' 'Выбранный план недоступен на этом ПК. План не создавался.';continue}
          $before=Active-Plan
          if($before -eq $target){Note $id 'skipped' 'Этот план уже активен.';continue}
          [void]$entries.Add(@{id=$id;kind='power';before=$before;after=$target})
        }
      }
      if(!$entries.Count -and !$payload.ratingPlan){$result=@{ok=$true;report=@($script:report);noChanges=$true}}
      else {
        $state=@{schema=1;phase='pending';sid=$sid;profile=$payload.profile;created=(Get-Date).ToUniversalTime().ToString('o');entries=@($entries)}
        if($payload.ratingPlan -and $payload.ratingPlan.basis -eq 'profiles-v2'){
          $state.ratingPlan=@{basis='profiles-v2';ids=@($payload.ratingPlan.ids);gamePath=$(if($payload.ids -contains 'game-gpu'){$payload.gamePath}else{$null})}
        }
        # Persist all original values before the first write. This journal also survives termination.
        Save-State $state
        try {
          foreach($entry in $entries){
            if($entry.kind -eq 'registry'){
              Write-Registry $entry.path $entry.name $entry.after
              if(!(Same-Registry (Get-Registry $entry.path $entry.name) $entry.after)){throw 'Registry verification failed'}
            } elseif($entry.kind -eq 'service'){
              Set-Service -Name $entry.name -StartupType Disabled
              $service=Get-Service -Name $entry.name
              if($service.Status -ne 'Stopped'){Stop-Service -Name $entry.name; (Get-Service $entry.name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(15))}
              $verified=Service-State $entry.name
              if($verified.start -ne 4 -or $verified.running){throw 'Service verification failed'}
            } else {
              if($entry.managed -eq $true){
                & powercfg.exe /duplicatescheme $entry.before $entry.after | Out-Null
                if($LASTEXITCODE -ne 0){throw 'This PC cannot create the LAGOPHONE plan. Select an existing plan instead.'}
                & powercfg.exe /changename $entry.after 'LAGOPHONE Performance' | Out-Null
                if($LASTEXITCODE -ne 0){throw 'Cannot name the LAGOPHONE plan'}
                $settings=@(
                  @{sub='54533251-82be-4824-96c1-47b60b740d00';setting='893dee8e-2bef-41e0-89c6-b55d0929964c';value=100},
                  @{sub='54533251-82be-4824-96c1-47b60b740d00';setting='bc5038f7-23e0-4960-96da-33abaf5935ec';value=100},
                  @{sub='54533251-82be-4824-96c1-47b60b740d00';setting='be337238-0d82-4146-a960-4f3749d470c7';value=2},
                  @{sub='501a4d13-42af-4429-9fd1-a8218c268e20';setting='ee12f906-d277-404b-b6da-e5fa1a576df5';value=0}
                )
                foreach($setting in $settings){
                  & powercfg.exe /setacvalueindex $entry.after $setting.sub $setting.setting $setting.value | Out-Null
                  if($LASTEXITCODE -ne 0){throw 'A requested AC power setting is unavailable on this PC'}
                  $key="Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$($entry.after)\$($setting.sub)\$($setting.setting)"
                  if([int](Get-ItemPropertyValue -LiteralPath $key -Name ACSettingIndex) -ne $setting.value){throw 'Power setting verification failed'}
                }
              }
              & powercfg.exe /setactive $entry.after | Out-Null
              if($LASTEXITCODE -ne 0 -or (Active-Plan) -ne $entry.after){throw 'Power plan verification failed'}
            }
            Note $entry.id 'applied' $(if($entry.restart){'Значение записано и проверено. Для вступления в силу нужен повторный вход, перезапуск игры или перезагрузка.'}else{'Применено, проверено. Исходное состояние сохранено.'})
          }
          $state.phase='applied'; Save-State $state
          $result=@{ok=$true;report=@($script:report);noChanges=($entries.Count -eq 0)}
        } catch {
          $failure=$_.Exception.Message
          $restored=Restore-State $state
          $result=@{ok=$false;restored=$restored;error=$failure;report=@($script:report)}
        }
      }
    }
  }
} catch { $result=@{ok=$false;error=$_.Exception.Message;report=@($script:report)} }
finally {if($locked){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
$json=$result | ConvertTo-Json -Depth 20 -Compress
if($ResultPath){[IO.File]::WriteAllText($ResultPath,$json,[Text.UTF8Encoding]::new($false))}else{Write-Output $json}
