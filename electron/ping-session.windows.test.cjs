const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
test('Windows PowerShell validates session worker and exercises actual transaction code with isolated BITS providers',{skip:process.platform!=='win32'},()=>{
 const output=execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'ping-session.logic.tests.ps1')],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:20000});assert.match(output,/BITS transaction logic passed/);
});

test('actual watchdog restores an empty durable journal when the parent process is absent',{skip:process.platform!=='win32'},()=>{
 const fs=require('node:fs'),os=require('node:os');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gtm-session-watch-'));const filename=path.join(directory,'journal.json');
 try{fs.writeFileSync(filename,JSON.stringify({owned:true,leaseId:'test-watch',jobs:[]}));
 execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'ping-session.ps1'),'-Mode','watch','-ParentId','2147483647','-LeaseId','test-watch','-SessionPathBase64',Buffer.from(filename).toString('base64')],{env:windowsPowerShellEnvironment(),timeout:15000});
 assert.equal(JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,'')).owned,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
