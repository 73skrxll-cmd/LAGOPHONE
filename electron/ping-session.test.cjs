const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGameSession,settingsFrom}=require('./ping-session.cjs');
const {acceptsManual,steamLibraries,discoverGames}=require('./ping-games.cjs');
const trial=(n,address='1.1.1.1',iface=3)=>({address,interfaceIndex:iface,method:'icmp',samples:Array.from({length:20},(_,sequence)=>({sequence,status:'success',rttMs:n,at:'2026-11-02T00:00:00Z'}))});
const report=n=>({control:trial(n),gateway:trial(1,'192.168.1.1'),network:{interfaceIndex:3,name:'Wi-Fi',wifi:true,signalPct:70},traffic:{rxMbps:1,txMbps:0},at:'2026-11-02T00:00:00Z'});
function fixture({pauseBits=false,restoreFails=false,launchFails=false,measureFails=false,loaded={},processes=[]}={}){
 const calls=[],writes=[];let time=0,watch=false,measure=0,restored=0,processRows=processes;
 const games=[{id:'pubg',installed:true,path:'C:\\PUBG\\TslGame.exe'},{id:'tarkov',installed:true,launcher:'C:\\BSG\\BsgLauncher.exe'}];
 const controller=createGameSession({platform:'win32',now:()=>time,load:async()=>({settings:{pauseBits},...loaded}),write:async(name,value)=>{writes.push({name,value:structuredClone(value)})},discover:async()=>games,
  watchdog:async()=>{watch=true;calls.push('watchdog')},launch:async()=>{calls.push('launch');if(launchFails)throw Error('launcher failed')},run:async(mode)=>{
   calls.push(mode);if(mode==='restore'){restored++;return {remaining:restoreFails?1:0}}if(mode==='processes')return {games:processRows};if(mode==='bits')return {supported:true,jobs:[{id:'job',state:'Transferring'}]};if(mode==='pause'){assert.equal(watch,true);assert.ok(writes.some(w=>w.name==='journal'&&w.value.owned));return {paused:1}}if(mode==='measure'){if(measureFails)throw Error('no IPv4 route');return report(++measure===1?20:18);}throw Error(mode);
  }});
 return {controller,calls,writes,set time(value){time=value},set processes(rows){processRows=rows},get restored(){return restored}};
}
test('local session diagnoses before/after on the same endpoint, uses no tunnel, launches and restores on stop without killing game',async()=>{
 const f=fixture({pauseBits:true});await f.controller.start();const state=await f.controller.status();assert.equal(state.active,true);assert.equal(state.appliedCount,1);assert.equal(state.comparison.verdict,'unchanged');assert.equal(f.calls.filter(c=>c==='measure').length,2);assert.ok(f.calls.indexOf('pause')<f.calls.indexOf('launch'));await f.controller.stop();assert.equal(f.restored,1);assert.equal((await f.controller.status()).active,false);assert.equal((await f.controller.status()).appliedCount,1);assert.equal(f.calls.includes('kill'),false);
});
test('download pause is opt-in; game already running causes no changes or launch',async()=>{
 const f=fixture();await f.controller.start();assert.equal(f.calls.includes('pause'),false);await f.controller.stop();
 const g=fixture({processes:[{name:'TslGame.exe'}]});await assert.rejects(g.controller.start(),/закрой/);assert.equal(g.calls.includes('pause'),false);assert.equal(g.calls.includes('launch'),false);
});
test('launcher failure restores, recovery failures block restart, crash journal is restored on startup',async()=>{
 const f=fixture({pauseBits:true,launchFails:true});await assert.rejects(f.controller.start(),/launcher/);assert.equal(f.restored,1);
 const g=fixture({loaded:{journal:{owned:true}},restoreFails:true});await g.controller.init();assert.equal((await g.controller.status()).recoveryRequired,true);await assert.rejects(g.controller.start(),/восстанови/);
 const h=fixture({loaded:{journal:{owned:true}}});await h.controller.init();assert.equal(h.restored,1);assert.equal((await h.controller.status()).recoveryRequired,false);
});
test('observed game exit and launcher timeout end session and restore without terminating processes',async()=>{
 const f=fixture();await f.controller.start();f.processes=[{name:'TslGame.exe',path:'C:\\PUBG\\TslGame.exe'}];await f.controller.tick();assert.equal((await f.controller.status()).phase,'running');f.processes=[];await f.controller.tick();assert.equal((await f.controller.status()).active,false);assert.equal(f.restored,1);
 const g=fixture();await g.controller.start();g.time=600001;await g.controller.tick();assert.equal((await g.controller.status()).active,false);
});
test('settings and manual executable constraints survive reload and reject command-like values',()=>{
 assert.equal(settingsFrom({gameId:'tarkov',pauseBits:true,downMbps:-1}).gameId,'tarkov');assert.equal(settingsFrom({downMbps:-1}).downMbps,null);assert.equal(settingsFrom({controlAddress:'127.0.0.1'}).controlAddress,'1.1.1.1');
 assert.equal(acceptsManual('pubg','C:\\Games\\TslGame.exe'),true);for(const p of ['C:\\cmd.exe','\\\\host\\share\\TslGame.exe','C:\\bad\nTslGame.exe'])assert.equal(acceptsManual('pubg',p),false);
 assert.deepEqual(steamLibraries('"1" { "path" "D:\\\\SteamLibrary" }'),['D:\\SteamLibrary']);
});
test('comparison separates targets and interfaces, preserves no replies as absence of data, never implies game packet loss',async()=>{
 const {compareEndpoints,summarizeEndpoint,findings}=await import('../shared/ping-session.mjs');assert.equal(compareEndpoints(trial(40),trial(10)).verdict,'lower');assert.equal(compareEndpoints(trial(40),trial(10,'8.8.8.8')).verdict,'inconclusive');assert.equal(compareEndpoints(trial(40),trial(10,'1.1.1.1',8)).verdict,'inconclusive');
 const none={...trial(0),samples:Array.from({length:20},(_,sequence)=>({sequence,status:'timeout',rttMs:null}))};assert.equal(summarizeEndpoint(none).medianMs,null);assert.equal(compareEndpoints(trial(20),none).verdict,'inconclusive');assert.match(findings({...report(10),gateway:none})[0].text,/не доказывает/);
});
test('discovery reads Steam manifests instead of guessing an installed game from its directory',async()=>{
 const paths=new Set(['D:\\Library\\steamapps\\common\\PUBG\\TslGame\\Binaries\\Win64\\TslGame.exe']);
 const io={stat:async p=>{if(!paths.has(p))throw Error('missing');return {isFile:()=>true}},readFile:async p=>{if(p.endsWith('libraryfolders.vdf'))return '"path" "D:\\\\Library"';if(p.endsWith('appmanifest_578080.acf'))return '"installdir" "PUBG"';throw Error('missing')},readdir:async()=>[]};
 const games=await discoverGames({steam:['C:\\Steam'],epic:[],tarkov:[]},{},io);assert.equal(games[0].installed,true);assert.equal(games[1].installed,false);
});

test('selected game and download preference persist across controller reloads',async()=>{
 const f=fixture();await f.controller.saveSettings({gameId:'tarkov',pauseBits:true,downMbps:100});const saved=f.writes.find(w=>w.name==='settings').value;
 const g=fixture({loaded:{settings:saved}});const state=await g.controller.status();assert.equal(state.settings.gameId,'tarkov');assert.equal(state.settings.pauseBits,true);assert.equal(state.settings.downMbps,100);
});

test('unavailable diagnostics do not invent readings or prevent opening the launcher',async()=>{
 const f=fixture({measureFails:true});await f.controller.start();const state=await f.controller.status();assert.equal(state.active,true);assert.equal(state.latest,null);assert.equal(state.comparison.verdict,'inconclusive');assert.match(state.error,/Диагностика недоступна/);assert.ok(f.calls.includes('launch'));await f.controller.stop();
});
