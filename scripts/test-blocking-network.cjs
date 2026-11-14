const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/blocking-network-tests'),modulePath=path.join(root,'work/blocking-build/module');fs.mkdirSync(out,{recursive:true});
const binary=path.join(out,'native-network.test.exe');
execFileSync(process.env.GTM_GO||'go',['test','-c','-tags','gtm_network_test','-o',binary,'./gtm'],{cwd:modulePath,stdio:'inherit',env:{...process.env,GOTOOLCHAIN:'local',CGO_ENABLED:'0',GOOS:'windows',GOARCH:'amd64'}});
fs.copyFileSync(path.join(root,'assets/blocking/fnport/wintun.dll'),path.join(out,'wintun.dll'));
console.log('Compiled isolated real-traffic Windows test; it is excluded from the shipped application');
