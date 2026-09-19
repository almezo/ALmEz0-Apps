package com.almezo.servers.nat;

import android.app.ActivityManager;
import android.content.Context;
import android.widget.ImageView;

import com.almezo.servers.R;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DecodeFormat;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.request.RequestOptions;

import java.util.Calendar;
import java.util.Locale;

/** أدوات واجهة مشتركة: نصوص الوقت بنفس صياغة الويب، وتحميل الصور بكفاءة للأجهزة الضعيفة. */
public final class Ui {

    private Ui() { }

    /** نفس ساعة الترويسة في player.html: "08:47 مساءً" */
    public static String clockText() {
        Calendar c = Calendar.getInstance();
        int h = c.get(Calendar.HOUR_OF_DAY);
        String period = h >= 12 ? "مساءً" : "صباحاً";
        h = h % 12;
        if (h == 0) h = 12;
        return String.format(Locale.US, "%02d:%02d %s", h, c.get(Calendar.MINUTE), period);
    }

    /** "18/09/2026" */
    public static String dateText() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%02d/%02d/%d",
                c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.MONTH) + 1, c.get(Calendar.YEAR));
    }

    /** نفس formatRelativeTimeArabic في splayer.js حرفياً. */
    public static String relativeArabic(long ts) {
        if (ts <= 0) return "الآن";
        long diff = System.currentTimeMillis() - ts;
        if (diff < 5000) return "الآن";
        long seconds = diff / 1000;
        if (seconds < 60) return "منذ ثوانٍ";
        long minutes = diff / 60000;
        if (minutes == 1) return "قبل دقيقة";
        if (minutes == 2) return "قبل دقيقتين";
        if (minutes >= 3 && minutes <= 10) return "قبل " + minutes + " دقائق";
        if (minutes < 60) return "قبل " + minutes + " دقيقة";
        long hours = minutes / 60;
        if (hours == 1) return "قبل ساعة";
        if (hours == 2) return "قبل ساعتين";
        if (hours >= 3 && hours <= 10) return "قبل " + hours + " ساعات";
        if (hours < 24) return "قبل " + hours + " ساعة";
        long days = hours / 24;
        if (days == 1) return "قبل يوم";
        if (days == 2) return "قبل يومين";
        if (days >= 3 && days <= 10) return "قبل " + days + " أيام";
        return "قبل " + days + " يوماً";
    }

    private static Boolean lowRam = null;

    /** نفس شروط الجهاز الضعيف في المشغل: 4 أنوية أو أقل، أو 3GB رام أو أقل، أو isLowRamDevice. */
    public static boolean isLowEnd(Context ctx) {
        if (lowRam != null) return lowRam;
        boolean low = false;
        try {
            if (Runtime.getRuntime().availableProcessors() <= 4) low = true;
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                if (am.isLowRamDevice()) low = true;
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                if (mi.totalMem > 0 && mi.totalMem <= 3L * 1024 * 1024 * 1024) low = true;
            }
        } catch (Throwable ignored) { }
        lowRam = low;
        return low;
    }

    /**
     * تحميل صورة بصيغة موفّرة: تُصغَّر لحجم العنصر الفعلي (downsampling)، وتُخزَّن على القرص،
     * وتُفك بصيغة 16-بت على الأجهزة الضعيفة (نصف ذاكرة الصورة تقريباً دون فرق ملحوظ في البوسترات).
     */
    public static void loadImage(ImageView view, String url, int placeholderRes) {
        Context ctx = view.getContext();
        RequestOptions opts = new RequestOptions()
                .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                .format(isLowEnd(ctx) ? DecodeFormat.PREFER_RGB_565 : DecodeFormat.PREFER_ARGB_8888)
                .placeholder(placeholderRes)
                .error(placeholderRes)
                .dontAnimate();
        if (url == null || url.trim().length() < 5 || "null".equals(url)) {
            Glide.with(ctx).clear(view);
            view.setImageResource(placeholderRes);
            return;
        }
        Glide.with(ctx).load(url.trim().replace(" ", "%20")).apply(opts).into(view);
    }

    public static int logoPlaceholder() {
        return R.drawable.almezo_logo;
    }
}
