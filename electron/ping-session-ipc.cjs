const {app,ipcMain,dialog,shell}=require('electron');
const {execFile,spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const {discoverGames,acceptsManual,gameSpec}=require('./ping-games.cjs');
const {createProtonTunnel}=require('./proton-tunnel.cjs');
const {inspectLogs,fetchEpicStatus,buildSupportReport}=require('./ping-support.cjs');
const {createGameSession}=require('./ping-session.cjs');
function registerGameSession(getWindow,optimizer){
 const location=name=>path.join(app.getPath('userData'),'ping-game-'+name+'.json');
 let writes=Promise.resolve();
 const worker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','ping-session.ps1'):path.join(__dirname,'ping-session.ps1');
 function write(name,value){const snapshot=JSON.stringify(value);const task=writes.then(async()=>{const filename=location(name);await fs.mkdir(path.dirname(filename),{recursive:true});const temp=filename+'.'+require('node:crypto').randomUUID()+'.tmp';try{await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,filename)}finally{await fs.unlink(temp).catch(()=>{})}});writes=task.catch(()=>{});return task}
 async function read(name){try{const file=location(name);if((await fs.stat(file)).size>512000)throw Error('Слишком большой журнал сессии.');return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''))}catch(e){if(e.code==='ENOENT')return null;throw e}}
 function args(mode,payload={}){return ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode',mode,'-PayloadBase64',Buffer.from(JSON.stringify(payload)).toString('base64'),'-SessionPathBase64',Buffer.from(location('journal')).toString('base64')]}
 function run(mode,payload){
  if(process.platform!=='win32')return Promise.reject(Error('Диагностика доступна в Windows 10/11.'));
  return new Promise((resolve,reject)=>execFile(windowsPowerShellExecutable(),args(mode,payload),{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:mode==='measure'?90000:30000,maxBuffer:512000},(error,out)=>{
   try{const result=JSON.parse(String(out).trim().replace(/^\uFEFF/,''));if(error||result.error)throw Error(result.error||'Windows не выполнила диагностику.');resolve(result)}catch(e){reject(Error(e instanceof SyntaxError?'Не удалось прочитать ответ Windows.':e.message))}
  }));
 }
 const tunnelWorker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','wireguard-tunnel.ps1'):path.join(__dirname,'wireguard-tunnel.ps1');
 const transport=createProtonTunnel({directory:app.getPath('userData'),worker:tunnelWorker,networkCheck:run});
 const session=createGameSession({run,write,transport,load:async()=>({settings:await read('settings'),journal:await read('journal'),checks:await read('checks'),failure:await read('failure')}),
  discover:async manual=>process.platform==='win32'?discoverGames(await run('roots'),manual):[],
  exclusive:(mode,task)=>optimizer.exclusive(mode,task),
  launch:async game=>{
   if(game.id==='tarkov'){
    if(!acceptsManual('tarkov',game.launcher)||(await fs.stat(game.launcher)).isFile()!==true)throw Error('Лаунчер Tarkov недоступен.');
    await new Promise((resolve,reject)=>{const child=spawn(game.launcher,[],{cwd:path.dirname(game.launcher),detached:true,windowsHide:false,stdio:'ignore',shell:false});child.once('error',()=>reject(Error('Не удалось открыть лаунчер Tarkov.')));child.once('spawn',()=>{child.unref();resolve()})});
   }else{const uri=game.id==='fortnite'?game.launchUri:gameSpec(game.id).uri;if(!uri||!(game.id==='fortnite'?uri.startsWith('com.epicgames.launcher://apps/'):uri==='steam://rungameid/578080'))throw Error('Нет проверенного запроса запуска лаунчера.');await shell.openExternal(uri)}
  },
  watchdog:async leaseId=>new Promise((resolve,reject)=>{
   const child=spawn(windowsPowerShellExecutable(),[...args('watch'),'-ParentId',String(process.pid),'-LeaseId',leaseId],{env:windowsPowerShellEnvironment(),windowsHide:true,detached:true,stdio:'ignore'});child.once('error',()=>reject(Error('Не удалось включить восстановление загрузок.')));child.once('spawn',()=>{child.unref();resolve()});
  }),
 });
 function handle(channel,task){ipcMain.handle(channel,(event,...args)=>{const win=getWindow();if(!win||win.isDestroyed()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Запрос недоступен.');return task(...args)})}
 handle('ping-game:status',()=>session.status());
 handle('ping-game:refresh',()=>session.refresh());
 handle('ping-game:settings',input=>session.saveSettings(input));
 handle('ping-game:start',options=>session.start(options));handle('ping-game:stop',()=>session.stop());
 handle('ping-game:manual',async id=>{
  const spec=gameSpec(id);if(session.isRunning())throw Error('Сначала останови сессию.');
  const choice=await dialog.showOpenDialog(getWindow(),{title:id==='tarkov'?'Выбери BsgLauncher.exe или EscapeFromTarkov.exe':'Выбери '+spec.process,properties:['openFile'],filters:[{name:'Приложение Windows',extensions:['exe']}]});if(choice.canceled)return false;
  const file=choice.filePaths[0];if(!acceptsManual(id,file)||!(await fs.stat(file)).isFile())throw Error('Выбери файл выбранной игры'+(id==='tarkov'?' или BsgLauncher.exe.':'.'));
  await session.manual(id,file);return true;
 });
 handle('ping-game:vpn-import',async()=>{if(session.isRunning())throw Error('Сначала останови сессию.');const choice=await dialog.showOpenDialog(getWindow(),{title:'Твой профиль WireGuard из кабинета Proton VPN Free',properties:['openFile'],filters:[{name:'WireGuard',extensions:['conf']}]});if(choice.canceled)return false;const file=choice.filePaths[0];if((await fs.stat(file)).size>32768)throw Error('Профиль слишком большой.');await transport.importProfile(await fs.readFile(file,'utf8'));return true});
 const links={proton:'https://account.protonvpn.com/downloads',wireguard:'https://www.wireguard.com/install/',terms:'https://proton.me/legal/terms',epic:'https://status.epicgames.com'};
 handle('ping-game:setup',async page=>{if(!Object.hasOwn(links,page))throw Error('Неизвестная ссылка.');await shell.openExternal(links[page])});
 handle('ping-game:match',input=>session.markMatch(input));
 async function legacyInfo(){try{const file=path.join(app.getPath('userData'),'ping-route.json');const j=JSON.parse(await fs.readFile(file,'utf8'));return {owned:j.owned===true,connectIssued:j.connectIssued===true,knownOriginalDisconnected:j.owned===true&&j.connectIssued===true&&['trial','manual'].includes(j.reason)&&['warp','warpwithdns','warpwithdnsoverhttps','warpwithdnsovertls','warpdoh','warpdot','warp+doh','warp+dot','tunnelonly'].includes(j.mode)&&typeof j.leaseId==='string'&&/^[a-f0-9-]{36}$/i.test(j.leaseId),mode:j.mode}}catch{return {owned:false,available:false}}}
 handle('ping-game:legacy',()=>legacyInfo());
 handle('ping-game:legacy-stop',async()=>{if(session.isRunning())throw Error('Сначала останови сессию.');if((await run('processes')).games.length)throw Error('Сначала закрой игру.');const j=await legacyInfo();if(!j.knownOriginalDisconnected)throw Error('Нет подтверждённого исходного состояния старого подключения. Ничего не меняем.');const {createWarpClient}=require('./warp-client.cjs');const client=createWarpClient();const state=await client.inspect(true);if(state.connectionStatus!=='disconnected'){if(state.managed||!state.consumerVerified||state.mode!==j.mode)throw Error('Не подтверждено личное подключение WARP. Ничего не меняем.');await client.disconnect();await client.wait(false)}const file=path.join(app.getPath('userData'),'ping-route.json');const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify({owned:false,updatedAt:new Date().toISOString()}));await fs.rename(temp,file);return true});
 handle('ping-game:report',async()=>{
  const [status,logs,epic,audit,legacy]=await Promise.allSettled([session.status(),inspectLogs(process.env.LOCALAPPDATA),fetchEpicStatus(),run('audit'),legacyInfo()]);
  const report=buildSupportReport(status.status==='fulfilled'?status.value:null,{version:app.getVersion(),logs:logs.status==='fulfilled'?logs.value:[],epic:epic.status==='fulfilled'?epic.value:{available:false},audit:audit.status==='fulfilled'?audit.value:null,legacy:legacy.status==='fulfilled'?legacy.value:null});
  const choice=await dialog.showSaveDialog(getWindow(),{title:'Сохранить безопасный отчёт проверки',defaultPath:path.join(app.getPath('downloads'),'GTM-PC-Fortnite-check.json'),filters:[{name:'JSON',extensions:['json']}]});if(choice.canceled||!choice.filePath)return false;await fs.writeFile(choice.filePath,JSON.stringify(report,null,2),{mode:0o600});return true;
 });
 const timer=setInterval(()=>void session.tick(),10000);timer.unref();
 let closing=false;
 app.on('before-quit',event=>{if(!closing&&session.isRunning()){event.preventDefault();closing=true;void session.stop().then(()=>app.quit()).catch(()=>{closing=false;const win=getWindow();if(win&&!win.isDestroyed())void dialog.showMessageBox(win,{type:'error',message:'Не удалось восстановить настройки сессии.',detail:'Повтори остановку сессии в разделе «Пинг».'})})}});
 return session;
}
module.exports={registerGameSession};
