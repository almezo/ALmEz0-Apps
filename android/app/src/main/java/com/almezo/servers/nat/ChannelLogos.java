package com.almezo.servers.nat;

import android.content.Context;
import android.util.JsonReader;
import android.util.JsonToken;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.TreeMap;

/**
 * شعارات القنوات من فهرس مدمج في التطبيق (assets/channel_logos.json).
 *
 * أغلب سيرفرات Xtream لا ترسل شعاراً للقناة (stream_icon فارغ)، فتظهر كل القنوات بالشعار
 * الافتراضي مهما جرّب العميل من سيرفرات. الفهرس يربط اسم القناة المُطبَّع برابط شعارها من
 * قاعدة iptv-org المفتوحة (نحو 36 ألف اسم لـ30 ألف قناة)، ويُبنى بـscripts/build-channel-logos.js.
 *
 * يُحمَّل مرة واحدة وعند الحاجة فقط (أول تصفّح للبث المباشر)، وفي خيط خلفي، فلا يؤخّر أي شاشة.
 */
public final class ChannelLogos {

    private static final String ASSET = "channel_logos.json";
    private static volatile TreeMap<String, String> index;
    private static volatile boolean loading = false;

    private ChannelLogos() { }

    /** تحميل الفهرس مسبقاً في الخلفية قبل أن يحتاجه العرض (يُستدعى عند فتح البث المباشر). */
    public static void preload(final Context ctx) {
        if (index != null || loading) return;
        loading = true;
        final Context app = ctx.getApplicationContext();
        Xtream.IO.execute(() -> {
            try {
                index = load(app);
            } catch (Throwable t) {
                index = new TreeMap<>(); // فشل التحميل: نكمل بالشعار الافتراضي بلا تعطيل
            } finally {
                loading = false;
            }
        });
    }

    private static TreeMap<String, String> load(Context app) throws Exception {
        TreeMap<String, String> map = new TreeMap<>();
        try (InputStream in = app.getAssets().open(ASSET);
             JsonReader r = new JsonReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            r.beginObject();
            while (r.hasNext()) {
                String key = r.nextName();
                if (r.peek() == JsonToken.STRING) map.put(key, r.nextString());
                else r.skipValue();
            }
            r.endObject();
        }
        return map;
    }

    /**
     * رابط شعار القناة من الفهرس، أو null إن لم تُعرف.
     * يُستدعى من خيط العرض، ويعيد null بسرعة ما دام الفهرس لم يُحمَّل بعد.
     */
    public static String logoFor(String channelName) {
        TreeMap<String, String> m = index;
        if (m == null || m.isEmpty()) return null;
        String q = normalize(channelName);
        if (q.length() < 3) return null;

        String exact = m.get(q);
        if (exact != null) return exact;

        // "beIN Sports 1 Premium" -> أطول مفتاح يبدأ به الاسم ("bein sports 1")
        String k = m.floorKey(q);
        if (k != null && k.length() >= 5 && q.startsWith(k)) return m.get(k);
        return null;
    }

    /**
     * نفس التطبيع المستعمل في بناء الفهرس: حروف صغيرة، بلا تشكيل ولا رموز، وبلا بادئة الدولة
     * ولواحق الجودة التي تضيفها اللوحات مثل "AR| beIN Sports 1 FHD".
     */
    static String normalize(String name) {
        if (name == null) return "";
        String s = name.trim().toLowerCase(java.util.Locale.ROOT);
        s = s.replaceFirst("^[a-z]{2,3}\\s*[|:\\-]\\s*", "");
        s = s.replaceFirst("^\\[[^\\]]*\\]\\s*", "");
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == 'ـ' || (c >= 'ً' && c <= 'ْ')) continue;   // تطويل وتشكيل
            if (c == 'آ' || c == 'أ' || c == 'إ') c = 'ا'; // آ أ إ -> ا
            else if (c == 'ة') c = 'ه';                              // ة -> ه
            else if (c == 'ى') c = 'ي';                              // ى -> ي
            if (Character.isLetterOrDigit(c)) sb.append(c);
            else sb.append(' ');
        }
        String out = sb.toString().replaceAll(
                "\\b(hd|fhd|uhd|sd|4k|8k|1080p?|720p?|h265|hevc|raw|backup|multi|vip|plus)\\b", " ");
        return out.replaceAll("\\s+", " ").trim();
    }
}
