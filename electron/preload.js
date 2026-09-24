// هذا السطر حُذف سهواً في v1.0.89 فانهار ملف التمهيد كله عند كل إقلاع، واختفى
// window.electronAPI تماماً: لا ملء شاشة، ولا فتح روابط خارجية، ولا تنزيل تحديث،
// ولا حتى معرفة أننا داخل برنامج الكمبيوتر (platform-electron).
const { contextBridge, ipcRenderer } = require('electron');

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
    // زرّا النافذة في الصفحة (ملء الشاشة يخفي شريط عنوان ويندوز)
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    getSystemLocale: () => ipcRenderer.invoke('system-locale'),
    showNotification: (title, message) => ipcRenderer.send('show-notification', { title, message }),
    startUpdateDownload: (downloadUrl) => ipcRenderer.send('start-update-download', downloadUrl),
    pauseUpdateDownload: () => ipcRenderer.send('pause-update-download'),
    resumeUpdateDownload: (downloadUrl) => ipcRenderer.send('resume-update-download', downloadUrl),
    cancelUpdateDownload: () => ipcRenderer.send('cancel-update-download'),
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
    },
    // تنزيل الأفلام والحلقات (electron/downloads.js) — يجب أن تطابق ipcMain.handle هناك
    downloads: {
        list: () => ipcRenderer.invoke('downloads-list'),
        enqueue: (req) => ipcRenderer.invoke('downloads-enqueue', req),
        pause: (id) => ipcRenderer.invoke('downloads-pause', id),
        resume: (id) => ipcRenderer.invoke('downloads-resume', id),
        remove: (id) => ipcRenderer.invoke('downloads-remove', id),
        setPlaybackActive: (active) => ipcRenderer.invoke('downloads-playback', !!active),
        chooseFolder: () => ipcRenderer.invoke('downloads-choose-folder'),
        openFolder: () => ipcRenderer.invoke('downloads-open-folder'),
        showFile: (id) => ipcRenderer.invoke('downloads-show-file', id),
        onChanged: (callback) => {
            ipcRenderer.removeAllListeners('downloads-changed');
            ipcRenderer.on('downloads-changed', (event, data) => callback(data));
        }
    }
});

/**
 * إيقاظ الصفحة عند العودة للبرنامج.
 *
 * حين تكون الواجهة ساكنة (بلا فيديو) يتوقف مُركِّب كروميوم عن إنتاج الإطارات، فتعود النافذة
 * أحياناً بصورة قديمة لا تستجيب حتى يصل حدث إدخال — ولهذا كانت نافذة قوائم التشغيل تبدو
 * سوداء حتى الضغط على سهم. هنا نجبر إطاراً جديداً بتغيير شفافية غير مرئي.
 */
ipcRenderer.on('mizo-wake', function () {
    try {
        var b = document.body;
        if (!b) return;
        b.style.opacity = '0.999';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { b.style.opacity = ''; });
        });
    } catch (e) { }
});
