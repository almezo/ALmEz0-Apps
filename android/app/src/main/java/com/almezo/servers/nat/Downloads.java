package com.almezo.servers.nat;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * تنزيل الأفلام والحلقات للمشاهدة بدون إنترنت.
 *
 * قواعد ثابتة بسبب لوحات Xtream (تحظر الـIP عند كثرة الاتصالات، انظر xtream-panel-rate-limits):
 * - تنزيل واحد فقط في كل وقت، والباقي في طابور.
 * - اتصال واحد لكل ملف: لا تقسيم للملف إلى أجزاء متوازية.
 * - أثناء مشاهدة بث من السيرفر يتوقف التنزيل ويكمل تلقائياً بعد إغلاق المشغل، فلا يصبح
 *   للعميل اتصالان في نفس اللحظة.
 * الاستئناف بطلب Range من حيث توقف الملف الجزئي (.part)، فانقطاع النت أو إغلاق البرنامج لا
 * يعيد التنزيل من الصفر. معلومات كل ملف (الاسم والصورة) تُحفظ معه، فصفحة التنزيلات تعمل بلا نت.
 */
public final class Downloads {

    public static final String QUEUED = "queued";
    public static final String RUNNING = "running";
    public static final String PAUSED = "paused";
    public static final String DONE = "done";
    public static final String FAILED = "failed";

    private static final int BUFFER = 64 * 1024;
    private static final long SPACE_MARGIN = 50L * 1024 * 1024;
    private static final int MAX_AUTO_RETRIES = 3;

    public static final class Item {
        public String id, kind, title, subtitle, poster, url, ext, contentKey, seriesId, accountId;
        public String file, posterFile, state = QUEUED, error = "";
        public long total, done, speed, createdAt;
        public int season, episode, dirIndex;
        transient int retries;

        public boolean isActive() {
            return QUEUED.equals(state) || RUNNING.equals(state);
        }

        public int percent() {
            return total > 0 ? (int) Math.min(100, done * 100 / total) : 0;
        }

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id).put("kind", kind).put("title", title).put("subtitle", subtitle)
                        .put("poster", poster).put("url", url).put("ext", ext).put("contentKey", contentKey)
                        .put("seriesId", seriesId).put("accountId", accountId).put("file", file)
                        .put("posterFile", posterFile).put("state", state).put("error", error)
                        .put("total", total).put("done", done).put("createdAt", createdAt)
                        .put("season", season).put("episode", episode).put("dirIndex", dirIndex);
            } catch (Exception ignored) { }
            return o;
        }

        static Item fromJson(JSONObject o) {
            Item i = new Item();
            i.id = o.optString("id");
            i.kind = o.optString("kind");
            i.title = o.optString("title");
            i.subtitle = o.optString("subtitle");
            i.poster = o.optString("poster");
            i.url = o.optString("url");
            i.ext = o.optString("ext", "mp4");
            i.contentKey = o.optString("contentKey");
            i.seriesId = o.optString("seriesId");
            i.accountId = o.optString("accountId");
            i.file = o.optString("file");
            i.posterFile = o.optString("posterFile");
            i.state = o.optString("state", QUEUED);
            i.error = o.optString("error");
            i.total = o.optLong("total");
            i.done = o.optLong("done");
            i.createdAt = o.optLong("createdAt");
            i.season = o.optInt("season");
            i.episode = o.optInt("episode");
            i.dirIndex = o.optInt("dirIndex");
            return i;
        }
    }

    public interface Listener {
        void onDownloadsChanged();
    }

    private static Downloads instance;

    public static synchronized Downloads get(Context ctx) {
        if (instance == null) instance = new Downloads(ctx.getApplicationContext());
        return instance;
    }

    private final Context app;
    private final SharedPreferences prefs;
    private final Object lock = new Object();
    private final List<Item> items = new ArrayList<>();
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean playbackActive;
    private volatile HttpURLConnection activeConn;
    private Item current;
    private Thread worker;
    private long lastNotify;
    private boolean notifyPosted;

    private Downloads(Context app) {
        this.app = app;
        this.prefs = app.getSharedPreferences("almezo_downloads", Context.MODE_PRIVATE);
        load();
    }

    // ------------------------------------------------------------------ الحفظ

    private void load() {
        try {
            JSONArray arr = new JSONArray(prefs.getString("items", "[]"));
            for (int n = 0; n < arr.length(); n++) {
                Item i = Item.fromJson(arr.getJSONObject(n));
                // التنزيل الذي كان يعمل عند إغلاق البرنامج يعود للطابور ويكمل من ملفه الجزئي
                if (RUNNING.equals(i.state)) i.state = QUEUED;
                File part = new File(i.file + ".part");
                if (!DONE.equals(i.state) && part.exists()) i.done = part.length();
                if (DONE.equals(i.state) && !new File(i.file).exists()) continue; // حُذف من خارج البرنامج
                items.add(i);
            }
        } catch (Exception ignored) { }
    }

    private void save() {
        JSONArray arr = new JSONArray();
        synchronized (lock) {
            for (Item i : items) arr.put(i.toJson());
        }
        prefs.edit().putString("items", arr.toString()).apply();
    }

    // ------------------------------------------------------------------ أماكن الحفظ

    /** أماكن الحفظ المتاحة: الذاكرة الداخلية ثم أي بطاقة SD (مجلدات البرنامج، بلا أذونات). */
    public List<File> storageDirs() {
        List<File> out = new ArrayList<>();
        File[] dirs = ContextCompat.getExternalFilesDirs(app, null);
        if (dirs != null) {
            for (File d : dirs) {
                if (d == null) continue;
                File dl = new File(d, "Downloads");
                if (dl.exists() || dl.mkdirs()) out.add(dl);
            }
        }
        if (out.isEmpty()) {
            File dl = new File(app.getFilesDir(), "Downloads");
            dl.mkdirs();
            out.add(dl);
        }
        return out;
    }

    public int storageIndex() {
        int i = prefs.getInt("dir", 0);
        return i < storageDirs().size() ? i : 0;
    }

    public void setStorageIndex(int i) {
        prefs.edit().putInt("dir", i).apply();
        notifyChanged(true);
    }

    public static String storageLabel(int index) {
        return index == 0 ? "ذاكرة الجهاز" : "بطاقة الذاكرة الخارجية (SD)";
    }

    public static long freeBytes(File dir) {
        try {
            return new StatFs(dir.getPath()).getAvailableBytes();
        } catch (Exception e) {
            return dir.getUsableSpace();
        }
    }

    // ------------------------------------------------------------------ القراءة

    public List<Item> all() {
        synchronized (lock) {
            return new ArrayList<>(items);
        }
    }

    public Item find(String id) {
        synchronized (lock) {
            for (Item i : items) if (i.id.equals(id)) return i;
        }
        return null;
    }

    public Item current() {
        return current;
    }

    /** مسار الملف المحلي إن كان التنزيل مكتملاً وموجوداً، وإلا null. */
    public String localFile(String id) {
        Item i = find(id);
        if (i == null || !DONE.equals(i.state)) return null;
        File f = new File(i.file);
        return f.exists() ? f.getAbsolutePath() : null;
    }

    public boolean isPlaybackActive() {
        return playbackActive;
    }

    public boolean hasActiveWork() {
        synchronized (lock) {
            for (Item i : items) if (i.isActive()) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ الأوامر

    /** يضيف للطابور ويعيد العنصر (أو الموجود إن كان مضافاً مسبقاً). */
    public Item enqueue(Item req) {
        synchronized (lock) {
            Item existing = find(req.id);
            if (existing != null) {
                if (FAILED.equals(existing.state) || PAUSED.equals(existing.state)) {
                    existing.state = QUEUED;
                    existing.error = "";
                    existing.retries = 0;
                    existing.url = req.url; // قد يتغير الهوست أو كلمة المرور
                }
                save();
                startWork();
                return existing;
            }
            int dirIndex = storageIndex();
            File dir = storageDirs().get(dirIndex);
            req.dirIndex = dirIndex;
            req.file = uniqueFile(dir, req.title, req.ext).getAbsolutePath();
            req.posterFile = new File(dir, ".posters/" + safeName(req.id) + ".jpg").getAbsolutePath();
            req.state = QUEUED;
            req.createdAt = System.currentTimeMillis();
            items.add(req);
        }
        save();
        startWork();
        return req;
    }

    public void pause(String id) {
        synchronized (lock) {
            Item i = find(id);
            if (i != null && i.isActive()) {
                i.state = PAUSED;
                i.speed = 0;
            }
            lock.notifyAll();
        }
        save();
        notifyChanged(true);
    }

    public void resume(String id) {
        synchronized (lock) {
            Item i = find(id);
            if (i != null && (PAUSED.equals(i.state) || FAILED.equals(i.state))) {
                i.state = QUEUED;
                i.error = "";
                i.retries = 0;
            }
        }
        save();
        startWork();
    }

    /** إلغاء تنزيل أو حذف ملف منزّل: يزيل الملف والجزئي والصورة والعنصر. */
    public void remove(String id) {
        Item i;
        synchronized (lock) {
            i = find(id);
            if (i == null) return;
            items.remove(i);
            lock.notifyAll();
        }
        // العامل يلاحظ الإزالة ويتوقف؛ نحذف بعد لحظة حتى لا يكتب في ملف محذوف
        final Item gone = i;
        main.postDelayed(() -> {
            new File(gone.file + ".part").delete();
            new File(gone.file).delete();
            if (gone.posterFile != null) new File(gone.posterFile).delete();
        }, 600);
        save();
        notifyChanged(true);
    }

    /** المشغل يبث من السيرفر: يتوقف التنزيل حتى لا يصبح للعميل اتصالان بالسيرفر. */
    public void setPlaybackActive(boolean active) {
        synchronized (lock) {
            if (playbackActive == active) return;
            playbackActive = active;
            lock.notifyAll();
        }
        // قطع اتصال التنزيل فوراً وانتظار إغلاقه قبل أن يفتح المشغل اتصاله، فلا يلتقي اتصالان
        // باللوحة ولو لثانية. (كان التنزيل يتوقف عند وصول الدفعة التالية فقط، أي بعد فتح المشغل.)
        final HttpURLConnection conn = activeConn;
        if (active && conn != null) {
            Thread t = new Thread(conn::disconnect, "almezo-dl-abort");
            t.start();
            try {
                t.join(800);
                Thread.sleep(300); // مهلة قصيرة حتى يسجّل السيرفر إغلاق الاتصال قبل اتصال المشغل
            } catch (InterruptedException ignored) { }
        }
        notifyChanged(true);
        if (!active) startWork();
    }

    /** بعد فتح البرنامج: ما بقي في الطابور يكمل (يُستدعى من الشاشات عند فتحها). */
    public void resumePending() {
        if (hasActiveWork()) startWork();
    }

    // ------------------------------------------------------------------ المستمعون

    public void addListener(Listener l) {
        listeners.add(l);
    }

    public void removeListener(Listener l) {
        listeners.remove(l);
    }

    /** إشعار الواجهة: التغييرات الكبيرة فوراً، والتقدّم مرتين في الثانية على الأكثر. */
    private void notifyChanged(boolean immediate) {
        long now = System.currentTimeMillis();
        if (!immediate && now - lastNotify < 500) return;
        lastNotify = now;
        if (notifyPosted && !immediate) return;
        notifyPosted = true;
        main.post(() -> {
            notifyPosted = false;
            for (Listener l : listeners) l.onDownloadsChanged();
        });
    }

    // ------------------------------------------------------------------ العامل

    private void startWork() {
        synchronized (lock) {
            lock.notifyAll();
            if (worker == null || !worker.isAlive()) {
                worker = new Thread(this::loop, "almezo-downloads");
                worker.setPriority(Thread.MIN_PRIORITY + 1);
                worker.start();
            }
        }
        if (hasActiveWork()) DownloadService.start(app);
        notifyChanged(true);
    }

    private Item pickNext() {
        for (Item i : items) if (QUEUED.equals(i.state)) return i;
        return null;
    }

    private void loop() {
        while (true) {
            Item next;
            synchronized (lock) {
                next = pickNext();
                long waitUntil = System.currentTimeMillis() + 60_000;
                while (next == null || playbackActive) {
                    if (next == null && !hasActiveWork()) {
                        worker = null;
                        current = null;
                        notifyChanged(true);
                        return; // لا عمل: الخدمة تتوقف من نفسها عند الإشعار
                    }
                    try { lock.wait(Math.max(1, waitUntil - System.currentTimeMillis())); } catch (InterruptedException e) { return; }
                    next = pickNext();
                    waitUntil = System.currentTimeMillis() + 60_000;
                }
                next.state = RUNNING;
                next.error = "";
                current = next;
            }
            save();
            notifyChanged(true);
            try {
                download(next);
            } catch (Throwable t) {
                android.util.Log.w("AlmezoDL", "download error: " + next.id, t);
                synchronized (lock) {
                    if (items.contains(next) && RUNNING.equals(next.state) && playbackActive) {
                        next.state = QUEUED; // قُطع عمداً لأن المشاهدة بدأت: يكمل بعدها بلا عدّ محاولة
                        next.speed = 0;
                    } else if (items.contains(next) && RUNNING.equals(next.state)) {
                        next.retries++;
                        next.speed = 0;
                        if (next.retries <= MAX_AUTO_RETRIES && !(t instanceof SpaceException) && !(t instanceof HttpException)) {
                            next.state = QUEUED; // انقطاع مؤقت: نعيد المحاولة من حيث توقف
                            next.error = "انقطع الاتصال، إعادة المحاولة…";
                        } else {
                            next.state = FAILED;
                            next.error = friendlyError(t);
                        }
                    }
                }
                save();
                notifyChanged(true);
                if (next.retries > 0 && QUEUED.equals(next.state)) {
                    try { Thread.sleep(5000L * next.retries); } catch (InterruptedException ignored) { }
                }
            }
            synchronized (lock) {
                current = null;
            }
        }
    }

    private static final class SpaceException extends IOException {
        SpaceException() { super("space"); }
    }

    private static final class HttpException extends IOException {
        final int code;
        HttpException(int code) { super("HTTP " + code); this.code = code; }
    }

    private static String friendlyError(Throwable t) {
        if (t instanceof SpaceException) return "المساحة غير كافية على الجهاز";
        if (t instanceof HttpException) {
            int c = ((HttpException) t).code;
            if (c == 401 || c == 403) return "السيرفر رفض التنزيل (" + c + ") — تأكد من صلاحية الاشتراك";
            if (c == 404) return "الملف غير موجود على السيرفر";
            return "خطأ من السيرفر (" + c + ")";
        }
        return "تعذّر الاتصال بالسيرفر";
    }

    private boolean shouldStop(Item i) {
        synchronized (lock) {
            return !items.contains(i) || !RUNNING.equals(i.state) || playbackActive;
        }
    }

    private void download(Item i) throws IOException {
        File target = new File(i.file);
        File part = new File(i.file + ".part");
        File parent = target.getParentFile();
        if (parent != null) parent.mkdirs();
        long have = part.exists() ? part.length() : 0;

        synchronized (lock) {
            if (playbackActive) { i.state = QUEUED; return; } // بدأت المشاهدة قبل الاتصال
        }
        HttpURLConnection c = open(i.url, have);
        activeConn = c;
        int code = c.getResponseCode();
        if (code == 416 && have > 0 && i.total > 0 && have >= i.total) {
            c.disconnect();
            finish(i, part, target);
            return;
        }
        long total;
        boolean append;
        if (code == HttpURLConnection.HTTP_PARTIAL && have > 0) {
            total = totalFromContentRange(c.getHeaderField("Content-Range"), have + c.getContentLengthLong());
            append = true;
        } else if (code == HttpURLConnection.HTTP_OK) {
            total = c.getContentLengthLong(); // السيرفر تجاهل Range: نبدأ من الصفر
            have = 0;
            append = false;
        } else {
            c.disconnect();
            throw new HttpException(code);
        }

        long needed = total > 0 ? total - have : 0;
        if (needed > 0 && freeBytes(parent) < needed + SPACE_MARGIN) {
            c.disconnect();
            throw new SpaceException();
        }

        synchronized (lock) {
            i.total = total;
            i.done = have;
        }
        byte[] buf = new byte[BUFFER];
        long windowStart = System.currentTimeMillis(), windowBytes = 0, lastSave = windowStart;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part, append)) {
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                have += n;
                windowBytes += n;
                long now = System.currentTimeMillis();
                synchronized (lock) {
                    i.done = have;
                    if (now - windowStart >= 1000) {
                        i.speed = windowBytes * 1000 / (now - windowStart);
                        windowStart = now;
                        windowBytes = 0;
                        i.retries = 0; // يتقدّم: انقطاع لاحق يستحق محاولات جديدة
                    }
                }
                if (now - lastSave > 5000) { save(); lastSave = now; }
                notifyChanged(false);
                if (shouldStop(i)) break;
            }
        } finally {
            activeConn = null;
            c.disconnect();
        }

        synchronized (lock) {
            i.speed = 0;
            if (!items.contains(i)) return; // أُلغي
            if (!RUNNING.equals(i.state)) { save(); notifyChanged(true); return; } // أُوقف مؤقتاً
            if (playbackActive) { i.state = QUEUED; save(); notifyChanged(true); return; } // يكمل بعد المشاهدة
        }
        if (total > 0 && have < total) throw new IOException("incomplete");
        finish(i, part, target);
    }

    private void finish(Item i, File part, File target) {
        if (target.exists()) target.delete();
        if (!part.renameTo(target)) {
            synchronized (lock) {
                i.state = FAILED;
                i.error = "تعذّر حفظ الملف";
            }
            save();
            notifyChanged(true);
            return;
        }
        synchronized (lock) {
            i.state = DONE;
            i.done = target.length();
            if (i.total <= 0) i.total = i.done;
            i.error = "";
        }
        savePoster(i);
        save();
        notifyChanged(true);
    }

    /** نسخة محلية من الصورة لتظهر في صفحة التنزيلات بلا نت. */
    private void savePoster(Item i) {
        if (i.poster == null || i.poster.isEmpty() || i.posterFile == null) return;
        File f = new File(i.posterFile);
        if (f.exists()) return;
        File dir = f.getParentFile();
        if (dir != null) dir.mkdirs();
        HttpURLConnection c = null;
        try {
            c = open(i.poster, 0);
            if (c.getResponseCode() != HttpURLConnection.HTTP_OK) return;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
        } catch (Exception e) {
            f.delete();
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** اتصال واحد، مع تتبّع التحويلات يدوياً (http↔https لا يتبعها أندرويد تلقائياً). */
    private static HttpURLConnection open(String url, long from) throws IOException {
        String u = url;
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("User-Agent", Xtream.USER_AGENT);
            c.setRequestProperty("Accept-Encoding", "identity");
            if (from > 0) c.setRequestProperty("Range", "bytes=" + from + "-");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new HttpException(code);
                u = new URL(new URL(u), loc).toString();
                continue;
            }
            return c;
        }
        throw new IOException("too many redirects");
    }

    private static long totalFromContentRange(String header, long fallback) {
        if (header != null) {
            int slash = header.lastIndexOf('/');
            if (slash >= 0) {
                try { return Long.parseLong(header.substring(slash + 1).trim()); } catch (Exception ignored) { }
            }
        }
        return fallback;
    }

    // ------------------------------------------------------------------ أدوات

    static String safeName(String s) {
        String n = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        if (n.length() > 80) n = n.substring(0, 80).trim();
        return n.isEmpty() ? "ALmEz0" : n;
    }

    private static File uniqueFile(File dir, String title, String ext) {
        String e = (ext == null || ext.isEmpty()) ? "mp4" : ext.replaceAll("[^A-Za-z0-9]", "");
        String base = safeName(title);
        File f = new File(dir, base + "." + e);
        int n = 2;
        while (f.exists() || new File(f.getPath() + ".part").exists()) {
            f = new File(dir, base + " (" + n++ + ")." + e);
        }
        return f;
    }

    /** يعزل قيمة إنجليزية (أرقام ووحدات) داخل نص عربي حتى لا تتبعثر حول الكلمات. */
    public static String ltr(String s) {
        return "⁦" + s + "⁩";
    }

    public static String formatBytes(long b) {
        if (b <= 0) return "0 MB";
        if (b >= 1024L * 1024 * 1024) return String.format(Locale.US, "%.2f GB", b / (1024.0 * 1024 * 1024));
        return String.format(Locale.US, "%.1f MB", b / (1024.0 * 1024));
    }

    public static String formatSpeed(long bps) {
        if (bps <= 0) return "—";
        if (bps >= 1024 * 1024) return String.format(Locale.US, "%.1f MB/s", bps / (1024.0 * 1024));
        return String.format(Locale.US, "%d KB/s", bps / 1024);
    }

    public static String formatEta(Item i) {
        if (i.speed <= 0 || i.total <= 0) return "—";
        long sec = (i.total - i.done) / i.speed;
        if (sec >= 3600) return String.format(Locale.US, "%d س %d د", sec / 3600, (sec % 3600) / 60);
        if (sec >= 60) return String.format(Locale.US, "%d د %d ث", sec / 60, sec % 60);
        return sec + " ث";
    }

    /** وصف الحالة بالعربية للواجهة. */
    public String statusText(Item i) {
        switch (i.state) {
            case RUNNING: return "جاري التنزيل";
            case QUEUED:
                if (playbackActive) return "متوقف أثناء المشاهدة — يكمل بعد إغلاق المشغل";
                if (i.error != null && !i.error.isEmpty()) return i.error;
                return "في قائمة الانتظار";
            case PAUSED: return "متوقف مؤقتاً";
            case DONE: return "تم التنزيل — جاهز للمشاهدة بدون إنترنت";
            case FAILED: return "فشل: " + i.error;
            default: return "";
        }
    }
}
