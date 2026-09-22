package com.almezo.servers.nat;

import com.almezo.servers.R;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * خريطة أكواد السيرفرات، منقولة حرفياً من handleServerCode في splayer.js (وهي
 * الخريطة التي
 * يستخدمها المشغل فعلياً). ملاحظة: servers.json يذكر هوستاً مختلفاً للكود 002،
 * والمعتمد هنا
 * هو ما يستخدمه المشغل الحالي.
 */
public final class Servers {

    public static final class Server {
        public final String code;
        public final String host;
        public final String name;
        public final int logoRes;

        Server(String code, String host, String name, int logoRes) {
            this.code = code;
            this.host = host;
            this.name = name;
            this.logoRes = logoRes;
        }
    }

    private static final Map<String, Server> MAP = new LinkedHashMap<>();

    static {
        add("001", "http://cafott.com", "سيرفر اكس", R.drawable.srv_x);
        add("002", "http://nv2egy.com:80", "سيرفر نوفا", R.drawable.srv_nova);
        add("003", "http://mar22.sbs", "سيرفر مارفل", R.drawable.srv_marvel);
        add("004", "http://pk8dkz.mvten.net", "سيرفر مافين", R.drawable.srv_maven);
        add("005", "http://mgtv.pro", "سيرفر ميجا", R.drawable.srv_mega);
        add("006", "http://n1.new2027.xyz:80", "سيرفر نينجا", R.drawable.srv_ninja);
        add("007", "http://24.mhpro1.xyz:80", "سيرفر MH", R.drawable.srv_mh);

        // سيرفر الاختبار المحلي: يوجد صنفه في مجلد debug فقط، فلا يظهر هذا الكود في
        // نسخة الإصدار
        try {
            Class<?> dbg = Class.forName("com.almezo.servers.nat.DebugServers");
            String[] t = (String[]) dbg.getMethod("testServer").invoke(null);
            if (t != null)
                add(t[0], t[1], t[2], R.drawable.almezo_logo);
        } catch (Throwable ignored) {
        }
    }

    private static void add(String code, String host, String name, int logo) {
        MAP.put(code, new Server(code, host, name, logo));
    }

    private Servers() {
    }

    /** يقبل الأرقام العربية الهندية (٠٠١) كما في الويب. */
    public static String normalizeCode(String raw) {
        if (raw == null)
            return "";
        StringBuilder sb = new StringBuilder();
        for (char c : raw.trim().toCharArray()) {
            if (c >= '٠' && c <= '٩')
                sb.append((char) ('0' + (c - '٠')));
            else
                sb.append(c);
        }
        return sb.toString();
    }

    public static Server find(String code) {
        return MAP.get(normalizeCode(code));
    }
}
