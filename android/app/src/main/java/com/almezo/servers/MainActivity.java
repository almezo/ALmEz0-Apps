package com.almezo.servers;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isImmersive = false;

    /**
     * افتتاحية "سيرفرات الميزو" الأصلية تظهر مرة واحدة في الجلسة عند فتح التطبيق، بديلاً عن
     * افتتاحية HTML القديمة. المتغيّر ثابت (static) فيصفّر تلقائياً عند إغلاق التطبيق كلياً.
     */
    private static boolean launchIntroShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        optimizeDisplayRefreshRate();

        if (!launchIntroShown) {
            launchIntroShown = true;
            com.almezo.servers.nat.IntroActivity.showHome(this);
        }

        // Inject Native Bridge to enable immersive fullscreen and ExoPlayer playback
        if (bridge != null && bridge.getWebView() != null) {
            android.webkit.WebView webView = bridge.getWebView();
            webView.addJavascriptInterface(new NativePlayerBridge(), "AndroidNativeBridge");

            // Disable text zoom and external zoom to preserve pixel-perfect 1650x750 scaling
            android.webkit.WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setLoadsImagesAutomatically(true);
            settings.setBlockNetworkImage(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Enable explicit Hardware Acceleration on the WebView layer for TV Box & Receiver 60fps
            try {
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            } catch (Throwable ignored) { }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }

        installBackHandler();

        // أندرويد 13 فما فوق يحجب كل الإشعارات بصمت ما لم يوافق المستخدم صراحةً، وكان
        // الإذن مُعلَناً في الملف فقط دون أن يُطلب أبداً — فلا يظهر أي إشعار للمدير.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try { requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 102); } catch (Throwable ignored) { }
        }
        com.almezo.servers.nat.BroadcastNotifier.schedule(this);
        com.almezo.servers.nat.BroadcastNotifier.checkAsync(this);

        try {
            if (new NativePlayerBridge().isTvDevice()) {
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
                enableImmersiveFullscreen();
            }
        } catch (Throwable ignored) { }
    }

    private long lastBackPressAt = 0;

    /**
     * زر الرجوع: الصفحة تتولى أولاً إغلاق النوافذ والرجوع من الصفحات الداخلية (window.__almezoBack)،
     * وفي الصفحة الرئيسية للبرنامج يظهر تنبيه أخضر "اضغط مرة أخرى للخروج" ثم يُغلق البرنامج
     * بالضغطة الثانية خلال ثانيتين. يعمل أصلياً دون الاعتماد على مستمع backButton في كاباسيتور.
     */
    private void installBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final androidx.activity.OnBackPressedCallback self = this;
                android.webkit.WebView wv = bridge != null ? bridge.getWebView() : null;
                if (wv == null) {
                    passBack(self);
                    return;
                }
                wv.evaluateJavascript(
                        "(function(){try{return window.__almezoBack?window.__almezoBack():'legacy';}catch(e){return 'legacy';}})()",
                        result -> {
                            String r = result == null ? "" : result.replace("\"", "");
                            if ("exit".equals(r)) confirmExit();
                            else if (!"handled".equals(r)) passBack(self);
                        });
            }
        });
    }

    private void passBack(androidx.activity.OnBackPressedCallback self) {
        self.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        self.setEnabled(true);
    }

    private void confirmExit() {
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastBackPressAt < 2000) {
            finish();
            return;
        }
        lastBackPressAt = now;
        com.almezo.servers.nat.Ui.toast(this, "اضغط مرة أخرى للخروج من التطبيق", true);
    }

    public void enableImmersiveFullscreen() {
        isImmersive = true;
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decorView = getWindow().getDecorView();
                decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        });
    }

    public void disableImmersiveFullscreen() {
        isImmersive = false;
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(true);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            } else {
                View decorView = getWindow().getDecorView();
                decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        optimizeDisplayRefreshRate();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new NativePlayerBridge(), "AndroidNativeBridge");
        }
        if (isImmersive) {
            enableImmersiveFullscreen();
        }
    }

    private void optimizeDisplayRefreshRate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.Display display = getDisplay();
                if (display != null) {
                    android.view.Display.Mode[] modes = display.getSupportedModes();
                    android.view.Display.Mode maxMode = null;
                    for (android.view.Display.Mode mode : modes) {
                        if (maxMode == null || mode.getRefreshRate() > maxMode.getRefreshRate()) {
                            maxMode = mode;
                        }
                    }
                    if (maxMode != null && maxMode.getRefreshRate() >= 60.0f) {
                        WindowManager.LayoutParams params = getWindow().getAttributes();
                        params.preferredDisplayModeId = maxMode.getModeId();
                        getWindow().setAttributes(params);
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                boolean isTv = new NativePlayerBridge().isTvDevice();
                WindowManager.LayoutParams params = getWindow().getAttributes();
                params.preferredRefreshRate = isTv ? 60.0f : 120.0f;
                getWindow().setAttributes(params);
            }
        } catch (Throwable t) {
            android.util.Log.w("MainActivity", "optimizeDisplayRefreshRate error", t);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isImmersive) {
            enableImmersiveFullscreen();
        }
    }

    class NativePlayerBridge {
        @JavascriptInterface
        public boolean hasRecordAudioPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void requestRecordAudioPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                runOnUiThread(() -> {
                    requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 101);
                });
            }
        }

        @JavascriptInterface
        public void setImmersiveFullscreen(boolean enabled) {
            if (enabled) {
                enableImmersiveFullscreen();
            } else {
                disableImmersiveFullscreen();
            }
        }

        @JavascriptInterface
        public boolean isTvDevice() {
            try {
                android.app.UiModeManager uiModeManager = (android.app.UiModeManager) getSystemService(UI_MODE_SERVICE);
                if (uiModeManager != null && uiModeManager.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) {
                    return true;
                }
                android.content.pm.PackageManager pm = getPackageManager();
                if (pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK)
                        || pm.hasSystemFeature("android.hardware.type.television")) {
                    return true;
                }
                if (!pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_TOUCHSCREEN)) {
                    return true;
                }
                String model = (Build.MODEL + " " + Build.DEVICE + " " + Build.PRODUCT + " " + Build.HARDWARE).toLowerCase(java.util.Locale.ROOT);
                if (model.contains("tv") || model.contains("box") || model.contains("atv") || model.contains("shield")
                        || model.contains("firetv") || model.contains("mibox") || model.contains("chromecast")
                        || model.contains("amlogic") || model.contains("allwinner") || model.contains("rockchip")
                        || model.contains("stb") || model.contains("receiver") || model.contains("mstar") || model.contains("realtek")) {
                    return true;
                }
            } catch (Throwable ignored) {}
            return false;
        }

        @JavascriptInterface
        public void playNativeVideo(String videoUrl, String title, String posterUrl) {
            playNativeVideo(videoUrl, title, posterUrl, false, isTvDevice());
        }

        @JavascriptInterface
        public void playNativeVideo(String videoUrl, String title, String posterUrl, boolean isLive) {
            playNativeVideo(videoUrl, title, posterUrl, isLive, isTvDevice());
        }

        @JavascriptInterface
        public void playNativeVideo(String videoUrl, String title, String posterUrl, boolean isLive, boolean isTv) {
            if (videoUrl == null || videoUrl.trim().isEmpty()) return;
            final boolean finalIsTv = isTv || isTvDevice();
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                    intent.putExtra("videoUrl", videoUrl.trim());
                    intent.putExtra("title", title != null ? title : "ALmEz0 Video");
                    intent.putExtra("posterUrl", posterUrl != null ? posterUrl : "");
                    intent.putExtra("isLive", isLive);
                    intent.putExtra("isTv", finalIsTv);
                    startActivity(intent);
                } catch (Throwable t) {
                    android.util.Log.e("MainActivity", "Failed to launch PlayerActivity", t);
                }
            });
        }

        /**
         * جلسة Firebase لحساب الموقع (رمز التحديث)، يرسلها firebase-config.js عند معرفة المستخدم المسجّل،
         * ليتصل بها مساعد الميزو في المشغل الأصلي بدالة الذكاء الاصطناعي الآمنة.
         */
        @JavascriptInterface
        public void setFirebaseSession(String refreshToken) {
            com.almezo.servers.nat.AiClient.saveRefreshToken(MainActivity.this, refreshToken);
        }

        /**
         * يفتح مشغل الميزو الأصلي بدل player.html داخل WebView.
         * @param migrationJson بيانات مشغل الويب (الحسابات، المفضلة، متابعة المشاهدة) لنقلها أول مرة
         */
        @JavascriptInterface
        public void openNativePlayer(String migrationJson) {
            runOnUiThread(() -> {
                try {
                    com.almezo.servers.nat.Migration.importFromWeb(MainActivity.this, migrationJson);
                    // المقدمة الافتتاحية ثم المشغل (مع تحديث إجباري للباقات عند كل فتح من البرنامج)
                    Intent intent = new Intent(MainActivity.this, com.almezo.servers.nat.IntroActivity.class);
                    startActivity(intent);
                } catch (Throwable t) {
                    android.util.Log.e("MainActivity", "Failed to open native player", t);
                }
            });
        }

        /**
         * إشعار مدير من صفحة الويب بمعرّفه: يُسجَّل معروضاً في نفس سجل الفحص الأصلي
         * (BroadcastNotifier)، فلا يظهر الإشعار مرتين في الشريط إن وصل من الطريقين.
         */
        @JavascriptInterface
        public void showBroadcastNotification(String id, String ts, String title, String message, String actionUrl) {
            long t = 0;
            try { t = Long.parseLong(ts); } catch (Exception ignored) { }
            if (com.almezo.servers.nat.BroadcastNotifier.markSeen(MainActivity.this, id, t)) {
                com.almezo.servers.nat.BroadcastNotifier.show(MainActivity.this, id, title, message, actionUrl);
            }
        }

        @JavascriptInterface
        public void showNotification(String title, String message, String actionUrl) {
            runOnUiThread(() -> {
                try {
                    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    String channelId = "almezo_broadcast_channel";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        NotificationChannel channel = new NotificationChannel(
                            channelId,
                            "تنبيهات سيرفرات الميزو",
                            NotificationManager.IMPORTANCE_HIGH
                        );
                        channel.setDescription("إشعارات وتحديثات سيرفرات الميزو");
                        channel.enableLights(true);
                        channel.enableVibration(true);
                        if (manager != null) {
                            manager.createNotificationChannel(channel);
                        }
                    }

                    Intent intent = new Intent(MainActivity.this, MainActivity.class);
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    if (actionUrl != null && !actionUrl.trim().isEmpty()) {
                        intent.putExtra("actionUrl", actionUrl.trim());
                    }
                    int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        : PendingIntent.FLAG_UPDATE_CURRENT;
                    PendingIntent pendingIntent = PendingIntent.getActivity(MainActivity.this, (int) System.currentTimeMillis(), intent, flags);

                    NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, channelId)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title != null ? title : "سيرفرات الميزو")
                        .setContentText(message != null ? message : "")
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(message != null ? message : ""))
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);

                    if (manager != null) {
                        manager.notify((int) System.currentTimeMillis(), builder.build());
                    }
                } catch (Throwable t) {
                    android.util.Log.e("MainActivity", "Failed to post native notification", t);
                }
            });
        }

        /*
         * تنزيل تحديث التطبيق (APK) وتثبيته.
         * - لا يُفتح التثبيت إلا إذا اكتمل الملف بحجمه الكامل: كان انقطاع النت يُعدّ اكتمالاً فتظهر
         *   رسالة النظام "حدثت مشكلة أثناء تحليل الحزمة".
         * - الإيقاف يغلق الاتصال (كان يُبقيه معلّقاً فيقطعه السيرفر ويبدأ التنزيل من الصفر)،
         *   والاستئناف وإعادة المحاولة يكملان من حجم الملف الجزئي بطلب Range.
         * - مهلة للاتصال والقراءة بدل التعليق للأبد، وإلغاء، وتثبيت الملف المنزّل دون إعادة تنزيله.
         */
        private volatile boolean isApkDownloadPaused = false;
        private volatile boolean isApkDownloadCancelled = false;
        // يمنع تشغيل خيطي تنزيل متوازيين على نفس الملف
        private volatile boolean isApkDownloadRunning = false;
        private volatile String lastApkUrl = null;
        private volatile long lastApkTotal = 0;
        private android.os.PowerManager.WakeLock apkWakeLock = null;

        private java.io.File apkDir() {
            java.io.File d = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
            return d != null ? d : getFilesDir();
        }

        private java.io.File apkFile() {
            return new java.io.File(apkDir(), "ALmEz0.apk");
        }

        private java.io.File apkPart() {
            return new java.io.File(apkDir(), "ALmEz0.apk.part");
        }

        private void jsUpdate(String js) {
            runOnUiThread(() -> {
                if (bridge != null && bridge.getWebView() != null) bridge.getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void pauseUpdateDownload() {
            isApkDownloadPaused = true; // الخيط يغلق الاتصال ويخرج
        }

        @JavascriptInterface
        public void resumeUpdateDownload() {
            if (lastApkUrl != null) startApkDownload(lastApkUrl, false);
        }

        @JavascriptInterface
        public void cancelUpdateDownload() {
            isApkDownloadCancelled = true;
            new Thread(() -> {
                try { Thread.sleep(400); } catch (InterruptedException ignored) { }
                if (!isApkDownloadRunning) apkPart().delete();
            }).start();
        }

        /** يفتح شاشة التثبيت للملف المنزّل (بعد إلغائها أو بعد السماح بالتثبيت من الإعدادات). */
        @JavascriptInterface
        public boolean installDownloadedUpdate() {
            java.io.File f = apkFile();
            if (!f.exists() || f.length() == 0) return false;
            runOnUiThread(() -> installDownloadedApk(f));
            return true;
        }

        @JavascriptInterface
        public void downloadAndInstallApk(String apkUrl) {
            if (apkUrl == null || apkUrl.trim().isEmpty()) return;
            // يُقبل فقط رابط إصدارات الميزو في GitHub: الصفحة لا تستطيع تنزيل APK من أي مكان آخر
            if (!isTrustedApkUrl(apkUrl.trim())) {
                android.util.Log.w("MainActivity", "Rejected untrusted update URL");
                return;
            }
            startApkDownload(apkUrl.trim(), true);
        }

        private boolean isTrustedApkUrl(String url) {
            try {
                android.net.Uri u = android.net.Uri.parse(url);
                String path = u.getPath() == null ? "" : u.getPath();
                return "https".equalsIgnoreCase(u.getScheme())
                        && "github.com".equalsIgnoreCase(u.getHost())
                        && path.toLowerCase(java.util.Locale.ROOT).startsWith("/almezo/almez0-downloads/releases/")
                        && !path.contains("..");
            } catch (Exception e) {
                return false;
            }
        }

        private void startApkDownload(String apkUrl, boolean fresh) {
            if (isApkDownloadRunning) {
                // خيط سابق ما زال يُغلق اتصاله بعد الإيقاف: نعيد المحاولة بعد لحظة
                if (!fresh && isApkDownloadPaused) {
                    new Thread(() -> {
                        try { Thread.sleep(500); } catch (InterruptedException ignored) { }
                        startApkDownload(apkUrl, false);
                    }).start();
                }
                return;
            }
            isApkDownloadRunning = true;
            isApkDownloadPaused = false;
            isApkDownloadCancelled = false;
            lastApkUrl = apkUrl;
            if (fresh) {
                apkPart().delete();
                apkFile().delete();
                lastApkTotal = 0;
            }

            new Thread(() -> {
                java.net.HttpURLConnection conn = null;
                try {
                    try {
                        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                        if (pm != null) {
                            if (apkWakeLock != null && apkWakeLock.isHeld()) apkWakeLock.release();
                            apkWakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "ALmEz0:UpdateDownload");
                            apkWakeLock.acquire(20 * 60 * 1000L);
                        }
                    } catch (Throwable ignored) { }

                    java.io.File part = apkPart();
                    long have = part.exists() ? part.length() : 0;

                    String currentUrl = apkUrl;
                    int code = -1;
                    for (int redirects = 0; redirects < 8; redirects++) {
                        conn = (java.net.HttpURLConnection) new java.net.URL(currentUrl).openConnection();
                        conn.setRequestProperty("User-Agent", "ALmEz0-Android-App");
                        conn.setRequestProperty("Accept-Encoding", "identity");
                        if (have > 0) conn.setRequestProperty("Range", "bytes=" + have + "-");
                        conn.setInstanceFollowRedirects(false);
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(30000);
                        code = conn.getResponseCode();
                        if (code >= 300 && code < 400) {
                            String loc = conn.getHeaderField("Location");
                            conn.disconnect();
                            if (loc == null || loc.isEmpty()) throw new java.io.IOException("redirect without location");
                            currentUrl = new java.net.URL(new java.net.URL(currentUrl), loc).toString();
                            continue;
                        }
                        break;
                    }

                    long total;
                    boolean append;
                    if (code == java.net.HttpURLConnection.HTTP_PARTIAL && have > 0) {
                        String range = conn.getHeaderField("Content-Range");
                        long t = have + conn.getContentLengthLong();
                        if (range != null && range.lastIndexOf('/') >= 0) {
                            try { t = Long.parseLong(range.substring(range.lastIndexOf('/') + 1).trim()); } catch (Exception ignored) { }
                        }
                        if (lastApkTotal > 0 && t != lastApkTotal) {
                            // الملف الجزئي من إصدار آخر: من الصفر
                            conn.disconnect();
                            part.delete();
                            lastApkTotal = 0;
                            isApkDownloadRunning = false;
                            startApkDownload(apkUrl, false);
                            return;
                        }
                        total = t;
                        append = true;
                    } else if (code == java.net.HttpURLConnection.HTTP_OK) {
                        total = conn.getContentLengthLong();
                        have = 0;
                        append = false;
                    } else {
                        throw new java.io.IOException("HTTP error: " + code);
                    }
                    lastApkTotal = total;

                    try (java.io.InputStream in = conn.getInputStream();
                         java.io.FileOutputStream out = new java.io.FileOutputStream(part, append)) {
                        byte[] buffer = new byte[32768];
                        int len;
                        long lastReportTime = 0;
                        while ((len = in.read(buffer)) != -1) {
                            out.write(buffer, 0, len);
                            have += len;
                            long now = System.currentTimeMillis();
                            if (now - lastReportTime > 250) {
                                lastReportTime = now;
                                int pct = total > 0 ? (int) ((have * 100) / total) : -1;
                                jsUpdate("if (typeof window.onAndroidUpdateProgress === 'function') window.onAndroidUpdateProgress({ percent: " + pct + ", downloadedBytes: " + have + ", totalBytes: " + total + " });");
                            }
                            if (isApkDownloadPaused || isApkDownloadCancelled) break;
                        }
                    }
                    conn.disconnect();
                    conn = null;

                    if (isApkDownloadCancelled) {
                        part.delete();
                        return;
                    }
                    if (isApkDownloadPaused) return; // الاستئناف يكمل من حجم الملف الجزئي

                    if (total > 0 && part.length() < total) throw new java.io.IOException("incomplete");

                    java.io.File apk = apkFile();
                    apk.delete();
                    if (!part.renameTo(apk)) throw new java.io.IOException("save failed");

                    final long finalBytes = apk.length();
                    jsUpdate("if (typeof window.onAndroidUpdateProgress === 'function') window.onAndroidUpdateProgress({ percent: 100, downloadedBytes: " + finalBytes + ", totalBytes: " + finalBytes + " });"
                            + "if (typeof window.onAndroidUpdateComplete === 'function') window.onAndroidUpdateComplete();");
                    runOnUiThread(() -> installDownloadedApk(apk));

                } catch (Throwable t) {
                    android.util.Log.e("MainActivity", "APK download failed", t);
                    if (isApkDownloadPaused || isApkDownloadCancelled) return;
                    final String msg = t.getMessage() != null ? t.getMessage().replace("\\", "").replace("'", "") : "Download error";
                    jsUpdate("if (typeof window.onAndroidUpdateError === 'function') window.onAndroidUpdateError('" + msg + "');");
                } finally {
                    if (conn != null) {
                        try { conn.disconnect(); } catch (Throwable ignored) { }
                    }
                    isApkDownloadRunning = false;
                    try {
                        if (apkWakeLock != null && apkWakeLock.isHeld()) {
                            apkWakeLock.release();
                            apkWakeLock = null;
                        }
                    } catch (Throwable ignored) { }
                }
            }).start();
        }

        private void installDownloadedApk(java.io.File apkFile) {
            try {
                if (apkFile == null || !apkFile.exists()) return;
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

                android.net.Uri apkUri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    apkUri = androidx.core.content.FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        apkFile
                    );
                } else {
                    apkUri = android.net.Uri.fromFile(apkFile);
                }

                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                startActivity(intent);
            } catch (Throwable t) {
                android.util.Log.e("MainActivity", "Install APK failed", t);
            }
        }
    }
}
