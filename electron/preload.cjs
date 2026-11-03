const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lagophone', {
  windowChrome: process.platform==='win32',
  setWindowTheme: theme => ipcRenderer.invoke('window:theme',theme),
  gamePingStatus:()=>ipcRenderer.invoke('ping-game:status'),
  gamePingRefresh:()=>ipcRenderer.invoke('ping-game:refresh'),
  gamePingSettings:input=>ipcRenderer.invoke('ping-game:settings',input),
  gamePingManual:id=>ipcRenderer.invoke('ping-game:manual',id),
  gamePingStart:options=>ipcRenderer.invoke('ping-game:start',options),
  gamePingSetup:page=>ipcRenderer.invoke('ping-game:setup',page),
  gamePingMatch:input=>ipcRenderer.invoke('ping-game:match',input),
  gamePingReport:()=>ipcRenderer.invoke('ping-game:report'),
  gamePingLegacy:()=>ipcRenderer.invoke('ping-game:legacy'),
  gamePingLegacyStop:()=>ipcRenderer.invoke('ping-game:legacy-stop'),
  gamePingStop:()=>ipcRenderer.invoke('ping-game:stop'),
  restartAcknowledge: () => ipcRenderer.invoke('restart:acknowledge'),
  restartStatus: () => ipcRenderer.invoke('restart:status'),
  restartLater: () => ipcRenderer.invoke('restart:later'),
  restartNow: () => ipcRenderer.invoke('restart:now'),
  activities: () => ipcRenderer.invoke('activity:list'),
  clearActivities: () => ipcRenderer.invoke('activity:clear'),
  gameOptimizationStatus: () => ipcRenderer.invoke('optimization:game-status'),
  restoreGameOptimization: () => ipcRenderer.invoke('optimization:game-restore'),
  powerOptimizationStatus: () => ipcRenderer.invoke('optimization:power-status'),
  restorePowerOptimization: () => ipcRenderer.invoke('optimization:power-restore'),
  optimizationStatus: () => ipcRenderer.invoke('optimization:status'),
  optimize: (input, version) => ipcRenderer.invoke('optimization:apply', input, version),
  restoreOptimization: () => ipcRenderer.invoke('optimization:restore'),
  chooseOtherGame: () => ipcRenderer.invoke('optimization:custom-game'),
  chooseGame: game => ipcRenderer.invoke('optimization:game', game),
  installedApps: () => ipcRenderer.invoke('apps:installed'),
  driverCatalog: version => ipcRenderer.invoke('drivers:catalog',version),
  openDriver: (id,version) => ipcRenderer.invoke('drivers:open',id,version),
  system: () => ipcRenderer.invoke('system'),
  action: (id, version) => ipcRenderer.invoke('action', id, version),
  download: id => ipcRenderer.invoke('download', id),
  open: id => ipcRenderer.invoke('open', id),
  onProgress: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  }
});
