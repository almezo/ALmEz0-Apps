package com.almezo.servers.nat;

import android.content.Context;
import android.provider.Settings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * معرّف ثابت وفريد لهذا الجهاز، يستخدمه الحظر وسجلات غرفة المراقبة.
 *
 * البصمة القديمة (getHardwareFingerprint في الويب) كانت تُحسب من صفات عامة يشترك فيها
 * آلاف الأجهزة (دقة الشاشة، الأنوية، اللغة...)، فكان حظر جهاز واحد يصيب كل جهاز مطابق له.
 * ANDROID_ID يولّده النظام عشوائياً لكل جهاز، ويصمد أمام مسح بيانات التطبيق وإعادة
 * تثبيته (لا يتغيّر إلا بإعادة ضبط المصنع)، فلا يُرفع الحظر بضغطة "مسح البيانات".
 *
 * يُرسل مجزّأً (SHA-256) لا خاماً، فلا يغادر الجهاز معرّف النظام نفسه.
 * يطابق التنسيق المعتمد في الويب والسيرفر: AD- ثم 32 خانة hex (35 حرفاً، أقل من حد 40).
 */
public final class DeviceId {

    /** قيمة معروفة مكرّرة في أجهزة أندرويد 2.2 القديمة المعيبة: ليست فريدة فلا تُعتمد. */
    private static final String KNOWN_BAD_ID = "9774d56d682e549c";

    private static volatile String cached;

    private DeviceId() { }

    /** يعيد "AD-..." أو نصاً فارغاً إن تعذّر (فيولّد الويب معرّفاً عشوائياً بديلاً). */
    public static String get(Context ctx) {
        String c = cached;
        if (c != null) return c;
        String id = "";
        try {
            String raw = Settings.Secure.getString(
                    ctx.getApplicationContext().getContentResolver(), Settings.Secure.ANDROID_ID);
            if (raw != null) raw = raw.trim().toLowerCase(Locale.US);
            if (raw != null && !raw.isEmpty() && !KNOWN_BAD_ID.equals(raw)) {
                id = "AD-" + sha256Hex32("almezo-device-v1:" + raw);
            }
        } catch (Throwable ignored) { }
        cached = id;
        return id;
    }

    /** أول 16 بايت من SHA-256 بصيغة hex كبيرة (32 خانة). */
    static String sha256Hex32(String s) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(32);
        for (int i = 0; i < 16; i++) sb.append(String.format(Locale.US, "%02X", d[i]));
        return sb.toString();
    }
}
