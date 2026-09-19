package com.almezo.servers.nat;

import android.app.Activity;
import android.content.Intent;

import androidx.appcompat.app.AlertDialog;

import java.util.ArrayList;
import java.util.List;

/** قوائم التشغيل وتبديل السيرفر (#playlistsModal): تفعيل حساب محفوظ، حذفه، أو إضافة سيرفر جديد. */
public final class AccountsDialog {

    private AccountsDialog() { }

    public static void show(Activity a) {
        final Store store = new Store(a);
        final List<Models.Account> accounts = store.accounts();
        final Models.Account active = store.active();

        List<String> labels = new ArrayList<>();
        for (Models.Account acc : accounts) {
            Servers.Server s = Servers.find(acc.serverCode);
            String name = (s != null ? s.name : "سيرفر (" + acc.serverCode + ")") + " - " + acc.username;
            if (active != null && active.id.equals(acc.id)) name = "✓ " + name + " (مفعّل حالياً)";
            labels.add(name);
        }
        labels.add("＋ إضافة سيرفر أو حساب جديد");

        new AlertDialog.Builder(a, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                .setTitle("قوائم التشغيل وتبديل السيرفر")
                .setItems(labels.toArray(new String[0]), (d, which) -> {
                    if (which == accounts.size()) {
                        Intent i = new Intent(a, AuthActivity.class);
                        i.putExtra(AuthActivity.EXTRA_ADD_ACCOUNT, true);
                        a.startActivity(i);
                        return;
                    }
                    showAccountActions(a, store, accounts.get(which));
                })
                .setNegativeButton("إغلاق", null)
                .show();
    }

    private static void showAccountActions(Activity a, Store store, Models.Account acc) {
        new AlertDialog.Builder(a, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                .setTitle(acc.username)
                .setItems(new String[]{"تفعيل هذا الحساب", "حذف الحساب"}, (d, which) -> {
                    if (which == 0) {
                        store.activate(acc.id);
                        a.recreate();
                    } else {
                        store.deleteAccount(acc.id);
                        if (store.active() == null) {
                            Intent i = new Intent(a, AuthActivity.class);
                            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                            a.startActivity(i);
                            a.finish();
                        }
                    }
                })
                .setNegativeButton("رجوع", null)
                .show();
    }
}
