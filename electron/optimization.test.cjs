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
   const profile=catalog.profiles.find(p=>p.level===step.level).id;
   assert.throws(()=>buildPlan(input({profile,selected:[step.id]}),'11','11'));
   const plan=buildPlan(input({profile,uses:{...input().uses,[step.feature]:false},selected:[step.id]}),'11','11');
   assert.deepEqual(plan.ids,[step.id]);
   assert.throws(()=>buildPlan(input({uses:{...input().uses,[step.feature]:false},selected:[step.id]}),'11','11'));
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
test('recommendations materially differ and a dedicated power scheme is restricted to deep',()=>{
 const basic=['animations','transparency','menu-delay','hover-delay','taskbar-animation','selection-effects','icon-shadows','drag-content','startup-delay','explorer-promos','windows-tips','welcome-promos','lockscreen-facts','start-promos','settings-promos','suggested-installs','search-highlights','game-mode'];
 const medium=[...basic,'fax','edge-startup','edge-background','widgets','restart-apps','delivery-p2p','desktop-peek','power'];
 const deep=[...medium,'maps','media','remote-registry','activity-sync','mmcss'];
 const uses=Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse]));
 for(const [profile,power,selected] of [['basic','keep',basic],['balanced','high',medium],['deep','lagophone',deep]]){
   assert.deepEqual(new Set(buildPlan(input({profile,power,selected,uses}),'11','11').ids),new Set(selected));
 }
 assert.throws(()=>buildPlan(input({power:'lagophone',selected:['power']}),'11','11'));
 assert.throws(()=>buildPlan(input({profile:'balanced',power:'lagophone',selected:['power']}),'11','11'));
});
test('every registry tweak is scoped and independently reversible without duplicate targets',()=>{
 const specs=require('./registry-specs.json'),targets=new Set();
 for(const [id,items] of Object.entries(specs)){
  assert.ok(catalog.steps.some(s=>s.id===id));
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
