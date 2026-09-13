const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    openExternal: (url) => ipcRenderer.send('open-external', url),
    showNotification: (title, message) => ipcRenderer.send('show-notification', { title, message })
});
