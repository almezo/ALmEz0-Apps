package com.almezo.servers.nat;

import android.content.Intent;
import android.graphics.Rect;
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
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

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
 * - عرض الحلقات في شبكة من 4 أعمدة (من اليمين لليسار) ببطاقات 16:9 وعناوين صافية (الحلقة X) ومدة العرض.
 * - أزرار مواسم بشكل كبسولة حمراء مع أيقونة الطبقات وبادج عدد الحلقات.
 * - شريط مسلسلات رائجة من نفس تصنيف المسلسل ولغته مع بادجات التقييم الذهبية وحدود التركيز الحمراء.
 */
public class SeriesDetailsActivity extends BaseActivity implements Downloads.Listener {

    private static final int EPISODE_COLUMNS = 4;

    private Store store;
    private Xtream api;
    private Models.Account account;
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

    public static final Map<String, String> GENRE_MAP = new HashMap<>();
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
        account = acc;
        api = new Xtream(this, acc);
        seriesId = getIntent().getStringExtra("id");
        name = getIntent().getStringExtra("name");
        cover = getIntent().getStringExtra("cover");

        setContentView(R.layout.nat_activity_series_details);
        nav = new NavBar(this).backOnly(this);

        ((TextView) findViewById(R.id.det_title)).setText(name);
        Ui.loadImage(findViewById(R.id.det_poster), cover, Ui.logoPlaceholder());
        MovieDetailsActivity.showBackdrop(this, findViewById(R.id.det_backdrop), null, cover);

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

        // شبكة الحلقات: 4 أعمدة من اليمين لليسار داخل صفحة التمرير (بدون تمرير داخلي)
        RecyclerView list = findViewById(R.id.det_episodes);
        list.setLayoutManager(new GridLayoutManager(this, EPISODE_COLUMNS));
        list.setItemAnimator(null);
        final int gap = Math.round(18 * getResources().getDisplayMetrics().density);
        list.addItemDecoration(new RecyclerView.ItemDecoration() {
            @Override
            public void getItemOffsets(@NonNull Rect outRect, @NonNull View view, @NonNull RecyclerView parent, @NonNull RecyclerView.State state) {
                outRect.left = gap / 2;
                outRect.right = gap / 2;
                outRect.bottom = gap;
            }
        });
        adapter = new EpisodeAdapter();
        list.setAdapter(adapter);
        list.setItemAnimator(null); // تحديث نسبة التنزيل على البطاقة بلا وميض

        View seasonDl = findViewById(R.id.det_btn_download_season);
        applyFocusScale(seasonDl, 1.05f);
        seasonDl.setOnClickListener(v -> downloadSeason());

        setupScrollAndRecommendations();
        load();
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
        popularSubtitle.setText("المسلسلات الأكثر مشاهدة واختياراً");
        // يظهر الشريط بعد اختيار مسلسلات مطابقة فعلاً لتصنيف المسلسل ولغته
        findViewById(R.id.det_popular_section).setVisibility(View.GONE);

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
                JSONObject info = r != null ? r.optJSONObject("info") : null;
                loadRecommendations(info != null ? info.optString("genre", "") : "");
                if (r == null) {
                    MovieDetailsActivity.showBackdrop(this, findViewById(R.id.det_backdrop), null, cover);
                    toast("تعذر تحميل حلقات المسلسل");
                    return;
                }
                bind(r);
            });
        });
    }

    /** مسلسلات رائجة من نفس تصنيف المسلسل ولغته (انظر Related). */
    private void loadRecommendations(String genre) {
        Xtream.IO.execute(() -> {
            final List<Models.Item> found = Related.similar(this, api, account.id, Models.SERIES, seriesId, genre, null, 15);
            ui.post(() -> {
                if (isFinishing()) return;
                popularItems.clear();
                popularItems.addAll(found);
                if (popularAdapter != null) popularAdapter.notifyDataSetChanged();
                ((TextView) findViewById(R.id.det_popular_subtitle)).setText("المسلسلات الأكثر مشاهدة واختياراً");
                findViewById(R.id.det_popular_section).setVisibility(found.isEmpty() ? View.GONE : View.VISIBLE);
            });
        });
    }

    private void bind(JSONObject root) {
        JSONObject info = root.optJSONObject("info");
        if (info != null) {
            String poster = MovieDetailsActivity.firstNonEmpty(
                    MovieDetailsActivity.resolveImageUrl(info.optString("cover")),
                    MovieDetailsActivity.resolveImageUrl(info.optString("cover_big")),
                    cover
            );
            Ui.loadImage(findViewById(R.id.det_poster), poster, Ui.logoPlaceholder());
            MovieDetailsActivity.showBackdrop(this, findViewById(R.id.det_backdrop), MovieDetailsActivity.firstBackdrop(info), poster);

            // التصنيف العربي
            String rawGenre = info.optString("genre", "Series");
            TextView genreView = findViewById(R.id.det_genre);
            if (genreView != null) {
                genreView.setText(translateGenre(rawGenre));
            }

            // التقييم الذهبي
            String rating = MovieDetailsActivity.extractRating(info);
            TextView ratingView = findViewById(R.id.det_rating);
            if (ratingView != null) {
                String displayRating = (!rating.isEmpty() && !"0".equals(rating) && !"0.0".equals(rating)) ? rating : "N/A";
                ratingView.setText("★  التقييم: " + displayRating);
                ratingView.setVisibility(View.VISIBLE);
            }

            // زر الإعلان الترويجي
            trailerKey = MovieDetailsActivity.firstNonEmpty(info.optString("youtube_trailer"), info.optString("trailer"));
            View trailerBtn = findViewById(R.id.det_btn_trailer);
            if (trailerBtn != null) {
                trailerBtn.setVisibility(View.VISIBLE);
            }

            // ترجمة القصة إلى العربية
            String rawPlot = MovieDetailsActivity.firstNonEmpty(
                    info.optString("plot"),
                    info.optString("description"),
                    info.optString("overview"),
                    info.optString("story"),
                    info.optString("synopsis"),
                    root.optString("plot"),
                    root.optString("description")
            );
            translatePlotToArabic(rawPlot);

            // المخرج والممثلين
            String director = MovieDetailsActivity.firstNonEmpty(
                    info.optString("director"),
                    info.optString("directors"),
                    info.optString("directed_by")
            );
            TextView dirView = findViewById(R.id.det_director);
            View dirBox = findViewById(R.id.det_director_box);
            if (dirView != null && dirBox != null) {
                if (!director.isEmpty() && !"null".equalsIgnoreCase(director)) {
                    dirView.setText(director);
                    dirBox.setVisibility(View.VISIBLE);
                } else {
                    dirView.setText("غير معروف");
                }
            }

            String cast = MovieDetailsActivity.firstNonEmpty(
                    info.optString("cast"),
                    info.optString("actors"),
                    info.optString("starring"),
                    info.optString("cast_list")
            );
            TextView castView = findViewById(R.id.det_actors);
            View castBox = findViewById(R.id.det_actors_box);
            if (castView != null && castBox != null) {
                if (!cast.isEmpty() && !"null".equalsIgnoreCase(cast)) {
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

    // ------------------------------------------------------------------ التنزيل

    private Downloads.Item episodeRequest(JSONObject ep, int position) {
        String eId = episodeId(ep);
        JSONObject info = ep.optJSONObject("info");
        String epNum = ep.optString("episode_num", String.valueOf(position + 1));
        String img = info != null ? info.optString("movie_image", "") : "";
        Downloads.Item req = new Downloads.Item();
        req.id = "ep:" + eId;
        req.kind = "episode";
        req.title = name + " - " + cleanEpisodeTitle(ep.optString("title", ""), epNum, position + 1);
        req.subtitle = "الموسم " + activeSeason + " · الحلقة " + epNum;
        req.poster = (img != null && !img.isEmpty() && !"null".equals(img)) ? img : cover;
        req.ext = ep.optString("container_extension", "mp4");
        if (req.ext.isEmpty()) req.ext = "mp4";
        req.url = api.streamUrl(Models.SERIES, eId, req.ext);
        req.contentKey = "ep:" + eId;
        req.seriesId = seriesId;
        req.accountId = account.id;
        try { req.season = Integer.parseInt(activeSeason); } catch (Exception ignored) { }
        try { req.episode = Integer.parseInt(epNum); } catch (Exception ignored) { }
        return req;
    }

    /** زر التنزيل على الحلقة (أو الضغط الطويل بالريموت). */
    private void onEpisodeDownload(int position) {
        if (position < 0 || position >= episodes.size()) return;
        JSONObject ep = episodes.get(position);
        Downloads dl = Downloads.get(this);
        Downloads.Item existing = dl.find("ep:" + episodeId(ep));
        if (existing != null) {
            DownloadDialog.show(this, existing.id);
            return;
        }
        Downloads.Item req = dl.enqueue(episodeRequest(ep, position));
        DownloadDialog.show(this, req.id);
    }

    /** تنزيل كل حلقات الموسم المختار: تدخل الطابور وتتنزل واحدة بعد الأخرى. */
    private void downloadSeason() {
        if (episodes.isEmpty()) return;
        Downloads dl = Downloads.get(this);
        int added = 0;
        String first = null;
        for (int n = 0; n < episodes.size(); n++) {
            JSONObject ep = episodes.get(n);
            if (dl.find("ep:" + episodeId(ep)) != null) continue;
            Downloads.Item it = dl.enqueue(episodeRequest(ep, n));
            if (first == null) first = it.id;
            added++;
        }
        if (added == 0) {
            toast("كل حلقات الموسم " + activeSeason + " منزّلة أو في قائمة التنزيل");
            return;
        }
        toast("أُضيفت " + added + " حلقة إلى التنزيل — تتنزل واحدة بعد الأخرى");
        DownloadDialog.show(this, first);
    }

    @Override
    public void onDownloadsChanged() {
        if (adapter != null && !episodes.isEmpty()) adapter.notifyItemRangeChanged(0, episodes.size(), "dl");
        paintSeasonButton();
    }

    private void paintSeasonButton() {
        View btn = findViewById(R.id.det_btn_download_season);
        TextView text = findViewById(R.id.det_btn_download_season_text);
        if (btn == null) return;
        btn.setVisibility(episodes.isEmpty() ? View.GONE : View.VISIBLE);
        Downloads dl = Downloads.get(this);
        int done = 0;
        for (JSONObject ep : episodes) {
            Downloads.Item i = dl.find("ep:" + episodeId(ep));
            if (i != null && Downloads.DONE.equals(i.state)) done++;
        }
        String label;
        if (done == 0) label = "تنزيل الموسم " + activeSeason;
        else if (done == episodes.size()) label = "الموسم منزّل بالكامل ✓";
        else label = "تنزيل الموسم (" + done + "/" + episodes.size() + ")";
        text.setText(label);
    }

    @Override
    protected void onStart() {
        super.onStart();
        Downloads.get(this).addListener(this);
        paintSeasonButton();
    }

    @Override
    protected void onStop() {
        Downloads.get(this).removeListener(this);
        super.onStop();
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
        paintSeasonButton();
    }

    static String episodeId(JSONObject ep) {
        String epId = ep.optString("id");
        if (epId.isEmpty()) epId = ep.optString("stream_id");
        if (epId.isEmpty()) epId = ep.optString("episode_id");
        return epId;
    }

    /** تشغيل حلقة مع باقي حلقات الموسم كقائمة تشغيل (للحلقة التالية داخل المشغل). */
    private void playEpisode(int position) {
        if (position < 0 || position >= episodes.size()) return;
        store.recordContinueWatching(Models.SERIES, seriesId);
        List<PlayQueue.Entry> list = new ArrayList<>(episodes.size());
        for (int n = 0; n < episodes.size(); n++) {
            JSONObject e = episodes.get(n);
            String eId = episodeId(e);
            String t = name + " - " + cleanEpisodeTitle(e.optString("title", ""), e.optString("episode_num", ""), n + 1);
            // الحلقة المنزّلة تُشغَّل من الجهاز: بلا إنترنت وبلا اتصال بالسيرفر
            String local = Downloads.get(this).localFile("ep:" + eId);
            String url = local != null ? Uri.fromFile(new java.io.File(local)).toString()
                    : api.streamUrl(Models.SERIES, eId, e.optString("container_extension", "mp4"));
            list.add(new PlayQueue.Entry(url, t, cover, "ep:" + eId, eId, Models.SERIES));
        }
        PlayQueue.set(list, position);
        PlayQueue.Entry cur = PlayQueue.current();
        String title = cur.title;

        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("queue", true);
        i.putExtra("videoUrl", cur.url);
        i.putExtra("title", title);
        i.putExtra("posterUrl", cover == null ? "" : cover);
        i.putExtra("isLive", false);
        i.putExtra("isTv", isTvDevice(this));
        startActivity(i);
    }

    private void openTrailer() {
        String url;
        if (trailerKey != null && !trailerKey.trim().isEmpty() && !"null".equalsIgnoreCase(trailerKey)) {
            String key = trailerKey.trim();
            url = key.startsWith("http") ? key : "https://www.youtube.com/watch?v=" + key;
        } else {
            url = "https://www.youtube.com/results?search_query=" + Uri.encode((name != null ? name : "") + " trailer اعلان مسلسل");
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            toast("لا يوجد تطبيق لتشغيل الإعلان على هذا الجهاز");
        }
    }

    private void translatePlotToArabic(String rawPlot) {
        MovieDetailsActivity.showArabicPlot(this, findViewById(R.id.det_plot), rawPlot, "لا يوجد وصف متاح لهذا المسلسل.");
    }

    /** مدة الحلقة كما في نسخة الكمبيوتر (00:39:16)، وإلا بصيغة عربية مختصرة. */
    static String episodeDuration(String raw) {
        if (raw != null && raw.trim().matches("\\d{1,2}:\\d{2}:\\d{2}")) return raw.trim();
        return formatDuration(raw);
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

    // ------------------------------------------------------------------ محول شبكة الحلقات 16:9
    private class EpisodeAdapter extends RecyclerView.Adapter<EpisodeAdapter.VH> {
        class VH extends RecyclerView.ViewHolder {
            final ImageView thumb;
            final TextView title, duration;
            final android.widget.ProgressBar progress;
            final View dlBadge;
            final ImageView dlIcon;
            final TextView dlPct;

            VH(View v) {
                super(v);
                dlBadge = v.findViewById(R.id.ep_dl);
                dlIcon = v.findViewById(R.id.ep_dl_icon);
                dlPct = v.findViewById(R.id.ep_dl_pct);
                progress = v.findViewById(R.id.ep_progress);
                thumb = v.findViewById(R.id.ep_thumb);
                title = v.findViewById(R.id.ep_title);
                duration = v.findViewById(R.id.ep_duration);
                ((RatioFrameLayout) v.findViewById(R.id.ep_thumb_box)).setRatio(9f / 16f);
                final View dim = v.findViewById(R.id.ep_dim);
                final View play = v.findViewById(R.id.ep_play);
                // زر التشغيل والتعتيم يظهران على البطاقة المُركَّز عليها فقط (قبل تأثير التكبير ليتسلسلا معاً)
                v.setOnFocusChangeListener((view, hasFocus) -> {
                    dim.setVisibility(hasFocus ? View.VISIBLE : View.GONE);
                    play.setVisibility(hasFocus ? View.VISIBLE : View.GONE);
                });
                applyFocusScale(v, 1.04f);
                // الريموت: زر التنزيل داخل البطاقة لا يصله البحث التلقائي عن التركيز، فنوجّهه يدوياً.
                // سهم لأعلى من الحلقة -> زر تنزيلها (أعلى الصورة)، ومنه سهم لأسفل -> الحلقة نفسها.
                v.setOnKeyListener((view, keyCode, event) -> {
                    if (keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP && event.getAction() == android.view.KeyEvent.ACTION_DOWN
                            && dlBadge.getVisibility() == View.VISIBLE) {
                        dlBadge.requestFocus();
                        return true;
                    }
                    return false;
                });
                dlBadge.setOnKeyListener((view, keyCode, event) -> {
                    if (keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN && event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
                        v.requestFocus();
                        return true;
                    }
                    return false;
                });
                applyFocusScale(dlBadge, 1.15f);
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
            h.title.setText(cleanEpisodeTitle(ep.optString("title", ""), epNum, position + 1));
            h.duration.setText(episodeDuration(info != null ? info.optString("duration", "") : ""));

            String img = (info != null) ? info.optString("movie_image", "") : "";
            Ui.loadImage(h.thumb, (img != null && !img.isEmpty() && !"null".equals(img)) ? img : cover, Ui.logoPlaceholder());

            long[] watched = store.position("ep:" + episodeId(ep));
            if (watched != null && watched[1] > 0) {
                h.progress.setProgress((int) Math.min(1000, watched[0] * 1000 / watched[1]));
                h.progress.setVisibility(View.VISIBLE);
            } else {
                h.progress.setVisibility(View.GONE);
            }
            h.itemView.setOnClickListener(v -> playEpisode(h.getBindingAdapterPosition()));
            // بالريموت: الضغط الطويل على OK يفتح التنزيل. باللمس: زر الدائرة على الصورة
            h.itemView.setOnLongClickListener(v -> {
                onEpisodeDownload(h.getBindingAdapterPosition());
                return true;
            });
            h.dlBadge.setOnClickListener(v -> onEpisodeDownload(h.getBindingAdapterPosition()));
            bindDownloadBadge(h, ep);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position, @NonNull List<Object> payloads) {
            if (payloads.contains("dl")) bindDownloadBadge(h, episodes.get(position));
            else super.onBindViewHolder(h, position, payloads);
        }

        private void bindDownloadBadge(VH h, JSONObject ep) {
            Downloads.Item i = Downloads.get(SeriesDetailsActivity.this).find("ep:" + episodeId(ep));
            h.dlPct.setVisibility(View.GONE);
            h.dlIcon.setVisibility(View.VISIBLE);
            if (i == null) {
                h.dlIcon.setImageResource(R.drawable.fa_download);
                h.dlIcon.setColorFilter(0xFFFFFFFF);
            } else if (Downloads.DONE.equals(i.state)) {
                h.dlIcon.setImageResource(R.drawable.fa_circle_check);
                h.dlIcon.setColorFilter(0xFF22C55E);
            } else if (Downloads.RUNNING.equals(i.state)) {
                h.dlIcon.setVisibility(View.GONE);
                h.dlPct.setVisibility(View.VISIBLE);
                h.dlPct.setText(i.percent() + "%");
            } else if (Downloads.FAILED.equals(i.state)) {
                h.dlIcon.setImageResource(R.drawable.fa_triangle_exclamation);
                h.dlIcon.setColorFilter(0xFFF87171);
            } else if (Downloads.PAUSED.equals(i.state)) {
                h.dlIcon.setImageResource(R.drawable.fa_pause);
                h.dlIcon.setColorFilter(0xFFF59E0B);
            } else {
                h.dlIcon.setImageResource(R.drawable.fa_clock);
                h.dlIcon.setColorFilter(0xFFCBD5E1);
            }
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
            Fx.noRing(v);
            return new PopularHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull PopularHolder holder, int position) {
            Models.Item it = popularItems.get(position);
            holder.title.setText(it.safeName());
            Ui.loadImage(holder.img, it.icon, Ui.logoPlaceholder());

            if (holder.rating != null) {
                if (it.rating > 0) {
                    holder.rating.setText(Ui.ratingText(it.rating));
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
        // تحديث أشرطة تقدم المشاهدة بعد الرجوع من المشغل
        if (adapter != null && !episodes.isEmpty()) adapter.notifyDataSetChanged();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
    }
}
