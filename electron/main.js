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

    // تنزيل الأفلام والحلقات للمشاهدة بدون إنترنت (electron/downloads.js)
    require('./downloads').init(ipcMain, () => mainWindow);

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

    // =====================================================================
    // تنزيل تحديث البرنامج وتثبيته
    // ---------------------------------------------------------------------
    // - لا يُشغَّل المثبّت إلا إذا اكتمل الملف بحجمه الكامل. كان انقطاع النت في المنتصف يُعدّ
    //   اكتمالاً، فيُشغَّل مثبّت ناقص ويُغلق البرنامج ويبقى العميل بلا برنامج يعمل.
    // - الاستئناف من حجم الملف الفعلي على القرص لا من عدّاد في الذاكرة: بعد الإيقاف قد تُكتب
    //   دفعات لم يحسبها العدّاد، فيتكرر جزء من الملف عند الاستئناف ويتلف المثبّت.
    // - مهلة 30 ثانية لأي اتصال متجمّد بدل التعليق للأبد، وإلغاء التنزيل من الصندوق.
    // =====================================================================
    const UPDATE_FILE = () => path.join(app.getPath('temp'), 'ALmEz0-Update-Setup.exe');
    const UPDATE_PART = () => UPDATE_FILE() + '.part';
    let updateReq = null;
    let updateUrl = '';
    let updateTotal = 0;
    let updateState = 'idle'; // idle | running | paused | done

    function sendUpdate(channel, data) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data || {});
    }

    function partSize() {
        try { return fs.statSync(UPDATE_PART()).size; } catch (e) { return 0; }
    }

    function abortUpdateRequest() {
        if (updateReq) {
            try { updateReq.destroy(); } catch (e) { }
            updateReq = null;
        }
    }

    function requestUpdate(url, from, redirects) {
        if (redirects > 8) return failUpdate('Too many redirects');
        const client = url.startsWith('https') ? https : http;
        const headers = { 'User-Agent': 'ALmEz0-App', 'Accept-Encoding': 'identity' };
        if (from > 0) headers.Range = `bytes=${from}-`;
        const req = client.get(url, { headers }, (res) => {
            if (req !== updateReq) { res.resume(); return; } // طلب قديم أُلغي
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return requestUpdate(new URL(res.headers.location, url).href, from, redirects + 1);
            }
            let have = from;
            let append = false;
            if (res.statusCode === 206 && from > 0) {
                const m = /\/(\d+)\s*$/.exec(res.headers['content-range'] || '');
                const total = m ? parseInt(m[1], 10) : from + parseInt(res.headers['content-length'] || '0', 10);
                // الملف الجزئي من إصدار آخر (الحجم الكلي تغيّر): نبدأ من الصفر
                if (updateTotal > 0 && total !== updateTotal) {
                    res.resume();
                    try { fs.unlinkSync(UPDATE_PART()); } catch (e) { }
                    updateTotal = 0;
                    return requestUpdate(updateUrl, 0, 0);
                }
                updateTotal = total;
                append = true;
            } else if (res.statusCode === 200) {
                updateTotal = parseInt(res.headers['content-length'] || '0', 10);
                have = 0;
            } else {
                res.resume();
                return failUpdate(`HTTP ${res.statusCode}`);
            }

            const out = fs.createWriteStream(UPDATE_PART(), { flags: append ? 'a' : 'w' });
            let lastSent = 0;
            res.on('data', (chunk) => {
                have += chunk.length;
                const now = Date.now();
                if (now - lastSent > 250) {
                    lastSent = now;
                    sendUpdate('update-download-progress', {
                        percent: updateTotal > 0 ? Math.min(100, Math.floor(have * 100 / updateTotal)) : -1,
                        downloadedBytes: have, totalBytes: updateTotal
                    });
                }
            });
            res.pipe(out);
            let ended = false;
            const finish = (err) => {
                if (ended) return;
                ended = true;
                out.end(() => {
                    if (req !== updateReq || updateState !== 'running') return; // أُوقف أو أُلغي
                    updateReq = null;
                    const size = partSize();
                    if (err || (updateTotal > 0 && size < updateTotal)) {
                        return failUpdate(err ? err.message : 'incomplete');
                    }
                    completeUpdate();
                });
            };
            res.on('end', () => finish(null));
            res.on('aborted', () => finish(new Error('aborted')));
            res.on('error', finish);
            out.on('error', finish);
        });
        req.setTimeout(30000, () => req.destroy(new Error('timeout')));
        req.on('error', (err) => {
            if (req !== updateReq || updateState !== 'running') return;
            updateReq = null;
            failUpdate(err.message);
        });
        updateReq = req;
    }

    function failUpdate(message) {
        updateReq = null;
        updateState = 'idle'; // الملف الجزئي يبقى: إعادة المحاولة تكمل من حيث توقف
        sendUpdate('update-download-error', { error: message || 'Download failed', partial: partSize() });
    }

    function completeUpdate() {
        updateState = 'done';
        try {
            if (fs.existsSync(UPDATE_FILE())) fs.unlinkSync(UPDATE_FILE());
            fs.renameSync(UPDATE_PART(), UPDATE_FILE());
        } catch (e) {
            return failUpdate('save failed');
        }
        sendUpdate('update-download-progress', { percent: 100, downloadedBytes: updateTotal, totalBytes: updateTotal });
        sendUpdate('update-download-complete', { filePath: UPDATE_FILE() });
        setTimeout(() => {
            try {
                const child = spawn(UPDATE_FILE(), [], { detached: true, stdio: 'ignore' });
                // يُغلق البرنامج فقط بعد أن يبدأ المثبّت فعلاً، لا إن منعه مضاد فيروسات أو تلف الملف
                child.once('spawn', () => setTimeout(() => app.quit(), 600));
                child.on('error', (e) => { updateState = 'idle'; sendUpdate('update-download-error', { error: 'install: ' + e.message, install: true }); });
                child.unref();
            } catch (e) {
                updateState = 'idle';
                sendUpdate('update-download-error', { error: 'install: ' + e.message, install: true });
            }
        }, 800);
    }

    // المثبّت يُشغَّل تلقائياً بعد التنزيل، فيُقبل فقط رابط إصدارات الميزو في GitHub
    function isTrustedUpdateUrl(u) {
        try {
            const x = new URL(String(u));
            return x.protocol === 'https:' && x.hostname.toLowerCase() === 'github.com' &&
                x.pathname.toLowerCase().startsWith('/almezo/almez0-downloads/releases/') && !x.pathname.includes('..');
        } catch (e) {
            return false;
        }
    }

    function runUpdate(url, fresh) {
        if (url && !isTrustedUpdateUrl(url)) {
            sendUpdate('update-download-error', { error: 'Untrusted update URL' });
            return;
        }
        abortUpdateRequest();
        updateUrl = url || updateUrl;
        if (!updateUrl) return;
        if (fresh) {
            try { fs.unlinkSync(UPDATE_PART()); } catch (e) { }
            updateTotal = 0;
        }
        updateState = 'running';
        requestUpdate(updateUrl, partSize(), 0);
    }

    // بدء تنزيل جديد (من زر "تنزيل وتثبيت التحديث الآن")
    ipcMain.on('start-update-download', (event, downloadUrl) => runUpdate(downloadUrl, true));

    // الإيقاف يغلق الاتصال، والاستئناف (أو إعادة المحاولة) يكمل من حجم الملف على القرص
    ipcMain.on('pause-update-download', () => {
        if (updateState !== 'running') return;
        updateState = 'paused';
        abortUpdateRequest();
    });

    ipcMain.on('resume-update-download', (event, downloadUrl) => runUpdate(downloadUrl, false));

    ipcMain.on('cancel-update-download', () => {
        updateState = 'idle';
        abortUpdateRequest();
        setTimeout(() => { try { fs.unlinkSync(UPDATE_PART()); } catch (e) { } }, 300);
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
