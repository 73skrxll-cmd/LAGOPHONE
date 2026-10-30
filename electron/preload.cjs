const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lagophone', {
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
