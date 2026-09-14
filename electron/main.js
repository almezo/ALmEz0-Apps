const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');

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

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1280,
            height: 820,
            minWidth: 420,
            minHeight: 640,
            title: 'ALmEz0',
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
        });

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

        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    }

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
