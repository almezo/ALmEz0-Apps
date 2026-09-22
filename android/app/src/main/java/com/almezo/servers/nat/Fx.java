package com.almezo.servers.nat;

import android.animation.TimeInterpolator;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Rect;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.DrawableContainer;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.Window;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.AbsListView;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.SeekBar;

import androidx.annotation.NonNull;
import androidx.core.widget.NestedScrollView;
import androidx.recyclerview.widget.RecyclerView;

import com.almezo.servers.R;

import java.util.ArrayList;

/**
 * مؤثرات الواجهة الموحّدة لكل شاشات المشغل (بأسلوب نتفلكس وشاهد):
 *
 * - التركيز بالريموت: العنصر المُركَّز يكبر بنعومة، ويرتفع فوق جيرانه مع توهج أبيض (أندرويد 9+)،
 *   ويُرسم حوله إطار أبيض نظيف إن لم يكن له شكل تركيز خاص به. يُطبَّق مركزياً عبر مستمع تغيّر
 *   التركيز في النافذة، فيشمل كل زر وبطاقة وعنصر قائمة دون تكرار الكود في كل شاشة، ويلغي مربع
 *   التركيز الافتراضي من النظام.
 * - اللمس: الزر المضغوط ينكمش قليلاً ويضيء، ثم يعود بارتداد خفيف عند رفع الإصبع.
 */
public final class Fx {

    private static final TimeInterpolator OVERSHOOT = new OvershootInterpolator(1.4f);
    private static final TimeInterpolator DECEL = new DecelerateInterpolator();
    private static final int GLOW = 0xFFFFFFFF;
    private static final int NO_GLOW = 0xFF000000;

    private Fx() { }

    /** تفعيل مؤثرات التركيز على نافذة (شاشة أو نافذة منبثقة). */
    public static void install(Window w) {
        if (w == null) return;
        View decor = w.getDecorView();
        if (decor.getTag(R.id.fx_installed) != null) return;
        decor.setTag(R.id.fx_installed, Boolean.TRUE);
        decor.getViewTreeObserver().addOnGlobalFocusChangeListener((oldFocus, newFocus) -> {
            if (oldFocus != null) focusOut(oldFocus);
            if (newFocus != null) focusIn(newFocus);
        });
    }

    /** مقدار التكبير المفضّل لعنصر معيّن عند التركيز (بدل التقدير التلقائي حسب الحجم). */
    public static void setFocusScale(View v, float scale) {
        if (v == null) return;
        v.setTag(R.id.fx_scale, scale);
        disableDefaultHighlight(v);
    }

    private static void disableDefaultHighlight(View v) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { v.setDefaultFocusHighlightEnabled(false); } catch (Throwable ignored) { }
        }
    }

    private static boolean isContainer(View v) {
        return v instanceof RecyclerView || v instanceof AbsListView || v instanceof ScrollView
                || v instanceof NestedScrollView;
    }

    private static float focusScaleOf(View v) {
        Object t = v.getTag(R.id.fx_scale);
        if (t instanceof Float) return (Float) t;
        if (v instanceof EditText || v instanceof SeekBar) return 1f;
        float d = v.getResources().getDisplayMetrics().density;
        int w = v.getWidth(), h = v.getHeight();
        View parent = v.getParent() instanceof View ? (View) v.getParent() : null;
        // العناصر العريضة (صف قسم في القائمة الجانبية مثلاً) لا تُكبَّر حتى لا تُقص عند حواف حاويتها
        if (parent != null && parent.getWidth() > 0 && w > parent.getWidth() * 0.7f) return 1f;
        float max = Math.max(w, h) / d;
        if (max < 90) return 1.12f;
        if (max < 320) return 1.06f;
        return 1.035f;
    }

    /** جذر الشاشة أو عنصر يملؤها (مثل سطح الفيديو) لا يُكبَّر ولا يُؤطَّر. */
    private static boolean fillsWindow(View v) {
        View root = v.getRootView();
        return root != null && v.getWidth() >= root.getWidth() * 0.9f && v.getHeight() >= root.getHeight() * 0.75f;
    }

    static void focusIn(View v) {
        if (isContainer(v) || fillsWindow(v)) return;
        disableDefaultHighlight(v);
        unclipParents(v);
        float s = focusScaleOf(v);
        float d = v.getResources().getDisplayMetrics().density;
        // صندوق الكتابة لا يُرفع: الرفع (translationZ) يجعله فوق الأزرار المرسومة عليه كزر العين
        // في كلمة المرور، فيأخذ لمساتها ولا يُضغط الزر إلا بعد نقل المؤشر لصندوق آخر
        float z = (v instanceof EditText) ? 0f : 10 * d;
        v.animate().scaleX(s).scaleY(s).translationZ(z).setInterpolator(OVERSHOOT).setDuration(200).start();
        glow(v, true);
        if (!hasOwnFocusStyle(v)) {
            v.setTag(R.id.fx_prev_fg, v.getForeground() == null ? NO_FOREGROUND : v.getForeground());
            v.setForeground(new Ring(v));
        }
    }

    static void focusOut(View v) {
        if (isContainer(v) || fillsWindow(v)) return;
        v.animate().scaleX(1f).scaleY(1f).translationZ(0).setInterpolator(DECEL).setDuration(160).start();
        glow(v, false);
        Object prev = v.getTag(R.id.fx_prev_fg);
        if (prev != null) {
            v.setForeground(prev == NO_FOREGROUND ? null : (Drawable) prev);
            v.setTag(R.id.fx_prev_fg, null);
        }
    }

    private static final Object NO_FOREGROUND = new Object();

    /**
     * العنصر المُكبَّر لا يُقص عند حواف حاويته: الحاويات الثابتة (غير القابلة للتمرير) حوله تسمح
     * برسمه خارج حدودها وحشواتها. نتوقف عند أول قائمة أو حاوية تمرير، فتلك تُترك تقص ما يخرج
     * عنها أثناء التمرير، ويكفيها السماح بالرسم داخل حشواتها.
     */
    private static void unclipParents(View v) {
        android.view.ViewParent p = v.getParent();
        for (int depth = 0; depth < 4 && p instanceof ViewGroup; depth++) {
            ViewGroup g = (ViewGroup) p;
            if (isContainer(g) || g instanceof android.widget.HorizontalScrollView) {
                g.setClipToPadding(false);
                return;
            }
            g.setClipChildren(false);
            g.setClipToPadding(false);
            p = g.getParent();
        }
    }

    private static void glow(View v, boolean on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                v.setOutlineSpotShadowColor(on ? GLOW : NO_GLOW);
                v.setOutlineAmbientShadowColor(on ? GLOW : NO_GLOW);
            } catch (Throwable ignored) { }
        }
    }

    /** هل للعنصر شكل تركيز مصمَّم في خلفيته أو واجهته؟ (فلا نرسم فوقه إطاراً ثانياً) */
    private static boolean hasOwnFocusStyle(View v) {
        return v.getTag(R.id.fx_no_ring) != null || v.getTag(R.id.fx_prev_fg) != null
                || hasFocusedState(v.getBackground()) || hasFocusedState(v.getForeground());
    }

    private static boolean hasFocusedState(Drawable d) {
        if (!(d instanceof StateListDrawable) || d.getConstantState() == null) return false;
        try {
            Drawable copy = d.getConstantState().newDrawable().mutate();
            copy.setState(new int[]{android.R.attr.state_enabled, android.R.attr.state_focused});
            Drawable focused = copy.getCurrent();
            copy.setState(new int[]{android.R.attr.state_enabled});
            return focused != copy.getCurrent();
        } catch (Throwable t) {
            return false;
        }
    }

    /** العنصر يرسم تركيزه في عنصر داخلي (مثل إطار الملصق دون العنوان)، فلا يُرسم إطار حوله كله. */
    public static void noRing(View v) {
        if (v != null) v.setTag(R.id.fx_no_ring, Boolean.TRUE);
    }

    // ------------------------------------------------------------ تنقل الريموت

    /**
     * تنقل هندسي حقيقي بالريموت عبر الشاشة كلها: ينقل التركيز بضغطة سهم إلى أقرب عنصر في
     * اتجاه الضغط فعلياً على الشاشة، ويعيد true إن تكفّل بالضغطة.
     *
     * خوارزمية أندرويد الافتراضية تبحث داخل الحاوية أولاً، فالضغط يساراً في أول عنصر من صف
     * في الشبكة كان يلتف لآخر الصف السابق بدل الخروج إلى القائمة الجانبية المجاورة، والانتقال
     * بين الشريط العلوي والمحتوى والتذييل غير مضمون.
     *
     * الترتيب: هدف داخل نفس القائمة أولاً، ثم تمرير القائمة نفسها إن لم يُرسم الصف
     * التالي بعد، ثم بحث هندسي في الشاشة كلها.
     *
     * لا نعيد الأمر إلى خوارزمية أندرويد الافتراضية أبداً ما دام التركيز داخل قائمة:
     * حين يكون القسم المُركَّز آخر صف مرسوم، لا يجد بحثنا داخل القائمة شيئاً تحته،
     * وكان التسليم للنظام هنا يُخرج التركيز من قائمة الأقسام إلى الشريط العلوي ثم إلى
     * شبكة البطاقات، فيمشي المستخدم في البطاقات ثم يعود للأقسام وهو ممسك بالسهم —
     * وهو العطل الذي قِستُه فعلياً على المحاكي في شاشة الأفلام.
     */
    public static boolean move(View root, View from, int direction) {
        if (root == null || from == null) return false;
        View container = scrollParentOf(from);
        if (container != null) {
            View inside = searchIn(container, from, direction);
            if (inside != null && inside != from && inside.requestFocus()) return true;
            // الصف التالي لم يُرسم بعد: نمرّر القائمة بأنفسنا ونركّز عليه حين يجهز
            if (canScroll(container, direction) && stepInList(container, from, direction)) return true;
        }
        View next = searchIn(root, from, direction);
        if (next != null && next != from && next.requestFocus()) return true;
        // لا شيء في هذا الاتجاه داخل قائمة: نبتلع الضغطة بدل أن يلتف النظام للطرف المقابل
        return container != null;
    }

    /**
     * يمرّر القائمة خطوة واحدة في اتجاه الضغط وينقل التركيز إلى العنصر التالي فيها.
     * في الشبكة تكون الخطوة عموداً كاملاً (عدد الأعمدة) لأن الأسفل صفٌّ لا عنصر.
     */
    private static boolean stepInList(View container, View from, int direction) {
        if (!(container instanceof RecyclerView)) {
            boolean vertical = direction == View.FOCUS_UP || direction == View.FOCUS_DOWN;
            int sign = (direction == View.FOCUS_UP || direction == View.FOCUS_LEFT) ? -1 : 1;
            int by = sign * (vertical ? container.getHeight() : container.getWidth()) / 3;
            container.scrollBy(vertical ? 0 : by, vertical ? by : 0);
            return true;
        }
        RecyclerView rv = (RecyclerView) container;
        RecyclerView.Adapter<?> adapter = rv.getAdapter();
        View item = rv.findContainingItemView(from);
        if (adapter == null || item == null) return false;
        int pos = rv.getChildAdapterPosition(item);
        if (pos == RecyclerView.NO_POSITION) return false;

        int step = 1;
        RecyclerView.LayoutManager lm = rv.getLayoutManager();
        boolean vertical = direction == View.FOCUS_UP || direction == View.FOCUS_DOWN;
        if (lm instanceof androidx.recyclerview.widget.GridLayoutManager && vertical) {
            step = Math.max(1, ((androidx.recyclerview.widget.GridLayoutManager) lm).getSpanCount());
        }
        int target = pos + ((direction == View.FOCUS_UP || direction == View.FOCUS_LEFT) ? -step : step);
        if (target < 0) target = 0;
        if (target >= adapter.getItemCount()) target = adapter.getItemCount() - 1;
        if (target == pos) return false;

        rv.scrollToPosition(target);
        focusWhenReady(rv, target, 0);
        return true;
    }

    /** العنصر الجديد لا يوجد لحظة التمرير؛ نحاول تركيزه في الإطارات التالية حتى يُربَط. */
    private static void focusWhenReady(RecyclerView rv, int pos, int tries) {
        rv.post(() -> {
            RecyclerView.ViewHolder vh = rv.findViewHolderForAdapterPosition(pos);
            if (vh != null && vh.itemView.isShown() && vh.itemView.requestFocus()) return;
            if (tries < 10) focusWhenReady(rv, pos, tries + 1);
        });
    }

    /** أقرب حاوية قابلة للتمرير تحتوي العنصر. */
    private static View scrollParentOf(View v) {
        android.view.ViewParent p = v.getParent();
        for (int i = 0; i < 6 && p instanceof View; i++) {
            if (isContainer((View) p)) return (View) p;
            p = p.getParent();
        }
        return null;
    }

    private static boolean canScroll(View container, int direction) {
        int d = (direction == View.FOCUS_UP || direction == View.FOCUS_LEFT) ? -1 : 1;
        boolean vertical = direction == View.FOCUS_UP || direction == View.FOCUS_DOWN;
        return vertical ? container.canScrollVertically(d) : container.canScrollHorizontally(d);
    }

    private static View searchIn(View root, View from, int direction) {
        ArrayList<View> all = new ArrayList<>();
        root.addFocusables(all, direction, View.FOCUSABLES_ALL);
        if (all.isEmpty()) return null;

        Rect src = boundsOf(from);
        if (src == null) return null;
        float sx = src.exactCenterX(), sy = src.exactCenterY();

        View best = null;
        float bestScore = Float.MAX_VALUE;
        // أفضل مرشّح واقع داخل حدود المصدر؛ له الأولوية المطلقة (انظر آخر الدالة)
        View bestNested = null;
        float bestNestedScore = Float.MAX_VALUE;
        for (int i = 0; i < all.size(); i++) {
            View v = all.get(i);
            if (v == from || !v.isShown() || !v.isEnabled()) continue;
            Rect r = boundsOf(v);
            if (r == null || r.width() < 2 || r.height() < 2) continue;
            // العنصر الذي يحتوي المصدر (حاوية أكبر) ليس هدفاً، أما العنصر الداخلي
            // (زر التحديث داخل بطاقة الباقة مثلاً) فهدف مشروع ويجب الوصول إليه.
            if (r.contains(src)) continue;

            /*
             * مرشّح يقع داخل حدود المصدر: زر التحديث داخل بطاقة الباقة، وأزرار السجل
             * والإغلاق داخل جذر نافذة مساعد الميزو القابل للتركيز.
             *
             * لا تفصل هذه الأزرارَ عن المصدر حافةٌ في أي اتجاه، فالحساب بالحواف يعطي
             * along سالباً دائماً ويُرفض المرشّح — فتصير هذه الأزرار غير قابلة للوصول
             * بالريموت إطلاقاً مهما ضغط المستخدم. هنا نحتكم إلى موقع المركز لا الحافة.
             */
            if (src.contains(r)) {
                float dx = r.exactCenterX() - sx, dy = r.exactCenterY() - sy;
                float nAlong, nAcross;
                switch (direction) {
                    case View.FOCUS_LEFT:  nAlong = -dx; nAcross = Math.abs(dy); break;
                    case View.FOCUS_RIGHT: nAlong = dx;  nAcross = Math.abs(dy); break;
                    case View.FOCUS_UP:    nAlong = -dy; nAcross = Math.abs(dx); break;
                    default:               nAlong = dy;  nAcross = Math.abs(dx); break;
                }
                if (nAlong <= 2) continue;
                float nestedScore = nAlong + nAcross * 0.5f;
                if (nestedScore < bestNestedScore) { bestNestedScore = nestedScore; bestNested = v; }
                continue;
            }

            float along, across;
            boolean overlaps;
            switch (direction) {
                case View.FOCUS_LEFT:
                    along = src.left - r.right; across = Math.abs(r.exactCenterY() - sy);
                    overlaps = r.bottom > src.top && r.top < src.bottom;
                    break;
                case View.FOCUS_RIGHT:
                    along = r.left - src.right; across = Math.abs(r.exactCenterY() - sy);
                    overlaps = r.bottom > src.top && r.top < src.bottom;
                    break;
                case View.FOCUS_UP:
                    along = src.top - r.bottom; across = Math.abs(r.exactCenterX() - sx);
                    overlaps = r.right > src.left && r.left < src.right;
                    break;
                default: // FOCUS_DOWN
                    along = r.top - src.bottom; across = Math.abs(r.exactCenterX() - sx);
                    overlaps = r.right > src.left && r.left < src.right;
                    break;
            }
            if (along < -2) continue; // ليس في الاتجاه المطلوب

            // العنصر المتقابل مع مصدر التركيز (في نفس الصف أو العمود) يُفضَّل بوضوح على البعيد جانبياً
            float score = Math.max(along, 0) + across * (overlaps ? 0.25f : 2.5f);
            if (score < bestScore) { bestScore = score; best = v; }
        }

        // ما دام التركيز على حاوية، فأزرارها الداخلية أولى من أي عنصر خارجها مهما قرُب:
        // بلا هذه الأولوية يفوز زر التذييل على زر التحديث داخل البطاقة فيبقى بعيد المنال.
        // ولا حصار هنا: الزر الداخلي ورقة بلا أبناء، فالضغطة التالية تخرج منه طبيعياً.
        if (bestNested != null) return bestNested;
        return best;
    }

    private static Rect boundsOf(View v) {
        v.getLocationOnScreen(LOC);
        int w = Math.round(v.getWidth() * v.getScaleX());
        int h = Math.round(v.getHeight() * v.getScaleY());
        if (w <= 0 || h <= 0) return null;
        return new Rect(LOC[0], LOC[1], LOC[0] + w, LOC[1] + h);
    }

    /** يحوّل زر الريموت إلى اتجاه تركيز، أو 0 إن لم يكن زر اتجاه. */
    public static int directionOf(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return View.FOCUS_LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return View.FOCUS_RIGHT;
            case KeyEvent.KEYCODE_DPAD_UP: return View.FOCUS_UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return View.FOCUS_DOWN;
            default: return 0;
        }
    }

    // ------------------------------------------------------------------ اللمس

    private static View pressed;
    private static float downX, downY;

    /** يُستدعى من dispatchTouchEvent في الشاشات والنوافذ: تأثير الضغط والتوهج. */
    public static void onTouch(View root, MotionEvent ev) {
        if (root == null) return;
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                release();
                downX = ev.getRawX();
                downY = ev.getRawY();
                View target = findPressable(root, (int) ev.getRawX(), (int) ev.getRawY());
                if (target != null) {
                    pressed = target;
                    float d = target.getResources().getDisplayMetrics().density;
                    target.animate().scaleX(0.95f).scaleY(0.95f).translationZ(6 * d).setInterpolator(DECEL).setDuration(90).start();
                    glow(target, true);
                }
                break;
            case MotionEvent.ACTION_MOVE:
                if (pressed != null) {
                    int slop = ViewConfiguration.get(root.getContext()).getScaledTouchSlop();
                    if (Math.abs(ev.getRawX() - downX) > slop || Math.abs(ev.getRawY() - downY) > slop) release();
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                release();
                break;
            default:
                break;
        }
    }

    private static void release() {
        View v = pressed;
        pressed = null;
        if (v == null) return;
        boolean focused = v.isFocused();
        float s = focused ? focusScaleOf(v) : 1f;
        float d = v.getResources().getDisplayMetrics().density;
        v.animate().scaleX(s).scaleY(s).translationZ(focused ? 10 * d : 0).setInterpolator(OVERSHOOT).setDuration(220).start();
        if (!focused) glow(v, false);
    }

    private static final int[] LOC = new int[2];

    /** أعمق عنصر قابل للضغط تحت الإصبع (زر، بطاقة، عنصر قائمة). */
    private static View findPressable(View v, int x, int y) {
        if (v.getVisibility() != View.VISIBLE || v.getAlpha() == 0f) return null;
        v.getLocationOnScreen(LOC);
        if (x < LOC[0] || y < LOC[1] || x > LOC[0] + v.getWidth() * v.getScaleX() || y > LOC[1] + v.getHeight() * v.getScaleY()) {
            return null;
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = g.getChildCount() - 1; i >= 0; i--) {
                View hit = findPressable(g.getChildAt(i), x, y);
                if (hit != null) return hit;
            }
        }
        if (v.isClickable() && v.isEnabled() && !(v instanceof EditText) && !(v instanceof SeekBar) && !isContainer(v)
                && v.getWidth() < v.getRootView().getWidth() * 0.9f) {
            return v;
        }
        return null;
    }

    // ------------------------------------------------------------------ ظهور العناصر

    /** ظهور متتابع ناعم (انزلاق خفيف للأعلى مع تلاشٍ) لمجموعة عناصر عند فتح الشاشة. */
    public static void enter(View... views) {
        int i = 0;
        for (View v : views) {
            if (v == null) continue;
            float d = v.getResources().getDisplayMetrics().density;
            v.setAlpha(0f);
            v.setTranslationY(28 * d);
            v.animate().alpha(1f).translationY(0).setStartDelay(60L * i++).setDuration(420)
                    .setInterpolator(new DecelerateInterpolator(1.6f)).start();
        }
    }

    // ------------------------------------------------------------------ إطار التركيز

    /** إطار أبيض ناعم بنفس شكل خلفية العنصر (دائري للأزرار الدائرية، ومستدير الزوايا لغيرها). */
    private static final class Ring extends Drawable {
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final boolean oval;
        private final float radius;
        private final float width;
        private final RectF r = new RectF();

        Ring(View v) {
            float d = v.getResources().getDisplayMetrics().density;
            width = 2.5f * d;
            GradientDrawable g = gradientOf(v.getBackground());
            boolean isOval = false;
            float rad = 14 * d;
            if (g != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    isOval = g.getShape() == GradientDrawable.OVAL;
                    if (g.getCornerRadius() > 0) rad = g.getCornerRadius();
                } catch (Throwable ignored) { }
            }
            oval = isOval;
            radius = rad;
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(width);
            stroke.setColor(0xFFFFFFFF);
            halo.setStyle(Paint.Style.STROKE);
            halo.setStrokeWidth(width * 3f);
            halo.setColor(0x33FFFFFF);
        }

        private static GradientDrawable gradientOf(Drawable d) {
            for (int i = 0; i < 4 && d != null; i++) {
                if (d instanceof GradientDrawable) return (GradientDrawable) d;
                if (d instanceof DrawableContainer) d = d.getCurrent();
                else if (d instanceof LayerDrawable && ((LayerDrawable) d).getNumberOfLayers() > 0) {
                    d = ((LayerDrawable) d).getDrawable(0);
                } else return null;
            }
            return null;
        }

        @Override
        public void draw(@NonNull Canvas c) {
            r.set(getBounds());
            float in = width * 1.5f;
            r.inset(in, in);
            if (oval) {
                c.drawOval(r, halo);
                c.drawOval(r, stroke);
            } else {
                float rad = Math.max(0, radius - in / 2);
                c.drawRoundRect(r, rad, rad, halo);
                c.drawRoundRect(r, rad, rad, stroke);
            }
        }

        @Override public void setAlpha(int alpha) { }
        @Override public void setColorFilter(ColorFilter cf) { }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
