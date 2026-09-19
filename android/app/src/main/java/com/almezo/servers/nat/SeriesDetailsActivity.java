package com.almezo.servers.nat;

import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.res.ResourcesCompat;
import androidx.core.widget.NestedScrollView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * تفاصيل المسلسل (#series-details-screen):
 * المواسم، الحلقات، التشغيل، التقييم، شريط مسلسلات رائجة أفقي، وزر الصعود للأعلى الدائري.
 */
public class SeriesDetailsActivity extends BaseActivity {

    private Store store;
    private Xtream api;
    private NavBar nav;
    private String seriesId, name, cover;
    private JSONObject episodesBySeason;
    private final List<String> seasonKeys = new ArrayList<>();
    private final List<JSONObject> episodes = new ArrayList<>();
    private String activeSeason;
    private EpisodeAdapter adapter;

    private NestedScrollView mainScroll;
    private View btnScrollTop;
    private final List<Models.Item> popularItems = new ArrayList<>();
    private PopularAdapter popularAdapter;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);
        Models.Account acc = store.active();
        if (acc == null) { finish(); return; }
        api = new Xtream(this, acc);
        seriesId = getIntent().getStringExtra("id");
        name = getIntent().getStringExtra("name");
        cover = getIntent().getStringExtra("cover");

        setContentView(R.layout.nat_activity_details);
        nav = new NavBar(this).backOnly(this);

        ((TextView) findViewById(R.id.det_title)).setText(name);
        Ui.loadImage(findViewById(R.id.det_poster), cover, Ui.logoPlaceholder());
        ((TextView) findViewById(R.id.det_btn_play_text)).setText("تشغيل الحلقة الأولى");

        // في المسلسل: الحلقات تأخذ مساحة القصة
        View storyBox = findViewById(R.id.det_story_box);
        if (storyBox != null) storyBox.setVisibility(View.GONE);

        RecyclerView list = findViewById(R.id.det_episodes);
        list.setVisibility(View.VISIBLE);
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setItemAnimator(null);
        adapter = new EpisodeAdapter();
        list.setAdapter(adapter);

        View play = findViewById(R.id.det_btn_play);
        applyFocusScale(play, 1.05f);
        play.setOnClickListener(v -> { if (!episodes.isEmpty()) playEpisode(episodes.get(0)); });
        play.requestFocus();

        ImageButton fav = findViewById(R.id.det_btn_fav);
        applyFocusScale(fav, 1.12f);
        paintFav(fav);
        fav.setOnClickListener(v -> {
            boolean now = store.toggleFavorite(Models.SERIES, seriesId);
            toast(now ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
            paintFav(fav);
        });

        setupScrollAndRecommendations();
        load();
        loadRecommendations();
    }

    private void setupScrollAndRecommendations() {
        mainScroll = findViewById(R.id.det_main_scroll);
        btnScrollTop = findViewById(R.id.det_btn_scroll_top);
        applyFocusScale(btnScrollTop, 1.15f);

        btnScrollTop.setOnClickListener(v -> {
            if (mainScroll != null) mainScroll.smoothScrollTo(0, 0);
            View play = findViewById(R.id.det_btn_play);
            if (play != null) play.requestFocus();
        });

        if (mainScroll != null) {
            mainScroll.setOnScrollChangeListener((NestedScrollView.OnScrollChangeListener) (v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
                if (scrollY > 320) {
                    if (btnScrollTop.getVisibility() != View.VISIBLE) btnScrollTop.setVisibility(View.VISIBLE);
                } else {
                    if (btnScrollTop.getVisibility() != View.GONE) btnScrollTop.setVisibility(View.GONE);
                }
            });
        }

        TextView popularTitle = findViewById(R.id.det_popular_title);
        popularTitle.setText("مسلسلات رائجة للمشاهدة الآن");

        TextView popularSubtitle = findViewById(R.id.det_popular_subtitle);
        popularSubtitle.setText("المسلسلات الأكثر متابعة وتقييماً");

        View viewAll = findViewById(R.id.det_popular_view_all);
        applyFocusScale(viewAll, 1.06f);
        viewAll.setOnClickListener(v -> finish());

        RecyclerView popList = findViewById(R.id.det_popular_list);
        popList.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        popList.setItemAnimator(null);
        popularAdapter = new PopularAdapter();
        popList.setAdapter(popularAdapter);
    }

    private void paintFav(ImageButton fav) {
        fav.setColorFilter(store.isFavorite(Models.SERIES, seriesId) ? 0xFFE50914 : 0xFFCBD5E1);
    }

    private void load() {
        Xtream.IO.execute(() -> {
            JSONObject root = null;
            try { root = api.seriesInfo(seriesId); } catch (Exception ignored) { }
            final JSONObject r = root;
            ui.post(() -> {
                if (isFinishing()) return;
                findViewById(R.id.det_progress).setVisibility(View.GONE);
                if (r == null) { toast("تعذر تحميل حلقات المسلسل"); return; }
                bind(r);
            });
        });
    }

    private void loadRecommendations() {
        Xtream.IO.execute(() -> {
            List<Models.Item> list = null;
            try { list = api.streams(Models.SERIES, false); } catch (Exception ignored) { }
            final List<Models.Item> fetched = list;
            ui.post(() -> {
                if (isFinishing() || fetched == null) return;
                popularItems.clear();
                for (Models.Item it : fetched) {
                    if (it.id != null && !it.id.equals(seriesId)) {
                        popularItems.add(it);
                        if (popularItems.size() >= 20) break;
                    }
                }
                if (popularAdapter != null) popularAdapter.notifyDataSetChanged();
            });
        });
    }

    private void bind(JSONObject root) {
        JSONObject info = root.optJSONObject("info");
        if (info != null) {
            String poster = MovieDetailsActivity.firstNonEmpty(info.optString("cover"), cover);
            Ui.loadImage(findViewById(R.id.det_poster), poster, Ui.logoPlaceholder());
            String backdrop = MovieDetailsActivity.firstBackdrop(info);
            if (backdrop != null) Ui.loadImage(findViewById(R.id.det_backdrop), backdrop, android.R.color.transparent);

            StringBuilder meta = new StringBuilder();
            MovieDetailsActivity.appendPart(meta, info.optString("genre"));
            String year = MovieDetailsActivity.firstNonEmpty(info.optString("releaseDate"), info.optString("releasedate"));
            if (year.length() >= 4) MovieDetailsActivity.appendPart(meta, year.substring(0, 4));
            String plot = info.optString("plot", "");
            if (!plot.isEmpty() && !"null".equals(plot)) {
                meta.append(meta.length() > 0 ? "\n" : "").append(plot.length() > 220 ? plot.substring(0, 220) + "…" : plot);
            }
            TextView metaView = findViewById(R.id.det_meta);
            metaView.setMaxLines(4);
            metaView.setText(meta.toString());

            String rating = info.optString("rating", "");
            TextView ratingView = findViewById(R.id.det_rating);
            if (!rating.isEmpty() && !"0".equals(rating) && !"null".equals(rating)) ratingView.setText("★  التقييم: " + rating);
            else ratingView.setVisibility(View.GONE);
        }

        episodesBySeason = root.optJSONObject("episodes");
        seasonKeys.clear();
        if (episodesBySeason != null) {
            Iterator<String> it = episodesBySeason.keys();
            while (it.hasNext()) seasonKeys.add(it.next());
        }
        Collections.sort(seasonKeys, (a, b) -> {
            try { return Integer.compare(Integer.parseInt(a), Integer.parseInt(b)); }
            catch (Exception e) { return a.compareTo(b); }
        });
        buildSeasonTabs();
        if (!seasonKeys.isEmpty()) selectSeason(seasonKeys.get(0));
    }

    private void buildSeasonTabs() {
        LinearLayout tabs = findViewById(R.id.det_seasons);
        tabs.removeAllViews();
        if (seasonKeys.isEmpty()) return;
        findViewById(R.id.det_seasons_scroll).setVisibility(View.VISIBLE);
        float d = getResources().getDisplayMetrics().density;
        for (final String key : seasonKeys) {
            TextView tab = new TextView(this);
            tab.setText("الموسم " + key);
            tab.setTextSize(18);
            tab.setTextColor(0xFFFFFFFF);
            tab.setTypeface(ResourcesCompat.getFont(this, R.font.tajawal_extrabold));
            tab.setGravity(Gravity.CENTER);
            tab.setBackgroundResource(R.drawable.nat_category_item);
            tab.setFocusable(true);
            tab.setClickable(true);
            tab.setPadding(Math.round(22 * d), Math.round(10 * d), Math.round(22 * d), Math.round(10 * d));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd(Math.round(10 * d));
            tab.setTag(key);
            tab.setOnClickListener(v -> selectSeason(key));
            applyFocusScale(tab, 1.06f);
            tabs.addView(tab, lp);
        }
    }

    private void selectSeason(String key) {
        activeSeason = key;
        LinearLayout tabs = findViewById(R.id.det_seasons);
        for (int i = 0; i < tabs.getChildCount(); i++) {
            View t = tabs.getChildAt(i);
            t.setActivated(key.equals(t.getTag()));
        }
        episodes.clear();
        JSONArray arr = episodesBySeason != null ? episodesBySeason.optJSONArray(key) : null;
        if (arr != null) for (int i = 0; i < arr.length(); i++) {
            JSONObject e = arr.optJSONObject(i);
            if (e != null) episodes.add(e);
        }
        adapter.notifyDataSetChanged();
    }

    private void playEpisode(JSONObject ep) {
        store.recordContinueWatching(Models.SERIES, seriesId);
        String epId = ep.optString("id");
        String ext = ep.optString("container_extension", "mp4");
        String title = name + " - الموسم " + activeSeason + " - الحلقة " + ep.optString("episode_num", "");
        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("videoUrl", api.streamUrl(Models.SERIES, epId, ext));
        i.putExtra("title", title);
        i.putExtra("posterUrl", cover == null ? "" : cover);
        i.putExtra("isLive", false);
        i.putExtra("isTv", isTvDevice(this));
        startActivity(i);
    }

    private class EpisodeAdapter extends RecyclerView.Adapter<EpisodeAdapter.VH> {
        class VH extends RecyclerView.ViewHolder {
            final ImageView thumb;
            final TextView title, sub;
            VH(View v) {
                super(v);
                thumb = v.findViewById(R.id.ep_thumb);
                title = v.findViewById(R.id.ep_title);
                sub = v.findViewById(R.id.ep_sub);
                applyFocusScale(v, 1.02f);
            }
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_episode, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            final JSONObject ep = episodes.get(position);
            JSONObject info = ep.optJSONObject("info");
            String num = ep.optString("episode_num", String.valueOf(position + 1));
            String t = ep.optString("title", "");
            h.title.setText("الحلقة " + num + (t.isEmpty() || "null".equals(t) ? "" : "  •  " + t));
            String sub = "";
            if (info != null) {
                String dur = info.optString("duration", "");
                String plot = info.optString("plot", "");
                sub = (dur.isEmpty() || "null".equals(dur) ? "" : dur) +
                        (plot.isEmpty() || "null".equals(plot) ? "" : (dur.isEmpty() ? "" : "  |  ") + plot);
            }
            h.sub.setText(sub);
            h.sub.setVisibility(sub.isEmpty() ? View.GONE : View.VISIBLE);
            String img = info != null ? info.optString("movie_image", "") : "";
            Ui.loadImage(h.thumb, img.isEmpty() ? cover : img, Ui.logoPlaceholder());
            h.itemView.setOnClickListener(v -> playEpisode(ep));
        }

        @Override
        public int getItemCount() {
            return episodes.size();
        }
    }

    // ------------------------------------------------------------------ محول قائمة التوصيات
    private class PopularAdapter extends RecyclerView.Adapter<PopularHolder> {
        @NonNull
        @Override
        public PopularHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_popular_poster, parent, false);
            applyFocusScale(v, 1.08f);
            return new PopularHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull PopularHolder holder, int position) {
            Models.Item it = popularItems.get(position);
            holder.title.setText(it.safeName());
            Ui.loadImage(holder.img, it.icon, Ui.logoPlaceholder());
            holder.itemView.setOnClickListener(v -> {
                Intent i = new Intent(SeriesDetailsActivity.this, SeriesDetailsActivity.class);
                i.putExtra("id", it.id);
                i.putExtra("name", it.name);
                i.putExtra("cover", it.icon);
                startActivity(i);
                finish();
            });
        }

        @Override
        public int getItemCount() {
            return popularItems.size();
        }
    }

    private static class PopularHolder extends RecyclerView.ViewHolder {
        final ImageView img;
        final TextView title;

        PopularHolder(@NonNull View itemView) {
            super(itemView);
            img = itemView.findViewById(R.id.pop_poster_img);
            title = itemView.findViewById(R.id.pop_poster_title);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
    }
}
