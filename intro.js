/**
 * افتتاحية الميزو — نفس تصميم IntroActivity في تطبيق أندرويد حرفياً:
 * الشعار يظهر بتكبير وارتداد، وحلقتان خضراوان تتوسّعان وتتلاشيان، ثم الاسم، ثم شريط تقدّم
 * يمتلئ من اليمين لليسار، والمدة أقل من ثانيتين.
 *
 * نمطان كما في أندرويد:
 *   player : "مشغل الميزو"    عند الدخول إلى المشغل
 *   home   : "سيرفرات الميزو" عند فتح البرنامج وعند الخروج من المشغل
 *
 * تعمل في برنامج الكمبيوتر فقط (Electron)، فالموقع على المتصفح له افتتاحيته الخاصة.
 */
(function () {
    'use strict';

    if (window.MizoIntro) return;

    var DURATION = 1900;

    function isDesktopApp() {
        return !!(window.electronAPI && window.electronAPI.isElectron)
            || document.body.classList.contains('platform-electron');
    }

    function injectStyles() {
        if (document.getElementById('mizo-intro-styles')) return;
        var css = [
            '.mizo-intro{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;',
            'justify-content:center;background:#05070b;transition:opacity .22s ease,transform .22s ease}',
            '.mizo-intro.mizo-intro-out{opacity:0;transform:scale(1.06);pointer-events:none}',
            '.mizo-intro-content{display:flex;flex-direction:column;align-items:center}',
            '.mizo-intro-logo-box{position:relative;width:240px;height:240px;display:flex;',
            'align-items:center;justify-content:center}',
            '.mizo-intro-ring{position:absolute;width:170px;height:170px;border-radius:50%;',
            'border:2px solid rgba(34,197,94,.55);opacity:0;transform:scale(.6)}',
            '.mizo-intro-ring.r1{animation:mizoIntroPulse 1.1s .25s linear forwards}',
            '.mizo-intro-ring.r2{animation:mizoIntroPulse 1.1s .75s linear forwards}',
            '@keyframes mizoIntroPulse{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.55)}}',
            '.mizo-intro-logo{width:160px;height:160px;object-fit:contain;opacity:0;',
            'transform:scale(.4) rotate(-10deg);animation:mizoIntroLogo .75s cubic-bezier(.34,1.56,.64,1) forwards}',
            '@keyframes mizoIntroLogo{to{opacity:1;transform:scale(1) rotate(0)}}',
            // مكعب الميزو: أكبر قليلاً مع وهج أخضر نابض يناسب تصميمه
            '.mizo-intro-logo.mizo-intro-cube{width:190px;height:190px;',
            'filter:drop-shadow(0 0 22px rgba(52,240,138,.55));animation:mizoIntroLogo .75s cubic-bezier(.34,1.56,.64,1) forwards,',
            'mizoCubeGlow 2.4s .8s ease-in-out infinite}',
            '@keyframes mizoCubeGlow{0%,100%{filter:drop-shadow(0 0 18px rgba(52,240,138,.45))}',
            '50%{filter:drop-shadow(0 0 30px rgba(52,240,138,.85))}}',
            '.mizo-intro-title{margin-top:10px;font-size:46px;font-weight:900;color:#fff;opacity:0;',
            'transform:translateY(30px);text-shadow:0 0 18px rgba(34,197,94,.5);',
            'animation:mizoIntroRise .5s .45s cubic-bezier(.16,1,.3,1) forwards}',
            '.mizo-intro-sub{margin-top:6px;font-size:17px;font-weight:800;letter-spacing:.35em;',
            'color:#e5b935;opacity:0;transform:translateY(20px);',
            'animation:mizoIntroRise .5s .65s cubic-bezier(.16,1,.3,1) forwards}',
            '@keyframes mizoIntroRise{to{opacity:1;transform:translateY(0)}}',
            '.mizo-intro-track{margin-top:30px;width:280px;height:5px;border-radius:4px;',
            'background:rgba(255,255,255,.12);overflow:hidden}',
            '.mizo-intro-bar{display:block;width:100%;height:100%;border-radius:4px;transform-origin:right center;',
            'transform:scaleX(0);background:linear-gradient(90deg,#16a34a,#22c55e);',
            'animation:mizoIntroBar 1.45s .3s cubic-bezier(.4,0,.6,1) forwards}',
            '@keyframes mizoIntroBar{to{transform:scaleX(1)}}'
        ].join('');
        var st = document.createElement('style');
        st.id = 'mizo-intro-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    /**
     * عرض الافتتاحية ثم تنفيذ onDone بعد انتهائها.
     * @param {string} mode  'home' أو 'player'
     */
    /**
     * @param {string} mode  'home' أو 'player' أو 'server'
     * @param {object} [opts] للسيرفر: { logo, name }
     */
    function show(mode, onDone, opts, onStay) {
        var done = typeof onDone === 'function' ? onDone : function () { };
        opts = opts || {};

        injectStyles();
        var isServer = mode === 'server';
        var isHome = mode !== 'player';
        // افتتاحية المشغل تعرض مكعب الميزو، والصفحة الرئيسية شعار الموقع
        var logoSrc = isServer && opts.logo ? opts.logo : (isHome ? 'photo/logo.ico' : 'photo/mizo-cube.webp');
        var titleText = isServer ? (opts.name || 'جارٍ الاتصال') : (isHome ? 'سيرفرات الميزو' : 'مشغل الميزو');
        var subText = isServer ? 'جارٍ الاتصال بالسيرفر' : (isHome ? 'ALmEz0 SERVERS' : 'ALmEz0 PLAYER');
        // غطاء الإقلاع المرسوم في HTML يظهر مع أول بكسل، فنستعمله بدل إنشاء غطاء
        // بعد رسم الصفحة — وإلا ومضت البطاقات لجزء من الثانية قبل الافتتاحية.
        var overlay = document.getElementById('mizo-boot-overlay');
        if (overlay) {
            overlay.removeAttribute('id');
            overlay.className = 'mizo-intro';
        } else {
            overlay = document.createElement('div');
            overlay.className = 'mizo-intro';
        }
        overlay.innerHTML =
            '<div class="mizo-intro-content">' +
            '  <div class="mizo-intro-logo-box">' +
            '    <span class="mizo-intro-ring r1"></span>' +
            '    <span class="mizo-intro-ring r2"></span>' +
            '    <img class="mizo-intro-logo' + (isHome || isServer ? '' : ' mizo-intro-cube') + '" src="' + logoSrc + '" alt="ALmEz0" onerror="this.onerror=null;this.src=&quot;photo/mizo-cube.png&quot;">' +
            '  </div>' +
            '  <div class="mizo-intro-title">' + titleText + '</div>' +
            '  <div class="mizo-intro-sub">' + subText + '</div>' +
            '  <div class="mizo-intro-track"><span class="mizo-intro-bar"></span></div>' +
            '</div>';
        if (!overlay.parentNode) document.body.appendChild(overlay);

        setTimeout(function () {
            if (typeof onStay === 'function') { onStay(overlay); return; }
            overlay.classList.add('mizo-intro-out');
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                done();
            }, 240);
        }, DURATION);
    }

    /** إزالة غطاء الإقلاع فوراً حين لا نعرض افتتاحية، وإلا بقيت الشاشة سوداء. */
    function dismissBootOverlay() {
        var el = document.getElementById('mizo-boot-overlay');
        if (!el || !el.parentNode) return;
        el.style.transition = 'opacity .2s ease';
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }

    /**
     * افتتاحية فتح البرنامج: مرة واحدة في الجلسة كما في أندرويد.
     * إلا إذا وصلنا عبر navigate() — كالعودة من المشغل — فتطلب الافتتاحية صراحةً،
     * تماماً كـDashboardActivity.exitToHome في أندرويد التي تعرضها في كل خروج.
     */
    function showOnLaunch() {
        try {
            if (sessionStorage.getItem('mizo_launch_intro') === '1') { dismissBootOverlay(); return; }
            sessionStorage.setItem('mizo_launch_intro', '1');
        } catch (e) { }
        show('home');
    }

    /** الانتقال لصفحة أخرى بعد عرض الافتتاحية المناسبة. */
    /**
     * الانتقال لصفحة أخرى: لا نُخفي الغطاء قبل الانتقال، وإلا ظهرت الصفحة الحالية
     * لجزء من الثانية بين نهاية الافتتاحية وبداية تحميل الصفحة الجديدة.
     */
    function navigate(mode, url, opts) {
        show(mode, null, opts, function (overlay) {
            window.location.href = url;
        });
    }

    /**
     * الانتقال أولاً ثم عرض الافتتاحية في الصفحة الهدف، بلا أي وميض بينهما لأن
     * غطاء الإقلاع مرسوم في الصفحتين.
     *
     * يُستعمل للدخول إلى المشغل: نافذة إلكترون تدخل وضع ملء الشاشة عند انتهاء تحميل
     * player.html لا قبله، فلو عُرضت الافتتاحية في الصفحة السابقة لظهرت خارج ملء الشاشة.
     */
    function goDeferred(mode, url) {
        try { sessionStorage.setItem('mizo_intro_pending', mode); } catch (e) { }
        window.location.href = url;
    }

    /** تعرض الصفحة الحالية الافتتاحية المطلوبة إن وُجدت، وتُرجع true حينها. */
    function showPending() {
        var mode = null;
        try {
            mode = sessionStorage.getItem('mizo_intro_pending');
            if (mode) sessionStorage.removeItem('mizo_intro_pending');
        } catch (e) { }
        if (!mode) return false;
        show(mode);
        return true;
    }

    /** شاشة اتصال بشعار السيرفر عند الدخول إليه أو التبديل له. */
    function showServer(logo, name, onDone) {
        show('server', onDone, { logo: logo, name: name });
    }

    window.MizoIntro = {
        show: show,
        dismissBootOverlay: dismissBootOverlay,
        showOnLaunch: showOnLaunch,
        navigate: navigate,
        goDeferred: goDeferred,
        showPending: showPending,
        showServer: showServer,
        isDesktopApp: isDesktopApp
    };
})();
