package com.almezo.servers.nat;

/**
 * سيرفر اختبار محلي — موجود في نسخة التطوير (debug) فقط، ولا يُضمَّن أبداً في نسخة الإصدار.
 * يسمح باختبار كل شاشات المشغل الأصلي في المحاكي (10.0.2.2 = جهاز الكمبيوتر المضيف).
 */
public final class DebugServers {
    private DebugServers() { }

    public static String[] testServer() {
        return new String[]{"999", "http://10.0.2.2:8765", "سيرفر تجريبي"};
    }
}
