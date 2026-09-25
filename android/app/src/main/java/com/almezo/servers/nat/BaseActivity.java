package com.almezo.servers.nat;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

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
    protected void onPostCreate(@Nullable Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        Fx.install(getWindow());
        installLanguage();
    }

    /**
     * لغة الشاشة: ترجمة النصوص الثابتة واتجاه العرض. النصوص التي يضيفها الكود لاحقاً
     * (صفوف القوائم والرسائل) تُترجم مع كل تغيّر في التخطيط، بفاصل بسيط حتى لا يثقل
     * الأجهزة الضعيفة. بالعربية لا يُنفَّذ شيء إطلاقاً.
     */
    private void installLanguage() {
        final View root = getWindow() != null ? getWindow().getDecorView() : null;
        if (root == null) return;
        Lang.apply(root);
        if (!Lang.isEnglish(this)) return;
        root.getViewTreeObserver().addOnGlobalLayoutListener(new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
            private long last = 0;
            @Override
            public void onGlobalLayout() {
                long now = System.currentTimeMillis();
                if (now - last < 120) return;
                last = now;
                Lang.apply(root);
            }
        });
        // المحتوى القادم من السيرفر يُبنى بعد الفتح بقليل: إعادة تطبيق بعد لحظات
        root.postDelayed(() -> Lang.apply(root), 400);
        root.postDelayed(() -> Lang.apply(root), 1200);
        root.postDelayed(() -> Lang.apply(root), 2500);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        Fx.onTouch(getWindow().getDecorView(), ev);
        return super.dispatchTouchEvent(ev);
    }

    /**
     * تنقل الريموت هندسي في كل شاشات المشغل: السهم ينقل التركيز إلى أقرب عنصر في اتجاه الضغط
     * فعلياً على الشاشة، بدل خوارزمية أندرويد التي تبحث داخل الحاوية أولاً فتلتف داخل الشبكة
     * ولا تخرج إلى القائمة الجانبية أو الشريط العلوي إلا بعد دورة طويلة.
     */
    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
            int dir = Fx.directionOf(event.getKeyCode());
            View focused = getCurrentFocus();
            // داخل حقول الكتابة تبقى الأسهم لتحريك المؤشر بين الحروف
            if (dir != 0 && focused != null && !(focused instanceof android.widget.EditText)
                    && Fx.move(getWindow().getDecorView(), focused, dir)) {
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        BroadcastNotifier.setAppForeground(true);
        // إشعارات المدير تصل والمستخدم داخل المشغل الأصلي أيضاً، لا في صفحة الويب وحدها
        BroadcastNotifier.checkAsync(this);
        BroadcastNotifier.schedule(this);
        enterImmersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        BroadcastNotifier.setAppForeground(false);
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
        Ui.toast(this, msg);
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
     * مقدار تكبير العنصر عند التركيز بالريموت. التكبير نفسه والتوهج وإطار التركيز تتولاها Fx مركزياً
     * لكل عناصر الشاشة (انظر Fx.install)، وهذه الدالة تحدد المقدار المفضّل لعنصر بعينه فقط.
     */
    public static void applyFocusScale(View v, float scale) {
        Fx.setFocusScale(v, scale);
    }
}
