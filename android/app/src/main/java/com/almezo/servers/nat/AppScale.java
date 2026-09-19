package com.almezo.servers.nat;

import android.content.Context;
import android.content.res.Configuration;
import android.util.DisplayMetrics;
import android.view.WindowManager;

/**
 * يطابق مقاسات مشغل الميزو الأصلي (الويب) على كل شاشة أندرويد.
 *
 * مشغل الويب كان يرسم واجهته على "كانفاس" ثابت ارتفاعه 750 بكسل ثم يصغّره ليملأ الشاشة
 * (وهو الشكل الذي وصل لمرحلة ممتازة في وضع النقال). هنا نفعل الشيء نفسه أصلياً: نضبط كثافة
 * الشاشة بحيث يساوي 1dp في ملفات XML بكسلاً واحداً من كانفاس الويب. بذلك تُنقل قيم CSS
 * (مثل ارتفاع البطاقة 430px أو الزر 60px) كما هي إلى dp دون أي تحويل، وتبقى النِّسب متطابقة
 * على الهاتف والتابلت وصندوق التلفاز والشاشة الكبيرة.
 *
 * نفس معادلة applyAutoScaling في splayer.js: عرض الكانفاس = 750 × نسبة الشاشة
 * (محصورة بين 1.33 و 2.45)، ثم يُصغَّر الكانفاس ليتسع داخل الشاشة.
 *
 * مهم: الكثافة تُطبَّق عبر إعدادات خاصة بكل شاشة أصلية (createConfigurationContext) وليس
 * بتعديل مقاييس التطبيق المشتركة، حتى لا تتأثر شاشة الموقع (WebView) عند الرجوع إليها.
 */
public final class AppScale {

    public static final float CANVAS_HEIGHT = 700f;

    private AppScale() { }

    public static float computeDensity(Context ctx) {
        DisplayMetrics real = new DisplayMetrics();
        WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        if (wm != null) {
            wm.getDefaultDisplay().getRealMetrics(real);
        } else {
            real = ctx.getResources().getDisplayMetrics();
        }
        float longSide = Math.max(real.widthPixels, real.heightPixels);
        float shortSide = Math.min(real.widthPixels, real.heightPixels);
        if (shortSide <= 0) return ctx.getResources().getDisplayMetrics().density;

        float aspect = longSide / shortSide;
        float clampedAspect = Math.max(1.33f, Math.min(2.45f, aspect));
        float canvasWidth = CANVAS_HEIGHT * clampedAspect;
        return Math.min(shortSide / CANVAS_HEIGHT, longSide / canvasWidth);
    }

    /** سياق جديد بكثافة الكانفاس ومقياس خط ثابت (1.0)، لاستخدامه في attachBaseContext. */
    public static Context wrap(Context base) {
        float density = computeDensity(base);
        Configuration cfg = new Configuration(base.getResources().getConfiguration());
        cfg.densityDpi = Math.max(1, Math.round(density * 160f));
        // حجم الخط لا يتأثر بإعداد "حجم الخط" في النظام، تماماً كالمشغل على الويب
        cfg.fontScale = 1f;
        DisplayMetrics real = new DisplayMetrics();
        WindowManager wm = (WindowManager) base.getSystemService(Context.WINDOW_SERVICE);
        if (wm != null) {
            wm.getDefaultDisplay().getRealMetrics(real);
            float d = cfg.densityDpi / 160f;
            cfg.screenWidthDp = Math.round(real.widthPixels / d);
            cfg.screenHeightDp = Math.round(real.heightPixels / d);
            cfg.smallestScreenWidthDp = Math.min(cfg.screenWidthDp, cfg.screenHeightDp);
        }
        return base.createConfigurationContext(cfg);
    }
}
