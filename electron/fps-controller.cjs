const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');
const spec=require('../shared/presentmon.json');
const defaultGames=require('./fps-games.cjs');
function detectGames(output,games){const found=[];for(const line of output.split(/\r?\n/)){const match=line.match(/^"((?:[^"]|"")*)","(\d+)"/);if(!match)continue;const game=games.find(g=>g.exe.toLowerCase()===match[1].replaceAll('""','"').toLowerCase());if(game)found.push({id:game.id,name:game.name,pid:Number(match[2])})}return found}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function createFpsController({app,platform=process.platform,runFile=execFile,spawnProcess=spawn,detectInterval=5000}){
 const configFile=()=>path.join(app.getPath('userData'),'fps-settings.json');
 const store=require('./fps-stats.cjs').createFpsStore(()=>path.join(app.getPath('userData'),'fps-sessions.json'));
 let enabled=true,phase='idle',message='',games=[...defaultGames],directory=null,child=null,timer=null,heartbeat=null,launching=null,stopping=null,lastSave=0,initialization=null,generation=0,elevated=false,lastState='',polling=false,detector=null,detecting=false,runningGames=[],captureStopping=false,shutdown=false,captureStartedAt=0;
 const startedAt=new Date(Date.now()-process.uptime()*1000).toISOString();
 function scriptPath(){return app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','fps-worker.ps1'):path.join(__dirname,'fps-worker.ps1')}
 function binaryPath(){return app.isPackaged?path.join(process.resourcesPath,'presentmon','PresentMon.exe'):path.join(__dirname,'../assets/presentmon/PresentMon.exe')}
 function init(){if(initialization)return initialization;initialization=(async()=>{await store.load();try{const saved=JSON.parse(await fs.readFile(configFile(),'utf8'));enabled=saved.enabled!==false;for(const g of saved.custom||[])if(g&&/^custom-[a-f0-9]{32}$/.test(g.id)&&typeof g.exe==='string'&&/^[^<>:"/\\|?*\x00-\x1f]+\.exe$/i.test(g.exe)&&!games.some(x=>x.exe.toLowerCase()===g.exe.toLowerCase()))games.push({id:g.id,name:String(g.name).slice(0,100),exe:g.exe.toLowerCase()})}catch{}if(platform!=='win32'){phase='unavailable';message='Сбор FPS доступен в Windows-версии GTM PC.'}})();return initialization}
 async function config(){await fs.mkdir(path.dirname(configFile()),{recursive:true});await fs.writeFile(configFile()+'.tmp',JSON.stringify({enabled,custom:games.filter(g=>g.id.startsWith('custom-'))}));await fs.rename(configFile()+'.tmp',configFile())}
 function status(){return {enabled,phase,message,supported:platform==='win32',version:spec.version,runningGames,...(enabled?store.snapshot():{games:[]})}}
 async function poll(){if(polling||!directory)return;polling=true;try{const text=await fs.readFile(path.join(directory,'state.json'),'utf8');const observed=JSON.parse(text);if(!captureStopping&&observed.phase==='watching'&&Date.now()-Date.parse(observed.updatedAt)>12000){phase='error';message='Сборщик FPS перестал отвечать. Выключите и снова включите статистику.';clearInterval(heartbeat);heartbeat=null;return;}if(text!==lastState){lastState=text;const data=JSON.parse(text);store.ingest(data.sessions);if(data.phase==='needs-permission'&&!elevated&&enabled&&!captureStopping&&!shutdown){elevated=true;phase='permission';try{await launchWorker(true)}catch(error){phase='error';message=error.message;clearInterval(heartbeat);heartbeat=null;if(directory)await fs.writeFile(path.join(directory,'state.json'),JSON.stringify({phase:'error',message,sessions:[]})).catch(()=>{});}return}if(!captureStopping){phase=data.phase;message=data.message||'';}if(Date.now()-lastSave>15000||['error','stopped'].includes(phase)){await store.save();lastSave=Date.now()}}}catch{if(!captureStopping&&phase==='starting'&&Date.now()-captureStartedAt>30000){phase='error';message='Компонент сбора FPS не ответил. Повторите включение статистики.';clearInterval(heartbeat);heartbeat=null;}}finally{polling=false}}
 async function launchWorker(asAdmin){
  if(!directory||captureStopping||shutdown||!enabled)return;
  const payload={directory,binary:binaryPath(),sessionName:'GTMPC-FPS-'+crypto.randomUUID().replaceAll('-',''),parentPid:process.pid,parentStartedAt:startedAt,games};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64'),args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath(),'-PayloadBase64',encoded];
  lastState='';try{await fs.unlink(path.join(directory,'state.json'))}catch{}
  if(asAdmin){const command=`$p=Start-Process -FilePath ${quote(windowsPowerShellExecutable())} -Verb RunAs -PassThru -WindowStyle Hidden -ArgumentList ${quote(args.map(arg=>'"'+arg.replaceAll('"','')+'"').join(' '))}; $p.Id`;
   await new Promise((resolve,reject)=>runFile(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,env:windowsPowerShellEnvironment(),timeout:120000},error=>error?reject(Error('Запрос прав Windows отменён. Включите сбор FPS снова в настройках.')):resolve()));
  }else{child=spawnProcess(windowsPowerShellExecutable(),args,{windowsHide:true,env:windowsPowerShellEnvironment(),stdio:'ignore'});child.on('error',()=>{phase='error';message='Не удалось запустить компонент сбора FPS.';if(directory)void fs.writeFile(path.join(directory,'state.json'),JSON.stringify({phase:'error',message,sessions:[]})).catch(()=>{})})}
 }
 async function startCapture(){await init();if(!enabled||shutdown||platform!=='win32'||directory||launching)return;const token=++generation;captureStopping=false;captureStartedAt=Date.now();phase='starting';message='';
  launching=(async()=>{try{const bytes=await fs.readFile(binaryPath());if(crypto.createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('Не совпала контрольная сумма PresentMon. Переустановите GTM PC.');if(token!==generation||!enabled)return;directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fps-'));await fs.writeFile(path.join(directory,'heartbeat'),'1');heartbeat=setInterval(()=>{if(directory)void fs.writeFile(path.join(directory,'heartbeat'),'1').catch(()=>{})},2000);heartbeat.unref?.();elevated=false;await launchWorker(false);timer=setInterval(()=>void poll(),1000);timer.unref?.();}catch(error){phase='error';message=error.code==='ENOENT'?'Компонент PresentMon отсутствует. Установите новую сборку GTM PC.':error.message}})().finally(()=>{launching=null});await launching;
 }
 async function stopCapture(){await init();++generation;captureStopping=true;if(stopping)return stopping;stopping=(async()=>{
  clearInterval(timer);clearInterval(heartbeat);timer=heartbeat=null;
  if(directory){const old=directory;let confirmed=false;
   await fs.writeFile(path.join(old,'stop'),'1');
   for(let i=0;i<45;i++){try{const data=JSON.parse(await fs.readFile(path.join(old,'state.json'),'utf8'));store.ingest(data.sessions);if(['stopped','error','needs-permission'].includes(data.phase)){confirmed=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}
   if(!confirmed){phase='error';message='Остановка сбора пока не подтверждена. Компонент завершится после потери связи с GTM PC.';await store.save();return;}
   directory=null;lastState='';setTimeout(()=>void fs.rm(old,{recursive:true,force:true}).catch(()=>{}),3000).unref?.();
  }
  store.finish();await store.save();phase='idle';message='';
 })().finally(()=>{stopping=null});return stopping}
 async function setEnabled(value){if(typeof value!=='boolean')throw Error('Недопустимое значение настройки.');await init();enabled=value;await config();if(value){if(phase==='error')await stopCapture();await arm()}else{clearInterval(detector);detector=null;runningGames=[];await stopCapture()}return status()}
 async function addGame(location){const basename=path.win32.basename(location).toLowerCase();if(!/^[^<>:"/\\|?*\x00-\x1f]+\.exe$/.test(basename))throw Error('Нужен EXE игры.');if(!games.some(g=>g.exe===basename)){games.push({id:'custom-'+crypto.randomUUID().replaceAll('-',''),name:path.win32.basename(location).replace(/\.exe$/i,''),exe:basename});await config();if(enabled){await stopCapture();await detect()}}return status()}
 async function detect(){
  if(detecting||!enabled||shutdown||platform!=='win32')return;detecting=true;
  try{const output=await new Promise((resolve,reject)=>runFile(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','tasklist.exe'),['/fo','CSV','/nh'],{windowsHide:true,timeout:10000,maxBuffer:4*1024*1024,encoding:'utf8'},(error,text)=>error?reject(error):resolve(text)));
   if(!enabled||shutdown)return;const found=detectGames(output,games);runningGames=found;
   if(found.length&&!directory&&phase!=='error')await startCapture();else if(!found.length&&directory){await stopCapture();if(!directory)phase='waiting-game'}else if(!found.length&&phase!=='error')phase='waiting-game';
  }catch{if(!directory){phase='error';message='Не удалось определить запущенные игры. Повторите включение сбора.'}}finally{detecting=false}
 }
 async function arm(){await init();if(!enabled||shutdown||platform!=='win32')return;if(!detector){phase='waiting-game';detector=setInterval(()=>void serial(detect),detectInterval);detector.unref?.()}await detect()}
 async function stopAll(){clearInterval(detector);detector=null;runningGames=[];await stopCapture()}
 let queue=Promise.resolve();const serial=task=>{const result=queue.catch(()=>{}).then(task);queue=result.catch(()=>{});return result};
 return {init,start:()=>serial(arm),stop:()=>{shutdown=true;clearInterval(detector);return serial(stopAll)},setEnabled:value=>serial(()=>setEnabled(value)),addGame:location=>serial(()=>addGame(location)),status:async()=>{await init();return status()}};
}
module.exports={createFpsController,detectGames};
