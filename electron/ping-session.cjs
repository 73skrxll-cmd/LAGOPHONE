const {randomUUID}=require('node:crypto');
const {gameSpec}=require('./ping-games.cjs');
const DEFAULTS={gameId:'pubg',pauseBits:false,bitsPromptDismissed:false,controlAddress:'1.1.1.1',downMbps:null,upMbps:null,manual:{},connectionMode:'tunnel',vpnConsent:false};
function settingsFrom(value){
 const source=value&&typeof value==='object'?value:{};
 const speed=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000?n:null;
 return {...DEFAULTS,gameId:['pubg','fortnite','tarkov'].includes(source.gameId)?source.gameId:'pubg',pauseBits:source.pauseBits===true,bitsPromptDismissed:source.bitsPromptDismissed===true,controlAddress:['1.1.1.1','8.8.8.8'].includes(source.controlAddress)?source.controlAddress:'1.1.1.1',downMbps:speed(source.downMbps),upMbps:speed(source.upMbps),connectionMode:['tunnel','diagnostic'].includes(source.connectionMode)?source.connectionMode:'tunnel',vpnConsent:source.vpnConsent===true,manual:source.manual&&typeof source.manual==='object'&&!Array.isArray(source.manual)?source.manual:{}};
}
function createGameSession({run,discover,launch,load,write,watchdog,transport=null,startGate=null,exclusive=(_,task)=>task(),now=Date.now,platform=process.platform,onChange=()=>{}}){
 let initialized=null,settings={...DEFAULTS},games=[],phase='idle',active=false,before=null,after=null,latest=null,comparison=null,message='',error='',bitsAvailable=0,bitsSupported=false,pausedCount=0,appliedCount=0,recoveryRequired=false,session=null,cancelled=false,polling=false,working=null,launchState='idle',scenario=null,checks=[],currentCheck=null,lastFailure=null;
 const emit=()=>onChange();
 async function init(){return initialized||(initialized=(async()=>{
  const saved=await load();settings=settingsFrom(saved.settings);lastFailure=saved.failure||null;checks=Array.isArray(saved.checks)?saved.checks.slice(-30):[];if(transport){await transport.init();const t=await transport.status();if(t.owned){recoveryRequired=true;error=t.error||'Нужно восстановить прошлое подключение GTM PC.'}}
  if(saved.journal?.owned){recoveryRequired=true;message='Восстанавливаем прерванную сессию.';try{const result=await run('restore');recoveryRequired=(transport?(await transport.status()).owned:false)||result.remaining>0}catch{recoveryRequired=true}if(recoveryRequired)error='Не удалось полностью восстановить прошлую сессию. Нажми «Отключить» для повторной попытки.'}
  games=await discover(settings.manual);
 })())}
 async function restore(){const results=await Promise.allSettled([run('restore'),transport?(async()=>{if((await transport.status()).owned)await transport.disconnect()})():Promise.resolve()]);recoveryRequired=results.some(r=>r.status==='rejected')||(results[0].status==='fulfilled'&&results[0].value.remaining>0);if(recoveryRequired)throw Error('Часть изменений не восстановлена. Повтори остановку подключения.');pausedCount=0}
 async function finish(text){
  phase='restoring';emit();try{await restore();active=false;session=null;phase='idle';message=text;error=''}catch(e){recoveryRequired=true;error=e.message;phase='recovery';throw e}finally{emit()}
 }
 const check=()=>{if(cancelled)throw Error('Запуск отменён.');};
 async function saveSettings(input){await init();if(active||working)throw Error('Сначала останови сессию.');const manual=settings.manual;settings=settingsFrom({...settings,...input,manual});await write('settings',settings);emit();return settings}
 async function start(options={}){
  await init();if(platform!=='win32')throw Error('Запуск доступен в приложении Windows 10/11.');if(active||working)throw Error('Сессия уже запущена.');if(recoveryRequired)throw Error('Сначала восстанови настройки сессии.');if(startGate)await startGate();
  const selectedMode=options?.mode||(transport?settings.connectionMode:'diagnostic');if(!['tunnel','direct','gearup','diagnostic'].includes(selectedMode))throw Error('Неизвестный режим запуска.');
  const task=exclusive('ping-game',async()=>{
   cancelled=false;lastFailure=null;await write('failure',null);launchState='idle';scenario=selectedMode;currentCheck=null;error='';message='Проверяем подключение.';phase='diagnosing';before=null;after=null;latest=null;comparison=null;appliedCount=0;emit();
   try{
    const processes=await run('processes');if(processes.games.length)throw Error('Сначала закрой запущенную игру. Маршрут во время матча не меняется.');check();
    games=await discover(settings.manual);const game=games.find(g=>g.id===settings.gameId);if(!game?.installed)throw Error('Игра не найдена. Укажи её файл вручную.');
    if(game.id==='fortnite'&&!game.launchUri)throw Error(game.launchError||'Не подтверждён штатный путь запуска через Epic. Обнови поиск игр.');
    if(game.id==='tarkov'&&!game.launcher)throw Error('Для Tarkov укажи BsgLauncher.exe: запуск напрямую обходит штатный лаунчер.');
    if(transport&&(await transport.status()).owned)throw Error('Сначала отключи прошлое подключение GTM PC.');
    if(transport&&selectedMode==='direct'&&(await run('preflight')).otherVpn)throw Error('Для обычного подключения сначала отключи GearUP и другие VPN самостоятельно. GTM PC их не меняет.');
    if(selectedMode==='diagnostic'){try{before=await run('measure',{controlAddress:settings.controlAddress});latest=before}catch(e){error='Диагностика недоступна: '+e.message}}check();
    const bits=selectedMode==='diagnostic'?await run('bits'):{jobs:[],supported:false};bitsAvailable=bits.jobs.length;bitsSupported=bits.supported;
    const leaseId=randomUUID();session={leaseId,gameId:game.id,gamePath:game.path,seen:false,startedAt:now(),lastMeasureAt:now(),lastProcessAt:now(),mode:selectedMode,launchKind:game.id==='tarkov'?'launcher':'game'};
    await write('journal',{owned:true,leaseId,jobs:settings.pauseBits?bits.jobs.map(j=>({...j,intent:false})):[],startedAt:new Date(now()).toISOString()});
    await watchdog(leaseId);check();
    if(selectedMode==='tunnel'){if(!transport)throw Error('Компонент туннеля недоступен.');phase='connecting';message='Устанавливаем туннель через твой профиль Proton VPN.';emit();await transport.connect(settings.vpnConsent,{gameId:game.id});phase='route-verified';message='Туннель работает, маршрут проверен. Вход в матч ещё не проверен.';emit();check()}
    if(selectedMode==='diagnostic'&&settings.pauseBits&&bits.jobs.length){phase='preparing';message='Приостанавливаем фоновые загрузки.';emit();const paused=await run('pause',{leaseId});pausedCount=paused.paused;appliedCount=pausedCount;check()}
    if(appliedCount>0){try{after=await run('measure',{controlAddress:settings.controlAddress});latest=after}catch(e){error='Диагностика недоступна: '+e.message}const {compareEndpoints}=await import('../shared/ping-session.mjs');const compared=compareEndpoints(before?.control,after?.control);if(compared.verdict!=='inconclusive')comparison=compared}check();
    if((await run('processes')).games.length)throw Error('Игра уже запущена. Сессию не переключаем.');if(selectedMode==='tunnel'&&!(await transport.status()).connected)throw Error('Маршрут потерян до запуска игры. Подключение не засчитано.');check();
    phase='launching';launchState='sending';message='Отправляем запрос штатному лаунчеру.';emit();await launch(game);launchState='request-sent';active=true;phase='waiting';session.startedAt=now();session.lastMeasureAt=now()-45001;message=game.id==='tarkov'?'Запрос отправлен BSG Launcher. Нажми «Играть» в лаунчере.':'Запрос отправлен Epic/Steam. Ожидаем процесс игры.';currentCheck={id:randomUUID(),at:new Date(now()).toISOString(),gameId:game.id,mode:selectedMode,processDetected:false,normal:'not-tested',creative:'not-tested',source:'user-report',country:transport?(await transport.status()).country:null,gamePingMs:null};checks.push(currentCheck);checks=checks.slice(-30);await write('checks',checks);emit();
   }catch(e){lastFailure={at:new Date(now()).toISOString(),phase,code:e.code||'SESSION_ERROR',gameId:settings.gameId};await write('failure',lastFailure).catch(()=>{});launchState='failed';error=e.message;try{await restore();session=null;active=false;phase='idle'}catch{recoveryRequired=true;phase='recovery';error+=' Не удалось восстановить часть настроек сессии.'}emit();throw Error(error)}
  });
  working=task;try{return await task}finally{working=null}
 }
 async function tick(){
  if(!active||polling||working)return;polling=true;
  try{
   const processes=await run('processes');if(!active||!session)return;
   const spec=gameSpec(session.gameId),running=processes.games.some(p=>p.name.toLowerCase()===spec.process.toLowerCase()&&(!session.gamePath||!p.path||p.path.toLowerCase()===session.gamePath.toLowerCase()));
   if(running){session.seen=true;launchState='process-detected';phase='running';message='Процесс игры обнаружен. Результат входа в матч отмечается отдельно ниже.';if(currentCheck&&!currentCheck.processDetected){currentCheck.processDetected=true;await write('checks',checks)}}
   else if(session.seen){await finish('Игра завершена. Наше подключение и паузы загрузок восстановлены.');return}
   else if(now()-session.startedAt>10*60*1000){launchState='timeout';await finish('Ошибка запуска: процесс игры не появился за 10 минут. Настройки восстановлены.');error='Истёк срок ожидания запуска игры.';return}
   if(session.mode==='tunnel'&&transport&&!(await transport.status()).connected){phase='connection-lost';message='Туннель потерян. Регион не переключаем. Останови подключение; вход в матч не подтверждён.';error=message;return}
   if(active&&session&&now()-session.lastMeasureAt>45000){session.lastMeasureAt=now();const report=await run('measure',{controlAddress:settings.controlAddress});if(active){latest=report;if(currentCheck){currentCheck.control=report.control;await write('checks',checks)}}}
  }catch(e){error=e.message;message='Сессию можно остановить и восстановить настройки.'}finally{polling=false;emit()}
 }
 return {
  init,isRunning:()=>!!working||active||recoveryRequired,
  isActive:()=>active||!!working,
  async status(){await init();const tunnel=transport?await transport.status():null;const {findings}=await import('../shared/ping-session.mjs');return {tunnel,launchState,scenario,checks,currentCheck,lastFailure,supported:platform==='win32',phase,active,gameId:session?.gameId||null,settings,games,before,after,latest,findings:findings(latest,settings),comparison,message,error,bitsAvailable,bitsSupported,pausedCount,appliedCount,recoveryRequired,launchKind:session?.launchKind}},
  saveSettings,
  async manual(id,file){await init();if(active||working)throw Error('Сначала останови сессию.');settings.manual={...settings.manual,[id]:file};await write('settings',settings);games=await discover(settings.manual);emit()},
  async refresh(){await init();if(active||working)return;games=await discover(settings.manual);const bits=await run('bits');bitsAvailable=bits.jobs.length;bitsSupported=bits.supported;emit()},
  async markMatch(input){await init();if(!currentCheck)throw Error('Сначала выполни проверочный запуск.');if(!['normal','creative'].includes(input?.kind)||!['success','failure','not-tested'].includes(input?.result))throw Error('Неизвестный результат проверки.');if(!currentCheck.processDetected)throw Error('Процесс игры ещё не обнаружен.');currentCheck[input.kind]=input.result;if(input.gamePingMs!==undefined){currentCheck.gamePingMs=typeof input.gamePingMs==='number'&&Number.isFinite(input.gamePingMs)&&input.gamePingMs>=0&&input.gamePingMs<=5000?input.gamePingMs:null}currentCheck.checkedAt=new Date(now()).toISOString();await write('checks',checks);emit()},
  start,tick,
  async stop(){await init();cancelled=true;transport?.cancel();if(working)await working.catch(()=>{});return exclusive('ping-game-stop',()=>finish('Сессия остановлена. Игра не закрывалась; наши настройки сети и загрузок восстановлены.'))},
 };
}
module.exports={createGameSession,settingsFrom};
