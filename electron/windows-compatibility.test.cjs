const {test}=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../shared/optimization.json'),specs=require('./registry-specs.json');const {buildPlan}=require('./optimization.cjs');const {forWindows,supportsWindows}=require('../shared/windows-compatibility.mjs');
const input=extra=>({profile:'deep',uses:Object.fromEntries(catalog.features.map(f=>[f.id,false])),power:'keep',game:'none',sysmain:false,selected:['game-mode'],...extra});
test('selected Windows changes actual actions, feature names and profile counts',()=>{
 const ten=forWindows(catalog.steps,'10',19045),eleven=forWindows(catalog.steps,'11',26100);
 assert.ok(ten.some(s=>s.id==='activity-sync'));assert.ok(ten.some(s=>s.id==='desktop-peek'));assert.ok(!eleven.some(s=>['activity-sync','desktop-peek'].includes(s.id)));
 assert.match(ten.find(s=>s.id==='widgets').name,/Новости и интересы/);assert.match(eleven.find(s=>s.id==='widgets').name,/виджетов/);
 assert.deepEqual(catalog.profiles.map(p=>ten.filter(s=>!s.special&&s.level<=p.level).length),[18,34,42]);assert.deepEqual(catalog.profiles.map(p=>eleven.filter(s=>!s.special&&s.level<=p.level).length),[18,33,40]);
 assert.ok(!forWindows(catalog.features,'11').some(f=>['activitySync','peek'].includes(f.id)));
});
test('builder refuses incompatible Windows IDs and build-specific features even if a renderer sends them',()=>{
 for(const id of ['activity-sync','desktop-peek'])assert.throws(()=>buildPlan(input({selected:[id]}),'11','11',null,26100));
 assert.deepEqual(buildPlan(input({selected:['activity-sync']}),'10','10',null,19045).ids,['activity-sync']);
 for(const [id,build] of [['activity-sync',14393],['game-mode',14393],['widgets',17763],['search-highlights',19041],['hags',18363],['restart-apps',18363]])assert.throws(()=>buildPlan(input({selected:[id]}),'10','10',null,build));
 assert.throws(()=>buildPlan(input({game:'cs2',selected:['game-gpu']}),'10','10','C:\\Games\\cs2.exe',16299));
 assert.throws(()=>buildPlan(input(),'10','11',null,26100));assert.throws(()=>buildPlan(input(),'10','10',null,26100));assert.throws(()=>buildPlan(input(),'11','11',null,19045));
});
test('catalog compatibility matches concrete worker targets; legacy snapshot targets remain restorable',()=>{
 for(const step of catalog.steps){assert.ok(Array.isArray(step.windows)&&step.windows.length);const rows=specs[step.id];if(!rows)continue;for(const [version,build] of [['10',14393],['10',17763],['10',19045],['11',22000],['11',26100]]){const targetSupported=rows.some(spec=>(!spec.minBuild||build>=spec.minBuild)&&(!spec.maxBuild||build<=spec.maxBuild));assert.equal(supportsWindows(step,version,build),targetSupported,step.id+' @ '+build)}}
 const widgets=specs.widgets;assert.ok(widgets.find(s=>s.minBuild===22000&&s.name==='AllowNewsAndInterests'));assert.ok(widgets.find(s=>s.maxBuild===21999&&s.name==='ShellFeedsTaskbarViewMode'));assert.ok(specs['activity-sync'].every(s=>s.maxBuild===21999));
});

test('optional privacy and Explorer settings require an explicit compatible profile selection',()=>{
 const ids=['advertising-id','explorer-recent','explorer-frequent'];
 for(const id of ids){
  const step=catalog.steps.find(s=>s.id===id);
  assert.equal(step.defaultSelected,false);assert.equal(step.level,1);assert.ok(step.attention&&step.tradeoff);
  assert.ok(specs[id].every(s=>!s.hive&&!s.audit&&!s.afterAbsent&&s.kind==='DWord'&&s.value===0&&s.minBuild===10240&&s.restart));
  assert.throws(()=>buildPlan(input({profile:'basic',selected:[id]}),'10','10',null,19045));
  assert.throws(()=>buildPlan(input({selected:[id]}),'10','10',null,10239));
  for(const [version,build] of [['10',10240],['10',19045],['11',22000],['11',26100]]){
   for(const profile of ['balanced','deep'])assert.deepEqual(buildPlan(input({profile,selected:[id]}),version,version,null,build).ids,[id]);
  }
 }
 // Each checkbox changes only its own setting; no implicit companion actions.
 assert.deepEqual(ids.map(id=>specs[id][0].name),['Enabled','ShowRecent','ShowFrequent']);
});
