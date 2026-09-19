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

    @Override
    public boolean dispatchTouchEvent(@NonNull MotionEvent ev) {
        if (getWindow() != null) Fx.onTouch(getWindow().getDecorView(), ev);
        return super.dispatchTouchEvent(ev);
    }
}
