package com.almezo.servers.nat;

import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.PlayerActivity;
import com.almezo.servers.R;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * شاشة التصفح الأصلية للبث المباشر والأفلام والمسلسلات (بديل #live-screen و #vod-screen).
 * RecyclerView يعيد استخدام نفس البطاقات أثناء التمرير بدل إنشاء آلاف العناصر، والريموت
 * يتنقل بين العناصر عبر نظام التركيز الأصلي في أندرويد مباشرة.
 */
public class BrowseActivity extends BaseActivity {

    public static final String EXTRA_TYPE = "type";
    private static final int COLUMNS = 5;

    private String type;
    private Store store;
    private Models.Account account;
    private Xtream api;
    private NavBar nav;

    private final List<Models.Item> allItems = new ArrayList<>();
    private final Map<String, Models.Item> byId = new HashMap<>();
    private final List<Models.Category> categories = new ArrayList<>();
    private final List<Models.Item> shown = new ArrayList<>();
    private final Set<String> favIds = new HashSet<>();
    private String activeCatId = "all";
    private String sortMode = "default";
    private boolean hideNames = false;
    private String query = "";

    private RecyclerView catList, grid;
    private CategoryAdapter catAdapter;
    private PosterAdapter gridAdapter;
    private ProgressBar progress;
    private TextView empty, title;
    private View searchBox;
    private EditText searchInput;

    private final Runnable applySearch = this::applyFilter;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        type = getIntent().getStringExtra(EXTRA_TYPE);
        if (type == null) type = Models.LIVE;
        store = new Store(this);
        account = store.active();
        if (account == null) { finish(); return; }
        api = new Xtream(this, account);

        setContentView(R.layout.nat_activity_browse);
        nav = new NavBar(this).backOnly(this);

        title = findViewById(R.id.browse_title);
        progress = findViewById(R.id.browse_progress);
        empty = findViewById(R.id.browse_empty);
        searchBox = findViewById(R.id.browse_search_box);
        searchInput = findViewById(R.id.browse_search);
        hideNames = "1".equals(store.getString("hide_names_" + type, "0"));
        sortMode = store.getString("sort_" + type, "default");
        activeCatId = store.getString("last_cat_" + type, "all");

        setupHeaderButtons();
        setupLists();
        load(false);
    }

    // ------------------------------------------------------------------ الواجهة

    private void setupHeaderButtons() {
        ImageButton search = findViewById(R.id.browse_btn_search);
        ImageButton menu = findViewById(R.id.browse_btn_menu);
        applyFocusScale(search, 1.1f);
        applyFocusScale(menu, 1.1f);

        // نفس ترتيب الويب: في البث المباشر الأزرار فوق الشبكة، وفي الأفلام والمسلسلات في رأس الأقسام
        if (!Models.LIVE.equals(type)) {
            LinearLayout gridActions = findViewById(R.id.grid_actions);
            LinearLayout sideActions = findViewById(R.id.sidebar_actions);
            gridActions.removeView(search);
            gridActions.removeView(menu);
            sideActions.addView(search);
            sideActions.addView(menu);
            View gridHeader = findViewById(R.id.browse_grid_header);
            if (gridHeader != null) gridHeader.setVisibility(View.GONE);
        }

        search.setOnClickListener(v -> toggleSearch());
        menu.setOnClickListener(v -> showOptions());
        searchInput.setHint(Models.LIVE.equals(type) ? "ابحث في جميع القنوات..." : "ابحث في جميع الأفلام والمسلسلات (الكل)...");
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                query = normalize(s.toString());
                ui.removeCallbacks(applySearch);
                ui.postDelayed(applySearch, 250);
            }
        });
        searchInput.setOnEditorActionListener((v, id, e) -> {
            if (id == EditorInfo.IME_ACTION_SEARCH) { hideKeyboard(); grid.requestFocus(); return true; }
            return false;
        });
        View clear = findViewById(R.id.browse_search_clear);
        applyFocusScale(clear, 1.12f);
        clear.setOnClickListener(v -> {
            searchInput.setText("");
            searchBox.setVisibility(View.GONE);
            hideKeyboard();
        });
    }

    private void toggleSearch() {
        if (searchBox.getVisibility() == View.VISIBLE) {
            searchInput.setText("");
            searchBox.setVisibility(View.GONE);
            hideKeyboard();
        } else {
            searchBox.setVisibility(View.VISIBLE);
            searchInput.requestFocus();
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(searchInput, InputMethodManager.SHOW_IMPLICIT);
        }
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(searchInput.getWindowToken(), 0);
    }

    private void showOptions() {
        SortDialog.show(this, type, sortMode, hideNames, (newSort, newHide) -> {
            sortMode = newSort;
            store.putString("sort_" + type, sortMode);
            boolean hideChanged = (hideNames != newHide);
            hideNames = newHide;
            store.putString("hide_names_" + type, hideNames ? "1" : "0");
            if (hideChanged && gridAdapter != null) gridAdapter.notifyDataSetChanged();
            applyFilter();
        });
    }

    private void setupLists() {
        catList = findViewById(R.id.browse_categories);
        catList.setLayoutManager(new LinearLayoutManager(this));
        catAdapter = new CategoryAdapter();
        catList.setAdapter(catAdapter);
        catList.setItemAnimator(null);

        grid = findViewById(R.id.browse_grid);
        GridLayoutManager glm = new GridLayoutManager(this, COLUMNS);
        grid.setLayoutManager(glm);
        grid.setHasFixedSize(true);
        grid.setItemAnimator(null);
        grid.setItemViewCacheSize(COLUMNS * 3);
        final int spacing = Math.round(14 * getResources().getDisplayMetrics().density);
        grid.addItemDecoration(new RecyclerView.ItemDecoration() {
            @Override
            public void getItemOffsets(@NonNull Rect outRect, @NonNull View view, @NonNull RecyclerView parent, @NonNull RecyclerView.State state) {
                outRect.left = spacing / 2;
                outRect.right = spacing / 2;
                outRect.bottom = spacing;
                outRect.top = 0;
            }
        });
        gridAdapter = new PosterAdapter();
        grid.setAdapter(gridAdapter);
    }

    // ------------------------------------------------------------------ البيانات

    private void load(boolean force) {
        progress.setVisibility(View.VISIBLE);
        empty.setVisibility(View.GONE);
        Xtream.IO.execute(() -> {
            List<Models.Category> cats = null;
            List<Models.Item> items = null;
            String error = null;
            try {
                cats = api.categories(type, force);
                items = api.streams(type, force);
            } catch (Exception e) {
                error = "تعذر تحميل المحتوى من السيرفر، تحقق من الاتصال وحاول مجدداً";
            }
            final List<Models.Category> fc = cats;
            final List<Models.Item> fi = items;
            final String fe = error;
            ui.post(() -> {
                if (isFinishing()) return;
                progress.setVisibility(View.GONE);
                if (fe != null) { showEmpty(fe); return; }
                onData(fc, fi);
            });
        });
    }

    private void onData(List<Models.Category> serverCats, List<Models.Item> items) {
        allItems.clear();
        allItems.addAll(items);
        byId.clear();
        Map<String, Integer> counts = new HashMap<>();
        for (Models.Item it : items) {
            byId.put(it.id, it);
            if (it.categoryId != null) {
                Integer c = counts.get(it.categoryId);
                counts.put(it.categoryId, c == null ? 1 : c + 1);
            }
        }
        favIds.clear();
        favIds.addAll(store.favorites(type));
        rebuildCategories(serverCats, counts);
        applyFilter();
        focusActiveCategory();
    }

    private void rebuildCategories(List<Models.Category> serverCats, Map<String, Integer> counts) {
        categories.clear();
        categories.add(new Models.Category("all", "الكل", allItems.size(), true));
        categories.add(new Models.Category("favs", "المفضلة", store.favorites(type).size(), true));
        if (!Models.LIVE.equals(type)) {
            categories.add(new Models.Category("continue", "متابعة المشاهدة", store.continueWatching(type).size(), true));
            categories.add(new Models.Category("recent", "المضافة حديثاً", Math.min(20, allItems.size()), true));
        }
        if (serverCats != null) {
            for (Models.Category c : serverCats) {
                Integer n = counts.get(c.id);
                categories.add(new Models.Category(c.id, c.name, n == null ? 0 : n, false));
            }
        }
        boolean found = false;
        for (Models.Category c : categories) if (c.id.equals(activeCatId)) { found = true; break; }
        if (!found) activeCatId = "all";
        catAdapter.notifyDataSetChanged();
    }

    private void refreshSpecialCounts() {
        favIds.clear();
        favIds.addAll(store.favorites(type));
        for (Models.Category c : categories) {
            if ("favs".equals(c.id)) c.count = store.favorites(type).size();
            else if ("continue".equals(c.id)) c.count = store.continueWatching(type).size();
        }
        catAdapter.notifyDataSetChanged();
    }

    private void applyFilter() {
        List<Models.Item> base = new ArrayList<>();
        if (!query.isEmpty()) {
            // البحث يشمل كل عناصر النوع (الكل) كما في مشغل الويب
            for (Models.Item it : allItems) if (normalize(it.safeName()).contains(query)) base.add(it);
        } else if ("all".equals(activeCatId)) {
            base.addAll(allItems);
        } else if ("favs".equals(activeCatId)) {
            for (String id : store.favorites(type)) { Models.Item it = byId.get(id); if (it != null) base.add(it); }
        } else if ("continue".equals(activeCatId)) {
            for (String id : store.continueWatching(type)) { Models.Item it = byId.get(id); if (it != null) base.add(it); }
        } else if ("recent".equals(activeCatId)) {
            List<Models.Item> sorted = new ArrayList<>(allItems);
            Collections.sort(sorted, (a, b) -> Long.compare(b.added, a.added));
            base.addAll(sorted.subList(0, Math.min(20, sorted.size())));
        } else {
            for (Models.Item it : allItems) if (activeCatId.equals(it.categoryId)) base.add(it);
        }

        if ("added".equals(sortMode)) Collections.sort(base, (a, b) -> Long.compare(b.added, a.added));
        else if ("asc".equals(sortMode)) Collections.sort(base, (a, b) -> a.safeName().compareToIgnoreCase(b.safeName()));
        else if ("desc".equals(sortMode)) Collections.sort(base, (a, b) -> b.safeName().compareToIgnoreCase(a.safeName()));

        shown.clear();
        shown.addAll(base);
        gridAdapter.notifyDataSetChanged();
        grid.scrollToPosition(0);

        Models.Category active = null;
        for (Models.Category c : categories) if (c.id.equals(activeCatId)) { active = c; break; }
        title.setText(!query.isEmpty() ? "نتائج البحث" : (active != null ? active.name : "الكل"));
        if (shown.isEmpty()) showEmpty(!query.isEmpty() ? "لا توجد نتائج مطابقة لبحثك" : "لا توجد عناصر في هذا القسم");
        else empty.setVisibility(View.GONE);
    }

    private void showEmpty(String msg) {
        empty.setText(msg);
        empty.setVisibility(View.VISIBLE);
    }

    private void focusActiveCategory() {
        for (int i = 0; i < categories.size(); i++) {
            if (categories.get(i).id.equals(activeCatId)) {
                final int pos = i;
                catList.scrollToPosition(pos);
                catList.post(() -> {
                    RecyclerView.ViewHolder vh = catList.findViewHolderForAdapterPosition(pos);
                    if (vh != null) vh.itemView.requestFocus();
                });
                return;
            }
        }
    }

    /** نفس تطبيع النص العربي في مساعد الميزو/البحث بالويب. */
    static String normalize(String s) {
        if (s == null) return "";
        String t = s.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[أإآ]", "ا")
                .replace('ة', 'ه')
                .replace('ى', 'ي')
                .replaceAll("[\\u064B-\\u0652]", "")
                .replaceAll("[-_.:]", " ")
                .replaceAll("\\s+", " ");
        return t;
    }

    // ------------------------------------------------------------------ الإجراءات

    private void open(Models.Item it) {
        if (Models.LIVE.equals(type)) {
            Intent i = new Intent(this, PlayerActivity.class);
            i.putExtra("videoUrl", api.streamUrl(Models.LIVE, it.id, "m3u8"));
            i.putExtra("title", it.safeName());
            i.putExtra("posterUrl", it.icon == null ? "" : it.icon);
            i.putExtra("isLive", true);
            i.putExtra("isTv", isTvDevice(this));
            startActivity(i);
        } else if (Models.VOD.equals(type)) {
            Intent i = new Intent(this, MovieDetailsActivity.class);
            i.putExtra("id", it.id);
            i.putExtra("name", it.safeName());
            i.putExtra("cover", it.icon);
            i.putExtra("ext", it.extension);
            startActivity(i);
        } else {
            Intent i = new Intent(this, SeriesDetailsActivity.class);
            i.putExtra("id", it.id);
            i.putExtra("name", it.safeName());
            i.putExtra("cover", it.icon);
            startActivity(i);
        }
    }

    private void toggleFavorite(Models.Item it, int position) {
        boolean fav = store.toggleFavorite(type, it.id);
        toast(fav ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
        refreshSpecialCounts();
        if ("favs".equals(activeCatId)) applyFilter();
        else gridAdapter.notifyItemChanged(position);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nav != null) nav.start();
        // قد تكون المفضلة أو متابعة المشاهدة تغيّرت من شاشة التفاصيل
        if (!categories.isEmpty()) {
            refreshSpecialCounts();
            if ("favs".equals(activeCatId) || "continue".equals(activeCatId)) applyFilter();
            else gridAdapter.notifyDataSetChanged();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nav != null) nav.stop();
    }

    @Override
    public void onBackPressed() {
        if (searchBox.getVisibility() == View.VISIBLE) {
            searchInput.setText("");
            searchBox.setVisibility(View.GONE);
            hideKeyboard();
            return;
        }
        super.onBackPressed();
    }

    // ------------------------------------------------------------------ المحوّلات

    private class CategoryAdapter extends RecyclerView.Adapter<CategoryAdapter.VH> {
        class VH extends RecyclerView.ViewHolder {
            final TextView name, count;
            VH(View v) {
                super(v);
                name = v.findViewById(R.id.cat_name);
                count = v.findViewById(R.id.cat_count);
            }
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_category, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            final Models.Category c = categories.get(position);
            h.name.setText("\u200F" + c.name);
            h.count.setText(c.count > 0 || c.special ? String.valueOf(c.count) : "");
            h.itemView.setActivated(c.id.equals(activeCatId));
            h.itemView.setOnClickListener(v -> {
                activeCatId = c.id;
                store.putString("last_cat_" + type, activeCatId);
                if (!query.isEmpty()) {
                    searchInput.setText("");
                    searchBox.setVisibility(View.GONE);
                }
                notifyDataSetChanged();
                applyFilter();
            });
        }

        @Override
        public int getItemCount() {
            return categories.size();
        }
    }

    private class PosterAdapter extends RecyclerView.Adapter<PosterAdapter.VH> {
        class VH extends RecyclerView.ViewHolder {
            final ImageView img, fav;
            final TextView name;
            VH(View v) {
                super(v);
                img = v.findViewById(R.id.poster_img);
                fav = v.findViewById(R.id.poster_fav);
                name = v.findViewById(R.id.poster_title);
                applyFocusScale(v, 1.06f);
            }
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.nat_item_poster, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            final Models.Item it = shown.get(position);
            boolean isLive = Models.LIVE.equals(type);
            // الشعارات تُعرض كاملة في منتصف الصندوق، والملصقات تملؤه (نفس الويب)
            h.img.setScaleType(isLive ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP);
            int pad = isLive ? Math.round(h.itemView.getResources().getDisplayMetrics().density * 22) : 0;
            h.img.setPadding(pad, pad, pad, pad);
            Ui.loadImage(h.img, it.icon, Ui.logoPlaceholder());
            h.name.setText(it.safeName());
            h.name.setVisibility(hideNames ? View.GONE : View.VISIBLE);
            h.fav.setVisibility(favIds.contains(it.id) ? View.VISIBLE : View.GONE);
            h.itemView.setOnClickListener(v -> open(it));
            h.itemView.setOnLongClickListener(v -> { toggleFavorite(it, h.getBindingAdapterPosition()); return true; });
            h.itemView.setOnKeyListener((v, keyCode, e) -> {
                if (e.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_MENU) {
                    toggleFavorite(it, h.getBindingAdapterPosition());
                    return true;
                }
                return false;
            });
        }

        @Override
        public int getItemCount() {
            return shown.size();
        }
    }
}
