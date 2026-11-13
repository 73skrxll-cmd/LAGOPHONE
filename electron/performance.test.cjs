const {test}=require('node:test'),assert=require('node:assert/strict');
const system={cpu:'AMD Ryzen 7 3700X 8-Core Processor',gpu:['NVIDIA GeForce GTX 1660 SUPER'],ram:16,disks:[{type:'SSD'}]};
test('FPS anchors retain published averages, correct presets and explicit missing 1440p coverage',async()=>{
 const {estimatePerformance}=await import('../shared/performance.mjs');
 const fast=estimatePerformance(system),quality=estimatePerformance(system,'quality1080');
 assert.equal(fast.rows.find(r=>r.id==='fortnite').reference,148);assert.equal(quality.rows.find(r=>r.id==='fortnite').reference,49.2,'Average, not the published 1% percentile');
 assert.equal(fast.rows.find(r=>r.id==='pubg').reference,142.6);assert.equal(fast.rows.find(r=>r.id==='cs2').reference,261.1);
 assert.equal(quality.rows.find(r=>r.id==='cs2').reference,98.3);assert.equal(fast.rows.find(r=>r.id==='cyberpunk').limitation,'Возможен упор в GPU');assert.match(quality.rows.find(r=>r.id==='cs2').settings,/8×/);
 assert.equal(estimatePerformance(system,'quality1440').rows.find(r=>r.id==='fortnite').low,null,'Do not fabricate an absent resolution test');
 assert.match(fast.rows.find(r=>r.id==='gta5').name,/Legacy/);assert.match(fast.rows.find(r=>r.id==='dota2').version,/не текущий/);
});
test('exact GPU variants, mobile models and missing system information never borrow unrelated results',async()=>{
 const {estimatePerformance,matchPerformanceGpu,cpuEnvelope}=await import('../shared/performance.mjs');
 assert.equal(matchPerformanceGpu('NVIDIA GeForce RTX 3060 Ti'),'RTX 3060 Ti');assert.equal(matchPerformanceGpu('AMD Radeon RX 6600'),'RX 6600');
 for(const gpu of ['RTX 3060 Laptop GPU','RTX 3060 SUPER','RTX 3060 8GB','RX 6600 XT','RTX 5090','Unknown'])assert.equal(matchPerformanceGpu(gpu),null,gpu);
 for(const spec of [{...system,gpu:['Unknown']},{...system,cpu:'Unknown CPU'},{...system,ram:undefined},{...system,ram:4}])assert.ok(estimatePerformance(spec).rows.every(r=>r.low===null));
 assert.equal(cpuEnvelope('AMD Ryzen 7 6800H'),null);assert.equal(cpuEnvelope('Intel Core i7-12700H'),null);
 assert.ok(cpuEnvelope('Intel(R) Core(TM) i7-10700F CPU @ 2.90GHz'));
});
test('estimates are ranges, account for CPU/RAM and do not claim FPS gains from SSD, board, OS or tweaks',async()=>{
 const {estimatePerformance}=await import('../shared/performance.mjs');
 const base=estimatePerformance(system);for(const row of base.rows){assert.ok(row.low>0&&row.high>row.low);assert.equal(row.low%5,0);assert.equal(row.high%5,0)}
 const lowMemory=estimatePerformance({...system,ram:8});assert.ok(lowMemory.rows[0].low<base.rows[0].low);assert.equal(lowMemory.rows[0].high,base.rows[0].high);
 const modern=estimatePerformance({...system,cpu:'AMD Ryzen 5 5600X'});assert.ok(modern.rows[0].low>base.rows[0].low);
 assert.deepEqual(estimatePerformance({...system,board:'X870',version:'11',disks:[{type:'HDD'}],optimized:true}).rows,base.rows);
 assert.deepEqual(estimatePerformance(system,'invalid').rows,base.rows);
 assert.equal(estimatePerformance(system,'fast1080','RTX 4090').gpu,system.gpu[0],'GPU override must be one of the detected adapters');
});
test('all benchmark source actions stay on the native official-source allowlist',async()=>{
 const {performanceSources}=await import('../shared/performance.mjs');const {links}=require('./policy.cjs');
 for(const [id,url] of Object.entries(performanceSources)){assert.equal(links[id],url);assert.equal(new URL(url).protocol,'https:')}
});
