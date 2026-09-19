package com.almezo.servers.nat;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * نقل بيانات مشغل الويب (localStorage) إلى المشغل الأصلي عند أول فتح، حتى لا يُطلب من المستخدم
 * إعادة تسجيل الدخول: الحسابات المحفوظة، الحساب النشط، المفضلة، ومتابعة المشاهدة.
 */
public final class Migration {

    private Migration() { }

    public static void importFromWeb(Context ctx, String json) {
        if (json == null || json.isEmpty()) return;
        Store store = new Store(ctx);
        if ("1".equals(store.getString("migrated_from_web", "0"))) return;
        try {
            JSONObject root = new JSONObject(json);
            JSONArray accounts = root.optJSONArray("accounts");
            String activeId = root.optString("activeId", "");
            Models.Account activeAcc = null;

            if (accounts != null && store.accounts().isEmpty()) {
                for (int i = accounts.length() - 1; i >= 0; i--) {
                    JSONObject o = accounts.optJSONObject(i);
                    if (o == null) continue;
                    String host = o.optString("host", "");
                    String user = o.optString("username", "");
                    String pass = o.optString("password", "");
                    if (host.isEmpty() || user.isEmpty() || pass.isEmpty()) continue;
                    Models.Account a = new Models.Account();
                    a.serverCode = o.optString("serverCode", "001");
                    a.id = o.optString("id", "acc_" + a.serverCode + "_" + user.toLowerCase());
                    a.host = host;
                    a.username = user;
                    a.password = pass;
                    Object info = o.opt("userInfo");
                    a.userInfoJson = info != null ? info.toString() : "{}";
                    a.savedAt = o.optLong("savedAt", System.currentTimeMillis());
                    store.saveAndActivate(a);
                    if (a.id.equals(activeId)) activeAcc = a;
                }
                if (activeAcc != null) store.activate(activeAcc.id);
                if (root.optBoolean("loggedOut", false)) store.logout();
            }

            if (store.active() != null) {
                for (String type : new String[]{Models.LIVE, Models.VOD, Models.SERIES}) {
                    JSONArray favs = root.optJSONObject("favs") != null ? root.optJSONObject("favs").optJSONArray(type) : null;
                    if (favs != null && store.favorites(type).isEmpty()) {
                        for (int i = favs.length() - 1; i >= 0; i--) store.toggleFavorite(type, favs.optString(i));
                    }
                    JSONArray cont = root.optJSONObject("cont") != null ? root.optJSONObject("cont").optJSONArray(type) : null;
                    if (cont != null && store.continueWatching(type).isEmpty()) {
                        for (int i = cont.length() - 1; i >= 0; i--) store.recordContinueWatching(type, cont.optString(i));
                    }
                }
            }
            store.putString("migrated_from_web", "1");
        } catch (Exception ignored) { }
    }
}
