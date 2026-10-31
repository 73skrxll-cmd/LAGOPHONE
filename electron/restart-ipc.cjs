const {app,ipcMain,dialog}=require('electron');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');
const RUN_ONCE='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce';
const VALUE='LAGOPHONEAfterRestart';
function run(file,args,timeout=15000){return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,env:windowsPowerShellEnvironment(),maxBuffer:1024*1024},(error,stdout)=>error?reject(error):resolve(stdout.trim())))}
function startupCommand(executable){if(!path.win32.isAbsolute(executable)||!/^.*\.exe$/i.test(executable)||/["\r\n\0]/.test(executable))throw Error('Недопустимый путь LAGOPHONE.');const command='"'+executable+'" --lagophone-after-restart';if(command.length>260)throw Error('Путь слишком длинный для разового запуска Windows.');return command}
function createWindowsRestart({inspect}){
 const enabled=process.platform==='win32'&&app.isPackaged;
 const systemFile=name=>path.win32.join(process.env.SystemRoot||'C:\\Windows','System32',name);
 const manager=require('./restart.cjs').createRestartManager({
  enabled,file:()=>path.join(app.getPath('userData'),'restart-pending.json'),inspect,
  getBootId:()=>run(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')",'utf16le').toString('base64')]),
  arm:async()=>{const executable=process.env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');await fs.access(executable);await run(systemFile('reg.exe'),['ADD',RUN_ONCE,'/v',VALUE,'/t','REG_SZ','/d',startupCommand(executable),'/f'])},
  disarm:()=>run(systemFile('reg.exe'),['DELETE',RUN_ONCE,'/v',VALUE,'/f']),
 });
 return {...manager,register(getWindow,optimizer){
  let restarting=false;
  ipcMain.handle('restart:status',()=>manager.status());
  ipcMain.handle('restart:acknowledge',()=>manager.acknowledge());
  ipcMain.handle('restart:later',()=>manager.defer());
  ipcMain.handle('restart:now',async()=>{
   if(!enabled)throw Error('Перезагрузка доступна в установленной или portable-версии Windows.');
   if(optimizer.isRunning()||restarting)throw Error('Дождитесь завершения текущей операции.');
   restarting=true;
   try{return await optimizer.exclusive('restart',async()=>{
    const state=await manager.status();if(!state.pending)throw Error('Нет ожидающего перезагрузки профиля.');
    const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'Перезагрузить компьютер?',message:'Сохраните открытые файлы перед перезагрузкой.',detail:state.scheduled?'Windows перезагрузится сейчас. После входа LAGOPHONE откроется один раз и проверит сохранённый профиль.':'Windows перезагрузится сейчас. После входа откройте LAGOPHONE вручную.',buttons:['Отмена','Перезагрузить'],defaultId:0,cancelId:0});
    if(choice.response!==1)return {ok:true,cancelled:true};
    await manager.defer();
    // Do not force-close applications with unsaved work.
    await run(systemFile('shutdown.exe'),['/r','/t','0']).catch(()=>{throw Error('Не удалось запустить перезагрузку Windows. Перезагрузите ПК через меню «Пуск».')});return {ok:true};
   });}finally{restarting=false}
  });
 }};
}
module.exports={createWindowsRestart,startupCommand};
