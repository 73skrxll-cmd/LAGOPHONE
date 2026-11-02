const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ps=process.env.GTM_PING_TEST_PWSH||(process.platform==='win32'?require('./windows-powershell.cjs').windowsPowerShellExecutable():null);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const probe=path.join(__dirname,'ping-probe.ps1'),watchdog=path.join(__dirname,'ping-watchdog.ps1');
function run(script){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gtm-ping-worker-'));try{const file=path.join(root,'test.ps1');fs.writeFileSync(file,script);return spawnSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',timeout:20000,env:require('./windows-powershell.cjs').windowsPowerShellEnvironment()})}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('PowerShell workers parse in Windows PowerShell without executing network actions',{skip:!ps},()=>{
 const result=run(`$failed=$false;foreach($file in @(${quote(probe)},${quote(watchdog)})){$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){$failed=$true;$errors|ForEach-Object {$_.Message}}};if($failed){exit 1}`);
 assert.equal(result.status,0,result.stdout+result.stderr);
});
test('PowerShell checks actual selected adapter and rejects ambiguous or invalid destinations offline',{skip:!ps},()=>{
 for(const [description,indexes,address,expected] of [['CloudflareWARP',[42],'3.64.1.1',true],['Ethernet',[42],'3.64.1.1',false],['CloudflareWARP',[42,43],'3.64.1.1',null],['CloudflareWARP',[42],'127.0.0.1',null],['CloudflareWARP',[42],'192.168.1.1',null]]){
  const encoded=Buffer.from(JSON.stringify({targetId:'fortnite-de',address})).toString('base64');
  const result=run(`function Find-NetRoute{[CmdletBinding()]param([string]$RemoteIPAddress);${indexes.map(i=>`[PSCustomObject]@{InterfaceIndex=${i}}`).join(';')}};function Get-NetAdapter{[CmdletBinding()]param([switch]$IncludeHidden);[PSCustomObject]@{ifIndex=42;Name=${quote(description)};InterfaceDescription=${quote(description)}}};. ${quote(probe)} -Mode route -PayloadBase64 ${quote(encoded)};exit $LASTEXITCODE`);
  assert.ok(result.stdout.trim(),result.stderr);const event=JSON.parse(result.stdout.trim());
  if(expected===null){assert.equal(result.status,1);assert.equal(event.type,'error');assert.equal(event.message,'Не удалось выполнить измерение задержки или проверить маршрут. Повторите попытку.')}else{assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(event.type,'route');assert.equal(event.viaWarp,expected)}
 }
});
test('TCP worker measures the fixed public endpoint, closes sockets and records timeouts/errors honestly',{skip:!ps},()=>{
 for(const [mode,status] of [['success','success'],['timeout','timeout'],['error','error']]){
  const encoded=Buffer.from(JSON.stringify({targetId:'discord-api',address:'3.64.1.1',count:1,port:22,method:'icmp'})).toString('base64');
  const result=run(`
   $global:tcpMode=${quote(mode)};$global:clientClosed=$false;$global:handleClosed=$false
   $handle=[PSCustomObject]@{}
   $handle|Add-Member ScriptMethod WaitOne {param($timeout,$exitContext);if($timeout -ne 1200){throw 'Wrong timeout'};return $global:tcpMode -ne 'timeout'}
   $handle|Add-Member ScriptMethod Close {$global:handleClosed=$true}
   $global:fakeConnection=[PSCustomObject]@{AsyncWaitHandle=$handle}
   $global:fakeClient=[PSCustomObject]@{}
   $global:fakeClient|Add-Member ScriptMethod BeginConnect {param($address,$port,$callback,$state);if($address -ne '3.64.1.1' -or $port -ne 443){throw 'Wrong endpoint'};return $global:fakeConnection}
   $global:fakeClient|Add-Member ScriptMethod EndConnect {param($connection);if($global:tcpMode -eq 'error'){throw 'Socket refused'}}
   $global:fakeClient|Add-Member ScriptMethod Close {$global:clientClosed=$true}
   function New-Object{[CmdletBinding()]param([Parameter(Position=0)][string]$TypeName,[Parameter(Position=1)][object[]]$ArgumentList);if($TypeName -eq 'Net.Sockets.TcpClient'){return $global:fakeClient};Microsoft.PowerShell.Utility\\New-Object @PSBoundParameters}
   . ${quote(probe)} -Mode measure -PayloadBase64 ${quote(encoded)}
   if(-not $global:clientClosed -or -not $global:handleClosed){throw 'Socket resources leaked'};exit $LASTEXITCODE
  `);
  assert.equal(result.status,0,result.stdout+result.stderr);const events=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(events.length,2);assert.equal(events[0].sample.status,status);
  if(status==='success')assert.ok(events[0].sample.rttMs>=0);else assert.equal(events[0].sample.rttMs,null);
  assert.equal(events[1].type,'complete');assert.equal(events[1].count,1);
 }
});
