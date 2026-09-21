package com.almezo.servers.nat;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** الفحص الدوري لإشعارات المدير والتطبيق مغلق (انظر BroadcastNotifier). */
public class BroadcastJobService extends JobService {

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            BroadcastNotifier.checkNow(getApplicationContext());
            jobFinished(params, false);
        }, "broadcast-job").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
