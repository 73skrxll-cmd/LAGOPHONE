const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGameRoute}=require('./game-route.cjs');
const {createGameSession}=require('./ping-session.cjs');
test('unavailable infrastructure cannot call old connect/import or advertise connection; old owned lease remains recoverable',async()=>{
 let owned=true,stops=0;const route=createGameRoute({legacyRecovery:{init:async()=>{},status:async()=>({owned,connected:true,country:'NL',profileReady:true}),connect:()=>assert.fail('No old connection'),importProfile:()=>assert.fail('No profile import'),disconnect:async()=>{owned=false;stops++},cancel:()=>{}}});
 await route.init();const before=await route.status();assert.equal(before.available,false);assert.equal(before.connected,false);assert.equal(before.country,null);assert.equal('profileReady' in before,false);assert.throws(()=>route.assertAvailable(),{code:'ROUTE_UNAVAILABLE'});await assert.rejects(route.connect(),{code:'ROUTE_UNAVAILABLE'});await route.disconnect();assert.equal(stops,1);assert.equal((await route.status()).owned,false);
});
test('backend gate blocks every cached launch mode before diagnosis, writes, network changes or launching Epic',async()=>{
 for(const mode of ['tunnel','diagnostic','direct','gearup']){
  const forbidden=()=>assert.fail('A blocked route cannot cause a side effect');const session=createGameSession({platform:'win32',startGate:()=>{throw Object.assign(Error('No verified provider'),{code:'ROUTE_UNAVAILABLE'})},load:async()=>({settings:{connectionMode:'diagnostic'}}),discover:async()=>[],run:forbidden,launch:forbidden,write:forbidden,watchdog:forbidden});
  await assert.rejects(session.start({mode}),{code:'ROUTE_UNAVAILABLE'});assert.equal((await session.status()).active,false);
 }
});
