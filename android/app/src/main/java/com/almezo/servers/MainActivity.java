package com.almezo.servers;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
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
    }
}
