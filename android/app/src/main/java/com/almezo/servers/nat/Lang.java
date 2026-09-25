package com.almezo.servers.nat;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import java.util.HashMap;
import java.util.Map;

/**
 * لغة مشغل الميزو الأصلي: عربي (الافتراضي) أو إنجليزي.
 *
 * بدل تعديل مئات المواضع في الكود، الترجمة تعمل على شجرة العناصر بعد بنائها: كل نص أو تلميح
 * موجود في القاموس يُستبدل بالإنجليزية، وما ليس في القاموس (أسماء الأفلام والقنوات والأقسام
 * القادمة من سيرفر العميل) يبقى كما هو. ومع الإنجليزية ينقلب اتجاه الشاشات إلى LTR.
 */
public final class Lang {

    private static final String PREFS = "almezo_native_player";
    private static final String KEY = "app_lang";
    private static Boolean cachedEn = null;

    private Lang() { }

    // ------------------------------------------------------------------ الحالة

    public static boolean isEnglish(Context c) {
        if (cachedEn != null) return cachedEn;
        try {
            SharedPreferences p = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            cachedEn = "en".equals(p.getString(KEY, "ar"));
        } catch (Throwable t) {
            cachedEn = Boolean.FALSE;
        }
        return cachedEn;
    }

    public static void setEnglish(Context c, boolean en) {
        cachedEn = en;
        try {
            c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY, en ? "en" : "ar").apply();
        } catch (Throwable ignored) { }
    }

    /** اتجاه الشاشة الموافق للغة: LTR للإنجليزية وRTL للعربية. */
    public static int direction(Context c) {
        return isEnglish(c) ? View.LAYOUT_DIRECTION_LTR : View.LAYOUT_DIRECTION_RTL;
    }

    // ------------------------------------------------------------------ الترجمة

    /** يترجم نصاً واحداً، ويعيده كما هو إن لم يكن في القاموس. */
    public static String t(Context c, String text) {
        if (text == null || text.length() == 0 || !isEnglish(c)) return text;
        return translate(text);
    }

    private static String translate(String raw) {
        String s = raw.trim();
        if (s.isEmpty()) return raw;
        String hit = MAP.get(s);
        if (hit != null) return hit;

        // نص يبدأ بعبارة معروفة ثم قيمة متغيّرة: "تم الاستئناف من 00:12"
        for (Map.Entry<String, String> e : MAP.entrySet()) {
            String k = e.getKey();
            if (k.length() >= 6 && s.startsWith(k)) {
                return e.getValue() + s.substring(k.length());
            }
        }
        // عبارات زمنية وقصيرة تظهر داخل نصوص مركّبة: "آخر تحديث: قبل يومين"
        String sub = s;
        for (String k : INLINE) {
            if (sub.contains(k)) sub = sub.replace(k, MAP.get(k));
        }
        if (!sub.equals(s)) return sub;

        // "5 حلقات" أو "3 مواسم"
        int sp = s.indexOf(' ');
        if (sp > 0) {
            String head = s.substring(0, sp);
            String tail = MAP.get(s.substring(sp + 1));
            if (tail != null && head.matches("[0-9٠-٩]+")) return head + " " + tail;
        }
        return raw;
    }

    /** يطبّق اللغة على شجرة عناصر: النصوص والتلميحات والاتجاه. */
    public static void apply(View root) {
        if (root == null) return;
        Context c = root.getContext();
        if (c == null) return;
        root.setLayoutDirection(direction(c));
        if (!isEnglish(c)) return;
        walk(root);
    }

    public static void apply(Activity a) {
        if (a != null) apply(a.getWindow() != null ? a.getWindow().getDecorView() : null);
    }

    public static void apply(Dialog d) {
        if (d != null && d.getWindow() != null) apply(d.getWindow().getDecorView());
    }

    private static void walk(View v) {
        // كثير من التصاميم تضع layoutDirection="rtl" صراحةً، وهي تتغلب على اتجاه الأب،
        // فنعيد ضبط الاتجاه على كل عنصر حتى تنقلب الشاشة كاملة في الإنجليزية.
        v.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        if (v instanceof TextView) {
            TextView tv = (TextView) v;
            CharSequence txt = tv.getText();
            if (txt != null && txt.length() > 0 && hasArabic(txt)) {
                String out = translate(txt.toString());
                if (!out.equals(txt.toString())) tv.setText(out);
            }
            CharSequence hint = tv.getHint();
            if (hint != null && hint.length() > 0 && hasArabic(hint)) {
                String out = translate(hint.toString());
                if (!out.equals(hint.toString())) tv.setHint(out);
            }
        }
        CharSequence cd = v.getContentDescription();
        if (cd != null && cd.length() > 0 && hasArabic(cd)) {
            String out = translate(cd.toString());
            if (!out.equals(cd.toString())) v.setContentDescription(out);
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) walk(g.getChildAt(i));
        }
    }

    private static boolean hasArabic(CharSequence s) {
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch >= 0x0600 && ch <= 0x06FF) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ القاموس
    private static final Map<String, String> MAP = new HashMap<>();

    private static void put(String ar, String en) { MAP.put(ar, en); }

    /** عبارات تُستبدل أينما وردت داخل النص، لا في أوله فقط (الأطول أولاً). */
    private static final String[] INLINE = {
            "قبل دقيقتين", "قبل دقيقة", "قبل ساعتين", "قبل ساعة", "قبل يومين", "قبل يوم",
            "منذ ثوانٍ", "دقائق", "دقيقة", "ساعات", "ساعة", "يوماً", "أيام", "قبل", "الآن",
            "مساءً", "صباحاً"
    };

    static {
        // الشاشات والتنقل
        put("مشغل الميزو", "ALmEz0 Player");
        put("مشغل الميزو - ALmEz0", "ALmEz0 Player");
        put("سيرفرات الميزو", "ALmEz0 Servers");
        put("سيرفرات الميزو - ALmEz0", "ALmEz0 Servers");
        put("الأفلام", "Movies");
        put("المسلسلات", "Series");
        put("البث المباشر", "Live TV");
        put("الأقسام", "Categories");
        put("المفضلة", "Favorites");
        put("المضافة حديثاً", "Recently added");
        put("المضاف حديثا", "Recently added");
        put("متابعة المشاهدة", "Continue watching");
        put("الكل", "All");
        put("بحث", "Search");
        put("نتائج البحث", "Search results");
        put("مسح البحث", "Clear search");
        put("عرض الكل", "View all");
        put("الرجوع", "Back");
        put("رجوع", "Back");
        put("الرجوع للرئيسية", "Back to home");
        put("الرجوع لكود السيرفر", "Back to server code");
        put("الصعود للأعلى", "Back to top");
        put("إغلاق", "Close");
        put("إلغاء", "Cancel");
        put("حفظ وتطبيق", "Save and apply");
        put("تراجع", "Undo");
        put("خيارات", "Options");
        put("الإعدادات", "Settings");
        put("تحديث", "Refresh");
        put("إعادة المحاولة", "Retry");
        put("إرسال", "Send");
        put("حذف", "Delete");
        put("تحذير", "Warning");
        put("نعم، خروج", "Yes, sign out");

        // الدخول والحساب
        put("تسجيل الدخول", "Sign in");
        put("تسجيل الخروج", "Sign out");
        put("اسم المستخدم", "Username");
        put("اسم المستخدم:", "Username:");
        put("اسم المستخدم: user123", "Username: user123");
        put("كلمة المرور", "Password");
        put("إظهار/إخفاء كلمة المرور", "Show / hide password");
        put("أدخل كود السيرفر للمتابعة", "Enter the server code to continue");
        put("مثال: 123", "Example: 123");
        put("إضافة سيرفر جديد", "Add a new server");
        put("السيرفر", "Server");
        put("الاتصال بالسيرفر", "Connecting to server");
        put("جارٍ الاتصال بالسيرفر", "Connecting to the server");
        put("قوائم التشغيل وتبديل السيرفر", "Playlists and switch server");
        put("قوائم التشغيل وسيرفراتي", "My playlists and servers");
        put("سيرفرات محفوظة", "saved servers");
        put("0 سيرفرات محفوظة", "0 saved servers");
        put("سيرفر مارفل", "Marvel server");
        put("تفعيل الحساب", "Activate account");
        put("حساب تجريبي", "Trial account");
        put("حساب نشط ✓", "Active account ✓");
        put("✓ الحساب النشط حالياً", "✓ Currently active account");
        put("تم حذف الحساب", "Account deleted");
        put("معلومات الحساب", "Account information");
        put("حالة الحساب", "Account status");
        put("الملف الشخصي", "Profile");
        put("متصل", "Online");
        put("الحد الأقصى للاتصالات", "Maximum connections");
        put("الاتصالات النشطة حالياً", "Active connections");
        put("تاريخ بدء الاشتراك", "Subscription start date");
        put("تاريخ انتهاء الاشتراك", "Subscription end date");
        put("غير محدود (دائم)", "Unlimited (permanent)");
        put("غير معروف", "Unknown");
        put("يرجى إدخال اسم المستخدم وكلمة المرور", "Please enter your username and password");
        put("يرجى إدخال كود السيرفر للمتابعة", "Please enter the server code to continue");
        put("بيانات الدخول غير صحيحة، يرجى التحقق من اسم المستخدم وكلمة المرور",
                "Incorrect sign-in details. Please check your username and password");
        put("كود السيرفر غير صحيح، يرجى التأكد من الكود والمحاولة مجدداً.",
                "Incorrect server code. Please check it and try again.");
        put("هل أنت متأكد أنك تريد تسجيل الخروج من السيرفر الحالي؟",
                "Are you sure you want to sign out of the current server?");
        put("اضغط مرة أخرى للخروج من التطبيق", "Press back again to exit");

        // المحتوى والتفاصيل
        put("القصة", "Storyline");
        put("المخرج:", "Director:");
        put("الممثلين:", "Cast:");
        put("★ التقييم:", "★ Rating:");
        put("★ التقييم: N/A", "★ Rating: N/A");
        put("الحلقات والمواسم", "Episodes and seasons");
        put("الحلقة", "Episode");
        put("· الحلقة", "· Episode");
        put("حلقة", "episode");
        put("حلقة كاملة", "full episode");
        put("الموسم", "Season");
        put("موسم", "season");
        put("موسم 1", "Season 1");
        put("الحلقة التالية", "Next episode");
        put("الحلقة السابقة", "Previous episode");
        put("هذه آخر حلقة في الموسم", "This is the last episode of the season");
        put("هذه أول حلقة في الموسم", "This is the first episode of the season");
        put("كل حلقات الموسم", "All episodes of the season");
        put("فيلم", "Movie");
        put("مسلسل", "Series");
        put("قناة مباشرة", "Live channel");
        put("صفحة الفيلم", "Movie page");
        put("صفحة المسلسل", "Series page");
        put("شاهد الآن", "Watch now");
        put("مشاهدة", "Watch");
        put("▶ تشغيل القناة", "▶ Play channel");
        put("مشاهدة الإعلان الترويجي", "Watch trailer");
        put("شاهد القنوات مباشرة", "Watch channels live");
        put("تصفح جميع الأفلام", "Browse all movies");
        put("تصفح المسلسلات والحلقات", "Browse series and episodes");
        put("أفلام رائجة للمشاهدة الآن", "Trending movies to watch now");
        put("مسلسلات رائجة للمشاهدة الآن", "Trending series to watch now");
        put("الأفلام الأكثر مشاهدة واختياراً", "Most watched movies");
        put("الأفلام الأكثر متابعة وتقييماً", "Top rated movies");
        put("المسلسلات الأكثر متابعة وتقييماً", "Top rated series");
        put("المسلسلات الأكثر مشاهدة واختياراً", "Most watched series");
        put("آخر القنوات المشاهدة", "Recently watched channels");
        put("اختيار نمط الجهاز ونظام التحكم", "Choose device mode and controls");
        put("لا يوجد وصف متاح لهذا الفيلم.", "No description available for this movie.");
        put("لا يوجد وصف متاح لهذا المسلسل.", "No description available for this series.");
        put("لا توجد عناصر في هذا القسم", "No items in this category");
        put("لا توجد نتائج مطابقة لبحثك", "No results match your search");
        put("جاري تحميل تفاصيل القصة...", "Loading storyline...");
        put("جاري تعريب القصة...", "Translating the storyline...");
        put("ابحث في جميع الأفلام والمسلسلات (الكل)...", "Search all movies and series...");
        put("ابحث في جميع القنوات...", "Search all channels...");
        put("LIVE مباشر", "LIVE");
        put("تمت الإضافة إلى المفضلة", "Added to favorites");
        put("تمت الإزالة من المفضلة", "Removed from favorites");

        // الترتيب والعرض
        put("الترتيب والعرض", "Sort and display");
        put("الترتيب الافتراضي", "Default order");
        put("الاسم (أ - ي)", "Name (A - Z)");
        put("الاسم (ي - أ)", "Name (Z - A)");
        put("أُضيفت", "Added");
        put("+ جديدة", "+ new");
        put("إخفاء أسماء القنوات والأفلام من الملصقات", "Hide channel and movie names on posters");

        // المشغل
        put("جودة الفيديو", "Video quality");
        put("الصوت واللغة", "Audio and language");
        put("الترجمة", "Subtitles");
        put("الأبعاد", "Aspect ratio");
        put("الأبعاد: 16:9 (عريضة)", "Aspect ratio: 16:9 (wide)");
        put("الأبعاد: 4:3 (تلفزيون)", "Aspect ratio: 4:3 (TV)");
        put("الأبعاد: أصلي (تناسب)", "Aspect ratio: original (fit)");
        put("الأبعاد: تكبير وقص (Zoom)", "Aspect ratio: zoom and crop");
        put("الأبعاد: تمديد كامل (Fill)", "Aspect ratio: fill");
        put("أصلي", "Original");
        put("تكبير", "Zoom");
        put("تمديد", "Stretch");
        put("السرعة (1x)", "Speed (1x)");
        put("السرعة (", "Speed (");
        put("· السرعة:", "· Speed:");
        put("من البداية ↺", "From the start ↺");
        put("تم الاستئناف من", "Resumed from");
        put("القناة التالية", "Next channel");
        put("القناة السابقة", "Previous channel");
        put("التالي:", "Next:");
        put("الآن:", "Now:");
        put("الآن", "Now");
        put("متوقف مؤقتاً", "Paused");
        put("انقطع الاتصال، إعادة المحاولة…", "Connection lost, retrying…");
        put("تم قفل الشاشة", "Screen locked");
        put("تم فتح قفل الشاشة", "Screen unlocked");
        put("لا توجد ترجمة لهذا الفيديو", "No subtitles for this video");
        put("رابط الفيديو غير صالح", "Invalid video link");
        put("حدث خطأ أثناء تشغيل الوسائط", "An error occurred while playing the media");
        put("خطأ في تشغيل الوسائط:", "Media playback error:");
        put("تعذر تشغيل الفيديو:", "Could not play the video:");
        put("تعذر استكمال البث من السيرفر", "Could not resume the stream from the server");
        put("تعذر فتح الرابط", "Could not open the link");
        put("تعذر فتح المصدر", "Could not open the source");
        put("لا يوجد تطبيق لتشغيل الإعلان على هذا الجهاز", "No app on this device can play the trailer");
        put("جاري البحث عن أجهزة البث المتاحة...", "Searching for available cast devices...");

        // التنزيلات
        put("التنزيل", "Download");
        put("تنزيل", "Download");
        put("التنزيلات", "Downloads");
        put("كل التنزيلات", "All downloads");
        put("تنزيل الحلقة", "Download episode");
        put("تنزيل الموسم", "Download season");
        put("تنزيل الموسم (", "Download season (");
        put("تقدّم تنزيل الأفلام والحلقات", "Movie and episode download progress");
        put("جاري التنزيل", "Downloading");
        put("تم التنزيل", "Downloaded");
        put("تم التنزيل — جاهز للمشاهدة بدون إنترنت", "Downloaded — ready to watch offline");
        put("في قائمة الانتظار", "Queued");
        put("في قائمة الانتظار بعده:", "Queued after it:");
        put("قيد التنزيل أو الانتظار", "Downloading or queued");
        put("منزّلة أو في قائمة التنزيل", "Downloaded or queued");
        put("الموسم منزّل بالكامل ✓", "Season fully downloaded ✓");
        put("إيقاف مؤقت", "Pause");
        put("استئناف", "Resume");
        put("إلغاء التنزيل", "Cancel download");
        put("حذف الملف", "Delete file");
        put("مكان الحفظ:", "Saved to:");
        put("التنزيلات الجديدة ستُحفظ في:", "New downloads will be saved to:");
        put("ذاكرة الجهاز", "Device storage");
        put("بطاقة الذاكرة الخارجية (SD)", "External SD card");
        put("· المساحة المتاحة:", "· Free space:");
        put("· المتبقي:", "· Remaining:");
        put("· متاح", "· available");
        put("الحجم:", "Size:");
        put("لا توجد تنزيلات بعد", "No downloads yet");
        put("اضغط زر التنزيل في صفحة أي فيلم أو حلقة لتشاهدها لاحقاً بدون إنترنت",
                "Press the download button on any movie or episode to watch it later offline");
        put("التنزيل يكمل في الخلفية حتى لو أغلقت هذه النافذة أو البرنامج",
                "The download continues in the background even if you close this window or the app");
        put("إخفاء — يكمل في الخلفية", "Hide — continues in the background");
        put("متوقف أثناء المشاهدة", "Paused while watching");
        put("· متوقف أثناء المشاهدة", "· paused while watching");
        put("متوقف أثناء المشاهدة — يكمل بعد إغلاق المشغل",
                "Paused while watching — resumes after the player closes");
        put("المساحة غير كافية على الجهاز", "Not enough space on the device");
        put("الملف غير موجود على الجهاز", "The file is not on the device");
        put("الملف غير موجود على السيرفر", "The file is not on the server");
        put("تعذّر حفظ الملف", "Could not save the file");
        put("ملف جاهز للمشاهدة بدون إنترنت (", "File ready to watch offline (");
        put("حلقة إلى التنزيل — تتنزل واحدة بعد الأخرى", "episodes queued — downloaded one after another");
        put("— تنزيل واحد في كل مرة حتى لا يحظر السيرفر الاتصال",
                "— one download at a time so the server does not block the connection");

        // أخطاء الاتصال
        put("تعذر الاتصال بالسيرفر، تأكد من الاتصال أو البيانات",
                "Could not connect to the server. Check your connection or details");
        put("تعذّر الاتصال بالسيرفر", "Could not connect to the server");
        put("تعذر تحميل المحتوى من السيرفر، تحقق من الاتصال وحاول مجدداً",
                "Could not load content from the server. Check your connection and try again");
        put("تعذر تحميل حلقات المسلسل", "Could not load the series episodes");
        put("تعذر التحديث - تُعرض آخر نسخة محفوظة", "Could not refresh — showing the last saved copy");
        put("تعذر تحديث باقة", "Could not refresh");
        put("تم تحديث باقة", "Updated");
        put("جاري تحديث الباقة...", "Refreshing...");
        put("جاري تحديث باقة", "Refreshing");
        put("، يرجى الانتظار...", ", please wait...");
        put("آخر تحديث:", "Last update:");
        put("السيرفر رفض التنزيل (", "The server refused the download (");
        put("خطأ من السيرفر (", "Server error (");
        put("فشل:", "Failed:");
        put("بنجاح (", "successfully (");

        // نمط الجهاز
        put("نمط الجهاز ونظام التحكم", "Device mode and controls");
        put("شاشة أندرويد / رسيفر", "Android TV / receiver");
        put("ريموت كنترول", "Remote control");
        put("شاشة لمس", "Touch screen");
        put("هاتف أو تابلت", "Phone or tablet");
        put("تفعيل النمط", "Apply mode");
        put("تم تفعيل", "Enabled");
        put("تم تفعيل نمط التلفزيون (ريموت كنترول)", "TV mode enabled (remote control)");
        put("تم تفعيل نمط اللمس (هاتف / تابلت)", "Touch mode enabled (phone / tablet)");
        put("✓ مفعّل حالياً", "✓ Currently active");

        // المساعد
        put("مساعد الميزو", "AI Assistant");
        put("مساعد الميزو الذكي ✨", "ALmEz0 AI Assistant ✨");
        put("يعرف محتوى سيرفرك ويبحث لك في الإنترنت عن المباريات والمعلومات",
                "Knows your server's content and searches the web for matches and information");
        put("اكتب سؤالك أو اضغط على الميكروفون للتحدث...", "Type your question or tap the microphone...");
        put("تحدث الآن واسأل مساعد الميزو...", "Speak now and ask the assistant...");
        put("تحدث بالصوت", "Voice input");
        put("سجل المحادثات", "Chat history");
        put("محادثة", "Conversation");
        put("مسح المحادثة", "Clear chat");
        put("حذف المحادثة", "Delete chat");
        put("لا توجد محادثات سابقة محفوظة", "No saved conversations");
        put("محادثة فارغة. كيف يمكنني مساعدتك؟ ✨", "Empty conversation. How can I help you? ✨");
        put("تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟ ✨", "Chat cleared. How can I help you now? ✨");
        put("بدأنا محادثة جديدة! 🎬⚽ تفضل بسؤالي عن أي فيلم، مسلسل، أو مواعيد المباريات.",
                "New chat started! 🎬⚽ Ask me about any movie, series, or match schedule.");
        put("المصادر:", "Sources:");
        put("عذراً، تعذر الوصول إلى المساعد الآن. تحقق من اتصال الإنترنت وحاول مجدداً.",
                "Sorry, the assistant is unreachable right now. Check your internet and try again.");
        put("لم يصلني رد مكتمل هذه المرة. جرّب إعادة صياغة السؤال أو أعد إرساله.",
                "I did not get a complete reply this time. Try rephrasing or send it again.");
        put("مساعد الميزو وصل للحد المسموح من الطلبات حالياً. أعد المحاولة بعد قليل. 🙏",
                "The assistant has reached its request limit right now. Please try again shortly. 🙏");
        put("ميزة الإدخال الصوتي غير مدعومة على هذا الجهاز", "Voice input is not supported on this device");
        put("اقترح لي أفضل فيلم سهرة أكشن...", "Suggest a great action movie for tonight...");
        put("اقترح لي فيلم سهرة ممتاز متوفر في سيرفري", "Suggest a great movie available on my server");
        put("ما هي أحدث المسلسلات المتوفرة في سيرفري؟", "What are the newest series on my server?");
        put("ما هي القنوات الرياضية المتوفرة في سيرفري؟", "Which sports channels are on my server?");
        put("ما هي أهم مباريات اليوم ومواعيدها والقنوات الناقلة لها؟",
                "What are today's key matches, their times and channels?");
        put("• متى مباراة ريال مدريد القادمة وعلى أي قناة؟", "• When is Real Madrid's next match and on which channel?");
        put("🎬 فيلم سهرة", "🎬 Movie night");
        put("⚽ مباريات الليلة", "⚽ Tonight's matches");
        put("🏆 القنوات الرياضية", "🏆 Sports channels");
        put("📺 أحدث المسلسلات", "📺 Newest series");

        // الإشعارات والوقت
        put("إشعارات وتحديثات سيرفرات الميزو", "ALmEz0 Servers notifications and updates");
        put("تنبيهات سيرفرات الميزو", "ALmEz0 Servers alerts");
        put("منذ ثوانٍ", "seconds ago");
        put("قبل دقيقة", "a minute ago");
        put("قبل دقيقتين", "two minutes ago");
        put("قبل ساعة", "an hour ago");
        put("قبل ساعتين", "two hours ago");
        put("قبل يوم", "a day ago");
        put("قبل يومين", "two days ago");
        put("قبل", "ago");
        put("دقيقة", "minute");
        put("دقائق", "minutes");
        put("ساعة", "hour");
        put("ساعات", "hours");
        put("أيام", "days");
        put("يوماً", "days");
        put("من", "of");
        put("صباحاً", "AM");
        put("مساءً", "PM");
        put("جميع الحقوق محفوظة © 2026", "All rights reserved © 2026");
        put("واتساب", "WhatsApp");
        put("فيسبوك", "Facebook");
        put("اتصال", "Call");

        // التصنيفات
        put("أكشن", "Action");
        put("مغامرة", "Adventure");
        put("كوميدي", "Comedy");
        put("دراما", "Drama");
        put("رعب", "Horror");
        put("إثارة وتشويق", "Thriller");
        put("جريمة", "Crime");
        put("غموض", "Mystery");
        put("رومانسي", "Romance");
        put("خيال علمي", "Sci-Fi");
        put("فانتازيا", "Fantasy");
        put("رسوم متحركة", "Animation");
        put("أنمي", "Anime");
        put("عائلي", "Family");
        put("وثائقي", "Documentary");
        put("تاريخي", "History");
        put("حرب", "War");
        put("غرب أمريكي", "Western");
        put("موسيقى", "Music");
        put("موسيقي", "Musical");
        put("رياضة", "Sport");
        put("سيرة ذاتية", "Biography");
        put("واقعي", "Reality");
        put("أخبار", "News");
        put("برنامج حواري", "Talk show");
        put("قصير", "Short");
    }
}
