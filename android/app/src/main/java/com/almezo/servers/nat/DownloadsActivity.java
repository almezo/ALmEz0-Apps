package com.almezo.servers.nat;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.R;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * صفحة التنزيلات: ما نزل وما يتنزل وما ينتظر، ومكان الحفظ. تعمل بلا إنترنت وبلا حساب نشط،
 * لأن كل ما تعرضه محفوظ مع الملفات نفسها.
 */
public class DownloadsActivity extends BaseActivity implements Downloads.Listener {

    private Downloads dl;
    private NavBar nav;
    private final List<Downloads.Item> shown = new ArrayList<>();
    private final Adapter adapter = new Adapter();

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.nat_activity_downloads);
        nav = new NavBar(this).backOnly(this);
        dl = Downloads.get(this);

        RecyclerView list = findViewById(R.id.dl_list);
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setItemAnimator(null); // التحديث كل نصف ثانية بلا وميض
        list.setAdapter(adapter);

        View storage = findViewById(R.id.dl_storage_btn);
        applyFocusScale(storage, 1.05f);
        storage.setOnClickListener(v -> chooseStorage());
        refresh();
        dl.resumePending();
    }

    @Override
    protected void onStart() {
        super.onStart();
        nav.start();
        dl.addListener(this);
        refresh();
    }

    @Override
    protected void onStop() {
        dl.removeListener(this);
        nav.stop();
        super.onStop();
    }

    @Override
    public void onDownloadsChanged() {
        refresh();
    }

    private void refresh() {
        List<Downloads.Item> all = dl.all();
        // النشطة أولاً ثم المتوقفة ثم المكتملة، والأحدث أولاً داخل كل مجموعة
        all.sort((x, y) -> {
            int rx = rank(x), ry = rank(y);
            if (rx != ry) return Integer.compare(rx, ry);
            return Long.compare(y.createdAt, x.createdAt);
        });
        boolean sameIds = all.size() == shown.size();
        for (int n = 0; sameIds && n < all.size(); n++) sameIds = all.get(n).id.equals(shown.get(n).id);
        shown.clear();
        shown.addAll(all);
        if (sameIds) adapter.notifyItemRangeChanged(0, shown.size(), "progress");
        else adapter.notifyDataSetChanged();

        findViewById(R.id.dl_empty).setVisibility(shown.isEmpty() ? View.VISIBLE : View.GONE);

        int done = 0, active = 0;
        long used = 0;
        for (Downloads.Item i : all) {
            if (Downloads.DONE.equals(i.state)) { done++; used += i.total; }
            else if (i.isActive()) active++;
        }
        String summary = done + " ملف جاهز للمشاهدة بدون إنترنت (" + Downloads.ltr(Downloads.formatBytes(used)) + ")";
        if (active > 0) summary += "   ·   " + active + " قيد التنزيل أو الانتظار";
        if (dl.isPlaybackActive() && active > 0) summary += "   ·   متوقف أثناء المشاهدة";
        ((TextView) findViewById(R.id.dl_summary)).setText(summary);

        int idx = dl.storageIndex();
        File dir = dl.storageDirs().get(idx);
        ((TextView) findViewById(R.id.dl_storage_text)).setText(
                Downloads.storageLabel(idx) + " · متاح " + Downloads.ltr(Downloads.formatBytes(Downloads.freeBytes(dir))));
    }

    private static int rank(Downloads.Item i) {
        if (Downloads.RUNNING.equals(i.state)) return 0;
        if (Downloads.QUEUED.equals(i.state)) return 1;
        if (Downloads.PAUSED.equals(i.state) || Downloads.FAILED.equals(i.state)) return 2;
        return 3;
    }

    /** مكان حفظ التنزيلات الجديدة: الذاكرة الداخلية أو بطاقة SD إن وُجدت. */
    private void chooseStorage() {
        List<File> dirs = dl.storageDirs();
        if (dirs.size() < 2) {
            toast("الملفات تُحفظ في ذاكرة الجهاز داخل البرنامج (متاح " + Downloads.formatBytes(Downloads.freeBytes(dirs.get(0))) + "). لا توجد بطاقة ذاكرة خارجية.");
            return;
        }
        int next = (dl.storageIndex() + 1) % dirs.size();
        dl.setStorageIndex(next);
        toast("التنزيلات الجديدة ستُحفظ في: " + Downloads.storageLabel(next));
        refresh();
    }

    private class Adapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
        @NonNull
        @Override
        public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_download, parent, false);
            applyFocusScale(v.findViewById(R.id.dl_btn_primary), 1.12f);
            applyFocusScale(v.findViewById(R.id.dl_btn_secondary), 1.12f);
            return new RecyclerView.ViewHolder(v) { };
        }

        @Override
        public void onBindViewHolder(@NonNull RecyclerView.ViewHolder h, int position) {
            DownloadViews.bind(DownloadsActivity.this, h.itemView, shown.get(position), DownloadsActivity.this::refresh);
        }

        @Override
        public int getItemCount() {
            return shown.size();
        }
    }
}
