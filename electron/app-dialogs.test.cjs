const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createAppDialogs}=require('./app-dialogs.cjs');
function fixture(){
 const handlers={},messages=[],window=new EventEmitter(),webContents=new EventEmitter();
 let destroyed=false,sendError=false;
 window.webContents=webContents;window.isDestroyed=()=>destroyed;
 webContents.mainFrame={};webContents.send=(name,value)=>{if(sendError)throw Error('View closed');messages.push({name,value})};
 const event={sender:webContents,senderFrame:webContents.mainFrame};
 const dialogs=createAppDialogs({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getWindow:()=>window});
 const ready=()=>handlers['app-dialog:ready'](event,true);
 const show=options=>dialogs.showMessageBox(window,{title:'Применить профиль?',message:'Изменений: 2',buttons:['Отмена','Применить'],defaultId:0,cancelId:0,...options});
 const reply=(id,response,from=event)=>handlers['app-dialog:respond'](from,id,response);
 const request=()=>messages.filter(m=>m.name==='app-dialog:show').at(-1)?.value;
 return {handlers,messages,window,webContents,event,ready,show,reply,request,destroy:()=>{destroyed=true;window.emit('closed')},failSend:()=>{sendError=true}};
}
test('validated operation waits for its owning view; responses cannot be forged, replayed or submitted twice',async()=>{
 const f=fixture();f.ready();let applied=0;
 const task=f.show().then(answer=>{if(answer.response===1)applied++});
 const q=f.request();assert.equal(q.title,'Применить профиль?');assert.equal(q.defaultId,0);await Promise.resolve();assert.equal(applied,0);
 for(const from of [{sender:{},senderFrame:f.webContents.mainFrame},{sender:f.webContents,senderFrame:{}}])assert.equal(f.reply(q.id,1,from),false);
 for(const response of [-1,2,'1',null,NaN])assert.equal(f.reply(q.id,response),false);
 assert.equal(f.reply('stale-question',1),false);await Promise.resolve();assert.equal(applied,0);
 assert.equal(f.reply(q.id,1),true);assert.equal(f.reply(q.id,1),false);await task;assert.equal(applied,1);
 assert.deepEqual(f.messages.at(-1),{name:'app-dialog:closed',value:q.id});
 const next=f.show();assert.notEqual(f.request().id,q.id);assert.equal(f.reply(q.id,1),false);f.reply(f.request().id,0);assert.equal((await next).response,0);
});
test('unready renderer, overlap and delivery failure cancel without applying changes',async()=>{
 const f=fixture();assert.equal((await f.show()).response,0);assert.equal(f.request(),undefined);
 assert.equal(f.handlers['app-dialog:ready']({sender:{},senderFrame:{}},true),false);
 f.ready();const first=f.show();const id=f.request().id;
 assert.equal((await f.show()).response,0);assert.equal(f.request().id,id);
 f.reply(id,0);assert.equal((await first).response,0);
 f.failSend();assert.equal((await f.show()).response,0);
 assert.equal((await f.show()).response,0);
});
test('reload, renderer crash, view destruction and window close cancel the question and require readiness again',async()=>{
 for(const event of ['navigate','render-process-gone','destroyed','closed','unsubscribe']){
  const f=fixture();f.ready();const task=f.show(),id=f.request().id;
  if(event==='navigate')f.webContents.emit('did-start-navigation',{url:'file:///app',isSameDocument:false,isMainFrame:true});
  else if(event==='closed')f.destroy();
  else if(event==='unsubscribe')f.handlers['app-dialog:ready'](f.event,false);
  else f.webContents.emit(event);
  assert.equal((await task).response,0,event);assert.equal(f.reply(id,1),false);
  assert.equal((await f.show()).response,0);
 }
});
test('subframe and same-document navigation do not dismiss the active confirmation; info has a safe single button',async()=>{
 const f=fixture();f.ready();const task=f.show({buttons:undefined,defaultId:99,cancelId:99,type:'info'}),q=f.request();
 assert.deepEqual(q.buttons,['Понятно']);assert.equal(q.cancelId,0);assert.equal(q.defaultId,0);
 f.webContents.emit('did-start-navigation',{url:'file:///app#section',isSameDocument:true,isMainFrame:true});
 f.webContents.emit('did-start-navigation',{url:'file:///child',isSameDocument:false,isMainFrame:false});
 assert.equal(f.reply(q.id,0),true);assert.equal((await task).response,0);
});
