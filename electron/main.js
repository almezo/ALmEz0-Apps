const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

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
            title: localizedAppName,
            icon: path.join(__dirname, '../photo/logo.ico'),
            autoHideMenuBar: true,
            backgroundColor: '#0a0d12',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                spellcheck: false,
                sandbox: false,
                webSecurity: false,
                allowRunningInsecureContent: true
            }
        });

        // Hide default top menu for clean native look
        Menu.setApplicationMenu(null);

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
                new ElectronNotification({
                    title: data.title,
                    body: data.message || '',
                    icon: path.join(__dirname, '../photo/logo.ico')
                }).show();
            }
        } catch (e) { }
    });

    // Helper for downloading files following redirects (e.g. GitHub Releases)
    function downloadFileWithRedirects(url, destPath, onProgress, onComplete, onError, redirectCount = 0) {
        if (redirectCount > 8) {
            return onError(new Error('Too many redirects'));
        }
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'ALmEz0-App' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFileWithRedirects(res.headers.location, destPath, onProgress, onComplete, onError, redirectCount + 1);
            }
            if (res.statusCode !== 200) {
                return onError(new Error(`HTTP ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            const fileStream = fs.createWriteStream(destPath);

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : -1;
                onProgress({ percent, downloadedBytes, totalBytes });
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close(() => onComplete(destPath));
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {});
                onError(err);
            });
        });

        req.on('error', onError);
    }

    // In-app updater: download EXE and run installer
    ipcMain.on('start-update-download', (event, downloadUrl) => {
        const tempExe = path.join(app.getPath('temp'), 'ALmEz0-Update-Setup.exe');
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
