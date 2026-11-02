const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPingController}=require('./ping-controller.cjs');
const {createOptimizerSession}=require('./optimizer-session.cjs');
const address='3.64.1.1',targetId='fortnite-de';
const trial=value=>({address,method:'icmp',samples:Array.from({length:50},(_,sequence)=>({sequence,at:'2026-11-02T00:00:00Z',status:'success',rttMs:value}))});
function fixture(options={}){
 let connected=false,issued=0,disconnected=0,journal={owned:false},last=null,measured=0,phase='';
 const probes=[],progress=[],activity=[],session=createOptimizerSession();
 const provider=()=>({installed:true,ready:true,managed:false,connected,connectionStatus:connected?'connected':'disconnected',mode:'warp+doh'});
 const transport={inspect:async()=>provider(),connect:async(_consent,mark)=>{await mark();issued++;connected=true},disconnect:async()=>{disconnected++;connected=false},wait:async(value,{signal}={})=>{if(signal?.aborted)throw Error('cancelled');assert.equal(connected,value)},verify:async()=>{assert.equal(connected,true)},watchdogInfo:async()=>({cli:'official-warp-cli.exe'})};
 const probe=async(mode,payload,{signal}={})=>{if(signal?.aborted)throw Error('cancelled');probes.push({mode,...payload});if(mode==='resolve')return {address};if(mode==='route')return {viaWarp:connected};measured++;const {pingTarget}=await import('../shared/ping.mjs');const target=pingTarget(payload.targetId);return {...trial(connected?45:65),targetId:target.id,method:target.method,...(target.port?{port:target.port}:{})}};
 const controller=createPingController({platform:'win32',now:()=>Date.parse('2026-11-02T12:00:00Z'),transport,probe:(...args)=>(options.probe||probe)(...args,{normal:probe,transport,controller}),exclusive:(mode,task)=>session.exclusive(mode,task),load:options.load||(async()=>({})),saveReport:async value=>{last=value},saveJournal:async value=>{if(options.journalFailure)throw Error('disk full');journal=value},watchdog:options.watchdog||(async info=>{assert.ok(info.leaseId)}),onProgress:value=>{phase=value.phase;progress.push(value)},onActivity:async value=>activity.push(value)});
 return {controller,transport,probe,session,progress,probes,activity,get connected(){return connected},set connected(value){connected=value},get issued(){return issued},get disconnected(){return disconnected},get journal(){return journal},get last(){return last},get measured(){return measured},get phase(){return phase}};
}
test('A-B-A pins the endpoint, routes real trials and restores before reporting',async()=>{
 const f=fixture(),r=await f.controller.compare(targetId,true);
 assert.equal(r.comparison.verdict,'improved');assert.equal(r.comparison.gainMs,20);assert.equal(f.measured,3);assert.equal(f.connected,false);assert.equal(f.issued,1);assert.equal(f.disconnected,1);assert.equal(f.journal.owned,false);
 assert.equal(f.probes.filter(p=>p.mode==='resolve').length,1);for(const p of f.probes.filter(p=>p.mode==='measure')){assert.equal(p.address,address);assert.equal(p.count,50)}
 assert.deepEqual(f.progress.map(p=>p.phase),['baseline','connecting','routed','restoring','repeat']);assert.equal(f.session.isRunning(),false);
 await f.controller.connect(true);assert.equal(f.connected,true);assert.equal(f.journal.reason,'manual');await f.controller.disconnect();assert.equal(f.connected,false);
});
test('read-only status during connection cannot erase ownership; optimizer lock rejects overlap',async()=>{
 let continueConnection,started;const ready=new Promise(r=>started=r),f=fixture();
 const original=f.transport.connect;f.transport.connect=async(...args)=>{await original(...args);started();await new Promise(r=>continueConnection=r)};
 const running=f.controller.compare(targetId,true);await ready;
 // Cached state may still say disconnected. Polling must preserve the trial journal.
 assert.equal((await f.controller.status(true)).provider.owned,true);assert.equal(f.journal.connectIssued,true);
 await assert.rejects(f.session.exclusive('apply',async()=>{}),/операция/);await assert.rejects(f.controller.measure(targetId),/проверка/);
 continueConnection();await running;assert.equal(f.disconnected,1);assert.equal(f.connected,false);
});
test('cancelling routed measurement restores owned connection and saves no fabricated report',async()=>{
 const f=fixture({probe:async(mode,payload,options,{normal,controller})=>{if(mode==='measure'&&payload.address&&f.connected){await controller.cancel();throw Error('cancelled')}return normal(mode,payload,options)}});
 await assert.rejects(f.controller.compare(targetId,true),/cancelled/);assert.equal(f.connected,false);assert.equal(f.disconnected,1);assert.equal(f.last,null);assert.equal(f.session.isRunning(),false);
});
test('disconnect failure is a recovery state, never a successful comparison',async()=>{
 const f=fixture();f.transport.disconnect=async()=>{throw Error('service down')};
 await assert.rejects(f.controller.compare(targetId,true),/отключение/);assert.equal(f.last,null);assert.equal((await f.controller.status(true)).recoveryRequired,true);assert.equal(f.journal.owned,true);
});
test('existing WARP, managed WARP and missing consent are never switched',async()=>{
 const f=fixture();await assert.rejects(f.controller.compare(targetId,false),/Разрешите/);assert.equal(f.issued,0);
 f.connected=true;await assert.rejects(f.controller.compare(targetId,true),/подготовьте/);assert.equal(f.disconnected,0);assert.equal(f.issued,0);
 await assert.rejects(f.controller.disconnect(),/не включалось/);assert.equal(f.connected,true);
 f.connected=false;f.transport.inspect=async()=>({ready:true,managed:true,connected:false});await assert.rejects(f.controller.compare(targetId,true));assert.equal(f.issued,0);
});
test('no connection command before durable journal and watchdog; failure does not disconnect foreign route',async()=>{
 const f=fixture({journalFailure:true});await assert.rejects(f.controller.compare(targetId,true),/disk full/);assert.equal(f.issued,0);assert.equal(f.disconnected,0);
 const g=fixture({watchdog:async()=>{throw Error('watchdog failed')}});await assert.rejects(g.controller.compare(targetId,true),/watchdog failed/);assert.equal(g.issued,0);assert.equal(g.disconnected,0);assert.equal(g.journal.owned,false);
 const h=fixture();h.transport.connect=async()=>{h.connected=true;throw Error('foreign connection')};await assert.rejects(h.controller.compare(targetId,true),/foreign connection/);assert.equal(h.disconnected,0);assert.equal(h.connected,true);assert.equal(h.journal.owned,false);
});
test('failure after command issued triggers restoration, including partial connect errors',async()=>{
 const f=fixture();f.transport.connect=async(_consent,mark)=>{await mark();f.connected=true;throw Error('CLI failed after sending')};
 await assert.rejects(f.controller.compare(targetId,true),/CLI failed/);assert.equal(f.connected,false);assert.equal(f.disconnected,1);
});
test('a tunnel that does not carry the Epic destination is never recommended',async()=>{
 const f=fixture({probe:async(mode,payload,options,{normal})=>mode==='route'?{viaWarp:false}:normal(mode,payload,options)});
 await assert.rejects(f.controller.compare(targetId,true),/адаптер WARP/);assert.equal(f.connected,false);assert.equal(f.disconnected,1);assert.equal(f.last,null);
});
test('unreadable journal blocks switching; persisted trial asks for recovery, persisted manual stays explicit',async()=>{
 const f=fixture({load:async()=>({journalError:true})});await assert.rejects(f.controller.compare(targetId,true),/Сначала отключите/);assert.equal(f.issued,0);
 const g=fixture({load:async()=>({journal:{owned:true,reason:'trial',connectIssued:true}})});g.connected=true;assert.equal((await g.controller.status(true)).recoveryRequired,true);await g.controller.disconnect();assert.equal(g.connected,false);
 const h=fixture({load:async()=>({journal:{owned:true,reason:'manual',connectIssued:true}})});h.connected=true;assert.equal((await h.controller.status(true)).provider.owned,true);assert.equal(h.disconnected,0);
});
test('fresh comparison is recomputed, stale or future reports cannot turn on a route',async()=>{
 for(const createdAt of ['2026-11-01T00:00:00Z','2026-11-03T00:00:00Z','broken']){
  const f=fixture({load:async()=>({last:{targetId,method:'icmp',createdAt,comparison:{recommended:'tunnel'},directBefore:trial(65),routed:trial(45),directAfter:trial(65)}})});
  await assert.rejects(f.controller.connect(true),/новое сравнение/);assert.equal(f.issued,0);
 }
 const f=fixture({load:async()=>({last:{targetId,method:'icmp',createdAt:'2026-11-02T12:00:00Z',comparison:{recommended:'tunnel'},directBefore:trial(65),routed:trial(75),directAfter:trial(65)}})});
 await assert.rejects(f.controller.connect(true),/Устойчивого улучшения нет/);assert.equal(f.issued,0);
});

test('Discord and Epic use their own TCP comparison and restore the same global tunnel',async()=>{
 for(const target of ['discord-api','epic-download']){
  const f=fixture(),report=await f.controller.compare(target,true);
  assert.equal(report.targetId,target);assert.equal(report.method,'tcp');assert.equal(report.port,443);assert.equal(report.comparison.verdict,'improved');assert.equal(f.connected,false);
  await f.controller.connect(true);assert.equal(f.connected,true);await f.controller.disconnect();assert.equal(f.connected,false);
 }
});
test('explicit manual routing needs consent and valid target but no Fortnite result, never invents gain',async()=>{
 const f=fixture();await assert.rejects(f.controller.connect(false,{intent:'manual',targetId:'discord-api'}),/Разрешите/);assert.equal(f.issued,0);
 await assert.rejects(f.controller.connect(true,{intent:'manual',targetId:'unknown'}));assert.equal(f.issued,0);
 await assert.rejects(f.controller.connect(true,{intent:'bypass',targetId:'discord-api'}));assert.equal(f.issued,0);
 await f.controller.connect(true,{intent:'manual',targetId:'discord-api'});assert.equal(f.connected,true);assert.equal(f.last,null);assert.equal(f.journal.reason,'manual');assert.equal(f.activity.at(-1).title,'Маршрут включён для всего ПК');
 await f.controller.disconnect();assert.equal(f.connected,false);
});
test('manual route errors return the connection just like verified route errors',async()=>{
 const f=fixture();f.transport.verify=async()=>{throw Error('tunnel proof failed')};
 await assert.rejects(f.controller.connect(true,{intent:'manual',targetId:'epic-download'}),/tunnel proof failed/);assert.equal(f.connected,false);assert.equal(f.disconnected,1);assert.equal(f.journal.owned,false);
});

test('Boost prepares once, runs A-B-A and keeps only an improved route enabled',async()=>{
 const f=fixture();let prepared=0;f.transport.prepare=async consent=>{assert.equal(consent,true);prepared++};
 const report=await f.controller.compare(targetId,true,true);
 assert.equal(prepared,1);assert.equal(report.comparison.verdict,'improved');assert.equal(f.connected,true);assert.equal(f.issued,2);assert.equal(f.journal.reason,'manual');
 await f.controller.disconnect();assert.equal(f.connected,false);
 const g=fixture({probe:async(mode,payload,options,{normal})=>{const r=await normal(mode,payload,options);return mode==='measure'?{...r,samples:trial(65).samples}:r}});
 await g.controller.compare(targetId,true,true);assert.equal(g.connected,false);assert.equal(g.issued,1);
});
test('Boost preparation failure never issues a connection command',async()=>{
 const f=fixture();f.transport.prepare=async()=>{throw Error('UAC cancelled')};
 await assert.rejects(f.controller.compare(targetId,true,true),/UAC cancelled/);assert.equal(f.issued,0);assert.equal(f.measured,0);
});
