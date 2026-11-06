const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSecurityService,normalizeSecurity}=require('./security.cjs');
const fixture={firmware:'uefi',secureBoot:{enabled:false,source:'firmware'},tpm:{present:true,version:'2.0',enabled:true,ready:false,lockedOut:false,source:'tbs'}};
test('disabled and not-ready remain distinct from missing or unreadable state',()=>{
 const state=normalizeSecurity(fixture);assert.equal(state.secureBoot.enabled,false);assert.equal(state.tpm.present,true);assert.equal(state.tpm.version,'2.0');assert.equal(state.tpm.ready,false);
 const empty=normalizeSecurity(null);assert.equal(empty.secureBoot.enabled,null);assert.equal(empty.tpm.present,null);assert.equal(empty.tpm.ready,null);
 const invalid=normalizeSecurity({secureBoot:{enabled:'false',source:'firmware'},tpm:{present:'true',version:'2',ready:'false'}});assert.equal(invalid.secureBoot.enabled,null);assert.equal(invalid.tpm.present,null);assert.equal(invalid.tpm.version,null);assert.equal(invalid.tpm.ready,null);
 assert.equal(normalizeSecurity({secureBoot:{enabled:true,source:'untrusted'}}).secureBoot.enabled,null);
});
test('Legacy never reports Secure Boot enabled from a stale record; Windows boot fallback is identified',()=>{
 assert.equal(normalizeSecurity({...fixture,firmware:'legacy',secureBoot:{enabled:true,source:'windows-boot'}}).secureBoot.enabled,null);
 const cached=normalizeSecurity({...fixture,secureBoot:{enabled:true,source:'windows-boot',issue:'access'}});assert.equal(cached.secureBoot.enabled,true);assert.equal(cached.secureBoot.source,'windows-boot');assert.equal(cached.secureBoot.issue,'access');
 assert.equal(normalizeSecurity({...fixture,tpm:{present:true,version:'1.2'}}).tpm.version,'1.2');
});
test('read-only inspection deduplicates concurrent requests and uses the explicit worker without elevation',async()=>{
 let callback,calls=0;
 const service=createSecurityService({platform:'win32',app:{isPackaged:false},execute:(file,args,options,cb)=>{calls++;callback=cb;assert.match(file,/powershell\.exe$/);assert.ok(args.includes('-NonInteractive'));assert.ok(args.at(-1).endsWith('security.ps1'));assert.equal(args.some(x=>/RunAs|Start-Process/i.test(x)),false);assert.equal(options.windowsHide,true);assert.equal(options.timeout,30000)}});
 const first=service.inspect(),second=service.inspect();assert.equal(first,second);assert.equal(calls,1);callback(null,JSON.stringify(fixture));const state=await first;assert.equal(state.supported,true);assert.equal(state.secureBoot.enabled,false);assert.ok(Date.parse(state.checkedAt));
 const third=service.inspect();assert.equal(calls,2);callback(null,JSON.stringify(fixture));await third;
});
test('inspection failure or invalid output rejects; retry and unsupported platform never fabricate success',async()=>{
 let callback;
 const service=createSecurityService({platform:'win32',app:{isPackaged:false},execute:(_file,_args,_options,cb)=>{callback=cb}});
 const first=service.inspect();callback(Error('timeout'));await assert.rejects(first,/Повторите/);
 const second=service.inspect();callback(null,'not JSON');await assert.rejects(second,/неполные/);
 const third=service.inspect();callback(null,'\uFEFF'+JSON.stringify(fixture));await third;
 const unavailable=createSecurityService({platform:'linux',execute:()=>{throw Error('Must not run')}});const state=await unavailable.inspect();assert.equal(state.supported,false);assert.equal(state.checkedAt,null);assert.equal(state.secureBoot.enabled,null);assert.equal(state.tpm.present,null);
});
test('recovery helper only opens Windows settings and never restarts the computer',async()=>{
 const opened=[];const service=createSecurityService({platform:'win32',shell:{openExternal:async value=>opened.push(value)}});await service.openRecovery();assert.deepEqual(opened,['ms-settings:recovery']);
 assert.throws(()=>createSecurityService({platform:'linux'}).openRecovery(),/Windows/);
});
test('Windows PowerShell 5.1 executes the production security reader without modifying firmware',{skip:process.platform!=='win32'},async()=>{
 const state=await createSecurityService({platform:'win32',app:{isPackaged:false}}).inspect();
 assert.equal(state.supported,true);assert.ok(['uefi','legacy'].includes(state.firmware),'GetFirmwareType must execute on the Windows runner');assert.ok([true,false,null].includes(state.secureBoot.enabled));assert.ok([true,false,null].includes(state.tpm.present));assert.ok([null,'1.2','2.0'].includes(state.tpm.version));
 // Inspect-only smoke test: CI does not assert that its VM has a TPM or Secure Boot.
});
