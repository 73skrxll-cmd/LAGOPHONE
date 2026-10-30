const {test}=require('node:test');
const assert=require('node:assert/strict');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');

test('isolates Windows PowerShell from an inherited PowerShell 7 module path and cache',()=>{
 const inherited={SystemRoot:'D:\\Windows',ProgramFiles:'D:\\Program Files',PSModulePath:'D:\\Program Files\\PowerShell\\7\\Modules',PSModuleAnalysisCachePath:'D:\\pwsh7-cache',HTTPS_PROXY:'proxy-fixture',GH_TOKEN:'fixture-only'};
 const original={...inherited};
 const result=windowsPowerShellEnvironment(inherited);
 assert.equal(result.PSModulePath,'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules;D:\\Program Files\\WindowsPowerShell\\Modules');
 assert.equal(result.PSModuleAnalysisCachePath,undefined);
 assert.equal(result.HTTPS_PROXY,inherited.HTTPS_PROXY);
 assert.equal(result.GH_TOKEN,inherited.GH_TOKEN);
 assert.deepEqual(inherited,original,'Do not change the parent process environment');
});
test('handles Windows environment variable casing without retaining duplicate module paths',()=>{
 const result=windowsPowerShellEnvironment({SYSTEMROOT:'E:\\Windows',PROGRAMFILES:'E:\\Programs',psmodulepath:'bad',PsModulePath:'also-bad',psmoduleanalysiscachepath:'bad-cache',PATH:'unchanged'});
 assert.deepEqual(Object.keys(result).filter(k=>k.toLowerCase()==='psmodulepath'),['PSModulePath']);
 assert.equal(result.PSModulePath,'E:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules;E:\\Programs\\WindowsPowerShell\\Modules');
 assert.equal(result.PATH,'unchanged');
 assert.equal(Object.keys(result).some(k=>k.toLowerCase()==='psmoduleanalysiscachepath'),false);
});
test('uses the explicit system Windows PowerShell executable instead of PATH',()=>{
 assert.equal(windowsPowerShellExecutable({SystemRoot:'D:\\Windows',PATH:'malicious-fixture'}),'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
 assert.equal(windowsPowerShellExecutable({systemroot:'E:\\Windows'}),'E:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
 assert.equal(windowsPowerShellExecutable({}),'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
});
