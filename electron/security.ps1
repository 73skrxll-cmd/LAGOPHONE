$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
# Read-only Windows APIs. Do not return TPM owner authorization or identifiers.
$result=@{firmware='unknown';secureBoot=@{enabled=$null;source='none';issue='unavailable'};tpm=@{present=$null;version=$null;enabled=$null;ready=$null;lockedOut=$null;source='none'}}
try {
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GTMSecurityRead {
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
 [DllImport("kernel32.dll", SetLastError=true)]
 [return: MarshalAs(UnmanagedType.Bool)]
 public static extern bool GetFirmwareType(out UInt32 type);
 [StructLayout(LayoutKind.Sequential)]
 public struct TPM_DEVICE_INFO { public UInt32 structVersion, tpmVersion, tpmInterfaceType, tpmImpRevision; }
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
 [DllImport("tbs.dll", ExactSpelling=true)]
 public static extern UInt32 Tbsi_GetDeviceInfo(UInt32 size, ref TPM_DEVICE_INFO info);
}
'@
 try {
  [uint32]$kind=0
  if([GTMSecurityRead]::GetFirmwareType([ref]$kind)){
   if($kind -eq 2){$result.firmware='uefi'}elseif($kind -eq 1){$result.firmware='legacy'}
  }
 }catch{}
 try {
  $info=New-Object GTMSecurityRead+TPM_DEVICE_INFO
  $info.structVersion=2
  $code=[GTMSecurityRead]::Tbsi_GetDeviceInfo(16,[ref]$info)
  if($code -eq 0){
   $result.tpm.present=$true;$result.tpm.source='tbs'
   if($info.tpmVersion -eq 2){$result.tpm.version='2.0'}elseif($info.tpmVersion -eq 1){$result.tpm.version='1.2'}
  }elseif($code -eq [uint32]2150121487){$result.tpm.present=$false;$result.tpm.source='tbs'}
 }catch{}
}catch{}
if($result.firmware -eq 'legacy'){$result.secureBoot.issue='legacy'}else{
 try {
  $enabled=Confirm-SecureBootUEFI -ErrorAction Stop
  if($enabled -is [bool]){$result.secureBoot=@{enabled=$enabled;source='firmware';issue=$null}}
 }catch{
  if($_.Exception -is [UnauthorizedAccessException] -or $_.CategoryInfo.Category -eq 'PermissionDenied'){$result.secureBoot.issue='access'}
 }
 # Windows' boot-state record is a fallback, not a direct firmware verification.
 if($null -eq $result.secureBoot.enabled){
  try {
   $state=Get-ItemPropertyValue -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -Name UEFISecureBootEnabled -ErrorAction Stop
   if($state -is [int] -and $state -in @(0,1)){$result.secureBoot.enabled=($state -eq 1);$result.secureBoot.source='windows-boot'}
  }catch{}
 }
}
try {
 $tpm=Get-Tpm -ErrorAction Stop -WarningAction SilentlyContinue
 if($tpm.TpmPresent -is [bool] -and $result.tpm.source -eq 'none'){$result.tpm.source='get-tpm'}
 if($tpm.TpmPresent -eq $true){
  $result.tpm.present=$true
  foreach($pair in @(@('enabled','TpmEnabled'),@('ready','TpmReady'),@('lockedOut','LockedOut'))){
   $value=$tpm.($pair[1]);if($value -is [bool]){$result.tpm[$pair[0]]=$value}
  }
 }elseif($result.tpm.present -ne $true -and $tpm.TpmPresent -is [bool]){$result.tpm.present=$false}
}catch{}
if($null -eq $result.tpm.version -and $result.tpm.present -ne $false){
 try {
  $device=Get-CimInstance -Namespace 'root/cimv2/security/microsofttpm' -ClassName Win32_Tpm -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object -First 1
  if($null -ne $device){
   $result.tpm.present=$true;$result.tpm.source='cim'
   if($device.SpecVersion -match '^2\.0(?:\D|$)'){$result.tpm.version='2.0'}elseif($device.SpecVersion -match '^1\.2(?:\D|$)'){$result.tpm.version='1.2'}
  }
 }catch{}
}
$result | ConvertTo-Json -Depth 5 -Compress
