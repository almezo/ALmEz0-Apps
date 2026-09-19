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
    private final SharedPreferences sp;

    public Store(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
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
