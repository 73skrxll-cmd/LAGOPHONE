const { windowsPowerShellEnvironment, windowsPowerShellExecutable } = require('./windows-powershell.cjs');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { apps, links, validateAction } = require('./policy.cjs');
require('./branding.cjs').configureBranding(app);
let win;
const activities=require('./activity.cjs').createActivityStore(()=>path.join(app.getPath('userData'),'activity.json'));
const restart=require('./restart-ipc.cjs').createWindowsRestart({inspect:()=>optimizer.status()});
const optimizer = require('./optimizer-ipc.cjs').registerOptimizer(() => win,activities,restart);
restart.register(()=>win,optimizer);
ipcMain.handle('activity:list',()=>activities.list());
ipcMain.handle('activity:clear',()=>activities.clear());
function powershell(script) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Системные функции доступны только в Windows.'));
  const encoded = Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => execFile(windowsPowerShellExecutable(), ['-NoProfile','-NonInteractive','-EncodedCommand', encoded], { env: windowsPowerShellEnvironment(), windowsHide: true, timeout: 120000, maxBuffer: 4*1024*1024 }, (err, out) => err ? reject(new Error('Windows не выполнила действие. Проверьте права доступа и доступность системного компонента.')) : resolve(out.trim())));
}
async function system() {
  if (process.platform !== 'win32') return { demo: true };
  return JSON.parse(await powershell(`
    $os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1;
    $board=Get-CimInstance Win32_BaseBoard | Select-Object -First 1; $pc=Get-CimInstance Win32_ComputerSystem;
    $controllers=@(Get-CimInstance Win32_VideoController);$gpu=@($controllers | ForEach-Object {$_.Name});
    $ram=@(Get-CimInstance Win32_PhysicalMemory); $disk=@(Get-PhysicalDisk | ForEach-Object { @{name=$_.FriendlyName;manufacturer=$_.Manufacturer;type=[string]$_.MediaType;size=[math]::Round($_.Size/1GB)} });
    @{demo=$false;version=$(if([int]$os.BuildNumber -ge 22000){'11'}else{'10'});os=$os.Caption;build=$os.BuildNumber;
    cpu=$cpu.Name;cores=$cpu.NumberOfCores;threads=$cpu.NumberOfLogicalProcessors;gpu=$gpu;gpuDrivers=@($controllers | Where-Object {$_.DriverVersion -and $_.AdapterCompatibility -match 'NVIDIA|AMD|Advanced Micro|Intel' -and $_.InstalledDisplayDrivers -notmatch 'BasicDisplay'} | ForEach-Object {@{name=$_.Name;version=$_.DriverVersion}});board=$board.Product;vendor=$board.Manufacturer;boardVersion=$board.Version;network=@(Get-CimInstance Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object {$_.PhysicalAdapter} | ForEach-Object {@{name=$_.Name;vendor=$_.Manufacturer;hardwareId=$_.PNPDeviceID}});audio=@(Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue | ForEach-Object {@{name=$_.Name}});bluetooth=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object {$_.PNPClass -eq 'Bluetooth' -and $_.PNPDeviceID -like 'USB*'} | ForEach-Object {@{name=$_.Name;hardwareId=$_.PNPDeviceID}});manufacturer=$pc.Manufacturer;model=$pc.Model;
    ram=[math]::Round($pc.TotalPhysicalMemory/1GB);ramSpeed=($ram | Select-Object -First 1).Speed;slots=$ram.Count;memory=@($ram | ForEach-Object {@{manufacturer=$_.Manufacturer;partNumber=$_.PartNumber}});disks=$disk;
    uptime=[math]::Floor(((Get-Date)-$os.LastBootUpTime).TotalHours)} | ConvertTo-Json -Depth 4 -Compress
  `));
}
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if(win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  if(process.argv.includes('--lagophone-after-restart')){try{if(await restart.startup()){app.quit();return}}catch{ /* The UI offers a retry if Windows could not be inspected. */ }}
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 680, backgroundColor: '#101211', icon:path.join(__dirname,'../assets/brand.png'), title: 'GTM PC', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.on('close', e => { if(optimizer.isMutating()){e.preventDefault();void dialog.showMessageBox(win,{type:'info',message:'Дождитесь завершения оптимизации или отката.',detail:'Сейчас сохраняются и проверяются настройки Windows.'});} });
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  // Update only an existing, consented RunOnce target; do not delay the window.
  if(!process.argv.includes('--lagophone-after-restart'))void restart.refreshStartup().catch(()=>{});
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
});
app.on('window-all-closed', () => app.quit());
ipcMain.handle('system', () => system());
ipcMain.handle('apps:installed',()=>require('./installed-apps.cjs').inspectInstalled());
ipcMain.handle('action', async (_, id, version) => {
  if(optimizer.isRunning()) throw new Error('Дождитесь завершения оптимизации или отката.');
  const info = await system();
  const action = validateAction(id, version, info.version);
  const choice = await dialog.showMessageBox(win, { type:'question', title:'Подтверждение', message:action.title, detail:'Перед изменениями рекомендуется создать точку восстановления. Продолжить?', buttons:['Отмена','Продолжить'], defaultId:0, cancelId:0 });
  if(choice.response !== 1) return 'Действие отменено.';
  const message=await powershell(action.script);
  await activities.add([{kind:'windows',status:'success',title:id==='temp'?'Очистка временных файлов завершена':'Выполнено действие Windows',detail:message}]);
  return message;
});
ipcMain.handle('open', async (_, id) => {
  const url = Object.hasOwn(links,id) ? links[id] : Object.hasOwn(apps,id) ? apps[id].page : null;
  if (!url) throw new Error('Неизвестная ссылка');
  await shell.openExternal(url);
});
const downloading = new Set();
ipcMain.handle('download', async (_, id) => {
  if (!Object.hasOwn(apps,id) || !apps[id].url) throw new Error('Прямая загрузка недоступна');
  if (downloading.has(id)) throw new Error('Загрузка уже выполняется');
  const item = apps[id];
  const choice = await dialog.showSaveDialog(win, { title:'Сохранить установщик', defaultPath:path.join(app.getPath('downloads'),item.file) });
  if (choice.canceled || !choice.filePath) return 'Сохранение отменено.';
  downloading.add(id);
  const partial = choice.filePath+'.lagophone-part';
  let created = false;
  try {
    const { net } = require('electron');
    const response = await net.fetch(item.url, { signal: AbortSignal.timeout(300000) });
    if(!response.ok || !response.body) throw new Error('Сервер загрузки недоступен');
    const total=Number(response.headers.get('content-length'));
    const file=await fs.promises.open(partial,'wx');
    created = true;
    let bytes=0;
    try { for await (const chunk of response.body) { await file.write(chunk); bytes+=chunk.length; if(!win.isDestroyed()) win.webContents.send('download-progress',{id,percent:total?Math.round(bytes/total*100):null,bytes}); } } finally {await file.close();}
    await fs.promises.rename(partial,choice.filePath);
    shell.showItemInFolder(choice.filePath);
    await activities.add([{kind:'download',status:'success',title:'Скачан установщик '+item.file,detail:'Установщик сохранён. Автоматическая установка не запускалась.'}]);
    return 'Установщик сохранён. Перед запуском проверьте издателя в свойствах файла. Автоматическая установка не выполняется.';
  } catch(e) { if(created) await fs.promises.unlink(partial).catch(()=>{}); throw new Error('Не удалось сохранить установщик: '+e.message); }
  finally { downloading.delete(id); }
});

ipcMain.handle('drivers:catalog', async (_, version) => {
  const {buildDriverCatalog}=await import('../shared/drivers.mjs');
  return buildDriverCatalog(await system(),version);
});
ipcMain.handle('drivers:open', async (_, id, version) => {
  const {buildDriverCatalog}=await import('../shared/drivers.mjs');
  const catalog=buildDriverCatalog(await system(),version);
  const link=catalog.flatMap(c=>c.links).find(l=>l.id===id);
  if(!link)throw new Error('Ссылка не соответствует обнаруженному оборудованию. Обновите сведения о системе.');
  await shell.openExternal(link.url);
});
