const {randomUUID}=require('node:crypto');
// The main process retains the validated operation. The renderer can answer only
// the currently displayed question, from the owning window's main frame.
function createAppDialogs({ipcMain,getWindow}){
 let readyWindow=null,pending=null;
 const watched=new WeakSet();
 const valid=(event,window=getWindow())=>!!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;
 function settle(response){
  const request=pending;if(!request)return false;
  pending=null;
  try{if(!request.window.isDestroyed())request.window.webContents.send('app-dialog:closed',request.id)}catch{}
  request.resolve({response});return true;
 }
 function unavailable(window){if(readyWindow===window)readyWindow=null;if(pending?.window===window)settle(pending.cancelId)}
 function watch(window){
  if(watched.has(window))return;watched.add(window);
  window.once('closed',()=>unavailable(window));
  window.webContents.on('render-process-gone',()=>unavailable(window));
  window.webContents.once('destroyed',()=>unavailable(window));
  window.webContents.on('did-start-navigation',details=>{if(details.isMainFrame&&!details.isSameDocument)unavailable(window)});
 }
 ipcMain.handle('app-dialog:ready',(event,ready)=>{
  if(!valid(event)||typeof ready!=='boolean')return false;
  const window=getWindow();watch(window);
  if(ready)readyWindow=window;else unavailable(window);
  return true;
 });
 ipcMain.handle('app-dialog:respond',(event,id,response)=>{
  if(!pending||!valid(event,pending.window)||id!==pending.id||!Number.isInteger(response)||response<0||response>=pending.buttons.length)return false;
  return settle(response);
 });
 function showMessageBox(window,options){
  const buttons=options.buttons?.length?[...options.buttons]:['Понятно'];
  const cancelId=Number.isInteger(options.cancelId)&&options.cancelId>=0&&options.cancelId<buttons.length?options.cancelId:0;
  // Fail closed if the view disappeared or another confirmation already owns it.
  if(!window||window.isDestroyed()||readyWindow!==window||pending)return Promise.resolve({response:cancelId});
  const title=options.title||options.message||'GTM PC';
  const request={id:randomUUID(),type:options.type||'info',title,message:options.message===title?'':options.message||'',detail:options.detail||'',items:options.items||[],buttons,cancelId,defaultId:Number.isInteger(options.defaultId)&&options.defaultId>=0&&options.defaultId<buttons.length?options.defaultId:cancelId};
  return new Promise(resolve=>{
   pending={...request,window,resolve};
   try{window.webContents.send('app-dialog:show',request)}catch{unavailable(window)}
  });
 }
 return {showMessageBox};
}
module.exports={createAppDialogs};
