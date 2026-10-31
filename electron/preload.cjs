const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lagophone', {
  optimizationStatus: () => ipcRenderer.invoke('optimization:status'),
  optimize: (input, version) => ipcRenderer.invoke('optimization:apply', input, version),
  restoreOptimization: () => ipcRenderer.invoke('optimization:restore'),
  chooseGame: game => ipcRenderer.invoke('optimization:game', game),
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
