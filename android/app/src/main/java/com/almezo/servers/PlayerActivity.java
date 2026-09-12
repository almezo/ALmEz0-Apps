package com.almezo.servers;

import android.content.Context;
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
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
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

import java.util.ArrayList;
import java.util.List;
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
    private ImageButton btnSubtitles;
    private ImageButton btnAudio;
    private ImageButton btnQualityInfo;
    private ImageButton btnLock;
    private ImageButton btnUnlockScreen;
    private TextView tvTitle;
    private TextView tvPosition;
    private TextView tvDuration;
    private SeekBar seekBar;
    private Button btnAspect;

    // Floating HUDs
    private LinearLayout hudVolumeBrightness;
    private ImageView hudIcon;
    private ProgressBar hudProgress;
    private TextView hudText;
    private TextView tvSeekFeedback;

    private AudioManager audioManager;
    private int maxVolume = 15;
    private float currentBrightness = 0.5f;
    private boolean isScreenLocked = false;
    private boolean isUserSeeking = false;
    private int currentAspectMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private GestureDetector gestureDetector;

    private final Runnable updateProgressRunnable = new Runnable() {
        @Override
        public void run() {
            try {
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

    private final Runnable hideHudRunnable = new Runnable() {
        @Override
        public void run() {
            if (hudVolumeBrightness != null) {
                hudVolumeBrightness.setVisibility(View.GONE);
            }
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
            setContentView(R.layout.activity_player);

            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            }

            // Init brightness
            try {
                int sysBrightness = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128);
                currentBrightness = sysBrightness / 255.0f;
            } catch (Throwable ignored) {
                currentBrightness = 0.5f;
            }

            enableImmersiveFullscreen();
            initViews();
            setupGestures();
            setupPlayer();
        } catch (Throwable t) {
            Log.e(TAG, "Critical error during PlayerActivity onCreate", t);
            Toast.makeText(this, "تعذر تشغيل الفيديو: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
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
        btnSubtitles = findViewById(R.id.btn_subtitles);
        btnAudio = findViewById(R.id.btn_audio);
        btnQualityInfo = findViewById(R.id.btn_quality_info);
        btnLock = findViewById(R.id.btn_lock);
        btnUnlockScreen = findViewById(R.id.btn_unlock_screen);
        tvTitle = findViewById(R.id.tv_title);
        tvPosition = findViewById(R.id.tv_position);
        tvDuration = findViewById(R.id.tv_duration);
        seekBar = findViewById(R.id.seek_bar);
        btnAspect = findViewById(R.id.btn_aspect);

        hudVolumeBrightness = findViewById(R.id.hud_volume_brightness);
        hudIcon = findViewById(R.id.hud_icon);
        hudProgress = findViewById(R.id.hud_progress);
        hudText = findViewById(R.id.hud_text);
        tvSeekFeedback = findViewById(R.id.tv_seek_feedback);

        String title = getIntent().getStringExtra("title");
        if (title != null && !title.isEmpty() && tvTitle != null) {
            tvTitle.setText(title);
        }

        if (btnBack != null) {
            btnBack.setOnClickListener(v -> finish());
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
                resetControlsHideTimer();
            });
        }

        if (btnForward10 != null) {
            btnForward10.setOnClickListener(v -> {
                seekRelative(10000);
                resetControlsHideTimer();
            });
        }

        if (btnSubtitles != null) {
            btnSubtitles.setOnClickListener(v -> {
                showSubtitlesDialog();
                resetControlsHideTimer();
            });
        }

        if (btnAudio != null) {
            btnAudio.setOnClickListener(v -> {
                showAudioTracksDialog();
                resetControlsHideTimer();
            });
        }

        if (btnQualityInfo != null) {
            btnQualityInfo.setOnClickListener(v -> {
                showVideoQualityDialog();
                resetControlsHideTimer();
            });
        }

        if (btnLock != null) {
            btnLock.setOnClickListener(v -> {
                lockControls();
            });
        }

        if (btnUnlockScreen != null) {
            btnUnlockScreen.setOnClickListener(v -> {
                unlockControls();
            });
        }

        if (btnAspect != null && playerView != null) {
            btnAspect.setOnClickListener(v -> {
                try {
                    if (currentAspectMode == AspectRatioFrameLayout.RESIZE_MODE_FIT) {
                        currentAspectMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
                        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
                        btnAspect.setText("تكبير");
                    } else if (currentAspectMode == AspectRatioFrameLayout.RESIZE_MODE_ZOOM) {
                        currentAspectMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
                        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                        btnAspect.setText("تمديد");
                    } else {
                        currentAspectMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
                        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                        btnAspect.setText("16:9");
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "aspect change error", t);
                }
                resetControlsHideTimer();
            });
        }

        if (seekBar != null) {
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
        }
    }

    private void setupGestures() {
        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (isScreenLocked) return true;
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
                    // Double tap left -> rewind 10s
                    seekRelative(-10000);
                    showSeekFeedback("-10 ثواني");
                } else if (x > screenWidth * 0.6f) {
                    // Double tap right -> forward 10s
                    seekRelative(10000);
                    showSeekFeedback("+10 ثواني");
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
                    if (isScreenLocked) {
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
                                float percentDelta = deltaY / (screenHeight * 0.6f);
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
                            if (isVerticalDrag) {
                                handler.postDelayed(hideHudRunnable, 1200);
                            }
                            break;
                    }
                    return true;
                }
            });
        }
    }

    private void adjustVolume(float delta) {
        if (audioManager == null) return;
        try {
            int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            int step = (int) (delta * maxVolume);
            int target = Math.max(0, Math.min(maxVolume, current + step));
            if (step != 0) {
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
            }

            int percent = (target * 100) / Math.max(1, maxVolume);
            showHud(R.drawable.ic_player_volume, percent, "صوت: " + percent + "%");
        } catch (Throwable t) {
            Log.w(TAG, "adjustVolume error", t);
        }
    }

    private void adjustBrightness(float delta) {
        try {
            currentBrightness = Math.max(0.05f, Math.min(1.0f, currentBrightness + delta));
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.screenBrightness = currentBrightness;
            getWindow().setAttributes(lp);

            int percent = (int) (currentBrightness * 100);
            showHud(R.drawable.ic_player_brightness, percent, "سطوع: " + percent + "%");
        } catch (Throwable t) {
            Log.w(TAG, "adjustBrightness error", t);
        }
    }

    private void showHud(int iconRes, int progress, String text) {
        try {
            handler.removeCallbacks(hideHudRunnable);
            if (hudVolumeBrightness != null) {
                if (hudIcon != null) hudIcon.setImageResource(iconRes);
                if (hudProgress != null) hudProgress.setProgress(progress);
                if (hudText != null) hudText.setText(text);
                hudVolumeBrightness.setVisibility(View.VISIBLE);
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

    private void togglePlayPause() {
        if (player != null) {
            try {
                if (player.isPlaying()) {
                    player.pause();
                } else {
                    player.play();
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
    // SUBTITLES DIALOG
    // ==========================================
    private void showSubtitlesDialog() {
        if (player == null) return;
        try {
            Tracks tracks = player.getCurrentTracks();
            List<String> names = new ArrayList<>();
            List<TrackSelectionOverride> overrides = new ArrayList<>();

            names.add("إيقاف الترجمة");
            overrides.add(null);

            for (Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_TEXT) {
                    TrackGroup tg = group.getMediaTrackGroup();
                    for (int i = 0; i < tg.length; i++) {
                        Format f = tg.getFormat(i);
                        String label = f.label != null ? f.label : (f.language != null ? f.language : ("ترجمة #" + (names.size())));
                        names.add(label);
                        overrides.add(new TrackSelectionOverride(tg, i));
                    }
                }
            }

            if (names.size() <= 1) {
                Toast.makeText(this, "لا توجد ملفات ترجمة مدمجة لهذا المقطع", Toast.LENGTH_SHORT).show();
                return;
            }

            AlertDialog.Builder b = new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert);
            b.setTitle("الترجمة المدمجة");
            b.setItems(names.toArray(new String[0]), (dialog, which) -> {
                try {
                    TrackSelectionParameters.Builder params = player.getTrackSelectionParameters().buildUpon();
                    if (which == 0) {
                        params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                        Toast.makeText(this, "تم إيقاف الترجمة", Toast.LENGTH_SHORT).show();
                    } else {
                        params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                        params.clearOverridesOfType(C.TRACK_TYPE_TEXT);
                        params.addOverride(overrides.get(which));
                        Toast.makeText(this, "تم تفعيل: " + names.get(which), Toast.LENGTH_SHORT).show();
                    }
                    player.setTrackSelectionParameters(params.build());
                } catch (Throwable t) {
                    Log.w(TAG, "subtitle selection error", t);
                }
            });
            b.setNegativeButton("إلغاء", null);
            b.show();
        } catch (Throwable t) {
            Log.e(TAG, "showSubtitlesDialog error", t);
        }
    }

    // ==========================================
    // AUDIO TRACKS DIALOG
    // ==========================================
    private void showAudioTracksDialog() {
        if (player == null) return;
        try {
            Tracks tracks = player.getCurrentTracks();
            List<String> names = new ArrayList<>();
            List<TrackSelectionOverride> overrides = new ArrayList<>();

            for (Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_AUDIO) {
                    TrackGroup tg = group.getMediaTrackGroup();
                    for (int i = 0; i < tg.length; i++) {
                        Format f = tg.getFormat(i);
                        String lang = f.label != null ? f.label : (f.language != null ? f.language : ("مسار صوتي #" + (names.size() + 1)));
                        if (f.channelCount > 0) {
                            lang += " (" + f.channelCount + "ch)";
                        }
                        names.add(lang);
                        overrides.add(new TrackSelectionOverride(tg, i));
                    }
                }
            }

            if (names.isEmpty()) {
                Toast.makeText(this, "لا توجد مسارات صوتية بديلة لهذا المقطع", Toast.LENGTH_SHORT).show();
                return;
            }

            AlertDialog.Builder b = new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert);
            b.setTitle("المسار الصوتي / الدبلجة");
            b.setItems(names.toArray(new String[0]), (dialog, which) -> {
                try {
                    TrackSelectionParameters.Builder params = player.getTrackSelectionParameters().buildUpon();
                    params.clearOverridesOfType(C.TRACK_TYPE_AUDIO);
                    params.addOverride(overrides.get(which));
                    player.setTrackSelectionParameters(params.build());
                    Toast.makeText(this, "تم اختيار: " + names.get(which), Toast.LENGTH_SHORT).show();
                } catch (Throwable t) {
                    Log.w(TAG, "audio track selection error", t);
                }
            });
            b.setNegativeButton("إلغاء", null);
            b.show();
        } catch (Throwable t) {
            Log.e(TAG, "showAudioTracksDialog error", t);
        }
    }

    // ==========================================
    // VIDEO QUALITY & SPECS DIALOG
    // ==========================================
    private void showVideoQualityDialog() {
        if (player == null) return;
        try {
            Format vf = player.getVideoFormat();
            String res = (vf != null && vf.width > 0 && vf.height > 0) ? (vf.width + " × " + vf.height) : "تلقائي (حسب البث)";
            String codec = (vf != null && vf.sampleMimeType != null) ? vf.sampleMimeType.replace("video/", "") : "H.264 / HEVC";
            float fps = (vf != null && vf.frameRate > 0) ? vf.frameRate : 0;
            String fpsText = (fps > 0) ? String.format(Locale.US, "%.1f FPS", fps) : "قياسي";

            String infoMessage = "دقة الفيديو: " + res + "\n"
                    + "معدل الإطارات: " + fpsText + "\n"
                    + "ترميز الفيديو: " + codec + "\n"
                    + "بروتوكول البث: IPTV Stream (HTTP)\n"
                    + "المشغل: ExoPlayer Media3 (تسريع عتادي)";

            AlertDialog.Builder b = new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert);
            b.setTitle("معلومات وجودة البث");
            b.setMessage(infoMessage);
            b.setPositiveButton("حسناً", null);
            b.show();
        } catch (Throwable t) {
            Log.e(TAG, "showVideoQualityDialog error", t);
        }
    }

    // ==========================================
    // D-PAD & ANDROID TV REMOTE SUPPORT
    // ==========================================
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isScreenLocked && keyCode != KeyEvent.KEYCODE_BACK) {
            return super.onKeyDown(keyCode, event);
        }

        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlayPause();
                showControls();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (player != null) player.play();
                showControls();
                return true;

            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (player != null) player.pause();
                showControls();
                return true;

            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD:
                seekRelative(-10000);
                showSeekFeedback("-10 ثواني");
                showControls();
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD:
                seekRelative(10000);
                showSeekFeedback("+10 ثواني");
                showControls();
                return true;

            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
                if (controlsOverlay != null && controlsOverlay.getVisibility() != View.VISIBLE) {
                    showControls();
                    return true;
                }
                break;

            case KeyEvent.KEYCODE_MEDIA_STOP:
            case KeyEvent.KEYCODE_BACK:
                finish();
                return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    private void setupPlayer() {
        String videoUrl = getIntent().getStringExtra("videoUrl");
        if (videoUrl == null || videoUrl.trim().isEmpty()) {
            Toast.makeText(this, "رابط الفيديو غير صالح", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        videoUrl = videoUrl.trim();

        try {
            // Configure HttpDataSource with cross-protocol redirects and standard IPTV User-Agent
            DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 ALmEz0/1.0")
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(25000)
                    .setReadTimeoutMs(25000);

            DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(this)
                    .setDataSourceFactory(httpDataSourceFactory);

            // Resilient buffer control for smooth IPTV streaming
            DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                            15000, // minBufferMs
                            50000, // maxBufferMs
                            1500,  // bufferForPlaybackMs
                            3000   // bufferForPlaybackAfterRebufferMs
                    )
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build();

            player = new ExoPlayer.Builder(this)
                    .setMediaSourceFactory(mediaSourceFactory)
                    .setLoadControl(loadControl)
                    .setAudioAttributes(audioAttributes, true)
                    .setHandleAudioBecomingNoisy(true)
                    .setSeekForwardIncrementMs(10000)
                    .setSeekBackIncrementMs(10000)
                    .build();

            if (playerView != null) {
                playerView.setPlayer(player);
            }

            MediaItem mediaItem = MediaItem.fromUri(Uri.parse(videoUrl));
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
            resetControlsHideTimer();
        } catch (Throwable t) {
            Log.w(TAG, "showControls error", t);
        }
    }

    private void hideControls() {
        try {
            if (player != null && !isUserSeeking) {
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

    private String formatTime(long ms) {
        if (ms <= 0) return "00:00";
        long totalSeconds = ms / 1000;
        long seconds = totalSeconds % 60;
        long minutes = (totalSeconds / 60) % 60;
        long hours = totalSeconds / 3600;
        if (hours > 0) {
            return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds);
        } else {
            return String.format(Locale.US, "%02d:%02d:%02d", minutes, seconds);
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
