const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {defaults,settings,profiles,choose,score,targets,covers,rank}=require('./blocking-policy.cjs'),{probe,strategySeries}=require('./blocking-probe.cjs'),{createBlockingController}=require('./blocking-controller.cjs');
test('settings accept only pinned strategies, bounded TTL and explicit supported flags',()=>{
 assert.equal(profiles.length,22);assert.deepEqual(settings(defaults),defaults);
 for(const bad of [{profile:'../../cmd.exe'},{ttl:0},{ttl:10},{fake:'C:\\private.key'},{gameFilter:'*'},{ipset:'true'}])assert.throws(()=>settings({...defaults,...bad}));
 assert.equal('extra' in settings({...defaults,extra:'ignored'}),false);
});
test('strategy selection requires measured improvement over direct connection',()=>{
 const row=ok=>({ok});const baseline=[row(true),row(false)];assert.equal(choose(baseline,[{profile:'same',rows:[row(true),row(false)]}]),null);
 assert.equal(choose(baseline,[{profile:'bad',rows:[]},{profile:'good',rows:[row(true),row(true)]}]).profile,'good');assert.equal(score([row(false),{},row(true)]),1);
});
function transport({status=200,body='x'.repeat(100),delay=false,error=false},inspect){return (url,opts,callback)=>{inspect?.(url,opts);const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};req.end=()=>{if(delay)return;if(error){queueMicrotask(()=>req.emit('error',Error('TLS failure')));return}const res=new EventEmitter();res.statusCode=status;res.destroy=()=>{};queueMicrotask(()=>{callback(res);res.emit('data',Buffer.from(body));res.emit('end')})};return req}}
test('diagnostics validate TLS, do not treat HTTP rejection or short response as success, and time out',async()=>{
 const target={...targets[0],minimum:10};const good=await probe(target,{request:transport({},(_url,o)=>{assert.equal(o.rejectUnauthorized,true);assert.equal(o.family,4);assert.equal(o.agent,false)})});assert.equal(good.ok,true);assert.equal(good.method.includes('HTTPS'),true);
 assert.equal((await probe(target,{request:transport({status:403})})).ok,false);assert.equal((await probe(target,{request:transport({body:'x'})})).ok,false);assert.equal((await probe(target,{request:transport({error:true})})).ok,false);
 const timeout=await probe(target,{request:transport({delay:true}),timeout:10});assert.equal(timeout.ok,false);assert.match(timeout.reason,/Тайм-аут/);
});
test('status never starts privileged components, persists validated settings and rejects arbitrary actions',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-blocking-test-'));let calls=0;const app={getPath:()=>directory,isPackaged:false};const controller=createBlockingController({app,platform:'win32',runFile:()=>{calls++;throw Error('Not allowed from status')}});
 try{assert.equal((await controller.status()).zapret.running,false);assert.equal(calls,0);await controller.setSettings({...defaults,profile:'general-alt',ttl:3});const next=createBlockingController({app,platform:'win32'});assert.equal((await next.status()).settings.ttl,3);await assert.rejects(controller.action('cmd.exe'),/Недопустимое/);await assert.rejects(controller.setSettings({...defaults,ttl:99}),/Недопустимые/);await controller.stop();assert.equal(calls,0)}finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('non-Windows builds cannot pretend to start interception or routing',async()=>{
 const c=createBlockingController({app:{getPath:()=>os.tmpdir(),isPackaged:false},platform:'linux',runFile:()=>{throw Error('Must not execute')}});const state=await c.action('fnport-start');assert.equal(state.supported,false);assert.equal(state.zapret.running,false);assert.match(state.message,/Windows/);
});
function fakeSupervisor(){const loops=[];let current={running:false,profile:''};return {get current(){return current},runFile:(_exe,args,_options,done)=>{const command=Buffer.from(args.at(-1),'base64').toString('utf16le'),match=command.match(/-PayloadBase64"?\s+"([A-Za-z0-9+/=]+)"/);if(!match)throw Error('No trusted worker payload');const payload=JSON.parse(Buffer.from(match[1],'base64').toString());let last='',reading=false;const loop=setInterval(async()=>{if(reading)return;reading=true;try{try{await fs.stat(path.join(payload.directory,'stop'));await fs.writeFile(path.join(payload.directory,'stopped'),'1');clearInterval(loop);return}catch{}let req;try{req=JSON.parse(await fs.readFile(path.join(payload.directory,'command.json'),'utf8'))}catch{}if(req&&req.id!==last){last=req.id;if(req.action==='zapret-start')current={running:true,profile:req.profile};if(req.action==='zapret-stop')current={running:false,profile:''}}await fs.writeFile(path.join(payload.directory,'state.json'),JSON.stringify({phase:'ready',updatedAt:new Date().toISOString(),lastCommand:last,zapret:current,fnport:{phase:'idle'}}))}finally{reading=false}},10);loops.push(loop);done(null,'')},dispose(){for(const loop of loops)clearInterval(loop)}}}
const componentsAvailable=require('node:fs').existsSync(path.join(__dirname,'../assets/blocking/manifest.json'));
test('strategy search verifies candidates, leaves activation explicit and restores the previous mode on cancellation',{skip:!componentsAvailable,timeout:30000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-blocking-selection-')),supervisor=fakeSupervisor();let checks=0,hold=false,entered;
 const controller=createBlockingController({app:{getPath:()=>directory,isPackaged:false},platform:'win32',runFile:supervisor.runFile,series:async({signal})=>{checks++;if(hold){entered?.();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true}))}return [{ok:supervisor.current.running},{ok:supervisor.current.profile==='general-alt11'}]}});
 try{const selected=await controller.action('select');assert.equal(selected.lastReport.selected,'general-alt11');assert.equal(selected.settings.profile,'general-alt11');assert.equal(selected.lastReport.verified,true);assert.equal(selected.zapret.running,false);assert.ok(checks>=24);await controller.action('activate-profile:general-alt11');assert.equal((await controller.status()).zapret.profile,'general-alt11');
  hold=true;const started=new Promise(resolve=>entered=resolve),operation=controller.action('select');await started;await controller.action('cancel');await operation;const restored=await controller.status();assert.equal(restored.zapret.profile,'general-alt11');assert.equal(restored.zapret.running,true);assert.equal(restored.operation,null);
 }finally{await controller.stop();supervisor.dispose();await fs.rm(directory,{recursive:true,force:true})}
});

test('ordinary enable starts the actual engine even when HTTPS is already reachable',{skip:!componentsAvailable},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fix-enable-')),supervisor=fakeSupervisor();let probes=0;
 const c=createBlockingController({app:{getPath:()=>directory,isPackaged:false},platform:'win32',runFile:supervisor.runFile,series:async()=>{probes++;return [{ok:true}]}});
 try{await c.setSettings({...defaults,gameFilter:'all'});const value=await c.action('zapret-start');assert.equal(value.zapret.running,true);assert.equal(value.settings.gameFilter,'off');assert.equal(probes,0);assert.equal(value.lastReport,null);await c.action('zapret-stop');assert.equal((await c.status()).zapret.running,false)}finally{await c.stop();supervisor.dispose();await fs.rm(directory,{recursive:true,force:true})}
});

test('all shipped strategies have every referenced host list, IP set and fake payload',{skip:!componentsAvailable},async()=>{
 const root=path.join(__dirname,'../assets/blocking'),rows=JSON.parse(await fs.readFile(path.join(root,'profiles.json'),'utf8'));
 for(const row of rows)for(const arg of row.args){const value=arg.slice(arg.indexOf('=')+1);if(!value.startsWith('%LISTS%')&&!value.startsWith('%BIN%'))continue;const file=value.replace('%LISTS%',path.join(root,'zapret/lists')+path.sep).replace('%BIN%',path.join(root,'zapret/bin')+path.sep);const data=await fs.readFile(file);assert.ok(data.length>0,row.id+': '+arg)}
});

test('search tests every strategy even when baseline HTTPS is fully available; ties do not claim an improvement',{skip:!componentsAvailable},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fix-all-pass-')),supervisor=fakeSupervisor();let checks=0;
 const c=createBlockingController({app:{getPath:()=>directory,isPackaged:false},platform:'win32',runFile:supervisor.runFile,series:async()=>{checks++;return [{ok:true},{ok:true}]}});
 try{const result=await c.action('select');assert.equal(result.lastReport.results.length,profiles.length);assert.equal(result.lastReport.verified,true);assert.equal(result.lastReport.selected,profiles[0].id);assert.equal(result.zapret.running,false);assert.equal(result.operation,null);assert.equal(checks,profiles.length+2);assert.match(result.lastReport.message,/столько же/);await assert.rejects(c.action('activate-profile:../../cmd.exe'),/Недопустимая стратегия/)}finally{await c.stop();supervisor.dispose();await fs.rm(directory,{recursive:true,force:true})}
});
test('a candidate failing its repeated check is never recommended and the old mode returns',{skip:!componentsAvailable},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-fix-repeat-')),supervisor=fakeSupervisor();let checks=0;
 const c=createBlockingController({app:{getPath:()=>directory,isPackaged:false},platform:'win32',runFile:supervisor.runFile,series:async()=>{checks++;return [{ok:checks>1&&checks<=profiles.length+1}]}});
 try{await c.action('activate-profile:general-alt');const result=await c.action('select');assert.equal(result.lastReport.selected,null);assert.equal(result.lastReport.verified,false);assert.equal(result.zapret.profile,'general-alt');assert.equal(result.operation,null);assert.ok(result.lastReport.results.every(r=>r.verification&&score(r.verification)===0))}finally{await c.stop();supervisor.dispose();await fs.rm(directory,{recursive:true,force:true})}
});
test('archive-based search uses new certified TLS 1.2 and 1.3 requests and actual response bytes',async()=>{
 const protocols=[];const rows=await strategySeries({request:transport({body:'x'.repeat(40000)},(_url,o)=>{protocols.push(o.minVersion);assert.equal(o.minVersion,o.maxVersion);assert.equal(o.agent,false);assert.equal(o.rejectUnauthorized,true)})});
 assert.equal(rows.length,targets.length*4);assert.equal(rows.every(r=>r.ok),true);assert.deepEqual([...new Set(protocols)].sort(),['TLSv1.2','TLSv1.3']);assert.equal(rows.filter(r=>r.round===1).length,targets.length*2);
 const ac=new AbortController();ac.abort();await assert.rejects(strategySeries({signal:ac.signal}),/отменён/);
});

test('equal success counts cannot hide a lost endpoint or protocol in a repeated series',()=>{
 const baseline=[{id:'discord-tls12',ok:true},{id:'youtube-tls13',ok:false}],swapped=[{id:'discord-tls12',ok:false},{id:'youtube-tls13',ok:true}];
 assert.equal(covers(swapped,baseline),false);assert.equal(rank(baseline,[{profile:'swapped',rows:swapped}]).length,0);
 const missingRound=[{id:'discord',method:'TLS 1.2',round:1,ok:true}];assert.equal(covers(missingRound,[...missingRound,{id:'discord',method:'TLS 1.2',round:2,ok:true}]),false);
});
