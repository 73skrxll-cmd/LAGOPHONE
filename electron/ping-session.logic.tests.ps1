$ErrorActionPreference='Stop'
$directory=Join-Path ([IO.Path]::GetTempPath()) ('gtm-bits-test-'+[Guid]::NewGuid().ToString('N'));[void](New-Item -ItemType Directory $directory)
$filename=Join-Path $directory 'journal.json'
try{
 . (Join-Path $PSScriptRoot 'ping-session.ps1') -SessionPathBase64 ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($filename)))
 $script:fake=@([PSCustomObject]@{JobId=[Guid]::NewGuid();JobState='Transferring'},[PSCustomObject]@{JobId=[Guid]::NewGuid();JobState='Suspended'})
 function BitsJobs {return $script:fake}
 function Suspend-BitsTransfer {param($BitsJob);$BitsJob.JobState='Suspended'}
 function Resume-BitsTransfer {param($BitsJob,[switch]$Asynchronous);if($script:fail){throw 'injected resume failure'};$BitsJob.JobState='Queued'}
 $state=@{owned=$true;leaseId='test';jobs=@($script:fake|ForEach-Object {@{id=$_.JobId.ToString();state=$_.JobState;intent=$false}})}
 Journal $state
 $result=PauseSession 'test';if($result.paused -ne 1){throw 'Pre-suspended job was changed'}
 $saved=Get-Content $filename -Raw|ConvertFrom-Json;if(-not $saved.jobs[0].intent -or $saved.jobs[1].intent){throw 'Invalid durable mutation intents'}
 $script:fail=$true;$result=Restore;if($result.remaining -ne 1){throw 'Failed resume must keep recovery journal'}
 $script:fail=$false;$result=Restore;if($result.remaining -ne 0 -or $script:fake[0].JobState -ne 'Queued' -or $script:fake[1].JobState -ne 'Suspended'){throw 'Original active jobs were not restored correctly'}
 $saved=Get-Content $filename -Raw|ConvertFrom-Json;if($saved.owned){throw 'Completed restoration still owns jobs'}
 # Crash after a durable intent but before completion must also restore our suspended job.
 $script:fake[0].JobState='Suspended';Journal @{owned=$true;leaseId='crash';jobs=@(@{id=$script:fake[0].JobId.ToString();state='Transferring';intent=$true})}
 if((Restore 'old-lease').restored -ne 0 -or $script:fake[0].JobState -ne 'Suspended'){throw 'Old watchdog modified a new lease'}
 if((Restore).remaining -ne 0 -or $script:fake[0].JobState -ne 'Queued'){throw 'Crash restoration failed'}
 Write-Output 'BITS transaction logic passed: pre-suspended jobs, durable intents, failure, retry and crash recovery.'
}finally{Remove-Item -LiteralPath $directory -Recurse -Force}
