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

    private static final long DURATION = 1900;
    private boolean leaving = false;
    private boolean started = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.nat_activity_intro);
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

        ui.postDelayed(this::openPlayer, DURATION);
    }

    private void pulse(View ring, long delay) {
        ring.setScaleX(0.6f);
        ring.setScaleY(0.6f);
        ring.setAlpha(0.9f);
        ring.animate().scaleX(1.55f).scaleY(1.55f).alpha(0f).setStartDelay(delay).setDuration(1100)
                .setInterpolator(new LinearInterpolator()).start();
    }

    private void openPlayer() {
        if (leaving || isFinishing()) return;
        leaving = true;
        findViewById(R.id.intro_content).animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(220)
                .withEndAction(() -> {
                    Intent i = new Intent(this, AuthActivity.class);
                    i.putExtra(DashboardActivity.EXTRA_FRESH_OPEN, true);
                    startActivity(i);
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
