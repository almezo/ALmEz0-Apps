package com.almezo.servers.nat;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import java.util.Locale;

/** الأساس المشترك لكل شاشات مشغل الميزو الأصلية. */
public abstract class BaseActivity extends AppCompatActivity {

    protected final Handler ui = new Handler(Looper.getMainLooper());
    private static Boolean cachedIsTv = null;

    @Override
    protected void attachBaseContext(Context newBase) {
        // كثافة الكانفاس خاصة بهذه الشاشة فقط (لا تتأثر شاشة الموقع في WebView)
        super.attachBaseContext(AppScale.wrap(newBase));
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        Ui.initImageLoader(this);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // تقليل إعادة الرسم: جذر كل شاشة يرسم خلفيته بنفسه
        getWindow().setBackgroundDrawable(null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    protected void enterImmersive() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN);
            }
        } catch (Throwable ignored) { }
    }

    protected void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    public static boolean isTvDevice(Context ctx) {
        if (cachedIsTv != null) return cachedIsTv;
        boolean tv = false;
        try {
            UiModeManager ui = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
            if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) tv = true;
            PackageManager pm = ctx.getPackageManager();
            if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                    || pm.hasSystemFeature("android.hardware.type.television")
                    || !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)) tv = true;
            String model = (Build.MODEL + " " + Build.DEVICE + " " + Build.PRODUCT + " " + Build.HARDWARE).toLowerCase(Locale.ROOT);
            String[] hints = {"tv", "box", "atv", "shield", "firetv", "mibox", "chromecast", "amlogic",
                    "allwinner", "rockchip", "stb", "receiver", "mstar", "realtek"};
            for (String h : hints) if (model.contains(h)) { tv = true; break; }
        } catch (Throwable ignored) { }
        cachedIsTv = tv;
        return tv;
    }

    /**
     * تأثير التركيز الموحّد لكل العناصر: تكبير خفيف مُسرَّع بالعتاد بدل مربع التركيز الأخضر
     * الافتراضي من النظام (الذي يرسم مستطيلاً فوق العناصر الدائرية).
     */
    public static void applyFocusScale(View v, float scale) {
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { v.setDefaultFocusHighlightEnabled(false); } catch (Throwable ignored) { }
        }
        final View.OnFocusChangeListener previous = v.getOnFocusChangeListener();
        v.setOnFocusChangeListener((view, hasFocus) -> {
            view.animate().scaleX(hasFocus ? scale : 1f).scaleY(hasFocus ? scale : 1f).setDuration(120).start();
            // رفع العنصر المُركَّز فوق جيرانه حتى لا يُرسم تكبيره تحت البطاقة المجاورة
            view.setTranslationZ(hasFocus ? 8f * view.getResources().getDisplayMetrics().density : 0f);
            if (previous != null) previous.onFocusChange(view, hasFocus);
        });
    }
}
