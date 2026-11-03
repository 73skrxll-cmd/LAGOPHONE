const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
test('Windows PowerShell validates session worker and exercises actual transaction code with isolated BITS providers',{skip:process.platform!=='win32'},()=>{
 const output=execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'ping-session.logic.tests.ps1')],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:20000});assert.match(output,/BITS transaction logic passed/);
});

test('actual watchdog restores an empty durable journal when the parent process is absent',{skip:process.platform!=='win32'},()=>{
 const fs=require('node:fs'),os=require('node:os');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gtm-session-watch-'));const filename=path.join(directory,'journal.json');
 try{fs.writeFileSync(filename,JSON.stringify({owned:true,leaseId:'test-watch',jobs:[]}));
 execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'ping-session.ps1'),'-Mode','watch','-ParentId','2147483647','-LeaseId','test-watch','-SessionPathBase64',Buffer.from(filename).toString('base64')],{env:windowsPowerShellEnvironment(),timeout:15000});
 assert.equal(JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,'')).owned,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('Windows helper reads signed official WireGuard and encrypts an imported profile with current-user DPAPI without a tunnel',{skip:process.platform!=='win32'},()=>{
 const helper=path.join(__dirname,'wireguard-tunnel.ps1');
 const info=JSON.parse(execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode','info'],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:30000}));assert.equal(info.verified,true,'Official wireguard.exe and wg.exe signatures must both verify');
 const key=Buffer.alloc(32,7).toString('base64'),config=`[Interface]\nPrivateKey = ${key}\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n[Peer]\nPublicKey = ${key}\nAllowedIPs = 0.0.0.0/0\nEndpoint = 8.8.8.8:51820\n`;
 const protectedData=JSON.parse(execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode','protect'],{input:JSON.stringify({config}),env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:20000}));
 assert.ok(protectedData.cipher.length>50);assert.equal(protectedData.cipher.includes(key),false);
 assert.throws(()=>execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode','protect'],{input:JSON.stringify({config:config+'PostUp = whoami\n'}),env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe']}));
});

test('disposable Windows installs its own isolated tunnel service and watchdog removes it after parent death, without a remote peer',{skip:process.platform!=='win32'||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1',timeout:90000},async()=>{
 const fs=require('node:fs'),os=require('node:os'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
 const helper=path.join(__dirname,'wireguard-tunnel.ps1'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'gtm-vpn-recovery-'));
 const invoke=(mode,args=[],input)=>{const output=execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode,...args],{input,env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});return output.trim()?JSON.parse(output):null};
 const info=invoke('info'),lease=randomUUID().replaceAll('-',''),name='GTMPC'+lease.slice(0,20),args=['-LeaseId',lease,'-ExpectedSid',info.sid];
 const parent=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
 const state=()=>{try{return JSON.parse(fs.readFileSync(path.join(info.stateRoot,name+'.json'),'utf8'))}catch{return null}};
 let issued=false;
 try{
  // TEST-NET endpoint has no remote peer. This test proves installation/recovery, never connectivity.
  const key=Buffer.alloc(32,9).toString('base64'),config=`[Interface]\nPrivateKey = ${key}\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n[Peer]\nPublicKey = ${key}\nAllowedIPs = 0.0.0.0/0\nEndpoint = 203.0.113.1:51820\n`;
  const encrypted=invoke('protect',[],JSON.stringify({config})),file=path.join(directory,'gtm-proton-profile.bin');fs.writeFileSync(file,Buffer.from(encrypted.cipher,'base64'));
  const response=randomUUID().replaceAll('-','');issued=true;invoke('connect',[...args,'-ResponseId',response,'-ProfilePathBase64',Buffer.from(file).toString('base64'),'-ParentId',String(parent.pid)]);
  const result=JSON.parse(fs.readFileSync(path.join(info.stateRoot,response+'.json'),'utf8'));assert.equal(result.ok,true,JSON.stringify(result));
  const limit=Date.now()+20000;while(!state()?.serviceRunning&&Date.now()<limit)await new Promise(r=>setTimeout(r,500));assert.equal(state()?.serviceRunning,true);
  assert.equal(state()?.handshakeAgeSec,null,'No server exists; a process/service must never count as a verified connection');
  parent.kill();const end=Date.now()+25000;while(!state()?.removed&&Date.now()<end)await new Promise(r=>setTimeout(r,500));assert.equal(state()?.removed,true);assert.equal(state()?.serviceRunning,false);
 }finally{
  parent.kill();if(issued&&!state()?.removed)invoke('disconnect',[...args,'-ResponseId',randomUUID().replaceAll('-','')]);fs.rmSync(directory,{recursive:true,force:true});
 }
});
