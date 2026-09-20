package com.almezo.servers.nat;

import android.content.Context;
import android.view.MotionEvent;
import android.view.Window;

import androidx.annotation.NonNull;

import com.almezo.servers.R;

/**
 * أساس كل النوافذ المنبثقة في المشغل: بدون عنوان وبخلفية شفافة، تظهر بتكبير وتلاشٍ ناعم
 * وتختفي بعكسهما، مع نفس مؤثرات التركيز بالريموت والضغط باللمس المستخدمة في الشاشات.
 */
public class NatDialog extends android.app.Dialog {

    public NatDialog(@NonNull Context context) {
        super(context);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        if (w != null) {
            w.setBackgroundDrawableResource(android.R.color.transparent);
            w.setWindowAnimations(R.style.NatDialogAnim);
            w.setDimAmount(0.72f);
        }
    }

    @Override
    public void setContentView(int layoutResID) {
        super.setContentView(layoutResID);
        Fx.install(getWindow());
    }

    /**
     * نفس محرك التنقل الهندسي المستعمل في الشاشات. النوافذ المنبثقة لها نافذة مستقلة لا
     * تمرّ بـBaseActivity، فكان التنقل فيها يتبع خوارزمية أندرويد وحدها: الضغط يساراً على
     * بطاقة سيرفر لا يحرّك شيئاً، ولا يمكن الوصول لزر الحذف داخلها إلا بدورة طويلة.
     */
    @Override
    public boolean dispatchKeyEvent(@NonNull android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN && getWindow() != null) {
            int dir = Fx.directionOf(event.getKeyCode());
            android.view.View focused = getCurrentFocus();
            if (dir != 0 && focused != null && !(focused instanceof android.widget.EditText)) {
                android.view.View next = Fx.spatialNext(getWindow().getDecorView(), focused, dir);
                if (next != null && next != focused) {
                    next.requestFocus();
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchTouchEvent(@NonNull MotionEvent ev) {
        if (getWindow() != null) Fx.onTouch(getWindow().getDecorView(), ev);
        return super.dispatchTouchEvent(ev);
    }
}
