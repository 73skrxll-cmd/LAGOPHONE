const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
(async()=>{const root=path.join(__dirname,'../..'),cache=path.join(root,'assets/blocking-cache'),spec=require('../../shared/blocking-components.json');await fs.mkdir(cache,{recursive:true});
 for(const [name,url,sha] of [['zapret.zip',spec.zapret.url,spec.zapret.sha256],['fnport-release.zip',spec.fnport.url,spec.fnport.sha256],['fnport-source.zip',spec.fnport.sourceUrl,spec.fnport.sourceSha256],...spec.sourceDependencies.map(d=>[d.name,d.url,d.sha256])]){
  const file=path.join(cache,name);let data;try{data=await fs.readFile(file)}catch{}if(!data||crypto.createHash('sha256').update(data).digest('hex')!==sha){const res=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!res.ok)throw Error('Official component download failed: '+name);data=Buffer.from(await res.arrayBuffer());if(crypto.createHash('sha256').update(data).digest('hex')!==sha)throw Error('Component SHA-256 mismatch: '+name);await fs.writeFile(file,data)}
 }
 execFileSync(process.env.GTM_PYTHON||(process.platform==='win32'?'python':'python3'),[path.join(root,'scripts/prepare-blocking.py')],{cwd:root,stdio:'inherit',env:{...process.env,PYTHONUTF8:'1'}});
})().catch(e=>{console.error(e.message);process.exitCode=1});
