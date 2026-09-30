package com.almezo.servers;

import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import java.util.ArrayDeque;

/**
 * مؤشر صحة الاتصال داخل المشغل.
 *
 * السرعة تُقاس من بايتات الفيديو نفسه أثناء التحميل الفعلي فقط (بلا أي اتصال إضافي باللوحة
 * ذات الاتصال الواحد). وحين يمتلئ المخزن يتوقف التحميل، فلا نحسب ذلك الوقت كي لا تظهر السرعة صفراً.
 *
 * الحكم مبني على التقطيع الحقيقي أولاً: إن كان الفيديو يقطّع الآن أو قطّع قبل قليل فالمؤشر أحمر
 * حتى لو بدت السرعة جيدة، فلا يرى المستخدم "ممتاز" وهو يعاني من التقطيع.
 */
final class ConnectionHealth implements TransferListener {

    static final int GOOD = 0, FAIR = 1, POOR = 2;

    // ---- قياس البايتات (يُستدعى من خيط التحميل) ----
    private long bytes;
    private int active;
    private long activeSince;
    private long activeMs;

    // ---- نوافذ القياس (الخيط الرئيسي) ----
    private final ArrayDeque<long[]> samples = new ArrayDeque<>(); // {bytes, activeMs}
    private float lastMbps = -1f;

    // ---- التقطيع ----
    private final ArrayDeque<Long> stalls = new ArrayDeque<>();
    private boolean wasReady;
    private long lastSeekAt;
    private long bufferingSince;

    @Override
    public synchronized void onTransferStart(DataSource source, DataSpec dataSpec, boolean isNetwork) {
        if (!isNetwork) return;
        if (active++ == 0) activeSince = SystemClock.elapsedRealtime();
    }

    @Override
    public synchronized void onBytesTransferred(DataSource source, DataSpec dataSpec, boolean isNetwork, int n) {
        if (isNetwork) bytes += n;
    }

    @Override
    public synchronized void onTransferEnd(DataSource source, DataSpec dataSpec, boolean isNetwork) {
        if (!isNetwork || active == 0) return;
        if (--active == 0) activeMs += SystemClock.elapsedRealtime() - activeSince;
    }

    @Override
    public void onTransferInitializing(DataSource source, DataSpec dataSpec, boolean isNetwork) { }

    /** يُستدعى كل ثانية: يأخذ ما تجمّع منذ آخر مرة ويحدّث متوسط آخر 5 ثوانٍ. */
    void tick() {
        long b, ms;
        synchronized (this) {
            long now = SystemClock.elapsedRealtime();
            if (active > 0) { activeMs += now - activeSince; activeSince = now; }
            b = bytes; ms = activeMs;
            bytes = 0; activeMs = 0;
        }
        samples.addLast(new long[]{b, ms});
        while (samples.size() > 5) samples.removeFirst();
        long sb = 0, sms = 0;
        for (long[] s : samples) { sb += s[0]; sms += s[1]; }
        // أقل من ربع ثانية تحميل = المخزن ممتلئ والتحميل متوقف؛ نُبقي آخر قياس صحيح
        if (sms >= 250) lastMbps = sb * 8f / sms / 1000f;
    }

    /** قيمة بالميجابت، أو -1 قبل أول قياس. */
    float mbps() { return lastMbps; }

    /** تقديم أو تغيير حلقة: التحميل الذي يليه ليس تقطيعاً. */
    void onSeek() { lastSeekAt = SystemClock.elapsedRealtime(); }

    /** فيديو جديد: القياسات السابقة لا تخص هذا الرابط. */
    void reset() {
        synchronized (this) { bytes = 0; activeMs = 0; if (active > 0) activeSince = SystemClock.elapsedRealtime(); }
        samples.clear();
        stalls.clear();
        lastMbps = -1f;
        wasReady = false;
        bufferingSince = 0;
    }

    /** من onPlaybackStateChanged. */
    void onState(boolean ready, boolean buffering, boolean idle, boolean playWhenReady) {
        long now = SystemClock.elapsedRealtime();
        if (idle) { wasReady = false; bufferingSince = 0; return; }
        if (buffering) {
            if (bufferingSince == 0) bufferingSince = now;
            // توقف بعد أن كان الفيديو يعمل، وليس بسبب تقديم من المستخدم = تقطيع حقيقي
            if (wasReady && playWhenReady && now - lastSeekAt > 2000) stalls.addLast(now);
            wasReady = false;
        } else {
            bufferingSince = 0;
            if (ready) wasReady = true;
        }
    }

    /** الحالة الحالية بناءً على التقطيع أولاً ثم المخزن ثم السرعة. */
    int verdict(long bufferedAheadMs, boolean playWhenReady, int videoBitrate) {
        long now = SystemClock.elapsedRealtime();
        while (!stalls.isEmpty() && now - stalls.peekFirst() > 90_000) stalls.removeFirst();
        int recent = 0;
        long last = 0;
        for (Long t : stalls) { if (now - t <= 60_000) recent++; last = t; }

        boolean stallingNow = playWhenReady && bufferingSince > 0 && now - bufferingSince > 700
                && now - lastSeekAt > 2000;
        if (stallingNow && !stalls.isEmpty()) return POOR;
        if (recent >= 2 || (last > 0 && now - last <= 30_000)) return POOR;
        if (last > 0) return FAIR; // تقطيع قبل 30-90 ثانية: لم يستقر بعد
        if (stallingNow) return FAIR; // أول تحميل طويل بعد الفتح/التقديم
        if (playWhenReady && bufferedAheadMs >= 0 && bufferedAheadMs < 3000 && wasReady) return FAIR;
        if (videoBitrate > 0 && lastMbps > 0 && lastMbps * 1_000_000f < videoBitrate * 1.2f) return FAIR;
        return GOOD;
    }

    boolean stallingNow() {
        return bufferingSince > 0 && SystemClock.elapsedRealtime() - bufferingSince > 700;
    }

    static String label(int v) {
        switch (v) {
            case POOR: return "ضعيف · تقطيع";
            case FAIR: return "متوسط";
            default: return "ممتاز";
        }
    }

    static int color(int v) {
        switch (v) {
            case POOR: return 0xFFEF4444;
            case FAIR: return 0xFFEAB308;
            default: return 0xFF22C55E;
        }
    }

    @Nullable
    static String mbpsText(float m) {
        if (m < 0) return null;
        return String.format(java.util.Locale.US, m >= 10 ? "%.0f Mbps" : "%.1f Mbps", m);
    }
}
