const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {metrics,cleanSession,publicSession,weekFor,createFpsStore}=require('./fps-stats.cjs');
const {detectGames,createFpsController}=require('./fps-controller.cjs');
const games=require('./fps-games.cjs');
function row(changes={}){return {id:'session-1',gameId:'fortnite',name:'Fortnite',startedAt:'2026-11-10T12:00:10Z',captureStartedAt:'2026-11-10T12:00:02Z',gameStartedAt:'2026-11-10T12:00:00Z',lastAt:'2026-11-10T12:10:00Z',endedAt:'2026-11-10T12:10:05Z',count:100,sumMs:1090,minMs:10,histogram:{100:99,1000:1},alive:false,...changes}}
test('FPS derives only from frame times: weighted average, slowest 1%, instantaneous maximum',()=>{
 assert.deepEqual(metrics(row()),{average:100000/1090,low1:10,maximum:100,frames:100});
 assert.equal(metrics(row({count:99})).low1,null);
 for(const value of [row({count:0}),row({minMs:0}),row({sumMs:NaN}),row({count:1.1})])assert.equal(metrics(value),null);
 assert.equal(metrics(row({histogram:{}})).low1,null);
});
test('duration uses actual game process lifetime; late or stopped captures are explicitly partial',()=>{
 const session=cleanSession(row());assert.equal(session.partialStart,false);
 assert.equal(publicSession(session).durationMs,605000);assert.equal(publicSession(session).partial,false);
 assert.equal(publicSession(cleanSession(row({captureStartedAt:'2026-11-10T12:03:00Z'}))).partial,true);
 assert.equal(publicSession(cleanSession(row({alive:true})),Date.parse('2026-11-10T12:11:00Z')).durationMs,660000);
 assert.equal(publicSession(cleanSession(row({gameStartedAt:null,partialEnd:true}))).partial,true);
 assert.equal(cleanSession(row({lastAt:'2026-11-01T00:00:00Z'})),null);
});
test('seven day history has gaps and averages by frame count/time, never imaginary zero-FPS days',()=>{
 const sessions=[cleanSession(row()),cleanSession(row({id:'session-2',count:100,sumMs:2000,minMs:20,histogram:{200:100}}))];
 const week=weekFor(sessions,'fortnite',new Date('2026-11-13T12:00:00Z'));assert.equal(week.length,7);
 const day=week.find(d=>d.date==='2026-11-10');assert.equal(day.average,200000/3090);assert.equal(day.sessions,2);assert.equal(day.durationMs,1210000);
 assert.equal(week.filter(d=>d.average===null).length,6);
});
test('store is empty at first launch; saves latest session plus history and marks interrupted collection',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fps-test-')),file=()=>path.join(dir,'sessions.json');
 try{const store=createFpsStore(file);await store.load();assert.deepEqual(store.snapshot(),{games:[]});
 const now=new Date(),start=new Date(now-60000).toISOString();store.ingest([row({startedAt:start,gameStartedAt:start,lastAt:now.toISOString(),endedAt:null,alive:true})]);await store.save();
 const restored=createFpsStore(file);await restored.load();const game=restored.snapshot().games[0];assert.equal(game.name,'Fortnite');assert.equal(game.alive,false);assert.equal(game.partialEnd,true);assert.equal(game.frames,100);
 store.finish();assert.equal(store.snapshot().games[0].alive,false);
 assert.equal(JSON.stringify(store.snapshot()).includes('C:\\'),false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('game detection recognizes gameplay processes and ignores launchers, anti-cheat and other apps',()=>{
 const found=detectGames('"EpicGamesLauncher.exe","10","Console"\r\n"FortniteClient-Win64-Shipping.exe","123","Console"\r\n"chrome.exe","124","Console"\r\n"TslGame.exe","125","Console"',games);
 assert.deepEqual(found.map(g=>[g.name,g.pid]),[['Fortnite',123],['PUBG: BATTLEGROUNDS',125]]);
 assert.equal(detectGames('"EasyAntiCheat.exe","1"\n"cs2.exe","2"',games)[0].id,'cs2');
});
test('enabled collection waits for a recognized game, starts no capture in idle, disabled stops detection',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fps-controller-'));let calls=0,spawns=0;
 const app={isPackaged:false,getPath:()=>dir};
 const controller=createFpsController({app,platform:'win32',detectInterval:20,runFile:(exe,args,opts,cb)=>{calls++;assert.ok(exe.endsWith('tasklist.exe'));cb(null,'"chrome.exe","12"')},spawnProcess:()=>{spawns++;throw Error('Capture started without a game')}});
 try{await controller.start();assert.equal((await controller.status()).enabled,true);assert.equal((await controller.status()).phase,'waiting-game');await new Promise(r=>setTimeout(r,70));assert.ok(calls>=2);assert.equal(spawns,0);
 await controller.setEnabled(false);const before=calls;await new Promise(r=>setTimeout(r,70));assert.equal(calls,before);assert.equal((await controller.status()).enabled,false);
 const restored=createFpsController({app,platform:'win32',runFile:()=>{throw Error('disabled detection')}});await restored.start();assert.equal((await restored.status()).enabled,false);await restored.stop();
 }finally{await controller.stop();await fs.rm(dir,{recursive:true,force:true})}
});
test('capture begins on recognized game only, stops at game exit, and resumes for a later session',{skip:!require('node:fs').existsSync(path.join(__dirname,'../assets/presentmon/PresentMon.exe'))},async()=>{
 const {EventEmitter}=require('node:events');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fps-lifecycle-'));let running=false,spawns=0;const loops=[];
 const controller=createFpsController({app:{isPackaged:false,getPath:()=>dir},platform:'win32',detectInterval:20,runFile:(_exe,_args,_opts,cb)=>cb(null,running?'"cs2.exe","123"':'"EpicGamesLauncher.exe","12"'),spawnProcess:(_exe,args)=>{
  spawns++;const payload=JSON.parse(Buffer.from(args.at(-1),'base64').toString());const state=path.join(payload.directory,'state.json');
  const loop=setInterval(async()=>{try{const stop=await fs.readFile(path.join(payload.directory,'stop'),'utf8').then(()=>true,()=>false);await fs.writeFile(state,JSON.stringify({phase:stop?'stopped':'watching',sessions:[],updatedAt:new Date().toISOString()}));if(stop)clearInterval(loop)}catch{}},10);loops.push(loop);return new EventEmitter();
 }});
 const until=async condition=>{for(let i=0;i<100;i++){if(await condition())return;await new Promise(r=>setTimeout(r,20))}throw Error('Capture lifecycle timed out')};
 try{await controller.start();assert.equal(spawns,0);running=true;await until(()=>spawns===1);running=false;await until(async()=>((await controller.status()).phase==='waiting-game'));assert.equal(spawns,1);running=true;await until(()=>spawns===2);await controller.setEnabled(false);assert.equal((await controller.status()).enabled,false);const count=spawns;await new Promise(r=>setTimeout(r,60));assert.equal(spawns,count);
 }finally{await controller.stop();for(const loop of loops)clearInterval(loop);await fs.rm(dir,{recursive:true,force:true})}
});
