package com.almezo.servers.nat;

import android.content.Intent;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Build;
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
public class MovieDetailsActivity extends BaseActivity implements Downloads.Listener {

    private Store store;
    private Xtream api;
    private Models.Account account;
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
        account = acc;
        api = new Xtream(this, acc);
        id = getIntent().getStringExtra("id");
        name = getIntent().getStringExtra("name");
        cover = getIntent().getStringExtra("cover");
        ext = getIntent().getStringExtra("ext");

        setContentView(R.layout.nat_activity_details);
        nav = new NavBar(this).backOnly(this);

        ((TextView) findViewById(R.id.det_title)).setText(name);
        Ui.loadImage(findViewById(R.id.det_poster), cover, Ui.logoPlaceholder());
        showBackdrop(this, findViewById(R.id.det_backdrop), null, cover);

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

        View download = findViewById(R.id.det_btn_download);
        applyFocusScale(download, 1.05f);
        download.setOnClickListener(v -> onDownloadClick());

        View trailer = findViewById(R.id.det_btn_trailer);
        applyFocusScale(trailer, 1.06f);
        trailer.setOnClickListener(v -> openTrailer());

        setupScrollAndRecommendations();
        loadInfo();
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
        popularSubtitle.setText("الأفلام الأكثر مشاهدة واختياراً");
        // يظهر الشريط بعد اختيار أفلام مطابقة فعلاً لتصنيف الفيلم وبلده
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
                JSONObject info = r != null ? r.optJSONObject("info") : null;
                if (r != null) bind(r);
                else showBackdrop(this, findViewById(R.id.det_backdrop), null, cover);
                loadRecommendations(info != null ? info.optString("genre", "") : "",
                        info != null ? info.optString("country", "") : "");
            });
        });
    }

    /** أفلام رائجة من نفس تصنيف الفيلم وبلده/لغته (انظر Related). */
    private void loadRecommendations(String genre, String country) {
        Xtream.IO.execute(() -> {
            final List<Models.Item> found = Related.similar(this, api, account.id, Models.VOD, id, genre, country, 15);
            ui.post(() -> {
                if (isFinishing()) return;
                popularItems.clear();
                popularItems.addAll(found);
                if (popularAdapter != null) popularAdapter.notifyDataSetChanged();
                ((TextView) findViewById(R.id.det_popular_subtitle)).setText("الأفلام الأكثر مشاهدة واختياراً");
                findViewById(R.id.det_popular_section).setVisibility(found.isEmpty() ? View.GONE : View.VISIBLE);
            });
        });
    }

    private void bind(JSONObject root) {
        JSONObject info = root.optJSONObject("info");
        JSONObject data = root.optJSONObject("movie_data");
        if (info == null) info = new JSONObject();
        if (data == null) data = new JSONObject();

        String e = firstNonEmpty(
                data.optString("container_extension"),
                data.optString("extension"),
                info.optString("container_extension"),
                info.optString("extension")
        );
        if (!e.isEmpty()) ext = e;

        String poster = firstNonEmpty(
                resolveImageUrl(info.optString("movie_image")),
                resolveImageUrl(info.optString("cover_big")),
                resolveImageUrl(data.optString("movie_image")),
                resolveImageUrl(data.optString("cover_big")),
                resolveImageUrl(data.optString("cover")),
                cover
        );
        Ui.loadImage(findViewById(R.id.det_poster), poster, Ui.logoPlaceholder());

        String backdrop = firstBackdrop(info);
        if (backdrop == null) backdrop = firstBackdrop(data);
        showBackdrop(this, findViewById(R.id.det_backdrop), backdrop, poster);

        String rawGenre = firstNonEmpty(
                info.optString("genre"),
                data.optString("genre"),
                info.optString("category_name"),
                data.optString("category_name")
        );
        String rawDuration = firstNonEmpty(
                info.optString("duration"),
                info.optString("duration_secs"),
                info.optString("runtime"),
                info.optString("movie_duration"),
                data.optString("duration"),
                data.optString("duration_secs"),
                data.optString("runtime")
        );
        String rawCountry = firstNonEmpty(info.optString("country"), data.optString("country"));
        String rawYear = firstNonEmpty(
                info.optString("releasedate"),
                info.optString("release_date"),
                info.optString("year"),
                data.optString("releasedate"),
                data.optString("release_date"),
                data.optString("year")
        );

        StringBuilder meta = new StringBuilder();
        appendPart(meta, translateMovieGenre(rawGenre));
        appendPart(meta, formatMovieDuration(rawDuration));
        appendPart(meta, rawCountry);
        if (rawYear.length() >= 4) {
            try {
                java.util.regex.Matcher ym = java.util.regex.Pattern.compile("(\\d{4})").matcher(rawYear);
                if (ym.find()) appendPart(meta, ym.group(1));
                else appendPart(meta, rawYear.substring(0, 4));
            } catch (Exception ignored) {
                appendPart(meta, rawYear.substring(0, 4));
            }
        }
        ((TextView) findViewById(R.id.det_meta)).setText(meta.toString());

        String rating = extractRating(info);
        if (rating.isEmpty()) rating = extractRating(data);
        TextView ratingView = findViewById(R.id.det_rating);
        if (ratingView != null) {
            String displayRating = (!rating.isEmpty() && !"0".equals(rating) && !"0.0".equals(rating)) ? rating : "N/A";
            ratingView.setText("★  التقييم: " + displayRating);
            ratingView.setVisibility(View.VISIBLE);
        }

        String rawPlot = firstNonEmpty(
                info.optString("plot"),
                info.optString("description"),
                info.optString("overview"),
                info.optString("story"),
                info.optString("synopsis"),
                data.optString("plot"),
                data.optString("description"),
                data.optString("overview"),
                data.optString("story"),
                root.optString("plot"),
                root.optString("description")
        );
        translatePlotToArabic(rawPlot);

        String director = firstNonEmpty(
                info.optString("director"),
                info.optString("directors"),
                info.optString("directed_by"),
                data.optString("director"),
                data.optString("directors"),
                data.optString("directed_by")
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

        String cast = firstNonEmpty(
                info.optString("cast"),
                info.optString("actors"),
                info.optString("starring"),
                info.optString("cast_list"),
                data.optString("cast"),
                data.optString("actors"),
                data.optString("starring")
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

        trailerKey = firstNonEmpty(
                info.optString("youtube_trailer"),
                info.optString("trailer"),
                data.optString("youtube_trailer"),
                data.optString("trailer")
        );
        View trailerBtn = findViewById(R.id.det_btn_trailer);
        if (trailerBtn != null) {
            trailerBtn.setVisibility(View.VISIBLE);
        }
    }

    public static String translateMovieGenre(String raw) {
        if (raw == null || raw.trim().isEmpty() || "null".equalsIgnoreCase(raw)) return "فيلم";
        String[] parts = raw.split("[,|/]");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            String clean = p.trim().toLowerCase();
            String ar = SeriesDetailsActivity.GENRE_MAP.get(clean);
            if (sb.length() > 0) sb.append("، ");
            sb.append(ar != null ? ar : p.trim());
        }
        return sb.length() > 0 ? sb.toString() : "فيلم";
    }

    public static String formatMovieDuration(String raw) {
        if (raw == null || raw.trim().isEmpty() || "null".equalsIgnoreCase(raw) || "0".equals(raw)) {
            return "";
        }
        String s = raw.trim();
        if (s.contains(":")) {
            String[] parts = s.split(":");
            try {
                if (parts.length == 3) {
                    int h = Integer.parseInt(parts[0].trim());
                    int m = Integer.parseInt(parts[1].trim());
                    if (h > 0 && m > 0) return h + " س " + m + " د";
                    if (h > 0) return h + " ساعة";
                    if (m > 0) return m + " دقيقة";
                } else if (parts.length == 2) {
                    int m = Integer.parseInt(parts[0].trim());
                    if (m >= 60) return (m / 60) + " س " + (m % 60) + " د";
                    if (m > 0) return m + " دقيقة";
                }
            } catch (Exception ignored) {}
        }
        if (s.matches("^\\d+$")) {
            try {
                int val = Integer.parseInt(s);
                if (val <= 0) return "";
                int minutes = val;
                if (val > 300) {
                    minutes = val / 60;
                }
                if (minutes >= 60) {
                    int h = minutes / 60;
                    int rem = minutes % 60;
                    return rem > 0 ? (h + " س " + rem + " د") : (h + " ساعة");
                }
                return minutes + " دقيقة";
            } catch (Exception ignored) {}
        }
        s = s.replaceAll("(?i)\\s*hours?", " س").replaceAll("(?i)\\s*h\\b", " س");
        s = s.replaceAll("(?i)\\s*min(?:ute)?s?", " د").replaceAll("(?i)\\s*m\\b", " د");
        return s;
    }

    private void translatePlotToArabic(String rawPlot) {
        showArabicPlot(this, findViewById(R.id.det_plot), rawPlot, "لا يوجد وصف متاح لهذا الفيلم.");
    }

    /**
     * يعرض القصة بالعربية: إن كانت بلغة أخرى تُترجم في الخلفية (انظر Translate)، وتبقى بلغتها
     * الأصلية فقط إن فشلت كل محاولات الترجمة.
     */
    static void showArabicPlot(BaseActivity a, TextView plotView, String rawPlot, String emptyText) {
        if (plotView == null) return;
        if (rawPlot == null || rawPlot.trim().isEmpty() || "null".equalsIgnoreCase(rawPlot)) {
            plotView.setText(emptyText);
            return;
        }
        final String plot = rawPlot.trim();
        if (!Translate.needsArabic(plot)) {
            plotView.setText(plot);
            return;
        }
        plotView.setText("جاري تعريب القصة...");
        Xtream.IO.execute(() -> {
            String translated = Translate.toArabic(plot);
            final String result = translated != null ? translated : plot;
            a.ui.post(() -> {
                if (!a.isFinishing()) plotView.setText(result);
            });
        });
    }

    /**
     * خلفية الصفحة: صورة الخلفية الرسمية للعمل، وإن لم تتوفر فالملصق نفسه مموّهاً (أندرويد 12+)
     * حتى تظهر صورة العمل دائماً خلف صندوق المعلومات الشفاف.
     */
    static void showBackdrop(BaseActivity a, ImageView bd, String backdrop, String poster) {
        if (bd == null) return;
        String target = resolveImageUrl(backdrop);
        if (target != null) {
            Ui.loadImage(bd, target, android.R.color.transparent);
            return;
        }
        String pTarget = resolveImageUrl(poster);
        if (pTarget == null || pTarget.trim().isEmpty()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            float r = 18f * a.getResources().getDisplayMetrics().density;
            bd.setRenderEffect(RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP));
        }
        Ui.loadImage(bd, pTarget, android.R.color.transparent);
    }

    public static String resolveImageUrl(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;

        if (s.startsWith("[") && s.endsWith("]")) {
            try {
                JSONArray arr = new JSONArray(s);
                if (arr.length() > 0) return resolveImageUrl(arr.optString(0, ""));
            } catch (Exception ignored) {}
            s = s.replaceAll("^\\[\"?", "").replaceAll("\"?\\]$", "").replace("\\/", "/").trim();
            if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
        }

        s = s.replace("\\/", "/");

        if (s.startsWith("//")) return "https:" + s;
        if (s.startsWith("http://") || s.startsWith("https://")) {
            return s.replaceAll("/t/p/w\\d+/", "/t/p/w1280/");
        }
        if (s.startsWith("/")) {
            return "https://image.tmdb.org/t/p/w1280" + s;
        }
        return s;
    }

    static String firstNonEmpty(String... values) {
        for (String v : values) if (v != null && !v.trim().isEmpty() && !"null".equalsIgnoreCase(v)) return v.trim();
        return "";
    }

    public static String firstBackdrop(JSONObject info) {
        if (info == null) return null;
        JSONArray arr = info.optJSONArray("backdrop_path");
        if (arr != null && arr.length() > 0) {
            String res = resolveImageUrl(arr.optString(0, ""));
            if (res != null) return res;
        }
        String bp = resolveImageUrl(info.optString("backdrop_path", ""));
        if (bp != null) return bp;

        String[] altKeys = {"backdrop", "movie_image", "cover_big", "fanart", "background", "image"};
        for (String k : altKeys) {
            String val = resolveImageUrl(info.optString(k, ""));
            if (val != null) return val;
        }
        return null;
    }

    static void appendPart(StringBuilder sb, String part) {
        if (part == null || part.trim().isEmpty() || "null".equalsIgnoreCase(part)) return;
        if (sb.length() > 0) sb.append("  |  ");
        sb.append(part.trim());
    }

    private String downloadId() {
        return "vod:" + id;
    }

    /** زر التنزيل: يبدأ التنزيل، أو يفتح صندوق متابعته، أو يشغّل الملف المنزّل. */
    private void onDownloadClick() {
        Downloads dl = Downloads.get(this);
        Downloads.Item existing = dl.find(downloadId());
        if (existing != null) {
            DownloadDialog.show(this, existing.id);
            return;
        }
        Downloads.Item req = new Downloads.Item();
        req.id = downloadId();
        req.kind = "movie";
        req.title = name;
        req.subtitle = "فيلم";
        req.poster = cover;
        req.ext = (ext == null || ext.isEmpty()) ? "mp4" : ext;
        req.url = api.streamUrl(Models.VOD, id, req.ext);
        req.contentKey = "vod:" + id;
        req.accountId = account.id;
        dl.enqueue(req);
        DownloadDialog.show(this, req.id);
    }

    @Override
    public void onDownloadsChanged() {
        paintDownloadButton();
    }

    private void paintDownloadButton() {
        TextView text = findViewById(R.id.det_btn_download_text);
        ImageView icon = findViewById(R.id.det_btn_download_icon);
        if (text == null) return;
        Downloads dl = Downloads.get(this);
        Downloads.Item i = dl.find(downloadId());
        if (i == null) {
            text.setText("تنزيل");
            icon.setImageResource(R.drawable.fa_download);
        } else if (Downloads.DONE.equals(i.state)) {
            text.setText("تم التنزيل ✓ — بدون إنترنت");
            icon.setImageResource(R.drawable.fa_circle_check);
        } else if (Downloads.RUNNING.equals(i.state)) {
            text.setText("جاري التنزيل " + i.percent() + "%");
            icon.setImageResource(R.drawable.fa_download);
        } else if (Downloads.PAUSED.equals(i.state)) {
            text.setText("التنزيل متوقف " + i.percent() + "%");
            icon.setImageResource(R.drawable.fa_pause);
        } else if (Downloads.FAILED.equals(i.state)) {
            text.setText("فشل التنزيل — اضغط للتفاصيل");
            icon.setImageResource(R.drawable.fa_triangle_exclamation);
        } else {
            text.setText("في قائمة التنزيل");
            icon.setImageResource(R.drawable.fa_clock);
        }
    }

    private void playMovie() {
        store.recordContinueWatching(Models.VOD, id);
        // الملف المنزّل أولاً: يعمل بلا إنترنت ولا يفتح اتصالاً بالسيرفر
        String local = Downloads.get(this).localFile(downloadId());
        String url = local != null ? Uri.fromFile(new java.io.File(local)).toString() : api.streamUrl(Models.VOD, id, ext);
        PlayQueue.single(new PlayQueue.Entry(url, name, cover, "vod:" + id, id, Models.VOD));
        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("queue", true);
        i.putExtra("videoUrl", url);
        i.putExtra("title", name);
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
            url = "https://www.youtube.com/results?search_query=" + Uri.encode((name != null ? name : "") + " trailer اعلان فيلم");
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            toast("لا يوجد تطبيق لتشغيل الإعلان على هذا الجهاز");
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        Downloads.get(this).addListener(this);
        paintDownloadButton();
    }

    @Override
    protected void onStop() {
        Downloads.get(this).removeListener(this);
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
        // زر المشاهدة يعرض "استئناف" مع موضع التوقف إن بدأ المستخدم الفيلم سابقاً
        TextView playText = findViewById(R.id.det_btn_play_text);
        long[] watched = store != null ? store.position("vod:" + id) : null;
        if (playText != null) playText.setText(watched != null ? "استئناف " + clock(watched[0]) : "شاهد الآن");
    }

    static String clock(long ms) {
        long t = ms / 1000;
        return t >= 3600
                ? String.format(java.util.Locale.US, "%d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60)
                : String.format(java.util.Locale.US, "%02d:%02d", t / 60, t % 60);
    }

    public static String extractRating(JSONObject o) {
        if (o == null) return "";
        String[] keys = {"rating", "vote_average", "rating_imdb", "imdb_rating", "tmdb_rating", "rating_5based", "score"};
        for (String k : keys) {
            String v = o.optString(k, "").trim();
            if (!v.isEmpty() && !"0".equals(v) && !"0.0".equals(v) && !"null".equalsIgnoreCase(v)) {
                try {
                    float f = Float.parseFloat(v);
                    if (f > 0) {
                        if ("rating_5based".equals(k) && f <= 5.0f) f *= 2.0f;
                        return f == (int) f ? String.valueOf((int) f) : String.format(java.util.Locale.US, "%.1f", f);
                    }
                } catch (Exception ignored) {
                    return v;
                }
            }
        }
        return "";
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
