package com.almezo.servers.nat;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;

import androidx.annotation.Nullable;

import com.almezo.servers.R;

/**
 * المقدمة الافتتاحية لمشغل الميزو (أقل من ثانيتين): الشعار يظهر بتكبير وارتداد مع حلقات توهج
 * خضراء، ثم الاسم، وشريط تقدم متدرج، وبعدها يُفتح المشغل مع تحديث إجباري للباقات.
 */
public class IntroActivity extends BaseActivity {

    /** نمط الافتتاحية: الافتراضي مقدمة المشغل، و MODE_HOME مقدمة العودة للشاشة الرئيسية. */
    public static final String EXTRA_MODE = "intro_mode";
    public static final String MODE_HOME = "home";
    /** نمط الاتصال بسيرفر: شعار السيرفر الداخل عليه مع "جارٍ الاتصال". */
    public static final String MODE_SERVER = "server";
    public static final String EXTRA_SERVER_CODE = "server_code";

    private static final long DURATION = 1900;
    private boolean leaving = false;
    private boolean started = false;
    private boolean toHome = false;

    /**
     * شاشة اتصال قصيرة بشعار السيرفر عند الدخول إليه أو التبديل له، ثم لوحة التحكم.
     * تعطي المستخدم إحساس "جارٍ تسجيل الدخول" بدل قفزة مفاجئة بين محتويين مختلفين.
     */
    public static void showServer(android.app.Activity a, String serverCode) {
        if (a == null || a.isFinishing()) return;
        Intent i = new Intent(a, ServerIntroActivity.class);
        i.putExtra(EXTRA_MODE, MODE_SERVER);
        i.putExtra(EXTRA_SERVER_CODE, serverCode);
        a.startActivity(i);
        a.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    /** نفس الافتتاحية بنص "سيرفرات الميزو": عند فتح التطبيق وعند الخروج من المشغل. */
    public static void showHome(android.app.Activity a) {
        if (a == null || a.isFinishing()) return;
        Intent i = new Intent(a, HomeIntroActivity.class);
        i.putExtra(EXTRA_MODE, MODE_HOME);
        a.startActivity(i);
        a.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String mode = getIntent().getStringExtra(EXTRA_MODE);
        toHome = MODE_HOME.equals(mode) || MODE_SERVER.equals(mode);

        setContentView(R.layout.nat_activity_intro);
        if (MODE_SERVER.equals(mode)) {
            Servers.Server srv = Servers.find(getIntent().getStringExtra(EXTRA_SERVER_CODE));
            if (srv != null) {
                ((android.widget.ImageView) findViewById(R.id.intro_logo)).setImageResource(srv.logoRes);
                ((android.widget.TextView) findViewById(R.id.intro_title)).setText(srv.name);
            }
            ((android.widget.TextView) findViewById(R.id.intro_sub)).setText("جارٍ الاتصال بالسيرفر");
        } else if (toHome) {
            ((android.widget.TextView) findViewById(R.id.intro_title)).setText("سيرفرات الميزو");
            ((android.widget.TextView) findViewById(R.id.intro_sub)).setText("ALmEz0 SERVERS");
        } else {
            // افتتاحية المشغل: مكعب الميزو، كما في نسخة الكمبيوتر والموقع
            android.widget.ImageView logo = findViewById(R.id.intro_logo);
            logo.setImageResource(R.drawable.mizo_cube);
            int size = (int) (getResources().getDisplayMetrics().density * 190);
            android.view.ViewGroup.LayoutParams lp = logo.getLayoutParams();
            lp.width = size;
            lp.height = size;
            logo.setLayoutParams(lp);
        }
        // احتياط إن لم تصل إشارة ظهور النافذة
        ui.postDelayed(this::startIntro, 1500);
    }

    /**
     * تبدأ الحركة عند ظهور النافذة فعلياً وليس عند إنشائها: على الأجهزة البطيئة قد يتأخر أول
     * رسم ثانيتين، فكانت الحركة تنتهي قبل أن يراها المستخدم.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) startIntro();
    }

    private void startIntro() {
        if (started || isFinishing()) return;
        started = true;
        View logo = findViewById(R.id.intro_logo);
        View ring = findViewById(R.id.intro_ring);
        View ring2 = findViewById(R.id.intro_ring2);
        View title = findViewById(R.id.intro_title);
        View sub = findViewById(R.id.intro_sub);
        View bar = findViewById(R.id.intro_bar);
        float d = getResources().getDisplayMetrics().density;

        logo.setScaleX(0.4f);
        logo.setScaleY(0.4f);
        logo.setRotation(-10f);
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).rotation(0f)
                .setInterpolator(new OvershootInterpolator(1.8f)).setDuration(750).start();

        pulse(ring, 250);
        pulse(ring2, 750);

        title.setTranslationY(30 * d);
        title.animate().alpha(1f).translationY(0).setStartDelay(450).setDuration(500)
                .setInterpolator(new DecelerateInterpolator(1.8f)).start();
        sub.setTranslationY(20 * d);
        sub.animate().alpha(1f).translationY(0).setStartDelay(650).setDuration(500)
                .setInterpolator(new DecelerateInterpolator(1.8f)).start();

        // الشريط يمتلئ من اليمين لليسار (اتجاه القراءة العربية)
        bar.post(() -> bar.setPivotX(bar.getWidth()));
        bar.animate().scaleX(1f).setStartDelay(300).setDuration(DURATION - 450)
                .setInterpolator(new AccelerateInterpolator(0.6f)).start();

        ui.postDelayed(this::leave, DURATION);
    }

    private void pulse(View ring, long delay) {
        ring.setScaleX(0.6f);
        ring.setScaleY(0.6f);
        ring.setAlpha(0.9f);
        ring.animate().scaleX(1.55f).scaleY(1.55f).alpha(0f).setStartDelay(delay).setDuration(1100)
                .setInterpolator(new LinearInterpolator()).start();
    }

    private void leave() {
        if (leaving || isFinishing()) return;
        leaving = true;
        findViewById(R.id.intro_content).animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(220)
                .withEndAction(() -> {
                    // نمط الشاشة الرئيسية: نغلق فقط، فالشاشة الرئيسية تنتظر تحتنا في المكدس
                    if (!toHome) {
                        Intent i = new Intent(this, AuthActivity.class);
                        i.putExtra(DashboardActivity.EXTRA_FRESH_OPEN, true);
                        startActivity(i);
                    }
                    overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                    finish();
                }).start();
    }

    @Override
    public void onBackPressed() {
        leaving = true;
        super.onBackPressed();
    }
}
