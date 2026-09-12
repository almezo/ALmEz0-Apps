package com.almezo.servers;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

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
    private TextView tvTitle;
    private TextView tvPosition;
    private TextView tvDuration;
    private SeekBar seekBar;
    private Button btnAspect;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isUserSeeking = false;
    private int currentAspectMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

    private final Runnable updateProgressRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (player != null && !isFinishing() && !isDestroyed()) {
                    if (player.isPlaying() && !isUserSeeking && seekBar != null) {
                        long pos = player.getCurrentPosition();
                        long dur = player.getDuration();
                        if (dur > 0 && pos >= 0) {
                            int progress = (int) Math.min(1000, Math.max(0, (pos * 1000) / dur));
                            seekBar.setProgress(progress);
                            if (tvPosition != null) tvPosition.setText(formatTime(pos));
                            if (tvDuration != null) tvDuration.setText(formatTime(dur));
                        }
                    }
                }
            } catch (Throwable ignored) { }

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
                Log.w(TAG, "hideControls error", t);
            }
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Global crash guard to prevent hard app crash
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

            enableImmersiveFullscreen();
            initViews();
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
        tvTitle = findViewById(R.id.tv_title);
        tvPosition = findViewById(R.id.tv_position);
        tvDuration = findViewById(R.id.tv_duration);
        seekBar = findViewById(R.id.seek_bar);
        btnAspect = findViewById(R.id.btn_aspect);

        String title = getIntent().getStringExtra("title");
        if (title != null && !title.isEmpty() && tvTitle != null) {
            tvTitle.setText(title);
        }

        if (btnBack != null) {
            btnBack.setOnClickListener(v -> finish());
        }

        if (btnPlayPause != null) {
            btnPlayPause.setOnClickListener(v -> {
                if (player != null) {
                    try {
                        if (player.isPlaying()) {
                            player.pause();
                        } else {
                            player.play();
                        }
                    } catch (Throwable t) {
                        Log.w(TAG, "play/pause toggle error", t);
                    }
                }
                resetControlsHideTimer();
            });
        }

        if (btnRewind10 != null) {
            btnRewind10.setOnClickListener(v -> {
                if (player != null) {
                    try {
                        long newPos = Math.max(0, player.getCurrentPosition() - 10000);
                        player.seekTo(newPos);
                    } catch (Throwable t) {
                        Log.w(TAG, "rewind error", t);
                    }
                }
                resetControlsHideTimer();
            });
        }

        if (btnForward10 != null) {
            btnForward10.setOnClickListener(v -> {
                if (player != null) {
                    try {
                        long dur = player.getDuration();
                        long newPos = (dur > 0) ? Math.min(dur, player.getCurrentPosition() + 10000) : (player.getCurrentPosition() + 10000);
                        player.seekTo(newPos);
                    } catch (Throwable t) {
                        Log.w(TAG, "forward error", t);
                    }
                }
                resetControlsHideTimer();
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

        View playerRoot = findViewById(R.id.player_root);
        if (playerRoot != null) {
            playerRoot.setOnClickListener(v -> {
                if (controlsOverlay != null) {
                    if (controlsOverlay.getVisibility() == View.VISIBLE) {
                        hideControls();
                    } else {
                        showControls();
                    }
                }
            });
        }
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
            if (player != null && player.isPlaying() && !isUserSeeking) {
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
            handler.postDelayed(hideControlsRunnable, 4000);
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
