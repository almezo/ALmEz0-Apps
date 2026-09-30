package com.almezo.servers.nat;

import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.View;

import java.util.Locale;

/**
 * عدّاد قياس السرعة: قوس 240 درجة بتدرج لوني (أحمر للبطيء حتى البنفسجي للسريع)، وعلامات
 * مرقّمة بمقياس غير خطي (0 5 10 25 50 100 200) حتى تظهر الفروق في السرعات الشائعة عند زبائننا
 * بدل أن تتكدس كلها في أول القوس، وإبرة تتحرك بنعومة نحو القيمة، والرقم في المنتصف.
 * نفس تصميم عدّاد مشغل الكمبيوتر (splayer.js ← MizoSpeedTest).
 */
public class SpeedGaugeView extends View {

    /** نقاط المقياس: كل مقطع بينها يأخذ جزءاً متساوياً من القوس. */
    public static final float[] STOPS = {0, 5, 10, 25, 50, 100, 200};
    private static final int[] COLORS = {
            0xFFEF4444, 0xFFF97316, 0xFFEAB308, 0xFF22C55E, 0xFF06B6D4, 0xFF3B82F6, 0xFFA855F7
    };
    private static final float START_ANGLE = 150f;
    private static final float SWEEP = 240f;

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tick = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint needle = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hub = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint value = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint unit = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF arc = new RectF();
    private final Path needlePath = new Path();

    private float target = 0f;
    private float shown = 0f;
    private boolean active = false;
    private final float dp;

    public SpeedGaugeView(Context c) { this(c, null); }

    public SpeedGaugeView(Context c, AttributeSet a) {
        super(c, a);
        dp = getResources().getDisplayMetrics().density;
        setLayerType(LAYER_TYPE_SOFTWARE, null); // BlurMaskFilter للتوهج يحتاج الرسم البرمجي
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeCap(Paint.Cap.ROUND);
        track.setColor(0x14FFFFFF);
        fill.setStyle(Paint.Style.STROKE);
        fill.setStrokeCap(Paint.Cap.ROUND);
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeCap(Paint.Cap.ROUND);
        glow.setMaskFilter(new BlurMaskFilter(10 * dp, BlurMaskFilter.Blur.NORMAL));
        tick.setStyle(Paint.Style.STROKE);
        tick.setStrokeCap(Paint.Cap.ROUND);
        label.setColor(0xFF94A3B8);
        label.setTextAlign(Paint.Align.CENTER);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        needle.setColor(Color.WHITE);
        needle.setShadowLayer(6 * dp, 0, 0, 0x8006B6D4);
        hub.setColor(0xFF0F172A);
        value.setColor(Color.WHITE);
        value.setTextAlign(Paint.Align.CENTER);
        value.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        unit.setColor(0xFF94A3B8);
        unit.setTextAlign(Paint.Align.CENTER);
    }

    /** السرعة بالميجابت؛ الإبرة والرقم يصلانها تدريجياً. */
    public void setValue(float mbps) {
        target = Math.max(0f, mbps);
        active = true;
        postInvalidateOnAnimation();
    }

    /** إرجاع العدّاد للصفر فوراً (بداية فحص جديد). */
    public void reset() {
        target = 0f;
        shown = 0f;
        active = false;
        invalidate();
    }

    /** موضع السرعة على القوس (0..1) بالمقياس غير الخطي. */
    public static float fraction(float mbps) {
        if (mbps <= 0) return 0f;
        int n = STOPS.length - 1;
        for (int i = 0; i < n; i++) {
            if (mbps <= STOPS[i + 1]) {
                float seg = (mbps - STOPS[i]) / (STOPS[i + 1] - STOPS[i]);
                return (i + seg) / n;
            }
        }
        return 1f;
    }

    @Override
    protected void onMeasure(int w, int h) {
        int width = MeasureSpec.getSize(w);
        // ارتفاع القوس (240 درجة) أقل من عرضه
        setMeasuredDimension(width, Math.round(width * 0.86f));
    }

    @Override
    protected void onDraw(Canvas c) {
        super.onDraw(c);
        float w = getWidth(), h = getHeight();
        float stroke = w * 0.055f;
        float r = w * 0.38f;
        float cx = w / 2f, cy = w * 0.44f;
        arc.set(cx - r, cy - r, cx + r, cy + r);

        // اقتراب ناعم من القيمة المستهدفة (يبدو كإبرة حقيقية لا قفزات)
        float diff = target - shown;
        if (Math.abs(diff) > 0.02f) {
            shown += diff * 0.14f;
            postInvalidateOnAnimation();
        } else {
            shown = target;
        }
        float frac = fraction(shown);

        track.setStrokeWidth(stroke);
        c.drawArc(arc, START_ANGLE, SWEEP, false, track);

        // تدرج لوني على امتداد القوس: SweepGradient يبدأ من الزاوية صفر فنديره لبداية القوس
        // يبدأ التدرج قبل القوس بقليل: غطاء الخط الدائري عند بدايته كان يقع قبل زاوية الصفر
        // فيأخذ آخر لون (البنفسجي) بدل الأحمر
        final float lead = 8f;
        float[] pos = new float[COLORS.length];
        for (int i = 0; i < pos.length; i++) pos[i] = (lead + SWEEP * i / (pos.length - 1)) / 360f;
        SweepGradient g = new SweepGradient(cx, cy, COLORS, pos);
        Matrix m = new Matrix();
        m.setRotate(START_ANGLE - lead, cx, cy);
        g.setLocalMatrix(m);
        fill.setShader(g);
        fill.setStrokeWidth(stroke);
        glow.setShader(g);
        glow.setStrokeWidth(stroke * 1.3f);
        if (frac > 0.001f) {
            if (active) c.drawArc(arc, START_ANGLE, SWEEP * frac, false, glow);
            c.drawArc(arc, START_ANGLE, SWEEP * frac, false, fill);
        }

        // العلامات والأرقام
        label.setTextSize(w * 0.042f);
        int n = STOPS.length - 1;
        for (int i = 0; i <= n * 2; i++) {
            float f = i / (float) (n * 2);
            double ang = Math.toRadians(START_ANGLE + SWEEP * f);
            boolean major = i % 2 == 0;
            float r1 = r - stroke * 0.9f, r2 = r1 - (major ? stroke * 0.7f : stroke * 0.4f);
            tick.setStrokeWidth(major ? 2.4f * dp : 1.4f * dp);
            tick.setColor(f <= frac + 0.0001f ? 0xFFE2E8F0 : 0x40FFFFFF);
            c.drawLine(cx + (float) Math.cos(ang) * r1, cy + (float) Math.sin(ang) * r1,
                    cx + (float) Math.cos(ang) * r2, cy + (float) Math.sin(ang) * r2, tick);
            if (major) {
                float rl = r2 - w * 0.05f;
                String t = String.valueOf((int) STOPS[i / 2]);
                c.drawText(t, cx + (float) Math.cos(ang) * rl, cy + (float) Math.sin(ang) * rl + label.getTextSize() * 0.35f, label);
            }
        }

        // الإبرة
        double na = Math.toRadians(START_ANGLE + SWEEP * frac);
        float len = r - stroke * 1.2f, base = w * 0.018f;
        float tx = cx + (float) Math.cos(na) * len, ty = cy + (float) Math.sin(na) * len;
        float px = (float) -Math.sin(na) * base, py = (float) Math.cos(na) * base;
        needlePath.reset();
        needlePath.moveTo(tx, ty);
        needlePath.lineTo(cx + px, cy + py);
        needlePath.lineTo(cx - px, cy - py);
        needlePath.close();
        c.drawPath(needlePath, needle);
        c.drawCircle(cx, cy, w * 0.034f, needle);
        c.drawCircle(cx, cy, w * 0.018f, hub);

        // الرقم أسفل المركز
        value.setTextSize(w * 0.13f);
        unit.setTextSize(w * 0.045f);
        // الرقم تحت مستوى الإبرة عند أدنى القوس حتى لا تمر فوقه في السرعات المنخفضة
        c.drawText(String.format(Locale.US, "%.1f", shown), cx, cy + r * 0.86f, value);
        c.drawText("Mbps", cx, cy + r * 0.86f + unit.getTextSize() * 1.4f, unit);
    }
}
