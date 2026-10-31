$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'optimizer.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
# Import actual production definitions, but never execute the Windows mutation entrypoint.
foreach($node in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $node.Extent.Text}
$script:FixtureRoot=$PSScriptRoot
foreach($node in $ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -in @('$registry','$services','$plans','$managedPlan')},$false)){Invoke-Expression ($node.Extent.Text.Replace('$PSScriptRoot','$script:FixtureRoot'))}
$sid='S-1-5-21-1-2-3-1000'
$root=Join-Path ([IO.Path]::GetTempPath()) ('lagophone-test-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $root | Out-Null
$statePath=Join-Path $root 'optimization-state.json'
$script:values=@{};$script:fakeServices=@{};$script:report=New-Object Collections.ArrayList
function Protect-StateFile($file) {}
function Assert($condition,$message){if(!$condition){throw $message}}
# Replace only provider boundaries; all journal validation and restore logic above is production code.
function Get-Registry($path,$name){$key=$path+'|'+$name;if($script:values.ContainsKey($key)){return $script:values[$key]};return @{exists=$false;value=$null;kind='DWord'}}
function Write-Registry($path,$name,$value){
 if($script:failName -and $script:failName -eq $name){$script:failName=$null;throw 'Injected provider write failure'}
 if($path -match 'Services\\([^\\]+)$' -and $name -eq 'DelayedAutoStart'){$script:fakeServices[$Matches[1]].delayed=$value;return}
 $key=$path+'|'+$name;if($value.exists){$script:values[$key]=$value}else{$script:values.Remove($key)}
}
function Service-State($name){return $script:fakeServices[$name]}
function Set-Service($Name,$StartupType){$script:fakeServices[$Name].start=@{Automatic=2;Manual=3;Disabled=4}[$StartupType]}
function Start-Service($Name){$script:fakeServices[$Name].running=$true}
function Stop-Service($Name){$script:fakeServices[$Name].running=$false}
function Get-Service($Name){
 $service=[pscustomobject]@{Status=$(if($script:fakeServices[$Name].running){'Running'}else{'Stopped'})}
 $service | Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value {param($status,$timeout) if($this.Status -ne $status){throw 'Mock did not reach expected state'}}
 return $service
}
$script:active='381b4222-f694-41f0-9685-ff5bb260df2e'
function Active-Plan{return $script:active}
$script:existingPlans=@{'381b4222-f694-41f0-9685-ff5bb260df2e'=$true;'8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'=$true}
$script:acValues=@{}
function powercfg.exe {
 param($op,$guid,$arg2,$arg3,$arg4)
 $global:LASTEXITCODE=0
 switch($op){
  '/setactive' {$script:active=$guid}
  '/list' {$script:existingPlans.Keys | ForEach-Object {Write-Output $_}}
  '/duplicatescheme' {$script:existingPlans[$arg2]=$true}
  '/changename' {}
  '/setacvalueindex' {if($script:failPowerSetting){$global:LASTEXITCODE=1}else{$script:acValues[($guid+'|'+$arg2+'|'+$arg3)]=[int]$arg4}}
  '/delete' {$script:existingPlans.Remove($guid)}
  default {throw 'Unexpected power operation: '+$op}
 }
}
function Get-ItemPropertyValue($LiteralPath,$Name){
 if($Name -ne 'ACSettingIndex'){throw 'Unexpected registry query'}
 $parts=$LiteralPath -split '\\'
 return $script:acValues[($parts[-3]+'|'+$parts[-2]+'|'+$parts[-1])]
}
try {
 $path="Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
 $absent=@{exists=$false;value=$null;kind='DWord'};$on=@{exists=$true;value=1;kind='DWord'};$off=@{exists=$true;value=0;kind='DWord'}
 $entry=@{id='transparency';kind='registry';path=$path;name='EnableTransparency';before=$absent;after=$off}
 Write-Registry $path 'EnableTransparency' $off
 Restore-Entry $entry
 Assert (!(Get-Registry $path 'EnableTransparency').exists) 'Undo must delete originally absent values'
 $entry.before=$on;Write-Registry $path 'EnableTransparency' $on
 Restore-Entry $entry
 Assert (Same-Registry (Get-Registry $path 'EnableTransparency') $on) 'Untouched entries from an interrupted apply must be no-op restores'
 $external=@{exists=$true;value=2;kind='DWord'}
 Write-Registry $path 'EnableTransparency' $external
 $failed=$false;try{Restore-Entry $entry}catch{$failed=$true}
 Assert $failed 'Conflicting external values must not be overwritten'
 Assert (Same-Registry (Get-Registry $path 'EnableTransparency') $external) 'External value must be preserved'
 $state=@{schema=1;sid=$sid;profile='basic';created='fixture';entries=@($entry)}
 Save-State $state
 $state=Read-State
 Assert ($state.entries.Count -eq 1) 'Journal must roundtrip all entries'
 $restored=Restore-State $state
 Assert (!$restored) 'A conflicting value must report incomplete restore'
 Assert (Test-Path -LiteralPath $statePath) 'Incomplete rollback must retain its journal'
 Assert ((Read-State).entries.Count -eq 1) 'Retry journal must retain only unresolved entries'
 Write-Registry $path 'EnableTransparency' $off
 Assert (Restore-State (Read-State)) 'Retry should restore after conflict is resolved'
 Assert (!(Test-Path -LiteralPath $statePath)) 'Successful rollback should clear active journal'
 Assert (Same-Registry (Get-Registry $path 'EnableTransparency') $on) 'Rollback must restore the original numeric type and value'
 $entry.path='Registry::HKEY_LOCAL_MACHINE\Software\OtherProgram'
 Save-State @{schema=1;sid=$sid;entries=@($entry)}
 $rejected=$false;try{Read-State | Out-Null}catch{$rejected=$true}
 Assert $rejected 'Tampered backup must not target arbitrary registry destinations'
 Remove-Item $statePath
 $delayed=@{exists=$true;value=1;kind='DWord'}
 $script:fakeServices['Spooler']=@{start=4;running=$false;delayed=$absent}
 $service=@{id='spooler';kind='service';name='Spooler';before=@{start=2;running=$true;delayed=$delayed}}
 Restore-Entry $service
 Assert ($script:fakeServices.Spooler.start -eq 2 -and $script:fakeServices.Spooler.running) 'Service startup and running state must be restored'
 Assert (Same-Registry $script:fakeServices.Spooler.delayed $delayed) 'Delayed automatic startup must be restored exactly'
 $script:active='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
 Restore-Entry @{id='power';kind='power';before='381b4222-f694-41f0-9685-ff5bb260df2e';after=$script:active}
 Assert ($script:active -eq '381b4222-f694-41f0-9685-ff5bb260df2e') 'Original power plan must be restored'
 # Exercise the exact production batch try/catch, injecting a failure in its second write.
 $transparency=@{id='transparency';kind='registry';path=$path;name='EnableTransparency';before=$on;after=$off}
 $gamePath="Registry::HKEY_USERS\$sid\Software\Microsoft\GameBar"
 $game=@{id='game-mode';kind='registry';path=$gamePath;name='AutoGameModeEnabled';before=$absent;after=$on}
 Write-Registry $path 'EnableTransparency' $on
 $entries=@($transparency,$game)
 $state=@{schema=1;phase='pending';sid=$sid;profile='basic';created='fixture';entries=$entries}
 Save-State $state
 $script:failName='AutoGameModeEnabled'
 $batch=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.TryStatementAst] -and $n.Body.Extent.Text -match 'foreach\(\$entry in \$entries\)' -and $n.Extent.Text -match 'Restore-State \$state'},$false) | Sort-Object {$_.Extent.Text.Length})[0]
 Assert ($null -ne $batch) 'Production batch control flow must be located'
 Invoke-Expression $batch.Extent.Text
 Assert (!$result.ok -and $result.restored) 'Failed batch must report failure and successful automatic rollback'
 Assert (Same-Registry (Get-Registry $path 'EnableTransparency') $on) 'Earlier applied values must be restored after later failure'
 Assert (!(Get-Registry $gamePath 'AutoGameModeEnabled').exists) 'Failed write must preserve originally absent value'
 Assert (!(Test-Path -LiteralPath $statePath)) 'Successful automatic rollback must clear active journal'
 # Remove a startup value and restore its exact type/text.
 $runPath="Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Run"
 $runBefore=@{exists=$true;kind='ExpandString';value='"%LOCALAPPDATA%\Microsoft\OneDrive.exe" /background'}
 $runEntry=@{id='onedrive-startup';kind='registry';path=$runPath;name='OneDrive';before=$runBefore;after=$absent}
 Write-Registry $runPath 'OneDrive' $runBefore
 $entries=@($runEntry);$state=@{schema=1;phase='pending';sid=$sid;profile='balanced';entries=$entries};Save-State $state
 Invoke-Expression $batch.Extent.Text
 Assert $result.ok 'Removing a selected autorun value should succeed'
 Assert (!(Get-Registry $runPath 'OneDrive').exists) 'Autorun value should be absent after apply'
 Assert (Restore-State (Read-State)) 'Autorun rollback should succeed'
 Assert (Same-Registry (Get-Registry $runPath 'OneDrive') $runBefore) 'Autorun text and ExpandString type must be preserved'
 # Own power plan: mutate only the clone, verify all AC settings and delete only our clone on rollback.
 $script:active='381b4222-f694-41f0-9685-ff5bb260df2e';$script:acValues=@{}
 $powerEntry=@{id='power';kind='power';before=$script:active;after=$managedPlan;managed=$true}
 $entries=@($powerEntry);$state=@{schema=1;phase='pending';sid=$sid;profile='deep';entries=$entries};Save-State $state
 Invoke-Expression $batch.Extent.Text
 Assert $result.ok 'Dedicated power scheme should be created and applied'
 Assert ($script:active -eq $managedPlan) 'Created scheme should be active'
 Assert ($script:acValues.Count -eq 4) 'All four documented AC settings must be applied'
 Assert (@($script:acValues.Keys | Where-Object {$_ -notlike ($managedPlan+'|*')}).Count -eq 0) 'Existing power plans must not be edited'
 Assert (Restore-State (Read-State)) 'Dedicated power scheme rollback should succeed'
 Assert ($script:active -eq $powerEntry.before) 'Original power plan must be reactivated'
 Assert (!(Power-Exists $managedPlan)) 'Only the newly created scheme should be deleted'
 Assert (Power-Exists $powerEntry.before) 'Original power scheme must still exist'
 # Failure after cloning but before activation must still remove the orphan clone.
 $script:failPowerSetting=$true
 $entries=@($powerEntry);$state=@{schema=1;phase='pending';sid=$sid;profile='deep';entries=$entries};Save-State $state
 Invoke-Expression $batch.Extent.Text
 Assert (!$result.ok -and $result.restored) 'Unsupported power setting should fail and roll back the batch'
 Assert (!(Power-Exists $managedPlan)) 'Failed clone should be cleaned up even if never activated'
 Assert (!(Test-Path -LiteralPath $statePath)) 'Clean failed-plan rollback should clear the journal'
 $script:failPowerSetting=$false
 # Per-game preparation keeps unrelated compatibility flags and GPU preferences.
 $exe=Join-Path $root 'cs2.exe';[IO.File]::WriteAllText($exe,'fixture')
 $payload=@{gamePath=$exe}
 $layerPath="Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
 Write-Registry $layerPath $exe @{exists=$true;kind='String';value='~ RUNASADMIN'}
 $id='game-fullscreen'
 $prepare=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith("if(`$id -eq 'game-fullscreen')")},$false))[0]
 Invoke-Expression $prepare.Extent.Text
 Assert ($specs[0].value -eq '~ RUNASADMIN DISABLEDXMAXIMIZEDWINDOWEDMODE') 'Existing game compatibility flags must be preserved'
 Write-Registry $layerPath $exe @{exists=$true;kind='String';value=$specs[0].value}
 Invoke-Expression $prepare.Extent.Text
 Assert ($specs[0].value -eq '~ RUNASADMIN DISABLEDXMAXIMIZEDWINDOWEDMODE') 'Per-game flag must not duplicate on repeat'
 $gpuPath="Registry::HKEY_USERS\$sid\Software\Microsoft\DirectX\UserGpuPreferences"
 Write-Registry $gpuPath $exe @{exists=$true;kind='String';value='SwapEffectUpgradeEnable=1;GpuPreference=1;'}
 $id='game-gpu'
 $prepare=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith("if(`$id -eq 'game-gpu')")},$false))[0]
 Invoke-Expression $prepare.Extent.Text
 Assert ($specs[0].value -eq 'GpuPreference=2;SwapEffectUpgradeEnable=1;') 'GPU choice must not erase unrelated game preferences'
 # New optional settings exercise production preparation, journal validation and apply/rollback.
 $prepareRegistry=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.ForEachStatementAst] -and $n.Extent.Text.StartsWith('foreach($spec in $specs)')},$false))[0]
 Assert ($null -ne $prepareRegistry) 'Production registry preparation must be located'
 foreach($newId in @('advertising-id','explorer-recent','explorer-frequent')){
  Assert (!(Registry-Compatible $newId 10239)) 'New settings must reject pre-Windows-10 builds'
  foreach($newBuild in @(10240,19045,22000,26100)){
   Assert (Registry-Compatible $newId $newBuild) 'New settings must support Windows 10 and 11'
   $newSpec=$registry[$newId][0];$newPath=Resolve-RegistryPath $newSpec
   foreach($original in @($absent,@{exists=$true;kind='DWord';value=1},@{exists=$true;kind='String';value='previous'})){
    $script:values=@{};Write-Registry $newPath $newSpec.name $original
    $build=$newBuild;$id=$newId;$specs=$registry[$id];$entries=New-Object Collections.ArrayList
    Invoke-Expression $prepareRegistry.Extent.Text
    Assert ($entries.Count -eq 1) 'Explicit selection must prepare exactly one registry value'
    $state=@{schema=1;phase='pending';sid=$sid;profile='balanced';entries=@($entries)};Save-State $state
    Invoke-Expression $batch.Extent.Text
    Assert $result.ok 'New selected setting must apply successfully'
    Assert (Same-Registry (Get-Registry $newPath $newSpec.name) @{exists=$true;kind='DWord';value=0}) 'New target must be verified'
    Assert (Restore-State (Read-State)) 'New setting journal must be accepted and restored'
    Assert (Same-Registry (Get-Registry $newPath $newSpec.name) $original) 'Rollback must restore exact absence/type/value'
    Restore-Entry $entries[0]
    Assert (Same-Registry (Get-Registry $newPath $newSpec.name) $original) 'Repeated rollback must be harmless'
   }
  }
  # Unsupported builds and already configured values must not produce writes.
  $script:values=@{};$id=$newId;$specs=$registry[$id];$build=10239;$entries=New-Object Collections.ArrayList
  Invoke-Expression $prepareRegistry.Extent.Text
  Assert ($entries.Count -eq 0) 'Unsupported build must be skipped by production preparation'
  $build=26100;Write-Registry $newPath $newSpec.name @{exists=$true;kind='DWord';value=0}
  Invoke-Expression $prepareRegistry.Extent.Text
  Assert ($entries.Count -eq 0) 'Already configured settings must be skipped'
 }
 # A failure in the second new setting rolls back the first, preserving absent values.
 $script:values=@{};$entries=New-Object Collections.ArrayList;$build=26100
 foreach($id in @('explorer-recent','explorer-frequent')){$specs=$registry[$id];Invoke-Expression $prepareRegistry.Extent.Text}
 $state=@{schema=1;phase='pending';sid=$sid;profile='balanced';entries=@($entries)};Save-State $state
 $script:failName='ShowFrequent';Invoke-Expression $batch.Extent.Text
 Assert (!$result.ok -and $result.restored) 'Failure in new settings must trigger automatic batch rollback'
 Assert ($script:values.Count -eq 0) 'Failed optional batch must restore originally absent values'
 # External changes remain untouched, and the new setting journal remains retryable.
 $newSpec=$registry['advertising-id'][0];$newPath=Resolve-RegistryPath $newSpec
 $entry=@{id='advertising-id';kind='registry';path=$newPath;name=$newSpec.name;before=$absent;after=$off}
 Write-Registry $newPath $newSpec.name $external
 Save-State @{schema=1;phase='applied';sid=$sid;profile='balanced';entries=@($entry)}
 Assert (!(Restore-State (Read-State))) 'Conflicting new settings must retain recovery journal'
 Assert (Same-Registry (Get-Registry $newPath $newSpec.name) $external) 'New settings must preserve external changes'
 Write-Registry $newPath $newSpec.name $off
 Assert (Restore-State (Read-State)) 'New setting rollback can be retried after conflict resolution'
 Assert (!(Get-Registry $newPath $newSpec.name).exists) 'Retry must restore original absence'
 # Windows-specific target selection is checked again in the production worker.
 Assert (Registry-Compatible 'widgets' 19045) 'Windows 10 feed setting must have a concrete compatible target'
 Assert (Registry-Compatible 'widgets' 26100) 'Windows 11 widgets must have a concrete compatible target'
 Assert (!(Registry-Compatible 'activity-sync' 26100)) 'Timeline must not be applied on Windows 11'
 Assert (!(Registry-Compatible 'desktop-peek' 26100)) 'Legacy desktop Peek must not be proposed on Windows 11'
 Assert (!(Registry-Compatible 'game-mode' 14393)) 'Game Mode must not be applied before its Windows release'
 Assert (!(Registry-Compatible 'hags' 18363)) 'HAGS must not be applied before Windows 10 2004'
 $tenTargets=@($registry['widgets'] | Where-Object {(!$_.minBuild -or 19045 -ge $_.minBuild) -and (!$_.maxBuild -or 19045 -le $_.maxBuild)})
 $elevenTargets=@($registry['widgets'] | Where-Object {(!$_.minBuild -or 26100 -ge $_.minBuild) -and (!$_.maxBuild -or 26100 -le $_.maxBuild)})
 Assert ($tenTargets.Count -eq 1 -and $tenTargets[0].name -eq 'ShellFeedsTaskbarViewMode') 'Windows 10 must use the actual taskbar feed setting'
 Assert ($elevenTargets.Count -eq 1 -and $elevenTargets[0].name -eq 'AllowNewsAndInterests') 'Windows 11 must use its widgets policy'
 # Advanced rating re-reads expected settings, including values already correct before apply.
 $script:values=@{}
 $edge=$registry['edge-background'][0]
 Write-Registry (Resolve-RegistryPath $edge) $edge.name @{exists=$true;kind='DWord';value=0}
 $script:fakeServices['MapsBroker']=@{start=4;running=$false;delayed=$absent}
 Write-Registry $gpuPath $exe @{exists=$true;kind='String';value='GpuPreference=2;SwapEffectUpgradeEnable=1;'}
 $ratedState=@{schema=1;sid=$sid;phase='applied';profile='deep';entries=@();ratingPlan=@{basis='profiles-v2';ids=@('transparency','edge-background','maps');gamePath=$exe}}
 Save-State $ratedState
 $profileAudit=Profile-Audit 26100 (Read-State)
 Assert ($profileAudit.checks.Count -eq 3 -and $profileAudit.expectedIds.Count -eq 3) 'Advanced audit must include required medium/deep/game targets without rollback entries'
 Assert (@($profileAudit.checks | Where-Object {!$_.enabled}).Count -eq 0) 'Already correct targets must count after a real read'
 $unsupportedGame=Profile-Audit 10240 (Read-State)
 Assert (!(@($unsupportedGame.checks | Where-Object {$_.id -eq 'game-gpu'})[0].enabled)) 'GPU rating must respect the target minimum Windows build'
 Write-Registry (Resolve-RegistryPath $edge) $edge.name @{exists=$true;kind='DWord';value=1}
 $profileAudit=Profile-Audit 26100 (Read-State)
 Assert (!(@($profileAudit.checks | Where-Object {$_.id -eq 'edge-background'})[0].enabled)) 'External registry changes must lower the rating'
 $script:fakeServices['MapsBroker'].running=$true
 $profileAudit=Profile-Audit 26100 (Read-State)
 Assert (!(@($profileAudit.checks | Where-Object {$_.id -eq 'maps'})[0].enabled)) 'Running service must not count as disabled'
 Write-Registry $gpuPath $exe @{exists=$true;kind='String';value='GpuPreference=1;'}
 $profileAudit=Profile-Audit 26100 (Read-State)
 Assert (!(@($profileAudit.checks | Where-Object {$_.id -eq 'game-gpu'})[0].enabled)) 'Changing GPU preference must revoke game points'
 Write-Registry $gpuPath $exe @{exists=$true;kind='String';value='GpuPreference=2;'}
 Remove-Item -LiteralPath $exe
 $profileAudit=Profile-Audit 26100 (Read-State)
 Assert (!(@($profileAudit.checks | Where-Object {$_.id -eq 'game-gpu'})[0].enabled)) 'A removed EXE must revoke game points'
 $ratedState.phase='pending'
 Assert ($null -eq (Profile-Audit 26100 $ratedState)) 'Incomplete apply must never produce advanced points'
 Assert ($null -eq (Profile-Audit 26100 @{phase='applied';profile='deep';entries=@()})) 'Legacy journal profile names cannot produce advanced points'
 Assert (Restore-State (Read-State)) 'A plan with no writes must still have a valid restorable session'
 Assert ($null -eq (Profile-Audit 26100 (Read-State))) 'Restore must revoke applied profile evidence'
 # A full read-only baseline audit must inspect all targets of all 18 basic actions.
 $script:values=@{}
 foreach($auditId in @($registry.Keys | Where-Object {$registry[$_][0].audit})){
  foreach($auditSpec in $registry[$auditId]){Write-Registry (Resolve-RegistryPath $auditSpec) $auditSpec.name @{exists=(!$auditSpec.afterAbsent);value=$auditSpec.value;kind=$auditSpec.kind}}
 }
 $beforeAudit=$script:values | ConvertTo-Json -Depth 12 -Compress
 $audit=Optimization-Audit 26100
 Assert ($audit.basis -eq 'baseline-v1' -and $audit.checks.Count -eq 18) 'Audit must cover the complete fixed baseline'
 Assert (@($audit.checks | Where-Object {!$_.enabled}).Count -eq 0) 'Exact targets must pass the audit'
 Assert (($script:values | ConvertTo-Json -Depth 12 -Compress) -ceq $beforeAudit) 'Audit must not mutate settings'
 $wrong=$registry['animations'][0]
 Write-Registry (Resolve-RegistryPath $wrong) $wrong.name @{exists=$true;kind=$wrong.kind;value='1'}
 $audit=Optimization-Audit 26100
 Assert (!(@($audit.checks | Where-Object {$_.id -eq 'animations'})[0].enabled)) 'A changed target must lower the measured match count'
 $gameSpec=$registry['game-mode'][0]
 Write-Registry (Resolve-RegistryPath $gameSpec) $gameSpec.name @{exists=$false;kind='DWord';value=$null}
 $audit=Optimization-Audit 26100
 Assert ((@($audit.checks | Where-Object {$_.id -eq 'game-mode'})[0].enabled)) 'Absent Game Mode value retains the known Windows enabled default'
 Write-Output 'PASS: production rollback logic: absent values, interrupted apply, conflict protection, retry journal, tamper rejection, delayed services, power restore, automatic batch rollback, autorun type, owned scheme lifecycle/failure, per-game flag preservation, optional privacy/Explorer build gating and exact rollback, applied profile audits and game verification'
} finally {Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}
