package com.almezo.servers.nat;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * التخزين المحلي للمشغل الأصلي: الحسابات، الحساب النشط، المفضلة، متابعة المشاهدة،
 * وأوقات آخر تحديث. نفس مفاتيح ومنطق localStorage في مشغل الويب.
 */
public final class Store {

    private static final String PREFS = "almezo_native_player";
    /**
     * نقاط الاستئناف في ملف مستقل بسقف. كانت في ملف الإعدادات الرئيسي بلا حذف أبداً، والمشغل
     * يحفظ كل 10 ثوانٍ، وكل حفظ يعيد كتابة الملف كله (الحسابات والمفضلة ومئات النقاط القديمة).
     */
    private static final String POS_PREFS = "almezo_positions";
    private static final int MAX_POSITIONS = 400;
    private static boolean positionsMigrated;
    private static int positionSaves;
    private final SharedPreferences sp;
    private final SharedPreferences pos;

    public Store(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        pos = ctx.getApplicationContext().getSharedPreferences(POS_PREFS, Context.MODE_PRIVATE);
        migratePositions();
    }

    /** نقل نقاط الاستئناف القديمة من الملف الرئيسي مرة واحدة (بلا فقدان لما شاهده العميل). */
    private void migratePositions() {
        synchronized (Store.class) {
            if (positionsMigrated) return;
            positionsMigrated = true;
            if (sp.getBoolean("positions_moved", false)) return;
            SharedPreferences.Editor main = sp.edit();
            SharedPreferences.Editor dst = pos.edit();
            for (java.util.Map.Entry<String, ?> e : sp.getAll().entrySet()) {
                if (e.getKey().startsWith("pos_") && e.getValue() instanceof String) {
                    dst.putString(e.getKey(), e.getValue() + "|0");
                    main.remove(e.getKey());
                }
            }
            dst.apply();
            main.putBoolean("positions_moved", true).apply();
        }
    }

    /** يحذف أقدم النقاط (بوقت آخر حفظ) حين يتجاوز العدد السقف. */
    private void prunePositions() {
        java.util.Map<String, ?> all = pos.getAll();
        if (all.size() <= MAX_POSITIONS) return;
        List<java.util.Map.Entry<String, ?>> entries = new ArrayList<>(all.entrySet());
        java.util.Collections.sort(entries, (x, y) -> Long.compare(savedAt(x.getValue()), savedAt(y.getValue())));
        SharedPreferences.Editor ed = pos.edit();
        int drop = all.size() - MAX_POSITIONS * 3 / 4;
        for (int i = 0; i < drop; i++) ed.remove(entries.get(i).getKey());
        ed.apply();
    }

    private static long savedAt(Object v) {
        try {
            String s = String.valueOf(v);
            return Long.parseLong(s.substring(s.lastIndexOf('|') + 1));
        } catch (Exception e) {
            return 0L;
        }
    }

    // ---------------- الحسابات ----------------

    public List<Models.Account> accounts() {
        List<Models.Account> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(sp.getString("accounts", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                Models.Account a = new Models.Account();
                a.id = o.optString("id");
                a.serverCode = o.optString("serverCode");
                a.host = o.optString("host");
                a.username = o.optString("username");
                a.password = o.optString("password");
                a.userInfoJson = o.optString("userInfo", "{}");
                a.savedAt = o.optLong("savedAt");
                out.add(a);
            }
        } catch (Exception ignored) { }
        return out;
    }

    private void writeAccounts(List<Models.Account> list) {
        JSONArray arr = new JSONArray();
        for (Models.Account a : list) {
            try {
                JSONObject o = new JSONObject();
                o.put("id", a.id);
                o.put("serverCode", a.serverCode);
                o.put("host", a.host);
                o.put("username", a.username);
                o.put("password", a.password);
                o.put("userInfo", a.userInfoJson == null ? "{}" : a.userInfoJson);
                o.put("savedAt", a.savedAt);
                arr.put(o);
            } catch (Exception ignored) { }
        }
        sp.edit().putString("accounts", arr.toString()).apply();
    }

    /** يحفظ الحساب (أو يحدّثه إن كان موجوداً) ويجعله النشط، كما يفعل saveAccountToStorage في الويب. */
    public void saveAndActivate(Models.Account acc) {
        List<Models.Account> list = accounts();
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id.equals(acc.id)) { list.remove(i); break; }
        }
        list.add(0, acc);
        writeAccounts(list);
        sp.edit().putString("active_id", acc.id).putBoolean("logged_out", false).apply();
    }

    public void deleteAccount(String id) {
        List<Models.Account> list = accounts();
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id.equals(id)) { list.remove(i); break; }
        }
        writeAccounts(list);
        if (id.equals(sp.getString("active_id", ""))) sp.edit().remove("active_id").apply();
    }

    public void activate(String id) {
        sp.edit().putString("active_id", id).putBoolean("logged_out", false).apply();
    }

    public Models.Account active() {
        if (sp.getBoolean("logged_out", false)) return null;
        String id = sp.getString("active_id", "");
        for (Models.Account a : accounts()) if (a.id.equals(id)) return a;
        return null;
    }

    public void logout() {
        sp.edit().putBoolean("logged_out", true).apply();
    }

    // ---------------- المفضلة ومتابعة المشاهدة ----------------

    private List<String> readIds(String key) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(sp.getString(key, "[]"));
            for (int i = 0; i < arr.length(); i++) out.add(arr.getString(i));
        } catch (Exception ignored) { }
        return out;
    }

    private void writeIds(String key, List<String> ids) {
        JSONArray arr = new JSONArray();
        for (String s : ids) arr.put(s);
        sp.edit().putString(key, arr.toString()).apply();
    }

    private String scoped(String base, String type) {
        Models.Account a = active();
        return base + "_" + (a != null ? a.id : "none") + "_" + type;
    }

    public List<String> favorites(String type) {
        return readIds(scoped("favs", type));
    }

    public boolean isFavorite(String type, String id) {
        return favorites(type).contains(id);
    }

    /** @return true إذا أصبح العنصر في المفضلة */
    public boolean toggleFavorite(String type, String id) {
        List<String> ids = favorites(type);
        boolean nowFav;
        if (ids.contains(id)) { ids.remove(id); nowFav = false; }
        else { ids.add(0, id); nowFav = true; }
        writeIds(scoped("favs", type), ids);
        return nowFav;
    }

    public List<String> continueWatching(String type) {
        return readIds(scoped("continue", type));
    }

    public void recordContinueWatching(String type, String id) {
        List<String> ids = continueWatching(type);
        ids.remove(id);
        ids.add(0, id);
        while (ids.size() > 50) ids.remove(ids.size() - 1);
        writeIds(scoped("continue", type), ids);
    }

    // ---------------- نقطة التوقف (الاستئناف) ----------------

    /** يحفظ آخر موضع مشاهدة لعمل (فيلم أو حلقة) ومدته، لاستئنافه لاحقاً وعرض شريط التقدم. */
    public void savePosition(String key, long positionMs, long durationMs) {
        if (key == null || key.isEmpty()) return;
        // الصيغة: موضع|مدة|وقت الحفظ (الأخير لحذف الأقدم عند تجاوز السقف)
        pos.edit().putString(scoped("pos", key), positionMs + "|" + durationMs + "|" + System.currentTimeMillis()).apply();
        if (++positionSaves % 25 == 0) prunePositions();
    }

    /** {الموضع، المدة} بالمللي ثانية، أو null إن لم يُشاهَد. */
    public long[] position(String key) {
        if (key == null) return null;
        String v = pos.getString(scoped("pos", key), null);
        if (v == null) return null;
        try {
            String[] parts = v.split("\\|");
            return new long[]{Long.parseLong(parts[0]), Long.parseLong(parts[1])};
        } catch (Exception e) {
            return null;
        }
    }

    public void clearPosition(String key) {
        if (key != null) pos.edit().remove(scoped("pos", key)).apply();
    }

    // ---------------- أوقات آخر تحديث ----------------

    public long lastUpdated(String type) {
        return sp.getLong(scoped("updated", type), 0L);
    }

    public void setLastUpdated(String type, long ts) {
        sp.edit().putLong(scoped("updated", type), ts).apply();
    }

    /**
     * نمط الجهاز ("touch" أو "tv"). يُقرأ من السياق المُمرَّر مباشرة (وليس من سياق التطبيق)
     * لأنه يُستدعى داخل attachBaseContext قبل اكتمال تهيئة الشاشة.
     */
    public static String deviceMode(Context ctx) {
        String def = BaseActivity.isTvDevice(ctx) ? "tv" : "touch";
        try {
            return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("device_mode", def);
        } catch (Throwable t) {
            return def;
        }
    }

    public String getString(String key, String def) {
        return sp.getString(key, def);
    }

    public void putString(String key, String value) {
        sp.edit().putString(key, value).apply();
    }
}
