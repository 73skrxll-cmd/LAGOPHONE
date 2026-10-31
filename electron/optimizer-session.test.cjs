const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOptimizerSession}=require('./optimizer-session.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
test('only a live operation owns the lock; phases and completion are tracked',async()=>{
 const s=createOptimizerSession(()=>1234),gate=deferred();
 const task=s.exclusive('restore',async phase=>{phase('confirmation');await gate.promise;phase('windows');return 'done'});
 assert.equal(s.isRunning(),true);assert.deepEqual(s.current(),{mode:'restore',phase:'confirmation',startedAt:1234});
 await assert.rejects(s.exclusive('apply',async()=>{}),/Уже выполняется/);
 const copy=s.current();copy.phase='fake';assert.equal(s.current().phase,'confirmation');
 gate.resolve();assert.equal(await task,'done');assert.equal(s.isRunning(),false);assert.equal(s.current(),null);
});
test('failure and cancellation release the live lock without deleting backup data',async()=>{
 const s=createOptimizerSession();
 await assert.rejects(s.exclusive('apply',async()=>{throw new Error('cancelled UAC')}),/cancelled UAC/);
 assert.equal(s.isRunning(),false);
 assert.deepEqual(await s.exclusive('restore',async()=>({cancelled:true})),{cancelled:true});assert.equal(s.isRunning(),false);
});
test('concurrent inspections share one read; a failed read can be retried',async()=>{
 const s=createOptimizerSession(),gate=deferred();let reads=0;
 const one=s.inspect(async()=>{reads++;return gate.promise}),two=s.inspect(()=>{reads++;});
 assert.equal(one,two);await Promise.resolve();assert.equal(reads,1);gate.reject(new Error('audit timeout'));
 await Promise.all([assert.rejects(one,/audit timeout/),assert.rejects(two,/audit timeout/)]);
 assert.equal(await s.inspect(async()=>{reads++;return 'recovered'}),'recovered');assert.equal(reads,2);
});
test('a saved journal is distinct from running work and never locks draft controls',async()=>{
 const {optimizationView}=await import('../shared/optimization-view.mjs');
 for(const needsRecovery of [true,false]){
  const view=optimizationView({status:{ok:true,active:true,needsRecovery,running:false}});
  assert.equal(view.controlsLocked,false);assert.equal(view.canApply,!needsRecovery);assert.equal(view.canRestore,true);
  assert.equal(view.mode,needsRecovery?'recovery':'applied');
 }
 const live=optimizationView({status:{ok:true,active:true,running:true}});assert.equal(live.controlsLocked,true);assert.equal(live.canRestore,false);
});
test('failed audit with stale running flag permits drafts and retry, never unverified apply',async()=>{
 const {optimizationView,withTimeout}=await import('../shared/optimization-view.mjs');
 const failed=optimizationView({status:{ok:true,active:true,running:true},error:'IPC failed'});
 assert.equal(failed.mode,'error');assert.equal(failed.controlsLocked,false);assert.equal(failed.canApply,false);assert.equal(failed.canRestore,true);
 await assert.rejects(withTimeout(new Promise(()=>{}),10,'timeout'),/timeout/);
 assert.equal(await withTimeout(Promise.resolve('ok'),1000,'timeout'),'ok');
 const checking=optimizationView({status:null});assert.equal(checking.controlsLocked,false);assert.equal(checking.canApply,false);
});
