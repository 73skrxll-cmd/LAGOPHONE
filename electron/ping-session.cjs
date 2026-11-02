const {randomUUID}=require('node:crypto');
const {gameSpec}=require('./ping-games.cjs');
const DEFAULTS={gameId:'pubg',pauseBits:false,controlAddress:'1.1.1.1',downMbps:null,upMbps:null,manual:{}};
function settingsFrom(value){
 const source=value&&typeof value==='object'?value:{};
 const speed=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000?n:null;
 return {...DEFAULTS,gameId:['pubg','fortnite','tarkov'].includes(source.gameId)?source.gameId:'pubg',pauseBits:source.pauseBits===true,controlAddress:['1.1.1.1','8.8.8.8'].includes(source.controlAddress)?source.controlAddress:'1.1.1.1',downMbps:speed(source.downMbps),upMbps:speed(source.upMbps),manual:source.manual&&typeof source.manual==='object'&&!Array.isArray(source.manual)?source.manual:{}};
}
function createGameSession({run,discover,launch,load,write,watchdog,exclusive=(_,task)=>task(),now=Date.now,platform=process.platform,onChange=()=>{}}){
 let initialized=null,settings={...DEFAULTS},games=[],phase='idle',active=false,before=null,after=null,latest=null,comparison=null,message='',error='',bitsAvailable=0,bitsSupported=false,pausedCount=0,appliedCount=0,recoveryRequired=false,session=null,cancelled=false,polling=false,working=null;
 const emit=()=>onChange();
 async function init(){return initialized||(initialized=(async()=>{
  const saved=await load();settings=settingsFrom(saved.settings);
  if(saved.journal?.owned){recoveryRequired=true;message='Восстанавливаем прерванную сессию.';try{const result=await run('restore');recoveryRequired=result.remaining>0}catch{recoveryRequired=true}if(recoveryRequired)error='Не удалось возобновить фоновые загрузки. Нажми «Остановить» для повторной попытки.'}
  games=await discover(settings.manual);
 })())}
 async function restore(){const result=await run('restore');recoveryRequired=result.remaining>0;if(recoveryRequired)throw Error('Часть загрузок не восстановлена. Повтори остановку.');pausedCount=0}
 async function finish(text){
  phase='restoring';emit();try{await restore();active=false;session=null;phase='idle';message=text;error=''}catch(e){recoveryRequired=true;error=e.message;phase='recovery';throw e}finally{emit()}
 }
 const check=()=>{if(cancelled)throw Error('Запуск отменён.');};
 async function saveSettings(input){await init();if(active||working)throw Error('Сначала останови сессию.');const manual=settings.manual;settings=settingsFrom({...settings,...input,manual});await write('settings',settings);emit();return settings}
 async function start(){
  await init();if(platform!=='win32')throw Error('Запуск доступен в приложении Windows 10/11.');if(active||working)throw Error('Сессия уже запущена.');if(recoveryRequired)throw Error('Сначала восстанови фоновые загрузки.');
  const task=exclusive('ping-game',async()=>{
   cancelled=false;error='';message='Проверяем подключение.';phase='diagnosing';before=null;after=null;latest=null;comparison=null;appliedCount=0;emit();
   try{
    const processes=await run('processes');if(processes.games.length)throw Error('Сначала закрой запущенную игру. Маршрут во время матча не меняется.');check();
    games=await discover(settings.manual);const game=games.find(g=>g.id===settings.gameId);if(!game?.installed)throw Error('Игра не найдена. Укажи её файл вручную.');
    if(game.id==='tarkov'&&!game.launcher)throw Error('Для Tarkov укажи BsgLauncher.exe: запуск напрямую обходит штатный лаунчер.');
    try{before=await run('measure',{controlAddress:settings.controlAddress});latest=before}catch(e){error='Диагностика недоступна: '+e.message}check();
    const bits=await run('bits');bitsAvailable=bits.jobs.length;bitsSupported=bits.supported;
    const leaseId=randomUUID();session={leaseId,gameId:game.id,gamePath:game.path,seen:false,startedAt:now(),lastMeasureAt:now(),lastProcessAt:now(),launchKind:game.id==='tarkov'?'launcher':'game'};
    await write('journal',{owned:true,leaseId,jobs:settings.pauseBits?bits.jobs.map(j=>({...j,intent:false})):[],startedAt:new Date(now()).toISOString()});
    await watchdog(leaseId);check();
    if(settings.pauseBits&&bits.jobs.length){phase='preparing';message='Приостанавливаем фоновые загрузки.';emit();const paused=await run('pause',{leaseId});pausedCount=paused.paused;appliedCount=pausedCount;check()}
    // A second equal series is measured even if no applicable changes exist.
    try{after=await run('measure',{controlAddress:settings.controlAddress});latest=after}catch(e){error='Диагностика недоступна: '+e.message}const {compareEndpoints}=await import('../shared/ping-session.mjs');comparison=compareEndpoints(before?.control,after?.control);check();
    if((await run('processes')).games.length)throw Error('Игра уже запущена. Сессию не переключаем.');
    phase='launching';message='Запускаем игру.';emit();await launch(game);active=true;phase='waiting';message=game.id==='tarkov'?'Лаунчер Tarkov открыт. Нажми «Играть» в лаунчере.':'Ожидаем появления процесса игры.';emit();
   }catch(e){error=e.message;try{await restore();session=null;active=false;phase='idle'}catch{recoveryRequired=true;phase='recovery';error+=' Не удалось восстановить часть загрузок.'}emit();throw Error(error)}
  });
  working=task;try{return await task}finally{working=null}
 }
 async function tick(){
  if(!active||polling||working)return;polling=true;
  try{
   const processes=await run('processes');if(!active||!session)return;
   const spec=gameSpec(session.gameId),running=processes.games.some(p=>p.name.toLowerCase()===spec.process.toLowerCase()&&(!session.gamePath||!p.path||p.path.toLowerCase()===session.gamePath.toLowerCase()));
   if(running){session.seen=true;phase='running';message='Игра запущена. Диагностика активна.'}
   else if(session.seen){await finish('Игра завершена. Фоновые загрузки восстановлены.');return}
   else if(now()-session.startedAt>10*60*1000){await finish('Процесс игры не появился за 10 минут. Сессия остановлена.');return}
   if(active&&session&&now()-session.lastMeasureAt>45000){session.lastMeasureAt=now();const report=await run('measure',{controlAddress:settings.controlAddress});if(active)latest=report}
  }catch(e){error=e.message;message='Сессию можно остановить и восстановить загрузки.'}finally{polling=false;emit()}
 }
 return {
  init,isRunning:()=>!!working||active||recoveryRequired,
  isActive:()=>active||!!working,
  async status(){await init();const {findings}=await import('../shared/ping-session.mjs');return {supported:platform==='win32',phase,active,gameId:session?.gameId||null,settings,games,before,after,latest,findings:findings(latest,settings),comparison,message,error,bitsAvailable,bitsSupported,pausedCount,appliedCount,recoveryRequired,launchKind:session?.launchKind}},
  saveSettings,
  async manual(id,file){await init();if(active||working)throw Error('Сначала останови сессию.');settings.manual={...settings.manual,[id]:file};await write('settings',settings);games=await discover(settings.manual);emit()},
  async refresh(){await init();if(active||working)return;games=await discover(settings.manual);const bits=await run('bits');bitsAvailable=bits.jobs.length;bitsSupported=bits.supported;emit()},
  start,tick,
  async stop(){await init();cancelled=true;if(working)await working.catch(()=>{});return exclusive('ping-game-stop',()=>finish('Сессия остановлена. Игра продолжает работать; фоновые загрузки восстановлены.'))},
 };
}
module.exports={createGameSession,settingsFrom};
