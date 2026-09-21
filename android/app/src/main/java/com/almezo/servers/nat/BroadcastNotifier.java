package com.almezo.servers.nat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.almezo.servers.MainActivity;
import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * إشعارات المدير (broadcast_notifications) في شريط إشعارات أندرويد.
 *
 * كان المستمع الوحيد لها في صفحة الويب داخل التطبيق، فلا يصل الإشعار إلا إن كانت تلك
 * الصفحة تعمل لحظة الإرسال: لا شيء والمستخدم داخل المشغل الأصلي، ولا شيء والتطبيق مغلق.
 * هنا يجلب التطبيق نفسه آخر الإشعارات من واجهة Firestore العامة (المجموعة مقروءة للجميع في
 * firestore.rules) عند فتح أي شاشة، وكل 15 دقيقة عبر JobScheduler حتى والتطبيق مغلق —
 * بلا FCM وبلا أي مكتبة إضافية.
 *
 * كل إشعار يُعرض مرة واحدة فقط مهما وصل إليه: الويب والفحص الأصلي يتشاركان سجلاً واحداً
 * للمعرّفات المعروضة (markSeen).
 */
public final class BroadcastNotifier {

    private static final String TAG = "BroadcastNotifier";
    public static final String CHANNEL_ID = "almezo_broadcast_channel";
    private static final String PREFS = "almezo_broadcast";
    private static final String KEY_SEEN = "seen_ids";
    private static final String KEY_LAST_TS = "last_ts";
    private static final int JOB_ID = 0x4D5A;
    private static final long WINDOW_MS = 48L * 60 * 60 * 1000;
    private static final long MIN_CHECK_GAP_MS = 60_000;
    private static final String QUERY_URL =
            "https://firestore.googleapis.com/v1/projects/almez0-servers/databases/(default)/documents:runQuery";

    private static volatile long lastCheckAt = 0;
    private static volatile boolean scheduled = false;

    private BroadcastNotifier() { }

    /** فحص في الخلفية عند فتح شاشة، بحد أدنى دقيقة بين فحص وآخر. */
    public static void checkAsync(Context context) {
        final Context app = context.getApplicationContext();
        long now = System.currentTimeMillis();
        if (now - lastCheckAt < MIN_CHECK_GAP_MS) return;
        lastCheckAt = now;
        new Thread(() -> checkNow(app), "broadcast-check").start();
    }

    /** فحص متزامن: يُستدعى من خيط خلفي فقط. */
    static void checkNow(Context context) {
        try {
            JSONArray rows = new JSONArray(post(queryUrl(),
                    "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"broadcast_notifications\"}],"
                            + "\"orderBy\":[{\"field\":{\"fieldPath\":\"timestamp\"},\"direction\":\"DESCENDING\"}],"
                            + "\"limit\":5}}"));
            List<JSONObject> fresh = new ArrayList<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject doc = rows.getJSONObject(i).optJSONObject("document");
                if (doc == null) continue;
                JSONObject f = doc.optJSONObject("fields");
                if (f == null) continue;
                long ts = longField(f, "timestamp");
                if (ts <= 0 || now - ts > WINDOW_MS) continue;
                if (f.has("active") && !f.getJSONObject("active").optBoolean("booleanValue", true)) continue;
                String name = doc.optString("name");
                String id = name.substring(name.lastIndexOf('/') + 1);
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("ts", ts);
                item.put("title", stringField(f, "title"));
                item.put("message", stringField(f, "message"));
                item.put("url", stringField(f, "actionUrl"));
                fresh.add(item);
            }
            // من الأقدم للأحدث، فيظهر آخر إشعار في أعلى الشريط
            Collections.reverse(fresh);
            for (JSONObject n : fresh) {
                if (markSeen(context, n.getString("id"), n.getLong("ts"))) {
                    show(context, n.getString("id"), n.getString("title"), n.getString("message"), n.getString("url"));
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "broadcast check failed", t);
        }
    }

    /**
     * يسجّل الإشعار معروضاً، ويعيد true إن لم يُعرض من قبل. إشعار أقدم من آخر معروض يُعدّ
     * معروضاً أيضاً، حتى لا تظهر الإشعارات القديمة من جديد بعد مسح السجل.
     */
    public static synchronized boolean markSeen(Context context, String id, long ts) {
        if (id == null || id.isEmpty()) return false;
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String seen = p.getString(KEY_SEEN, "");
        if (("," + seen + ",").contains("," + id + ",")) return false;
        long lastTs = p.getLong(KEY_LAST_TS, 0);
        String updated = seen.isEmpty() ? id : seen + "," + id;
        // آخر 30 معرّفاً تكفي: النافذة 48 ساعة
        String[] parts = updated.split(",");
        if (parts.length > 30) {
            StringBuilder sb = new StringBuilder();
            for (int i = parts.length - 30; i < parts.length; i++) {
                if (sb.length() > 0) sb.append(',');
                sb.append(parts[i]);
            }
            updated = sb.toString();
        }
        p.edit().putString(KEY_SEEN, updated).putLong(KEY_LAST_TS, Math.max(lastTs, ts)).apply();
        return lastTs == 0 || ts >= lastTs;
    }

    public static void show(Context context, String id, String title, String message, String actionUrl) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            ensureChannel(manager);
            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (actionUrl != null && !actionUrl.trim().isEmpty()) intent.putExtra("actionUrl", actionUrl.trim());
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            int code = id != null ? id.hashCode() : (int) System.currentTimeMillis();
            PendingIntent pi = PendingIntent.getActivity(context, code, intent, flags);
            String body = message != null ? message : "";
            NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title != null && !title.isEmpty() ? title : "سيرفرات الميزو")
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setAutoCancel(true)
                    .setContentIntent(pi);
            manager.notify(code, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "show failed", t);
        }
    }

    public static void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "تنبيهات سيرفرات الميزو",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("إشعارات وتحديثات سيرفرات الميزو");
        channel.enableLights(true);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    /** فحص دوري كل 15 دقيقة (أقل مدة يسمح بها النظام) حتى والتطبيق مغلق. */
    public static void schedule(Context context) {
        if (scheduled) return;
        scheduled = true;
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
            JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(context, BroadcastJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15 * 60 * 1000L);
            if (context.checkCallingOrSelfPermission(android.Manifest.permission.RECEIVE_BOOT_COMPLETED)
                    == PackageManager.PERMISSION_GRANTED) {
                b.setPersisted(true);
            }
            js.schedule(b.build());
        } catch (Throwable t) {
            Log.w(TAG, "schedule failed", t);
        }
    }

    /** نسخة التطوير وحدها توجَّه لسيرفر اختبار محلي (DebugServers في مجلد debug فقط). */
    private static String queryUrl() {
        try {
            Class<?> dbg = Class.forName("com.almezo.servers.nat.DebugServers");
            Object u = dbg.getMethod("broadcastQueryUrl").invoke(null);
            if (u instanceof String && !((String) u).isEmpty()) return (String) u;
        } catch (Throwable ignored) { }
        return QUERY_URL;
    }

    private static String post(String url, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
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

    private static String stringField(JSONObject f, String key) {
        JSONObject v = f.optJSONObject(key);
        return v == null ? "" : v.optString("stringValue", "");
    }

    private static long longField(JSONObject f, String key) {
        JSONObject v = f.optJSONObject(key);
        if (v == null) return 0;
        if (v.has("integerValue")) {
            try { return Long.parseLong(v.optString("integerValue", "0")); } catch (Exception e) { return 0; }
        }
        if (v.has("doubleValue")) return (long) v.optDouble("doubleValue", 0);
        return 0;
    }
}
