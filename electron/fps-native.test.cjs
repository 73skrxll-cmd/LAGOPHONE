const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pwsh=process.platform==='win32'?require('./windows-powershell.cjs').windowsPowerShellExecutable():process.env.GTM_TEST_PWSH;
test('production collector compiles; parses real CSV fields, filters processes and selects one swapchain',{skip:!pwsh},()=>{
 const source=path.join(__dirname,'fps-native.cs').replaceAll("'","''");
 const command=`$ErrorActionPreference='Stop';Add-Type -Path '${source}';$c=[GTMFpsCollector]::new([string[]]@('cs2.exe'),[string[]]@('cs2'),[string[]]@('Counter-Strike 2'));$c.Feed('Application,ProcessID,SwapChainAddress,Runtime,msBetweenPresents');$c.Feed('chrome.exe,999999,0x1,DXGI,10');$c.Feed('cs2.exe,999999,0x1,DXGI,1000');1..100|ForEach-Object{$c.Feed('cs2.exe,999999,0x1,DXGI,10')};1..3|ForEach-Object{$c.Feed('cs2.exe,999999,0x2,DXGI,50')};$c.Feed('cs2.exe,999999,0x1,DXGI,NaN');$rows=@($c.Snapshot($true));if($rows.Count -ne 1 -or $rows[0].count -ne 100 -or $rows[0].sumMs -ne 1000 -or $rows[0].minMs -ne 10 -or !$rows[0].partialEnd -or $c.InvalidRows -ne 1){throw 'Incorrect native aggregation'};$c.Dispose();$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${path.join(__dirname,'fps-worker.ps1').replaceAll("'","''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){throw ($errors|Out-String)};'Native aggregation and worker syntax OK'`;
 const output=execFileSync(pwsh,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:45000});assert.match(output,/Native aggregation and worker syntax OK/);
});
test('official pinned PresentMon can start and stop a uniquely named Windows ETW capture',{skip:process.platform!=='win32'||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1'},()=>{
 const spec=require('../shared/presentmon.json'),binary=path.join(__dirname,'../assets/presentmon/PresentMon.exe');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),spec.sha256);
 const session='GTMPC-FPS-'+crypto.randomUUID().replaceAll('-','');
 try{execFileSync(binary,['--session_name',session,'--process_name','gtm-ci-no-game.exe','--timed','1','--terminate_after_timed','--output_stdout','--v1_metrics','--no_track_gpu','--no_track_input','--no_track_display','--no_console_stats'],{encoding:'utf8',timeout:20000,windowsHide:true})}
 finally{try{execFileSync(binary,['--session_name',session,'--terminate_existing_session','--no_console_stats'],{timeout:10000,windowsHide:true,stdio:'ignore'})}catch{}}
});
test('production Windows worker stops its own ETW session on stop and heartbeat expiry',{skip:process.platform!=='win32'||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1',timeout:90000},async()=>{
 const fsp=require('node:fs/promises'),os=require('node:os'),{spawn}=require('node:child_process'),ps=require('./windows-powershell.cjs');
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(const mode of ['stop','heartbeat']){
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'gtm-fps-worker-test-'));
  const payload={directory,binary:path.join(__dirname,'../assets/presentmon/PresentMon.exe'),sessionName:'GTMPC-FPS-'+crypto.randomUUID().replaceAll('-',''),parentPid:process.pid,parentStartedAt:new Date(Date.now()-process.uptime()*1000).toISOString(),games:[{exe:'gtm-ci-no-game.exe',id:'ci-fixture',name:'CI fixture'}]};
  const heartbeat=path.join(directory,'heartbeat');await fsp.writeFile(heartbeat,'1');
  const timer=setInterval(()=>void fsp.writeFile(heartbeat,'1').catch(()=>{}),1000);
  const child=spawn(ps.windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fps-worker.ps1'),'-PayloadBase64',Buffer.from(JSON.stringify(payload)).toString('base64')],{windowsHide:true,env:ps.windowsPowerShellEnvironment(),stdio:'ignore'});
  let state;
  async function until(phase){for(let i=0;i<80;i++){try{state=JSON.parse(await fsp.readFile(path.join(directory,'state.json'),'utf8'));if(state.phase===phase)return;if(['error','needs-permission'].includes(state.phase))throw Error(JSON.stringify(state));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}await wait(200)}throw Error('Worker did not reach '+phase+': '+JSON.stringify(state))}
  try{await until('watching');assert.deepEqual(state.sessions,[]);
   clearInterval(timer);if(mode==='stop')await fsp.writeFile(path.join(directory,'stop'),'1');else await fsp.utimes(heartbeat,new Date(Date.now()-20000),new Date(Date.now()-20000));
   await until('stopped');for(let i=0;i<20&&child.exitCode===null;i++)await wait(100);assert.equal(child.exitCode,0,'Worker exits after '+mode);
   assert.throws(()=>execFileSync('logman.exe',['query',payload.sessionName,'-ets'],{windowsHide:true,stdio:'ignore'}),'Owned ETW session must be gone');
  }finally{clearInterval(timer);await fsp.writeFile(path.join(directory,'stop'),'1').catch(()=>{});if(child.exitCode===null){await wait(5000);if(child.exitCode===null)child.kill()}await fsp.rm(directory,{recursive:true,force:true})}
 }
});
