const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
test('IPC accepts only trusted main frame, uses a fixed setup URL allowlist, and exposes no arbitrary commands',async()=>{
 const handlers={},opened=[],calls=[],webContents={mainFrame:{}},win={webContents,isDestroyed:()=>false};
 const controller={status:async consent=>{calls.push(consent);return{}},measure:async()=>{},compare:async()=>{},connect:async()=>{},disconnect:async()=>{},cancel:async()=>{},report:async()=>null};
 const original=Module._load;
 try{
  Module._load=function(name,parent,...rest){
   if(name==='electron')return{app:{isPackaged:false,getPath:()=>'/tmp/gtm-ping-test-not-used'},ipcMain:{handle:(name,fn)=>handlers[name]=fn},shell:{openExternal:async url=>opened.push(url)},dialog:{showSaveDialog:async()=>({canceled:true})}};
   if(parent?.filename.endsWith('ping-ipc.cjs')&&name==='./ping-controller.cjs')return{createPingController:()=>controller};
   return original.call(this,name,parent,...rest);
  };
  delete require.cache[require.resolve('./ping-ipc.cjs')];require('./ping-ipc.cjs').registerPing(()=>win,{},{});
 }finally{Module._load=original}
 const trusted={sender:webContents,senderFrame:webContents.mainFrame};
 for(const event of [{sender:{},senderFrame:webContents.mainFrame},{sender:webContents,senderFrame:{}}])assert.throws(()=>handlers['ping:status'](event,true),/недоступен/);
 await handlers['ping:status'](trusted,'true');await handlers['ping:status'](trusted,true);assert.deepEqual(calls,[false,true]);
 await handlers['ping:setup'](trusted);assert.equal(opened[0],'https://developers.cloudflare.com/warp-client/get-started/windows/');
 await assert.rejects(handlers['ping:setup'](trusted,'https://attacker.example'));await assert.rejects(handlers['ping:setup'](trusted,'__proto__'));assert.equal(opened.length,1);
 assert.equal(await handlers['ping:export'](trusted),false);

});
