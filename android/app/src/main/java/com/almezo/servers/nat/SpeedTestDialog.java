package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.almezo.servers.R;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * نافذة قياس سرعة الإنترنت الأصلية لشاشات وأجهزة أندرويد (Speed Test Dialog).
 * تحسب سرعة التحميل الفعلي بالميجابت، والاستجابة (Ping) والتقلب (Jitter)
 * وتقدم توصية بجودة البث الأنسب (4K / FHD / HD / SD).
 */
public final class SpeedTestDialog {

    /** حراسة داخل النافذة الواحدة فقط: علم ثابت واحد كان يبقى مرفوعاً بعد إغلاق
     *  النافذة أثناء الفحص، فيبدو زر البدء معطلاً بصمت عند إعادة الفتح. */
    private static final class TestState {
        volatile boolean isTesting = false;
        volatile boolean cancelRequested = false;
    }

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
        Ui.widenDialogCard(d, R.id.dialog_speed_card, 720);

        final TextView titleEl = d.findViewById(R.id.dialog_speed_title);
        final TextView subEl = d.findViewById(R.id.dialog_speed_subtitle);
        final ImageButton closeTop = d.findViewById(R.id.dialog_speed_close);
        final Button closeBottom = d.findViewById(R.id.btn_speed_close_bottom);
        final Button btnStart = d.findViewById(R.id.btn_speed_start);

        final TextView tvVal = d.findViewById(R.id.tv_speed_val);
        final TextView tvStatus = d.findViewById(R.id.tv_speed_status);
        final ProgressBar progressBar = d.findViewById(R.id.progress_speed);

        final TextView labelDl = d.findViewById(R.id.label_metric_dl);
        final TextView tvDl = d.findViewById(R.id.tv_metric_dl);
        final TextView labelPing = d.findViewById(R.id.label_metric_ping);
        final TextView tvPing = d.findViewById(R.id.tv_metric_ping);
        final TextView labelJitter = d.findViewById(R.id.label_metric_jitter);
        final TextView tvJitter = d.findViewById(R.id.tv_metric_jitter);

        final TextView tvRecBadge = d.findViewById(R.id.tv_recommend_badge);
        final TextView tvRecDesc = d.findViewById(R.id.tv_recommend_desc);

        if (en) {
            if (titleEl != null) titleEl.setText("Internet Speed Test");
            if (subEl != null) subEl.setText("Check network speed and recommended streaming quality");
            if (tvStatus != null) tvStatus.setText("Ready to test");
            if (labelDl != null) labelDl.setText("Download");
            if (labelPing != null) labelPing.setText("Ping");
            if (labelJitter != null) labelJitter.setText("Jitter");
            if (tvRecBadge != null) tvRecBadge.setText("📺 Awaiting test...");
            if (tvRecDesc != null) tvRecDesc.setText("Press Start Test to check your streaming capability.");
            if (btnStart != null) btnStart.setText("Start Test");
            if (closeBottom != null) closeBottom.setText("Close");
        }

        if (a instanceof BaseActivity) {
            BaseActivity ba = (BaseActivity) a;
            ba.applyFocusScale(btnStart, 1.05f);
            ba.applyFocusScale(closeBottom, 1.05f);
            ba.applyFocusScale(closeTop, 1.1f);
        }

        View.OnClickListener dismissAction = v -> {
            state.cancelRequested = true;
            d.dismiss();
        };
        closeTop.setOnClickListener(dismissAction);
        closeBottom.setOnClickListener(dismissAction);

        btnStart.setOnClickListener(v -> {
            if (state.isTesting) return;
            startTest(a, d, state, en, btnStart, tvVal, tvStatus, progressBar, tvDl, tvPing, tvJitter, tvRecBadge, tvRecDesc);
        });

        d.setOnDismissListener(dialog -> state.cancelRequested = true);

        d.show();
        btnStart.requestFocus();
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

    private static void startTest(
            Activity a, Dialog d, TestState state, boolean en, Button btnStart,
            TextView tvVal, TextView tvStatus, ProgressBar progressBar,
            TextView tvDl, TextView tvPing, TextView tvJitter,
            TextView tvRecBadge, TextView tvRecDesc
    ) {
        state.isTesting = true;
        state.cancelRequested = false;

        btnStart.setEnabled(false);
        btnStart.setText(en ? "Testing..." : "جاري الفحص...");
        tvStatus.setText(en ? "Measuring ping & latency..." : "جاري فحص سرعة الاستجابة (Ping)...");
        tvVal.setText("0.0");
        progressBar.setProgress(0);
        tvDl.setText("-- Mbps");
        tvPing.setText("-- ms");
        tvJitter.setText("-- ms");

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
                        tvPing.setText(finalPing == null ? "-- ms" : finalPing + " ms");
                        tvJitter.setText(finalJitter == null ? "-- ms" : finalJitter + " ms");
                        tvStatus.setText(en ? "Testing download speed..." : "جاري قياس سرعة التحميل...");
                    }
                });

                if (state.cancelRequested) return;

                // 2. فحص سرعة التحميل (Download)
                String[] testUrls = new String[] {
                        "https://speed.cloudflare.com/__down?bytes=3000000",
                        "https://speed.cloudflare.com/__down?bytes=8000000"
                };
                // سقف زمني صارم داخل حلقة القراءة نفسها: التحقق بين الحِزم فقط كان يترك
                // حزمة 8 ميجابايت تُقرأ حتى آخرها على خط بطيء (قياس فعلي: 29 ثانية للفحص).
                final long MAX_TEST_MS = 8000L;
                final long MIN_BYTES_FOR_RESULT = 250000L;
                boolean deadlineHit = false;

                long totalBytes = 0;
                long startTime = 0;
                double lastSpeed = 0.0;
                byte[] buffer = new byte[8192];
                Throwable lastError = null;

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
                        if (startTime == 0) startTime = SystemClock.elapsedRealtime();
                        int read;
                        long lastUiUpdate = 0;

                        while ((read = is.read(buffer)) != -1 && !state.cancelRequested) {
                            totalBytes += read;
                            long now = SystemClock.elapsedRealtime();
                            if ((now - startTime) > MAX_TEST_MS && totalBytes > MIN_BYTES_FOR_RESULT) {
                                deadlineHit = true;
                                break;
                            }
                            if (now - lastUiUpdate > 100) {
                                lastUiUpdate = now;
                                double elapsedSec = (now - startTime) / 1000.0;
                                if (elapsedSec > 0.1) {
                                    final double curMbps = (totalBytes * 8.0) / (elapsedSec * 1000000.0);
                                    lastSpeed = curMbps;
                                    a.runOnUiThread(() -> {
                                        if (d.isShowing()) {
                                            tvVal.setText(String.format(Locale.US, "%.1f", curMbps));
                                            int prog = (int) Math.min((curMbps / 100.0) * 100.0, 100.0);
                                            progressBar.setProgress(prog);
                                        }
                                    });
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
                    if (startTime > 0 && (SystemClock.elapsedRealtime() - startTime) > 4000 && totalBytes > 2000000) break;
                }

                if (state.cancelRequested) return;

                // لا بايتات = لا اتصال: خطأ صريح، لا 0.0 ميجابت مع توصية بجودة SD
                if (totalBytes <= 0) {
                    throw (lastError != null ? lastError : new java.io.IOException("no-bytes-received"));
                }

                long totalDuration = SystemClock.elapsedRealtime() - startTime;
                double finalMbps;
                if (totalDuration > 0) {
                    finalMbps = (totalBytes * 8.0) / ((totalDuration / 1000.0) * 1000000.0);
                } else {
                    finalMbps = lastSpeed;
                }

                final double computedFinalSpeed = finalMbps;

                a.runOnUiThread(() -> {
                    if (!d.isShowing()) return;
                    tvVal.setText(String.format(Locale.US, "%.1f", computedFinalSpeed));
                    tvDl.setText(String.format(Locale.US, "%.1f Mbps", computedFinalSpeed));
                    int prog = (int) Math.min((computedFinalSpeed / 100.0) * 100.0, 100.0);
                    progressBar.setProgress(prog);
                    tvStatus.setText(en ? "Test Completed" : "اكتمل الفحص بنجاح");

                    // تطبيق التوصية
                    if (computedFinalSpeed >= 25.0) {
                        tvRecBadge.setTextColor(0xFF22C55E);
                        tvRecBadge.setText(en ? "✓ 4K Ultra HD Streaming" : "✓ بث فائق الدقة 4K Ultra HD");
                        tvRecDesc.setText(en
                                ? "Your internet speed is excellent! You can stream 4K movies and live sports with peak smoothness."
                                : "سرعة الإنترنت لديك ممتازة جداً! جاهز لتشغيل بث 4K فائق الدقة ومباريات حية بدون أي تقطيع.");
                    } else if (computedFinalSpeed >= 10.0) {
                        tvRecBadge.setTextColor(0xFF38BDF8);
                        tvRecBadge.setText(en ? "✓ FHD 1080p 60fps Streaming" : "✓ بث عالي الدقة FHD 1080p 60fps");
                        tvRecDesc.setText(en
                                ? "Very good speed! Ideal for FHD 1080p live matches and movies with high stability."
                                : "سرعة جيدة جداً! مناسبة تماماً لمشاهدة المباريات الحية والأفلام بجودة FHD 1080p بسلاسة وثبات عالٍ.");
                    } else if (computedFinalSpeed >= 4.0) {
                        tvRecBadge.setTextColor(0xFFEAB308);
                        tvRecBadge.setText(en ? "📺 HD 720p Recommended" : "📺 موصى بجودة HD 720p");
                        tvRecDesc.setText(en
                                ? "Moderate connection. Recommended to watch channels and movies in HD 720p for smooth playback."
                                : "اتصال متوسط. موصى بمشاهدة القنوات والأفلام بجودة HD 720p لضمان عدم حدوث توقف مؤقت أثناء البث.");
                    } else {
                        tvRecBadge.setTextColor(0xFFEF4444);
                        tvRecBadge.setText(en ? "⚠️ SD Quality Recommended" : "⚠️ موصى بجودة SD العادية");
                        tvRecDesc.setText(en
                                ? "Connection speed is low. We recommend using SD (Standard Definition) to avoid buffering."
                                : "سرعة الإنترنت ضعيفة حالياً. موصى باختيار جودة SD العادية لتجنب التقطيع، أو فحص الراوتر.");
                    }
                });

            } catch (Throwable t) {
                a.runOnUiThread(() -> {
                    if (!d.isShowing()) return;
                    tvStatus.setText(en ? "No connection" : "لا يوجد اتصال بالإنترنت");
                    tvVal.setText("0.0");
                    tvDl.setText("-- Mbps");
                    progressBar.setProgress(0);
                    tvRecBadge.setTextColor(0xFFEF4444);
                    tvRecBadge.setText(en ? "⚠️ Test failed" : "⚠️ تعذر إتمام الفحص");
                    tvRecDesc.setText(en
                            ? "Could not reach the test server. Check your internet connection or router, then try again."
                            : "تعذر الوصول إلى سيرفر الفحص. تأكد من اتصالك بالإنترنت أو افحص الراوتر ثم أعد المحاولة.");
                });
            } finally {
                state.isTesting = false;
                a.runOnUiThread(() -> {
                    if (d.isShowing()) {
                        btnStart.setEnabled(true);
                        btnStart.setText(en ? "Test Again" : "إعادة الفحص");
                    }
                });
            }
        }).start();
    }
}
