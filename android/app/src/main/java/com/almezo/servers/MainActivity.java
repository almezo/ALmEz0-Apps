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
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isImmersive = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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

        try {
            if (new NativePlayerBridge().isTvDevice()) {
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
                enableImmersiveFullscreen();
            }
        } catch (Throwable ignored) { }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 101);
                }
            }
        } catch (Throwable ignored) { }
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
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new NativePlayerBridge(), "AndroidNativeBridge");
        }
        if (isImmersive) {
            enableImmersiveFullscreen();
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

        private volatile boolean isApkDownloadPaused = false;
        private volatile boolean isApkDownloadCancelled = false;
        private android.os.PowerManager.WakeLock apkWakeLock = null;

        @JavascriptInterface
        public void pauseUpdateDownload() {
            isApkDownloadPaused = true;
        }

        @JavascriptInterface
        public void resumeUpdateDownload() {
            isApkDownloadPaused = false;
            synchronized (MainActivity.this) {
                MainActivity.this.notifyAll();
            }
        }

        @JavascriptInterface
        public void downloadAndInstallApk(String apkUrl) {
            if (apkUrl == null || apkUrl.trim().isEmpty()) return;
            isApkDownloadPaused = false;
            isApkDownloadCancelled = false;

            new Thread(() -> {
                try {
                    // Keep CPU awake in background so download never pauses or gets stuck when app is minimized
                    try {
                        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                        if (pm != null) {
                            if (apkWakeLock != null && apkWakeLock.isHeld()) {
                                apkWakeLock.release();
                            }
                            apkWakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "ALmEz0:UpdateDownload");
                            apkWakeLock.acquire(20 * 60 * 1000L);
                        }
                    } catch (Throwable ignored) { }

                    java.io.File downloadDir = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
                    if (downloadDir == null) {
                        downloadDir = getFilesDir();
                    }
                    java.io.File apkFile = new java.io.File(downloadDir, "ALmEz0.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    String currentUrl = apkUrl.trim();
                    java.net.HttpURLConnection conn = null;
                    int redirects = 0;

                    while (redirects < 8) {
                        java.net.URL url = new java.net.URL(currentUrl);
                        conn = (java.net.HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "ALmEz0-Android-App");
                        conn.setInstanceFollowRedirects(false);
                        conn.connect();

                        int code = conn.getResponseCode();
                        if (code >= 300 && code < 400) {
                            String loc = conn.getHeaderField("Location");
                            if (loc == null || loc.isEmpty()) break;
                            currentUrl = loc;
                            conn.disconnect();
                            redirects++;
                        } else {
                            break;
                        }
                    }

                    if (conn == null || conn.getResponseCode() != java.net.HttpURLConnection.HTTP_OK) {
                        throw new java.io.IOException("HTTP error: " + (conn != null ? conn.getResponseCode() : -1));
                    }

                    long totalBytes = conn.getContentLengthLong();
                    java.io.InputStream in = conn.getInputStream();
                    java.io.FileOutputStream out = new java.io.FileOutputStream(apkFile);

                    byte[] buffer = new byte[8192];
                    int len;
                    long downloadedBytes = 0;
                    long lastReportTime = 0;

                    while (!isApkDownloadCancelled && (len = in.read(buffer)) != -1) {
                        while (isApkDownloadPaused && !isApkDownloadCancelled) {
                            try {
                                synchronized (MainActivity.this) {
                                    MainActivity.this.wait(400);
                                }
                            } catch (InterruptedException ignored) {}
                        }

                        out.write(buffer, 0, len);
                        downloadedBytes += len;

                        long now = System.currentTimeMillis();
                        if (now - lastReportTime > 250) {
                            lastReportTime = now;
                            final int pct = totalBytes > 0 ? (int) ((downloadedBytes * 100) / totalBytes) : -1;
                            final long dBytes = downloadedBytes;
                            final long tBytes = totalBytes;
                            runOnUiThread(() -> {
                                if (bridge != null && bridge.getWebView() != null) {
                                    bridge.getWebView().evaluateJavascript(
                                        "if (typeof window.onAndroidUpdateProgress === 'function') window.onAndroidUpdateProgress({ percent: " + pct + ", downloadedBytes: " + dBytes + ", totalBytes: " + tBytes + " });",
                                        null
                                    );
                                }
                            });
                        }
                    }

                    out.flush();
                    out.close();
                    in.close();
                    conn.disconnect();

                    if (isApkDownloadCancelled) {
                        if (apkFile.exists()) apkFile.delete();
                        return;
                    }

                    // Report 100% complete
                    final long finalBytes = downloadedBytes;
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "if (typeof window.onAndroidUpdateProgress === 'function') window.onAndroidUpdateProgress({ percent: 100, downloadedBytes: " + finalBytes + ", totalBytes: " + finalBytes + " });",
                                null
                            );
                            bridge.getWebView().evaluateJavascript("if (typeof window.onAndroidUpdateComplete === 'function') window.onAndroidUpdateComplete();", null);
                        }
                        installDownloadedApk(apkFile);
                    });

                } catch (Throwable t) {
                    android.util.Log.e("MainActivity", "APK download failed", t);
                    final String msg = t.getMessage() != null ? t.getMessage().replace("'", "\\'") : "Download error";
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "if (typeof window.onAndroidUpdateError === 'function') window.onAndroidUpdateError('" + msg + "');",
                                null
                            );
                        }
                    });
                } finally {
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
