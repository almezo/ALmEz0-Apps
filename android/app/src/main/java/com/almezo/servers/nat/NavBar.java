package com.almezo.servers.nat;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;

import com.almezo.servers.R;

/** يربط الترويسة المشتركة: ساعة حية تتحدث كل ثانية، وأزرار الترويسة بتأثير التركيز الموحّد. */
public final class NavBar {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final TextView clock;
    private final TextView date;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            clock.setText(Ui.clockText());
            date.setText(Ui.dateText());
            handler.postDelayed(this, 1000);
        }
    };

    public final ImageButton home, accounts, profile, logout, back;

    public NavBar(Activity a) {
        clock = a.findViewById(R.id.nav_clock);
        date = a.findViewById(R.id.nav_date);
        home = a.findViewById(R.id.nav_btn_home);
        accounts = a.findViewById(R.id.nav_btn_accounts);
        profile = a.findViewById(R.id.nav_btn_profile);
        logout = a.findViewById(R.id.nav_btn_logout);
        back = a.findViewById(R.id.nav_btn_back);
        for (View v : new View[]{home, accounts, profile, logout, back}) BaseActivity.applyFocusScale(v, 1.12f);
    }

    /** وضع الشاشات الداخلية: زر رجوع واحد بدل أزرار لوحة التحكم، كما في ترويسة شاشة البث بالويب. */
    public NavBar backOnly(Activity a) {
        home.setVisibility(View.GONE);
        accounts.setVisibility(View.GONE);
        profile.setVisibility(View.GONE);
        logout.setVisibility(View.GONE);
        back.setVisibility(View.VISIBLE);
        back.setOnClickListener(v -> a.finish());
        return this;
    }

    public void start() {
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    public void stop() {
        handler.removeCallbacks(tick);
    }
}
