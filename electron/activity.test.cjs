const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createActivityStore,optimizationEvents}=require('./activity.cjs');
test('events reflect actual results, never pretend a skipped or rolled-back power change succeeded',()=>{
 const ok=optimizationEvents('apply',{power:'lagophone'},{ok:true,report:[{id:'power',status:'applied'},{id:'capture',status:'applied'},{id:'capture',status:'applied'}]});
 assert.equal(ok.length,2);assert.equal(ok[1].title,'Изменён план питания');assert.equal(ok[1].detail,'GTM PC Performance');assert.match(ok[0].detail,/Применено: 2/);
 assert.equal(optimizationEvents('apply',{power:'high'},{ok:true,report:[{id:'power',status:'skipped'}]}).length,1);
 assert.equal(optimizationEvents('apply',{power:'high'},{ok:false,restored:true,report:[{id:'power',status:'applied'},{id:'power',status:'restored'}]}).some(e=>e.title==='Изменён план питания'),false);
 assert.equal(optimizationEvents('restore',null,{ok:true,report:[{id:'power',status:'restored'}]})[1].title,'Восстановлен прежний план питания');
 assert.equal(optimizationEvents('apply',null,{cancelled:true})[0].status,'cancelled');
});
test('activity survives restart, concurrent writes are retained, clearing does not touch the optimization backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lagophone-activity-'));
 try{
  const file=path.join(dir,'activity.json'),backup=path.join(dir,'optimization-state.json');await fs.writeFile(backup,'preserved backup');
  const store=createActivityStore(file,{limit:4});
  assert.equal((await store.list()).items.length,0);
  await Promise.all(Array.from({length:6},(_,i)=>store.add([{kind:'apply',status:'success',title:'Action '+i,detail:'fixture'}])));
  const rows=(await createActivityStore(file).list()).items;assert.equal(rows.length,4);assert.equal(rows[0].title,'Action 5');assert.equal(new Set(rows.map(r=>r.id)).size,4);
  assert.equal(await store.clear(),true);assert.equal((await store.list()).items.length,0);assert.equal(await fs.readFile(backup,'utf8'),'preserved backup');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('history write failures do not throw into successful system operations',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lagophone-activity-error-'));
 try{const store=createActivityStore(dir);assert.equal(await store.add([{title:'fixture'}]),false);assert.ok((await store.list()).warning)}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('notification destinations persist through restart and old records resolve without external navigation',async()=>{
 const {activityTarget,cleanTarget}=await import('../shared/activity-target.mjs');
 assert.deepEqual(optimizationEvents('apply',{scope:'game',game:'fortnite'},{ok:true,report:[]})[0].target,{page:'gaming',game:'fortnite'});
 assert.deepEqual(optimizationEvents('apply',{scope:'power'},{cancelled:true})[0].target,{page:'tweaks',section:'power'});
 assert.deepEqual(activityTarget({kind:'apply',title:'Игровые настройки применены'}),{page:'gaming'});
 assert.deepEqual(activityTarget({kind:'restore',title:'План питания восстановлен'}),{page:'tweaks',section:'power'});
 assert.equal(cleanTarget({page:'https://bad.example/'}),null);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-activity-route-'));
 try{const file=path.join(dir,'activity.json');await createActivityStore(file).add([{kind:'apply',status:'success',title:'Game',detail:'Done',target:{page:'gaming',game:'fortnite'}}]);const row=(await createActivityStore(file).list()).items[0];assert.deepEqual(activityTarget(row),{page:'gaming',game:'fortnite'})}finally{await fs.rm(dir,{recursive:true,force:true})}
});
