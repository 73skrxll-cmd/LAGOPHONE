const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const policy=require('./blocking-policy.cjs'),checks=require('./blocking-probe.cjs'),{windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),quote=s=>"'"+String(s).replaceAll("'","''")+"'";
function createBlockingController({app,platform=process.platform,runFile=execFile,series=checks.strategySeries}){
 let configuration={...policy.defaults},dir=null,heartbeat=null,initialization=null,pollTimer=null,reading=false,worker={phase:'idle',message:'',zapret:{running:false,profile:''},fnport:{phase:'idle'}},operation=null,auto=null,lastReport=null,lastFnResult=null,stopping=false,error='',initializing=null,saveTask=Promise.resolve(),workerLaunched=false,providerLast=0;
 const configPath=()=>path.join(app.getPath('userData'),'blocking-settings.json');
 function resources(){return app.isPackaged?path.join(process.resourcesPath,'blocking'):path.join(__dirname,'../assets/blocking')}
 function workerPath(){return app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked/electron/blocking-worker.ps1'):path.join(__dirname,'blocking-worker.ps1')}
 async function init(){if(initialization)return initialization;initialization=(async()=>{try{configuration=policy.settings(JSON.parse(await fs.readFile(configPath(),'utf8')))}catch{}})();return initialization}
 async function save(){const file=configPath(),content=JSON.stringify(configuration);saveTask=saveTask.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',content);await fs.rename(file+'.tmp',file)});return saveTask}
 function snapshot(){return {supported:platform==='win32',phase:platform==='win32'?worker.phase:'unavailable',message:error||worker.message||'',settings:configuration,profiles:policy.profiles,zapret:worker.zapret||{running:false},fnport:worker.fnport||{phase:'idle'},operation,lastReport,lastFnResult,providerCooldownMs:Math.max(0,providerLast+180000-Date.now()),versions:{zapret:'1.10.4',fnport:'0.6.3'}}}
 async function read(){if(reading||!dir)return;reading=true;try{const value=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));if(value.updatedAt&&Date.now()-Date.parse(value.updatedAt)>12000){worker={...worker,phase:'error',message:'Сетевой компонент перестал отвечать; состояние подключения не подтверждено.'};return}worker=value;if(value.fnport?.phase==='checked'){lastFnResult=value.fnport;providerLast=Math.max(providerLast,Date.parse(value.fnport.updatedAt)||0);if(value.fnport.recommend){const rec=value.fnport.recommend;const next=policy.settings({...configuration,fake:rec.fake,ttl:rec.ttl});if(next.fake!==configuration.fake||next.ttl!==configuration.ttl){configuration=next;await save()}}}}catch{}finally{reading=false}}
 async function ensure(){await init();if(platform!=='win32')throw Error('Доступно в Windows 10/11 x64.');if(dir&&worker.phase==='ready')return;if(initializing)return initializing;
  initializing=(async()=>{if(dir)await closeWorker();stopping=false;workerLaunched=false;worker={...worker,phase:'starting',message:''};error='';
   const manifest=JSON.parse(await fs.readFile(path.join(resources(),'manifest.json'),'utf8'));for(const relative of ['fnport/gtm-fnport.exe','fnport/wintun.dll','zapret/bin/winws.exe','zapret/bin/WinDivert64.sys','profiles.json']){const data=await fs.readFile(path.join(resources(),relative));if(crypto.createHash('sha256').update(data).digest('hex')!==manifest.files[relative])throw Error('Проверка целостности компонента не пройдена. Переустановите GTM PC.')}
   dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-blocking-'));await fs.writeFile(path.join(dir,'heartbeat'),'1');heartbeat=setInterval(()=>{if(dir)void fs.writeFile(path.join(dir,'heartbeat'),'1').catch(()=>{})},2000);heartbeat.unref?.();
   const payload=Buffer.from(JSON.stringify({session:crypto.randomUUID().replaceAll('-',''),directory:dir,resources:resources(),parentPid:process.pid,parentStartedAt:new Date(Date.now()-process.uptime()*1000).toISOString()})).toString('base64');
   const argv=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',workerPath(),'-PayloadBase64',payload];const script=`$ErrorActionPreference='Stop';Start-Process -FilePath ${quote(windowsPowerShellExecutable())} -Verb RunAs -WindowStyle Hidden -ArgumentList ${quote(argv.map(v=>'"'+v.replaceAll('"','')+'"').join(' '))}`;
   await new Promise((resolve,reject)=>runFile(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:120000},err=>err?reject(Error('Запрос прав Windows отменён или компонент недоступен.')):(workerLaunched=true,resolve())));
   for(let i=0;i<150;i++){await read();if(worker.phase==='ready'){pollTimer=setInterval(()=>void read(),1000);pollTimer.unref?.();return}if(worker.phase==='error')throw Error(worker.message);await pause(200)}throw Error('Сетевой компонент не ответил.');
  })().catch(async e=>{error=e.message;await closeWorker();throw e}).finally(()=>{initializing=null});return initializing;
 }
 let rpcQueue=Promise.resolve();function rpc(action,values={}){const run=rpcQueue.catch(()=>{}).then(async()=>{await ensure();const id=crypto.randomUUID().replaceAll('-',''),command={id,action,...configuration,...values};await fs.writeFile(path.join(dir,'command.json.tmp'),JSON.stringify(command));await fs.rename(path.join(dir,'command.json.tmp'),path.join(dir,'command.json'));for(let i=0;i<150;i++){await read();if(worker.lastCommand===id){if(worker.commandError)throw Error(worker.commandError);return}if(worker.phase==='error')throw Error(worker.message);await pause(150)}throw Error('Операция не подтверждена сетевым компонентом.')});rpcQueue=run;return run}
 async function select(){
  if(operation)throw Error('Дождитесь текущей операции.');
  if(['running','starting','checking'].includes(worker.fnport?.phase))throw Error('Перед поиском отключите FortniteFix и закройте игры.');
  operation={kind:'selecting',index:0,total:policy.profiles.length+2,label:'Проверка обычного подключения'};
  const controller=new AbortController(),previous=worker.zapret?.running?worker.zapret.profile:null;
  const report={at:new Date().toISOString(),phase:'running',baseline:[],results:[],selected:null,verified:false,message:'Проверяем подключение и перебираем стратегии.'};lastReport=report;auto={controller,promise:null};
  const promise=(async()=>{try{
   await rpc('check-safe');await rpc('zapret-stop');
   report.baseline=await series({signal:controller.signal});
   for(let i=0;i<policy.profiles.length;i++){
    if(controller.signal.aborted)throw Error('Поиск отменён.');const profile=policy.profiles[i];
    operation={kind:'selecting',index:i+1,total:policy.profiles.length+2,label:profile.name};
    try{await rpc('zapret-start',{profile:profile.id,gameFilter:'off'});const rows=await series({signal:controller.signal});report.results.push({profile:profile.id,name:profile.name,rows})}
    catch(e){if(controller.signal.aborted||worker.phase!=='ready'||/WinDivert|Сначала закройте игру/.test(e.message))throw e;report.results.push({profile:profile.id,name:profile.name,rows:[],error:e.message})}
   }
   operation={kind:'selecting',index:policy.profiles.length+1,total:policy.profiles.length+2,label:'Повторная проверка лучших вариантов'};
   const candidates=policy.rank(report.baseline,report.results);
   for(const candidate of candidates){
    if(controller.signal.aborted)throw Error('Поиск отменён.');operation={...operation,label:'Повторная проверка · '+candidate.name};
    await rpc('zapret-start',{profile:candidate.profile,gameFilter:'off'});const repeat=await series({signal:controller.signal});candidate.verification=repeat;
    if(policy.covers(repeat,candidate.rows)&&policy.covers(repeat,report.baseline)){report.selected=candidate.profile;report.verified=true;break}
   }
   report.phase='completed';
   report.message=report.selected?(policy.score(report.results.find(r=>r.profile===report.selected).verification)>policy.score(report.baseline)?'Найден вариант с лучшей доступностью в повторных тестах. Нажмите «Включить выбранную».':'Стратегия прошла повторные тесты. Обычное подключение даёт столько же успешных ответов; голос и видео проверьте в Discord.'):'Стабильно подходящий вариант не найден. Результаты доступны ниже; можно выбрать стратегию и проверить её вручную.';
  }catch(e){report.phase=controller.signal.aborted?'cancelled':'error';report.message=controller.signal.aborted?'Поиск остановлен. Предыдущий режим восстановлен.':e.message;report.selected=null;report.verified=false;if(!controller.signal.aborted)throw e}
  finally{try{
   if(!stopping){let safe=true;try{await rpc('check-safe')}catch(e){safe=false;error=e.message+' Поиск остановлен; текущая стратегия сохранена, чтобы не менять сеть посреди игры.';report.phase='interrupted';report.message=error;report.selected=null;report.verified=false}
    if(safe){if(previous)await rpc('zapret-start',{profile:previous,gameFilter:'off'});else await rpc('zapret-stop');}
   }
   if(report.selected){configuration={...configuration,profile:report.selected,gameFilter:'off'};await save()}
   }catch(e){report.phase='error';report.selected=null;report.verified=false;report.message='Не удалось подтвердить восстановление прежнего режима. '+e.message;throw e}finally{operation=null;auto=null}
  }})();auto.promise=promise;return promise;
 }
 async function closeWorker(){clearInterval(heartbeat);clearInterval(pollTimer);heartbeat=pollTimer=null;if(!dir)return;const old=dir;if(!workerLaunched){dir=null;await fs.rm(old,{recursive:true,force:true}).catch(()=>{});worker={phase:'idle',message:'',zapret:{running:false},fnport:{phase:'stopped'}};return}await fs.writeFile(path.join(old,'stop'),'1').catch(()=>{});let confirmed=false;for(let i=0;i<75;i++){try{await fs.stat(path.join(old,'stopped'));confirmed=true;break}catch{}await pause(200)}if(confirmed){dir=null;setTimeout(()=>void fs.rm(old,{recursive:true,force:true}).catch(()=>{}),3000).unref?.();worker={phase:'idle',message:'',zapret:{running:false},fnport:{phase:'stopped'}}}else{worker={...worker,phase:'error',message:'Остановка компонента ещё не подтверждена. Heartbeat остановлен; компонент завершится после потери связи.'}}}
 async function stop(){stopping=true;if(auto){auto.controller.abort();await auto.promise.catch(()=>{})}await closeWorker()}
 async function action(name){
  await init();error='';
  if(name==='cancel'){if(auto){auto.controller.abort();await auto.promise.catch(()=>{})}return snapshot()}
  if(name==='select'){try{await select()}catch(e){error=e.message}return snapshot()}
  if(operation)throw Error('Сначала остановите поиск стратегии.');
  const applyProfile=name.startsWith('activate-profile:')?name.slice('activate-profile:'.length):null;
  if(applyProfile!==null&&!policy.profiles.some(p=>p.id===applyProfile))throw Error('Недопустимая стратегия.');
  if(applyProfile===null&&!['zapret-start','zapret-stop','fnport-start','fnport-stop','fnport-check','stop-all'].includes(name))throw Error('Недопустимое действие.');
  operation={kind:name,label:'Выполняется…'};
  try{
   if(applyProfile!==null){
    await rpc('zapret-start',{profile:applyProfile,gameFilter:'off'});
    configuration={...configuration,profile:applyProfile,gameFilter:'off'};await save();
   }else{
    if(['zapret-start','fnport-start'].includes(name)&&configuration.gameFilter!=='off'){configuration={...configuration,gameFilter:'off'};await save()}
    if(name==='fnport-check'&&Date.now()-providerLast<180000)throw Error('Повторите проверку провайдера через три минуты после предыдущей.');
    await rpc(name);if(name==='fnport-check')providerLast=Date.now();
    if(['zapret-stop','fnport-stop','stop-all'].includes(name)&&!worker.zapret?.running&&!['running','starting','checking'].includes(worker.fnport?.phase))await closeWorker();
   }
  }catch(e){error=e.message}finally{operation=null}
  return snapshot();
 }
 async function setSettings(value){await init();if(operation||worker.zapret?.running||['running','starting','checking'].includes(worker.fnport?.phase))throw Error('Отключите обход перед изменением настроек.');configuration=policy.settings(value);await save();return snapshot()}
 return {status:async()=>{await init();await read();return snapshot()},action,setSettings,stop,report:async()=>{await init();return {application:'GTM PC',versions:snapshot().versions,settings:configuration,zapret:worker.zapret,fnport:worker.fnport,selection:lastReport,provider:lastFnResult,scope:'HTTPS-проверки и диагностические UDP-пробы не подтверждают вход в матч.'}}};
}
module.exports={createBlockingController};
