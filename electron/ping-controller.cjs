const {randomUUID}=require('node:crypto');
function createPingController({probe,transport,exclusive=(_,task)=>task(),load=async()=>({}),saveReport=async()=>{},saveJournal=async()=>{},onProgress=()=>{},onActivity=async()=>{},watchdog=async()=>{},platform=process.platform,now=Date.now}){
 let operation=null,abort=null,last=null,lastFailure=null,journal={owned:false},warning='',recoveryRequired=false,inspection=null,cached=null,initialized=null;
 const init=()=>initialized||(initialized=Promise.resolve().then(load).then(async data=>{
  const {pingTarget,summarizePing}=await import('../shared/ping.mjs');
  if(data.warning)warning=data.warning;
  if(data.journalError){recoveryRequired=true;warning='Не удалось прочитать журнал маршрута. Проверьте состояние WARP вручную; новое переключение заблокировано.'}
  if(data.last){try{pingTarget(data.last.targetId);for(const name of ['baseline','directBefore','routed','directAfter'])if(data.last[name])summarizePing(data.last[name].samples);last=data.last}catch{warning='Сохранённый отчёт повреждён. Выполните новый замер.'}}
  if(data.journal?.owned===true&&['trial','manual'].includes(data.journal.reason))journal=data.journal;
 }).catch(()=>{warning='Не удалось прочитать состояние проверки сети.'}));
 async function inspect(consent=false){
  if(inspection)return inspection;
  inspection=Promise.resolve().then(()=>transport.inspect(consent)).then(state=>{cached=state;return state}).finally(()=>{inspection=null});return inspection;
 }
 async function recordJournal(value){await saveJournal(value);journal=value}
 async function verifyRoute(targetId,address,viaWarp,signal){
  const route=await probe('route',{targetId,address},{signal});
  if(route.viaWarp!==viaWarp)throw Error(viaWarp?'Не подтверждён маршрут к выбранному сервису через адаптер WARP. Ускорение не засчитано.':'Маршрут к выбранному сервису изменился. Повторите тест с отключённым WARP.');
 }
 function emitPhase(phase,target,address){operation.phase=phase;onProgress({phase,targetId:target,address,count:50})}
 async function measure(targetId,address,phase,signal){
  emitPhase(phase,targetId,address);
  return probe('measure',{targetId,address,count:50},{signal,onSample:sample=>onProgress({phase,targetId,address,sample,count:50})});
 }
 async function restore(){
  if(!journal.owned)return;
  if(!journal.connectIssued){await recordJournal({owned:false,updatedAt:new Date(now()).toISOString()});return}
  if(operation)operation.phase='restoring';
  await transport.disconnect();await transport.wait(false);
  await recordJournal({owned:false,updatedAt:new Date(now()).toISOString()});recoveryRequired=false;await inspect(true);
 }
 async function enter(kind,targetId,task){
  if(platform!=='win32')throw Error('Проверка сети доступна в Windows-приложении.');
  await init();if(operation)throw Error('Уже выполняется проверка сети.');
  return exclusive('ping',async()=>{
   operation={kind,phase:'preparing',targetId,startedAt:new Date(now()).toISOString()};abort=new AbortController();
   try{const result=await task(abort.signal);lastFailure=null;return result}catch(error){lastFailure={kind,targetId,phase:operation.phase,at:new Date(now()).toISOString(),message:String(error.message||'Ошибка проверки сети.').slice(0,500)};throw error}finally{operation=null;abort=null}
  });
 }
 async function store(report){await saveReport(report);last=report;return report}
 async function ownRoute(reason,consent){
  if(abort.signal.aborted)throw Error('Проверка отменена.');
  const state=await inspect(consent);
  if(!state.ready||state.managed)throw Error(state.error||'Подготовьте официальный Cloudflare WARP.');
  if(state.connected)throw Error('WARP был включён вне GTM PC. Отключите его вручную перед сравнением; программа не изменяет чужое подключение.');
  await recordJournal({owned:true,connectIssued:false,reason,leaseId:randomUUID(),mode:state.mode,updatedAt:new Date(now()).toISOString()});
  if(reason==='trial')await watchdog({...await transport.watchdogInfo(),leaseId:journal.leaseId});
  if(abort.signal.aborted)throw Error('Проверка отменена.');
  await transport.connect(consent,()=>recordJournal({...journal,connectIssued:true}));await transport.wait(true,{signal:abort.signal});await transport.verify({signal:abort.signal});cached={...state,connected:true,connectionStatus:'connected'};
 }
 return {
  isRunning:()=>operation!==null,
  async status(consent=false){
   await init();const provider=operation&&cached?cached:await inspect(consent);
   if(!operation&&provider.connectionStatus==='disconnected'&&(journal.owned||recoveryRequired)){await recordJournal({owned:false,updatedAt:new Date(now()).toISOString()});recoveryRequired=false;if(warning.includes('журнал'))warning='Исходное подключение подтверждено. Журнал восстановлен.'}
   if(journal.owned&&!journal.connectIssued&&!operation)await recordJournal({owned:false,updatedAt:new Date(now()).toISOString()});
   if(journal.owned&&!operation&&(journal.reason==='trial'||!['connected','disconnected'].includes(provider.connectionStatus)))recoveryRequired=true;
   return {supported:platform==='win32',running:!!operation,operation:operation?{...operation}:null,provider:{...provider,owned:journal.owned},last,lastFailure,recoveryRequired,warning};
  },
  measure:targetId=>enter('measure',targetId,async signal=>{
   const {pingTarget}=await import('../shared/ping.mjs');const target=pingTarget(targetId);
   const resolved=await probe('resolve',{targetId},{signal});
   const baseline=await measure(targetId,resolved.address,'baseline',signal);
   return store({id:randomUUID(),kind:'baseline',targetId,address:resolved.address,method:target.method,...(target.port?{port:target.port}:{}),createdAt:new Date(now()).toISOString(),baseline});
  }),
  compare:(targetId,consent)=>enter('compare',targetId,async signal=>{
   if(consent!==true)throw Error('Разрешите тестовое переключение всего трафика через WARP.');
   const {pingTarget,comparePingTrials}=await import('../shared/ping.mjs');const target=pingTarget(targetId);
   if(recoveryRequired||journal.owned)throw Error('Сначала отключите маршрут GTM PC и проверьте исходное подключение.');
   const provider=await inspect(true);if(!provider.ready||provider.managed||provider.connected)throw Error(provider.error||'Сначала подготовьте WARP и оставьте его отключённым.');
   const resolved=await probe('resolve',{targetId},{signal}),address=resolved.address;
   await verifyRoute(targetId,address,false,signal);
   const directBefore=await measure(targetId,address,'baseline',signal);
   await verifyRoute(targetId,address,false,signal);
   let routed;
   try{
    emitPhase('connecting',targetId,address);await ownRoute('trial',true);
    await verifyRoute(targetId,address,true,signal);
    routed=await measure(targetId,address,'routed',signal);await transport.verify({signal});await verifyRoute(targetId,address,true,signal);
   }finally{
    if(journal.owned){emitPhase('restoring',targetId,address);try{await restore()}catch{recoveryRequired=true;throw Error('Не удалось подтвердить отключение внешнего маршрута. Отключите WARP вручную или повторите восстановление в GTM PC.')}}
   }
   await verifyRoute(targetId,address,false,signal);
   const directAfter=await measure(targetId,address,'repeat',signal);
   await verifyRoute(targetId,address,false,signal);
   const comparison=comparePingTrials(directBefore,routed,directAfter);
   const report=await store({id:randomUUID(),kind:'comparison',targetId,address,method:target.method,...(target.port?{port:target.port}:{}),createdAt:new Date(now()).toISOString(),directBefore,routed,directAfter,comparison});
   await onActivity({target:{page:'ping'},kind:'network',status:comparison.verdict==='improved'?'success':'warning',title:`${target.game}: сравнение маршрутов завершено`,detail:comparison.verdict==='improved'?`${target.method==='tcp'?'TCP-подключение':'ICMP до тестового сервера'} быстрее на ${comparison.gainMs} мс. Исходное подключение восстановлено.`:'Надёжное снижение задержки не подтверждено. Исходное подключение сохранено.'});
   return report;
  }),
  connect:(consent,options)=>enter('connect',options?.targetId||last?.targetId,async signal=>{
   if(consent!==true)throw Error('Разрешите подключение через WARP.');
   if(recoveryRequired||journal.owned)throw Error('Сначала отключите маршрут GTM PC и проверьте исходное подключение.');
   const {pingTarget,comparePingTrials}=await import('../shared/ping.mjs');
   let targetId,address;
   if(options!==undefined){
    if(!options||typeof options!=='object'||Array.isArray(options)||options.intent!=='manual')throw Error('Неизвестный режим подключения.');
    pingTarget(options.targetId);targetId=options.targetId;address=(await probe('resolve',{targetId},{signal})).address;
   }else{
    const age=now()-Date.parse(last?.createdAt);
    if(!last?.comparison||!Number.isFinite(age)||age<0||age>30*60*1000)throw Error('Сначала выполните новое сравнение маршрутов.');
    const target=pingTarget(last.targetId);
    if(last.method!==target.method||last.directBefore?.method!==target.method||comparePingTrials(last.directBefore,last.routed,last.directAfter).recommended!=='tunnel')throw Error('Устойчивого улучшения нет. Оставлено исходное подключение.');
    targetId=last.targetId;address=last.address;
   }
   try{await ownRoute('manual',true);await verifyRoute(targetId,address,true,signal)}catch(error){if(journal.owned){try{await restore()}catch{recoveryRequired=true}}throw error}
   await onActivity({target:{page:'ping'},kind:'network',status:'success',title:options?'Маршрут включён для всего ПК':'Проверенный маршрут включён',detail:'Fortnite, Discord и Epic Games используют туннель Cloudflare WARP вместе с остальным трафиком ПК. Качество игры, голоса и загрузок нужно проверить в приложениях.'});
  }),
  disconnect:()=>enter('disconnect',null,async()=>{if(!journal.owned)throw Error('Это подключение не включалось GTM PC. Отключите его в официальном WARP.');await restore();await onActivity({target:{page:'ping'},kind:'network',status:'success',title:'Маршрут GTM PC отключён',detail:'Возвращено исходное подключение.'})}),
  cancel:async()=>{abort?.abort()},
  report:async()=>{await init();return last},
 };
}
module.exports={createPingController};
