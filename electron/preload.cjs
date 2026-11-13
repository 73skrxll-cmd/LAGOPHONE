const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lagophone', {
  windowChrome: process.platform==='win32',
  blockingStatus:()=>ipcRenderer.invoke('blocking:status'),
  blockingAction:action=>ipcRenderer.invoke('blocking:action',action),
  blockingSettings:value=>ipcRenderer.invoke('blocking:settings',value),
  blockingReport:()=>ipcRenderer.invoke('blocking:report'),
  fpsStatus:()=>ipcRenderer.invoke('fps:status'),
  setFpsEnabled:enabled=>ipcRenderer.invoke('fps:enabled',enabled),
  addFpsGame:()=>ipcRenderer.invoke('fps:add-game'),
  setWindowTheme: theme => ipcRenderer.invoke('window:theme',theme),
  respondAppDialog: (id,response) => ipcRenderer.invoke('app-dialog:respond',id,response),
  onAppDialog: callback => {
    const show=(_,value)=>callback(value),close=(_,id)=>callback({closed:id});
    ipcRenderer.on('app-dialog:show',show);
    ipcRenderer.on('app-dialog:closed',close);
    void ipcRenderer.invoke('app-dialog:ready',true).catch(()=>{});
    return () => {
      ipcRenderer.removeListener('app-dialog:show',show);
      ipcRenderer.removeListener('app-dialog:closed',close);
      void ipcRenderer.invoke('app-dialog:ready',false).catch(()=>{});
    };
  },
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
  securityStatus: () => ipcRenderer.invoke('security:status'),
  openRecoverySettings: () => ipcRenderer.invoke('security:recovery'),
  action: (id, version) => ipcRenderer.invoke('action', id, version),
  download: id => ipcRenderer.invoke('download', id),
  open: id => ipcRenderer.invoke('open', id),
  onProgress: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  }
});
