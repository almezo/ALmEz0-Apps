package com.almezo.servers.nat;

import android.content.Context;
import android.util.JsonReader;
import android.util.JsonToken;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * عميل Xtream Codes (player_api.php) للمشغل الأصلي.
 * - كاش دائم على القرص لمدة 12 ساعة (يبقى بعد إغلاق التطبيق) + كاش ذاكرة للجلسة.
 * - قراءة JSON بالتدفق (JsonReader) بدل تحميل الاستجابة كاملة ككائنات، لأن قوائم الأفلام
 *   قد تتجاوز 20 ألف عنصر، وتحويلها كلها إلى JSONObject يستهلك ذاكرة كبيرة على الأجهزة الضعيفة.
 */
public final class Xtream {

    /**
     * خيطان فقط للطلبات: ثلاثة طلبات ثقيلة متوازية على نفس اللوحة (قوائم قد تتجاوز 20 ألف
     * عنصر) تجعل بعض السيرفرات الحسّاسة تحظر الـIP بعد فتحتين أو ثلاث.
     */
    public static final ExecutorService IO = Executors.newFixedThreadPool(2);
    /**
     * هوية المتصفح التي تقبلها سيرفرات Xtream. تُستعمل أيضاً عند تحميل الشعارات والملصقات بـ Glide،
     * لأن هويته الافتراضية (Dalvik/…) ترفضها كثير من سيرفرات الصور فتعيد 403 ويبقى الشعار الافتراضي.
     */
    public static final String USER_AGENT = "Mozilla/5.0 (Linux; Android) ALmEz0/Native";
    private static final long DISK_TTL_MS = 12L * 60 * 60 * 1000;
    private static final Map<String, List<Models.Item>> MEM_STREAMS = Collections.synchronizedMap(new HashMap<>());
    private static final Map<String, List<Models.Category>> MEM_CATS = Collections.synchronizedMap(new HashMap<>());

    private final Context app;
    private final Models.Account acc;

    public Xtream(Context ctx, Models.Account account) {
        this.app = ctx.getApplicationContext();
        this.acc = account;
    }

    // ---------------------------------------------------------------- روابط

    private static String enc(String s) {
        try { return URLEncoder.encode(s == null ? "" : s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static String trimHost(String host) {
        String h = host == null ? "" : host.trim();
        while (h.endsWith("/")) h = h.substring(0, h.length() - 1);
        return h;
    }

    private String api(String action, String extra) {
        return trimHost(acc.host) + "/player_api.php?username=" + enc(acc.username)
                + "&password=" + enc(acc.password)
                + (action != null ? "&action=" + action : "")
                + (extra != null ? extra : "");
    }

    /** نفس صيغ الروابط في playStream بمشغل الويب. */
    public String streamUrl(String type, String id, String ext) {
        String base = trimHost(acc.host);
        String u = enc(acc.username), p = enc(acc.password);
        if (Models.LIVE.equals(type)) {
            String e = "ts".equalsIgnoreCase(ext) ? "ts" : "m3u8";
            return base + "/live/" + u + "/" + p + "/" + id + "." + e;
        }
        String e = (ext == null || ext.isEmpty()) ? "mp4" : ext.toLowerCase();
        if (Models.SERIES.equals(type)) return base + "/series/" + u + "/" + p + "/" + id + "." + e;
        return base + "/movie/" + u + "/" + p + "/" + id + "." + e;
    }

    // ---------------------------------------------------------------- شبكة

    /**
     * بوابة واحدة لكل طلبات لوحة السيرفر مهما كانت الشاشة التي تطلبها.
     *
     * لوحات Xtream تحظر الـIP عند رشقات الطلبات، وكانت في التطبيق ثلاثة مصادر رشق:
     * صفحة تفاصيل الفيلم تطلب حتى 64 معلومة دفعة واحدة على 4 خيوط (Related.fetchMissing)،
     * والضغط المطوّل على زر تبديل القناة يفتح بثاً جديداً عشرات المرات في الثانية،
     * والتحميل المسبق للصور يصطف بمئات الطلبات.
     *
     * الحد هنا: اتصالان متزامنان كحد أقصى، وربع ثانية على الأقل بين بداية طلب وآخر
     * (أي أربعة طلبات في الثانية كحد أقصى للتطبيق كله). هذا سقف لا يمكن تجاوزه من أي شاشة.
     */
    private static final java.util.concurrent.Semaphore PANEL_GATE = new java.util.concurrent.Semaphore(2, true);
    private static final Object PACE_LOCK = new Object();
    private static final long MIN_REQUEST_GAP_MS = 250;
    private static long lastRequestAt = 0;

    private static void pace() throws IOException {
        synchronized (PACE_LOCK) {
            long now = android.os.SystemClock.elapsedRealtime();
            long wait = lastRequestAt + MIN_REQUEST_GAP_MS - now;
            if (wait > 0) {
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrupted");
                }
            }
            lastRequestAt = android.os.SystemClock.elapsedRealtime();
        }
    }

    public static byte[] httpGet(String url) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        httpGetTo(url, bos);
        return bos.toByteArray();
    }

    /** نفس httpGet لكن يكتب الاستجابة مباشرة في وجهة (ملف الكاش) دون نسخة كاملة في الذاكرة. */
    private static void httpGetTo(String url, java.io.OutputStream sink) throws IOException {
        pace();
        try {
            PANEL_GATE.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted");
        }
        try {
            request(url, sink);
        } finally {
            PANEL_GATE.release();
        }
    }

    private static void request(String url, java.io.OutputStream sink) throws IOException {
        String current = url;
        for (int redirects = 0; redirects < 6; redirects++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(45000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", USER_AGENT);
            /*
             * لا نضع Accept-Encoding بأنفسنا: حينها يطلب النظام الضغط (gzip) ويفكّه تلقائياً.
             * كان هنا "identity" منذ أول نسخة أصلية، فيُلغي الضغط تماماً — وقوائم الأفلام
             * والمسلسلات JSON بعشرات الميجابايت تنضغط عادةً أضعافاً، فكان كل تحديث للباقات
             * ينزّل البيانات كاملة بلا ضغط. اللوحة التي لا تدعم الضغط تُرسل كما كانت.
             */
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null || loc.isEmpty()) throw new IOException("Redirect without location");
                current = new URL(new URL(current), loc).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("HTTP " + code);
            }
            try (InputStream in = new BufferedInputStream(c.getInputStream(), 65536)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) sink.write(buf, 0, n);
                return;
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("Too many redirects");
    }

    /** تسجيل الدخول: يعيد user_info عند النجاح أو null عند بيانات خاطئة. */
    public static JSONObject authenticate(String host, String user, String pass) throws Exception {
        String url = trimHost(host) + "/player_api.php?username=" + enc(user) + "&password=" + enc(pass);
        JSONObject root = new JSONObject(new String(httpGet(url), StandardCharsets.UTF_8));
        JSONObject info = root.optJSONObject("user_info");
        if (info != null && info.optInt("auth", 0) == 1) return info;
        return null;
    }

    // ---------------------------------------------------------------- كاش القرص

    private File cacheFile(String key) {
        File dir = new File(app.getCacheDir(), "xtream");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, md5(acc.id + "|" + key) + ".json");
    }

    private static String md5(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }

    /** يعيد ملف الاستجابة: من الكاش إن كان صالحاً، وإلا يحمّله من السيرفر ويحفظه. */
    private File fetchToCache(String key, String url, boolean force) throws IOException {
        File f = cacheFile(key);
        boolean fresh = f.exists() && f.length() > 2 && (System.currentTimeMillis() - f.lastModified()) < DISK_TTL_MS;
        if (fresh && !force) return f;
        File tmp = new File(f.getPath() + ".tmp");
        try (java.io.OutputStream out = new java.io.BufferedOutputStream(new FileOutputStream(tmp), 65536)) {
            httpGetTo(url, out);
        } catch (IOException e) {
            tmp.delete();
            throw e;
        }
        if (f.exists()) f.delete();
        if (!tmp.renameTo(f)) throw new IOException("cache write failed");
        return f;
    }

    public void clearCache(String type) {
        MEM_STREAMS.remove(acc.id + "|" + type);
        MEM_CATS.remove(acc.id + "|" + type);
        cacheFile("streams_" + type).delete();
        cacheFile("cats_" + type).delete();
    }

    public static void clearAll(Context ctx) {
        MEM_STREAMS.clear();
        MEM_CATS.clear();
        File dir = new File(ctx.getCacheDir(), "xtream");
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    // ---------------------------------------------------------------- الأقسام والقوائم

    private static String actionFor(String type, boolean categories) {
        if (Models.LIVE.equals(type)) return categories ? "get_live_categories" : "get_live_streams";
        if (Models.SERIES.equals(type)) return categories ? "get_series_categories" : "get_series";
        return categories ? "get_vod_categories" : "get_vod_streams";
    }

    public List<Models.Category> categories(String type, boolean force) throws IOException {
        String memKey = acc.id + "|" + type;
        if (!force) {
            List<Models.Category> m = MEM_CATS.get(memKey);
            if (m != null) return m;
        }
        File f = fetchToCache("cats_" + type, api(actionFor(type, true), null), force);
        List<Models.Category> out = new ArrayList<>();
        try (JsonReader r = new JsonReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            r.setLenient(true);
            if (r.peek() != JsonToken.BEGIN_ARRAY) { r.skipValue(); return out; }
            r.beginArray();
            while (r.hasNext()) {
                if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); continue; }
                String id = null, name = null;
                r.beginObject();
                while (r.hasNext()) {
                    String k = r.nextName();
                    if ("category_id".equals(k)) id = loose(r);
                    else if ("category_name".equals(k)) name = loose(r);
                    else r.skipValue();
                }
                r.endObject();
                if (id == null) continue;
                String upper = name == null ? "" : name.trim().toUpperCase();
                // نفس الويب: "المضافة حديثاً" قسم خاص ثابت، فلا نكرّره من السيرفر
                if ("LAST ADDED".equals(upper) || "المضافة حديثاً".equals(name) || "المضاف حديثا".equals(name)) continue;
                out.add(new Models.Category(id, name == null ? "" : name.trim(), 0, false));
            }
            r.endArray();
        }
        MEM_CATS.put(memKey, out);
        return out;
    }

    public List<Models.Item> streams(String type, boolean force) throws IOException {
        String memKey = acc.id + "|" + type;
        if (!force) {
            List<Models.Item> m = MEM_STREAMS.get(memKey);
            if (m != null) return m;
        }
        File f = fetchToCache("streams_" + type, api(actionFor(type, false), null), force);
        List<Models.Item> out = new ArrayList<>();
        try (JsonReader r = new JsonReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            r.setLenient(true);
            if (r.peek() != JsonToken.BEGIN_ARRAY) { r.skipValue(); return out; }
            r.beginArray();
            while (r.hasNext()) {
                if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); continue; }
                Models.Item it = new Models.Item();
                String rating = null, rating5 = null, added = null, modified = null;
                r.beginObject();
                while (r.hasNext()) {
                    String k = r.nextName();
                    switch (k) {
                        case "stream_id":
                        case "series_id":
                            it.id = loose(r); break;
                        case "name": it.name = loose(r); break;
                        case "stream_icon":
                        case "cover":
                            String ic = loose(r);
                            if (ic != null && !ic.isEmpty()) it.icon = ic;
                            break;
                        case "category_id": it.categoryId = loose(r); break;
                        case "container_extension": it.extension = loose(r); break;
                        case "rating":
                        case "vote_average":
                        case "rating_imdb":
                        case "imdb_rating":
                        case "tmdb_rating":
                        case "score":
                            if (rating == null || rating.isEmpty() || "0".equals(rating)) rating = loose(r);
                            else r.skipValue();
                            break;
                        case "genre": it.genre = loose(r); break;
                        case "rating_5based": rating5 = loose(r); break;
                        case "added": added = loose(r); break;
                        case "last_modified": modified = loose(r); break;
                        default: r.skipValue();
                    }
                }
                r.endObject();
                if (it.id == null) continue;
                it.rating = parseFloat(rating);
                if (it.rating <= 0) {
                    float r5 = parseFloat(rating5);
                    if (r5 > 0) {
                        it.rating = r5 <= 5.0f ? r5 * 2f : r5;
                    }
                }
                it.added = parseLong(added != null ? added : modified);
                out.add(it);
            }
            r.endArray();
        }
        MEM_STREAMS.put(memKey, out);
        return out;
    }

    public JSONObject vodInfo(String id) throws Exception {
        return new JSONObject(new String(httpGet(api("get_vod_info", "&vod_id=" + enc(id))), StandardCharsets.UTF_8));
    }

    public JSONObject seriesInfo(String id) throws Exception {
        return new JSONObject(new String(httpGet(api("get_series_info", "&series_id=" + enc(id))), StandardCharsets.UTF_8));
    }

    /** برنامج الآن والتالي لقناة مباشرة (دليل البرامج المختصر). */
    public JSONObject shortEpg(String streamId) throws Exception {
        return new JSONObject(new String(httpGet(api("get_short_epg", "&stream_id=" + enc(streamId) + "&limit=2")), StandardCharsets.UTF_8));
    }

    public JSONObject accountInfo() throws Exception {
        return new JSONObject(new String(httpGet(api(null, null)), StandardCharsets.UTF_8));
    }

    // ---------------------------------------------------------------- أدوات

    /** يقرأ أي قيمة (نص/رقم/منطقي/null) كنص، ويتخطى المصفوفات والكائنات. */
    private static String loose(JsonReader r) throws IOException {
        JsonToken t = r.peek();
        if (t == JsonToken.STRING || t == JsonToken.NUMBER) return r.nextString();
        if (t == JsonToken.BOOLEAN) return String.valueOf(r.nextBoolean());
        if (t == JsonToken.NULL) { r.nextNull(); return null; }
        r.skipValue();
        return null;
    }

    private static float parseFloat(String s) {
        if (s == null) return 0f;
        try { return Float.parseFloat(s.trim()); } catch (Exception e) { return 0f; }
    }

    private static long parseLong(String s) {
        if (s == null) return 0L;
        try {
            long v = Long.parseLong(s.trim());
            return v < 100000000000L ? v * 1000L : v;
        } catch (Exception e) {
            return 0L;
        }
    }
}
