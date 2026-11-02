const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createPingProbe}=require('./ping-probe.cjs');
function fixture(lines,{close=0,hang=false}={}){
 let killed=0,calls=[];
 const probe=createPingProbe({platform:'win32',worker:'C:/Program Files/GTM PC/ping-probe.ps1',launch:(file,args,options)=>{
  calls.push({file,args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{killed++;queueMicrotask(()=>child.emit('close',1));return true};
  if(!hang)setImmediate(()=>{for(const line of lines)child.stdout.write(typeof line==='string'?line:JSON.stringify(line)+'\r\n');child.emit('close',close)});return child;
 }});return {probe,calls,get killed(){return killed}};
}
const sample=(sequence,rttMs=0)=>({type:'sample',sample:{sequence,status:'success',rttMs,at:'2026-11-02T00:00:00Z'}});
test('probe keeps zero RTT, streamed sequencing and exact sample count, with fixed worker/no shell',async()=>{
 const f=fixture([sample(0),sample(1,65),{type:'complete',count:2}]),seen=[];
 const r=await f.probe('measure',{targetId:'fortnite-de',address:'3.64.1.1',count:2},{onSample:s=>seen.push(s)});
 assert.equal(r.summary.minMs,0);assert.equal(r.samples.length,2);assert.equal(seen.length,2);assert.equal(f.calls[0].options.shell,undefined);
 assert.equal(f.calls[0].args.includes('C:/Program Files/GTM PC/ping-probe.ps1'),true);
});
test('unknown targets never spawn; malformed/out-of-order/incomplete samples cannot produce a result',async()=>{
 const f=fixture([]);await assert.rejects(f.probe('resolve',{targetId:'fortnite-de; bad-command'}));assert.equal(f.calls.length,0);
 for(const lines of [[sample(1),{type:'complete',count:2}],[sample(0),{type:'complete',count:2}],[sample(0,-1),sample(1),{type:'complete',count:2}],['not-json\n']])await assert.rejects(fixture(lines).probe('measure',{targetId:'fortnite-de',address:'3.64.1.1',count:2}));
});
test('resolver output must match official requested hostname and route evidence is a boolean',async()=>{
 const good={type:'resolved',targetId:'fortnite-de',host:'ping-de.ds.on.epicgames.com',address:'3.64.1.1'};
 assert.equal((await fixture([good]).probe('resolve',{targetId:'fortnite-de'})).address,good.address);
 await assert.rejects(fixture([{...good,host:'evil.example'}]).probe('resolve',{targetId:'fortnite-de'}));
 for(const viaWarp of [true,false])assert.equal((await fixture([{type:'route',targetId:'fortnite-de',address:good.address,viaWarp}]).probe('route',{targetId:'fortnite-de',address:good.address})).viaWarp,viaWarp);
 await assert.rejects(fixture([{type:'route',targetId:'fortnite-de',address:good.address,viaWarp:'true'}]).probe('route',{targetId:'fortnite-de',address:good.address}));
});
test('cancellation kills only its own worker and rejects without a partial report',async()=>{
 const f=fixture([],{hang:true}),controller=new AbortController(),pending=f.probe('measure',{targetId:'fortnite-de',address:'3.64.1.1',count:50},{signal:controller.signal});
 await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending,{code:'ABORT_ERR'});assert.equal(f.killed,1);
 const g=fixture([]);await assert.rejects(g.probe('resolve',{targetId:'fortnite-de'},{signal:controller.signal}),{code:'ABORT_ERR'});assert.equal(g.calls.length,0);
});

test('TCP method and fixed port derive from the trusted catalog, not renderer-supplied payload',async()=>{
 const f=fixture([sample(0,12),{type:'complete',count:1}]);
 const result=await f.probe('measure',{targetId:'discord-api',address:'3.64.1.1',count:1,method:'icmp',port:22});
 assert.equal(result.method,'tcp');assert.equal(result.port,443);assert.equal(result.host,'discord.com');
});
