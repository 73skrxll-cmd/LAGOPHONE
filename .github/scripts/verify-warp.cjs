// Disposable Windows runner: exercise the real official component and save raw RTTs.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createWarpClient}=require('../../electron/warp-client.cjs');
const {createPingProbe}=require('../../electron/ping-probe.cjs');
const {createPingController}=require('../../electron/ping-controller.cjs');
const {windowsPowerShellExecutable}=require('../../electron/windows-powershell.cjs');
(async()=>{
 const journal=path.join(os.tmpdir(),'gtm-warp-ci-route.json');
 const transport=createWarpClient(),probe=createPingProbe({worker:path.resolve('electron/ping-probe.ps1')});
 const controller=createPingController({transport,probe,saveJournal:value=>fs.writeFile(journal,JSON.stringify(value)),
  watchdog:async({cli,leaseId})=>new Promise((resolve,reject)=>{
   const child=spawn(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('electron/ping-watchdog.ps1'),'-ParentId',String(process.pid),'-LeaseId',leaseId,'-JournalPathBase64',Buffer.from(journal).toString('base64'),'-CliPathBase64',Buffer.from(cli).toString('base64')],{detached:true,windowsHide:true,stdio:'ignore'});
   child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()});
  })});
 await fs.mkdir('release',{recursive:true});
 try{
  const report=await controller.compare('discord-api',true);
  await fs.writeFile('release/warp-network-check.json',JSON.stringify(report,null,2));
  console.log('Real A-B-A completed:',report.comparison.verdict,'gainMs:',report.comparison.gainMs);
 }catch(error){
  try{
   const {cli}=await transport.watchdogInfo();const {promisify}=require('node:util');const {execFile}=require('node:child_process');
   const safe=new Set(['Unable','Connected','Disconnected','Connecting','Disconnecting','RegistrationMissing','DaemonStartup','Free','Unlimited','Limited','Teams','warp','warp+doh','WarpWithDnsOverHttps','WarpWithDns','TunnelOnly','Mode']);
   const redact=value=>Array.isArray(value)?value.map(redact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item)])):typeof value==='string'?(safe.has(value)?value:'<redacted>'):value;
   for(const args of [['status'],['settings','list'],['registration','show']]){
    try{const result=await promisify(execFile)(cli,['--accept-tos','--json',...args],{windowsHide:true,timeout:15000});console.log('WARP schema diagnostic',args.join(' '),JSON.stringify(redact(JSON.parse(result.stdout))))}catch{}
   }
  }catch{}

  await fs.writeFile('release/warp-network-check.json',JSON.stringify({error:error.message,provider:await transport.inspect(true)},null,2));throw error}
 finally{const state=await controller.status(true);if(state.provider.owned)await controller.disconnect()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
