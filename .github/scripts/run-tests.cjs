const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const file='test-output.log',fd=fs.openSync(file,'w');
let result;
try{result=spawnSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm test']:['test'],{stdio:['inherit',fd,fd],env:process.env})}finally{fs.closeSync(fd)}
const output=fs.readFileSync(file,'utf8');process.stdout.write(output);
const code=result.status??1;
if(code!==0){
 const lines=output.split(/\r?\n/).filter(line=>!line.includes('<Objs')&&!line.startsWith('#< CLIXML')).map(line=>line.slice(0,1600));
 const text=lines.join('\n');let start=text.indexOf('failing tests:');if(start<0)start=text.indexOf('not ok');
 const details=(start<0?text.slice(-18000):text.slice(start,start+18000));
 const escaped=details.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
 console.log('::error title=Windows assertion details::'+escaped);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Windows test failure\n\n```text\n'+details+'\n```\n');
}
process.exitCode=code;
