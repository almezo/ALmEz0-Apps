/**
 * لغة مشغل الميزو: عربي (الافتراضي) أو إنجليزي.
 *
 * الترجمة تعمل على الصفحة نفسها: قاموس عربي ← إنجليزي يُطبَّق على النصوص والعناوين
 * والـplaceholder، ويتابع ما يضيفه المشغل لاحقاً (MutationObserver)، فلا حاجة لتعديل
 * مئات المواضع في splayer.js. وعند الإنجليزية ينقلب اتجاه الواجهة كلها إلى LTR،
 * بما في ذلك شريط التحكم في الفيديو وترتيب أزراره (انظر splayer.css: html[dir="ltr"]).
 *
 * أسماء الأقسام والقنوات والأفلام تأتي من سيرفر العميل ولا تُترجم، تبقى بلغتها.
 */
(function () {
    var KEY = 'mizo_player_lang';

    // ---------------------------------------------------------------- القاموس
    var DICT = {
        // الشاشات والتنقل
        'مشغل الميزو': 'ALmEz0 Player',
        'سيرفرات الميزو': 'ALmEz0 Servers',
        'سيرفرات الميزو - ALmEz0': 'ALmEz0 Servers',
        'ALmEz0 Player | مشغل الميزو': 'ALmEz0 Player',
        'الشاشة الرئيسية للمشغل': 'Player home',
        'الأفلام': 'Movies',
        'المسلسلات': 'Series',
        'القنوات': 'Channels',
        'البث المباشر': 'Live TV',
        'الأقسام': 'Categories',
        'المفضلة': 'Favorites',
        'المضافة حديثاً': 'Recently added',
        'المضاف حديثا': 'Recently added',
        'الترتيب': 'Sort',
        'الترتيب حسب :': 'Sort by:',
        'الافتراضي': 'Default',
        'أ-ي': 'A-Z',
        'ي-أ': 'Z-A',
        'عرض الكل': 'View all',
        'الرجوع': 'Back',
        'الرجوع للأعلى': 'Back to top',
        'الرجوع للرئيسية': 'Back to home',
        'إغلاق': 'Close',
        'إغلاق المشغل': 'Close player',
        'إغلاق والرجوع': 'Close and go back',
        'إغلاق ومسح البحث': 'Close and clear search',
        'خيارات': 'Options',
        'حفظ': 'Save',
        'الآن': 'Now',
        'تلقائي': 'Auto',
        'آخر تحديث:': 'Last update:',

        // البحث
        'بحث في الأفلام والمسلسلات': 'Search movies and series',
        'البحث في القنوات': 'Search channels',
        'ابحث في جميع الأفلام والمسلسلات (الكل)...': 'Search all movies and series...',
        'ابحث في جميع القنوات (الكل)...': 'Search all channels...',

        // الدخول والحساب
        'تسجيل الدخول': 'Sign in',
        'تسجيل الخروج': 'Sign out',
        'اسم المستخدم': 'Username',
        'كلمة المرور': 'Password',
        'إظهار/إخفاء كلمة المرور': 'Show / hide password',
        'إخفاء الاسم': 'Hide name',
        'السيرفر': 'Server',
        'الاتصال بالسيرفر': 'Connecting to server',
        'أدخل كود السيرفر للمتابعة': 'Enter the server code to continue',
        'مثال: 123': 'Example: 123',
        'إضافة سيرفر جديد': 'Add a new server',
        'قوائم التشغيل والسيرفرات': 'Playlists and servers',
        'قوائم التشغيل وتبديل السيرفر': 'Playlists and switch server',
        'الحسابات المحفوظة وتبديل السيرفر': 'Saved accounts and switch server',
        '0 سيرفرات محفوظة': '0 saved servers',

        // الملف الشخصي
        'الملف الشخصي': 'Profile',
        'معلومات الحساب': 'Account information',
        'حالة الحساب': 'Account status',
        'حساب نشط': 'Active account',
        'متصل': 'Online',
        'الحد الأقصى للاتصالات': 'Maximum connections',
        'الاتصالات النشطة حالياً': 'Active connections',
        'تاريخ بدء الاشتراك': 'Subscription start date',
        'تاريخ انتهاء الاشتراك': 'Subscription end date',

        // المحتوى
        'القصة': 'Storyline',
        'التقييم:': 'Rating:',
        'المخرج:': 'Director:',
        'الممثلين:': 'Cast:',
        'الحلقات والمواسم': 'Episodes and seasons',
        'شاهد الآن': 'Watch now',
        'شاهد القنوات مباشرة': 'Watch channels live',
        'اختر قناة للمشاهدة': 'Choose a channel to watch',
        'اسم القناة': 'Channel name',
        'جاري تشغيل القناة...': 'Starting channel...',
        'أفلام رائجة للمشاهدة الآن': 'Trending movies to watch now',
        'مسلسلات رائجة للمشاهدة الآن': 'Trending series to watch now',
        'الأفلام الأكثر مشاهدة واختياراً': 'Most watched movies',
        'المسلسلات الأكثر متابعة وتقييماً': 'Top rated series',
        'تصفح جميع الأفلام': 'Browse all movies',
        'تصفح المسلسلات والحلقات': 'Browse series and episodes',
        'تحديث الأفلام': 'Refresh movies',
        'تحديث المسلسلات': 'Refresh series',
        'تحديث البث المباشر': 'Refresh live TV',
        'الإعلان الترويجي': 'Trailer',
        'مشاهدة الإعلان الترويجي': 'Watch trailer',
        'ملء الشاشة / تصغير': 'Fullscreen / exit',

        // نمط الجهاز
        'نمط الجهاز ونظام التحكم': 'Device mode and controls',
        'نمط الجهاز ونظام التحكم (تلفزيون / لمس / كمبيوتر)': 'Device mode (TV / touch / desktop)',
        'اختيار نمط الجهاز ونظام التحكم': 'Choose device mode and controls',
        'للحصول على أفضل تجربة مشاهدة للمشغل': 'For the best viewing experience',
        'شاشة أندرويد أو رسيفر': 'Android TV or receiver',
        'ريموت كنترول': 'Remote control',
        'شاشة لمس': 'Touch screen',
        'هاتف أو تابلت': 'Phone or tablet',
        'كمبيوتر مكتبي أو لابتوب': 'Desktop or laptop',
        'ماوس وكيبورد': 'Mouse and keyboard',
        'تفعيل النمط': 'Apply mode',
        'تدوير الشاشة تلقائياً': 'Auto-rotate screen',
        'يرجى تدوير الهاتف بالعرض': 'Please rotate your phone to landscape',
        'تشغيل بمشغل أندرويد النيتف (ExoPlayer 60fps عتادي)': 'Play with the native Android player (ExoPlayer 60fps)',
        'OK القائمة': 'OK Menu',
        '▲▼ القنوات': '▲▼ Channels',

        'الإشعارات': 'Notifications',
        'لا توجد إشعارات خلال آخر 30 يوماً': 'No notifications in the last 30 days',
        'جديد': 'New',
        'فتح الرابط': 'Open link',
        'جاري جلب الإشعارات...': 'Loading notifications...',
        'تمت الإضافة إلى المفضلة': 'Added to favorites',
        'تمت الإزالة من المفضلة': 'Removed from favorites',
        'عذراً، المفضلة ممتلئة (الحد الأقصى 30)': 'Sorry, favorites are full (max 30)',
        'تم استكمال المشاهدة من حيث توقفت': 'Resumed from where you stopped',
        'تم تسجيل الخروج من السيرفر بنجاح': 'Signed out of the server successfully',
        'جاري التحديث...': 'Refreshing...',
        'جاري ترجمة القصة...': 'Translating the storyline...',
        'لا توجد قصة متاحة.': 'No storyline available.',
        'بيانات الحلقة غير صالحة': 'Invalid episode data',
        'جاري استكمال البث وتجاوز انقطاع التقديم...': 'Resuming the stream...',
        'جاري فتح الرابط في VLC Player...': 'Opening in VLC Player...',
        'جاري فتح الرابط في MX Player...': 'Opening in MX Player...',
        'جاري فتح الرابط في PotPlayer...': 'Opening in PotPlayer...',
        'حذف السيرفر': 'Delete server',
        'تنبيه أمني': 'Security notice',
        'حسناً، فهمت': 'OK, got it',
        // المساعد واللغة
        'مساعد الميزو': 'AI Assistant',
        'مساعد الميزو الذكي': 'ALmEz0 AI Assistant',
        'تغيير اللغة': 'Change language',
        'جميع الحقوق محفوظة © 2026': 'All rights reserved © 2026',
        'جميع الحقوق محفوظة &copy; 2026': 'All rights reserved © 2026'
    };

    // نصوص المشغل الديناميكية (رسائل وتنبيهات يبنيها splayer.js)
    var DICT_DYNAMIC = {
        'جاري التحميل...': 'Loading...',
        'جاري التحميل': 'Loading',
        'جاري تجهيز البث...': 'Preparing stream...',
        'جاري تجهيز الفيلم...': 'Preparing movie...',
        'لا توجد نتائج': 'No results',
        'لا توجد نتائج مطابقة': 'No matching results',
        'لا توجد عناصر': 'No items',
        'لا توجد قنوات': 'No channels',
        'لا توجد أفلام': 'No movies',
        'لا توجد مسلسلات': 'No series',
        'الموسم': 'Season',
        'الحلقة': 'Episode',
        'حلقة': 'Episode',
        'مواسم': 'Seasons',
        'حلقات': 'Episodes',
        'متابعة المشاهدة': 'Continue watching',
        'إضافة للمفضلة': 'Add to favorites',
        'إزالة من المفضلة': 'Remove from favorites',
        'تشغيل': 'Play',
        'إيقاف': 'Pause',
        'الصوت': 'Audio',
        'الترجمة': 'Subtitles',
        'الجودة': 'Quality',
        'السرعة': 'Speed',
        'حذف': 'Delete',
        'إلغاء': 'Cancel',
        'تأكيد': 'Confirm',
        'نعم': 'Yes',
        'لا': 'No',
        'خطأ': 'Error',
        'تنبيه': 'Notice',
        'تم': 'Done'
    };

    Object.keys(DICT_DYNAMIC).forEach(function (k) { if (!DICT[k]) DICT[k] = DICT_DYNAMIC[k]; });

    function norm(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    }

    var lookup = {};
    Object.keys(DICT).forEach(function (k) { lookup[norm(k)] = DICT[k]; });

    // ---------------------------------------------------------------- الحالة
    function current() {
        try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; }
    }

    function isEnglish() { return current() === 'en'; }

    /** ترجمة نص واحد: يعيد النص كما هو إن لم يكن في القاموس (أسماء الأفلام والقنوات مثلاً). */
    function t(text) {
        var n = norm(text);
        if (!n) return text;
        var hit = lookup[n];
        if (hit) return hit;
        // نص يحوي رقماً متغيراً: "5 حلقات" ← "5 Episodes"
        var m = n.match(/^(\d+)\s+(.+)$/);
        if (m && lookup[m[2]]) return m[1] + ' ' + lookup[m[2]];
        return text;
    }

    // ---------------------------------------------------------------- التطبيق على الصفحة
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };

    function translateNode(node) {
        if (node.nodeType === 3) {
            var out = t(node.nodeValue);
            if (out !== node.nodeValue && norm(out) !== norm(node.nodeValue)) {
                // نحافظ على المسافات المحيطة بالنص الأصلي
                node.nodeValue = node.nodeValue.replace(norm(node.nodeValue), norm(out));
            }
            return;
        }
        if (node.nodeType !== 1 || SKIP_TAGS[node.tagName]) return;
        ['title', 'placeholder', 'aria-label', 'alt', 'data-label'].forEach(function (attr) {
            var v = node.getAttribute && node.getAttribute(attr);
            if (!v) return;
            var tr = t(v);
            if (tr !== v) node.setAttribute(attr, tr);
        });
        for (var i = 0; i < node.childNodes.length; i++) translateNode(node.childNodes[i]);
    }

    var observer = null;

    function startObserver() {
        if (observer || !window.MutationObserver) return;
        observer = new MutationObserver(function (list) {
            if (!isEnglish()) return;
            for (var i = 0; i < list.length; i++) {
                var mu = list[i];
                for (var j = 0; j < mu.addedNodes.length; j++) translateNode(mu.addedNodes[j]);
                if (mu.type === 'characterData' && mu.target) translateNode(mu.target);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    /** يطبّق اللغة على الصفحة: الاتجاه والقاموس ومتابعة المحتوى الجديد. */
    function apply() {
        var en = isEnglish();
        var html = document.documentElement;
        html.setAttribute('lang', en ? 'en' : 'ar');
        html.setAttribute('dir', en ? 'ltr' : 'rtl');
        html.classList.toggle('lang-en', en);
        document.body && document.body.classList.toggle('lang-en', en);
        if (en) {
            translateNode(document.body || document.documentElement);
            startObserver();
        }
        updateButton();
    }

    // ---------------------------------------------------------------- زر اللغة
    function updateButton() {
        var btn = document.getElementById('mizoLangBtn');
        if (!btn) return;
        var en = isEnglish();
        btn.querySelector('.lang-btn-label').textContent = en ? 'العربية' : 'English';
        btn.title = en ? 'التبديل إلى العربية' : 'Switch to English';
    }

    function buildButton() {
        var btn = document.getElementById('mizoLangBtn');
        if (!btn) {
            var ai = document.getElementById('aiFloatingTrigger');
            if (!ai || !ai.parentNode) return;
            btn = document.createElement('button');
            btn.id = 'mizoLangBtn';
            btn.type = 'button';
            btn.className = 'lang-floating-trigger';
            btn.setAttribute('tabindex', '0');
            btn.innerHTML = '<span class="lang-btn-icon"><i class="fas fa-language"></i></span>' +
                '<span class="lang-btn-label">English</span>';
            ai.parentNode.insertBefore(btn, ai.nextSibling);
        }
        btn.onclick = function (e) {
            if (e) e.preventDefault();
            toggle();
        };
        updateButton();
    }

    /** تبديل اللغة: افتتاحية المشغل ثم إعادة تحميل الصفحة باللغة الجديدة. */
    function toggle() {
        var next = isEnglish() ? 'ar' : 'en';
        try { localStorage.setItem(KEY, next); } catch (e) { }
        try { apply(); } catch (e) { }
        var reload = function () { window.location.reload(); };
        try {
            if (window.MizoIntro && typeof window.MizoIntro.show === 'function') {
                window.MizoIntro.show('player', reload);
                setTimeout(reload, 2600);   // احتياط إن لم تُنهِ الافتتاحية نفسها
                return;
            }
        } catch (e) { }
        reload();
    }

    window.MizoLang = {
        get: current,
        isEnglish: isEnglish,
        t: t,
        apply: apply,
        toggle: toggle
    };

    // اللغة تُطبَّق قبل الرسم قدر الإمكان حتى لا تظهر العربية ثم تتبدّل
    apply();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { apply(); buildButton(); });
    } else {
        apply();
        buildButton();
    }
})();
