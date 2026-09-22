package com.almezo.servers.nat;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;
import com.bumptech.glide.Glide;

import java.io.File;

/** يملأ بطاقة التنزيل (صفحة التنزيلات وصندوق التنزيل) ويربط أزرارها، وتشغيل الملف المحلي. */
public final class DownloadViews {

    private DownloadViews() { }

    public static void bind(Activity a, View card, Downloads.Item i, Runnable onRemoved) {
        Downloads dl = Downloads.get(a);
        ImageView poster = card.findViewById(R.id.dl_poster);
        TextView title = card.findViewById(R.id.dl_title);
        TextView sub = card.findViewById(R.id.dl_subtitle);
        TextView status = card.findViewById(R.id.dl_status);
        ProgressBar bar = card.findViewById(R.id.dl_progress);
        TextView stats = card.findViewById(R.id.dl_stats);
        ImageButton primary = card.findViewById(R.id.dl_btn_primary);
        ImageButton secondary = card.findViewById(R.id.dl_btn_secondary);

        if (!i.id.equals(poster.getTag())) {
            poster.setTag(i.id);
            File local = i.posterFile == null ? null : new File(i.posterFile);
            if (local != null && local.exists()) {
                Glide.with(a).load(local).placeholder(Ui.logoPlaceholder()).error(Ui.logoPlaceholder()).into(poster);
            } else {
                Ui.loadImage(poster, i.poster, Ui.logoPlaceholder());
            }
        }
        title.setText(i.title);
        sub.setText(i.subtitle == null || i.subtitle.isEmpty()
                ? ("episode".equals(i.kind) ? "حلقة" : "فيلم") : i.subtitle);

        status.setText(dl.statusText(i));
        int color;
        switch (i.state) {
            case Downloads.DONE: color = 0xFF22C55E; break;
            case Downloads.FAILED: color = 0xFFF87171; break;
            case Downloads.PAUSED: color = 0xFFF59E0B; break;
            case Downloads.RUNNING: color = 0xFF38BDF8; break;
            default: color = 0xFFCBD5E1;
        }
        status.setTextColor(color);

        boolean done = Downloads.DONE.equals(i.state);
        bar.setVisibility(done ? View.GONE : View.VISIBLE);
        bar.setIndeterminate(Downloads.RUNNING.equals(i.state) && i.total <= 0);
        bar.setProgress(i.total > 0 ? (int) (i.done * 1000 / i.total) : 0);

        if (done) {
            stats.setText("الحجم: " + Downloads.ltr(Downloads.formatBytes(i.total)));
        } else {
            StringBuilder s = new StringBuilder();
            s.append(Downloads.ltr(Downloads.formatBytes(i.done))).append(" من ")
                    .append(i.total > 0 ? Downloads.ltr(Downloads.formatBytes(i.total)) : "…");
            if (i.total > 0) s.append("  ").append(Downloads.ltr("(" + i.percent() + "%)"));
            if (Downloads.RUNNING.equals(i.state)) {
                s.append("   ·   السرعة: ").append(Downloads.ltr(Downloads.formatSpeed(i.speed)))
                        .append("   ·   المتبقي: ").append(Downloads.ltr(Downloads.formatEta(i)));
            }
            stats.setText(s);
        }

        // الزر الأول: تشغيل / إيقاف مؤقت / استئناف
        if (done) {
            primary.setImageResource(R.drawable.fa_play);
            primary.setContentDescription("مشاهدة");
            primary.setOnClickListener(v -> playLocal(a, i));
        } else if (i.isActive()) {
            primary.setImageResource(R.drawable.fa_pause);
            primary.setContentDescription("إيقاف مؤقت");
            primary.setOnClickListener(v -> dl.pause(i.id));
        } else {
            primary.setImageResource(Downloads.FAILED.equals(i.state) ? R.drawable.fa_arrows_rotate : R.drawable.fa_download);
            primary.setContentDescription(Downloads.FAILED.equals(i.state) ? "إعادة المحاولة" : "استئناف");
            primary.setOnClickListener(v -> dl.resume(i.id));
        }

        // الزر الثاني: إلغاء التنزيل أو حذف الملف، بتأكيد
        secondary.setImageResource(done ? R.drawable.fa_trash : R.drawable.fa_xmark);
        secondary.setContentDescription(done ? "حذف" : "إلغاء التنزيل");
        secondary.setOnClickListener(v -> Ui.confirm(a,
                done ? "حذف الملف" : "إلغاء التنزيل",
                done ? "سيُحذف \"" + i.title + "\" من الجهاز." : "سيتوقف تنزيل \"" + i.title + "\" ويُحذف ما نزل منه.",
                done ? "حذف" : "إلغاء التنزيل",
                () -> {
                    dl.remove(i.id);
                    if (onRemoved != null) onRemoved.run();
                }));
    }

    /** تشغيل ملف منزّل بالمشغل نفسه، بنفس مفتاح المحتوى فيُستأنف من حيث توقف. */
    public static void playLocal(Activity a, Downloads.Item i) {
        File f = new File(i.file);
        if (!f.exists()) {
            Ui.toast(a, "الملف غير موجود على الجهاز");
            return;
        }
        PlayQueue.single(new PlayQueue.Entry(android.net.Uri.fromFile(f).toString(), i.title, i.poster,
                i.contentKey, i.id, "episode".equals(i.kind) ? Models.SERIES : Models.VOD));
        Intent in = new Intent(a, PlayerActivity.class);
        in.putExtra("queue", true);
        in.putExtra("videoUrl", android.net.Uri.fromFile(f).toString());
        in.putExtra("title", i.title);
        in.putExtra("posterUrl", i.poster == null ? "" : i.poster);
        in.putExtra("isLive", false);
        in.putExtra("isTv", BaseActivity.isTvDevice(a));
        a.startActivity(in);
    }
}
