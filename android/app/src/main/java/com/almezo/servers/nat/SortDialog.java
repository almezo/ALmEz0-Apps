package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.CheckBox;
import android.widget.RadioButton;
import android.widget.RadioGroup;

import com.almezo.servers.R;

/**
 * نافذة الترتيب والعرض (#sortModal): الترتيب الافتراضي، المضافة حديثاً، أ-ي، ي-أ وإخفاء الأسماء.
 */
public final class SortDialog {

    public interface Callback {
        void onApply(String sortMode, boolean hideNames);
    }

    private SortDialog() { }

    public static void show(Activity a, String type, String currentSort, boolean currentHideNames, Callback callback) {
        if (a == null || a.isFinishing()) return;

        final Dialog d = new NatDialog(a);
        d.setContentView(R.layout.nat_dialog_sort);
        if (d.getWindow() != null) {
            d.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        RadioGroup group = d.findViewById(R.id.sort_radio_group);
        RadioButton optDefault = d.findViewById(R.id.sort_opt_default);
        RadioButton optAdded = d.findViewById(R.id.sort_opt_added);
        RadioButton optAsc = d.findViewById(R.id.sort_opt_asc);
        RadioButton optDesc = d.findViewById(R.id.sort_opt_desc);
        CheckBox chkHide = d.findViewById(R.id.sort_chk_hide_names);
        View btnClose = d.findViewById(R.id.sort_btn_close);
        View btnCancel = d.findViewById(R.id.sort_btn_cancel);
        View btnSave = d.findViewById(R.id.sort_btn_save);

        if ("added".equals(currentSort)) optAdded.setChecked(true);
        else if ("asc".equals(currentSort)) optAsc.setChecked(true);
        else if ("desc".equals(currentSort)) optDesc.setChecked(true);
        else optDefault.setChecked(true);

        chkHide.setChecked(currentHideNames);

        if (a instanceof BaseActivity) {
            BaseActivity ba = (BaseActivity) a;
            ba.applyFocusScale(optDefault, 1.03f);
            ba.applyFocusScale(optAdded, 1.03f);
            ba.applyFocusScale(optAsc, 1.03f);
            ba.applyFocusScale(optDesc, 1.03f);
            ba.applyFocusScale(chkHide, 1.03f);
            ba.applyFocusScale(btnClose, 1.1f);
            ba.applyFocusScale(btnCancel, 1.05f);
            ba.applyFocusScale(btnSave, 1.05f);
        }

        btnClose.setOnClickListener(v -> d.dismiss());
        btnCancel.setOnClickListener(v -> d.dismiss());

        btnSave.setOnClickListener(v -> {
            String newSort = "default";
            int checkedId = group.getCheckedRadioButtonId();
            if (checkedId == R.id.sort_opt_added) newSort = "added";
            else if (checkedId == R.id.sort_opt_asc) newSort = "asc";
            else if (checkedId == R.id.sort_opt_desc) newSort = "desc";

            boolean newHide = chkHide.isChecked();
            d.dismiss();
            if (callback != null) callback.onApply(newSort, newHide);
        });

        d.show();
        btnSave.requestFocus();
    }
}
