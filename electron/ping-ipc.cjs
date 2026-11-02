const {app,ipcMain,dialog,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const {createPingProbe}=require('./ping-probe.cjs');
const {createWarpClient}=require('./warp-client.cjs');
const {createPingController}=require('./ping-controller.cjs');
const setupLinks=Object.freeze({setup:'https://developers.cloudflare.com/warp-client/get-started/windows/',terms:'https://www.cloudflare.com/application/terms/',privacy:'https://www.cloudflare.com/application/privacypolicy/'});
function registerPing(getWindow,activities,optimizer){
 const location=name=>path.join(app.getPath('userData'),name);
 const worker=name=>app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron',name):path.join(__dirname,name);
 async function read(name,limit){
  const filename=location(name);
  try{if((await fs.stat(filename)).size>limit)throw Error('State too large');return JSON.parse(await fs.readFile(filename,'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}
 }
 async function write(name,value){
  const filename=location(name),temporary=filename+'.'+randomUUID()+'.tmp';await fs.mkdir(path.dirname(filename),{recursive:true});
  try{await fs.writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});await fs.rename(temporary,filename)}finally{await fs.unlink(temporary).catch(()=>{})}
 }
 const controller=createPingController({
  probe:createPingProbe({worker:worker('ping-probe.ps1')}),transport:createWarpClient(),
  exclusive:(mode,task)=>optimizer.exclusive(mode,task),
  load:async()=>{
   const [last,journal]=await Promise.allSettled([read('ping-last.json',512*1024),read('ping-route.json',8192)]);
   return {last:last.status==='fulfilled'?last.value:null,journal:journal.status==='fulfilled'?journal.value:null,journalError:journal.status==='rejected',warning:last.status==='rejected'?'Сохранённый отчёт недоступен. Выполните новый замер.':''};
  },
  saveReport:value=>write('ping-last.json',value),saveJournal:value=>write('ping-route.json',value),
  onProgress:value=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('ping:progress',value)},
  onActivity:item=>activities.add([item]),
  watchdog:async({cli,leaseId})=>{
   await new Promise((resolve,reject)=>{
    const child=spawn(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker('ping-watchdog.ps1'),'-ParentId',String(process.pid),'-LeaseId',leaseId,'-JournalPathBase64',Buffer.from(location('ping-route.json')).toString('base64'),'-CliPathBase64',Buffer.from(cli).toString('base64')],{env:windowsPowerShellEnvironment(),detached:true,windowsHide:true,stdio:'ignore'});
    child.once('error',()=>reject(Error('Не удалось запустить защиту возврата подключения. Тест не начат.')));child.once('spawn',()=>{child.unref();resolve()});
   });
  },
 });
 function handle(channel,fn){ipcMain.handle(channel,(event,...args)=>{
  const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Запрос недоступен.');
  return fn(...args);
 })}
 handle('ping:status',consent=>controller.status(consent===true));
 handle('ping:measure',target=>controller.measure(target));
 handle('ping:compare',(target,consent)=>controller.compare(target,consent===true,true));
 handle('ping:connect',(consent,options)=>controller.connect(consent===true,options));
 handle('ping:disconnect',()=>controller.disconnect());
 handle('ping:cancel',()=>controller.cancel());
 handle('ping:setup',async(page='setup')=>{if(!Object.hasOwn(setupLinks,page))throw Error('Неизвестная ссылка.');await shell.openExternal(setupLinks[page])});
 handle('ping:export',async()=>{
  const report=await controller.report(),state=await controller.status(false);
  const choice=await dialog.showSaveDialog(getWindow(),{title:'Сохранить отчёт о маршрутах',defaultPath:path.join(app.getPath('downloads'),'GTM-PC-ping.json'),filters:[{name:'Отчёт JSON',extensions:['json']}]});
  if(choice.canceled||!choice.filePath)return false;
  await fs.writeFile(choice.filePath,JSON.stringify({format:'gtm-pc-ping-v1',appVersion:app.getVersion(),notice:'ICMP RTT or TCP connection establishment to the selected endpoint; not in-game/voice UDP RTT or download throughput. WARP routes the whole PC.',report:report||null,provider:state.provider,lastFailure:state.lastFailure||null,warning:state.warning||''},null,2),{mode:0o600});return true;
 });
 return controller;
}
module.exports={registerPing};
