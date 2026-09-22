package com.almezo.servers.nat;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import com.almezo.servers.R;

import java.io.File;

/**
 * صندوق التنزيل المنبثق: يتابع تنزيلاً واحداً حياً (الحجم والسرعة والوقت المتبقي ومكان الحفظ)
 * مع الإيقاف والاستئناف والإلغاء. إخفاؤه لا يوقف التنزيل.
 */
public final class DownloadDialog implements Downloads.Listener {

    private final Activity a;
    private final String itemId;
    private final NatDialog dialog;
    private final Downloads dl;

    public static void show(Activity a, String itemId) {
        new DownloadDialog(a, itemId);
    }

    private DownloadDialog(Activity a, String itemId) {
        this.a = a;
        this.itemId = itemId;
        this.dl = Downloads.get(a);
        dialog = new NatDialog(a);
        dialog.setContentView(R.layout.nat_dialog_download);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        View all = dialog.findViewById(R.id.dld_btn_all);
        View hide = dialog.findViewById(R.id.dld_btn_hide);
        BaseActivity.applyFocusScale(all, 1.06f);
        BaseActivity.applyFocusScale(hide, 1.06f);
        BaseActivity.applyFocusScale(dialog.findViewById(R.id.dl_btn_primary), 1.12f);
        BaseActivity.applyFocusScale(dialog.findViewById(R.id.dl_btn_secondary), 1.12f);
        all.setOnClickListener(v -> {
            dialog.dismiss();
            a.startActivity(new Intent(a, DownloadsActivity.class));
        });
        hide.setOnClickListener(v -> dialog.dismiss());
        dialog.setOnDismissListener(d -> dl.removeListener(this));
        dl.addListener(this);
        render();
        dialog.show();
        View primary = dialog.findViewById(R.id.dl_btn_primary);
        if (primary != null) primary.requestFocus();
    }

    @Override
    public void onDownloadsChanged() {
        if (dialog.isShowing()) render();
    }

    private void render() {
        Downloads.Item i = dl.find(itemId);
        if (i == null) { // أُلغي
            dialog.dismiss();
            return;
        }
        View card = dialog.findViewById(R.id.dld_card);
        DownloadViews.bind(a, card, i, dialog::dismiss);
        ((TextView) dialog.findViewById(R.id.dld_heading)).setText(
                Downloads.DONE.equals(i.state) ? "تم التنزيل" : "التنزيل");

        File f = new File(i.file);
        ((TextView) dialog.findViewById(R.id.dld_location)).setText("مكان الحفظ: "
                + Downloads.storageLabel(i.dirIndex) + " — ⁨" + f.getName() + "⁩"
                + "   ·   المساحة المتاحة: " + Downloads.ltr(Downloads.formatBytes(Downloads.freeBytes(f.getParentFile() != null ? f.getParentFile() : f))));

        int waiting = 0;
        for (Downloads.Item x : dl.all()) if (Downloads.QUEUED.equals(x.state) && !x.id.equals(i.id)) waiting++;
        ((TextView) dialog.findViewById(R.id.dld_queue)).setText(waiting > 0
                ? "في قائمة الانتظار بعده: " + waiting + " — تنزيل واحد في كل مرة حتى لا يحظر السيرفر الاتصال"
                : "التنزيل يكمل في الخلفية حتى لو أغلقت هذه النافذة أو البرنامج");
    }
}
