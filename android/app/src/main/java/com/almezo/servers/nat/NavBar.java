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

    public final ImageButton home, accounts, device, profile, logout, back, downloads;

    public NavBar(Activity a) {
        clock = a.findViewById(R.id.nav_clock);
        date = a.findViewById(R.id.nav_date);
        home = a.findViewById(R.id.nav_btn_home);
        accounts = a.findViewById(R.id.nav_btn_accounts);
        device = a.findViewById(R.id.nav_btn_device);
        profile = a.findViewById(R.id.nav_btn_profile);
        logout = a.findViewById(R.id.nav_btn_logout);
        back = a.findViewById(R.id.nav_btn_back);
        downloads = a.findViewById(R.id.nav_btn_downloads);
        for (View v : new View[]{home, accounts, device, profile, logout, back, downloads}) {
            if (v != null) BaseActivity.applyFocusScale(v, 1.12f);
        }
        if (device != null) {
            device.setImageResource(DeviceModeDialog.iconFor(a));
            device.setOnClickListener(v -> DeviceModeDialog.show(a));
        }
    }

    /** وضع الشاشات الداخلية: زر رجوع واحد بدل أزرار لوحة التحكم، كما في ترويسة شاشة البث بالويب. */
    public NavBar backOnly(Activity a) {
        if (home != null) home.setVisibility(View.GONE);
        if (accounts != null) accounts.setVisibility(View.GONE);
        if (device != null) device.setVisibility(View.GONE);
        if (profile != null) profile.setVisibility(View.GONE);
        if (logout != null) logout.setVisibility(View.GONE);
        if (back != null) {
            back.setVisibility(View.VISIBLE);
            back.setOnClickListener(v -> a.finish());
        }
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
