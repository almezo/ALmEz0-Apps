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

    /** المشغل فُتح للتو من البرنامج (وليس رجوعاً من شاشة داخلية): تحديث إجباري للباقات. */
    public static final String EXTRA_FRESH_OPEN = "fresh_open";
    /** دخول حساب جديد أو تبديل حساب: تحديث إجباري دائماً مهما كان عمر الكاش. */
    public static final String EXTRA_ACCOUNT_CHANGED = "account_changed";
    /** فتح عادي للمشغل: لا نرهق السيرفر بتحديث إجباري إن كانت الباقات حديثة. */
    private static final long OPEN_REFRESH_AFTER_MS = 2L * 60 * 60 * 1000;
    /** خيوط مستقلة لتحديث الفتح حتى لا تنتظر شاشات التصفح انتهاءه */
    /** خيط واحد: الباقات الثلاث تُحدَّث واحدة تلو الأخرى، فلا نرهق لوحة السيرفر بطلبات متوازية. */
    private static final java.util.concurrent.ExecutorService OPEN_REFRESH = java.util.concurrent.Executors.newSingleThreadExecutor();

    private Store store;
    private Models.Account account;
    private NavBar nav;
    private View cardLive, cardMovies, cardSeries;
    /** الباقات الجاري تحديثها الآن (حتى لا يكتب مؤقّت الحالة فوق "جاري التحديث...") */
    private final java.util.Set<String> refreshing = new java.util.HashSet<>();

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
        nav.home.setOnClickListener(v -> exitToHome());
        nav.accounts.setOnClickListener(v -> AccountsDialog.show(this));
        nav.profile.setOnClickListener(v -> startActivity(new Intent(this, ProfileActivity.class)));
        nav.logout.setOnClickListener(v -> confirmLogout());

        cardLive = findViewById(R.id.card_live);
        cardMovies = findViewById(R.id.card_movies);
        cardSeries = findViewById(R.id.card_series);
        setupCard(cardLive, Models.LIVE, R.drawable.nat_card_live, R.drawable.fa_desktop, "البث المباشر", "شاهد القنوات مباشرة");
        setupCard(cardMovies, Models.VOD, R.drawable.nat_card_movies, R.drawable.fa_r_circle_play, "الأفلام", "تصفح جميع الأفلام");
        setupCard(cardSeries, Models.SERIES, R.drawable.nat_card_series, R.drawable.fa_video, "المسلسلات", "تصفح المسلسلات والحلقات");

        View aiBtn = findViewById(R.id.dash_btn_ai);
        if (aiBtn != null) {
            applyFocusScale(aiBtn, 1.08f);
            aiBtn.setOnClickListener(v -> AiAssistantDialog.show(this));
        }

        fitCardsWidth();
        setupFooter();
        cardLive.requestFocus();
        Fx.enter(cardLive, cardMovies, cardSeries, aiBtn);
        boolean accountChanged = savedInstanceState == null && getIntent().getBooleanExtra(EXTRA_ACCOUNT_CHANGED, false);
        boolean freshOpen = savedInstanceState == null && getIntent().getBooleanExtra(EXTRA_FRESH_OPEN, false);
        if (accountChanged || (freshOpen && packagesStale())) refreshAllOnOpen();
        else prefetchAll();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == AiAssistantDialog.REQ_CODE_SPEECH && resultCode == RESULT_OK && data != null) {
            java.util.ArrayList<String> matches = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) {
                AiAssistantDialog.handleSpeechResult(matches.get(0));
            }
        }
    }

    /**
     * نفس .dash-cards-wrapper: عرض أقصى 1480 (+ الحشوات)، وإلا يملأ الشاشة.
     * البطاقات تملأ الارتفاع المتاح بين الترويسة والتذييل (مهم في نمط الهاتف المكبّر)،
     * ولا تتجاوز ارتفاعها الأصلي 445 على الشاشات الكبيرة.
     */
    private void fitCardsWidth() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float canvasWidth = dm.widthPixels / dm.density;
        View wrapper = findViewById(R.id.dash_cards);
        ViewGroup.LayoutParams lp = wrapper.getLayoutParams();
        lp.width = canvasWidth > 1540 ? Math.round(1540 * dm.density) : ViewGroup.LayoutParams.MATCH_PARENT;
        wrapper.setLayoutParams(lp);
        wrapper.post(() -> {
            View area = (View) wrapper.getParent();
            int maxCard = Math.round(445 * dm.density);
            int pads = wrapper.getPaddingTop() + wrapper.getPaddingBottom();
            if (area.getHeight() - pads > maxCard) {
                ViewGroup.LayoutParams p = wrapper.getLayoutParams();
                p.height = maxCard + pads;
                wrapper.setLayoutParams(p);
            }
        });
    }

    private void setupCard(View card, String type, int bg, int icon, String title, String subtitle) {
        card.setBackgroundResource(bg);
        ((ImageView) card.findViewById(R.id.card_icon)).setImageResource(icon);
        ((TextView) card.findViewById(R.id.card_title)).setText(title);
        ((TextView) card.findViewById(R.id.card_subtitle)).setText(subtitle);
        applyFocusScale(card, 1.05f);
        card.setOnClickListener(v -> {
            if (refreshing.contains(type)) {
                toast("جاري تحديث باقة " + title + "، يرجى الانتظار...");
                return;
            }
            Intent i = new Intent(this, BrowseActivity.class);
            i.putExtra(BrowseActivity.EXTRA_TYPE, type);
            startActivity(i);
        });
        View refresh = card.findViewById(R.id.card_refresh);
        applyFocusScale(refresh, 1.15f);
        refresh.setOnClickListener(v -> {
            if (refreshing.contains(type)) return;
            refreshType(card, type, title);
        });
        // زر التحديث داخل البطاقة: نظام التركيز لا ينتقل من البطاقة إلى عنصر بداخلها تلقائياً،
        // فيُربط يدوياً: الأسفل من البطاقة إلى زر التحديث، والأعلى من الزر إلى البطاقة
        card.setOnKeyListener((v, keyCode, e) -> {
            if (e.getAction() == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN) {
                refresh.requestFocus();
                return true;
            }
            return false;
        });
        refresh.setOnKeyListener((v, keyCode, e) -> {
            if (e.getAction() == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP) {
                card.requestFocus();
                return true;
            }
            return false;
        });
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
            if (refreshing.contains(t)) continue;
            status.setText("آخر تحديث: " + Ui.relativeArabic(store.lastUpdated(t)));
        }
    }

    /** تحديث فعلي من السيرفر (تجاوز الكاش) للأقسام والقوائم معاً، مع حجب البطاقة وعرض مؤشر التحميل والتنبيه بعد الانتهاء. */
    private void refreshType(View card, String type, String name) {
        final View overlay = card.findViewById(R.id.card_overlay);
        final View icon = card.findViewById(R.id.card_refresh);
        final TextView status = card.findViewById(R.id.card_status);
        if (overlay != null) overlay.setVisibility(View.VISIBLE);
        refreshing.add(type);
        if (status != null) status.setText("جاري تحديث الباقة...");
        if (icon != null) {
            icon.animate().rotationBy(360f * 40).setDuration(40_000).setInterpolator(new android.view.animation.LinearInterpolator()).start();
        }
        final Xtream api = new Xtream(this, account);
        OPEN_REFRESH.execute(() -> {
            int count = -1;
            try {
                api.categories(type, true);
                List<Models.Item> items = api.streams(type, true);
                count = items.size();
            } catch (Exception ignored) { }
            final int finalCount = count;
            ui.post(() -> {
                if (isFinishing()) return;
                refreshing.remove(type);
                if (icon != null) {
                    icon.animate().cancel();
                    icon.animate().rotation(0).setDuration(250).start();
                }
                if (overlay != null) overlay.setVisibility(View.GONE);
                if (finalCount >= 0) {
                    store.setLastUpdated(type, System.currentTimeMillis());
                    toast("تم تحديث باقة " + name + " بنجاح (" + finalCount + " عنصر)");
                } else {
                    toast("تعذر تحديث باقة " + name);
                    if (status != null) status.setText("تعذر التحديث - تُعرض آخر نسخة محفوظة");
                }
                updateStatuses();
            });
        });
    }

    /**
     * عند فتح المشغل من البرنامج: تحديث فعلي للباقات الثلاث بحجب البطاقات وطبقة التحميل الداكنة،
     * وإظهار تنبيه اكتمال التحديث مع عدد المحتويات لكل باقة بالضبط كما في التحديث اليدوي.
     */
    /** هل مرّت ساعتان على آخر تحديث لإحدى الباقات؟ (وإلا نكتفي بالكاش عند الفتح العادي) */
    private boolean packagesStale() {
        long now = System.currentTimeMillis();
        for (String t : new String[]{Models.LIVE, Models.VOD, Models.SERIES}) {
            long last = store.lastUpdated(t);
            if (last <= 0 || now - last > OPEN_REFRESH_AFTER_MS) return true;
        }
        return false;
    }

    private void refreshAllOnOpen() {
        for (String t : new String[]{Models.LIVE, Models.VOD, Models.SERIES}) {
            View card = cardFor(t);
            TextView tv = card.findViewById(R.id.card_title);
            String title = tv != null ? tv.getText().toString() : "";
            refreshType(card, t, title);
        }
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
        android.app.Dialog dialog = new NatDialog(this);
        dialog.setContentView(R.layout.nat_dialog_logout);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        Ui.widenDialogCard(dialog, R.id.dialog_logout_card, 600);
        View confirm = dialog.findViewById(R.id.dialog_btn_confirm);
        View cancel = dialog.findViewById(R.id.dialog_btn_cancel);
        applyFocusScale(confirm, 1.08f);
        applyFocusScale(cancel, 1.08f);
        confirm.setOnClickListener(v -> {
            dialog.dismiss();
            store.logout();
            Intent i = new Intent(this, AuthActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(i);
            finish();
        });
        cancel.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
        confirm.requestFocus();
    }

    /**
     * الخروج من المشغل إلى الشاشة الرئيسية يمرّ بافتتاحية "سيرفرات الميزو"، بنفس تصميم
     * افتتاحية دخول المشغل، فيبقى الانتقال بين العالمين واضحاً ومتناسقاً.
     */
    private void exitToHome() {
        IntroActivity.showHome(this);
        finish();
    }

    @Override
    public void onBackPressed() {
        exitToHome();
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
