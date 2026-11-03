const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {epicLaunchUri}=require('./ping-games.cjs');
test('actual session IPC validates the main frame, forwards explicit modes and sends Fortnite only to the Epic protocol handler',async()=>{
 const handlers={},opened=[],calls=[],webContents={mainFrame:{}},win={webContents,isDestroyed:()=>false};let dependencies;
 const session={isRunning:()=>false,tick:async()=>{},status:async()=>({}),refresh:async()=>{},saveSettings:async input=>input,start:async options=>calls.push(options),stop:async()=>{},markMatch:async()=>{},manual:async()=>{}};
 const original=Module._load;
 try{
  Module._load=function(name,parent,...rest){
   if(name==='electron')return {app:{isPackaged:false,getPath:()=>'/tmp/gtm-session-ipc-unavailable',on:()=>{},getVersion:()=> '0.16.0-beta.1'},ipcMain:{handle:(key,fn)=>handlers[key]=fn},dialog:{showOpenDialog:async()=>({canceled:true})},shell:{openExternal:async url=>opened.push(url)}};
   if(parent?.filename.endsWith('ping-session-ipc.cjs')&&name==='./ping-session.cjs')return {createGameSession:opts=>{dependencies=opts;return session}};
   if(parent?.filename.endsWith('ping-session-ipc.cjs')&&name==='./proton-tunnel.cjs')return {createProtonTunnel:()=>({})};
   return original.call(this,name,parent,...rest);
  };
  delete require.cache[require.resolve('./ping-session-ipc.cjs')];require('./ping-session-ipc.cjs').registerGameSession(()=>win,{exclusive:(_,fn)=>fn()});
 }finally{Module._load=original}
 const trusted={sender:webContents,senderFrame:webContents.mainFrame};
 for(const event of [{sender:{},senderFrame:webContents.mainFrame},{sender:webContents,senderFrame:{}}])assert.throws(()=>handlers['ping-game:start'](event,{mode:'tunnel'}),/недоступен/);
 await handlers['ping-game:start'](trusted,{mode:'direct'});assert.deepEqual(calls,[{mode:'direct'}]);
 const uri=epicLaunchUri({CatalogNamespace:'real-namespace',CatalogItemId:'real-item',AppName:'real-artifact'});await dependencies.launch({id:'fortnite',launchUri:uri});assert.deepEqual(opened,[uri]);assert.equal(opened[0].includes('Shipping.exe'),false);
 await assert.rejects(dependencies.launch({id:'fortnite',path:'D:\\Fortnite\\Shipping.exe'}),/запроса запуска/);assert.equal(opened.length,1);
 await assert.rejects(handlers['ping-game:setup'](trusted,'https://attacker.example'));assert.equal(handlers['ping-game:vpn-import'],undefined);assert.throws(()=>dependencies.startGate(),{code:'ROUTE_UNAVAILABLE'});
});
