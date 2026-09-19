package com.almezo.servers.nat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;

import com.almezo.servers.R;

import java.util.List;

/** لوحة التحكم (#dashboard-screen): البث المباشر، الأفلام، المسلسلات. */
public class DashboardActivity extends BaseActivity {

    private Store store;
    private Models.Account account;
    private NavBar nav;
    private View cardLive, cardMovies, cardSeries;

    private final Runnable statusTicker = new Runnable() {
        @Override
        public void run() {
            updateStatuses();
            ui.postDelayed(this, 15000);
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);
        account = store.active();
        if (account == null) {
            startActivity(new Intent(this, AuthActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.nat_activity_dashboard);

        nav = new NavBar(this);
        nav.home.setOnClickListener(v -> finish());
        nav.accounts.setOnClickListener(v -> AccountsDialog.show(this));
        nav.profile.setOnClickListener(v -> startActivity(new Intent(this, ProfileActivity.class)));
        nav.logout.setOnClickListener(v -> confirmLogout());

        cardLive = findViewById(R.id.card_live);
        cardMovies = findViewById(R.id.card_movies);
        cardSeries = findViewById(R.id.card_series);
        setupCard(cardLive, Models.LIVE, R.drawable.nat_card_live, R.drawable.fa_desktop, "البث المباشر", "شاهد القنوات مباشرة");
        setupCard(cardMovies, Models.VOD, R.drawable.nat_card_movies, R.drawable.fa_r_circle_play, "الأفلام", "تصفح جميع الأفلام");
        setupCard(cardSeries, Models.SERIES, R.drawable.nat_card_series, R.drawable.fa_video, "المسلسلات", "تصفح المسلسلات والحلقات");

        fitCardsWidth();
        setupFooter();
        cardLive.requestFocus();
        prefetchAll();
    }

    /** نفس .dash-cards-wrapper: عرض أقصى 1480 (+ الحشوات)، وإلا يملأ الشاشة. */
    private void fitCardsWidth() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float canvasWidth = dm.widthPixels / dm.density;
        View wrapper = findViewById(R.id.dash_cards);
        ViewGroup.LayoutParams lp = wrapper.getLayoutParams();
        lp.width = canvasWidth > 1540 ? Math.round(1540 * dm.density) : ViewGroup.LayoutParams.MATCH_PARENT;
        wrapper.setLayoutParams(lp);
    }

    private void setupCard(View card, String type, int bg, int icon, String title, String subtitle) {
        card.setBackgroundResource(bg);
        ((ImageView) card.findViewById(R.id.card_icon)).setImageResource(icon);
        ((TextView) card.findViewById(R.id.card_title)).setText(title);
        ((TextView) card.findViewById(R.id.card_subtitle)).setText(subtitle);
        applyFocusScale(card, 1.05f);
        card.setOnClickListener(v -> {
            Intent i = new Intent(this, BrowseActivity.class);
            i.putExtra(BrowseActivity.EXTRA_TYPE, type);
            startActivity(i);
        });
        View refresh = card.findViewById(R.id.card_refresh);
        applyFocusScale(refresh, 1.15f);
        refresh.setOnClickListener(v -> refreshType(card, type, title));
    }

    private View cardFor(String type) {
        if (Models.LIVE.equals(type)) return cardLive;
        if (Models.VOD.equals(type)) return cardMovies;
        return cardSeries;
    }

    private void updateStatuses() {
        for (String t : new String[]{Models.LIVE, Models.VOD, Models.SERIES}) {
            View card = cardFor(t);
            TextView status = card.findViewById(R.id.card_status);
            status.setText("آخر تحديث: " + Ui.relativeArabic(store.lastUpdated(t)));
        }
    }

    /** تحديث فعلي من السيرفر (تجاوز الكاش) للأقسام والقوائم معاً، كما في manualRefreshCategory. */
    private void refreshType(View card, String type, String name) {
        final View overlay = card.findViewById(R.id.card_overlay);
        overlay.setVisibility(View.VISIBLE);
        final Xtream api = new Xtream(this, account);
        Xtream.IO.execute(() -> {
            int count = -1;
            try {
                api.clearCache(type);
                api.categories(type, true);
                List<Models.Item> items = api.streams(type, true);
                count = items.size();
            } catch (Exception ignored) { }
            final int finalCount = count;
            ui.post(() -> {
                if (isFinishing()) return;
                overlay.setVisibility(View.GONE);
                if (finalCount >= 0) {
                    store.setLastUpdated(type, System.currentTimeMillis());
                    toast("تم تحديث باقة " + name + " بنجاح (" + finalCount + " عنصر)");
                } else {
                    toast("تعذر تحديث باقة " + name);
                }
                updateStatuses();
            });
        });
    }

    /** تحميل مسبق هادئ للقوائم الثلاث (من الكاش إن كان صالحاً) لتُفتح الشاشات فوراً. */
    private void prefetchAll() {
        final Xtream api = new Xtream(this, account);
        Xtream.IO.execute(() -> {
            for (String t : new String[]{Models.LIVE, Models.VOD, Models.SERIES}) {
                try {
                    api.categories(t, false);
                    api.streams(t, false);
                    if (store.lastUpdated(t) == 0) store.setLastUpdated(t, System.currentTimeMillis());
                } catch (Exception ignored) { }
            }
            ui.post(this::updateStatuses);
        });
    }

    private void setupFooter() {
        View call = findViewById(R.id.foot_call);
        View fb = findViewById(R.id.foot_facebook);
        View wa = findViewById(R.id.foot_whatsapp);
        for (View v : new View[]{call, fb, wa}) applyFocusScale(v, 1.15f);
        call.setOnClickListener(v -> open("tel:0945772649"));
        fb.setOnClickListener(v -> open("https://facebook.com/ALMEZ0SERVERS"));
        wa.setOnClickListener(v -> open("https://wa.me/218945772649"));
    }

    private void open(String uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri)));
        } catch (Exception e) {
            toast("تعذر فتح الرابط");
        }
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                .setTitle("تسجيل الخروج")
                .setMessage("هل تريد تسجيل الخروج من الحساب الحالي؟")
                .setPositiveButton("خروج", (d, w) -> {
                    store.logout();
                    Intent i = new Intent(this, AuthActivity.class);
                    i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    startActivity(i);
                    finish();
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
        ui.removeCallbacks(statusTicker);
        ui.post(statusTicker);
        Models.Account now = store.active();
        if (account != null && (now == null || !now.id.equals(account.id))) {
            // تم تبديل الحساب من نافذة الحسابات: إعادة فتح اللوحة بالحساب الجديد
            recreate();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
        ui.removeCallbacks(statusTicker);
    }
}
