package com.almezo.servers;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.Locale;

public class PlayerActivity extends AppCompatActivity {

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
            if (player != null && player.isPlaying() && !isUserSeeking) {
                long pos = player.getCurrentPosition();
                long dur = player.getDuration();
                if (dur > 0) {
                    seekBar.setProgress((int) ((pos * 1000) / dur));
                    tvPosition.setText(formatTime(pos));
                    tvDuration.setText(formatTime(dur));
                }
            }
            handler.postDelayed(this, 500);
        }
    };

    private final Runnable hideControlsRunnable = new Runnable() {
        @Override
        public void run() {
            hideControls();
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Immersive Sticky Fullscreen
        enableImmersiveFullscreen();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_player);

        initViews();
        setupPlayer();
    }

    private void enableImmersiveFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
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
        if (title != null && !title.isEmpty()) {
            tvTitle.setText(title);
        }

        btnBack.setOnClickListener(v -> finish());

        btnPlayPause.setOnClickListener(v -> {
            if (player != null) {
                if (player.isPlaying()) {
                    player.pause();
                } else {
                    player.play();
                }
            }
            resetControlsHideTimer();
        });

        btnRewind10.setOnClickListener(v -> {
            if (player != null) {
                long newPos = Math.max(0, player.getCurrentPosition() - 10000);
                player.seekTo(newPos);
            }
            resetControlsHideTimer();
        });

        btnForward10.setOnClickListener(v -> {
            if (player != null) {
                long dur = player.getDuration();
                long newPos = (dur > 0) ? Math.min(dur, player.getCurrentPosition() + 10000) : (player.getCurrentPosition() + 10000);
                player.seekTo(newPos);
            }
            resetControlsHideTimer();
        });

        btnAspect.setOnClickListener(v -> {
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
            resetControlsHideTimer();
        });

        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                if (fromUser && player != null) {
                    long dur = player.getDuration();
                    if (dur > 0) {
                        long target = (dur * progress) / 1000;
                        tvPosition.setText(formatTime(target));
                    }
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
                    long dur = player.getDuration();
                    if (dur > 0) {
                        long target = (dur * sb.getProgress()) / 1000;
                        player.seekTo(target);
                    }
                }
                isUserSeeking = false;
                resetControlsHideTimer();
            }
        });

        findViewById(R.id.player_root).setOnClickListener(v -> {
            if (controlsOverlay.getVisibility() == View.VISIBLE) {
                hideControls();
            } else {
                showControls();
            }
        });
    }

    private void setupPlayer() {
        String videoUrl = getIntent().getStringExtra("videoUrl");
        if (videoUrl == null || videoUrl.isEmpty()) {
            Toast.makeText(this, "رابط الفيديو غير صالح", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(videoUrl));
        player.setMediaItem(mediaItem);
        player.prepare();
        player.setPlayWhenReady(true);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_BUFFERING) {
                    pbBuffering.setVisibility(View.VISIBLE);
                } else {
                    pbBuffering.setVisibility(View.GONE);
                }

                if (playbackState == Player.STATE_READY) {
                    long dur = player.getDuration();
                    if (dur > 0) {
                        tvDuration.setText(formatTime(dur));
                    }
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
                    resetControlsHideTimer();
                } else {
                    btnPlayPause.setImageResource(android.R.drawable.ic_media_play);
                    showControls();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                pbBuffering.setVisibility(View.GONE);
                Toast.makeText(PlayerActivity.this, "تعذر تشغيل هذا الرابط من السيرفر", Toast.LENGTH_LONG).show();
            }
        });

        handler.post(updateProgressRunnable);
        resetControlsHideTimer();
    }

    private void showControls() {
        controlsOverlay.setVisibility(View.VISIBLE);
        enableImmersiveFullscreen();
        resetControlsHideTimer();
    }

    private void hideControls() {
        if (player != null && player.isPlaying() && !isUserSeeking) {
            controlsOverlay.setVisibility(View.GONE);
            enableImmersiveFullscreen();
        }
    }

    private void resetControlsHideTimer() {
        handler.removeCallbacks(hideControlsRunnable);
        handler.postDelayed(hideControlsRunnable, 3500);
    }

    private String formatTime(long ms) {
        if (ms <= 0) return "00:00";
        long totalSeconds = ms / 1000;
        long seconds = totalSeconds % 60;
        long minutes = (totalSeconds / 60) % 60;
        long hours = totalSeconds / 3600;
        if (hours > 0) {
            return String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds);
        } else {
            return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) {
            player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
