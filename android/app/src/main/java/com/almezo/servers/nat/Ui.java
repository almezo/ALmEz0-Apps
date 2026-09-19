package com.almezo.servers.nat;

import android.app.ActivityManager;
import android.app.Dialog;
import android.content.Context;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;

import com.almezo.servers.R;
import com.bumptech.glide.Glide;
import com.bumptech.glide.GlideBuilder;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DecodeFormat;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.engine.cache.InternalCacheDiskCacheFactory;
import com.bumptech.glide.load.engine.executor.GlideExecutor;
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

    private static volatile boolean imageLoaderReady = false;

    /**
     * إعداد محمّل الصور مرة واحدة قبل أول استخدام. الإعداد الافتراضي لـ Glide يحمّل 4 صور فقط في
     * نفس الوقت (أو أقل على الأجهزة الضعيفة)، وشعارات القنوات تأتي من عشرات السيرفرات المختلفة،
     * بعضها بطيء أو متوقف، فكانت تحجز الخيوط الأربعة وتتأخر بقية الشعارات الحقيقية طويلاً
     * وتبقى البطاقات على الشعار الافتراضي. هنا نسمح بتحميل متوازٍ أوسع وكاش قرص أكبر.
     */
    public static void initImageLoader(Context ctx) {
        if (imageLoaderReady) return;
        synchronized (Ui.class) {
            if (imageLoaderReady) return;
            imageLoaderReady = true;
            try {
                Context app = ctx.getApplicationContext();
                int threads = isLowEnd(app) ? 8 : 12;
                GlideBuilder builder = new GlideBuilder()
                        .setSourceExecutor(GlideExecutor.newSourceBuilder().setThreadCount(threads).build())
                        .setDiskCache(new InternalCacheDiskCacheFactory(app, 400L * 1024 * 1024));
                Glide.init(app, builder);
            } catch (Throwable ignored) { }
        }
    }

    /** مهلة أطول من الافتراضي (2.5 ثانية) لأن سيرفرات الشعارات البطيئة كانت تفشل وتبقى على الشعار الافتراضي. */
    /** مهلة صور الأفلام والمسلسلات 10 ثوانٍ لضمان جودة الملصقات العالية. */
    private static final int IMAGE_TIMEOUT_MS = 10000;
    /** مهلة سريعة لشعارات القنوات (3.5 ثانية) لتخطي الروابط الميتة والبطيئة وتوفير الخيوط للقنوات الشغالة. */
    private static final int CHANNEL_LOGO_TIMEOUT_MS = 3500;

    private static String cleanUrl(String url) {
        if (url == null) return null;
        String u = url.trim();
        if (u.length() < 5 || "null".equals(u)) return null;
        return u.replace(" ", "%20");
    }

    /**
     * تحميل بوسترات الأفلام والمسلسلات: جودة كاملة مع مهلة 10 ثوانٍ وإعادة محاولة للأعمال الفنية.
     */
    public static void loadImage(ImageView view, String url, int placeholderRes) {
        Context ctx = view.getContext();
        String u = cleanUrl(url);
        if (u == null) {
            Glide.with(ctx).clear(view);
            view.setImageResource(placeholderRes);
            return;
        }
        RequestOptions opts = new RequestOptions()
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .format(isLowEnd(ctx) ? DecodeFormat.PREFER_RGB_565 : DecodeFormat.PREFER_ARGB_8888)
                .timeout(IMAGE_TIMEOUT_MS)
                .priority(Priority.HIGH)
                .placeholder(placeholderRes)
                .error(placeholderRes)
                .dontAnimate();
        Glide.with(ctx).load(u).apply(opts)
                .error(Glide.with(ctx).load(u).apply(opts))
                .into(view);
    }

    /**
     * تحميل مخصص وسريع لشعارات قنوات البث المباشر: مهلة خاطفة 3.5 ثانية، وبلا إعادة محاولة للروابط
     * المعطلة، وفك ترميز RGB_565 خفيف وموفّر للذاكرة لتسريع ظهور بقية القنوات دون انتظار الروابط الميتة.
     */
    public static void loadChannelLogo(ImageView view, String url, int placeholderRes) {
        Context ctx = view.getContext();
        String u = cleanUrl(url);
        if (u == null) {
            Glide.with(ctx).clear(view);
            view.setImageResource(placeholderRes);
            return;
        }
        RequestOptions opts = new RequestOptions()
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .format(DecodeFormat.PREFER_RGB_565)
                .timeout(CHANNEL_LOGO_TIMEOUT_MS)
                .priority(Priority.HIGH)
                .placeholder(placeholderRes)
                .error(placeholderRes)
                .dontAnimate();
        Glide.with(ctx).load(u).apply(opts).into(view);
    }

    /** تنزيل صورة مسبقاً إلى كاش القرص (للأفلام والمسلسلات). */
    public static void prefetch(Context ctx, String url) {
        String u = cleanUrl(url);
        if (u == null) return;
        try {
            Glide.with(ctx.getApplicationContext()).downloadOnly().load(u)
                    .apply(new RequestOptions().timeout(IMAGE_TIMEOUT_MS).priority(Priority.LOW))
                    .submit();
        } catch (Throwable ignored) { }
    }

    /** تنزيل مسبق لشعارات القنوات بمهلة سريعة 3.5 ثوانٍ. */
    public static void prefetchChannelLogo(Context ctx, String url) {
        String u = cleanUrl(url);
        if (u == null) return;
        try {
            Glide.with(ctx.getApplicationContext()).downloadOnly().load(u)
                    .apply(new RequestOptions().timeout(CHANNEL_LOGO_TIMEOUT_MS).priority(Priority.LOW))
                    .submit();
        } catch (Throwable ignored) { }
    }

    /** "★ 7.5" أو "★ 8" من تقييم العمل. */
    public static String ratingText(float rating) {
        String r = (rating == (int) rating)
                ? String.valueOf((int) rating)
                : String.format(Locale.US, "%.1f", rating);
        return "★ " + r;
    }

    /**
     * في نمط الهاتف تُعرض النوافذ المنبثقة (تسجيل الخروج، نمط الجهاز، السيرفرات) بعرض أكبر من
     * عرضها على التلفاز، حتى لا تبدو صغيرة وسط شاشة الهاتف. لا تتجاوز عرض الشاشة أبداً.
     */
    public static void widenDialogCard(Dialog d, int cardId, int touchWidthDp) {
        View card = d.findViewById(cardId);
        if (card == null || !AppScale.isTouchMode(card.getContext())) return;
        DisplayMetrics dm = card.getResources().getDisplayMetrics();
        int max = dm.widthPixels - Math.round(64 * dm.density);
        ViewGroup.LayoutParams lp = card.getLayoutParams();
        lp.width = Math.min(max, Math.round(touchWidthDp * dm.density));
        card.setLayoutParams(lp);
    }

    /** رسالة منبثقة بتصميم المشغل: كبسولة داكنة زجاجية بإطار ذهبي خفيف أسفل الشاشة. */
    public static void toast(Context ctx, String msg) {
        toast(ctx, msg, false);
    }

    /**
     * @param green كبسولة خضراء (للتنبيهات الإيجابية مثل "اضغط مرة أخرى للخروج")
     */
    public static void toast(Context ctx, String msg, boolean green) {
        if (ctx == null || msg == null) return;
        try {
            float d = ctx.getResources().getDisplayMetrics().density;
            android.widget.TextView tv = new android.widget.TextView(ctx);
            tv.setText(msg);
            tv.setTextColor(0xFFFFFFFF);
            tv.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 16);
            tv.setGravity(android.view.Gravity.CENTER);
            tv.setMaxWidth(Math.round(ctx.getResources().getDisplayMetrics().widthPixels * 0.8f));
            try {
                tv.setTypeface(androidx.core.content.res.ResourcesCompat.getFont(ctx, R.font.tajawal_extrabold));
            } catch (Throwable ignored) { }
            int padH = Math.round(24 * d), padV = Math.round(13 * d);
            tv.setPadding(padH, padV, padH, padV);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setCornerRadius(40 * d);
            if (green) {
                bg.setColors(new int[]{0xF222C55E, 0xF215803D});
                bg.setOrientation(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT);
                bg.setStroke(Math.round(1.5f * d), 0x80BBF7D0);
            } else {
                bg.setColor(0xF2111827);
                bg.setStroke(Math.round(1.5f * d), 0x80F59E0B);
            }
            tv.setBackground(bg);
            tv.setElevation(8 * d);
            android.widget.Toast t = new android.widget.Toast(ctx.getApplicationContext());
            t.setView(tv);
            t.setDuration(android.widget.Toast.LENGTH_SHORT);
            t.setGravity(android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL, 0, Math.round(48 * d));
            t.show();
        } catch (Throwable e) {
            android.widget.Toast.makeText(ctx, msg, android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    public static int logoPlaceholder() {
        return R.drawable.almezo_logo;
    }
}
