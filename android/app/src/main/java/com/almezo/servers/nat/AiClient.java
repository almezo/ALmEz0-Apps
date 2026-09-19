package com.almezo.servers.nat;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * اتصال مساعد الميزو الأصلي بنموذج Gemini عبر نفس الدالة السحابية الآمنة (generateAiReply)
 * التي يستخدمها موقع الميزو، ومفتاح Gemini يبقى على الخادم فقط.
 *
 * الدالة تشترط مستخدماً مسجلاً في Firebase. المشغل الأصلي يُفتح دائماً من الموقع بعد تسجيل الدخول،
 * فيمرّر الموقع رمز تحديث جلسة Firebase (refresh token) عند فتح المشغل (انظر player.html و
 * Migration.saveWebSession)، ومنه نولّد رمز دخول قصير العمر (ساعة) ونجدده تلقائياً.
 */
public final class AiClient {

    /** مفتاح Firebase العام للمشروع (نفس firebaseConfig.apiKey في firebase-config.js، وليس مفتاح Gemini). */
    private static final String FIREBASE_WEB_KEY = "AIzaSyB5khMxwG1MfG8mJBg3hZYo5nBfbWBR9hE";
    private static final String FUNCTION_URL = "https://us-central1-almez0-servers.cloudfunctions.net/generateAiReply";
    private static final String PREFS = "almezo_native_player";

    public static final class AuthRequiredException extends Exception {
        AuthRequiredException() { super("auth"); }
    }

    private final SharedPreferences sp;

    public AiClient(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** يحفظ جلسة الموقع الممرّرة من player.html (تُستدعى في كل فتح للمشغل). */
    public static void saveRefreshToken(Context ctx, String refreshToken) {
        if (refreshToken == null || refreshToken.trim().isEmpty()) return;
        SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (refreshToken.equals(p.getString("fb_refresh", ""))) return;
        p.edit().putString("fb_refresh", refreshToken.trim()).remove("fb_id_token").remove("fb_id_exp").apply();
    }

    public boolean hasSession() {
        return !sp.getString("fb_refresh", "").isEmpty();
    }

    /** يستدعي generateAiReply ويعيد كائن النتيجة ({text, sources}). يُستدعى من خيط خلفي فقط. */
    public JSONObject generate(JSONObject payload) throws Exception {
        String token = idToken(false);
        try {
            return callFunction(payload, token);
        } catch (AuthRequiredException e) {
            // الرمز انتهى أو أُلغي: تجديد واحد ثم إعادة المحاولة
            return callFunction(payload, idToken(true));
        }
    }

    private JSONObject callFunction(JSONObject payload, String token) throws Exception {
        JSONObject body = new JSONObject();
        body.put("data", payload);
        HttpURLConnection c = (HttpURLConnection) new URL(FUNCTION_URL).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("Authorization", "Bearer " + token);
            write(c, body.toString());
            int code = c.getResponseCode();
            String resp = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
            JSONObject root = resp.isEmpty() ? new JSONObject() : new JSONObject(resp);
            if (code == 401 || "UNAUTHENTICATED".equals(root.optJSONObject("error") != null ? root.optJSONObject("error").optString("status") : "")) {
                throw new AuthRequiredException();
            }
            if (code != 200 || root.has("error")) {
                throw new Exception("AI error " + code);
            }
            JSONObject result = root.optJSONObject("result");
            if (result == null) throw new Exception("empty result");
            return result;
        } finally {
            c.disconnect();
        }
    }

    /** رمز الدخول (ID token) من الكاش، أو يُجدَّد من رمز التحديث عبر خدمة Firebase الرسمية. */
    private synchronized String idToken(boolean forceRefresh) throws Exception {
        long exp = sp.getLong("fb_id_exp", 0L);
        String cached = sp.getString("fb_id_token", "");
        if (!forceRefresh && !cached.isEmpty() && System.currentTimeMillis() < exp - 60_000) return cached;

        String refresh = sp.getString("fb_refresh", "");
        if (refresh.isEmpty()) throw new AuthRequiredException();

        HttpURLConnection c = (HttpURLConnection) new URL("https://securetoken.googleapis.com/v1/token?key=" + FIREBASE_WEB_KEY).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            write(c, "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"));
            int code = c.getResponseCode();
            String resp = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
            if (code != 200) {
                if (code == 400) {
                    // رمز التحديث لم يعد صالحاً (تسجيل خروج من الموقع مثلاً): يلزم فتح المشغل من الموقع مجدداً
                    sp.edit().remove("fb_refresh").remove("fb_id_token").remove("fb_id_exp").apply();
                    throw new AuthRequiredException();
                }
                throw new Exception("token HTTP " + code);
            }
            JSONObject o = new JSONObject(resp);
            String id = o.optString("id_token", "");
            if (id.isEmpty()) throw new AuthRequiredException();
            long ttl = o.optLong("expires_in", 3600L) * 1000L;
            SharedPreferences.Editor ed = sp.edit()
                    .putString("fb_id_token", id)
                    .putLong("fb_id_exp", System.currentTimeMillis() + ttl);
            String newRefresh = o.optString("refresh_token", "");
            if (!newRefresh.isEmpty()) ed.putString("fb_refresh", newRefresh);
            ed.apply();
            return id;
        } finally {
            c.disconnect();
        }
    }

    private static void write(HttpURLConnection c, String body) throws Exception {
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(data.length);
        try (OutputStream os = c.getOutputStream()) {
            os.write(data);
        }
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream is = in) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
