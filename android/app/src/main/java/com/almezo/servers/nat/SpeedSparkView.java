package com.almezo.servers.nat;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/**
 * رسم حيّ صغير لتذبذب السرعة أثناء الفحص: يرى العميل هل اتصاله ثابت أم متقطع، وهذا ما يحدد
 * سلاسة البث أكثر من الرقم النهائي وحده.
 */
public class SpeedSparkView extends View {

    private final List<Float> samples = new ArrayList<>();
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint area = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();

    public SpeedSparkView(Context c) { this(c, null); }

    public SpeedSparkView(Context c, AttributeSet a) {
        super(c, a);
        float dp = getResources().getDisplayMetrics().density;
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(2.2f * dp);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor(0xFF06B6D4);
        base.setColor(0x14FFFFFF);
        base.setStrokeWidth(1f * dp);
    }

    public void clear() {
        samples.clear();
        invalidate();
    }

    public void add(float mbps) {
        samples.add(Math.max(0f, mbps));
        if (samples.size() > 60) samples.remove(0);
        invalidate();
    }

    public List<Float> samples() {
        return new ArrayList<>(samples);
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        c.drawLine(0, h - 1, w, h - 1, base);
        if (samples.size() < 2) return;
        float max = 1f;
        for (float s : samples) max = Math.max(max, s);
        max *= 1.15f;
        float step = w / (samples.size() - 1);
        path.reset();
        for (int i = 0; i < samples.size(); i++) {
            float x = w - i * step; // من اليمين لليسار مع اتجاه الواجهة العربية
            float y = h - (samples.get(i) / max) * (h - 4);
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        Path fillPath = new Path(path);
        fillPath.lineTo(w - (samples.size() - 1) * step, h);
        fillPath.lineTo(w, h);
        fillPath.close();
        area.setShader(new LinearGradient(0, 0, 0, h, 0x6606B6D4, 0x0006B6D4, Shader.TileMode.CLAMP));
        c.drawPath(fillPath, area);
        c.drawPath(path, line);
    }
}
