$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
function Read-Cim($name){try{@(Get-CimInstance -ClassName $name -ErrorAction Stop)}catch{@()}}
function Positive($value){if($null -eq $value -or [double]$value -le 0){return $null};return [double]$value}
$os=Read-Cim 'Win32_OperatingSystem' | Select-Object -First 1
$cpu=Read-Cim 'Win32_PerfFormattedData_Counters_ProcessorInformation' | Where-Object {$_.Name -eq '_Total'} | Select-Object -First 1
$usage=$null;$clock=$null
if($cpu){if($null -ne $cpu.PercentProcessorUtility){$usage=[double]$cpu.PercentProcessorUtility}elseif($null -ne $cpu.PercentProcessorTime){$usage=[double]$cpu.PercentProcessorTime};$frequency=Positive $cpu.ProcessorFrequency;$performance=Positive $cpu.PercentProcessorPerformance;if($frequency){$clock=$frequency;if($performance){$clock=[math]::Round($frequency*$performance/100)}}}
if($null -eq $usage){$fallback=Read-Cim 'Win32_PerfFormattedData_PerfOS_Processor' | Where-Object {$_.Name -eq '_Total'} | Select-Object -First 1;if($fallback){$usage=[double]$fallback.PercentProcessorTime}}
$total=$null;$free=$null;if($os){$total=[double]$os.TotalVisibleMemorySize*1024;$free=[double]$os.FreePhysicalMemory*1024}
$disk=Read-Cim 'Win32_PerfFormattedData_PerfDisk_PhysicalDisk' | Where-Object {$_.Name -eq '_Total'} | Select-Object -First 1
$network=@(Read-Cim 'Win32_PerfFormattedData_Tcpip_NetworkInterface' | Where-Object {$_.Name -notmatch 'Loopback|isatap|Teredo'} | ForEach-Object {@{name=$_.Name;receiveBytesPerSecond=[double]$_.BytesReceivedPersec;sendBytesPerSecond=[double]$_.BytesSentPersec}})
$gpuMemory=@(Read-Cim 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory' | Where-Object {$_.Name -ne '_Total'})
$dedicated=$null;$shared=$null;if($gpuMemory.Count){$dedicated=[double](($gpuMemory | Measure-Object DedicatedUsage -Sum).Sum);$shared=[double](($gpuMemory | Measure-Object SharedUsage -Sum).Sum)}
$gpuEngines=@(Read-Cim 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine')
$gpuUsage=$null;if($gpuEngines.Count){$engineTotals=@($gpuEngines | Group-Object {$_.Name -replace '^pid_\d+_',''} | ForEach-Object {($_.Group | Measure-Object UtilizationPercentage -Sum).Sum});$gpuUsage=($engineTotals | Measure-Object -Maximum).Maximum}
$adapters=@(Read-Cim 'Win32_VideoController' | ForEach-Object {
 $memory=$null
 try{
  $driver=(Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\'+$_.PNPDeviceID) -ErrorAction Stop).Driver
  if($driver){$properties=Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Class\'+$driver) -ErrorAction Stop;$entry=$properties.PSObject.Properties['HardwareInformation.qwMemorySize'];if($entry){$value=$entry.Value;if($value -is [byte[]] -and $value.Length -ge 8){$memory=[double][BitConverter]::ToUInt64($value,0)}elseif($value -is [long] -or $value -is [ulong]){$memory=Positive $value}}}
 }catch{}
 @{name=$_.Name;memoryTotalBytes=$memory}
})
@{cpu=@{usagePercent=$usage;clockMHz=$clock;clockSource=$(if($clock){'windows-estimate'}else{$null})};memory=@{totalBytes=$total;freeBytes=$free};disk=@{readBytesPerSecond=$(if($disk){[double]$disk.DiskReadBytesPersec}else{$null});writeBytesPerSecond=$(if($disk){[double]$disk.DiskWriteBytesPersec}else{$null})};network=$network;adapters=$adapters;gpuWindows=@{usagePercent=$gpuUsage;dedicatedUsedBytes=$dedicated;sharedUsedBytes=$shared;adapterCount=$gpuMemory.Count}} | ConvertTo-Json -Depth 6 -Compress
