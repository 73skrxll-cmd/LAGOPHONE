const {test}=require('node:test'),assert=require('node:assert/strict');
const shared=import('../shared/ping.mjs');
const samples=values=>values.map((value,i)=>({sequence:i,at:'2026-11-02T00:00:00Z',status:value===null?'timeout':'success',rttMs:value}));
const trial=(value,address='203.0.113.5')=>({address,method:'icmp',samples:samples(Array.isArray(value)?value:Array(50).fill(value))});
test('real samples retain zero RTT, count timeouts, and distinguish absence of measurements',async()=>{
 const {summarizePing}=await shared;
 const result=summarizePing(samples([0,10,20,null]));assert.equal(result.received,3);assert.equal(result.lossPct,25);assert.equal(result.meanMs,10);assert.equal(result.medianMs,10);assert.equal(result.jitterMs,10);
 const missing=summarizePing([]);assert.equal(missing.meanMs,null);assert.equal(missing.lossPct,null);
 assert.equal(summarizePing(samples([null,null])).meanMs,null);
 for(const value of [NaN,Infinity,-1,60001])assert.throws(()=>summarizePing(samples([value])));
});
test('A-B-A recommends a tunnel only for measured gain to the same endpoint',async()=>{
 const {comparePingTrials}=await shared;
 const result=comparePingTrials(trial(65),trial(49),trial(64));assert.equal(result.verdict,'improved');assert.equal(result.gainMs,15);assert.equal(result.recommended,'tunnel');
 assert.equal(comparePingTrials(trial(65),trial(49,'203.0.113.6'),trial(65)).verdict,'inconclusive');
 assert.equal(comparePingTrials(trial(65),trial(63),trial(65)).recommended,'direct');
 assert.equal(comparePingTrials(trial(65),trial(49),trial(50)).verdict,'unstable');
 assert.equal(comparePingTrials(trial(65),trial(Array(10).fill(40)),trial(65)).verdict,'inconclusive');
 assert.equal(comparePingTrials(trial(65),trial([...Array(49).fill(49),null]),trial(65)).reason,'more-loss');
 assert.equal(comparePingTrials(trial(65),trial([...Array(45).fill(49),...Array(5).fill(150)]),trial(65)).reason,'worse-tail');
});
test('regional targets use the official Epic endpoint list and reject arbitrary commands',async()=>{
 const {PING_TARGETS,pingTarget}=await shared;assert.equal(PING_TARGETS.length,7);assert.equal(pingTarget('fortnite-de').host,'ping-de.ds.on.epicgames.com');
 for(const value of ['__proto__','127.0.0.1','fortnite-de; whoami',null,{}])assert.throws(()=>pingTarget(value));
});

test('TCP comparisons preserve method, port and service identity; connection failures are not UDP loss',async()=>{
 const {comparePingTrials,pingTarget,PING_SERVICES}=await shared;
 const tcp=(value,targetId='discord-api')=>({...trial(value),targetId,method:'tcp',port:443});
 assert.equal(comparePingTrials(tcp(65),tcp(45),tcp(65)).verdict,'improved');
 assert.equal(comparePingTrials(tcp(65),{...tcp(45),method:'icmp'},tcp(65)).verdict,'inconclusive');
 assert.equal(comparePingTrials(tcp(65),{...tcp(45),port:80},tcp(65)).verdict,'inconclusive');
 assert.equal(comparePingTrials(tcp(65),tcp(45,'epic-download'),tcp(65)).verdict,'inconclusive');
 assert.deepEqual(PING_SERVICES.map(item=>item.id),['fortnite','discord','epic']);
 for(const id of ['discord-api','discord-gateway','epic-launcher','epic-download']){const target=pingTarget(id);assert.equal(target.method,'tcp');assert.equal(target.port,443)}
});
