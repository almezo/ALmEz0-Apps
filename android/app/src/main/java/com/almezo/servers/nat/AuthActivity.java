package com.almezo.servers.nat;

import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.almezo.servers.R;

import org.json.JSONObject;

/**
 * نقطة دخول المشغل الأصلي: كود السيرفر ثم اسم المستخدم وكلمة المرور، بنفس منطق
 * handleServerCode و handleLogin في مشغل الويب. إن وُجد حساب نشط محفوظ يُفتح لوحة التحكم مباشرة.
 */
public class AuthActivity extends BaseActivity {

    public static final String EXTRA_ADD_ACCOUNT = "add_account";

    private Store store;
    private Servers.Server server;
    private View stepCode, stepLogin;
    private EditText code, user, pass;
    private ImageView logo;
    private TextView title;
    private ProgressBar progress;
    private boolean passVisible = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);

        boolean addingAccount = getIntent().getBooleanExtra(EXTRA_ADD_ACCOUNT, false);
        if (!addingAccount && store.active() != null) {
            openDashboard();
            return;
        }

        setContentView(R.layout.nat_activity_auth);
        stepCode = findViewById(R.id.auth_step_code);
        stepLogin = findViewById(R.id.auth_step_login);
        code = findViewById(R.id.auth_code);
        user = findViewById(R.id.auth_user);
        pass = findViewById(R.id.auth_pass);
        logo = findViewById(R.id.auth_logo);
        title = findViewById(R.id.auth_title);
        progress = findViewById(R.id.auth_progress);

        Button connect = findViewById(R.id.auth_btn_connect);
        Button login = findViewById(R.id.auth_btn_login);
        ImageButton back = findViewById(R.id.auth_btn_back);
        ImageButton toggle = findViewById(R.id.auth_toggle_pass);

        applyFocusScale(connect, 1.03f);
        applyFocusScale(login, 1.03f);
        applyFocusScale(back, 1.1f);
        applyFocusScale(toggle, 1.1f);

        connect.setOnClickListener(v -> handleServerCode());
        login.setOnClickListener(v -> handleLogin());
        back.setOnClickListener(v -> {
            if (stepLogin.getVisibility() == View.VISIBLE) showCodeStep();
            else finish();
        });
        toggle.setOnClickListener(v -> {
            passVisible = !passVisible;
            pass.setInputType(InputType.TYPE_CLASS_TEXT | (passVisible
                    ? InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                    : InputType.TYPE_TEXT_VARIATION_PASSWORD));
            pass.setSelection(pass.getText().length());
            toggle.setImageResource(passVisible ? R.drawable.fa_eye_slash : R.drawable.fa_eye);
        });

        code.setOnEditorActionListener((v, actionId, e) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || isEnter(e)) { handleServerCode(); return true; }
            return false;
        });
        user.setOnEditorActionListener((v, actionId, e) -> {
            if (actionId == EditorInfo.IME_ACTION_NEXT || isEnter(e)) { pass.requestFocus(); return true; }
            return false;
        });
        pass.setOnEditorActionListener((v, actionId, e) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE || isEnter(e)) { handleLogin(); return true; }
            return false;
        });

        View btnHome = findViewById(R.id.auth_btn_home);
        View btnSaved = findViewById(R.id.auth_btn_saved_accounts);
        View btnDevice = findViewById(R.id.auth_btn_device);
        TextView badge = findViewById(R.id.auth_saved_badge);
        View sCall = findViewById(R.id.auth_social_call);
        View sFb = findViewById(R.id.auth_social_fb);
        View sWa = findViewById(R.id.auth_social_wa);

        for (View v : new View[]{btnHome, btnSaved, btnDevice, sCall, sFb, sWa}) {
            if (v != null) applyFocusScale(v, 1.12f);
        }

        if (btnHome != null) btnHome.setOnClickListener(v -> finish());
        if (btnSaved != null) btnSaved.setOnClickListener(v -> AccountsDialog.show(this));
        if (btnDevice instanceof ImageButton) ((ImageButton) btnDevice).setImageResource(DeviceModeDialog.iconFor(this));
        if (btnDevice != null) btnDevice.setOnClickListener(v -> DeviceModeDialog.show(this));

        if (sCall != null) sCall.setOnClickListener(v -> openUrl("tel:0945772649"));
        if (sFb != null) sFb.setOnClickListener(v -> openUrl("https://facebook.com/ALMEZ0SERVERS"));
        if (sWa != null) sWa.setOnClickListener(v -> openUrl("https://wa.me/218945772649"));

        int savedCount = store.accounts().size();
        if (badge != null) {
            badge.setText(String.valueOf(savedCount));
            badge.setVisibility(savedCount > 0 ? View.VISIBLE : View.GONE);
        }

        String lastCode = store.getString("last_server_code", "");
        if (!lastCode.isEmpty()) code.setText(lastCode);
        showCodeStep();
    }

    private void openUrl(String url) {
        try {
            startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)));
        } catch (Exception ignored) { }
    }

    private static boolean isEnter(KeyEvent e) {
        return e != null && e.getAction() == KeyEvent.ACTION_DOWN && e.getKeyCode() == KeyEvent.KEYCODE_ENTER;
    }

    private void showCodeStep() {
        stepLogin.setVisibility(View.GONE);
        stepCode.setVisibility(View.VISIBLE);
        logo.setImageResource(R.drawable.almezo_logo);
        title.setText("مشغل الميزو - ALmEz0");
        // لا نفتح لوحة المفاتيح تلقائياً: التركيز على الزر، والحقل يُفتح عند اختيار المستخدم له
        findViewById(R.id.auth_btn_connect).requestFocus();
    }

    private void showLoginStep() {
        stepCode.setVisibility(View.GONE);
        stepLogin.setVisibility(View.VISIBLE);
        logo.setImageResource(server.logoRes);
        title.setText(server.name);
        user.requestFocus();
    }

    private void handleServerCode() {
        String c = Servers.normalizeCode(code.getText().toString());
        code.setText(c);
        if (c.isEmpty()) { toast("يرجى إدخال كود السيرفر للمتابعة"); return; }
        Servers.Server s = Servers.find(c);
        if (s == null) { toast("كود السيرفر غير صحيح، يرجى التأكد من الكود والمحاولة مجدداً."); return; }
        server = s;
        store.putString("last_server_code", c);
        showLoginStep();
    }

    private void handleLogin() {
        final String u = user.getText().toString().trim();
        final String p = pass.getText().toString().trim();
        if (u.isEmpty() || p.isEmpty()) { toast("يرجى إدخال اسم المستخدم وكلمة المرور"); return; }
        if (server == null) { showCodeStep(); return; }

        setBusy(true);
        final Servers.Server s = server;
        Xtream.IO.execute(() -> {
            JSONObject info = null;
            String error = null;
            try {
                info = Xtream.authenticate(s.host, u, p);
            } catch (Exception e) {
                error = "تعذر الاتصال بالسيرفر، تأكد من الاتصال أو البيانات";
            }
            final JSONObject finalInfo = info;
            final String finalError = error;
            ui.post(() -> {
                if (isFinishing()) return;
                setBusy(false);
                if (finalError != null) { toast(finalError); return; }
                if (finalInfo == null) { toast("بيانات الدخول غير صحيحة، يرجى التحقق من اسم المستخدم وكلمة المرور"); return; }

                Models.Account acc = new Models.Account();
                acc.id = "acc_" + s.code + "_" + u.toLowerCase();
                acc.serverCode = s.code;
                acc.host = s.host;
                acc.username = u;
                acc.password = p;
                acc.userInfoJson = finalInfo.toString();
                acc.savedAt = System.currentTimeMillis();
                store.saveAndActivate(acc);
                openDashboard();
            });
        });
    }

    private void setBusy(boolean busy) {
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        findViewById(R.id.auth_btn_login).setEnabled(!busy);
        findViewById(R.id.auth_btn_connect).setEnabled(!busy);
    }

    private void openDashboard() {
        Intent i = new Intent(this, DashboardActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        // فتح المشغل من البرنامج: تحديث إجباري للباقات الثلاث مرة واحدة في لوحة التحكم
        i.putExtra(DashboardActivity.EXTRA_FRESH_OPEN, getIntent().getBooleanExtra(DashboardActivity.EXTRA_FRESH_OPEN, false));
        startActivity(i);
        finish();
    }
}
