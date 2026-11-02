param([int]$ParentId,[string]$LeaseId,[string]$JournalPathBase64,[string]$CliPathBase64)
$ErrorActionPreference='Stop'
$journal=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($JournalPathBase64))
$cli=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CliPathBase64))
function Fields($value,$names,$depth=0){
 if($null -eq $value -or $value -is [string] -or $depth -gt 8){return}
 if($value -is [Array]){foreach($item in $value){Fields $item $names ($depth+1)};return}
 foreach($property in $value.PSObject.Properties){
  if(($property.Name -replace '[^a-zA-Z0-9]','').ToLowerInvariant() -in $names){$property.Value}
  if($property.Value -is [PSCustomObject] -or $property.Value -is [Array]){Fields $property.Value $names ($depth+1)}
 }
}
function Invoke-Cli([string]$Arguments){
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$cli;$info.Arguments=$Arguments;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=New-Object Diagnostics.Process;$process.StartInfo=$info
 try{
  if(-not $process.Start()){throw 'CLI start failed'}
  $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
  if(-not $process.WaitForExit(15000)){try{$process.Kill()}catch{};throw 'CLI timeout'}
  if($process.ExitCode -ne 0){throw 'CLI failed'}
  $result=$output.GetAwaiter().GetResult()
  if($result.Length -gt 262144){throw 'CLI output too large'}
  return $result
 }finally{$process.Dispose()}
}
function PersonalRegistration {
 try{
  $registration=(Invoke-Cli '--accept-tos --json registration show')|ConvertFrom-Json
  $organizations=@(Fields $registration @('organization','organizationname','teamsorganization')|Where-Object {$null -ne $_ -and [string]$_ -notin @('','None','null')})
  if($organizations.Count -gt 0){return $false}
  $types=@(Fields $registration @('accounttype','registrationtype')|ForEach-Object {if($_ -is [string]){$_}elseif($_ -is [PSCustomObject]){$_.PSObject.Properties.Name}})
  if(@($types|Where-Object {$_ -in @('Teams','Team','Enterprise','ZeroTrust','Organization')}).Count -gt 0){return $false}
  return @($types|Where-Object {$_ -in @('Free','Unlimited','Limited','Consumer','Personal','Warp+','WarpPlus')}).Count -gt 0
 }catch{return $false}
}
$original=Get-Process -Id $ParentId -ErrorAction SilentlyContinue
$start=$(if($original){$original.StartTime.Ticks}else{0});$deadline=[DateTime]::UtcNow.AddMinutes(10)
while($true){
 try{$state=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json}catch{exit}
 if(-not $state.owned -or $state.reason -ne 'trial'){exit}
 if(-not $LeaseId -or $state.leaseId -ne $LeaseId){exit}
 $parent=Get-Process -Id $ParentId -ErrorAction SilentlyContinue
 if(-not $parent -or $parent.StartTime.Ticks -ne $start -or [DateTime]::UtcNow -gt $deadline){
  if(-not $state.connectIssued){exit}
  $signature=Get-AuthenticodeSignature -LiteralPath $cli
  if($signature.Status -ne 'Valid' -or ($signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -replace ',','').TrimEnd('.') -ne 'Cloudflare Inc'){exit}
  if(-not (PersonalRegistration)){exit}
  $latest=Get-Content -LiteralPath $journal -Raw|ConvertFrom-Json
  if(-not $latest.owned -or -not $latest.connectIssued -or $latest.reason -ne 'trial' -or $latest.leaseId -ne $LeaseId){exit}
  try{[void](Invoke-Cli '--accept-tos --json disconnect')}catch{}
  exit
 }
 Start-Sleep -Seconds 2
}
