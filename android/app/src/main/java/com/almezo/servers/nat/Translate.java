package com.almezo.servers.nat;

import android.util.LruCache;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * تعريب قصص الأفلام والمسلسلات القادمة بالإنجليزية (أو أي لغة أخرى).
 *
 * الرابط القديم (translate_a/single بطلب GET) كان يُرجع صفحة "Sorry..." من بعض الشبكات، وكان يفشل
 * مع القصص الطويلة لطول الرابط، فتبقى القصة بالإنجليزية بصمت. هنا نرسل النص في جسم طلب POST،
 * ونجرّب أكثر من خادم ترجمة بالترتيب، ونحفظ الترجمات في الذاكرة لتظهر فوراً عند إعادة فتح العمل.
 */
public final class Translate {

    private static final String[] ENDPOINTS = {
            "https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=ar",
            "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ar",
    };
    private static final LruCache<String, String> CACHE = new LruCache<>(80);

    private Translate() { }

    /** هل النص بلغة غير العربية؟ (أحرف لاتينية أكثر من العربية) */
    public static boolean needsArabic(String text) {
        if (text == null) return false;
        int arabic = 0, latin = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '؀' && c <= 'ۿ') arabic++;
            else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) latin++;
        }
        return latin > arabic;
    }

    /** يعيد الترجمة العربية، أو null إن فشلت كل المحاولات. يُستدعى من خيط خلفي فقط. */
    public static String toArabic(String text) {
        if (text == null || text.trim().isEmpty()) return null;
        String src = text.trim();
        if (src.length() > 4500) src = src.substring(0, 4500);
        String cached = CACHE.get(src);
        if (cached != null) return cached;
        for (String endpoint : ENDPOINTS) {
            try {
                String out = parse(post(endpoint, "q=" + URLEncoder.encode(src, "UTF-8")));
                if (out != null && !out.trim().isEmpty() && !needsArabic(out)) {
                    CACHE.put(src, out.trim());
                    return out.trim();
                }
            } catch (Exception ignored) { }
        }
        return null;
    }

    private static String post(String endpoint, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36");
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream os = c.getOutputStream()) {
                os.write(data);
            }
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
                return new String(bos.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            c.disconnect();
        }
    }

    /** الصيغ المعروفة: [["النص","en"]] أو ["النص"] أو [[["جزء","..."],["جزء","..."]],...] */
    private static String parse(String json) throws Exception {
        if (json == null || !json.trim().startsWith("[")) return null;
        JSONArray root = new JSONArray(json);
        if (root.length() == 0) return null;
        Object first = root.get(0);
        if (first instanceof String) return (String) first;
        if (!(first instanceof JSONArray)) return null;
        JSONArray arr = (JSONArray) first;
        if (arr.length() > 0 && arr.get(0) instanceof String) return arr.getString(0);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < arr.length(); i++) {
            JSONArray seg = arr.optJSONArray(i);
            if (seg != null && seg.length() > 0) sb.append(seg.optString(0, ""));
        }
        return sb.length() > 0 ? sb.toString() : null;
    }
}
