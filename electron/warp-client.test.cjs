const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWarpClient,parseWarpStatus,parseWarpSettings,parseWarpRegistration}=require('./warp-client.cjs');
test('status schemas accept known states only, including Rust enum wrappers',()=>{
 assert.equal(parseWarpStatus({status:'Connected'}),'connected');assert.equal(parseWarpStatus({status:{Disconnected:{reason:'User'}}}),'disconnected');
 for(const value of [{status:'probably connected'},{status:'Unknown'},{status:'Connected',state:'Disconnected'},{}])assert.throws(()=>parseWarpStatus(value));
});
test('traffic modes are explicit; DNS-only, proxy, managed and unknown schemas do not pass',()=>{
 for(const mode of ['warp','warp+doh','warp+dot','WarpWithDnsOverHttps','TunnelOnly'])assert.equal(parseWarpSettings({mode}).traffic,true);
 assert.equal(parseWarpSettings([{setting:'Mode',value:{value:'WarpWithDnsOverHttps'}}]).traffic,true);
 for(const mode of ['doh','dot','proxy','WarpProxy'])assert.equal(parseWarpSettings({mode}).traffic,false);
 assert.equal(parseWarpSettings({mode:'warp',organization:'my-team'}).managed,true);
 assert.throws(()=>parseWarpSettings({mode:'maybe-full'}));assert.throws(()=>parseWarpSettings({mode:'warp',serviceMode:'doh'}));
 assert.deepEqual(parseWarpRegistration({account:{account_type:'Free'},id:'secret-registration'}),{managed:false});
 assert.equal(parseWarpRegistration({account_type:{Unlimited:{}}}).managed,false);assert.equal(parseWarpRegistration({account_type:'Teams'}).managed,true);
 assert.equal(parseWarpRegistration({account_type:'Free',organization:'corp'}).managed,true);assert.throws(()=>parseWarpRegistration({id:'not-proof-of-consumer'}));
});
function fixture({installed=true,verified=true,serviceRunning=true,mode='warp+doh',account='Free',status='Disconnected',trace={active:true,confirmed:true}}={}){
 const calls=[];let discovery=0;
 const client=createWarpClient({platform:'win32',trace:async()=>trace,launch:(file,args,options,callback)=>{
  calls.push({file,args,options});let out;
  if(args.includes('-EncodedCommand')){discovery++;out={installed,verified,serviceRunning,path:verified?'C:/Program Files/Cloudflare/Cloudflare WARP/warp-cli.exe':''}}
  else if(args.includes('status'))out={status};else if(args.includes('settings'))out={mode};else if(args.includes('registration'))out={account:{account_type:account},id:'never-return-this-secret'};else out={success:true};
  queueMicrotask(()=>callback(null,JSON.stringify(out)));
 }});
 return {client,calls,get discovery(){return discovery}};
}
test('no executable invoked when absent, untrusted or service stopped',async()=>{
 for(const setup of [{installed:false},{verified:false},{serviceRunning:false}]){
  const f=fixture(setup);const state=await f.client.inspect();assert.equal(state.ready,false);
  await assert.rejects(f.client.connect(true));assert.ok(f.calls.every(c=>c.args.includes('-EncodedCommand')));
 }
});
test('CLI uses signed fixed binary, argument arrays, consent only when explicit; reports contain no registration data',async()=>{
 const f=fixture(),state=await f.client.inspect(false);assert.equal(state.ready,true);assert.equal(JSON.stringify(state).includes('never-return'),false);
 assert.ok(f.calls.filter(c=>!c.args.includes('-EncodedCommand')).every(c=>c.args.includes('--json')&&!c.args.includes('--accept-tos')));
 await assert.rejects(f.client.connect(false));let issued=false;await f.client.connect(true,async()=>{issued=true});assert.equal(issued,true);
 assert.ok(f.calls.some(c=>c.args.join(' ')==='--accept-tos --json connect'));assert.ok(f.calls.every(c=>!c.options.shell));
 const script=Buffer.from(f.calls[0].args.at(-1),'base64').toString('utf16le');assert.match(script,/Get-AuthenticodeSignature/);assert.match(script,/Cloudflare Inc/);
});
test('managed/DNS clients are not changed; existing connection is preserved; unknown state is never disconnected success',async()=>{
 for(const setup of [{account:'Teams'},{mode:'doh'},{status:'Unknown'},{status:'Connected'}]){
  const f=fixture(setup);await assert.rejects(f.client.connect(true));assert.equal(f.calls.some(c=>c.args.includes('connect')),false);
 }
 const f=fixture({status:'Unknown'});await assert.rejects(f.client.wait(false),/формат/);await assert.rejects(f.client.disconnect());assert.equal(f.calls.some(c=>c.args.includes('disconnect')),false);
});
test('route proof must explicitly confirm active WARP; read failures cannot become proof',async()=>{
 for(const trace of [{active:false,confirmed:true},{active:true,confirmed:false},{}])await assert.rejects(fixture({trace}).client.verify(),/не проходит/);
 assert.equal(await fixture().client.verify(),true);
});
