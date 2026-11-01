const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lagophone', {
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
