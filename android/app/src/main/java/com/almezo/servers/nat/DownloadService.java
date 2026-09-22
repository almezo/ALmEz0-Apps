package com.almezo.servers.nat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.almezo.servers.R;

/**
 * خدمة أمامية تُبقي التنزيل يعمل والبرنامج في الخلفية أو الشاشة مطفأة، مع إشعار فيه التقدّم.
 * تتوقف من نفسها حين لا يبقى تنزيل نشط.
 */
public class DownloadService extends Service implements Downloads.Listener {

    private static final String CHANNEL = "almezo_downloads";
    private static final int NOTIF_ID = 7301;
    private static final String ACTION_PAUSE = "com.almezo.servers.DOWNLOAD_PAUSE";

    private Downloads downloads;
    private long lastUpdate;

    public static void start(Context ctx) {
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, DownloadService.class));
        } catch (Exception ignored) {
            // بدء خدمة أمامية من الخلفية ممنوع في أندرويد 12+؛ التنزيل يكمل ما دام البرنامج مفتوحاً
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        downloads = Downloads.get(this);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_PAUSE.equals(intent.getAction())) {
            Downloads.Item cur = downloads.current();
            if (cur != null) downloads.pause(cur.id);
        }
        Notification n = build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, n);
        }
        downloads.addListener(this);
        if (!downloads.hasActiveWork()) stopSelfClean();
        return START_NOT_STICKY;
    }

    /** أندرويد 15 يحدّ خدمات مزامنة البيانات بـ6 ساعات يومياً: نوقف مؤقتاً بدل أن يُغلق البرنامج. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Downloads.Item cur = downloads.current();
        if (cur != null) downloads.pause(cur.id);
        stopSelfClean();
    }

    @Override
    public void onDownloadsChanged() {
        if (!downloads.hasActiveWork()) {
            stopSelfClean();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastUpdate < 1000) return;
        lastUpdate = now;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, build());
    }

    private void stopSelfClean() {
        downloads.removeListener(this);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        downloads.removeListener(this);
        super.onDestroy();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "التنزيلات", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("تقدّم تنزيل الأفلام والحلقات");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification build() {
        Downloads.Item cur = downloads.current();
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, DownloadsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.fa_download)
                .setContentIntent(open)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (cur == null) {
            b.setContentTitle("التنزيلات").setContentText(downloads.isPlaybackActive()
                    ? "متوقف أثناء المشاهدة" : "في قائمة الانتظار").setProgress(0, 0, true);
        } else {
            b.setContentTitle(cur.title)
                    .setContentText(cur.percent() + "% · " + Downloads.formatBytes(cur.done) + " / "
                            + Downloads.formatBytes(cur.total) + " · " + Downloads.formatSpeed(cur.speed))
                    .setProgress(100, cur.percent(), cur.total <= 0);
            PendingIntent pause = PendingIntent.getService(this, 1,
                    new Intent(this, DownloadService.class).setAction(ACTION_PAUSE), flags);
            b.addAction(R.drawable.fa_pause, "إيقاف مؤقت", pause);
        }
        return b.build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
