let appVersion = '1.0.88';
try {
    appVersion = require('../package.json').version || '1.0.88';
} catch (e) { }

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    appVersion: appVersion,
    setFullScreen: (enabled) => ipcRenderer.send('set-fullscreen', enabled),
    isFullScreen: () => ipcRenderer.invoke('is-fullscreen'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    showNotification: (title, message) => ipcRenderer.send('show-notification', { title, message }),
    startUpdateDownload: (downloadUrl) => ipcRenderer.send('start-update-download', downloadUrl),
    pauseUpdateDownload: () => ipcRenderer.send('pause-update-download'),
    resumeUpdateDownload: (downloadUrl) => ipcRenderer.send('resume-update-download', downloadUrl),
    onUpdateProgress: (callback) => {
        ipcRenderer.removeAllListeners('update-download-progress');
        ipcRenderer.on('update-download-progress', (event, data) => callback(data));
    },
    onUpdateComplete: (callback) => {
        ipcRenderer.removeAllListeners('update-download-complete');
        ipcRenderer.on('update-download-complete', (event, data) => callback(data));
    },
    onUpdateError: (callback) => {
        ipcRenderer.removeAllListeners('update-download-error');
        ipcRenderer.on('update-download-error', (event, data) => callback(data));
    }
});
