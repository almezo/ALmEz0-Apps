package com.almezo.servers;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.GestureDetector;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import android.app.ActivityManager;

import java.util.Locale;

public class PlayerActivity extends AppCompatActivity {

    private static final String TAG = "PlayerActivity";

    private PlayerView playerView;
    private ExoPlayer player;
    private View controlsOverlay;
    private ProgressBar pbBuffering;
    private ImageButton btnPlayPause;
    private ImageButton btnRewind10;
    private ImageButton btnForward10;
    private ImageButton btnBack;
    private ImageButton btnCast;
    private ImageButton btnLock;
    private ImageButton btnUnlockScreen;
    private ImageButton btnSettings;
    private ImageButton btnCloseSettings;
    private TextView tvTitle;
    private TextView tvPosition;
    private TextView tvDuration;
    private SeekBar seekBar;
    private View layoutSeekbarRow;

    // Aspect & Speed
    private View btnAspect;
    private TextView tvAspectText;
    private View btnSpeed;
    private TextView tvSpeedText;
    private int currentAspectIndex = 0; // 0: Fit, 1: 16:9, 2: 4:3, 3: Fill, 4: Zoom
    private float[] playbackSpeeds = {1.0f, 1.25f, 1.5f, 2.0f, 0.5f, 0.75f};
    private int currentSpeedIndex = 0;

    // Vertical Visual Sliders (Matching Image 3)
    private View layoutBrightnessSlider;
    private View barBrightnessFill;
    private View layoutVolumeSlider;
    private View barVolumeFill;
    private TextView tvSeekFeedback;
    private TextView badgeLiveIndicator;
    private boolean isLiveStream = false;
    private String videoUrl = null;

    // Settings Drawer (Matching Image 4)
    private View settingsDrawerOverlay;
    private View settingsDrawer;
    private RadioGroup rgVideoTracks;
    private RadioGroup rgAudioTracks;
    private RadioGroup rgSubtitleTracks;
    private TextView tvNoSubtitles;

    private AudioManager audioManager;
    private int maxVolume = 15;
    private float currentBrightness = 0.5f;
    private float currentVolumePercent = 0.5f;
    private boolean isScreenLocked = false;
    private boolean isUserSeeking = false;
    private boolean isRetried = false;
    private boolean isTvDevice = false;
    private boolean isLowEndDevice = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private GestureDetector gestureDetector;

    private final Runnable updateProgressRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (isLiveStream) return;
                if (player != null && !isFinishing() && !isDestroyed()) {
                    long dur = player.getDuration();
                    long pos = player.getCurrentPosition();

                    if (dur > 0) {
                        if (tvDuration != null) {
                            tvDuration.setText(formatTime(dur));
                        }
                        if (!isUserSeeking && seekBar != null) {
                            int progress = (int) Math.min(1000, Math.max(0, (pos * 1000) / dur));
                            seekBar.setProgress(progress);
                        }
                        if (!isUserSeeking && tvPosition != null) {
                            tvPosition.setText(formatTime(pos));
                        }
                    } else if (pos > 0 && !isUserSeeking && tvPosition != null) {
                        tvPosition.setText(formatTime(pos));
                    }
                }
            } catch (Throwable t) {
                Log.w(TAG, "updateProgress error", t);
            }

            try {
                if (!isFinishing() && !isDestroyed()) {
                    handler.postDelayed(this, 500);
                }
            } catch (Throwable ignored) { }
        }
    };

    private final Runnable hideControlsRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                hideControls();
            } catch (Throwable t) {
                Log.w(TAG, "hideControls runnable error", t);
            }
        }
    };

    private final Runnable hideSlidersRunnable = new Runnable() {
        @Override
        public void run() {
            // Intentionally keep sliders visible whenever controls overlay is active
        }
    };

    private final Runnable hideSeekFeedbackRunnable = new Runnable() {
        @Override
        public void run() {
            if (tvSeekFeedback != null) {
                tvSeekFeedback.setVisibility(View.GONE);
            }
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Crash guard to prevent app exits
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e(TAG, "Uncaught exception in PlayerActivity on thread " + thread.getName(), throwable);
            try {
                runOnUiThread(() -> {
                    Toast.makeText(getApplicationContext(), "حدث خطأ أثناء تشغيل الوسائط", Toast.LENGTH_SHORT).show();
                    finish();
                });
            } catch (Throwable ignored) {
                finish();
            }
        });

        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
            setContentView(R.layout.activity_player);

            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int currentVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                currentVolumePercent = (float) currentVol / Math.max(1, maxVolume);
            }

            // Init brightness
            try {
                int sysBrightness = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128);
                currentBrightness = sysBrightness / 255.0f;
            } catch (Throwable ignored) {
                currentBrightness = 0.5f;
            }

            isTvDevice = checkIsTvDevice();
            isLowEndDevice = checkIsLowEndDevice();

            enableImmersiveFullscreen();
            optimizeDisplayRefreshRate();
            initViews();
            setupGestures();
            setupPlayer();
        } catch (Throwable t) {
            Log.e(TAG, "Critical error during PlayerActivity onCreate", t);
            Toast.makeText(this, "تعذر تشغيل الفيديو: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private boolean checkIsTvDevice() {
        try {
            if (getIntent().hasExtra("isTv")) {
                return getIntent().getBooleanExtra("isTv", false);
            }
            android.app.UiModeManager uiModeManager = (android.app.UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
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
            String model = (Build.MODEL + " " + Build.DEVICE + " " + Build.PRODUCT + " " + Build.HARDWARE).toLowerCase(Locale.ROOT);
            if (model.contains("tv") || model.contains("box") || model.contains("atv") || model.contains("shield")
                    || model.contains("firetv") || model.contains("mibox") || model.contains("chromecast")
                    || model.contains("amlogic") || model.contains("allwinner") || model.contains("rockchip")) {
                return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    // فحص مواصفات الجهاز الفعلية (عدد الأنوية والرام) لتقييد جودة فك الترميز على الأجهزة الضعيفة
    // بدل ترك ExoPlayer يحاول تشغيل أعلى دقة/بت ريت متاحة من السيرفر بلا حدود، وهو السبب الأكثر
    // شيوعاً للتقطيع على صناديق التلفاز والهواتف الاقتصادية حتى لو كانت سرعة الإنترنت كافية،
    // لأن عنق الزجاجة هنا هو المعالج/فك الترميز وليس الشبكة.
    private boolean checkIsLowEndDevice() {
        try {
            if (isTvDevice) return true; // نفترض ضعف صناديق وشاشات التلفاز الرخيصة بشكل افتراضي وآمن

            int cores = Runtime.getRuntime().availableProcessors();
            if (cores > 0 && cores <= 4) return true;

            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                long totalRamGb = mi.totalMem / (1024L * 1024L * 1024L);
                if (totalRamGb > 0 && totalRamGb <= 3) return true;
                if (am.isLowRamDevice()) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private void optimizeDisplayRefreshRate() {
        // على الأجهزة الضعيفة لا نجبر أعلى معدل تحديث متاح (قد يصل 120Hz): مطالبة معالج/GPU
        // ضعيف بتغذية واجهة وفيديو بمعدل أعلى من قدرته الفعلية يسبب تقطيعاً وحرارة أعلى بدل تحسين السلاسة.
        if (isLowEndDevice) return;
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
                WindowManager.LayoutParams params = getWindow().getAttributes();
                params.preferredRefreshRate = 120.0f;
                getWindow().setAttributes(params);
            }
        } catch (Throwable t) {
            Log.w(TAG, "optimizeDisplayRefreshRate error", t);
        }
    }

    private void enableImmersiveFullscreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decorView = getWindow().getDecorView();
                if (decorView != null) {
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                    );
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "enableImmersiveFullscreen warning", t);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveFullscreen();
        }
    }

    private void initViews() {
        playerView = findViewById(R.id.player_view);
        controlsOverlay = findViewById(R.id.controls_overlay);
        pbBuffering = findViewById(R.id.pb_buffering);
        btnPlayPause = findViewById(R.id.btn_play_pause);
        btnRewind10 = findViewById(R.id.btn_rewind_10);
        btnForward10 = findViewById(R.id.btn_forward_10);
        btnBack = findViewById(R.id.btn_back);
        btnCast = findViewById(R.id.btn_cast);
        btnLock = findViewById(R.id.btn_lock);
        btnUnlockScreen = findViewById(R.id.btn_unlock_screen);
        btnSettings = findViewById(R.id.btn_settings);
        btnCloseSettings = findViewById(R.id.btn_close_settings);
        tvTitle = findViewById(R.id.tv_title);
        tvPosition = findViewById(R.id.tv_position);
        tvDuration = findViewById(R.id.tv_duration);
        seekBar = findViewById(R.id.seek_bar);
        layoutSeekbarRow = findViewById(R.id.layout_seekbar_row);

        btnAspect = findViewById(R.id.btn_aspect);
        tvAspectText = findViewById(R.id.tv_aspect_text);
        btnSpeed = findViewById(R.id.btn_speed);
        tvSpeedText = findViewById(R.id.tv_speed_text);

        layoutBrightnessSlider = findViewById(R.id.layout_brightness_slider);
        barBrightnessFill = findViewById(R.id.bar_brightness_fill);
        layoutVolumeSlider = findViewById(R.id.layout_volume_slider);
        barVolumeFill = findViewById(R.id.bar_volume_fill);
        tvSeekFeedback = findViewById(R.id.tv_seek_feedback);
        badgeLiveIndicator = findViewById(R.id.badge_live_indicator);

        // Pre-fill initial slider levels so they are immediately accurate on launch
        if (isTvDevice) {
            if (btnLock != null) btnLock.setVisibility(View.GONE);
            if (layoutBrightnessSlider != null) layoutBrightnessSlider.setVisibility(View.GONE);
            if (layoutVolumeSlider != null) layoutVolumeSlider.setVisibility(View.GONE);
            if (playerView != null) {
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                currentAspectIndex = 3;
                if (tvAspectText != null) tvAspectText.setText("Fill (تمديد)");
            }
        } else {
            updateVerticalSlider(layoutBrightnessSlider, barBrightnessFill, currentBrightness);
            updateVerticalSlider(layoutVolumeSlider, barVolumeFill, currentVolumePercent);
        }

        settingsDrawerOverlay = findViewById(R.id.settings_drawer_overlay);
        settingsDrawer = findViewById(R.id.settings_drawer);
        rgVideoTracks = findViewById(R.id.rg_video_tracks);
        rgAudioTracks = findViewById(R.id.rg_audio_tracks);
        rgSubtitleTracks = findViewById(R.id.rg_subtitle_tracks);
        tvNoSubtitles = findViewById(R.id.tv_no_subtitles);

        String title = getIntent().getStringExtra("title");
        if (title != null && !title.isEmpty() && tvTitle != null) {
            tvTitle.setText(title);
        }

        if (btnBack != null) {
            btnBack.setOnClickListener(v -> finish());
        }

        if (btnCast != null) {
            btnCast.setOnClickListener(v -> {
                Toast.makeText(this, "جاري البحث عن أجهزة البث المتاحة...", Toast.LENGTH_SHORT).show();
            });
        }

        if (btnPlayPause != null) {
            btnPlayPause.setOnClickListener(v -> {
                togglePlayPause();
                resetControlsHideTimer();
            });
        }

        if (btnRewind10 != null) {
            btnRewind10.setOnClickListener(v -> {
                seekRelative(-10000);
                showSeekFeedback("-10s");
                resetControlsHideTimer();
            });
        }

        if (btnForward10 != null) {
            btnForward10.setOnClickListener(v -> {
                seekRelative(10000);
                showSeekFeedback("+10s");
                resetControlsHideTimer();
            });
        }

        if (btnLock != null) {
            btnLock.setOnClickListener(v -> lockControls());
        }

        if (btnUnlockScreen != null) {
            btnUnlockScreen.setOnClickListener(v -> unlockControls());
        }

        if (btnSettings != null) {
            btnSettings.setOnClickListener(v -> openSettingsDrawer());
        }

        if (btnCloseSettings != null) {
            btnCloseSettings.setOnClickListener(v -> closeSettingsDrawer());
        }

        if (settingsDrawerOverlay != null) {
            settingsDrawerOverlay.setOnClickListener(v -> closeSettingsDrawer());
        }

        if (btnAspect != null && playerView != null) {
            btnAspect.setOnClickListener(v -> {
                try {
                    currentAspectIndex = (currentAspectIndex + 1) % 5;
                    AspectRatioFrameLayout contentFrame = playerView.findViewById(androidx.media3.ui.R.id.exo_content_frame);
                    String toastMsg = "";
                    switch (currentAspectIndex) {
                        case 0: // 0: تناسب أصلي (Fit)
                            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                            if (contentFrame != null) contentFrame.setAspectRatio(0);
                            toastMsg = "الأبعاد: أصلي (تناسب)";
                            if (tvAspectText != null) tvAspectText.setText("Fit (أصلي)");
                            break;
                        case 1: // 1: 16:9
                            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                            if (contentFrame != null) contentFrame.setAspectRatio(16.0f / 9.0f);
                            toastMsg = "الأبعاد: 16:9 (عريضة)";
                            if (tvAspectText != null) tvAspectText.setText("16:9");
                            break;
                        case 2: // 2: 4:3
                            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                            if (contentFrame != null) contentFrame.setAspectRatio(4.0f / 3.0f);
                            toastMsg = "الأبعاد: 4:3 (تلفزيون)";
                            if (tvAspectText != null) tvAspectText.setText("4:3");
                            break;
                        case 3: // 3: تمديد كامل (Fill)
                            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                            toastMsg = "الأبعاد: تمديد كامل (Fill)";
                            if (tvAspectText != null) tvAspectText.setText("Fill (تمديد)");
                            break;
                        case 4: // 4: تكبير وقص (Zoom)
                            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
                            toastMsg = "الأبعاد: تكبير وقص (Zoom)";
                            if (tvAspectText != null) tvAspectText.setText("Zoom (تكبير)");
                            break;
                    }
                    Toast.makeText(this, toastMsg, Toast.LENGTH_SHORT).show();
                } catch (Throwable t) {
                    Log.w(TAG, "aspect change error", t);
                }
                resetControlsHideTimer();
            });
        }

        if (btnSpeed != null) {
            btnSpeed.setOnClickListener(v -> {
                try {
                    currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
                    float speed = playbackSpeeds[currentSpeedIndex];
                    if (player != null) {
                        player.setPlaybackParameters(new PlaybackParameters(speed));
                    }
                    if (tvSpeedText != null) {
                        tvSpeedText.setText("Speed (" + (speed == (int) speed ? (int) speed + "x" : speed + "x") + ")");
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "speed change error", t);
                }
                resetControlsHideTimer();
            });
        }

        if (seekBar != null) {
            seekBar.setMax(1000);
            seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                    if (fromUser && player != null) {
                        try {
                            long dur = player.getDuration();
                            if (dur > 0) {
                                long target = (dur * progress) / 1000;
                                if (tvPosition != null) tvPosition.setText(formatTime(target));
                            }
                        } catch (Throwable ignored) { }
                    }
                }

                @Override
                public void onStartTrackingTouch(SeekBar sb) {
                    isUserSeeking = true;
                    handler.removeCallbacks(hideControlsRunnable);
                }

                @Override
                public void onStopTrackingTouch(SeekBar sb) {
                    if (player != null) {
                        try {
                            long dur = player.getDuration();
                            if (dur > 0) {
                                long target = (dur * sb.getProgress()) / 1000;
                                player.seekTo(target);
                            }
                        } catch (Throwable t) {
                            Log.w(TAG, "seek error", t);
                        }
                    }
                    isUserSeeking = false;
                    resetControlsHideTimer();
                }
            });

            // تمكين التحكم بشريط التقدم عبر أسهم الريموت (يمين/يسار). كان شريط التقدم
            // focusable فعلاً في XML لكن لا يوجد أي كود يربط تحريكه بالريموت بتشغيل الفيديو
            // الفعلي؛ ضبط progress بالمفاتيح لا يُطلق onStartTrackingTouch/onStopTrackingTouch
            // (خاصتان باللمس والسحب فقط)، فكان الشريط يتحرك بصرياً بلا أي تأثير حقيقي على التشغيل.
            seekBar.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() != KeyEvent.ACTION_DOWN) return false;
                if (keyCode != KeyEvent.KEYCODE_DPAD_LEFT && keyCode != KeyEvent.KEYCODE_DPAD_RIGHT) {
                    return false;
                }
                if (isLiveStream || player == null) return true; // استهلاك المفتاح فقط دون تنفيذ أي شيء
                long deltaMs = (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) ? 10000 : -10000;
                seekRelativeDebounced(deltaMs);
                showSeekFeedback(deltaMs > 0 ? "+10s" : "-10s");
                resetControlsHideTimer();
                return true;
            });
        }

        setupFocusEffects();
    }

    // تأثير تركيز خفيف وموحّد لكل أزرار المشغل الدائرية بدل المربع الأخضر الافتراضي
    // ---------------------------------------------------------
    // بداية من Android O، يرسم النظام تلقائياً "توهيج تركيز افتراضي" (Default Focus Highlight)
    // فوق أي View قابل للتركيز باستخدام لون الواجهة الأساسي (colorAccent الأخضر #4caf50 هنا)،
    // وهو مستطيل شفاف يغطي حدود الـ View المستطيلة بالكامل بغض النظر عن شكلها الفعلي (دائري هنا)،
    // فيظهر كمربع أخضر بشع فوق الأزرار المستديرة. نعطّله ونستبدله بتكبير خفيف جداً للزر نفسه
    // (تحريك transform عبر RenderNode، مُسرَّع بالعتاد تماماً ودون أي تكلفة حسابية أو رسومية)
    // مع الاعتماد على توهج bg_circle_button/bg_pill_button الدائري الموجود أصلاً لحالة التركيز.
    private void setupFocusEffects() {
        View[] focusTargets = new View[] {
            btnBack, btnCast, btnLock, btnUnlockScreen, btnSettings, btnCloseSettings,
            btnPlayPause, btnRewind10, btnForward10, btnAspect, btnSpeed, seekBar
        };
        for (View v : focusTargets) {
            if (v == null) continue;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.setDefaultFocusHighlightEnabled(false);
                }
            } catch (Throwable ignored) { }

            v.setOnFocusChangeListener((view, hasFocus) -> {
                float scale = hasFocus ? 1.12f : 1.0f;
                view.animate()
                        .scaleX(scale)
                        .scaleY(scale)
                        .setDuration(120)
                        .start();
            });
        }
    }

    private void setupGestures() {
        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (isScreenLocked) return true;
                if (settingsDrawerOverlay != null && settingsDrawerOverlay.getVisibility() == View.VISIBLE) {
                    closeSettingsDrawer();
                    return true;
                }
                if (controlsOverlay != null) {
                    if (controlsOverlay.getVisibility() == View.VISIBLE) {
                        hideControls();
                    } else {
                        showControls();
                    }
                }
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (isScreenLocked) return true;
                int screenWidth = getResources().getDisplayMetrics().widthPixels;
                float x = e.getX();

                if (x < screenWidth * 0.4f) {
                    seekRelative(-10000);
                    showSeekFeedback("-10s");
                } else if (x > screenWidth * 0.6f) {
                    seekRelative(10000);
                    showSeekFeedback("+10s");
                } else {
                    togglePlayPause();
                }
                return true;
            }
        });

        View playerRoot = findViewById(R.id.player_root);
        if (playerRoot != null) {
            playerRoot.setOnTouchListener(new View.OnTouchListener() {
                private float startY = 0;
                private float startX = 0;
                private boolean isVerticalDrag = false;
                private boolean isVolumeGesture = false;

                @Override
                public boolean onTouch(View v, MotionEvent event) {
                    if (isScreenLocked || isTvDevice) {
                        return gestureDetector.onTouchEvent(event);
                    }

                    if (gestureDetector.onTouchEvent(event)) {
                        return true;
                    }

                    int screenWidth = getResources().getDisplayMetrics().widthPixels;
                    int screenHeight = getResources().getDisplayMetrics().heightPixels;

                    switch (event.getAction()) {
                        case MotionEvent.ACTION_DOWN:
                            startY = event.getY();
                            startX = event.getX();
                            isVerticalDrag = false;
                            isVolumeGesture = startX > screenWidth * 0.5f;
                            break;

                        case MotionEvent.ACTION_MOVE:
                            float deltaY = startY - event.getY();
                            float deltaX = Math.abs(event.getX() - startX);

                            if (!isVerticalDrag && Math.abs(deltaY) > 30 && Math.abs(deltaY) > deltaX) {
                                isVerticalDrag = true;
                            }

                            if (isVerticalDrag) {
                                float percentDelta = deltaY / (screenHeight * 0.5f);
                                if (isVolumeGesture) {
                                    adjustVolume(percentDelta);
                                } else {
                                    adjustBrightness(percentDelta);
                                }
                                startY = event.getY();
                            }
                            break;

                        case MotionEvent.ACTION_UP:
                        case MotionEvent.ACTION_CANCEL:
                            // Sliders remain visible with controls overlay
                            break;
                    }
                    return true;
                }
            });
        }
    }

    private void adjustVolume(float delta) {
        if (isTvDevice || audioManager == null) return;
        try {
            // Smooth float-based volume tracking on every single pixel of touch
            currentVolumePercent = Math.max(0.0f, Math.min(1.0f, currentVolumePercent + delta));
            int target = Math.round(currentVolumePercent * maxVolume);
            int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            if (target != current) {
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
            }
            updateVerticalSlider(layoutVolumeSlider, barVolumeFill, currentVolumePercent);
        } catch (Throwable t) {
            Log.w(TAG, "adjustVolume error", t);
        }
    }

    private void adjustBrightness(float delta) {
        if (isTvDevice) return;
        try {
            currentBrightness = Math.max(0.05f, Math.min(1.0f, currentBrightness + delta));
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.screenBrightness = currentBrightness;
            getWindow().setAttributes(lp);

            updateVerticalSlider(layoutBrightnessSlider, barBrightnessFill, currentBrightness);
        } catch (Throwable t) {
            Log.w(TAG, "adjustBrightness error", t);
        }
    }

    private void updateVerticalSlider(View layout, View fillBar, float percent) {
        if (isTvDevice) {
            if (layout != null) layout.setVisibility(View.GONE);
            return;
        }
        try {
            handler.removeCallbacks(hideSlidersRunnable);
            if (layout != null) {
                layout.setVisibility(View.VISIBLE);
            }
            if (fillBar != null) {
                int totalHeightPx = (int) (170 * getResources().getDisplayMetrics().density);
                int fillHeight = Math.max(4, (int) (totalHeightPx * percent));
                ViewGroup.LayoutParams lp = fillBar.getLayoutParams();
                lp.height = fillHeight;
                fillBar.setLayoutParams(lp);
            }
        } catch (Throwable ignored) { }
    }

    private void showSeekFeedback(String text) {
        try {
            handler.removeCallbacks(hideSeekFeedbackRunnable);
            if (tvSeekFeedback != null) {
                tvSeekFeedback.setText(text);
                tvSeekFeedback.setVisibility(View.VISIBLE);
                handler.postDelayed(hideSeekFeedbackRunnable, 800);
            }
        } catch (Throwable ignored) { }
    }

    // يتتبّع ما إذا كان المستخدم قد أوقف التشغيل يدوياً (بالضغط على زر التشغيل/الإيقاف)،
    // للتفريق بينه وبين الإيقاف التلقائي المؤقت الذي يفرضه نظام أندرويد نفسه (onPause)
    // عند فقد النافذة تركيزها لحظياً أثناء انتقال الشاشة، دون أن يطلب المستخدم ذلك فعلياً.
    private boolean isUserPaused = false;

    private void togglePlayPause() {
        if (player != null) {
            try {
                if (player.isPlaying()) {
                    player.pause();
                    isUserPaused = true;
                } else {
                    player.play();
                    isUserPaused = false;
                }
            } catch (Throwable t) {
                Log.w(TAG, "togglePlayPause error", t);
            }
        }
    }

    private void seekRelative(long deltaMs) {
        if (player != null) {
            try {
                long dur = player.getDuration();
                long cur = player.getCurrentPosition();
                long target = (dur > 0) ? Math.min(dur, Math.max(0, cur + deltaMs)) : Math.max(0, cur + deltaMs);
                player.seekTo(target);
            } catch (Throwable t) {
                Log.w(TAG, "seekRelative error", t);
            }
        }
    }

    // تجميع (Debounce) طلبات التقديم/التأخير المتكررة من الريموت: الضغط المطوَّل على السهم
    // يرسل عشرات ضغطات onKeyDown في الثانية، وكل استدعاء مباشر لـ player.seekTo() على جهاز
    // ضعيف يفرض إعادة تموضع فك الترميز (قد يُجمِّد الصورة لحظياً)، فيتراكم التقطيع مع الاستمرار
    // بالضغط. الآن تتجمّع كل الضغطات المتتالية في فرق زمني واحد، ويُنفَّذ seekTo() الفعلي مرة
    // واحدة فقط بعد توقف قصير عن الضغط، مع تحديث فوري للنص وشريط التقدم كتغذية راجعة بصرية.
    private long pendingSeekDeltaMs = 0;
    private final Runnable seekDebounceRunnable = () -> {
        long delta = pendingSeekDeltaMs;
        pendingSeekDeltaMs = 0;
        if (delta != 0) {
            seekRelative(delta);
        }
    };

    private void seekRelativeDebounced(long deltaMs) {
        if (player == null) return;
        pendingSeekDeltaMs += deltaMs;
        handler.removeCallbacks(seekDebounceRunnable);
        handler.postDelayed(seekDebounceRunnable, 220);

        try {
            long dur = player.getDuration();
            long cur = player.getCurrentPosition();
            long shown = Math.max(0, cur + pendingSeekDeltaMs);
            if (dur > 0) {
                shown = Math.min(dur, shown);
                if (seekBar != null) {
                    int progress = (int) Math.min(1000, Math.max(0, (shown * 1000) / dur));
                    seekBar.setProgress(progress);
                }
            }
            if (tvPosition != null) tvPosition.setText(formatTime(shown));
        } catch (Throwable ignored) { }
    }

    private void lockControls() {
        isScreenLocked = true;
        hideControls();
        if (btnUnlockScreen != null) {
            btnUnlockScreen.setVisibility(View.VISIBLE);
        }
        Toast.makeText(this, "تم قفل الشاشة", Toast.LENGTH_SHORT).show();
    }

    private void unlockControls() {
        isScreenLocked = false;
        if (btnUnlockScreen != null) {
            btnUnlockScreen.setVisibility(View.GONE);
        }
        showControls();
        Toast.makeText(this, "تم فتح قفل الشاشة", Toast.LENGTH_SHORT).show();
    }

    // ==========================================
    // SETTINGS DRAWER (Matching Image 4 Exactly)
    // ==========================================
    private void openSettingsDrawer() {
        if (settingsDrawerOverlay != null) {
            populateSettingsTracks();
            settingsDrawerOverlay.setVisibility(View.VISIBLE);
            handler.removeCallbacks(hideControlsRunnable);
            if (btnCloseSettings != null) {
                btnCloseSettings.requestFocus();
            }
        }
    }

    private void closeSettingsDrawer() {
        if (settingsDrawerOverlay != null) {
            settingsDrawerOverlay.setVisibility(View.GONE);
            resetControlsHideTimer();
            if (btnSettings != null) {
                btnSettings.requestFocus();
            }
        }
    }

    private void populateSettingsTracks() {
        if (player == null) return;
        try {
            Tracks tracks = player.getCurrentTracks();

            // 1. VIDEO TRACKS
            if (rgVideoTracks != null) {
                rgVideoTracks.removeAllViews();
                addRadioButton(rgVideoTracks, "Disable", false, (buttonView, isChecked) -> {
                    if (isChecked) {
                        TrackSelectionParameters params = player.getTrackSelectionParameters()
                                .buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true)
                                .build();
                        player.setTrackSelectionParameters(params);
                    }
                });

                int videoIndex = 0;
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_VIDEO) {
                        TrackGroup tg = group.getMediaTrackGroup();
                        for (int i = 0; i < tg.length; i++) {
                            Format f = tg.getFormat(i);
                            String res = (f.width > 0 && f.height > 0) ? (f.width + " x " + f.height) : "Default";
                            String codec = f.sampleMimeType != null ? f.sampleMimeType.replace("video/", "") : "h264";
                            String label = videoIndex + ", VIDEO, " + codec + ", " + res;
                            boolean isSelected = group.isTrackSelected(i);

                            final int finalIndex = i;
                            final TrackGroup finalTg = tg;
                            addRadioButton(rgVideoTracks, label, isSelected, (buttonView, isChecked) -> {
                                if (isChecked) {
                                    TrackSelectionParameters params = player.getTrackSelectionParameters()
                                            .buildUpon()
                                            .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, false)
                                            .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                                            .addOverride(new TrackSelectionOverride(finalTg, finalIndex))
                                            .build();
                                    player.setTrackSelectionParameters(params);
                                }
                            });
                            videoIndex++;
                        }
                    }
                }
            }

            // 2. AUDIO TRACKS
            if (rgAudioTracks != null) {
                rgAudioTracks.removeAllViews();
                addRadioButton(rgAudioTracks, "Disable", false, (buttonView, isChecked) -> {
                    if (isChecked) {
                        TrackSelectionParameters params = player.getTrackSelectionParameters()
                                .buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                                .build();
                        player.setTrackSelectionParameters(params);
                    }
                });

                int audioIndex = 1;
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_AUDIO) {
                        TrackGroup tg = group.getMediaTrackGroup();
                        for (int i = 0; i < tg.length; i++) {
                            Format f = tg.getFormat(i);
                            String codec = f.sampleMimeType != null ? f.sampleMimeType.replace("audio/", "") : "aac";
                            String lang = f.language != null ? f.language : "und";
                            String sampleRate = f.sampleRate > 0 ? (f.sampleRate + " Hz") : "48000 Hz";
                            String label = audioIndex + ", AUDIO, " + codec + ", N/A, " + sampleRate + ", " + lang;
                            boolean isSelected = group.isTrackSelected(i);

                            final int finalIndex = i;
                            final TrackGroup finalTg = tg;
                            addRadioButton(rgAudioTracks, label, isSelected, (buttonView, isChecked) -> {
                                if (isChecked) {
                                    TrackSelectionParameters params = player.getTrackSelectionParameters()
                                            .buildUpon()
                                            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                                            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                                            .addOverride(new TrackSelectionOverride(finalTg, finalIndex))
                                            .build();
                                    player.setTrackSelectionParameters(params);
                                }
                            });
                            audioIndex++;
                        }
                    }
                }
            }

            // 3. SUBTITLE TRACKS
            if (rgSubtitleTracks != null) {
                rgSubtitleTracks.removeAllViews();
                int subCount = 0;

                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_TEXT) {
                        TrackGroup tg = group.getMediaTrackGroup();
                        for (int i = 0; i < tg.length; i++) {
                            Format f = tg.getFormat(i);
                            String label = f.label != null ? f.label : (f.language != null ? f.language : ("Subtitle #" + (subCount + 1)));
                            boolean isSelected = group.isTrackSelected(i);

                            final int finalIndex = i;
                            final TrackGroup finalTg = tg;
                            addRadioButton(rgSubtitleTracks, label, isSelected, (buttonView, isChecked) -> {
                                if (isChecked) {
                                    TrackSelectionParameters params = player.getTrackSelectionParameters()
                                            .buildUpon()
                                            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                                            .addOverride(new TrackSelectionOverride(finalTg, finalIndex))
                                            .build();
                                    player.setTrackSelectionParameters(params);
                                }
                            });
                            subCount++;
                        }
                    }
                }

                if (subCount == 0) {
                    if (tvNoSubtitles != null) tvNoSubtitles.setVisibility(View.VISIBLE);
                } else {
                    if (tvNoSubtitles != null) tvNoSubtitles.setVisibility(View.GONE);
                    addRadioButton(rgSubtitleTracks, "Disable Subtitles", false, (buttonView, isChecked) -> {
                        if (isChecked) {
                            TrackSelectionParameters params = player.getTrackSelectionParameters()
                                    .buildUpon()
                                    .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                    .build();
                            player.setTrackSelectionParameters(params);
                        }
                    });
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "populateSettingsTracks error", t);
        }
    }

    private void addRadioButton(RadioGroup group, String text, boolean isChecked, RadioButton.OnCheckedChangeListener listener) {
        RadioButton rb = new RadioButton(this);
        rb.setText(text);
        rb.setTextColor(Color.WHITE);
        rb.setTextSize(13.5f);
        rb.setChecked(isChecked);
        rb.setPadding(12, 10, 12, 10);
        rb.setButtonTintList(ColorStateList.valueOf(Color.parseColor("#5240d8")));
        rb.setFocusable(true);
        rb.setFocusableInTouchMode(true);
        rb.setOnCheckedChangeListener(listener);
        group.addView(rb);
    }

    // ==========================================
    // D-PAD & ANDROID TV REMOTE SUPPORT
    // ==========================================
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN || keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || keyCode == KeyEvent.KEYCODE_CHANNEL_UP ||
            keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN || keyCode == KeyEvent.KEYCODE_MENU) {
            isTvDevice = true;
            if (layoutBrightnessSlider != null) layoutBrightnessSlider.setVisibility(View.GONE);
            if (layoutVolumeSlider != null) layoutVolumeSlider.setVisibility(View.GONE);
        }

        if (settingsDrawerOverlay != null && settingsDrawerOverlay.getVisibility() == View.VISIBLE) {
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                closeSettingsDrawer();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                View focused = getCurrentFocus();
                if (focused != null) {
                    focused.performClick();
                    return true;
                }
            }
            return super.onKeyDown(keyCode, event);
        }

        if (isScreenLocked && keyCode != KeyEvent.KEYCODE_BACK) {
            return super.onKeyDown(keyCode, event);
        }

        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (controlsOverlay != null && controlsOverlay.getVisibility() != View.VISIBLE) {
                    showControls();
                    return true;
                }
                View focused = getCurrentFocus();
                if (focused != null && focused != playerView && focused != controlsOverlay && focused.getId() != R.id.player_root) {
                    focused.performClick();
                    resetControlsHideTimer();
                    return true;
                }
                togglePlayPause();
                showControls();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                if (controlsOverlay != null && controlsOverlay.getVisibility() != View.VISIBLE) {
                    showControls();
                }
                togglePlayPause();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (player != null) player.play();
                showControls();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (player != null) player.pause();
                showControls();
                return true;

            case KeyEvent.KEYCODE_MENU:
                openSettingsDrawer();
                return true;

            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD:
                if (controlsOverlay != null && controlsOverlay.getVisibility() == View.VISIBLE) {
                    resetControlsHideTimer();
                    break;
                }
                if (!isLiveStream) {
                    seekRelativeDebounced(-10000);
                    showSeekFeedback("-10s");
                    showControls();
                    return true;
                } else {
                    showControls();
                    return true;
                }

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD:
                if (controlsOverlay != null && controlsOverlay.getVisibility() == View.VISIBLE) {
                    resetControlsHideTimer();
                    break;
                }
                if (!isLiveStream) {
                    seekRelativeDebounced(10000);
                    showSeekFeedback("+10s");
                    showControls();
                    return true;
                } else {
                    showControls();
                    return true;
                }

            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
                if (controlsOverlay != null && controlsOverlay.getVisibility() != View.VISIBLE) {
                    showControls();
                    return true;
                }
                resetControlsHideTimer();
                break;

            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_PAGE_UP:
                showSeekFeedback("القناة التالية");
                break;

            case KeyEvent.KEYCODE_CHANNEL_DOWN:
            case KeyEvent.KEYCODE_PAGE_DOWN:
                showSeekFeedback("القناة السابقة");
                break;

            case KeyEvent.KEYCODE_MEDIA_STOP:
                finish();
                return true;

            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                if (controlsOverlay != null && controlsOverlay.getVisibility() == View.VISIBLE) {
                    hideControls();
                    return true;
                }
                finish();
                return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    private void setupPlayer() {
        videoUrl = getIntent().getStringExtra("videoUrl");
        if (videoUrl == null || videoUrl.trim().isEmpty()) {
            Toast.makeText(this, "رابط الفيديو غير صالح", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        videoUrl = videoUrl.trim();

        // Detect live stream
        isLiveStream = getIntent().getBooleanExtra("isLive", false) ||
                       videoUrl.contains("/live/") ||
                       (videoUrl.contains(".m3u8") && !videoUrl.contains("/movie/") && !videoUrl.contains("/series/"));

        if (isLiveStream) {
            if (badgeLiveIndicator != null) badgeLiveIndicator.setVisibility(View.VISIBLE);
            if (btnRewind10 != null) btnRewind10.setVisibility(View.GONE);
            if (btnForward10 != null) btnForward10.setVisibility(View.GONE);
            if (layoutSeekbarRow != null) layoutSeekbarRow.setVisibility(View.GONE);
            if (seekBar != null) seekBar.setVisibility(View.GONE);
            if (tvDuration != null) tvDuration.setVisibility(View.GONE);
            if (tvPosition != null) tvPosition.setVisibility(View.GONE);
            handler.removeCallbacks(updateProgressRunnable);
        } else {
            if (layoutSeekbarRow != null) layoutSeekbarRow.setVisibility(View.VISIBLE);
            if (seekBar != null) seekBar.setVisibility(View.VISIBLE);
            if (tvDuration != null) tvDuration.setVisibility(View.VISIBLE);
            if (tvPosition != null) tvPosition.setVisibility(View.VISIBLE);
        }

        try {
            DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 ALmEz0/1.0")
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(25000)
                    .setReadTimeoutMs(25000);

            DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(this)
                    .setDataSourceFactory(httpDataSourceFactory);

            // مخزن مؤقت أصغر على الأجهزة الضعيفة: مخزن كبير (50 ثانية) يحجز ذاكرة كبيرة لا يحتاجها
            // جهاز برام محدودة، ويزيد وقت الانتظار الأولي دون فائدة فعلية على معالج بطيء أصلاً
            DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        isLiveStream ? 8000 : (isLowEndDevice ? 10000 : 15000),
                        isLiveStream ? (isLowEndDevice ? 18000 : 25000) : (isLowEndDevice ? 30000 : 50000),
                        1000,
                        2500
                    )
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build();

            // فك التشفير العتادي: ExoPlayer يستخدم افتراضياً مُفكّكات MediaCodec العتادية (وليس
            // البرمجية) ما دامت الإضافات البرمجية معطلة، وهذا مثبت هنا صراحة. نضيف "الرجوع لمُفكك
            // آخر" حتى إن فشل المفكك العتادي الأساسي في التهيئة (شائع مع HEVC/H265 على شرائح
            // Amlogic الاقتصادية مثل TX9 Pro) يُجرَّب مفكك عتادي بديل بدل ظهور خطأ تشغيل.
            androidx.media3.exoplayer.DefaultRenderersFactory renderersFactory =
                    new androidx.media3.exoplayer.DefaultRenderersFactory(this)
                            .setExtensionRendererMode(androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
                            .setEnableDecoderFallback(true);

            player = new ExoPlayer.Builder(this, renderersFactory)
                    .setMediaSourceFactory(mediaSourceFactory)
                    .setLoadControl(loadControl)
                    .setAudioAttributes(audioAttributes, true)
                    .setHandleAudioBecomingNoisy(true)
                    .setSeekForwardIncrementMs(10000)
                    .setSeekBackIncrementMs(10000)
                    .build();

            // تقييد أقصى دقة/بت ريت لفك الترميز على الأجهزة الضعيفة: بدون هذا القيد يحاول ExoPlayer
            // تشغيل أعلى جودة يوفرها السيرفر (قد تصل 4K) حتى لو كان معالج الجهاز غير قادر على فكها
            // بسلاسة، فيظهر التقطيع رغم أن سرعة الإنترنت كافية تماماً (عنق الزجاجة هو المعالج لا الشبكة)
            if (isLowEndDevice) {
                try {
                    TrackSelectionParameters lowEndParams = player.getTrackSelectionParameters()
                            .buildUpon()
                            .setMaxVideoSize(1280, 720)
                            .setMaxVideoBitrate(4_000_000)
                            .build();
                    player.setTrackSelectionParameters(lowEndParams);
                } catch (Throwable t) {
                    Log.w(TAG, "low-end track constraint error", t);
                }
            }

            if (playerView != null) {
                playerView.setPlayer(player);
            }

            Uri uri = Uri.parse(videoUrl);
            MediaItem.Builder mediaItemBuilder = new MediaItem.Builder().setUri(uri);
            if (isLiveStream || videoUrl.contains(".m3u8") || videoUrl.contains("/live/")) {
                if (!videoUrl.contains(".ts") && !videoUrl.contains(".mp4") && !videoUrl.contains(".mkv")) {
                    mediaItemBuilder.setMimeType(androidx.media3.common.MimeTypes.APPLICATION_M3U8);
                }
            }
            MediaItem mediaItem = mediaItemBuilder.build();
            player.setMediaItem(mediaItem);
            player.prepare();
            player.setPlayWhenReady(true);

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    try {
                        if (pbBuffering != null) {
                            if (playbackState == Player.STATE_BUFFERING) {
                                pbBuffering.setVisibility(View.VISIBLE);
                            } else {
                                pbBuffering.setVisibility(View.GONE);
                            }
                        }

                        if (playbackState == Player.STATE_READY && player != null) {
                            long dur = player.getDuration();
                            if (dur > 0 && tvDuration != null) {
                                tvDuration.setText(formatTime(dur));
                            }
                        }
                    } catch (Throwable t) {
                        Log.w(TAG, "playbackStateChanged error", t);
                    }
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    try {
                        if (btnPlayPause != null) {
                            if (isPlaying) {
                                btnPlayPause.setImageResource(R.drawable.ic_player_pause);
                                resetControlsHideTimer();
                            } else {
                                btnPlayPause.setImageResource(R.drawable.ic_player_play);
                                showControls();
                            }
                            btnPlayPause.setColorFilter(Color.WHITE);
                        }
                    } catch (Throwable t) {
                        Log.w(TAG, "isPlayingChanged error", t);
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    try {
                        if (pbBuffering != null) pbBuffering.setVisibility(View.GONE);
                        Log.e(TAG, "ExoPlayer error: " + error.getMessage(), error);

                        // Automatic fallback for IPTV live streams: if .m3u8 fails, retry with .ts and vice-versa
                        if (isLiveStream && videoUrl != null && !isRetried) {
                            isRetried = true;
                            String fallbackUrl = null;
                            if (videoUrl.contains(".m3u8")) {
                                fallbackUrl = videoUrl.replace(".m3u8", ".ts");
                            } else if (videoUrl.contains(".ts")) {
                                fallbackUrl = videoUrl.replace(".ts", ".m3u8");
                            }
                            if (fallbackUrl != null && !fallbackUrl.equals(videoUrl)) {
                                videoUrl = fallbackUrl;
                                Log.i(TAG, "Retrying live stream with fallback: " + videoUrl);
                                MediaItem fallbackItem = new MediaItem.Builder()
                                        .setUri(Uri.parse(videoUrl))
                                        .build();
                                player.setMediaItem(fallbackItem);
                                player.prepare();
                                player.setPlayWhenReady(true);
                                return;
                            }
                        }

                        Toast.makeText(PlayerActivity.this, "تعذر استكمال البث من السيرفر", Toast.LENGTH_SHORT).show();
                    } catch (Throwable t) {
                        Log.w(TAG, "onPlayerError error", t);
                    }
                }
            });

            handler.post(updateProgressRunnable);
            resetControlsHideTimer();

        } catch (Throwable t) {
            Log.e(TAG, "Error initializing ExoPlayer", t);
            Toast.makeText(this, "خطأ في تشغيل الوسائط: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void showControls() {
        if (isScreenLocked) return;
        try {
            if (controlsOverlay != null) {
                controlsOverlay.setVisibility(View.VISIBLE);
            }
            if (!isTvDevice) {
                if (btnLock != null) btnLock.setVisibility(View.VISIBLE);
                if (layoutBrightnessSlider != null) {
                    layoutBrightnessSlider.setVisibility(View.VISIBLE);
                }
                if (layoutVolumeSlider != null) {
                    layoutVolumeSlider.setVisibility(View.VISIBLE);
                }
            } else {
                if (btnLock != null) btnLock.setVisibility(View.GONE);
                if (layoutBrightnessSlider != null) {
                    layoutBrightnessSlider.setVisibility(View.GONE);
                }
                if (layoutVolumeSlider != null) {
                    layoutVolumeSlider.setVisibility(View.GONE);
                }
            }

            if (isLiveStream) {
                if (layoutSeekbarRow != null) layoutSeekbarRow.setVisibility(View.GONE);
                if (seekBar != null) seekBar.setVisibility(View.GONE);
                if (tvDuration != null) tvDuration.setVisibility(View.GONE);
                if (tvPosition != null) tvPosition.setVisibility(View.GONE);
                if (btnRewind10 != null) btnRewind10.setVisibility(View.GONE);
                if (btnForward10 != null) btnForward10.setVisibility(View.GONE);
                if (badgeLiveIndicator != null) badgeLiveIndicator.setVisibility(View.VISIBLE);
            } else {
                if (layoutSeekbarRow != null) layoutSeekbarRow.setVisibility(View.VISIBLE);
                if (seekBar != null) seekBar.setVisibility(View.VISIBLE);
                if (tvDuration != null) tvDuration.setVisibility(View.VISIBLE);
                if (tvPosition != null) tvPosition.setVisibility(View.VISIBLE);
                if (btnRewind10 != null) btnRewind10.setVisibility(View.VISIBLE);
                if (btnForward10 != null) btnForward10.setVisibility(View.VISIBLE);
            }

            resetControlsHideTimer();
            if (isTvDevice && btnPlayPause != null) {
                btnPlayPause.requestFocus();
            }
        } catch (Throwable t) {
            Log.w(TAG, "showControls error", t);
        }
    }

    private void hideControls() {
        try {
            if (player != null && !isUserSeeking) {
                if (settingsDrawerOverlay != null && settingsDrawerOverlay.getVisibility() == View.VISIBLE) {
                    return; // Don't hide while settings drawer is open
                }
                if (controlsOverlay != null) {
                    controlsOverlay.setVisibility(View.GONE);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "hideControls error", t);
        }
    }

    private void resetControlsHideTimer() {
        try {
            handler.removeCallbacks(hideControlsRunnable);
            handler.postDelayed(hideControlsRunnable, 4500);
        } catch (Throwable ignored) { }
    }

    // FIXED: Exactly matches Image 3 formatting and prevents MissingFormatArgumentException
    private String formatTime(long ms) {
        if (ms <= 0) return "00:00";
        long totalSeconds = ms / 1000;
        long seconds = totalSeconds % 60;
        long minutes = (totalSeconds / 60) % 60;
        long hours = totalSeconds / 3600;
        if (hours > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        } else {
            return String.format(Locale.US, "%02d:%02d", minutes, seconds);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) {
            try {
                player.pause();
            } catch (Throwable ignored) { }
        }
    }

    // إصلاح مهم: لم يكن هناك onResume() مقابل لـ onPause() إطلاقاً. بعض أجهزة أندرويد تي في
    // تستدعي onPause() لحظياً فور فتح الشاشة (أثناء انتقال الواجهة أو تراكب مؤقت من النظام)
    // دون أي تدخل من المستخدم، وبما أن onPause() كانت توقف المشغل دائماً بلا أي استئناف تلقائي
    // لاحق، كانت قنوات البث المباشر تُفتح ثم تتجمد فوراً في وضع الإيقاف المؤقت، فيضطر المستخدم
    // للضغط يدوياً على زر التشغيل رغم أن الكود الأصلي كان يطلب التشغيل التلقائي بالفعل.
    @Override
    protected void onResume() {
        super.onResume();
        if (player != null && !isUserPaused) {
            try {
                player.play();
            } catch (Throwable ignored) { }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            handler.removeCallbacksAndMessages(null);
            if (player != null) {
                player.release();
                player = null;
            }
        } catch (Throwable t) {
            Log.w(TAG, "Error during onDestroy", t);
        }
    }
}
