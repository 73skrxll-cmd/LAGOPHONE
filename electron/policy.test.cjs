const {test}=require('node:test');
const assert=require('node:assert/strict');
const {apps,links,actions,validateAction}=require('./policy.cjs');
test('system actions reject mismatched Windows and untrusted identifiers',()=>{
  assert.throws(()=>validateAction('temp','11','10'));
  assert.throws(()=>validateAction('temp','12','12'));
  assert.throws(()=>validateAction('toString','11','11'));
  assert.throws(()=>validateAction('temp; Remove-Item C:','11','11'));
  for(const id of Object.keys(actions)) for(const version of ['10','11']) assert.equal(validateAction(id,version,version),actions[id]);
});
test('download catalog uses HTTPS and fixed executable filenames',()=>{
  for(const app of Object.values(apps)) { assert.equal(new URL(app.url||app.page).protocol,'https:'); if(app.url) assert.match(app.file,/^[a-zA-Z0-9]+\.exe$/); }
  for(const url of Object.values(links)) assert.equal(new URL(url).protocol,'https:');
});
