package com.almezo.servers.nat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.almezo.servers.R;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * شاشة الملف الشخصي ومعلومات الحساب (#profile-screen):
 * مطابقة 100% لتصميم الويب الأصلي ببطاقة المعلومات الزجاجية وشارة "متصل" والفوتر الاجتماعي.
 */
public class ProfileActivity extends BaseActivity {

    private NavBar nav;
    private Models.Account acc;

    private TextView tvUsername, tvStatus, tvServer, tvType, tvMaxConn, tvActiveConn, tvCreatedAt, tvExpAt;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        acc = new Store(this).active();
        if (acc == null) { finish(); return; }

        setContentView(R.layout.nat_activity_profile);
        nav = new NavBar(this).backOnly(this);

        tvUsername = findViewById(R.id.prof_username);
        tvStatus = findViewById(R.id.prof_status);
        tvServer = findViewById(R.id.prof_server);
        tvType = findViewById(R.id.prof_type);
        tvMaxConn = findViewById(R.id.prof_max_conn);
        tvActiveConn = findViewById(R.id.prof_active_conn);
        tvCreatedAt = findViewById(R.id.prof_created_at);
        tvExpAt = findViewById(R.id.prof_exp_at);

        ImageButton sCall = findViewById(R.id.prof_social_call);
        ImageButton sFb = findViewById(R.id.prof_social_fb);
        ImageButton sWa = findViewById(R.id.prof_social_wa);

        for (View v : new View[]{sCall, sFb, sWa}) {
            if (v != null) applyFocusScale(v, 1.12f);
        }

        if (sCall != null) sCall.setOnClickListener(v -> openUrl("tel:0945772649"));
        if (sFb != null) sFb.setOnClickListener(v -> openUrl("https://facebook.com/ALMEZ0SERVERS"));
        if (sWa != null) sWa.setOnClickListener(v -> openUrl("https://wa.me/218945772649"));

        render(parse(acc.userInfoJson));
        // أول قراءة حيّة تبدأ من onResume مع حلقة التحديث، فلا حاجة لطلب إضافي هنا.
    }

    /**
     * عدد الاتصالات النشطة يتغيّر لحظياً حين يفتح جهاز آخر نفس الحساب، فنعيد سؤال السيرفر كل
     * 10 ثوانٍ ما دامت الشاشة ظاهرة، بدل قراءة واحدة تبقى ثابتة حتى إغلاق الشاشة وفتحها.
     */
    private static final long REFRESH_MS = 10_000L;

    private final Runnable refreshLoop = new Runnable() {
        @Override
        public void run() {
            fetchAccountInfo();
            ui.postDelayed(this, REFRESH_MS);
        }
    };

    private void fetchAccountInfo() {
        Xtream.IO.execute(() -> {
            try {
                JSONObject fresh = new Xtream(this, acc).accountInfo().optJSONObject("user_info");
                if (fresh != null) ui.post(() -> { if (!isFinishing()) render(fresh); });
            } catch (Exception ignored) { }
        });
    }

    private void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) { }
    }

    private static JSONObject parse(String s) {
        try { return new JSONObject(s == null ? "{}" : s); } catch (Exception e) { return new JSONObject(); }
    }

    private void render(JSONObject u) {
        Servers.Server s = Servers.find(acc.serverCode);
        if (tvServer != null) tvServer.setText(s != null ? s.name : acc.serverCode);

        String username = u.optString("username", acc.username);
        if (tvUsername != null) tvUsername.setText(username != null && !username.isEmpty() ? username : "--");

        String status = u.optString("status", "Active");
        boolean isActive = "Active".equalsIgnoreCase(status);
        if (tvStatus != null) {
            tvStatus.setText(isActive ? "متصل" : status);
            tvStatus.setTextColor(isActive ? 0xFF22C55E : 0xFFE50914);
        }

        boolean isTrial = "1".equals(u.optString("is_trial", "0"));
        if (tvType != null) {
            tvType.setText(isTrial ? "حساب تجريبي" : "حساب نشط ✓");
            tvType.setTextColor(isTrial ? 0xFFF59E0B : 0xFF22C55E);
        }

        if (tvMaxConn != null) tvMaxConn.setText(u.optString("max_connections", "1"));
        if (tvActiveConn != null) {
            // نفس قاعدة الويب في splayer.js: الجهاز الحالي نفسه اتصال، فالحد الأدنى 1 وليس 0.
            String act = u.optString("active_cons", "");
            if (act.isEmpty()) act = u.optString("active_connections", "");
            int activeVal;
            try {
                activeVal = Math.max(1, Integer.parseInt(act.trim()));
            } catch (Exception e) {
                activeVal = 1;
            }
            tvActiveConn.setText(String.valueOf(activeVal));
        }

        if (tvCreatedAt != null) tvCreatedAt.setText(formatDate(u.optString("created_at", "")));
        if (tvExpAt != null) tvExpAt.setText(formatDate(u.optString("exp_date", "")));
    }

    private static String formatDate(String raw) {
        if (raw == null || raw.isEmpty() || "null".equals(raw) || "0".equals(raw)) return "غير محدود (دائم)";
        try {
            long secs = Long.parseLong(raw.trim());
            if (secs <= 0) return "غير محدود (دائم)";
            return new SimpleDateFormat("dd/MM/yyyy", Locale.US).format(new Date(secs > 1e11 ? secs : secs * 1000L));
        } catch (Exception e) {
            return raw;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
        if (acc != null) {
            ui.removeCallbacks(refreshLoop);
            ui.post(refreshLoop);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
        ui.removeCallbacks(refreshLoop);
    }
}
