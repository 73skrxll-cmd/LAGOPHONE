const {app,ipcMain}=require('electron');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');
const {normalizeSample,createMonitor}=require('./monitor.cjs');
function run(file,args,timeout){return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,env:windowsPowerShellEnvironment(),maxBuffer:4*1024*1024},(error,stdout)=>error?reject(error):resolve(stdout.trim())))}
let nvidiaRequest;
async function nvidia(){
 if(!nvidiaRequest)nvidiaRequest=(async()=>{const roots=[process.env.SystemRoot&&path.win32.join(process.env.SystemRoot,'System32'),process.env.ProgramW6432&&path.win32.join(process.env.ProgramW6432,'NVIDIA Corporation','NVSMI'),process.env.ProgramFiles&&path.win32.join(process.env.ProgramFiles,'NVIDIA Corporation','NVSMI')].filter(Boolean);for(const root of roots){const file=path.win32.join(root,'nvidia-smi.exe');try{await fs.access(file);return file}catch{}}return null})();
 const executable=await nvidiaRequest;if(!executable)return '';
 return run(executable,['--query-gpu=index,name,clocks.current.graphics,clocks.current.memory,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw','--format=csv,noheader,nounits'],5000).catch(()=>'');
}
function registerMonitor(optimizer){
 const monitor=createMonitor({load:async()=>{
  const worker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','monitor.ps1'):path.join(__dirname,'monitor.ps1');
  const command="$ErrorActionPreference='Stop'; & '"+worker.replaceAll("'","''")+"'";
  const [raw,gpu]=await Promise.all([run(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],15000),nvidia()]);
  return normalizeSample(JSON.parse(raw),gpu);
 }});
 ipcMain.handle('monitor:sample',()=>{if(process.platform!=='win32')return {available:false,reason:'Мониторинг доступен в приложении Windows.'};if(optimizer.isRunning())return {available:false,reason:'Идёт применение или откат настроек. Мониторинг временно приостановлен.'};return monitor.sample()});
}
module.exports={registerMonitor};
