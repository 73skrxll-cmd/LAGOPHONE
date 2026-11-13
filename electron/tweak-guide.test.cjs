const {test}=require('node:test'),assert=require('node:assert/strict');
test('guidance waits, repeats no sooner than four minutes and stops after two appearances',async()=>{
 const {nextTweakGuideDelay,readTweakGuide,tweakGuideTiming}=await import('../shared/tweak-guide.mjs');
 const now=1000000;assert.equal(nextTweakGuideDelay(readTweakGuide(null),now),8000);
 assert.equal(nextTweakGuideDelay({shown:1,last:now,visited:false},now+10000),230000);
 assert.equal(nextTweakGuideDelay({shown:1,last:now,visited:false},now+240000),8000,'A resumed app never immediately throws a hand at the user');
 assert.equal(nextTweakGuideDelay({shown:2,last:now,visited:false},now+999999),null);assert.equal(nextTweakGuideDelay({shown:0,last:0,visited:true},now),8000);
 assert.equal(tweakGuideTiming.duration,3200);assert.equal(tweakGuideTiming.maximum,2);
});
test('invalid session data never creates an unbounded appearance count or timer overflow',async()=>{
 const {readTweakGuide,nextTweakGuideDelay}=await import('../shared/tweak-guide.mjs');
 for(const value of ['null','invalid','[]','{"shown":-3,"last":"future"}'])assert.deepEqual(readTweakGuide(value),{shown:0,last:0,visited:false});
 assert.equal(readTweakGuide('{"shown":999,"visited":true}').shown,2);
 assert.equal(nextTweakGuideDelay({shown:1,last:9e15,visited:false},1000),240000);
});
