param(
  [ValidateSet('apply','restore','inspect')][string]$Mode,
  [string]$PayloadBase64,
  [string]$ResultPath
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$payload=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64)) | ConvertFrom-Json
$sid=[string]$payload.sid
if($sid -notmatch '^S-1-(?:5-21|12-1)-\d+-\d+-\d+-\d+$') { throw 'Invalid user SID' }
$root=Join-Path $env:ProgramData 'LAGOPHONE'
$statePath=Join-Path $root 'optimization-state.json'
$script:report=New-Object System.Collections.ArrayList
$registry=@{
 'game-mode'=@(@{path='Software\Microsoft\GameBar';name='AutoGameModeEnabled';value=1;kind='DWord'})
 'transparency'=@(@{path='Software\Microsoft\Windows\CurrentVersion\Themes\Personalize';name='EnableTransparency';value=0;kind='DWord'})
 'animations'=@(@{path='Control Panel\Desktop\WindowMetrics';name='MinAnimate';value='0';kind='String'})
 'capture'=@(@{path='Software\Microsoft\Windows\CurrentVersion\GameDVR';name='AppCaptureEnabled';value=0;kind='DWord'},@{path='System\GameConfigStore';name='GameDVR_Enabled';value=0;kind='DWord'})
}
$services=@{spooler='Spooler';bluetooth='bthserv';fax='Fax';search='WSearch';maps='MapsBroker';media='WMPNetworkSvc';'remote-registry'='RemoteRegistry';sysmain='SysMain'}
$plans=@{balanced='381b4222-f694-41f0-9685-ff5bb260df2e';high='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';ultimate='e9a42b02-d5df-448d-aa00-03f14749eb61'}
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
  if(Test-Path -LiteralPath $statePath){ [IO.File]::Replace($temp,$statePath,[NullString]::Value) } else { [IO.File]::Move($temp,$statePath) }
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
          if($entry.path -eq "Registry::HKEY_USERS\$sid\$($spec.path)" -and $entry.name -eq $spec.name){$valid=$true}
        }
      } elseif($entry.id -eq 'game-gpu'){
        $valid=($entry.path -eq "Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences" -and [IO.Path]::IsPathRooted($entry.name) -and [IO.Path]::GetExtension($entry.name) -eq '.exe')
      }
      if(!$valid -or $entry.before.kind -notin @('DWord','String','ExpandString','QWord','MultiString','Binary')){throw 'Invalid registry backup entry'}
    } elseif($entry.kind -eq 'service'){
      if(!$services.ContainsKey([string]$entry.id) -or $services[[string]$entry.id] -ne $entry.name -or $entry.before.start -notin @(2,3,4)){throw 'Invalid service backup entry'}
    } elseif($entry.kind -eq 'power'){
      if($entry.id -ne 'power' -or $entry.before -notmatch '^[0-9a-fA-F-]{36}$' -or $entry.after -notin $plans.Values){throw 'Invalid power backup entry'}
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
    if($current -eq $entry.before){return}
    if($current -ne $entry.after){throw 'Power plan changed outside LAGOPHONE'}
    & powercfg.exe /setactive $entry.before | Out-Null
    if($LASTEXITCODE -ne 0 -or (Active-Plan) -ne $entry.before){throw 'Power plan restore failed'}
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
function Inspect {
  $checks=@()
  foreach($id in @('game-mode','transparency')){
    $spec=$registry[$id][0]
    $value=Get-Registry "Registry::HKEY_USERS\$sid\$($spec.path)" $spec.name
    $checks+=@{id=$id;enabled=(($id -eq 'game-mode' -and !$value.exists) -or ($value.exists -and [string]$value.value -eq [string]$spec.value))}
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
  $grouped=@($checks | Group-Object id | ForEach-Object { @{id=$_.Name;enabled=(@($_.Group | Where-Object {!$_.enabled}).Count -eq 0)} })
  return @{ok=$true;needsRecovery=($state -and $state.phase -ne 'applied');checks=@($grouped);active=($null -ne $state);profile=$(if($state){$state.profile}else{$null});remaining=$(if($state){@($state.entries).Count}else{0});created=$(if($state){$state.created}else{$null});power=(Active-Plan)}
}
$mutex=$null;$locked=$false
try {
  if($Mode -eq 'inspect') { $result=Inspect }
  else {
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
      $allowed=@($registry.Keys)+@($services.Keys)+@('power','game-gpu')
      if(!$payload.ids.Count -or @($payload.ids | Where-Object {$_ -notin $allowed}).Count -or @($payload.ids | Select-Object -Unique).Count -ne $payload.ids.Count){throw 'Invalid action list'}
      $entries=New-Object System.Collections.ArrayList
      foreach($id in $payload.ids){
        if($registry.ContainsKey($id) -or $id -eq 'game-gpu'){
          $specs=$registry[$id]
          if($id -eq 'game-gpu'){
            if(!$payload.gamePath -or [IO.Path]::GetExtension($payload.gamePath) -ne '.exe' -or !(Test-Path -LiteralPath $payload.gamePath -PathType Leaf)){throw 'Game executable is unavailable'}
            $gpuPath="Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences"
            $existing=Get-Registry $gpuPath ([string]$payload.gamePath)
            if($existing.exists -and $existing.kind -ne 'String'){Note $id 'skipped' 'Неизвестный формат графических настроек игры.';continue}
            $parts=@(([string]$existing.value -split ';') | Where-Object {$_ -and $_ -notmatch '^GpuPreference='})
            $value='GpuPreference=2;'
            if($parts.Count){$value+=($parts -join ';')+';'}
            $specs=@(@{path='Software\Microsoft\DirectX\UserGpuPreferences';name=[string]$payload.gamePath;value=$value;kind='String'})
          }
          foreach($spec in $specs){
            $path="Registry::HKEY_USERS\$sid\$($spec.path)"
            $before=Get-Registry $path $spec.name
            $after=@{exists=$true;value=$spec.value;kind=$spec.kind}
            if(Same-Registry $before $after){Note $id 'skipped' 'Нужное значение уже установлено.';continue}
            [void]$entries.Add(@{id=$id;kind='registry';path=$path;name=$spec.name;before=$before;after=$after})
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
          if(!$plans.ContainsKey([string]$payload.power)){throw 'Invalid power plan'}
          $available=(& powercfg.exe /list) -join ''
          if($LASTEXITCODE -ne 0){throw 'Cannot enumerate power plans'}
          $target=$plans[[string]$payload.power]
          if($available -notmatch [regex]::Escape($target)){Note $id 'skipped' 'Выбранный план недоступен на этом ПК. План не создавался.';continue}
          $before=Active-Plan
          if($before -eq $target){Note $id 'skipped' 'Этот план уже активен.';continue}
          [void]$entries.Add(@{id=$id;kind='power';before=$before;after=$target})
        }
      }
      if(!$entries.Count){$result=@{ok=$true;report=@($script:report);noChanges=$true}}
      else {
        $state=@{schema=1;phase='pending';sid=$sid;profile=$payload.profile;created=(Get-Date).ToUniversalTime().ToString('o');entries=@($entries)}
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
              & powercfg.exe /setactive $entry.after | Out-Null
              if($LASTEXITCODE -ne 0 -or (Active-Plan) -ne $entry.after){throw 'Power plan verification failed'}
            }
            Note $entry.id 'applied' 'Применено, проверено. Исходное состояние сохранено.'
          }
          $state.phase='applied'; Save-State $state
          $result=@{ok=$true;report=@($script:report)}
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
