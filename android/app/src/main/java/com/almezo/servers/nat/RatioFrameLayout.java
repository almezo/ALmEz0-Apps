package com.almezo.servers.nat;

import android.content.Context;
import android.util.AttributeSet;
import android.widget.FrameLayout;

/**
 * صندوق بنسبة ارتفاع/عرض ثابتة (2:3 للملصقات). يُحسب الارتفاع أثناء القياس مباشرة من العرض،
 * فلا يعتمد على أي حيلة CSS، ولا يمكن أن تتراكب الصفوف كما حدث في نسخة الويب.
 */
public class RatioFrameLayout extends FrameLayout {

    private float ratio = 1.5f;

    public RatioFrameLayout(Context c) { super(c); }
    public RatioFrameLayout(Context c, AttributeSet a) { super(c, a); }
    public RatioFrameLayout(Context c, AttributeSet a, int s) { super(c, a, s); }

    public void setRatio(float heightOverWidth) {
        if (heightOverWidth > 0 && heightOverWidth != ratio) {
            ratio = heightOverWidth;
            requestLayout();
        }
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int height = Math.round(width * ratio);
        super.onMeasure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }
}
