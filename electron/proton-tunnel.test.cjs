const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validateProfile}=require('./proton-profile.cjs'),{createProtonTunnel}=require('./proton-tunnel.cjs');
const key=Buffer.alloc(32,7).toString('base64');
const config=`[Interface]\nPrivateKey = ${key}\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n[Peer]\nPublicKey = ${key}\nAllowedIPs = 0.0.0.0/0\nEndpoint = 8.8.8.8:51820\n`;
module.exports={config};
test('full-tunnel profile validation rejects scripts, split routes, duplicate peers, malformed keys and local endpoints',()=>{
 assert.equal(validateProfile(config).metadata.fullTunnel,true);assert.match(validateProfile(config).config,/PersistentKeepalive = 25/);
 for(const value of [config+'PostUp = cmd.exe\n',config+'[Peer]\n',config.replace('0.0.0.0/0','0.0.0.0/1,128.0.0.0/1'),config.replace('8.8.8.8','127.0.0.1'),config.replace('PrivateKey = '+key,'PrivateKey = not-a-key')])assert.throws(()=>validateProfile(value));
});
async function fixture({country='NL',sameIP=false,routeOk=true,ready=true,preflight={},failInstall=false}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-tunnel-test-'));let time=0,traceCalls=0,removed=false,installed=false;const calls=[];
 const controller=createProtonTunnel({directory,worker:'not-executed',platform:'win32',now:()=>time,delay:async ms=>{time+=ms},nativeHelper:async(mode,payload)=>{calls.push(mode);if(mode==='info')return {installed:true,verified:true,sid:'test-not-exported',stateRoot:directory};if(mode==='protect'){assert.ok(payload.config.includes('PrivateKey'));return {cipher:Buffer.from('DPAPI-placeholder-not-a-real-key').toString('base64')}}},adminAction:async(mode)=>{calls.push(mode);if(mode==='connect'){if(failInstall)throw Object.assign(Error('UAC cancelled'),{notIssued:true});installed=true}else removed=true},readState:async owned=>{
  try{await fs.stat(path.join(directory,'gtm-proton-stop-'+owned.leaseId+'.json'));removed=true}catch{}
  return {serviceRunning:installed&&!removed,removed,routeOk:true,dnsOk:true,handshakeAgeSec:ready?1:null,rxBytes:100,txBytes:100,ipv6Policy:'blocked-by-full-tunnel-policy'};
 },getTrace:async()=>++traceCalls===1?{ip:'198.51.100.1',country:'BY'}:{ip:sameIP?'198.51.100.1':'198.51.100.2',country},networkCheck:async mode=>mode==='preflight'?{games:[],epicRunning:false,proxyEnabled:false,otherVpn:false,...preflight}:{routeOk,dnsOk:true,ipv6Bypass:false}});
 await controller.importProfile(config);return {controller,calls,directory,cleanup:()=>fs.rm(directory,{recursive:true,force:true})};
}
test('connected requires a handshake, verified full routes, changed public IP and another country; keys never appear in status',async()=>{
 const f=await fixture();try{assert.equal((await f.controller.status()).connected,false);await f.controller.connect(true);const status=await f.controller.status();assert.equal(status.connected,true);assert.equal(status.country,'NL');assert.equal(status.matchStatus,'not-verified');assert.equal(JSON.stringify(status).includes(key),false);await f.controller.disconnect();assert.equal((await f.controller.status()).owned,false);assert.equal(f.calls.includes('disconnect'),false,'existing watchdog restores without a second elevation');}finally{await f.cleanup()}
});
test('route failure, unchanged IP/country and missing handshake never become connected and restore owned service',async()=>{
 for(const options of [{routeOk:false},{sameIP:true},{country:'BY'},{ready:false}]){const f=await fixture(options);try{await assert.rejects(f.controller.connect(true));assert.equal((await f.controller.status()).connected,false);assert.equal((await f.controller.status()).owned,false)}finally{await f.cleanup()}}
});
test('another VPN, a running game/Epic, missing consent and a cancelled elevation never launch or switch a foreign connection',async()=>{
 for(const options of [{preflight:{otherVpn:true}},{preflight:{epicRunning:true}},{preflight:{games:[{name:'Fortnite'}]}},{failInstall:true}]){const f=await fixture(options);try{await assert.rejects(f.controller.connect(true));assert.equal((await f.controller.status()).connected,false);assert.equal((await f.controller.status()).owned,false)}finally{await f.cleanup()}}
 const f=await fixture();try{await assert.rejects(f.controller.connect(false));assert.equal(f.calls.includes('connect'),false)}finally{await f.cleanup()}
});
