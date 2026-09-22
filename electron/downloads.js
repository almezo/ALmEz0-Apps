/**
 * تنزيل الأفلام والحلقات في برنامج الكمبيوتر للمشاهدة بدون إنترنت.
 *
 * نفس قواعد أندرويد (nat/Downloads.java) لأن لوحات Xtream تحظر الـIP عند كثرة الاتصالات:
 * - تنزيل واحد فقط في كل وقت، والباقي في طابور.
 * - اتصال واحد لكل ملف، بلا تقسيم لأجزاء متوازية.
 * - أثناء البث من السيرفر يُقطع التنزيل فوراً قبل أن يفتح المشغل اتصاله، ويكمل بعد إغلاقه.
 * الاستئناف بطلب Range من حجم الملف الجزئي (.part). معلومات كل ملف تُحفظ في downloads.json
 * مع نسخة محلية من الصورة، فصفحة التنزيلات تعمل بلا إنترنت.
 */
const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL, pathToFileURL } = require('url');

const QUEUED = 'queued', RUNNING = 'running', PAUSED = 'paused', DONE = 'done', FAILED = 'failed';
const MAX_AUTO_RETRIES = 3;
const SPACE_MARGIN = 50 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ALmEz0/Desktop';

let items = [];
let settings = { dir: '' };
let playbackActive = false;
let current = null;       // العنصر الذي يتنزل الآن
let currentReq = null;    // طلب HTTP الجاري، يُقطع عند الإيقاف أو بدء المشاهدة
let working = false;
let getWindow = () => null;
let lastNotify = 0, notifyTimer = null;

function stateFile() { return path.join(app.getPath('userData'), 'downloads.json'); }

function defaultDir() {
    try { return path.join(app.getPath('videos'), 'ALmEz0'); } catch (e) { return path.join(app.getPath('downloads'), 'ALmEz0'); }
}

function downloadDir() {
    const d = settings.dir || defaultDir();
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) { }
    return d;
}

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
        settings = Object.assign(settings, data.settings || {});
        items = (data.items || []).filter(i => {
            if (i.state === RUNNING) i.state = QUEUED; // كان يعمل عند إغلاق البرنامج: يكمل من ملفه الجزئي
            if (i.state !== DONE) {
                try { i.done = fs.statSync(i.file + '.part').size; } catch (e) { i.done = 0; }
            }
            return i.state !== DONE || fs.existsSync(i.file); // حُذف من خارج البرنامج
        });
    } catch (e) { items = []; }
}

let saveTimer = null;
function save(now) {
    const write = () => {
        saveTimer = null;
        try {
            fs.writeFileSync(stateFile(), JSON.stringify({
                settings,
                items: items.map(i => Object.assign({}, i, { speed: 0 }))
            }));
        } catch (e) { }
    };
    if (now) { if (saveTimer) clearTimeout(saveTimer); write(); return; }
    if (!saveTimer) saveTimer = setTimeout(write, 3000);
}

function publicItem(i) {
    return Object.assign({}, i, {
        fileUrl: i.state === DONE ? pathToFileURL(i.file).href : '',
        posterUrl: i.posterFile && fs.existsSync(i.posterFile) ? pathToFileURL(i.posterFile).href : ''
    });
}

function snapshot() {
    let free = 0;
    try { free = fs.statfsSync(downloadDir()).bavail * fs.statfsSync(downloadDir()).bsize; } catch (e) { }
    return {
        items: items.map(publicItem),
        dir: downloadDir(),
        free,
        playbackActive,
        currentId: current ? current.id : null
    };
}

/** إشعار الواجهة: التغييرات الكبيرة فوراً، والتقدّم مرتين في الثانية على الأكثر. */
function notify(immediate) {
    const send = () => {
        notifyTimer = null;
        lastNotify = Date.now();
        const w = getWindow();
        if (w && !w.isDestroyed()) {
            w.webContents.send('downloads-changed', snapshot());
            const active = items.find(i => i.state === RUNNING);
            w.setProgressBar(active && active.total > 0 ? active.done / active.total : -1);
        }
    };
    if (immediate) { if (notifyTimer) clearTimeout(notifyTimer); send(); return; }
    if (notifyTimer) return;
    notifyTimer = setTimeout(send, Math.max(0, 500 - (Date.now() - lastNotify)));
}

function safeName(s) {
    let n = String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (n.length > 80) n = n.slice(0, 80).trim();
    return n || 'ALmEz0';
}

function uniqueFile(dir, title, ext) {
    const e = String(ext || 'mp4').replace(/[^A-Za-z0-9]/g, '') || 'mp4';
    const base = safeName(title);
    let f = path.join(dir, base + '.' + e), n = 2;
    while (fs.existsSync(f) || fs.existsSync(f + '.part')) f = path.join(dir, `${base} (${n++}).${e}`);
    return f;
}

// ------------------------------------------------------------------ الأوامر

function enqueue(req) {
    let ex = items.find(i => i.id === req.id);
    if (ex) {
        if (ex.state === FAILED || ex.state === PAUSED) {
            ex.state = QUEUED; ex.error = ''; ex.retries = 0; ex.url = req.url;
        }
    } else {
        const dir = downloadDir();
        ex = {
            id: req.id, kind: req.kind || 'movie', title: req.title || 'ALmEz0', subtitle: req.subtitle || '',
            poster: req.poster || '', url: req.url, ext: req.ext || 'mp4', contentKey: req.contentKey || req.id,
            file: uniqueFile(dir, req.title, req.ext),
            posterFile: path.join(dir, '.posters', safeName(req.id).replace(/\s/g, '_') + '.jpg'),
            state: QUEUED, error: '', total: 0, done: 0, speed: 0, retries: 0, createdAt: Date.now()
        };
        items.push(ex);
    }
    save(true);
    notify(true);
    work();
    return publicItem(ex);
}

function pause(id) {
    const i = items.find(x => x.id === id);
    if (!i || (i.state !== QUEUED && i.state !== RUNNING)) return;
    i.state = PAUSED; i.speed = 0;
    if (current === i && currentReq) currentReq.destroy();
    save(true); notify(true);
}

function resume(id) {
    const i = items.find(x => x.id === id);
    if (!i || (i.state !== PAUSED && i.state !== FAILED)) return;
    i.state = QUEUED; i.error = ''; i.retries = 0;
    save(true); notify(true); work();
}

function remove(id) {
    const i = items.find(x => x.id === id);
    if (!i) return;
    items = items.filter(x => x !== i);
    if (current === i && currentReq) currentReq.destroy();
    setTimeout(() => {
        for (const f of [i.file + '.part', i.file, i.posterFile]) { try { fs.unlinkSync(f); } catch (e) { } }
    }, 400);
    save(true); notify(true);
}

/**
 * المشغل يبث من السيرفر: يُقطع اتصال التنزيل فوراً قبل أن يفتح المشغل اتصاله، فلا يلتقي
 * اتصالان باللوحة. يعيد وعداً يتحقق بعد إغلاق الاتصال (مع مهلة قصيرة للسيرفر).
 */
function setPlaybackActive(active) {
    if (playbackActive === !!active) return Promise.resolve();
    playbackActive = !!active;
    notify(true);
    if (!active) { work(); return Promise.resolve(); }
    if (current && currentReq) {
        current.state = QUEUED; // يكمل بعد المشاهدة بلا عدّ محاولة
        currentReq.destroy();
        return new Promise(r => setTimeout(r, 300));
    }
    return Promise.resolve();
}

async function chooseFolder() {
    const w = getWindow();
    const res = await dialog.showOpenDialog(w, {
        title: 'اختر مكان حفظ التنزيلات',
        defaultPath: downloadDir(),
        properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return snapshot();
    settings.dir = res.filePaths[0];
    save(true); notify(true);
    return snapshot();
}

// ------------------------------------------------------------------ العامل

function openRequest(url, from, hop = 0) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(url); } catch (e) { reject(new Error('bad url')); return; }
        const lib = u.protocol === 'https:' ? https : http;
        const headers = { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity' };
        if (from > 0) headers.Range = `bytes=${from}-`;
        const req = lib.get(u, { headers, timeout: 30000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hop < 5) {
                res.resume();
                openRequest(new URL(res.headers.location, u).href, from, hop + 1).then(resolve, reject);
                return;
            }
            resolve({ req, res });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        currentReq = req;
    });
}

function friendlyError(err) {
    if (err && err.code === 'SPACE') return 'المساحة غير كافية على الجهاز';
    if (err && err.httpCode) {
        const c = err.httpCode;
        if (c === 401 || c === 403) return `السيرفر رفض التنزيل (${c}) — تأكد من صلاحية الاشتراك`;
        if (c === 404) return 'الملف غير موجود على السيرفر';
        return `خطأ من السيرفر (${c})`;
    }
    return 'تعذّر الاتصال بالسيرفر';
}

async function downloadOne(i) {
    const part = i.file + '.part';
    fs.mkdirSync(path.dirname(i.file), { recursive: true });
    let have = 0;
    try { have = fs.statSync(part).size; } catch (e) { }

    const { req, res } = await openRequest(i.url, have);
    let total, append;
    if (res.statusCode === 416 && have > 0 && i.total > 0 && have >= i.total) {
        res.resume();
        return finish(i);
    } else if (res.statusCode === 206 && have > 0) {
        const m = /\/(\d+)\s*$/.exec(res.headers['content-range'] || '');
        total = m ? parseInt(m[1], 10) : have + parseInt(res.headers['content-length'] || '0', 10);
        append = true;
    } else if (res.statusCode === 200) {
        total = parseInt(res.headers['content-length'] || '0', 10); // السيرفر تجاهل Range: من الصفر
        have = 0; append = false;
    } else {
        res.resume();
        const e = new Error('http'); e.httpCode = res.statusCode; throw e;
    }

    if (total > 0) {
        try {
            const st = fs.statfsSync(path.dirname(i.file));
            if (st.bavail * st.bsize < (total - have) + SPACE_MARGIN) {
                req.destroy();
                const e = new Error('space'); e.code = 'SPACE'; throw e;
            }
        } catch (e) { if (e.code === 'SPACE') throw e; }
    }

    i.total = total; i.done = have;
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
        let windowStart = Date.now(), windowBytes = 0;
        res.on('data', chunk => {
            have += chunk.length;
            windowBytes += chunk.length;
            i.done = have;
            const now = Date.now();
            if (now - windowStart >= 1000) {
                i.speed = Math.round(windowBytes * 1000 / (now - windowStart));
                windowStart = now; windowBytes = 0; i.retries = 0;
            }
            if (!out.write(chunk)) { res.pause(); out.once('drain', () => res.resume()); }
            save(); notify();
        });
        const end = (err) => out.end(() => err ? reject(err) : resolve());
        res.on('end', () => end(total > 0 && have < total ? new Error('incomplete') : null));
        res.on('aborted', () => end(new Error('aborted')));
        res.on('error', end);
        req.on('error', end);
        req.on('close', () => { if (!res.complete) end(new Error('closed')); });
    });
    finish(i);
}

function finish(i) {
    try {
        if (fs.existsSync(i.file)) fs.unlinkSync(i.file);
        fs.renameSync(i.file + '.part', i.file);
        i.state = DONE; i.error = ''; i.speed = 0;
        i.done = fs.statSync(i.file).size;
        if (!i.total) i.total = i.done;
    } catch (e) {
        i.state = FAILED; i.error = 'تعذّر حفظ الملف';
    }
    save(true); notify(true);
    savePoster(i);
}

function savePoster(i) {
    if (!i.poster || !/^https?:/i.test(i.poster) || fs.existsSync(i.posterFile)) return;
    openRequest(i.poster, 0).then(({ res }) => {
        if (res.statusCode !== 200) { res.resume(); return; }
        fs.mkdirSync(path.dirname(i.posterFile), { recursive: true });
        const out = fs.createWriteStream(i.posterFile);
        res.pipe(out);
        out.on('finish', () => notify(true));
        out.on('error', () => { try { fs.unlinkSync(i.posterFile); } catch (e) { } });
    }).catch(() => { });
}

async function work() {
    if (working) return;
    working = true;
    try {
        while (true) {
            if (playbackActive) break; // يكمل عند إغلاق المشغل (setPlaybackActive(false))
            const next = items.find(i => i.state === QUEUED);
            if (!next) break;
            next.state = RUNNING; next.error = '';
            current = next;
            save(true); notify(true);
            try {
                await downloadOne(next);
            } catch (err) {
                next.speed = 0;
                if (!items.includes(next)) { /* أُلغي */ }
                else if (next.state === PAUSED || playbackActive) { if (playbackActive && next.state === RUNNING) next.state = QUEUED; }
                else if (next.state === RUNNING) {
                    next.retries = (next.retries || 0) + 1;
                    if (next.retries <= MAX_AUTO_RETRIES && !err.httpCode && err.code !== 'SPACE') {
                        next.state = QUEUED; // انقطاع مؤقت: يعيد المحاولة من حيث توقف
                        next.error = 'انقطع الاتصال، إعادة المحاولة…';
                        save(true); notify(true);
                        await new Promise(r => setTimeout(r, 5000 * next.retries));
                    } else {
                        next.state = FAILED;
                        next.error = friendlyError(err);
                    }
                }
                save(true); notify(true);
            } finally {
                current = null; currentReq = null;
            }
        }
    } finally {
        working = false;
        current = null;
        notify(true);
    }
}

// ------------------------------------------------------------------ التسجيل

function init(ipcMain, windowGetter) {
    getWindow = windowGetter;
    load();
    ipcMain.handle('downloads-list', () => snapshot());
    ipcMain.handle('downloads-enqueue', (e, req) => enqueue(req));
    ipcMain.handle('downloads-pause', (e, id) => { pause(id); return snapshot(); });
    ipcMain.handle('downloads-resume', (e, id) => { resume(id); return snapshot(); });
    ipcMain.handle('downloads-remove', (e, id) => { remove(id); return snapshot(); });
    ipcMain.handle('downloads-playback', (e, active) => setPlaybackActive(active));
    ipcMain.handle('downloads-choose-folder', () => chooseFolder());
    ipcMain.handle('downloads-open-folder', () => shell.openPath(downloadDir()));
    ipcMain.handle('downloads-show-file', (e, id) => {
        const i = items.find(x => x.id === id);
        if (i && fs.existsSync(i.file)) shell.showItemInFolder(i.file);
    });
    // ما بقي في الطابور من جلسة سابقة يكمل بعد فتح البرنامج بقليل
    setTimeout(work, 4000);
}

module.exports = { init };
