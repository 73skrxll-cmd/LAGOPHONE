$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'optimizer.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
# Import actual production definitions, but never execute the Windows mutation entrypoint.
foreach($node in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $node.Extent.Text}
foreach($node in $ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -in @('$registry','$services','$plans')},$false)){Invoke-Expression $node.Extent.Text}
$sid='S-1-5-21-1-2-3-1000'
$root=Join-Path ([IO.Path]::GetTempPath()) ('lagophone-test-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $root | Out-Null
$statePath=Join-Path $root 'optimization-state.json'
$script:values=@{};$script:fakeServices=@{};$script:report=New-Object Collections.ArrayList
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
function powercfg.exe {param($op,$guid);if($op -ne '/setactive'){throw 'Unexpected power operation'};$script:active=$guid;$global:LASTEXITCODE=0}
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
 Write-Output 'PASS: production rollback logic: absent values, interrupted apply, conflict protection, retry journal, tamper rejection, delayed services, power restore, automatic batch rollback'
} finally {Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}
