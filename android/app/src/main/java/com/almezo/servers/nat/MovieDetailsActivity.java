package com.almezo.servers.nat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
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
import java.util.List;

/**
 * تفاصيل الفيلم (#movie-details-screen):
 * مطابقة كلياً لتصميم نسخة الكمبيوتر المرجعية:
 * - بطاقة سينمائية زجاجية عائمة (Hero Card) بزوايا دائرية، مع خلفية مائية للعمل.
 * - بوستر رأسي متناسق على اليمين بنسبة 2:3 مع زر شاهد الآن.
 * - بيانات وصفية كاملة: المفضلة، التصنيف المترجم، التقييم الذهبي، الإعلان الترويجي، القصة المترجمة، المخرج والممثلين.
 * - شريط أفلام رائجة للمشاهدة الآن مع أيقونة اللهب المتوهج وبادجات التقييم الذهبية وحدود التركيز الحمراء.
 */
public class MovieDetailsActivity extends BaseActivity {

    private Store store;
    private Xtream api;
    private NavBar nav;
    private String id, name, cover, ext;
    private String trailerKey;

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
        id = getIntent().getStringExtra("id");
        name = getIntent().getStringExtra("name");
        cover = getIntent().getStringExtra("cover");
        ext = getIntent().getStringExtra("ext");

        setContentView(R.layout.nat_activity_details);
        nav = new NavBar(this).backOnly(this);

        ((TextView) findViewById(R.id.det_title)).setText(name);
        Ui.loadImage(findViewById(R.id.det_poster), cover, Ui.logoPlaceholder());

        View play = findViewById(R.id.det_btn_play);
        applyFocusScale(play, 1.05f);
        play.setOnClickListener(v -> playMovie());
        play.requestFocus();

        ImageButton fav = findViewById(R.id.det_btn_fav);
        applyFocusScale(fav, 1.12f);
        paintFav(fav);
        fav.setOnClickListener(v -> {
            boolean now = store.toggleFavorite(Models.VOD, id);
            toast(now ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
            paintFav(fav);
        });

        View trailer = findViewById(R.id.det_btn_trailer);
        applyFocusScale(trailer, 1.06f);
        trailer.setOnClickListener(v -> openTrailer());

        setupScrollAndRecommendations();
        loadInfo();
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
        popularTitle.setText("أفلام رائجة للمشاهدة الآن");

        TextView popularSubtitle = findViewById(R.id.det_popular_subtitle);
        popularSubtitle.setText("الأفلام الأكثر متابعة وتقييماً");

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
        fav.setColorFilter(store.isFavorite(Models.VOD, id) ? 0xFFE50914 : 0xFFCBD5E1);
    }

    private void loadInfo() {
        Xtream.IO.execute(() -> {
            JSONObject root = null;
            try { root = api.vodInfo(id); } catch (Exception ignored) { }
            final JSONObject r = root;
            ui.post(() -> {
                if (isFinishing()) return;
                findViewById(R.id.det_progress).setVisibility(View.GONE);
                if (r != null) bind(r);
            });
        });
    }

    private void loadRecommendations() {
        Xtream.IO.execute(() -> {
            List<Models.Item> list = null;
            try { list = api.streams(Models.VOD, false); } catch (Exception ignored) { }
            final List<Models.Item> fetched = list;
            ui.post(() -> {
                if (isFinishing() || fetched == null) return;
                popularItems.clear();
                for (Models.Item it : fetched) {
                    if (it.id != null && !it.id.equals(id)) {
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
        JSONObject data = root.optJSONObject("movie_data");
        if (data != null) {
            String e = data.optString("container_extension", "");
            if (!e.isEmpty()) ext = e;
        }
        if (info == null) return;

        String poster = firstNonEmpty(info.optString("movie_image"), info.optString("cover_big"), cover);
        Ui.loadImage(findViewById(R.id.det_poster), poster, Ui.logoPlaceholder());
        String backdrop = firstBackdrop(info);
        ImageView bd = findViewById(R.id.det_backdrop);
        if (backdrop != null) Ui.loadImage(bd, backdrop, android.R.color.transparent);

        StringBuilder meta = new StringBuilder();
        appendPart(meta, SeriesDetailsActivity.translateGenre(info.optString("genre")));
        appendPart(meta, SeriesDetailsActivity.formatDuration(info.optString("duration")));
        appendPart(meta, info.optString("country"));
        String year = info.optString("releasedate", "");
        if (year.length() >= 4) appendPart(meta, year.substring(0, 4));
        ((TextView) findViewById(R.id.det_meta)).setText(meta.toString());

        String rating = info.optString("rating", "");
        TextView ratingView = findViewById(R.id.det_rating);
        if (!rating.isEmpty() && !"0".equals(rating) && !"null".equals(rating)) {
            ratingView.setText("★  التقييم: " + rating);
            ratingView.setVisibility(View.VISIBLE);
        } else {
            ratingView.setVisibility(View.GONE);
        }

        String rawPlot = firstNonEmpty(info.optString("plot"), info.optString("description"));
        translatePlotToArabic(rawPlot);

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

        String cast = firstNonEmpty(info.optString("cast"), info.optString("actors"));
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

        trailerKey = info.optString("youtube_trailer", "");
        if (trailerKey != null && !trailerKey.trim().isEmpty()) {
            findViewById(R.id.det_btn_trailer).setVisibility(View.VISIBLE);
        }
    }

    private void translatePlotToArabic(String rawPlot) {
        if (rawPlot == null || rawPlot.trim().isEmpty() || "null".equals(rawPlot)) {
            TextView plotView = findViewById(R.id.det_plot);
            if (plotView != null) plotView.setText("لا يوجد وصف متاح لهذا الفيلم.");
            return;
        }

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

    static String firstNonEmpty(String... values) {
        for (String v : values) if (v != null && !v.trim().isEmpty() && !"null".equals(v)) return v.trim();
        return "";
    }

    static String firstBackdrop(JSONObject info) {
        JSONArray arr = info.optJSONArray("backdrop_path");
        if (arr != null && arr.length() > 0) {
            String s = arr.optString(0, "");
            if (!s.isEmpty()) return s;
        }
        String s = info.optString("backdrop_path", "");
        return s.isEmpty() || s.startsWith("[") ? null : s;
    }

    static void appendPart(StringBuilder sb, String part) {
        if (part == null || part.trim().isEmpty() || "null".equals(part)) return;
        if (sb.length() > 0) sb.append("  |  ");
        sb.append(part.trim());
    }

    private void playMovie() {
        store.recordContinueWatching(Models.VOD, id);
        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("videoUrl", api.streamUrl(Models.VOD, id, ext));
        i.putExtra("title", name);
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
                if (it.rating > 0) {
                    String rStr = (it.rating == (int) it.rating)
                            ? String.valueOf((int) it.rating)
                            : String.format(java.util.Locale.US, "%.1f", it.rating);
                    holder.rating.setText("★ " + rStr);
                    holder.rating.setVisibility(View.VISIBLE);
                } else {
                    holder.rating.setVisibility(View.GONE);
                }
            }

            holder.itemView.setOnClickListener(v -> {
                Intent i = new Intent(MovieDetailsActivity.this, MovieDetailsActivity.class);
                i.putExtra("id", it.id);
                i.putExtra("name", it.name);
                i.putExtra("cover", it.icon);
                i.putExtra("ext", it.extension);
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
}
