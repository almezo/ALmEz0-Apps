package com.almezo.servers.nat;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * استقبال إشعارات المدير فوراً عبر FCM، حتى والتطبيق مغلق.
 *
 * دالة pushBroadcastNotification في functions/index.js ترسل كل إشعار جديد إلى موضوع
 * "broadcast" كرسالة بيانات (data) لا رسالة عرض، فيصل إلى هنا في كل الحالات ونعرضه نحن:
 * بنفس القناة والشكل، وبنفس سجل المعروض المشترك مع الفحص الدوري وصفحة الويب
 * (BroadcastNotifier.markSeen)، فلا يظهر الإشعار مرتين مهما وصل من أكثر من طريق.
 */
public class PushService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        String title = null;
        String body = null;
        String id = null;
        String actionUrl = null;
        long ts = 0;

        if (d != null && !d.isEmpty()) {
            id = d.get("id");
            title = d.get("title");
            body = d.get("message");
            actionUrl = d.get("actionUrl");
            try { ts = Long.parseLong(d.get("ts")); } catch (Exception ignored) { }
        }
        if (message.getNotification() != null) {
            RemoteMessage.Notification n = message.getNotification();
            if (title == null || title.isEmpty()) title = n.getTitle();
            if (body == null || body.isEmpty()) body = n.getBody();
        }
        if (id == null || id.isEmpty()) {
            id = "alert_" + (ts > 0 ? ts : System.currentTimeMillis());
        }
        if (BroadcastNotifier.isAppForeground()) {
            // المستخدم داخل التطبيق بالفعل والواجهة تعرض البانر الداخلي: نسجل الإشعار كمرئي فقط دون عرضه في شريط النظام
            BroadcastNotifier.markSeen(this, id, ts);
            return;
        }
        if (BroadcastNotifier.markSeen(this, id, ts)) {
            BroadcastNotifier.show(this, id, title, body, actionUrl);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // لا نحتاج الرمز: الإرسال عبر موضوع "broadcast" لا إلى أجهزة بعينها
        BroadcastNotifier.subscribePush(this);
    }
}
