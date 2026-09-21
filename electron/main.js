const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// Hardware acceleration (smooth 60fps GPU video rendering without excessive CPU/GPU usage)
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,SmoothScrolling');
// enable-hardware-overlays مُزال عمداً: مع بعض كروت العرض في ويندوز يُبقي النافذة
// على سطح قديم لا يُعاد رسمه عند العودة للبرنامج، فتبدو الصفحة متجمّدة. ولا يؤثر
// حذفه على فك ترميز الفيديو، فتسريع الترميز والرسم أدناه باقٍ كما هو.
app.commandLine.appendSwitch('enable-accelerated-video-decode');

// ويندوز يربط إشعارات البرنامج باختصاره المثبَّت عبر هذا المعرّف (appId في package.json).
// بدونه لا تظهر إشعارات المدير في مركز إشعارات ويندوز 10/11 لبرنامج مُثبَّت.
if (process.platform === 'win32') {
    app.setAppUserModelId('com.almezo.servers');
}

// Ensure single instance of the application
const gotTheLock = app.requestSingleInstanceLock();
let mainWindow = null;

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // تحديد لغة نظام المستخدم وتعيين اسم البرنامج (عربي -> "الميزو" / غير ذلك -> "ALmEz0")
    const userLocale = (app.getLocale() || '').toLowerCase();
    const isArabicSystem = userLocale.startsWith('ar');
    const localizedAppName = isArabicSystem ? 'الميزو' : 'ALmEz0';
    app.setName(localizedAppName);

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1280,
            height: 820,
            minWidth: 420,
            minHeight: 640,
            show: false, // نُظهر النافذة فقط بعد تكبيرها لتفادي وميض نافذة صغيرة قبل التكبير الكامل
            title: localizedAppName,
            icon: path.join(__dirname, '../photo/logo.ico'),
            autoHideMenuBar: true,
            backgroundColor: '#0a0d12',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                spellcheck: false,
                // بلا خنق للخلفية: عند الانتقال لبرنامج آخر كان كروميوم يجمّد المؤقتات
                // والرسم، فيعود البرنامج أحياناً بشاشة متجمّدة لا تستجيب حتى إعادة تشغيله.
                backgroundThrottling: false,
                sandbox: false,
                webSecurity: false,
                allowRunningInsecureContent: true
            }
        });

        // Allow microphone permissions for AI voice assistant
        mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
            if (permission === 'media' || permission === 'microphone' || permission === 'audio-capture') {
                return callback(true);
            }
            callback(false);
        });
        mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
            if (permission === 'media' || permission === 'microphone' || permission === 'audio-capture') return true;
            return false;
        });

        // Hide default top menu for clean native look
        Menu.setApplicationMenu(null);

        // فتح البرنامج دائماً بوضعية النافذة المكبّرة بالكامل (Maximized) بدل نافذة صغيرة في المنتصف،
        // مع إظهار النافذة فقط بعد التكبير لتفادي أي وميض بصري لحجمها الأصلي الصغير أولاً
        mainWindow.once('ready-to-show', () => {
            try {
                mainWindow.maximize();
            } catch (e) { }
            mainWindow.show();
        });

        // Load the local index.html file
        mainWindow.loadFile(path.join(__dirname, '../index.html'));

        // Handle window title update if needed
        mainWindow.on('page-title-updated', (e) => {
            e.preventDefault();
            mainWindow.setTitle(localizedAppName);
        });

        // مزامنة تسمية اختصار سطح المكتب على الويندوز وفق لغة النظام
        if (process.platform === 'win32') {
            try {
                const desktopPath = app.getPath('desktop');
                const targetExe = process.execPath;
                if (isArabicSystem) {
                    const arLnk = path.join(desktopPath, 'الميزو.lnk');
                    const enLnk = path.join(desktopPath, 'ALmEz0.lnk');
                    if (fs.existsSync(enLnk) && !fs.existsSync(arLnk)) {
                        try { fs.renameSync(enLnk, arLnk); } catch (e) { }
                    }
                    if (!fs.existsSync(arLnk) && typeof shell.writeShortcutLink === 'function') {
                        shell.writeShortcutLink(arLnk, 'create', {
                            target: targetExe,
                            description: 'سيرفرات الميزو ومشغل البث',
                            icon: targetExe,
                            iconIndex: 0
                        });
                    }
                }
            } catch (err) {
                console.warn('Windows shortcut sync notice:', err);
            }
        }

        // Intercept external links and open in default system browser
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (
                url.startsWith('http://') ||
                url.startsWith('https://') ||
                url.startsWith('mailto:') ||
                url.startsWith('tel:') ||
                url.startsWith('whatsapp:')
            ) {
                // If it is an external site (WhatsApp, Facebook, external player, etc.), open externally
                const isInternalHost = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('almezo.store');
                if (!isInternalHost) {
                    shell.openExternal(url);
                    return { action: 'deny' };
                }
            }
            return { action: 'allow' };
        });

        mainWindow.webContents.on('will-navigate', (event, url) => {
            const isLocal = url.startsWith('file://') || url.includes('localhost') || url.includes('almezo.store');
            if (!isLocal) {
                event.preventDefault();
                shell.openExternal(url);
            }
        });

        // Auto-fullscreen when ALmEz0 Player (player.html) is loaded, and exit fullscreen when returning to index.html
        mainWindow.webContents.on('did-finish-load', () => {
            try {
                const currentURL = (mainWindow.webContents.getURL() || '').toLowerCase();
                if (currentURL.includes('player.html')) {
                    mainWindow.setFullScreen(true);
                } else if (currentURL.includes('index.html')) {
                    mainWindow.setFullScreen(false);
                }
            } catch (e) { }
        });

        /**
         * عند العودة للبرنامج من برنامج آخر: نجبر إعادة رسم وتركيز لوحة المحتوى.
         * تسريع العتاد وطبقات العرض في ويندوز قد يترك النافذة بصورة قديمة لا تستجيب،
         * وكان يظهر ذلك خصوصاً في شاشة كتابة كود السيرفر.
         */
        const wakeUpWindow = () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            try {
                mainWindow.webContents.invalidate();
                mainWindow.webContents.focus();
                // نبضة للصفحة نفسها: invalidate وحده لا يكفي حين يتوقف المُركِّب
                mainWindow.webContents.send('mizo-wake');

                /*
                 * نبضة على مستوى النافذة: تغيير شفافية غير مرئي يجبر ويندوز على إعادة
                 * تركيب النافذة كلها. الدليل على أن العطل في التركيب لا في الصفحة أن
                 * ضغطة Escape كانت تُعيدها للعمل فوراً — أي أن الصفحة حيّة وتستجيب.
                 * لا يغيّر الحجم ولا الوضع، فيصلح مع النافذة المكبّرة وملء الشاشة أيضاً.
                 */
                mainWindow.setOpacity(0.996);
                setTimeout(() => {
                    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1);
                }, 16);
            } catch (e) { }
        };
        mainWindow.on('focus', wakeUpWindow);
        mainWindow.on('restore', wakeUpWindow);
        mainWindow.on('show', wakeUpWindow);

        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    }

    // IPC listener for toggling fullscreen on Windows (removes top titlebar and covers taskbar)
    ipcMain.on('set-fullscreen', (event, enabled) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setFullScreen(!!enabled);
        }
    });

    ipcMain.handle('is-fullscreen', () => {
        return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false;
    });

    // IPC listener for opening external URLs from renderer
    ipcMain.on('open-external', (event, url) => {
        if (url) {
            shell.openExternal(url);
        }
    });

    // IPC listener for native desktop notifications
    ipcMain.on('show-notification', (event, data) => {
        try {
            const { Notification: ElectronNotification } = require('electron');
            if (ElectronNotification.isSupported() && data && data.title) {
                const n = new ElectronNotification({
                    title: data.title,
                    body: data.message || '',
                    icon: path.join(__dirname, '../photo/logo.ico')
                });
                // الضغط على الإشعار يُظهر البرنامج بدل ألا يفعل شيئاً
                n.on('click', () => {
                    if (!mainWindow || mainWindow.isDestroyed()) return;
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                });
                n.show();
            }
        } catch (e) { }
    });

    // Helper for downloading files following redirects with Range resume support
    let currentUpdateReq = null;
    let currentUpdateStream = null;
    let isUpdatePaused = false;
    let updateDownloadedBytes = 0;
    let updateTotalBytes = 0;
    let currentUpdateUrl = '';

    function downloadFileWithRedirects(url, destPath, onProgress, onComplete, onError, redirectCount = 0) {
        if (redirectCount > 8) {
            return onError(new Error('Too many redirects'));
        }
        currentUpdateUrl = url;
        const client = url.startsWith('https') ? https : http;
        const headers = { 'User-Agent': 'ALmEz0-App' };
        if (updateDownloadedBytes > 0) {
            headers['Range'] = `bytes=${updateDownloadedBytes}-`;
        }

        currentUpdateReq = client.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFileWithRedirects(res.headers.location, destPath, onProgress, onComplete, onError, redirectCount + 1);
            }
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                return onError(new Error(`HTTP ${res.statusCode}`));
            }

            if (res.statusCode === 200) {
                updateTotalBytes = parseInt(res.headers['content-length'] || '0', 10);
            } else if (res.statusCode === 206) {
                const contentRange = res.headers['content-range'];
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)/);
                    if (match) updateTotalBytes = parseInt(match[1], 10);
                }
            }

            currentUpdateStream = fs.createWriteStream(destPath, { flags: updateDownloadedBytes > 0 ? 'a' : 'w' });

            res.on('data', (chunk) => {
                if (isUpdatePaused) return;
                updateDownloadedBytes += chunk.length;
                const percent = updateTotalBytes > 0 ? Math.min(100, Math.round((updateDownloadedBytes / updateTotalBytes) * 100)) : -1;
                onProgress({ percent, downloadedBytes: updateDownloadedBytes, totalBytes: updateTotalBytes });
            });

            res.pipe(currentUpdateStream);

            currentUpdateStream.on('finish', () => {
                if (isUpdatePaused) return;
                currentUpdateStream.close(() => onComplete(destPath));
            });

            currentUpdateStream.on('error', (err) => {
                if (!isUpdatePaused) {
                    try { fs.unlinkSync(destPath); } catch (e) {}
                    onError(err);
                }
            });
        });

        currentUpdateReq.on('error', (err) => {
            if (!isUpdatePaused) onError(err);
        });
    }

    // In-app updater: download EXE and run installer
    ipcMain.on('start-update-download', (event, downloadUrl) => {
        isUpdatePaused = false;
        updateDownloadedBytes = 0;
        updateTotalBytes = 0;
        const tempExe = path.join(app.getPath('temp'), 'ALmEz0-Update-Setup.exe');
        try { if (fs.existsSync(tempExe)) fs.unlinkSync(tempExe); } catch (e) {}
        downloadFileWithRedirects(
            downloadUrl,
            tempExe,
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-progress', progress);
                }
            },
            (filePath) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-complete', { filePath });
                }
                setTimeout(() => {
                    try {
                        const child = spawn(filePath, [], {
                            detached: true,
                            stdio: 'ignore'
                        });
                        child.unref();
                        app.quit();
                    } catch (e) {
                        console.error('Failed to spawn update installer:', e);
                    }
                }, 800);
            },
            (err) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-error', { error: err ? err.message : 'Download failed' });
                }
            }
        );
    });

    ipcMain.on('pause-update-download', () => {
        isUpdatePaused = true;
        if (currentUpdateReq) {
            try { currentUpdateReq.destroy(); } catch (e) {}
            currentUpdateReq = null;
        }
        if (currentUpdateStream) {
            try { currentUpdateStream.end(); } catch (e) {}
            currentUpdateStream = null;
        }
    });

    ipcMain.on('resume-update-download', (event, downloadUrl) => {
        if (!isUpdatePaused) return;
        isUpdatePaused = false;
        const tempExe = path.join(app.getPath('temp'), 'ALmEz0-Update-Setup.exe');
        downloadFileWithRedirects(
            downloadUrl || currentUpdateUrl,
            tempExe,
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-progress', progress);
                }
            },
            (filePath) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-complete', { filePath });
                }
                setTimeout(() => {
                    try {
                        const child = spawn(filePath, [], {
                            detached: true,
                            stdio: 'ignore'
                        });
                        child.unref();
                        app.quit();
                    } catch (e) {
                        console.error('Failed to spawn update installer:', e);
                    }
                }, 800);
            },
            (err) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-error', { error: err ? err.message : 'Download failed' });
                }
            }
        );
    });

    app.whenReady().then(() => {
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
