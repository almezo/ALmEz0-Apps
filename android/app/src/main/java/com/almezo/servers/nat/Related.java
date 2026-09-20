package com.almezo.servers.nat;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * شريط "رائجة للمشاهدة الآن" في صفحتي الفيلم والمسلسل: أعمال من نفس النوع (التصنيف) ونفس
 * البلد/اللغة للعمل المفتوح، بدل أول 20 عنصراً في القائمة أياً كان نوعها.
 *
 * - التصنيف: يُفهم بالعربية والإنجليزية ("Action, Drama" = "أكشن، دراما")، ويُقدَّم العمل الذي
 *   يشترك في كل تصنيفات العمل المفتوح على من يشترك في بعضها، ولا يظهر عمل بلا أي تصنيف مشترك.
 * - البلد/اللغة: عمل أمريكي لا يقترح إلا أعمالاً أمريكية، والعربي عربية، وهكذا.
 * - قائمة الأفلام في Xtream لا تحمل التصنيف ولا البلد، فنجلبهما من get_vod_info لعدد محدود من
 *   المرشحين (نفس القسم أولاً، ثم الأحدث)، ونحفظهما على القرص حتى لا يُعاد طلبهما لاحقاً.
 */
public final class Related {

    /** خيطان: البوابة المركزية في Xtream تكبح المعدل أصلاً، وهذا يقلّل الطلبات المعلّقة. */
    private static final ExecutorService META_IO = Executors.newFixedThreadPool(2);
    private static final int BATCH = 16;
    private static final Map<String, Map<String, String[]>> META = new HashMap<>();

    private Related() { }

    /** يُستدعى من خيط خلفي. */
    public static List<Models.Item> similar(Context ctx, Xtream api, String accountId, String type,
                                            String currentId, String currentGenre, String currentCountry, int limit) {
        List<Models.Item> all;
        try {
            all = api.streams(type, false);
        } catch (Exception e) {
            return new ArrayList<>();
        }
        Models.Item current = null;
        for (Models.Item it : all) if (currentId != null && currentId.equals(it.id)) { current = it; break; }
        String curCat = current != null ? current.categoryId : null;
        boolean curArabic = current != null && hasArabic(current.safeName());
        Set<String> curGenres = genres(firstNonEmpty(currentGenre, current != null ? current.genre : null));
        String curCountry = country(currentCountry);

        // المرشحون: نفس لغة العنوان (عربي/غير عربي)، نفس القسم أولاً ثم الأحدث إضافة
        List<Models.Item> pool = new ArrayList<>();
        for (Models.Item it : all) {
            if (it.id == null || it.id.equals(currentId)) continue;
            if (current != null && hasArabic(it.safeName()) != curArabic) continue;
            pool.add(it);
        }
        final String cat = curCat;
        Collections.sort(pool, (a, b) -> {
            boolean sa = cat != null && cat.equals(a.categoryId), sb = cat != null && cat.equals(b.categoryId);
            if (sa != sb) return sa ? -1 : 1;
            if (a.added != b.added) return Long.compare(b.added, a.added);
            return Float.compare(b.rating, a.rating);
        });

        if (curGenres.isEmpty()) {
            // تصنيف العمل غير معروف: أقرب بديل صادق هو نفس القسم ونفس اللغة
            List<Models.Item> out = new ArrayList<>();
            for (Models.Item it : pool) {
                if (cat != null && !cat.equals(it.categoryId)) break;
                out.add(it);
                if (out.size() >= limit) break;
            }
            return out;
        }

        return rankByGenre(ctx, api, accountId, type, pool, curGenres, curCountry, cat, limit,
                Models.VOD.equals(type) ? BATCH * 4 : BATCH * 2);
    }

    /**
     * يرتّب المرشحين (بترتيبهم المعطى) حسب التطابق مع التصنيفات والبلد المطلوبة، ويجلب تصنيف
     * وبلد من لا يحملهما على دفعات حتى يكتمل العدد أو يُستنفد حد الفحص. يُستدعى من خيط خلفي.
     * يُستخدم لشريط "الرائجة" ولاقتراحات مساعد الميزو ("فيلم رعب أمريكي" مثلاً).
     */
    public static List<Models.Item> rankByGenre(Context ctx, Xtream api, String accountId, String type,
                                                List<Models.Item> pool, Set<String> wantGenres, String wantCountry,
                                                String preferCategory, int limit, int maxChecks) {
        if (wantGenres.isEmpty() && wantCountry == null) {
            return new ArrayList<>(pool.subList(0, Math.min(limit, pool.size())));
        }
        Map<String, String[]> meta = metaFor(ctx, accountId, type);
        List<Scored> matches = new ArrayList<>();
        int checked = 0;
        for (int start = 0; start < pool.size() && checked < maxChecks; start += BATCH) {
            List<Models.Item> batch = pool.subList(start, Math.min(pool.size(), start + BATCH));
            fetchMissing(api, type, batch, meta, wantCountry != null);
            checked += batch.size();
            for (Models.Item it : batch) {
                String[] m = meta.get(it.id);
                int overlap = 0;
                if (!wantGenres.isEmpty()) {
                    for (String x : genres(firstNonEmpty(it.genre, m != null ? m[0] : null))) {
                        if (wantGenres.contains(x)) overlap++;
                    }
                    if (overlap == 0) continue;
                }
                String cc = country(m != null ? m[1] : null);
                if (wantCountry != null && cc != null && !cc.equals(wantCountry)) continue;
                float score = overlap * 10f
                        + (!wantGenres.isEmpty() && overlap == wantGenres.size() ? 6f : 0f)
                        + (wantCountry != null && wantCountry.equals(cc) ? 4f : 0f)
                        + (preferCategory != null && preferCategory.equals(it.categoryId) ? 3f : 0f)
                        + Math.min(10f, it.rating) * 0.3f;
                matches.add(new Scored(it, score));
            }
            if (matches.size() >= limit) break;
        }
        saveMeta(ctx, accountId, type, meta);

        Collections.sort(matches, (a, b) -> {
            if (a.score != b.score) return Float.compare(b.score, a.score);
            return Long.compare(b.item.added, a.item.added);
        });
        List<Models.Item> out = new ArrayList<>();
        for (Scored s : matches) {
            out.add(s.item);
            if (out.size() >= limit) break;
        }
        return out;
    }

    private static final class Scored {
        final Models.Item item;
        final float score;
        Scored(Models.Item item, float score) { this.item = item; this.score = score; }
    }

    // ------------------------------------------------------------------ التصنيف والبلد

    private static final Map<String, String[]> GENRE_KEYS = new LinkedHashMap<>();
    static {
        GENRE_KEYS.put("action", new String[]{"action", "اكشن", "حركه"});
        GENRE_KEYS.put("adventure", new String[]{"adventure", "مغامر"});
        GENRE_KEYS.put("animation", new String[]{"animation", "animated", "anime", "cartoon", "رسوم متحركه", "انمي", "كرتون", "انيميشن"});
        GENRE_KEYS.put("comedy", new String[]{"comedy", "كوميد"});
        GENRE_KEYS.put("crime", new String[]{"crime", "جريمه", "جرائم"});
        GENRE_KEYS.put("documentary", new String[]{"documentary", "وثائقي"});
        GENRE_KEYS.put("drama", new String[]{"drama", "دراما"});
        GENRE_KEYS.put("family", new String[]{"family", "عائلي", "اسري"});
        GENRE_KEYS.put("fantasy", new String[]{"fantasy", "فانتازيا"});
        GENRE_KEYS.put("history", new String[]{"history", "historical", "تاريخ"});
        GENRE_KEYS.put("horror", new String[]{"horror", "رعب"});
        GENRE_KEYS.put("music", new String[]{"music", "musical", "موسيق"});
        GENRE_KEYS.put("mystery", new String[]{"mystery", "غموض"});
        GENRE_KEYS.put("romance", new String[]{"romance", "romantic", "رومانس"});
        GENRE_KEYS.put("scifi", new String[]{"sci fi", "science fiction", "scifi", "خيال علمي"});
        GENRE_KEYS.put("thriller", new String[]{"thriller", "suspense", "اثاره", "تشويق"});
        GENRE_KEYS.put("war", new String[]{"war", "حرب"});
        GENRE_KEYS.put("western", new String[]{"western", "غرب امريكي"});
        GENRE_KEYS.put("biography", new String[]{"biography", "سيره ذاتيه"});
        GENRE_KEYS.put("sport", new String[]{"sport", "sports", "رياض"});
        GENRE_KEYS.put("kids", new String[]{"kids", "children", "اطفال"});
    }

    /** مجموعة التصنيفات الموحّدة من نص التصنيف (عربي أو إنجليزي). */
    static Set<String> genres(String raw) {
        Set<String> out = new HashSet<>();
        if (raw == null || raw.trim().isEmpty() || "null".equals(raw)) return out;
        String n = " " + BrowseActivity.normalize(raw).replaceAll("[,|/&،;()]", " ").replaceAll("\\s+", " ") + " ";
        for (Map.Entry<String, String[]> e : GENRE_KEYS.entrySet()) {
            for (String kw : e.getValue()) {
                boolean latin = kw.charAt(0) < 0x0600;
                // الكلمات الإنجليزية تُطابق ككلمة كاملة (حتى لا تُطابق war داخل award مثلاً)
                if (latin ? n.contains(" " + kw + " ") : n.contains(kw)) { out.add(e.getKey()); break; }
            }
        }
        return out;
    }

    /** رمز موحّد للبلد الأول في النص ("United States of America" = "USA" = "أمريكا" = us). */
    static String country(String raw) {
        if (raw == null) return null;
        String first = raw.split("[,|/،]")[0];
        String n = BrowseActivity.normalize(first);
        if (n.isEmpty() || "null".equals(n)) return null;
        if (n.equals("us") || n.equals("usa") || n.startsWith("united states") || n.contains("america") || n.contains("امريك") || n.contains("الولايات المتحده")) return "us";
        if (n.equals("uk") || n.equals("gb") || n.contains("united kingdom") || n.contains("britain") || n.contains("england") || n.contains("بريطاني") || n.contains("المملكه المتحده")) return "uk";
        String[][] aliases = {
                {"eg", "egypt", "مصر"}, {"sa", "saudi", "سعود"}, {"sy", "syria", "سوري"}, {"lb", "leban", "لبنان"},
                {"ae", "emirates", "امارات"}, {"kw", "kuwait", "كويت"}, {"iq", "iraq", "عراق"}, {"jo", "jordan", "اردن"},
                {"ma", "morocco", "مغرب"}, {"tn", "tunisia", "تونس"}, {"dz", "algeria", "جزائر"}, {"ly", "libya", "ليبيا"},
                {"tr", "turk", "ترك"}, {"in", "india", "هند"}, {"kr", "korea", "كوري"}, {"jp", "japan", "يابان"},
                {"cn", "china", "صين"}, {"fr", "france", "فرنس"}, {"de", "germany", "المان"}, {"es", "spain", "اسبان"},
                {"it", "italy", "ايطال"}, {"ca", "canada", "كندا"}, {"au", "australia", "استرال"}, {"ph", "philippines", "فلبين"},
                {"mx", "mexico", "مكسيك"}, {"ru", "russia", "روسي"}, {"ir", "iran", "ايران"}, {"br", "brazil", "برازيل"},
        };
        for (String[] a : aliases) if (n.contains(a[1]) || n.contains(a[2])) return a[0];
        return n;
    }

    static boolean hasArabic(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '؀' && c <= 'ۿ') return true;
        }
        return false;
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty() && !"null".equals(a)) return a;
        return b;
    }

    // ------------------------------------------------------------------ بيانات المرشحين

    /** يجلب التصنيف والبلد للعناصر التي لا تحملهما، بالتوازي وبمهلة محدودة. */
    private static void fetchMissing(Xtream api, String type, List<Models.Item> batch, Map<String, String[]> meta, boolean needCountry) {
        List<Callable<Void>> jobs = new ArrayList<>();
        for (Models.Item it : batch) {
            if (meta.containsKey(it.id)) continue;
            // التصنيف موجود في القائمة نفسها ولا حاجة للبلد: لا داعي لطلب إضافي
            if (it.genre != null && !it.genre.trim().isEmpty() && !needCountry) continue;
            final String id = it.id;
            jobs.add(() -> {
                try {
                    JSONObject root = Models.SERIES.equals(type) ? api.seriesInfo(id) : api.vodInfo(id);
                    JSONObject info = root.optJSONObject("info");
                    String g = info != null ? info.optString("genre", "") : "";
                    String c = info != null ? info.optString("country", "") : "";
                    meta.put(id, new String[]{g, c});
                } catch (Exception ignored) { }
                return null;
            });
        }
        if (jobs.isEmpty()) return;
        try {
            META_IO.invokeAll(jobs, 12, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static File metaFile(Context ctx, String accountId, String type) {
        File dir = new File(ctx.getCacheDir(), "xtream");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "related_" + Integer.toHexString(String.valueOf(accountId).hashCode()) + "_" + type + ".json");
    }

    private static Map<String, String[]> metaFor(Context ctx, String accountId, String type) {
        String key = accountId + "|" + type;
        synchronized (META) {
            Map<String, String[]> m = META.get(key);
            if (m != null) return m;
            // قد تكمل طلبات تجاوزت المهلة كتابتها لاحقاً أثناء القراءة، لذا خريطة آمنة للتزامن
            m = new ConcurrentHashMap<>();
            File f = metaFile(ctx, accountId, type);
            if (f.exists()) {
                try (InputStream in = new FileInputStream(f)) {
                    byte[] buf = new byte[(int) f.length()];
                    int off = 0, n;
                    while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
                    JSONObject o = new JSONObject(new String(buf, 0, off, StandardCharsets.UTF_8));
                    Iterator<String> keys = o.keys();
                    while (keys.hasNext()) {
                        String id = keys.next();
                        String v = o.optString(id, "");
                        int sep = v.indexOf('\u0001');
                        m.put(id, sep < 0 ? new String[]{v, ""} : new String[]{v.substring(0, sep), v.substring(sep + 1)});
                    }
                } catch (Exception ignored) { }
            }
            META.put(key, m);
            return m;
        }
    }

    private static void saveMeta(Context ctx, String accountId, String type, Map<String, String[]> meta) {
        try {
            JSONObject o = new JSONObject();
            for (Map.Entry<String, String[]> e : meta.entrySet()) {
                o.put(e.getKey(), e.getValue()[0] + '\u0001' + e.getValue()[1]);
            }
            File f = metaFile(ctx, accountId, type);
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(o.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (f.exists()) f.delete();
            tmp.renameTo(f);
        } catch (Exception ignored) { }
    }
}
