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
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.net.Uri;

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }
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
        public void playNativeVideo(String videoUrl, String title, String posterUrl) {
            if (videoUrl == null || videoUrl.trim().isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                    intent.putExtra("videoUrl", videoUrl.trim());
                    intent.putExtra("title", title != null ? title : "ALmEz0 Video");
                    intent.putExtra("posterUrl", posterUrl != null ? posterUrl : "");
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

        @JavascriptInterface
        public void downloadAndInstallApk(final String apkUrl) {
            new Thread(() -> {
                try {
                    URL url = new URL(apkUrl);
                    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                    connection.connect();

                    int fileLength = connection.getContentLength();
                    File dir = new File(getExternalFilesDir(null), "updates");
                    if (!dir.exists()) {
                        dir.mkdirs();
                    }
                    File file = new File(dir, "update.apk");
                    if (file.exists()) {
                        file.delete();
                    }

                    InputStream input = connection.getInputStream();
                    FileOutputStream output = new FileOutputStream(file);

                    byte data[] = new byte[4096];
                    long total = 0;
                    int count;
                    int lastProgress = -1;

                    while ((count = input.read(data)) != -1) {
                        total += count;
                        output.write(data, 0, count);

                        if (fileLength > 0) {
                            int progress = (int) (total * 100 / fileLength);
                            if (progress != lastProgress) {
                                lastProgress = progress;
                                final int p = progress;
                                final long t = total;
                                final int f = fileLength;
                                runOnUiThread(() -> {
                                    if (bridge != null && bridge.getWebView() != null) {
                                        bridge.getWebView().evaluateJavascript("window.updateDownloadProgress(" + p + ", " + t + ", " + f + ")", null);
                                    }
                                });
                            }
                        }
                    }
                    output.flush();
                    output.close();
                    input.close();

                    // Trigger install
                    runOnUiThread(() -> {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW);
                            Uri apkUri = FileProvider.getUriForFile(MainActivity.this, getApplicationContext().getPackageName() + ".fileprovider", file);
                            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "Install failed", e);
                        }
                    });

                } catch (Exception e) {
                    android.util.Log.e("MainActivity", "Download error", e);
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript("window.updateDownloadError()", null);
                        }
                    });
                }
            }).start();
        }
    }
}
