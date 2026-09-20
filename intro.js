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
            '.mizo-intro-title{margin-top:10px;font-size:46px;font-weight:900;color:#fff;opacity:0;',
            'transform:translateY(30px);text-shadow:0 0 18px rgba(34,197,94,.5);',
            'animation:mizoIntroRise .5s .45s cubic-bezier(.16,1,.3,1) forwards}',
            '.mizo-intro-sub{margin-top:6px;font-size:17px;font-weight:800;letter-spacing:.35em;',
            'color:#e5b935;opacity:0;transform:translateY(20px);',
            'animation:mizoIntroRise .5s .65s cubic-bezier(.16,1,.3,1) forwards}',
            '@keyframes mizoIntroRise{to{opacity:1;transform:translateY(0)}}',
            '.mizo-intro-track{margin-top:30px;width:280px;height:5px;border-radius:4px;',
            'background:rgba(255,255,255,.12);overflow:hidden}',
            '.mizo-intro-bar{width:100%;height:100%;border-radius:4px;transform-origin:right center;',
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
    function show(mode, onDone) {
        var done = typeof onDone === 'function' ? onDone : function () { };
        if (!isDesktopApp()) { done(); return; }

        injectStyles();
        var isHome = mode !== 'player';
        var overlay = document.createElement('div');
        overlay.className = 'mizo-intro';
        overlay.innerHTML =
            '<div class="mizo-intro-content">' +
            '  <div class="mizo-intro-logo-box">' +
            '    <span class="mizo-intro-ring r1"></span>' +
            '    <span class="mizo-intro-ring r2"></span>' +
            '    <img class="mizo-intro-logo" src="photo/logo.ico" alt="ALmEz0">' +
            '  </div>' +
            '  <div class="mizo-intro-title">' + (isHome ? 'سيرفرات الميزو' : 'مشغل الميزو') + '</div>' +
            '  <div class="mizo-intro-sub">' + (isHome ? 'ALmEz0 SERVERS' : 'ALmEz0 PLAYER') + '</div>' +
            '  <div class="mizo-intro-track"><span class="mizo-intro-bar"></span></div>' +
            '</div>';
        document.body.appendChild(overlay);

        setTimeout(function () {
            overlay.classList.add('mizo-intro-out');
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                done();
            }, 240);
        }, DURATION);
    }

    /** افتتاحية فتح البرنامج: مرة واحدة في الجلسة، كما في أندرويد. */
    function showOnLaunch() {
        if (!isDesktopApp()) return;
        try {
            if (sessionStorage.getItem('mizo_launch_intro') === '1') return;
            sessionStorage.setItem('mizo_launch_intro', '1');
        } catch (e) { }
        show('home');
    }

    /** الانتقال لصفحة أخرى بعد عرض الافتتاحية المناسبة. */
    function navigate(mode, url) {
        if (!isDesktopApp()) { window.location.href = url; return; }
        show(mode, function () { window.location.href = url; });
    }

    window.MizoIntro = {
        show: show,
        showOnLaunch: showOnLaunch,
        navigate: navigate,
        isDesktopApp: isDesktopApp
    };
})();
