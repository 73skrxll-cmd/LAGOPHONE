const {isCustomGame,acceptsGame,customGame}=require('./game-selection.cjs');
const { windowsPowerShellEnvironment, windowsPowerShellExecutable } = require('./windows-powershell.cjs');
const {app,ipcMain,dialog}=require('electron');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {catalog,buildPlan}=require('./optimization.cjs');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function ps(script,timeout=600000){
  return new Promise((resolve,reject)=>execFile(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; "+script,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),windowsHide:true,timeout,maxBuffer:4*1024*1024},(e,out)=>e?reject(new Error(e.killed||e.code==='ETIMEDOUT'?`Windows не ответила за ${Math.round(timeout/1000)} секунд. Повторите проверку состояния.`:'Windows не выполнила запрос. Если появлялся запрос прав администратора, он мог быть отменён. Повторите проверку состояния.')):resolve(out.trim())));
}
function registerOptimizer(getWindow,activities,restart){
  const {optimizationEvents}=require('./activity.cjs');
  const session=require('./optimizer-session.cjs').createOptimizerSession();
  let cachedStatus=null,cachedGameStatus=null,cachedPowerStatus=null,cachedLast=null,sidRequest=null;
  const games=new Map();
  const shaders=require('./shader-preparation.cjs').createShaderPreparation({file:()=>path.join(app.getPath('userData'),'shader-tool.json')});
  const worker=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','optimizer.ps1'):path.join(__dirname,'optimizer.ps1');
  const assertWindows=()=>{if(process.platform!=='win32')throw new Error('Оптимизация выполняется только в настольном приложении Windows.');};
  async function identity(){if(!sidRequest)sidRequest=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',15000).catch(error=>{sidRequest=null;throw error});return sidRequest;}
  async function run(mode,payload,elevate){
    assertWindows();
    const sid=await identity();
    const encoded=Buffer.from(JSON.stringify({...payload,sid}),'utf8').toString('base64');
    if(!elevate)return JSON.parse(await ps(`& ${quote(worker)} -Mode ${quote(mode)} -PayloadBase64 ${quote(encoded)}`,20000));
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lagophone-'));
    const output=path.join(directory,'result.json');
    try{
      const script=`& ${quote(worker)} -Mode ${quote(mode)} -PayloadBase64 ${quote(encoded)} -ResultPath ${quote(output)}`;
      const command=Buffer.from(script,'utf16le').toString('base64');
      await ps(`$p=Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${command}'; if($p.ExitCode -ne 0){throw 'Optimization worker failed'}`);
      const result=JSON.parse(await fs.readFile(output,'utf8'));
      await fs.writeFile(path.join(app.getPath('userData'),payload.scope==='power'?'last-power-optimization.json':'last-optimization.json'),JSON.stringify({date:new Date().toISOString(),mode,...result},null,2));
      return result;
    }finally{await fs.rm(directory,{recursive:true,force:true});}
  }
  async function inspectStatus(){
    assertWindows();
    const current=()=>({...((cachedStatus)||{ok:true,active:false,remaining:0,checks:[]}),last:cachedLast,running:session.isRunning(),operation:session.current()});
    // Poll the in-memory operation while Windows works; do not spawn another full audit every two seconds.
    if(session.isRunning())return current();
    const inspected=await session.inspect(async()=>{
      const state=await run('inspect',{},false);
      if(state.ok)cachedStatus=state;
      try{cachedLast=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'last-optimization.json'),'utf8'));}catch{}
      return {...cachedStatus,...state,last:cachedLast};
    });
    return {...inspected,running:session.isRunning(),operation:session.current()};
  }
  ipcMain.handle('optimization:status',inspectStatus);
  ipcMain.handle('optimization:power-status',async()=>{
    assertWindows();
    if(!session.isRunning())cachedPowerStatus=await run('inspect',{scope:'power'},false);
    return {...(cachedPowerStatus||{ok:true,active:false,remaining:0,checks:[]}),running:session.isRunning(),operation:session.current()};
  });
  ipcMain.handle('optimization:power-restore',()=>{assertWindows();return session.exclusive('power',async setPhase=>{
    setPhase('confirmation');
    const choice=await dialog.showMessageBox(getWindow(),{type:'question',message:'Завершить прерванную настройку питания?',detail:'Восстановятся только параметры отдельной операции питания. Системные твики не изменятся.',buttons:['Отмена','Восстановить питание'],defaultId:0,cancelId:0});
    if(choice.response!==1)return {ok:true,cancelled:true,report:[]};
    setPhase('windows');const result=await run('restore',{scope:'power'},true);await activities.add(optimizationEvents('restore',{scope:'power'},result));return result;
  })});

  ipcMain.handle('optimization:game-status',async()=>{
    assertWindows();
    if(session.isRunning())return {...(cachedGameStatus||{ok:true,active:false,remaining:0,checks:[]}),running:true,operation:session.current()};
    const state=await run('inspect',{scope:'game'},false);
    cachedGameStatus=state;
    for(const saved of state.savedGames||[]){
      if(acceptsGame(saved.id,saved.gamePath)){try{if((await fs.stat(saved.gamePath)).isFile())games.set(saved.id,saved.gamePath)}catch{}}
    }
    return {...state,running:session.isRunning(),operation:session.current()};
  });
  ipcMain.handle('optimization:game-restore',()=>{assertWindows();return session.exclusive('restore',async setPhase=>{
    setPhase('confirmation');
    const answer=await dialog.showMessageBox(getWindow(),{type:'question',message:'Восстановить игровые настройки всех игр?',detail:'Отменятся только игровые изменения. Системные твики и планы питания останутся. После восстановления перезапустите игры.',buttons:['Отмена','Восстановить'],defaultId:0,cancelId:0});
    if(answer.response!==1)return {ok:true,cancelled:true,report:[]};
    setPhase('windows');const result=await run('restore',{scope:'game'},true);await activities.add(optimizationEvents('restore',{scope:'game'},result));return result;
  })});

  ipcMain.handle('game:shader-status',()=>shaders.status());
  ipcMain.handle('game:shader-connect',async()=>{
    assertWindows();if(session.isRunning())throw Error('Дождитесь текущей операции.');
    const choice=await dialog.showOpenDialog(getWindow(),{title:'Выберите SCSKiller.exe официальной установки или cli/scskiller.exe',properties:['openFile'],filters:[{name:'SCSKiller',extensions:['exe']}]});
    if(choice.canceled)return null;
    const selected=choice.filePaths[0],candidate=path.join(path.dirname(selected),'cli','scskiller.exe');
    let executable;try{if((await fs.stat(candidate)).isFile())executable=candidate}catch{}
    if(!executable&&path.basename(path.dirname(selected)).toLowerCase()==='cli'&&path.basename(selected).toLowerCase()==='scskiller.exe')executable=selected;
    if(!executable)throw Error('Рядом с выбранным файлом нет cli/scskiller.exe. Укажите CLI из официальной установки SCSKiller.');
    const answer=await dialog.showMessageBox(getWindow(),{type:'question',message:'Подключить SCSKiller для подготовки шейдеров?',detail:executable+'\nБудут вызваны команды добавления игры, проверки и компиляции шейдеров. Получайте SCSKiller из официального репозитория BlueHeisenberg/SCSKiller.',buttons:['Отмена','Подключить'],defaultId:0,cancelId:0});
    return answer.response===1?shaders.connect(executable):null;
  });
  ipcMain.handle('game:shader-prepare',async(_,id)=>{assertWindows();return session.exclusive('apply',async setPhase=>{
    const executable=games.get(id);
    if(!acceptsGame(id,executable))throw Error('Сначала выберите EXE игры.');
    const name=path.basename(executable,path.extname(executable));
    const count=await ps('@([Diagnostics.Process]::GetProcessesByName('+quote(name)+')).Count',15000);
    if(Number(count)!==0)throw Error('Закройте игру перед подготовкой шейдеров. Настройки приоритета уже сохранены.');
    setPhase('windows');
    return shaders.prepare(executable,message=>{const window=getWindow();if(window&&!window.isDestroyed())window.webContents.send('game:shader-progress',message)});
  })});
  ipcMain.handle('optimization:custom-game',async()=>{
    assertWindows();if(session.isRunning())throw Error('Дождитесь завершения операции.');
    const choice=await dialog.showOpenDialog(getWindow(),{title:'Другая игра',properties:['openFile'],filters:[{name:'Game executable',extensions:['exe']}]});
    if(choice.canceled)return null;
    const location=choice.filePaths[0];if(!(await fs.stat(location)).isFile())throw Error('Файл игры недоступен.');
    const existing=[...games].find(([id,file])=>isCustomGame(id)&&file.toLowerCase()===location.toLowerCase());
    const selected=customGame(location,existing?.[0]);games.set(selected.id,selected.gamePath);return selected;
  });
  ipcMain.handle('optimization:game',async(_,id)=>{
    assertWindows();if(session.isRunning())throw new Error('Дождитесь завершения операции.');
    const game=catalog.games.find(g=>g.id===id&&g.id!=='none');
    if(!game&&!isCustomGame(id))throw new Error('Неизвестная игра');
    const choice=await dialog.showOpenDialog(getWindow(),{title:'Выберите EXE игры '+(game?.name||''),properties:['openFile'],filters:[{name:'Game executable',extensions:['exe']}]});
    if(choice.canceled)return null;
    const executable=choice.filePaths[0];
    if(!acceptsGame(id,executable)||!(await fs.stat(executable)).isFile())throw new Error('Выберите основной EXE игры'+(game?': '+game.executables.join(' или '):'.'));
    games.set(id,executable);return executable;
  });
  ipcMain.handle('optimization:apply',(_,input,version)=>{assertWindows();return session.exclusive(input?.scope==='power'?'power':'apply',async setPhase=>{
    try {
    let status=['game','power'].includes(input?.scope)?await run('inspect',{scope:input.scope},false):null;
    if(status&&!status.ok)throw new Error(status.error||(input?.scope==='power'?'Не удалось проверить питание.':'Не удалось проверить игры.'));
    const actual=status?.windows||JSON.parse(await ps("$build=[int](Get-CimInstance Win32_OperatingSystem).BuildNumber; @{version=$(if($build -ge 22000){'11'}else{'10'});build=$build} | ConvertTo-Json -Compress",30000));
    const plan=buildPlan(input,version,actual.version,games.get(input?.game),actual.build);
    status=status||await run('inspect',plan.scope==='game'?{scope:'game'}:{},false);
    if(!status.ok)throw new Error(status.error||'Не удалось прочитать состояние.');
    if(status.needsRecovery)throw new Error(plan.scope==='power'?'Прервана отдельная операция питания. Системные твики восстанавливать не нужно.':'Сначала завершите восстановление прерванной операции.');
    const unavailable=plan.ids.filter(id=>status.availability?.[id]?.available===false);
    if(unavailable.length)throw new Error('Выбранные пункты недоступны на этом ПК. Обновите список настроек: '+unavailable.map(id=>catalog.steps.find(step=>step.id===id)?.name||id).join(', '));
    plan.ratingPlan.ids=plan.ratingPlan.ids.filter(id=>status.availability?.[id]?.available!==false);
    setPhase('confirmation');
    const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'Применить профиль?',message:'Изменений: '+plan.ids.length,detail:plan.ids.map(id=>{const step=catalog.steps.find(s=>s.id===id);const description={...step,...step.variants?.[actual.version]};return description.attention?'⚠ '+description.name+' — '+description.attention.consequence:description.name}).join('\n')+'\n\nИсходные значения будут сохранены до изменений. Windows запросит права администратора. При ошибке программа попытается выполнить откат; результат будет показан в отчёте.',buttons:['Отмена','Применить'],defaultId:0,cancelId:0});
    if(choice.response!==1){const result={ok:true,cancelled:true,report:[]};await activities.add(optimizationEvents('apply',input,result));return result;}
    setPhase('windows');
    const result=await run('apply',plan,true);
    if(restart&&!plan.scope)result.restart=await restart.afterApply({...plan,profile:result.profile||plan.profile},result,actual.version);
    await activities.add(optimizationEvents('apply',plan,result));return result;
    } catch(error){await activities.add([{kind:'apply',status:'error',title:'Ошибка применения настроек',detail:error.message}]);throw error}
  });});
  ipcMain.handle('optimization:restore',()=>{assertWindows();return session.exclusive('restore',async setPhase=>{
    try {
    setPhase('confirmation');
    const choice=await dialog.showMessageBox(getWindow(),{type:'question',message:'Восстановить исходные настройки?',detail:'Восстановятся сохранённые параметры реестра, состояния служб и план питания. Настройки, изменённые сторонними программами, могут потребовать ручной проверки.',buttons:['Отмена','Восстановить'],defaultId:0,cancelId:0});
    if(choice.response!==1){const result={ok:true,cancelled:true,report:[]};await activities.add(optimizationEvents('restore',null,result));return result;}
    setPhase('windows');
    const result=await run('restore',{},true);
    if(restart)await restart.clear().catch(()=>{});
    await activities.add(optimizationEvents('restore',null,result));return result;
    } catch(error){await activities.add([{kind:'restore',status:'error',title:'Ошибка восстановления настроек',detail:error.message}]);throw error}
  });});
  return {isRunning:()=>session.isRunning(),isMutating:()=>session.isRunning()&&session.current().mode!=='restart',status:inspectStatus,exclusive:(mode,task)=>session.exclusive(mode,task)};
}
module.exports={registerOptimizer};
