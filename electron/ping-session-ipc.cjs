const {app,ipcMain,dialog,shell}=require('electron');
const {execFile,spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const {discoverGames,acceptsManual,gameSpec}=require('./ping-games.cjs');
const {createGameSession}=require('./ping-session.cjs');
function registerGameSession(getWindow,optimizer){
 const location=name=>path.join(app.getPath('userData'),'ping-game-'+name+'.json');
 const worker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','ping-session.ps1'):path.join(__dirname,'ping-session.ps1');
 async function write(name,value){const filename=location(name);await fs.mkdir(path.dirname(filename),{recursive:true});const temp=filename+'.tmp';await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});await fs.rename(temp,filename)}
 async function read(name){try{const file=location(name);if((await fs.stat(file)).size>512000)throw Error('Слишком большой журнал сессии.');return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''))}catch(e){if(e.code==='ENOENT')return null;throw e}}
 function args(mode,payload={}){return ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode',mode,'-PayloadBase64',Buffer.from(JSON.stringify(payload)).toString('base64'),'-SessionPathBase64',Buffer.from(location('journal')).toString('base64')]}
 function run(mode,payload){
  if(process.platform!=='win32')return Promise.reject(Error('Диагностика доступна в Windows 10/11.'));
  return new Promise((resolve,reject)=>execFile(windowsPowerShellExecutable(),args(mode,payload),{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:mode==='measure'?90000:30000,maxBuffer:512000},(error,out)=>{
   try{const result=JSON.parse(String(out).trim().replace(/^\uFEFF/,''));if(error||result.error)throw Error(result.error||'Windows не выполнила диагностику.');resolve(result)}catch(e){reject(Error(e instanceof SyntaxError?'Не удалось прочитать ответ Windows.':e.message))}
  }));
 }
 const session=createGameSession({run,write,load:async()=>({settings:await read('settings'),journal:await read('journal')}),
  discover:async manual=>process.platform==='win32'?discoverGames(await run('roots'),manual):[],
  exclusive:(mode,task)=>optimizer.exclusive(mode,task),
  launch:async game=>{
   if(game.id==='tarkov'){
    if(!acceptsManual('tarkov',game.launcher)||(await fs.stat(game.launcher)).isFile()!==true)throw Error('Лаунчер Tarkov недоступен.');
    await new Promise((resolve,reject)=>{const child=spawn(game.launcher,[],{cwd:path.dirname(game.launcher),detached:true,windowsHide:false,stdio:'ignore',shell:false});child.once('error',()=>reject(Error('Не удалось открыть лаунчер Tarkov.')));child.once('spawn',()=>{child.unref();resolve()})});
   }else await shell.openExternal(gameSpec(game.id).uri);
  },
  watchdog:async leaseId=>new Promise((resolve,reject)=>{
   const child=spawn(windowsPowerShellExecutable(),[...args('watch'),'-ParentId',String(process.pid),'-LeaseId',leaseId],{env:windowsPowerShellEnvironment(),windowsHide:true,detached:true,stdio:'ignore'});child.once('error',()=>reject(Error('Не удалось включить восстановление загрузок.')));child.once('spawn',()=>{child.unref();resolve()});
  }),
 });
 function handle(channel,task){ipcMain.handle(channel,(event,...args)=>{const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Запрос недоступен.');return task(...args)})}
 handle('ping-game:status',()=>session.status());
 handle('ping-game:refresh',()=>session.refresh());
 handle('ping-game:settings',input=>session.saveSettings(input));
 handle('ping-game:start',()=>session.start());handle('ping-game:stop',()=>session.stop());
 handle('ping-game:manual',async id=>{
  const spec=gameSpec(id);if(session.isRunning())throw Error('Сначала останови сессию.');
  const choice=await dialog.showOpenDialog(getWindow(),{title:id==='tarkov'?'Выбери BsgLauncher.exe или EscapeFromTarkov.exe':'Выбери '+spec.process,properties:['openFile'],filters:[{name:'Приложение Windows',extensions:['exe']}]});if(choice.canceled)return false;
  const file=choice.filePaths[0];if(!acceptsManual(id,file)||!(await fs.stat(file)).isFile())throw Error('Выбери файл выбранной игры'+(id==='tarkov'?' или BsgLauncher.exe.':'.'));
  await session.manual(id,file);return true;
 });
 const timer=setInterval(()=>void session.tick(),10000);timer.unref();
 let closing=false;
 app.on('before-quit',event=>{if(!closing&&session.isRunning()){event.preventDefault();closing=true;void session.stop().then(()=>app.quit()).catch(()=>{closing=false;const win=getWindow();if(win&&!win.isDestroyed())void dialog.showMessageBox(win,{type:'error',message:'Не удалось восстановить фоновые загрузки.',detail:'Повтори остановку сессии в разделе «Пинг».'})})}});
 return session;
}
module.exports={registerGameSession};
