package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.Toast;

import com.almezo.servers.R;

/**
 * نافذة اختيار نمط الجهاز ونظام التحكم (هاتف/لمس ، شاشة أندرويد/ريموت ، كمبيوتر/ماوس وكيبورد).
 * مطابقة تماماً لنافذة #deviceModeModal في مشغل الويب السابق.
 */
public final class DeviceModeDialog {

    private DeviceModeDialog() { }

    public static void show(Activity a) {
        if (a == null || a.isFinishing()) return;
        final Store store = new Store(a);
        String currentMode = Store.deviceMode(a);

        final Dialog d = new NatDialog(a);
        d.setContentView(R.layout.nat_dialog_device_mode);
        if (d.getWindow() != null) {
            d.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        Ui.widenDialogCard(d, R.id.dialog_device_card, 760);

        View close = d.findViewById(R.id.dialog_device_close);
        View cardTouch = d.findViewById(R.id.card_mode_touch);
        View cardTv = d.findViewById(R.id.card_mode_tv);

        Button btnTouch = d.findViewById(R.id.btn_mode_touch);
        Button btnTv = d.findViewById(R.id.btn_mode_tv);

        highlight(cardTouch, btnTouch, !"tv".equals(currentMode));
        highlight(cardTv, btnTv, "tv".equals(currentMode));

        if (a instanceof BaseActivity) {
            BaseActivity ba = (BaseActivity) a;
            ba.applyFocusScale(cardTouch, 1.05f);
            ba.applyFocusScale(cardTv, 1.05f);
            ba.applyFocusScale(close, 1.1f);
        }

        close.setOnClickListener(v -> d.dismiss());

        cardTouch.setOnClickListener(v -> select(a, d, store, "touch", "تم تفعيل نمط اللمس (هاتف / تابلت)"));
        cardTv.setOnClickListener(v -> select(a, d, store, "tv", "تم تفعيل نمط التلفزيون (ريموت كنترول)"));

        d.show();
        if ("tv".equals(currentMode)) cardTv.requestFocus();
        else cardTouch.requestFocus();
    }

    private static void highlight(View card, Button btn, boolean active) {
        card.setActivated(active);
        if (active) {
            btn.setText("✓ مفعّل حالياً");
            btn.setBackgroundResource(R.drawable.nat_btn_watch);
            btn.setTextColor(0xFFFFFFFF);
        } else {
            btn.setText("تفعيل النمط");
            btn.setBackgroundResource(R.drawable.nat_btn_gold);
            btn.setTextColor(0xFF000000);
        }
    }

    private static void select(Activity a, Dialog d, Store store, String mode, String msg) {
        boolean changed = !mode.equals(Store.deviceMode(a));
        store.putString("device_mode", mode);
        Ui.toast(a, msg);
        d.dismiss();
        // مقاسات الواجهة (الكانفاس والخطوط) تعتمد على النمط، فنعيد بناء الشاشة لتطبيقها فوراً
        if (changed) a.recreate();
    }

    /** أيقونة زر نمط الجهاز تتبع النمط المفعّل: هاتف للمس، وشاشة للريموت. */
    public static int iconFor(android.content.Context ctx) {
        return AppScale.isTouchMode(ctx) ? R.drawable.fa_mobile_screen_button : R.drawable.fa_tv;
    }
}
