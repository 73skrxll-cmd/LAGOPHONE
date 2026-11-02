// Disposable Windows runner: real network diagnostics, without installing games or changing settings.
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('../../electron/windows-powershell.cjs');
async function run(mode){const {stdout}=await promisify(execFile)(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('electron/ping-session.ps1'),'-Mode',mode,'-PayloadBase64',Buffer.from(JSON.stringify({controlAddress:'1.1.1.1'})).toString('base64')],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:90000,maxBuffer:512000});return JSON.parse(stdout.replace(/^\uFEFF/,''))}
(async()=>{
 const roots=await run('roots'),processes=await run('processes'),bits=await run('bits');
 const before=await run('measure'),after=await run('measure');
 const {summarizeEndpoint,compareEndpoints,findings}=await import('../../shared/ping-session.mjs');
 for(const report of [before,after]){assert.equal(report.control.samples.length,20);assert.ok(report.network.name);assert.equal(report.control.address,'1.1.1.1');assert.ok(report.traffic.rxMbps>=0)}
 const result={notice:'Windows Server runner; not a physical Windows 10/11 gaming PC. No games were launched and no settings changed.',before,after,comparison:compareEndpoints(before.control,after.control),findings:findings(after),roots,processes,bits};
 await fs.mkdir('release',{recursive:true});await fs.writeFile('release/network-session-check.json',JSON.stringify(result,null,2));console.log('Real diagnostic series:',JSON.stringify({before:summarizeEndpoint(before.control),after:summarizeEndpoint(after.control),comparison:result.comparison}));
})().catch(error=>{console.error(error);process.exitCode=1});
