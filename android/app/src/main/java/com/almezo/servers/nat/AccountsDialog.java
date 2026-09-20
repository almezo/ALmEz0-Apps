package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.R;

import java.util.List;

/**
 * نافذة قوائم التشغيل والسيرفرات المحفوظة (#playlistsModal):
 * مطابقة 100% للتصميم السابق بشبكة البطاقات وشعارات السيرفرات الحقيقية وزر إضافة سيرفر جديد.
 */
public final class AccountsDialog {

    private AccountsDialog() { }

    public static void show(Activity a) {
        if (a == null || a.isFinishing()) return;
        final Store store = new Store(a);
        final List<Models.Account> accounts = store.accounts();
        final Models.Account active = store.active();

        final Dialog d = new NatDialog(a);
        d.setContentView(R.layout.nat_dialog_playlists);
        if (d.getWindow() != null) {
            d.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        Ui.widenDialogCard(d, R.id.dialog_playlists_card, 1020);

        View close = d.findViewById(R.id.dialog_playlists_close);
        Button btnAdd = d.findViewById(R.id.dialog_playlists_btn_add);
        TextView countText = d.findViewById(R.id.dialog_playlists_count);
        RecyclerView list = d.findViewById(R.id.dialog_playlists_list);

        countText.setText(accounts.size() + " سيرفرات محفوظة");

        if (a instanceof BaseActivity) {
            BaseActivity ba = (BaseActivity) a;
            ba.applyFocusScale(close, 1.1f);
            ba.applyFocusScale(btnAdd, 1.05f);
        }

        close.setOnClickListener(v -> d.dismiss());

        btnAdd.setOnClickListener(v -> {
            d.dismiss();
            Intent i = new Intent(a, AuthActivity.class);
            i.putExtra(AuthActivity.EXTRA_ADD_ACCOUNT, true);
            a.startActivity(i);
        });

        list.setLayoutManager(new LinearLayoutManager(a));
        PlaylistAdapter adapter = new PlaylistAdapter(a, d, store, accounts, active);
        list.setAdapter(adapter);

        d.show();
        btnAdd.requestFocus();
    }

    private static class PlaylistAdapter extends RecyclerView.Adapter<PlaylistAdapter.VH> {
        private final Activity activity;
        private final Dialog dialog;
        private final Store store;
        private final List<Models.Account> list;
        private final Models.Account active;

        PlaylistAdapter(Activity a, Dialog d, Store s, List<Models.Account> l, Models.Account act) {
            this.activity = a;
            this.dialog = d;
            this.store = s;
            this.list = l;
            this.active = act;
        }

        class VH extends RecyclerView.ViewHolder {
            final ImageView logo;
            final TextView name, user, activeBadge;
            final Button btnActivate;
            final ImageButton btnDelete;

            VH(View v) {
                super(v);
                logo = v.findViewById(R.id.card_srv_logo);
                name = v.findViewById(R.id.card_srv_name);
                user = v.findViewById(R.id.card_srv_user);
                activeBadge = v.findViewById(R.id.card_srv_active_badge);
                btnActivate = v.findViewById(R.id.card_srv_btn_activate);
                btnDelete = v.findViewById(R.id.card_srv_btn_delete);
                if (activity instanceof BaseActivity) {
                    BaseActivity ba = (BaseActivity) activity;
                    ba.applyFocusScale(v, 1.03f);
                    ba.applyFocusScale(btnActivate, 1.08f);
                    ba.applyFocusScale(btnDelete, 1.12f);
                }
            }
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_playlist_card, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            Models.Account acc = list.get(position);
            Servers.Server s = Servers.find(acc.serverCode);
            String serverName = s != null ? s.name : "سيرفر (" + acc.serverCode + ")";
            int logoRes = s != null ? s.logoRes : R.drawable.almezo_logo;

            h.logo.setImageResource(logoRes);
            h.name.setText(serverName);
            h.user.setText("اسم المستخدم: " + (acc.username != null ? acc.username : "--"));

            boolean isActive = active != null && active.id.equals(acc.id);
            h.activeBadge.setVisibility(isActive ? View.VISIBLE : View.GONE);
            h.btnActivate.setVisibility(isActive ? View.GONE : View.VISIBLE);

            h.btnActivate.setOnClickListener(v -> {
                store.activate(acc.id);
                Ui.toast(activity, "تم تفعيل " + serverName);
                dialog.dismiss();
                // التبديل يغيّر المحتوى كلياً: نعود للوحة التحكم مع تحديث إجباري للباقات الثلاث.
                // كان يكتفي بـrecreate() فتبقى الباقات على كاش الحساب القديم حتى انتهاء صلاحيته.
                Intent i = new Intent(activity, DashboardActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                i.putExtra(DashboardActivity.EXTRA_ACCOUNT_CHANGED, true);
                activity.startActivity(i);
                // شاشة اتصال قصيرة بشعار السيرفر الجديد فوق لوحة التحكم
                IntroActivity.showServer(activity, acc.serverCode);
            });

            h.btnDelete.setOnClickListener(v -> {
                store.deleteAccount(acc.id);
                list.remove(position);
                notifyItemRemoved(position);
                notifyItemRangeChanged(position, list.size());
                TextView countTv = dialog.findViewById(R.id.dialog_playlists_count);
                if (countTv != null) countTv.setText(list.size() + " سيرفرات محفوظة");
                Ui.toast(activity, "تم حذف الحساب");

                if (store.active() == null) {
                    dialog.dismiss();
                    Intent i = new Intent(activity, AuthActivity.class);
                    i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    activity.startActivity(i);
                    activity.finish();
                }
            });
        }

        @Override
        public int getItemCount() {
            return list.size();
        }
    }
}
