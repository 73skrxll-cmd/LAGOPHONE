// Pinned official x64 MSI; hash from microsoft/winget-pkgs Cloudflare.Warp 26.8.2115.0.
// Download and validation run inside the elevated process; never execute an unverified MSI.
function setupCommand(install){
 const inner=`$ErrorActionPreference='Stop';try {
 ${install?`[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $dir=Join-Path $env:ProgramFiles ('GTM-PC-WARP-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $dir|Out-Null
 try {
 $msi=Join-Path $dir 'warp.msi'
 Invoke-WebRequest -UseBasicParsing -Uri 'https://downloads.cloudflareclient.com/v1/download/windows/version/2026.8.2115.0' -OutFile $msi -TimeoutSec 240
 if((Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash -ne 'AB3138DBEBDF132AF076B5EBCB25B42345D29258ACB76267C3BD1F8CFEA57A53'){throw 'Checksum mismatch'}
 $sig=Get-AuthenticodeSignature -LiteralPath $msi
 if($sig.Status -ne 'Valid' -or -not $sig.SignerCertificate -or ($sig.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -replace ',','').TrimEnd('.') -ne 'Cloudflare Inc'){throw 'Invalid publisher'}
 $p=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\msiexec.exe') -ArgumentList @('/i',('"'+$msi+'"'),'/qn','/norestart') -Wait -PassThru
 if($p.ExitCode -eq 3010){exit 10};if($p.ExitCode -ne 0){throw 'Installation failed'}
 } finally {Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue}`:''}
 Start-Service -Name CloudflareWARP
 (Get-Service -Name CloudflareWARP).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
 exit 0
 } catch {exit 1}`;
 const encoded=Buffer.from(inner,'utf16le').toString('base64');
 return `$ErrorActionPreference='Stop';$p=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -Wait -PassThru;if($p.ExitCode -ne 0){throw 'Не удалось подготовить WARP: отмена UAC, ошибка установки или требуется перезагрузка.'}`;
}
module.exports={setupCommand};
