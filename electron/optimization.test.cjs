const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,buildPlan}=require('./optimization.cjs');
const input=(extra={})=>({profile:'basic',uses:Object.fromEntries(catalog.features.map(f=>[f.id,true])),power:'keep',game:'none',sysmain:false,selected:['game-mode','transparency'],...extra});
test('basic preset never disables services; all features are preserved by default',()=>{
 const plan=buildPlan(input(),'11','11');
 assert.deepEqual(new Set(plan.ids),new Set(['game-mode','transparency']));
 for(const p of catalog.profiles){assert.deepEqual(new Set(buildPlan(input({profile:p.id}),'10','10').ids),new Set(['game-mode','transparency']))}
});
test('service changes require matching feature answers and profile level',()=>{
 for(const step of catalog.steps.filter(s=>s.feature)){
   const profile=catalog.profiles.find(p=>p.level===step.level).id,version=step.windows[0];
   assert.throws(()=>buildPlan(input({profile,selected:[step.id]}),version,version));
   const plan=buildPlan(input({profile,uses:{...input().uses,[step.feature]:false},selected:[step.id]}),version,version);
   assert.deepEqual(plan.ids,[step.id]);
   assert.throws(()=>buildPlan(input({uses:{...input().uses,[step.feature]:false},selected:[step.id]}),version,version));
 }
});
test('SysMain is opt-in and only available in deep profile',()=>{
 assert.throws(()=>buildPlan(input({profile:'deep',selected:['sysmain']}),'11','11'));
 assert.throws(()=>buildPlan(input({profile:'balanced',sysmain:true,selected:['sysmain']}),'11','11'));
 assert.deepEqual(buildPlan(input({profile:'deep',sysmain:true,selected:['sysmain']}),'11','11').ids,['sysmain']);
});
test('refuses unknown OS, duplicate actions, malformed options and injection',()=>{
 for(const changes of [{profile:'unknown'},{power:';cmd'},{game:'unknown'},{uses:{}},{sysmain:'true'},{selected:['game-mode','game-mode']},{selected:['Defender']},{selected:['__proto__']},{selected:[]}])assert.throws(()=>buildPlan(input(changes),'11','11'));
 assert.throws(()=>buildPlan(input(),'11','10'));
 assert.throws(()=>buildPlan(input(),'12','12'));
 assert.throws(()=>buildPlan(null,'11','11'));
});
test('power and per-game GPU requests require actual choices and a main-process game path',()=>{
 assert.throws(()=>buildPlan(input({selected:['power']}),'11','11'));
 assert.deepEqual(buildPlan(input({power:'high',selected:['power']}),'11','11').ids,['power']);
 assert.throws(()=>buildPlan(input({game:'cs2',selected:['game-gpu']}),'11','11'));
 const plan=buildPlan(input({game:'cs2',selected:['game-gpu']}),'11','11','C:\\Games\\cs2.exe');
 assert.equal(plan.gamePath,'C:\\Games\\cs2.exe');
 assert.equal(buildPlan(input({game:'cs2'}),'11','11','C:\\Games\\cs2.exe').gamePath,null);
});
test('catalog has unique identifiers and excludes protected services and risky commands',()=>{
 assert.equal(new Set(catalog.steps.map(s=>s.id)).size,catalog.steps.length);
 const allowed=['Spooler','bthserv','Fax','WSearch','MapsBroker','WMPNetworkSvc','RemoteRegistry','SysMain'];
 for(const step of catalog.steps.filter(s=>s.service))assert.ok(allowed.includes(step.service));
 const fs=require('node:fs');const script=fs.readFileSync(require('node:path').join(__dirname,'optimizer.ps1'),'utf8');
 assert.doesNotMatch(script,/Stop-Service[^\r\n]*-Force|Remove-AppxPackage|bcdedit|Set-MpPreference|netsh|Remove-Item[^\r\n]*-Recurse/i);
 const registry=require('./registry-specs.json');
 for(const id of catalog.steps.map(s=>s.id))assert.ok(Object.hasOwn(registry,id)||script.includes("'"+id+"'")||script.includes(id+'='),id+' missing in worker');
});

test('basic has 18 choices without disabling services, user functions or machine policies',()=>{
 const basic=catalog.steps.filter(s=>s.level===0&&!s.special);
 assert.equal(basic.length,18);
 assert.ok(basic.every(s=>!s.feature&&!s.service));
 const specs=require('./registry-specs.json');
 for(const step of basic){assert.ok(specs[step.id]?.length);for(const spec of specs[step.id]){assert.notEqual(spec.hive,'machine');assert.notEqual(spec.afterAbsent,true);}}
});
test('recommendations materially differ and a dedicated power scheme is independent of system profile',()=>{
 const basic=['animations','transparency','menu-delay','hover-delay','taskbar-animation','selection-effects','icon-shadows','drag-content','startup-delay','explorer-promos','windows-tips','welcome-promos','lockscreen-facts','start-promos','settings-promos','suggested-installs','search-highlights','game-mode'];
 const medium=[...basic,'fax','edge-startup','edge-background','widgets','restart-apps','delivery-p2p','desktop-peek','power'];
 const deep=[...medium,'maps','media','remote-registry','activity-sync','mmcss'];
 const uses=Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse]));
 for(const [profile,power,selected] of [['basic','keep',basic],['balanced','high',medium],['deep','lagophone',deep]]){
   assert.deepEqual(new Set(buildPlan(input({profile,power,selected,uses}),'10','10').ids),new Set(selected));
 }
 for(const profile of ['basic','balanced','deep'])assert.deepEqual(buildPlan(input({profile,power:'lagophone',selected:['power']}),'11','11').ids,['power']);
});
test('every registry tweak is scoped and independently reversible without duplicate targets',()=>{
 const specs=require('./registry-specs.json'),targets=new Set();
 for(const [id,items] of Object.entries(specs)){
  assert.ok(catalog.steps.some(s=>s.id===id)||id==='power-throttling'&&items.every(s=>s.legacy===true));
  for(const spec of items){
   assert.ok(['DWord','String'].includes(spec.kind));
   assert.ok(!spec.hive||spec.hive==='machine');
   assert.ok(!spec.path.includes('..')&&!spec.path.startsWith('Registry:'));
   const target=[spec.hive||'user',spec.path,spec.name].join('|').toLowerCase();
   assert.ok(!targets.has(target),'Overlapping settings would corrupt batch rollback: '+id);targets.add(target);
  }
 }
});
test('fullscreen experiment is scoped to the chosen executable and keeps the game path in the worker payload',()=>{
 assert.throws(()=>buildPlan(input({profile:'balanced',game:'cs2',selected:['game-fullscreen']}),'11','11'));
 assert.throws(()=>buildPlan(input({game:'cs2',selected:['game-fullscreen']}),'11','11','C:\\Games\\cs2.exe'));
 const result=buildPlan(input({profile:'balanced',game:'cs2',selected:['game-fullscreen']}),'11','11','C:\\Games\\cs2.exe');
 assert.equal(result.gamePath,'C:\\Games\\cs2.exe');assert.deepEqual(result.ids,['game-fullscreen']);
});

test('background power throttling removal is no longer an applicable gaming tweak',()=>{
 assert.equal(catalog.steps.some(s=>s.id==='power-throttling'),false);
 assert.throws(()=>buildPlan(input({profile:'deep',selected:['power-throttling']}),'11','11'));
 const legacy=require('./registry-specs.json')['power-throttling'];assert.ok(legacy.every(s=>s.legacy===true),'Keep exact targets available only for old journal restoration');
});
test('descriptions explain benefits and costs without registry instructions',()=>{
 for(const step of catalog.steps){assert.ok(step.benefit&&step.tradeoff);assert.doesNotMatch(step.detail,/HwSchMode|GpuPreference|PowerThrottlingOff|SystemResponsiveness|HKCU|HKLM|=\s*[0-9]/)}
 for(const id of ['hags','power','mmcss','spooler','bluetooth','game-fullscreen'])assert.ok(catalog.steps.find(s=>s.id===id).attention);
});

test('standalone game optimization accepts only the chosen game actions and no system settings',()=>{
 const selection=input({scope:'game',game:'cs2',selected:['game-gpu','game-priority']});
 const plan=buildPlan(selection,'11','11','C:\Games\cs2.exe',26100);
 assert.equal(plan.scope,'game');assert.equal(plan.game,'cs2');assert.deepEqual(plan.ids,['game-gpu','game-priority']);assert.deepEqual(plan.ratingPlan.ids,[]);
 for(const selected of [['transparency'],['power'],['game-gpu','transparency']])assert.throws(()=>buildPlan({...selection,selected},'11','11','C:\Games\cs2.exe',26100));
 assert.throws(()=>buildPlan({...selection,power:'high'},'11','11','C:\Games\cs2.exe',26100));
 assert.throws(()=>buildPlan(selection,'11','11',null,26100));
 const whitelist=require('./game-executables.json');assert.deepEqual([...whitelist].sort(),[...new Set(catalog.games.flatMap(g=>g.executables))].sort());
 for(const game of ['dota2','cs2','pubg','deadlock','fortnite'])assert.ok(catalog.games.find(g=>g.id===game)?.executables.length);
});

test('standalone power accepts only one power action and carries no system rating plan',()=>{
 const plan=buildPlan({...input({power:'lagophone',selected:['power']}),scope:'power'},'11','11');
 assert.deepEqual(plan.ids,['power']);assert.deepEqual(plan.ratingPlan.ids,[]);assert.equal(plan.scope,'power');
 for(const selected of [['transparency'],['power','transparency'],[]])assert.throws(()=>buildPlan({...input({power:'lagophone',selected}),scope:'power'},'11','11'));
 assert.throws(()=>buildPlan({...input({power:'lagophone',selected:['power'],game:'cs2'}),scope:'power'},'11','11'));
});

test('a manually selected game can receive only game actions',()=>{
 const id='custom-'+'a'.repeat(32),gamePath='D:\\Games\\MyGame.exe';
 const plan=buildPlan(input({scope:'game',game:id,selected:['game-gpu','game-priority']}),'11','11',gamePath);
 assert.equal(plan.game,id);assert.equal(plan.gamePath,gamePath);assert.deepEqual(plan.ids,['game-gpu','game-priority']);
 assert.throws(()=>buildPlan(input({scope:'game',game:id,selected:['game-gpu']}),'11','11',null));
 assert.throws(()=>buildPlan(input({scope:'game',game:id,selected:['transparency']}),'11','11',gamePath));
});
