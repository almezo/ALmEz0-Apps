package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.TextView;

import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * نافذة قياس سرعة الإنترنت الأصلية لشاشات وأجهزة أندرويد (Speed Test Dialog).
 * عدّاد بإبرة (SpeedGaugeView) ومراحل واضحة (الاستجابة ← التحميل ← الثبات) ورسم حيّ لتذبذب
 * السرعة (SpeedSparkView)، ثم توصية ذكية تجمع السرعة والثبات، وشرائح للجودات التي يتحملها
 * الاتصال، وسجل آخر 5 فحوصات. نفس تصميم ومنطق فحص مشغل الكمبيوتر (splayer.js ← MizoSpeedTest).
 */
public final class SpeedTestDialog {

    /** حراسة داخل النافذة الواحدة فقط: علم ثابت واحد كان يبقى مرفوعاً بعد إغلاق
     *  النافذة أثناء الفحص، فيبدو زر البدء معطلاً بصمت عند إعادة الفتح. */
    private static final class TestState {
        volatile boolean isTesting = false;
        volatile boolean cancelRequested = false;
    }

    /** عناصر النافذة مجمعة حتى لا تمر عشرات المعاملات بين الدوال. */
    private static final class Ui {
        Button btnStart;
        SpeedGaugeView gauge;
        SpeedSparkView spark;
        TextView status, warning, dl, ping, jitter, recBadge, recDesc, history;
        TextView phasePing, phaseDl, phaseStable;
        TextView[] chips;
    }

    private static final String HISTORY_KEY = "speed_test_history";
    private static final int PHASE_IDLE = 0xFF475569, PHASE_ACTIVE = 0xFF06B6D4, PHASE_DONE = 0xFF22C55E;

    /** حدود الجودات (ميجابت فعلية بعد احتساب الثبات): SD / HD / FHD / 4K. */
    static final float[] QUALITY_MIN = {1.5f, 4f, 10f, 25f};

    private SpeedTestDialog() { }

    public static void show(Activity a) {
        if (a == null || a.isFinishing()) return;

        final boolean en = Lang.isEnglish(a);
        final TestState state = new TestState();
        final Dialog d = new NatDialog(a);
        d.setContentView(R.layout.nat_dialog_speed_test);
        if (d.getWindow() != null) {
            d.getWindow().setLayout(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        com.almezo.servers.nat.Ui.widenDialogCard(d, R.id.dialog_speed_card, 720);

        final TextView titleEl = d.findViewById(R.id.dialog_speed_title);
        final TextView subEl = d.findViewById(R.id.dialog_speed_subtitle);
        final ImageButton closeTop = d.findViewById(R.id.dialog_speed_close);
        final Button closeBottom = d.findViewById(R.id.btn_speed_close_bottom);

        final Ui ui = new Ui();
        ui.btnStart = d.findViewById(R.id.btn_speed_start);
        ui.gauge = d.findViewById(R.id.speed_gauge);
        ui.spark = d.findViewById(R.id.speed_spark);
        ui.status = d.findViewById(R.id.tv_speed_status);
        ui.warning = d.findViewById(R.id.tv_speed_warning);
        ui.dl = d.findViewById(R.id.tv_metric_dl);
        ui.ping = d.findViewById(R.id.tv_metric_ping);
        ui.jitter = d.findViewById(R.id.tv_metric_jitter);
        ui.recBadge = d.findViewById(R.id.tv_recommend_badge);
        ui.recDesc = d.findViewById(R.id.tv_recommend_desc);
        ui.history = d.findViewById(R.id.tv_speed_history);
        ui.phasePing = d.findViewById(R.id.phase_ping);
        ui.phaseDl = d.findViewById(R.id.phase_dl);
        ui.phaseStable = d.findViewById(R.id.phase_stable);
        ui.chips = new TextView[]{d.findViewById(R.id.chip_q_sd), d.findViewById(R.id.chip_q_hd),
                d.findViewById(R.id.chip_q_fhd), d.findViewById(R.id.chip_q_4k)};

        final TextView labelDl = d.findViewById(R.id.label_metric_dl);
        final TextView labelPing = d.findViewById(R.id.label_metric_ping);
        final TextView labelJitter = d.findViewById(R.id.label_metric_jitter);

        if (en) {
            if (titleEl != null) titleEl.setText("Internet Speed Test");
            if (subEl != null) subEl.setText("Check network speed and recommended streaming quality");
            ui.status.setText("Ready to test");
            if (labelDl != null) labelDl.setText("Download");
            if (labelPing != null) labelPing.setText("Ping");
            if (labelJitter != null) labelJitter.setText("Jitter");
            ui.recBadge.setText("📺 Awaiting test...");
            ui.recDesc.setText("Press Start Test to check your streaming capability.");
            ui.btnStart.setText("Start Test");
            ui.phasePing.setText("● Ping");
            ui.phaseDl.setText("● Download");
            ui.phaseStable.setText("● Stability");
            if (closeBottom != null) closeBottom.setText("Close");
        }
        for (TextView chip : ui.chips) paintChip(chip, 0);
        showHistory(a, ui, en);
        showBusyWarning(a, ui, en);

        if (a instanceof BaseActivity) {
            BaseActivity.applyFocusScale(ui.btnStart, 1.05f);
            BaseActivity.applyFocusScale(closeBottom, 1.05f);
            BaseActivity.applyFocusScale(closeTop, 1.1f);
        }

        View.OnClickListener dismissAction = v -> {
            state.cancelRequested = true;
            d.dismiss();
        };
        closeTop.setOnClickListener(dismissAction);
        closeBottom.setOnClickListener(dismissAction);

        ui.btnStart.setOnClickListener(v -> {
            if (state.isTesting) return;
            startTest(a, d, state, en, ui);
        });

        d.setOnDismissListener(dialog -> state.cancelRequested = true);

        d.show();
        ui.btnStart.requestFocus();
    }

    /**
     * تنزيل جارٍ في التطبيق يقاسم الفحص نفس الإنترنت فتظهر السرعة أقل من حقيقتها، والعميل يظنها
     * ضعفاً في خطه. نخبره قبل الفحص بدل أن يرسل لنا نتيجة مضلِّلة.
     */
    private static void showBusyWarning(Activity a, Ui ui, boolean en) {
        boolean downloading = false;
        try {
            Downloads.Item cur = Downloads.get(a).current();
            downloading = cur != null && cur.isActive();
        } catch (Throwable ignored) { }
        if (downloading) {
            ui.warning.setText(en ? "⚠ A download is running, the result will be lower than your real speed"
                    : "⚠ يوجد تنزيل جارٍ الآن، ستظهر السرعة أقل من سرعتك الحقيقية");
            ui.warning.setVisibility(View.VISIBLE);
        } else {
            ui.warning.setVisibility(View.GONE);
        }
    }

    /** نبضة واحدة: ترجع زمن الاستجابة بالمللي، أو -1 عند الفشل أو في النبضة التمهيدية. */
    private static long pingOnce(int tag, boolean warmupOnly) {
        long t0 = SystemClock.elapsedRealtime();
        try {
            URL u = new URL("https://speed.cloudflare.com/__down?bytes=0&nocache="
                    + System.currentTimeMillis() + "_" + tag);
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
            conn.setUseCaches(false);
            conn.connect();
            int code = conn.getResponseCode();
            // استهلاك الجسم (صفر بايت) وإغلاق التيار فقط: بلا disconnect يبقى الاتصال
            // في المجمع فتقيس النبضات التالية زمن الشبكة الحقيقي
            InputStream is = conn.getInputStream();
            byte[] sink = new byte[512];
            while (is.read(sink) != -1) { /* no-op */ }
            is.close();
            if (warmupOnly || code <= 0) return -1;
            return SystemClock.elapsedRealtime() - t0;
        } catch (Throwable ignored) {
            return -1;
        }
    }

    private static void phase(TextView v, int color) {
        if (v != null) v.setTextColor(color);
    }

    private static void startTest(Activity a, Dialog d, TestState state, boolean en, Ui ui) {
        state.isTesting = true;
        state.cancelRequested = false;

        ui.btnStart.setEnabled(false);
        ui.btnStart.setText(en ? "Testing..." : "جاري الفحص...");
        ui.status.setText(en ? "Measuring ping & latency..." : "جاري فحص سرعة الاستجابة (Ping)...");
        ui.gauge.reset();
        ui.spark.clear();
        ui.dl.setText("-- Mbps");
        ui.ping.setText("-- ms");
        ui.jitter.setText("-- ms");
        phase(ui.phasePing, PHASE_ACTIVE);
        phase(ui.phaseDl, PHASE_IDLE);
        phase(ui.phaseStable, PHASE_IDLE);
        for (TextView chip : ui.chips) paintChip(chip, 0);
        showBusyWarning(a, ui, en);

        new Thread(() -> {
            try {
                // 1. اختبار Ping و Jitter
                // نبضة تمهيدية مهملة تتحمل كلفة DNS + TLS، وبعدها لا نقطع الاتصال
                // (disconnect بعد كل نبضة كان يعيد TCP+TLS كل مرة فيصير الرقم زمن اتصال لا RTT)
                pingOnce(0, true);

                List<Long> pings = new ArrayList<>();
                for (int i = 0; i < 5 && !state.cancelRequested; i++) {
                    long rtt = pingOnce(i, false);
                    if (rtt > 0) pings.add(rtt);
                }

                Long minPing = null;
                Long jitter = null;
                if (!pings.isEmpty()) {
                    long min = Long.MAX_VALUE;
                    for (long p : pings) {
                        if (p < min) min = p;
                    }
                    minPing = min;
                    if (pings.size() > 1) {
                        // وسيط الفروق بين النبضات المتتالية. الوسيط لا المتوسط: على خط بطيء
                        // تشذّ نبضة واحدة بشدة فتضخّم الرقم (قياس فعلي: 571 مقابل ping=156).
                        List<Long> diffs = new ArrayList<>();
                        for (int j = 1; j < pings.size(); j++) {
                            diffs.add(Math.abs(pings.get(j) - pings.get(j - 1)));
                        }
                        java.util.Collections.sort(diffs);
                        int mid = diffs.size() / 2;
                        jitter = (diffs.size() % 2 != 0)
                                ? diffs.get(mid)
                                : Math.round((diffs.get(mid - 1) + diffs.get(mid)) / 2.0);
                    } else {
                        jitter = 0L;
                    }
                }

                final Long finalPing = minPing;
                final Long finalJitter = jitter;
                a.runOnUiThread(() -> {
                    if (d.isShowing()) {
                        ui.ping.setText(finalPing == null ? "-- ms" : finalPing + " ms");
                        ui.jitter.setText(finalJitter == null ? "-- ms" : finalJitter + " ms");
                        ui.status.setText(en ? "Testing download speed..." : "جاري قياس سرعة التحميل...");
                        phase(ui.phasePing, PHASE_DONE);
                        phase(ui.phaseDl, PHASE_ACTIVE);
                    }
                });

                if (state.cancelRequested) return;

                // 2. فحص سرعة التحميل (Download): نفس ملفات مشغل الكمبيوتر حتى تتطابق النتيجتان
                String[] testUrls = new String[] {
                        "https://speed.cloudflare.com/__down?bytes=2000000",
                        "https://speed.cloudflare.com/__down?bytes=5000000",
                        "https://speed.cloudflare.com/__down?bytes=10000000"
                };
                // سقف زمني صارم داخل حلقة القراءة نفسها: التحقق بين الحِزم فقط كان يترك
                // حزمة 8 ميجابايت تُقرأ حتى آخرها على خط بطيء (قياس فعلي: 29 ثانية للفحص).
                final long MAX_TEST_MS = 8000L;
                final long MIN_BYTES_FOR_RESULT = 250000L;
                final long WINDOW_MS = 500L;
                boolean deadlineHit = false;

                long totalBytes = 0;
                long startTime = 0;
                double lastSpeed = 0.0;
                byte[] buffer = new byte[8192];
                Throwable lastError = null;
                // سرعات نوافذ قصيرة متتالية: منها الرسم الحي وحساب ثبات الاتصال
                final List<Double> windows = new ArrayList<>();
                long windowStart = 0, windowBytes = 0;

                for (String urlStr : testUrls) {
                    if (state.cancelRequested) break;
                    try {
                        URL dlUrl = new URL(urlStr + "&nocache=" + System.currentTimeMillis());
                        HttpURLConnection conn = (HttpURLConnection) dlUrl.openConnection();
                        conn.setConnectTimeout(5000);
                        conn.setReadTimeout(6000);
                        conn.setUseCaches(false);
                        conn.connect();

                        InputStream is = conn.getInputStream();
                        // المؤقت يبدأ بعد وصول الترويسة: زمن DNS/TLS/TTFB ليس زمن نقل بيانات
                        if (startTime == 0) { startTime = SystemClock.elapsedRealtime(); windowStart = startTime; }
                        int read;
                        long lastUiUpdate = 0;

                        while ((read = is.read(buffer)) != -1 && !state.cancelRequested) {
                            totalBytes += read;
                            windowBytes += read;
                            long now = SystemClock.elapsedRealtime();
                            if ((now - startTime) > MAX_TEST_MS && totalBytes > MIN_BYTES_FOR_RESULT) {
                                deadlineHit = true;
                                break;
                            }
                            if (now - windowStart >= WINDOW_MS) {
                                final double w = (windowBytes * 8.0) / ((now - windowStart) / 1000.0 * 1000000.0);
                                windows.add(w);
                                windowStart = now;
                                windowBytes = 0;
                                a.runOnUiThread(() -> { if (d.isShowing()) ui.spark.add((float) w); });
                            }
                            if (now - lastUiUpdate > 100) {
                                lastUiUpdate = now;
                                double elapsedSec = (now - startTime) / 1000.0;
                                if (elapsedSec > 0.1) {
                                    final double curMbps = (totalBytes * 8.0) / (elapsedSec * 1000000.0);
                                    lastSpeed = curMbps;
                                    a.runOnUiThread(() -> { if (d.isShowing()) ui.gauge.setValue((float) curMbps); });
                                }
                            }
                        }
                        is.close();
                        conn.disconnect();
                    } catch (Throwable dlErr) {
                        lastError = dlErr;
                        break;
                    }

                    if (deadlineHit) break;
                    if (startTime > 0 && (SystemClock.elapsedRealtime() - startTime) > 4000 && totalBytes > 3000000) break;
                }

                if (state.cancelRequested) return;

                // لا بايتات = لا اتصال: خطأ صريح، لا 0.0 ميجابت مع توصية بجودة SD
                if (totalBytes <= 0) {
                    throw (lastError != null ? lastError : new java.io.IOException("no-bytes-received"));
                }

                long totalDuration = SystemClock.elapsedRealtime() - startTime;
                double finalMbps = totalDuration > 0
                        ? (totalBytes * 8.0) / ((totalDuration / 1000.0) * 1000000.0)
                        : lastSpeed;

                final double speed = finalMbps;
                final double stability = stabilityScore(windows, finalJitter);
                final Long pingForHistory = finalPing;

                a.runOnUiThread(() -> {
                    if (!d.isShowing()) return;
                    ui.gauge.setValue((float) speed);
                    ui.dl.setText(String.format(Locale.US, "%.1f Mbps", speed));
                    phase(ui.phaseDl, PHASE_DONE);
                    phase(ui.phaseStable, PHASE_DONE);
                    ui.status.setText(stabilityText(stability, en));
                    applyRecommendation(ui, speed, stability, en);
                    saveHistory(a, speed, pingForHistory);
                    showHistory(a, ui, en);
                });

            } catch (Throwable t) {
                a.runOnUiThread(() -> {
                    if (!d.isShowing()) return;
                    ui.status.setText(en ? "No connection" : "لا يوجد اتصال بالإنترنت");
                    ui.gauge.reset();
                    ui.dl.setText("-- Mbps");
                    phase(ui.phasePing, PHASE_IDLE);
                    phase(ui.phaseDl, PHASE_IDLE);
                    phase(ui.phaseStable, PHASE_IDLE);
                    ui.recBadge.setTextColor(0xFFEF4444);
                    ui.recBadge.setText(en ? "⚠️ Test failed" : "⚠️ تعذر إتمام الفحص");
                    ui.recDesc.setText(en
                            ? "Could not reach the test server. Check your internet connection or router, then try again."
                            : "تعذر الوصول إلى سيرفر الفحص. تأكد من اتصالك بالإنترنت أو افحص الراوتر ثم أعد المحاولة.");
                });
            } finally {
                state.isTesting = false;
                a.runOnUiThread(() -> {
                    if (d.isShowing()) {
                        ui.btnStart.setEnabled(true);
                        ui.btnStart.setText(en ? "Test Again" : "إعادة الفحص");
                    }
                });
            }
        }).start();
    }

    /**
     * ثبات الاتصال من 0 (متقطع) إلى 1 (ثابت تماماً): معامل تغيّر سرعات النوافذ القصيرة
     * (بعد تجاهل أول نافذتين حيث يتسارع TCP طبيعياً)، مع خصم إن كان Jitter مرتفعاً.
     * نفس المعادلة في مشغل الكمبيوتر (mizoStability).
     */
    static double stabilityScore(List<Double> windows, Long jitterMs) {
        List<Double> w = windows.size() > 4 ? windows.subList(2, windows.size()) : windows;
        double score = 1.0;
        if (w.size() >= 3) {
            double sum = 0;
            for (double v : w) sum += v;
            double mean = sum / w.size();
            if (mean > 0) {
                double var = 0;
                for (double v : w) var += (v - mean) * (v - mean);
                double cv = Math.sqrt(var / w.size()) / mean;
                score = Math.max(0, Math.min(1, 1 - (cv - 0.25) / 0.75));
            }
        }
        if (jitterMs != null && jitterMs > 30) score -= Math.min(0.3, (jitterMs - 30) / 200.0);
        return Math.max(0, Math.min(1, score));
    }

    private static String stabilityText(double s, boolean en) {
        if (s >= 0.7) return en ? "Test completed · Stable connection ✓" : "اكتمل الفحص · اتصال ثابت ✓";
        if (s >= 0.4) return en ? "Test completed · Slight fluctuation" : "اكتمل الفحص · تذبذب خفيف في الاتصال";
        return en ? "Test completed · Unstable connection ⚠" : "اكتمل الفحص · الاتصال متذبذب ⚠";
    }

    /** 0 رمادي (لا يتحمل) · 1 أصفر (على الحافة) · 2 أخضر (مناسب). */
    private static void paintChip(TextView chip, int level) {
        if (chip == null) return;
        float dp = chip.getResources().getDisplayMetrics().density;
        int color = level == 2 ? 0xFF22C55E : level == 1 ? 0xFFF59E0B : 0xFF475569;
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(20 * dp);
        bg.setColor((color & 0x00FFFFFF) | 0x22000000);
        bg.setStroke(Math.round(1.2f * dp), color);
        chip.setBackground(bg);
        chip.setTextColor(level == 0 ? 0xFF64748B : color);
        String base = chip.getText().toString().replace(" ✓", "").replace(" ⚠", "");
        chip.setText(level == 2 ? base + " ✓" : level == 1 ? base + " ⚠" : base);
    }

    /**
     * التوصية تجمع السرعة والثبات: اتصال سريع لكنه متقطع لا يحتمل الجودة التي يوحي بها رقمه،
     * فنحسب "السرعة الفعلية للبث" = السرعة × (0.6 + 0.4 × الثبات).
     */
    private static void applyRecommendation(Ui ui, double speed, double stability, boolean en) {
        double effective = speed * (0.6 + 0.4 * stability);
        for (int i = 0; i < ui.chips.length; i++) {
            float min = QUALITY_MIN[i];
            paintChip(ui.chips[i], effective >= min ? 2 : effective >= min * 0.8 ? 1 : 0);
        }
        boolean shaky = stability < 0.4;
        if (effective >= 25.0) {
            ui.recBadge.setTextColor(0xFF22C55E);
            ui.recBadge.setText(en ? "✓ 4K Ultra HD Streaming" : "✓ مناسب لبث 4K فائق الدقة");
            ui.recDesc.setText(en
                    ? "Excellent! 4K movies and live sports will play smoothly."
                    : "سرعة ممتازة! جاهز لتشغيل الأفلام والمباريات بدقة 4K بدون تقطيع.");
        } else if (effective >= 10.0) {
            ui.recBadge.setTextColor(0xFF38BDF8);
            ui.recBadge.setText(en ? "✓ FHD 1080p · 4K may buffer" : "✓ مناسب لـ FHD 1080p، أما 4K فقد يتقطع");
            ui.recDesc.setText(en
                    ? "Very good for FHD live matches and movies. Choose FHD if a channel offers 4K."
                    : "ممتاز للمباريات والأفلام بجودة FHD. إن توفرت القناة بجودة 4K فاختر FHD لمشاهدة بلا تقطيع.");
        } else if (effective >= 4.0) {
            ui.recBadge.setTextColor(0xFFEAB308);
            ui.recBadge.setText(en ? "📺 HD 720p Recommended" : "📺 موصى بجودة HD 720p");
            ui.recDesc.setText(en
                    ? "Moderate connection. Choose HD channels for smooth playback."
                    : "اتصال متوسط. اختر القنوات بجودة HD لضمان مشاهدة بلا توقف.");
        } else {
            ui.recBadge.setTextColor(0xFFEF4444);
            ui.recBadge.setText(en ? "⚠️ SD Quality Recommended" : "⚠️ موصى بجودة SD العادية");
            ui.recDesc.setText(en
                    ? "Low speed. Use SD channels, or check your router."
                    : "السرعة ضعيفة حالياً. اختر قنوات SD العادية، أو افحص الراوتر.");
        }
        if (shaky) {
            ui.recDesc.setText(ui.recDesc.getText() + (en
                    ? " Your connection fluctuates; restarting the router or moving closer to it may help."
                    : " اتصالك متذبذب: إعادة تشغيل الراوتر أو الاقتراب منه قد يحسّن الثبات."));
        }
    }

    // ------------------------------------------------------------------ سجل آخر الفحوصات

    private static void saveHistory(Activity a, double speed, Long ping) {
        try {
            Store store = new Store(a);
            JSONArray old = new JSONArray(store.getString(HISTORY_KEY, "[]"));
            JSONArray arr = new JSONArray();
            arr.put(new JSONObject().put("t", System.currentTimeMillis()).put("s", Math.round(speed * 10) / 10.0)
                    .put("p", ping == null ? -1 : ping));
            for (int i = 0; i < old.length() && arr.length() < 5; i++) arr.put(old.get(i));
            store.putString(HISTORY_KEY, arr.toString());
        } catch (Throwable ignored) { }
    }

    private static void showHistory(Activity a, Ui ui, boolean en) {
        try {
            JSONArray arr = new JSONArray(new Store(a).getString(HISTORY_KEY, "[]"));
            if (arr.length() == 0) { ui.history.setVisibility(View.GONE); return; }
            SimpleDateFormat f = new SimpleDateFormat("d/M HH:mm", Locale.US);
            StringBuilder sb = new StringBuilder(en ? "Recent tests:  " : "آخر الفحوصات:  ");
            for (int i = 0; i < Math.min(3, arr.length()); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (i > 0) sb.append("  •  ");
                // كل قراءة معزولة باتجاه LTR (LRI...PDI): خلط الأرقام والإنجليزية في سطر عربي يبعثر ترتيبها
                sb.append('\u2066').append(String.format(Locale.US, "%.1f\u00A0Mbps", o.optDouble("s")))
                        .append("\u00A0(").append(f.format(new Date(o.optLong("t")))).append(')').append('\u2069');
            }
            ui.history.setText(sb.toString());
            ui.history.setVisibility(View.VISIBLE);
        } catch (Throwable ignored) {
            ui.history.setVisibility(View.GONE);
        }
    }
}
