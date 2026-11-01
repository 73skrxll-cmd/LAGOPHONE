const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWindowsActions}=require('./windows-actions.cjs');
test('a confirmed UI action executes exactly once after native validation, without a second program dialog',async()=>{
 const calls=[],events=[];
 const execute=createWindowsActions({isRunning:()=>false,system:async()=>({version:'11'}),run:async script=>{calls.push(script);return 'Opened'},activities:{add:async rows=>events.push(...rows)}});
 assert.equal(await execute('apps','11'),'Opened');assert.equal(calls.length,1);assert.match(calls[0],/ms-settings:appsfeatures/);assert.deepEqual(events[0].target,{page:'tweaks',section:'tools'});
 await assert.rejects(execute('unknown','11'));await assert.rejects(execute('temp','10'));assert.equal(calls.length,1);
 const busy=createWindowsActions({isRunning:()=>true});await assert.rejects(busy('apps','11'));
});
