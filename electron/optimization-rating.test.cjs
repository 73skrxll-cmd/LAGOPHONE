const {test}=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../shared/optimization.json'),specs=require('./registry-specs.json');
const {buildPlan}=require('./optimization.cjs');
async function fixture(){const module=await import('../shared/optimization-rating.mjs');return {...module,status:(matched=18)=>({ok:true,active:false,checks:[{id:'game-mode',enabled:true}],audit:{basis:'baseline-v1',checkedAt:'2026-10-31T12:00:00Z',checks:module.baselineIds.map((id,i)=>({id,available:true,enabled:i<matched}))}})}}
function applied(s,profile='deep',game=true){
 const checks=[{id:'edge-background',tier:1,available:true,enabled:true},...(profile==='deep'?[{id:'maps',tier:2,available:true,enabled:true}]:[]),...(game?[{id:'game-gpu',tier:3,available:true,enabled:true}]:[])];
 return {...s,active:true,profile,profileAudit:{basis:'profiles-v2',profile,expectedIds:checks.map(r=>r.id),checks}};
}
test('baseline remains complete and alone can reach only weak, including the reported 13/18 case',async()=>{
 const f=await fixture();assert.equal(f.baselineIds.length,18);
 assert.deepEqual([...f.baselineIds].sort(),catalog.steps.filter(s=>s.level===0&&!s.special).map(s=>s.id).sort());
 assert.deepEqual([...f.baselineIds].sort(),Object.keys(specs).filter(id=>specs[id][0].audit).sort());
 for(let count=0;count<=18;count++){const r=f.optimizationRating({status:f.status(count)});assert.ok(['poor','weak'].includes(r.level));assert.ok(r.percent<=30)}
 assert.equal(f.optimizationRating({status:f.status(13)}).level,'weak');assert.equal(f.optimizationRating({status:f.status()}).percent,30);
});
test('actual medium, deep and game checks determine the five levels, never a draft profile name',async()=>{
 const f=await fixture();
 for(const [s,level,percent] of [[f.status(0),'poor',0],[f.status(),'weak',30],[applied(f.status(),'balanced',false),'medium',60],[applied(f.status(),'deep',false),'good',90],[applied(f.status()),'ideal',100]]){
  const result=f.optimizationRating({status:s});assert.equal(result.level,level);assert.equal(result.percent,percent);
 }
 for(const extra of [{profile:'deep'},{profile:'deep',active:true},{last:{ok:true,profile:'deep'}}])assert.equal(f.optimizationRating({status:{...f.status(),...extra}}).level,'weak');
});
test('external changes, missing EXE, rollback, incomplete or duplicated results cannot retain ideal',async()=>{
 const f=await fixture();
 for(const mutate of [s=>s.audit.checks[0].enabled=false,s=>s.profileAudit.checks[0].enabled=false,s=>s.profileAudit.checks[1].enabled=false,s=>s.profileAudit.checks[2].enabled=false,s=>s.profileAudit.checks[2].available=false,s=>s.profileAudit.checks[1].available=false,s=>s.profileAudit.checks.pop(),s=>s.profileAudit.checks.push(s.profileAudit.checks[0]),s=>s.profileAudit.checks[0].enabled=null,s=>s.profileAudit.basis='unknown',s=>s.active=false,s=>s.profile='basic']){
  const s=applied(f.status());mutate(s);assert.notEqual(f.optimizationRating({status:s}).level,'ideal');
 }
 const empty=applied(f.status());empty.profileAudit.checks=[];empty.profileAudit.expectedIds=[];assert.equal(f.optimizationRating({status:empty}).level,'weak');
});
test('legacy, partial baseline, live operations, errors, recovery and demo cannot give a false rating',async()=>{
 const f=await fixture();assert.equal(f.optimizationRating({status:{ok:true,active:false,checks:[{id:'game-mode',enabled:true}]}}).level,null);
 for(const mutate of [s=>s.audit.checks.pop(),s=>s.audit.checks.push(s.audit.checks[0]),s=>s.audit.checks[0].enabled=null,s=>s.audit.basis='unknown',s=>s.audit.checks.forEach((r,i)=>{if(i>3){r.available=false;r.enabled=null}})]){const s=f.status();mutate(s);assert.equal(f.optimizationRating({status:s}).level,null)}
 const s=applied(f.status());for(const options of [{status:{...s,needsRecovery:true}},{status:{...s,running:true}},{status:s,error:'Windows failed'},{status:s,native:false},{status:null}])assert.equal(f.optimizationRating(options).level,null);
 s.audit.checks[0]={id:f.baselineIds[0],available:false,enabled:null};assert.equal(f.optimizationRating({status:s}).level,'ideal');
});
test('rating plan respects protected functions, build compatibility and optional experiments, but includes deselected required checks',()=>{
 const uses=Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse]));
 const plan=buildPlan({profile:'deep',uses,power:'keep',game:'cs2',sysmain:false,selected:['game-gpu']},'11','11','C:\\Games\\cs2.exe',26100);
 assert.equal(plan.ratingPlan.basis,'profiles-v2');
 for(const id of ['sysmain','hags','mmcss','game-fullscreen','advertising-id','explorer-recent','explorer-frequent','activity-sync','desktop-peek','spooler','search','onedrive-startup'])assert.ok(!plan.ratingPlan.ids.includes(id),id);
 for(const id of ['transparency','edge-background','maps','media','remote-registry'])assert.ok(plan.ratingPlan.ids.includes(id),id);
 assert.equal(plan.ids.length,1);assert.equal(plan.gamePath,'C:\\Games\\cs2.exe');
});

test('registry tier metadata matches the catalog used to build persisted plans',()=>{for(const step of catalog.steps){if(specs[step.id])assert.equal(specs[step.id][0].tier,step.level,step.id)}});
