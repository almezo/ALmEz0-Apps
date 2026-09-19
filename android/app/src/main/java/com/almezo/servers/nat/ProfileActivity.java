package com.almezo.servers.nat;

import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.content.res.ResourcesCompat;

import com.almezo.servers.R;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** الملف الشخصي (#profile-screen): بيانات الاشتراك من السيرفر. */
public class ProfileActivity extends BaseActivity {

    private NavBar nav;
    private LinearLayout body;
    private Models.Account acc;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        acc = new Store(this).active();
        if (acc == null) { finish(); return; }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundResource(R.drawable.nat_bg_app);
        root.setLayoutDirection(android.view.View.LAYOUT_DIRECTION_RTL);
        getLayoutInflater().inflate(R.layout.nat_navbar, root, true);

        ScrollView scroll = new ScrollView(this);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(40);
        body.setPadding(pad, dp(30), pad, pad);
        scroll.addView(body, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        nav = new NavBar(this).backOnly(this);

        render(parse(acc.userInfoJson));
        Xtream.IO.execute(() -> {
            try {
                JSONObject fresh = new Xtream(this, acc).accountInfo().optJSONObject("user_info");
                if (fresh != null) ui.post(() -> { if (!isFinishing()) render(fresh); });
            } catch (Exception ignored) { }
        });
    }

    private static JSONObject parse(String s) {
        try { return new JSONObject(s == null ? "{}" : s); } catch (Exception e) { return new JSONObject(); }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void render(JSONObject u) {
        body.removeAllViews();
        Servers.Server s = Servers.find(acc.serverCode);
        addTitle("معلومات الحساب");
        addRow("السيرفر", s != null ? s.name : acc.serverCode);
        addRow("اسم المستخدم", u.optString("username", acc.username));
        String status = u.optString("status", "");
        addRow("حالة الاشتراك", "Active".equalsIgnoreCase(status) ? "نشط ✓" : (status.isEmpty() ? "غير متوفر" : status));
        addRow("تاريخ الانتهاء", formatDate(u.optString("exp_date", "")));
        addRow("تاريخ الإنشاء", formatDate(u.optString("created_at", "")));
        addRow("الاتصالات النشطة", u.optString("active_cons", "0") + " من " + u.optString("max_connections", "1"));
        addRow("حساب تجريبي", "1".equals(u.optString("is_trial", "0")) ? "نعم" : "لا");
    }

    /** exp_date يأتي كثوانٍ منذ 1970، أو فارغاً/null للاشتراك غير المحدود. */
    private static String formatDate(String raw) {
        if (raw == null || raw.isEmpty() || "null".equals(raw)) return "غير محدود";
        try {
            long secs = Long.parseLong(raw.trim());
            return new SimpleDateFormat("dd/MM/yyyy", Locale.US).format(new Date(secs * 1000L));
        } catch (Exception e) {
            return raw;
        }
    }

    private void addTitle(String t) {
        TextView tv = new TextView(this);
        tv.setText(t);
        tv.setTextSize(30);
        tv.setTextColor(0xFFFFFFFF);
        tv.setTypeface(ResourcesCompat.getFont(this, R.font.tajawal_black));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(24);
        body.addView(tv, lp);
    }

    private void addRow(String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBackgroundResource(R.drawable.nat_row_item);
        row.setPadding(dp(24), dp(16), dp(24), dp(16));
        row.setFocusable(true);
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextSize(19);
        l.setTextColor(0xFF94A3B8);
        l.setTypeface(ResourcesCompat.getFont(this, R.font.tajawal_bold));
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(20);
        v.setTextColor(0xFFFFFFFF);
        v.setTypeface(ResourcesCompat.getFont(this, R.font.tajawal_extrabold));
        v.setGravity(Gravity.END);
        row.addView(l, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(v, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(820), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        body.addView(row, lp);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
    }
}
