const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {configureBranding}=require('./branding.cjs');
test('GTM PC upgrades keep the exact legacy profile and pending game state',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gtm-upgrade-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'lagophone');await fs.mkdir(profile);const original=JSON.stringify({games:[{id:'deadlock',gamePath:'D:\\Games\\DeadlockClient.exe'}],theme:'black'});await fs.writeFile(path.join(profile,'saved-state.json'),original);
 const paths={appData:root},app={getPath:id=>paths[id],setPath:(id,value)=>paths[id]=value,setName:value=>app.name=value};
 configureBranding(app);assert.equal(app.name,'GTM PC');assert.equal(paths.userData,profile);assert.equal(paths.sessionData,profile);
 assert.equal(await fs.readFile(path.join(paths.userData,'saved-state.json'),'utf8'),original);
 const metadata=require('../package.json');assert.equal(metadata.build.appId,'com.lagophone.desktop','Keep the installer upgrade identity');assert.equal(metadata.build.productName,'GTM PC');
});
