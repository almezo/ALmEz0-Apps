package com.almezo.servers.nat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.widget.NestedScrollView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * تفاصيل المسلسل (#series-details-screen):
 * مطابقة كلياً لتصميم نسخة الكمبيوتر المرجعية:
 * - بطاقة سينمائية زجاجية عائمة (Hero Card) بزوايا دائرية، مع خلفية مائية للعمل.
 * - بوستر رأسي متناسق على اليمين بنسبة 2:3.
 * - بيانات وصفية كاملة: المفضلة، التصنيف العربي، التقييم الذهبي، الإعلان الترويجي، القصة المترجمة، المخرج والممثلين.
 * - عرض الحلقات كبطاقات مصغرة 16:9 أفقية مع عناوين صافية (الحلقة X) ومدة العرض مع أيقونة الساعة.
 * - أزرار مواسم بشكل كبسولة حمراء مع أيقونة الطبقات وبادج عدد الحلقات.
 * - شريط مسلسلات رائجة للمشاهدة الآن مع أيقونة اللهب وبادجات التقييم الذهبية وحدود التركيز الحمراء.
 */
public class SeriesDetailsActivity extends BaseActivity {

    private Store store;
    private Xtream api;
    private NavBar nav;
    private String seriesId, name, cover;
    private String trailerKey;
    private JSONObject episodesBySeason;
    private final List<String> seasonKeys = new ArrayList<>();
    private final List<JSONObject> episodes = new ArrayList<>();
    private String activeSeason;
    private EpisodeAdapter adapter;

    private NestedScrollView mainScroll;
    private View btnScrollTop;
    private final List<Models.Item> popularItems = new ArrayList<>();
    private PopularAdapter popularAdapter;

    private static final Map<String, String> GENRE_MAP = new HashMap<>();
    static {
        GENRE_MAP.put("action", "أكشن");
        GENRE_MAP.put("adventure", "مغامرة");
        GENRE_MAP.put("animation", "رسوم متحركة");
        GENRE_MAP.put("anime", "أنمي");
        GENRE_MAP.put("comedy", "كوميدي");
        GENRE_MAP.put("crime", "جريمة");
        GENRE_MAP.put("documentary", "وثائقي");
        GENRE_MAP.put("drama", "دراما");
        GENRE_MAP.put("family", "عائلي");
        GENRE_MAP.put("fantasy", "فانتازيا");
        GENRE_MAP.put("history", "تاريخي");
        GENRE_MAP.put("horror", "رعب");
        GENRE_MAP.put("music", "موسيقى");
        GENRE_MAP.put("musical", "موسيقي");
        GENRE_MAP.put("mystery", "غموض");
        GENRE_MAP.put("romance", "رومانسي");
        GENRE_MAP.put("romantic", "رومانسي");
        GENRE_MAP.put("sci-fi", "خيال علمي");
        GENRE_MAP.put("science fiction", "خيال علمي");
        GENRE_MAP.put("thriller", "إثارة وتشويق");
        GENRE_MAP.put("war", "حرب");
        GENRE_MAP.put("western", "غرب أمريكي");
        GENRE_MAP.put("biography", "سيرة ذاتية");
        GENRE_MAP.put("sport", "رياضة");
        GENRE_MAP.put("sports", "رياضة");
        GENRE_MAP.put("news", "أخبار");
        GENRE_MAP.put("talk-show", "برنامج حواري");
        GENRE_MAP.put("reality-tv", "واقعي");
        GENRE_MAP.put("short", "قصير");
    }

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

        setContentView(R.layout.nat_activity_series_details);
        nav = new NavBar(this).backOnly(this);

        ((TextView) findViewById(R.id.det_title)).setText(name);
        Ui.loadImage(findViewById(R.id.det_poster), cover, Ui.logoPlaceholder());

        // زر المفضلة الدائري
        ImageButton fav = findViewById(R.id.det_btn_fav);
        applyFocusScale(fav, 1.12f);
        paintFav(fav);
        fav.setOnClickListener(v -> {
            boolean now = store.toggleFavorite(Models.SERIES, seriesId);
            toast(now ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
            paintFav(fav);
        });

        // زر مشاهدة الإعلان الترويجي
        View trailerBtn = findViewById(R.id.det_btn_trailer);
        applyFocusScale(trailerBtn, 1.06f);
        trailerBtn.setOnClickListener(v -> openTrailer());

        // قائمة الحلقات الأفقية (Horizontal RecyclerView)
        RecyclerView list = findViewById(R.id.det_episodes);
        list.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        list.setItemAnimator(null);
        adapter = new EpisodeAdapter();
        list.setAdapter(adapter);

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
            View fav = findViewById(R.id.det_btn_fav);
            if (fav != null) fav.requestFocus();
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

            // التصنيف العربي
            String rawGenre = info.optString("genre", "Series");
            TextView genreView = findViewById(R.id.det_genre);
            if (genreView != null) {
                genreView.setText(translateGenre(rawGenre));
            }

            // التقييم الذهبي
            String rating = info.optString("rating", "");
            TextView ratingView = findViewById(R.id.det_rating);
            if (ratingView != null) {
                if (!rating.isEmpty() && !"0".equals(rating) && !"null".equals(rating)) {
                    ratingView.setText("★  التقييم: " + rating);
                    ratingView.setVisibility(View.VISIBLE);
                } else {
                    ratingView.setVisibility(View.GONE);
                }
            }

            // زر الإعلان الترويجي
            trailerKey = MovieDetailsActivity.firstNonEmpty(info.optString("youtube_trailer"), info.optString("trailer"));
            View trailerBtn = findViewById(R.id.det_btn_trailer);
            if (trailerBtn != null) {
                if (!trailerKey.isEmpty()) {
                    trailerBtn.setVisibility(View.VISIBLE);
                } else {
                    trailerBtn.setVisibility(View.GONE);
                }
            }

            // ترجمة القصة إلى العربية
            String rawPlot = MovieDetailsActivity.firstNonEmpty(info.optString("plot"), info.optString("description"));
            translatePlotToArabic(rawPlot);

            // المخرج والممثلين
            String director = info.optString("director", "");
            TextView dirView = findViewById(R.id.det_director);
            View dirBox = findViewById(R.id.det_director_box);
            if (dirView != null && dirBox != null) {
                if (!director.isEmpty() && !"null".equals(director)) {
                    dirView.setText(director);
                    dirBox.setVisibility(View.VISIBLE);
                } else {
                    dirView.setText("غير معروف");
                }
            }

            String cast = MovieDetailsActivity.firstNonEmpty(info.optString("cast"), info.optString("actors"));
            TextView castView = findViewById(R.id.det_actors);
            View castBox = findViewById(R.id.det_actors_box);
            if (castView != null && castBox != null) {
                if (!cast.isEmpty() && !"null".equals(cast)) {
                    castView.setText(cast);
                    castBox.setVisibility(View.VISIBLE);
                } else {
                    castView.setText("غير معروف");
                }
            }
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

        LayoutInflater inflater = LayoutInflater.from(this);
        for (final String key : seasonKeys) {
            View tabView = inflater.inflate(R.layout.nat_item_season_tab, tabs, false);
            TextView title = tabView.findViewById(R.id.season_tab_title);
            TextView count = tabView.findViewById(R.id.season_tab_count);

            title.setText("موسم " + key);
            JSONArray arr = (episodesBySeason != null) ? episodesBySeason.optJSONArray(key) : null;
            int epCount = (arr != null) ? arr.length() : 0;
            count.setText(String.valueOf(epCount));

            tabView.setTag(key);
            tabView.setOnClickListener(v -> selectSeason(key));
            applyFocusScale(tabView, 1.06f);
            tabs.addView(tabView);
        }
    }

    private void selectSeason(String key) {
        activeSeason = key;
        LinearLayout tabs = findViewById(R.id.det_seasons);
        for (int i = 0; i < tabs.getChildCount(); i++) {
            View t = tabs.getChildAt(i);
            boolean isActive = key.equals(t.getTag());
            t.setActivated(isActive);

            TextView title = t.findViewById(R.id.season_tab_title);
            TextView count = t.findViewById(R.id.season_tab_count);
            ImageView icon = t.findViewById(R.id.season_tab_icon);
            if (title != null) title.setTextColor(isActive ? 0xFFFFFFFF : 0xFFCBD5E1);
            if (count != null) count.setTextColor(isActive ? 0xFFFFFFFF : 0xFFCBD5E1);
            if (icon != null) icon.setColorFilter(isActive ? 0xFFFFFFFF : 0xFFCBD5E1);
        }

        episodes.clear();
        JSONArray arr = episodesBySeason != null ? episodesBySeason.optJSONArray(key) : null;
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.optJSONObject(i);
                if (e != null) episodes.add(e);
            }
        }
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private void playEpisode(JSONObject ep) {
        store.recordContinueWatching(Models.SERIES, seriesId);
        String epId = ep.optString("id");
        if (epId.isEmpty()) epId = ep.optString("stream_id");
        if (epId.isEmpty()) epId = ep.optString("episode_id");
        String ext = ep.optString("container_extension", "mp4");
        String epNum = ep.optString("episode_num", "");
        String cleanTitle = cleanEpisodeTitle(ep.optString("title", ""), epNum, 1);
        String title = name + " - " + cleanTitle;

        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("videoUrl", api.streamUrl(Models.SERIES, epId, ext));
        i.putExtra("title", title);
        i.putExtra("posterUrl", cover == null ? "" : cover);
        i.putExtra("isLive", false);
        i.putExtra("isTv", isTvDevice(this));
        startActivity(i);
    }

    private void openTrailer() {
        if (trailerKey == null || trailerKey.trim().isEmpty()) return;
        String key = trailerKey.trim();
        String url = key.startsWith("http") ? key : "https://www.youtube.com/watch?v=" + key;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            toast("لا يوجد تطبيق لتشغيل الإعلان على هذا الجهاز");
        }
    }

    private void translatePlotToArabic(String rawPlot) {
        if (rawPlot == null || rawPlot.trim().isEmpty() || "null".equals(rawPlot)) {
            TextView plotView = findViewById(R.id.det_plot);
            if (plotView != null) plotView.setText("لا يوجد وصف متاح لهذا المسلسل.");
            return;
        }

        // فحص ما إذا كان النص يحتوي على أحرف عربية بالفعل
        boolean hasArabic = false;
        for (int i = 0; i < rawPlot.length(); i++) {
            char c = rawPlot.charAt(i);
            if (c >= '\u0600' && c <= '\u06FF') {
                hasArabic = true;
                break;
            }
        }
        if (hasArabic && rawPlot.length() > 20) {
            TextView plotView = findViewById(R.id.det_plot);
            if (plotView != null) plotView.setText(rawPlot);
            return;
        }

        TextView plotView = findViewById(R.id.det_plot);
        if (plotView != null) plotView.setText("جاري ترجمة القصة...");

        Xtream.IO.execute(() -> {
            String translated = null;
            try {
                String urlStr = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q="
                        + URLEncoder.encode(rawPlot, "UTF-8");
                HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
                conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();
                    JSONArray outer = new JSONArray(sb.toString());
                    if (outer.length() > 0) {
                        JSONArray arr = outer.getJSONArray(0);
                        StringBuilder transSb = new StringBuilder();
                        for (int j = 0; j < arr.length(); j++) {
                            JSONArray item = arr.optJSONArray(j);
                            if (item != null && item.length() > 0) {
                                transSb.append(item.optString(0, ""));
                            }
                        }
                        if (transSb.length() > 0) translated = transSb.toString();
                    }
                }
            } catch (Exception ignored) {}

            final String result = (translated != null && !translated.isEmpty()) ? translated : rawPlot;
            ui.post(() -> {
                if (isFinishing()) return;
                TextView pv = findViewById(R.id.det_plot);
                if (pv != null) pv.setText(result);
            });
        });
    }

    public static String translateGenre(String raw) {
        if (raw == null || raw.trim().isEmpty() || "null".equals(raw)) return "مسلسل";
        String[] parts = raw.split("[,|/]");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            String clean = p.trim().toLowerCase();
            String ar = GENRE_MAP.get(clean);
            if (sb.length() > 0) sb.append("، ");
            sb.append(ar != null ? ar : p.trim());
        }
        return sb.length() > 0 ? sb.toString() : "مسلسل";
    }

    /**
     * معالج تنظيف أسماء الحلقات من الرموز البرمجية والملفات الخام
     * واستخراج العنوان الصافي فقط: "الحلقة 1"، "الحلقة 2"، إلخ.
     */
    public static String cleanEpisodeTitle(String rawTitle, String epNum, int fallbackIndex) {
        int num = -1;
        if (epNum != null && !epNum.trim().isEmpty() && !"null".equals(epNum)) {
            try {
                String digits = epNum.replaceAll("[^0-9]", "");
                if (!digits.isEmpty()) {
                    num = Integer.parseInt(digits);
                }
            } catch (Exception ignored) {}
        }

        if (rawTitle != null && !rawTitle.trim().isEmpty() && !"null".equals(rawTitle)) {
            String t = rawTitle.trim();
            // مطابقة نمط S01E02 أو E02
            Matcher m = Pattern.compile("(?i)(?:s\\d+[.\\s_-]*)?e(\\d+)").matcher(t);
            if (m.find()) {
                try {
                    num = Integer.parseInt(m.group(1));
                } catch (Exception ignored) {}
            } else {
                // مطابقة نمط 1x02
                Matcher m2 = Pattern.compile("(?i)\\d+x(\\d+)").matcher(t);
                if (m2.find()) {
                    try {
                        num = Integer.parseInt(m2.group(1));
                    } catch (Exception ignored) {}
                } else {
                    // مطابقة بالعربية "الحلقة X"
                    Matcher m3 = Pattern.compile("(?:الحلقة|حلقة)\\s*(\\d+)").matcher(t);
                    if (m3.find()) {
                        try {
                            num = Integer.parseInt(m3.group(1));
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        if (num <= 0) {
            num = (fallbackIndex > 0) ? fallbackIndex : 1;
        }

        return "الحلقة " + num;
    }

    /**
     * تنسيق مدة الحلقة بصيغة عربية نظيفة (مثلاً: 45 دقيقة / 1 س 15 د)
     */
    public static String formatDuration(String raw) {
        if (raw == null || raw.trim().isEmpty() || "null".equals(raw) || "0".equals(raw)) {
            return "حلقة كاملة";
        }
        String s = raw.trim();
        if (s.contains(":")) {
            String[] parts = s.split(":");
            try {
                if (parts.length == 3) {
                    int h = Integer.parseInt(parts[0]);
                    int m = Integer.parseInt(parts[1]);
                    if (h > 0) return h + " س " + m + " د";
                    return m + " دقيقة";
                } else if (parts.length == 2) {
                    int m = Integer.parseInt(parts[0]);
                    return m + " دقيقة";
                }
            } catch (Exception ignored) {}
        }
        if (s.matches("^\\d+$")) {
            try {
                int sec = Integer.parseInt(s);
                int m = sec / 60;
                if (m > 60) {
                    int h = m / 60;
                    int remM = m % 60;
                    return h + " س " + remM + " د";
                }
                if (m > 0) return m + " دقيقة";
            } catch (Exception ignored) {}
        }
        s = s.replaceAll("(?i)\\s*min(?:ute)?s?", " دقيقة");
        s = s.replaceAll("(?i)\\s*m$", " دقيقة");
        return s;
    }

    // ------------------------------------------------------------------ محول بطاقات الحلقات المصغرة 16:9
    private class EpisodeAdapter extends RecyclerView.Adapter<EpisodeAdapter.VH> {
        class VH extends RecyclerView.ViewHolder {
            final ImageView thumb;
            final TextView title, duration, badge;

            VH(View v) {
                super(v);
                thumb = v.findViewById(R.id.ep_thumb);
                title = v.findViewById(R.id.ep_title);
                duration = v.findViewById(R.id.ep_duration);
                badge = v.findViewById(R.id.ep_badge);
                applyFocusScale(v, 1.06f);
            }
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_episode_card, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            final JSONObject ep = episodes.get(position);
            JSONObject info = ep.optJSONObject("info");

            String epNum = ep.optString("episode_num", String.valueOf(position + 1));
            String rawTitle = ep.optString("title", "");
            String cleanTitle = cleanEpisodeTitle(rawTitle, epNum, position + 1);
            h.title.setText(cleanTitle);

            if (h.badge != null) {
                h.badge.setText(epNum);
            }

            String dur = (info != null) ? info.optString("duration", "") : "";
            String formattedDur = formatDuration(dur);
            if (h.duration != null) {
                h.duration.setText(formattedDur);
            }

            String img = (info != null) ? info.optString("movie_image", "") : "";
            Ui.loadImage(h.thumb, (img != null && !img.isEmpty()) ? img : cover, Ui.logoPlaceholder());

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

            if (holder.rating != null) {
                if (it.rating != null && !it.rating.isEmpty() && !"0".equals(it.rating) && !"null".equals(it.rating)) {
                    holder.rating.setText("★ " + it.rating);
                    holder.rating.setVisibility(View.VISIBLE);
                } else {
                    holder.rating.setVisibility(View.GONE);
                }
            }

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
        final TextView rating;

        PopularHolder(@NonNull View itemView) {
            super(itemView);
            img = itemView.findViewById(R.id.pop_poster_img);
            title = itemView.findViewById(R.id.pop_poster_title);
            rating = itemView.findViewById(R.id.pop_poster_rating);
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
