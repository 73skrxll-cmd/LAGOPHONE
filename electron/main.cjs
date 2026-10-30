const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { apps, links, validateAction } = require('./policy.cjs');
let win;
const optimizer = require('./optimizer-ipc.cjs').registerOptimizer(() => win);
function powershell(script) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Системные функции доступны только в Windows.'));
  const encoded = Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand', encoded], { windowsHide: true, timeout: 120000, maxBuffer: 4*1024*1024 }, (err, out) => err ? reject(new Error('Windows не выполнила действие. Проверьте права доступа и доступность системного компонента.')) : resolve(out.trim())));
}
async function system() {
  if (process.platform !== 'win32') return { demo: true };
  return JSON.parse(await powershell(`
    $os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1;
    $board=Get-CimInstance Win32_BaseBoard | Select-Object -First 1; $pc=Get-CimInstance Win32_ComputerSystem;
    $gpu=@(Get-CimInstance Win32_VideoController | ForEach-Object {$_.Name});
    $ram=@(Get-CimInstance Win32_PhysicalMemory); $disk=@(Get-PhysicalDisk | ForEach-Object { @{name=$_.FriendlyName;type=[string]$_.MediaType;size=[math]::Round($_.Size/1GB)} });
    @{demo=$false;version=$(if([int]$os.BuildNumber -ge 22000){'11'}else{'10'});os=$os.Caption;build=$os.BuildNumber;
    cpu=$cpu.Name;cores=$cpu.NumberOfCores;threads=$cpu.NumberOfLogicalProcessors;gpu=$gpu;board=$board.Product;vendor=$board.Manufacturer;manufacturer=$pc.Manufacturer;model=$pc.Model;
    ram=[math]::Round($pc.TotalPhysicalMemory/1GB);ramSpeed=($ram | Select-Object -First 1).Speed;slots=$ram.Count;disks=$disk;
    uptime=[math]::Floor(((Get-Date)-$os.LastBootUpTime).TotalHours)} | ConvertTo-Json -Depth 4 -Compress
  `));
}
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if(win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 680, backgroundColor: '#101211', title: 'LAGOPHONE', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.on('close', e => { if(optimizer.isRunning()){e.preventDefault();void dialog.showMessageBox(win,{type:'info',message:'Дождитесь завершения оптимизации или отката.',detail:'Сейчас сохраняются и проверяются настройки Windows.'});} });
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
});
app.on('window-all-closed', () => app.quit());
ipcMain.handle('system', () => system());
ipcMain.handle('action', async (_, id, version) => {
  if(optimizer.isRunning()) throw new Error('Дождитесь завершения оптимизации или отката.');
  const info = await system();
  const action = validateAction(id, version, info.version);
  const choice = await dialog.showMessageBox(win, { type:'question', title:'Подтверждение', message:action.title, detail:'Перед изменениями рекомендуется создать точку восстановления. Продолжить?', buttons:['Отмена','Продолжить'], defaultId:0, cancelId:0 });
  if(choice.response !== 1) return 'Действие отменено.';
  return powershell(action.script);
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
    return 'Установщик сохранён. Перед запуском проверьте издателя в свойствах файла. Автоматическая установка не выполняется.';
  } catch(e) { if(created) await fs.promises.unlink(partial).catch(()=>{}); throw new Error('Не удалось сохранить установщик: '+e.message); }
  finally { downloading.delete(id); }
});
