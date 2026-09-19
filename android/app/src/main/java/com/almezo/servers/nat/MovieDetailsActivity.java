package com.almezo.servers.nat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import org.json.JSONArray;
import org.json.JSONObject;

/** تفاصيل الفيلم (#movie-details-screen) مع التشغيل والمفضلة والإعلان. */
public class MovieDetailsActivity extends BaseActivity {

    private Store store;
    private Xtream api;
    private NavBar nav;
    private String id, name, cover, ext;
    private String trailerKey;

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

        TextView trailer = findViewById(R.id.det_btn_trailer);
        applyFocusScale(trailer, 1.06f);
        trailer.setOnClickListener(v -> openTrailer());

        loadInfo();
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
        appendPart(meta, info.optString("genre"));
        appendPart(meta, info.optString("duration"));
        appendPart(meta, info.optString("country"));
        String year = info.optString("releasedate", "");
        if (year.length() >= 4) appendPart(meta, year.substring(0, 4));
        ((TextView) findViewById(R.id.det_meta)).setText(meta.toString());

        String rating = info.optString("rating", "");
        TextView ratingView = findViewById(R.id.det_rating);
        if (!rating.isEmpty() && !"0".equals(rating)) ratingView.setText("★  التقييم: " + rating);
        else ratingView.setVisibility(View.GONE);

        String plot = firstNonEmpty(info.optString("plot"), info.optString("description"), "لا يوجد وصف متاح لهذا العمل.");
        ((TextView) findViewById(R.id.det_plot)).setText(plot);

        StringBuilder people = new StringBuilder();
        String director = info.optString("director", "");
        String cast = firstNonEmpty(info.optString("cast"), info.optString("actors"), "");
        if (!director.isEmpty()) people.append("المخرج: ").append(director);
        if (!cast.isEmpty()) {
            if (people.length() > 0) people.append("\n");
            people.append("الممثلين: ").append(cast);
        }
        ((TextView) findViewById(R.id.det_people)).setText(people.toString());

        trailerKey = info.optString("youtube_trailer", "");
        if (trailerKey != null && !trailerKey.trim().isEmpty()) findViewById(R.id.det_btn_trailer).setVisibility(View.VISIBLE);
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
}
