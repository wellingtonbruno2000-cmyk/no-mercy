// Ponte segura entre a tela inicial do app e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nomercy', {
  desktop: true,
  getConfig: () => ipcRenderer.invoke('nm:getConfig'),
  setOnlineUrl: (url) => ipcRenderer.invoke('nm:setOnlineUrl', url),
  playOnline: () => ipcRenderer.invoke('nm:playOnline'),
  playOffline: () => ipcRenderer.invoke('nm:playOffline'),
});
