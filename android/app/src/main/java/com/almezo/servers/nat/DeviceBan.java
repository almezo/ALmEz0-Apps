package com.almezo.servers.nat;

import android.app.Activity;
import android.os.SystemClock;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * فحص الحظر الإداري داخل المشغل الأصلي.
 *
 * كان المشغل الأصلي بلا أي فحص: الحظر يُطبَّق في صفحة الويب وحدها، فمن كان داخل المشغل
 * لحظة حظره يبقى يشاهد حتى يُغلق التطبيق. الآن يسأل السيرفر (loginGuard) ببصمة الجهاز
 * نفسها التي يستخدمها الويب (DeviceId)، ويُغلق المشغل إن كان الجهاز محظوراً نهائياً.
 *
 * الحظر المؤقت بعد 3 محاولات دخول خاطئة لا يُغلق المشغل (يخص شاشة الدخول وحدها)،
 * لذلك يُعتمد الحقل permanent الصريح في رد السيرفر.
 *
 * بلا اتصال بالإنترنت لا نمنع شيئاً: التنزيلات تعمل دون إنترنت، وإغلاقها لانقطاع
 * الشبكة يعاقب العملاء الشرعيين. الفحص يُعاد عند عودة الاتصال.
 */
public final class DeviceBan {

    private static final String GUARD_URL = "https://us-central1-almez0-servers.cloudfunctions.net/loginGuard";
    /** لا يُسأل السيرفر أكثر من مرة كل 5 دقائق مهما تنقّل المستخدم بين الشاشات. */
    private static final long MIN_INTERVAL_MS = 5 * 60 * 1000L;

    private static volatile long lastCheckAt = 0L;
    private static volatile boolean inFlight = false;
    private static volatile boolean banned = false;
    /**
     * النافذة الظاهرة وصاحبتها. لا يكفي علم واحد: إن أُعيد إنشاء الشاشة (تدوير، أو أغلقها
     * النظام) تموت النافذة مع صاحبتها، فيبقى العلم "ظاهرة" ويواصل المحظور المشاهدة.
     */
    private static WeakReference<Activity> dialogOwner;
    private static WeakReference<AlertDialog> dialogRef;

    private DeviceBan() { }

    /** يُنادى من BaseActivity.onResume لكل شاشات المشغل الأصلي. */
    public static void checkAsync(Activity a) {
        if (a == null || a.isFinishing()) return;
        // حظر مكتشف سابقاً في هذه الجلسة: يُعرض فوراً في أي شاشة تُفتح بعده
        if (banned) showBlocked(a);

        long now = SystemClock.elapsedRealtime();
        if (inFlight || (lastCheckAt != 0L && now - lastCheckAt < MIN_INTERVAL_MS)) return;
        final String id = DeviceId.get(a);
        if (id.isEmpty()) return;
        lastCheckAt = now;
        inFlight = true;

        final WeakReference<Activity> ref = new WeakReference<>(a);
        new Thread(() -> {
            Boolean result = null;
            try {
                result = fetchPermanentBan(id);
            } catch (Throwable ignored) {
                // بلا اتصال أو خطأ سيرفر: لا نغيّر الحالة (انظر ملاحظة الإنترنت أعلاه)
            } finally {
                inFlight = false;
            }
            if (result == null) return;

            banned = result;
            if (!result) return;
            Activity act = ref.get();
            if (act != null && !act.isFinishing()) act.runOnUiThread(() -> showBlocked(act));
        }, "almezo-device-ban").start();
    }

    /** true = محظور نهائياً، false = غير محظور، null = تعذّر الحكم. */
    private static Boolean fetchPermanentBan(String id) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("action", "check");
        payload.put("hw", id);
        JSONObject body = new JSONObject();
        body.put("data", payload);

        HttpURLConnection c = (HttpURLConnection) URI.create(guardUrl()).toURL().openConnection();
        try {
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] out = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(out);
            }
            if (c.getResponseCode() != 200) return null;
            String resp;
            try (InputStream is = c.getInputStream()) {
                resp = readAll(is);
            }
            JSONObject r = new JSONObject(resp).optJSONObject("result");
            if (r == null) return null;
            return r.optBoolean("permanent", false);
        } finally {
            c.disconnect();
        }
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    /** نسخة التطوير وحدها توجَّه لسيرفر اختبار محلي (DebugServers في مجلد debug فقط). */
    private static String guardUrl() {
        try {
            Class<?> dbg = Class.forName("com.almezo.servers.nat.DebugServers");
            Object u = dbg.getMethod("guardUrl").invoke(null);
            if (u instanceof String && !((String) u).isEmpty()) return (String) u;
        } catch (Throwable ignored) { }
        return GUARD_URL;
    }

    private static void showBlocked(Activity a) {
        if (a.isFinishing() || a.isDestroyed()) return;
        Activity owner = dialogOwner != null ? dialogOwner.get() : null;
        AlertDialog shown = dialogRef != null ? dialogRef.get() : null;
        if (owner == a && shown != null && shown.isShowing()) return;
        boolean en = Lang.isEnglish(a);
        String id = DeviceId.get(a);
        AlertDialog dlg = new AlertDialog.Builder(a)
                .setTitle(en ? "This device has been blocked" : "تم حظر هذا الجهاز")
                .setMessage(en
                        ? "Access from this device has been blocked by the administration.\n\nDevice ID: " + id
                        : "تم منع هذا الجهاز من استخدام سيرفرات الميزو بقرار من الإدارة.\n\nللتواصل مع الإدارة أرسل لهم معرّف الجهاز:\n" + id)
                .setCancelable(false)
                .setPositiveButton(en ? "Close" : "إغلاق", (d, w) -> a.finishAffinity())
                .create();
        dialogOwner = new WeakReference<>(a);
        dialogRef = new WeakReference<>(dlg);
        dlg.show();
    }
}
