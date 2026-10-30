const {app,ipcMain,dialog}=require('electron');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {catalog,buildPlan}=require('./optimization.cjs');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function ps(script,timeout=600000){
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; "+script,'utf16le').toString('base64')],{windowsHide:true,timeout,maxBuffer:4*1024*1024},(e,out)=>e?reject(new Error('Windows не выполнила операцию. Возможно, отменён запрос администратора. Если выполнение было прервано, проверьте состояние и используйте откат.')):resolve(out.trim())));
}
function registerOptimizer(getWindow){
  let running=false;
  const games=new Map();
  const worker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','optimizer.ps1'):path.join(__dirname,'optimizer.ps1');
  const assertWindows=()=>{if(process.platform!=='win32')throw new Error('Оптимизация выполняется только в настольном приложении Windows.');};
  async function identity(){return ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',15000);}
  async function run(mode,payload,elevate){
    assertWindows();
    const sid=await identity();
    const encoded=Buffer.from(JSON.stringify({...payload,sid}),'utf8').toString('base64');
    if(!elevate)return JSON.parse(await ps(`& ${quote(worker)} -Mode ${quote(mode)} -PayloadBase64 ${quote(encoded)}`));
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lagophone-'));
    const output=path.join(directory,'result.json');
    try{
      const script=`& ${quote(worker)} -Mode ${quote(mode)} -PayloadBase64 ${quote(encoded)} -ResultPath ${quote(output)}`;
      const command=Buffer.from(script,'utf16le').toString('base64');
      await ps(`$p=Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${command}'; if($p.ExitCode -ne 0){throw 'Optimization worker failed'}`);
      const result=JSON.parse(await fs.readFile(output,'utf8'));
      await fs.writeFile(path.join(app.getPath('userData'),'last-optimization.json'),JSON.stringify({date:new Date().toISOString(),mode,...result},null,2));
      return result;
    }finally{await fs.rm(directory,{recursive:true,force:true});}
  }
  ipcMain.handle('optimization:status',async()=>{
    assertWindows();
    const state=await run('inspect',{},false);
    let last=null;try{last=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'last-optimization.json'),'utf8'));}catch{}
    return {...state,last,running};
  });
  ipcMain.handle('optimization:game',async(_,id)=>{
    assertWindows();if(running)throw new Error('Дождитесь завершения операции.');
    const game=catalog.games.find(g=>g.id===id&&g.id!=='none');
    if(!game)throw new Error('Неизвестная игра');
    const choice=await dialog.showOpenDialog(getWindow(),{title:'Выберите основной EXE игры '+game.name,properties:['openFile'],filters:[{name:'Game executable',extensions:['exe']}]});
    if(choice.canceled)return null;
    const executable=choice.filePaths[0];
    if(!game.executables.includes(path.basename(executable).toLowerCase()))throw new Error('Нужен основной EXE игры: '+game.executables.join(' или '));
    games.set(id,executable);return executable;
  });
  async function exclusive(task){assertWindows();if(running)throw new Error('Уже выполняется операция.');running=true;try{return await task()}finally{running=false}}
  ipcMain.handle('optimization:apply',(_,input,version)=>exclusive(async()=>{
    const actual=await ps("$build=[int](Get-CimInstance Win32_OperatingSystem).BuildNumber; if($build -ge 22000){'11'}else{'10'}",30000);
    const plan=buildPlan(input,version,actual,games.get(input?.game));
    const status=await run('inspect',{},false);
    if(!status.ok)throw new Error(status.error||'Не удалось прочитать состояние.');
    if(status.active)throw new Error('Сначала восстановите предыдущие настройки.');
    const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'Применить профиль?',message:'Изменений: '+plan.ids.length,detail:plan.ids.map(id=>catalog.steps.find(s=>s.id===id).name).join('\n')+'\n\nИсходные значения будут сохранены до изменений. Windows запросит права администратора. При ошибке программа попытается выполнить откат; результат будет показан в отчёте.',buttons:['Отмена','Применить'],defaultId:0,cancelId:0});
    if(choice.response!==1)return {ok:true,cancelled:true,report:[]};
    return run('apply',plan,true);
  }));
  ipcMain.handle('optimization:restore',()=>exclusive(async()=>{
    const choice=await dialog.showMessageBox(getWindow(),{type:'question',message:'Восстановить исходные настройки?',detail:'Восстановятся сохранённые параметры реестра, состояния служб и план питания. Настройки, изменённые сторонними программами, могут потребовать ручной проверки.',buttons:['Отмена','Восстановить'],defaultId:0,cancelId:0});
    if(choice.response!==1)return {ok:true,cancelled:true,report:[]};
    return run('restore',{},true);
  }));
  return {isRunning:()=>running};
}
module.exports={registerOptimizer};
