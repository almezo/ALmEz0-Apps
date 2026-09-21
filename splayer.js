function getProxyUrl(url) {
    return url; // إرجاع الرابط الأصلي مباشرة بدون توجيه عبر البروكسي
}

// Landscape hint - only try once on fullscreen (non-blocking)
function tryLandscapeOnFullscreen() {
    try {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => { });
        }
    } catch (e) { }
}

// ترويض مشغل Video.js لتقبل كافة صيغ وتنسيقات الفيديو (مثل MKV و MP4 و WebM) دون رفضها برمز الخطأ 4
function patchVideoJsTech() {
    try {
        if (typeof videojs !== 'undefined' && videojs.getTech) {
            const Html5 = videojs.getTech('Html5');
            if (Html5 && !Html5._mizoPatched) {
                Html5._mizoPatched = true;
                const origCanPlaySource = Html5.canPlaySource;
                Html5.canPlaySource = function (srcObj, options) {
                    const type = (srcObj && srcObj.type) || '';
                    const src = (srcObj && srcObj.src) || '';
                    if (type.includes('matroska') || type.includes('mkv') || src.includes('.mkv') || type === 'video/mp4' || type.includes('webm')) {
                        return 'maybe';
                    }
                    return origCanPlaySource ? origCanPlaySource.call(this, srcObj, options) : 'maybe';
                };
                const origCanPlayType = Html5.canPlayType;
                Html5.canPlayType = function (type) {
                    if (type && (type.includes('matroska') || type.includes('mkv'))) {
                        return 'maybe';
                    }
                    return origCanPlayType ? origCanPlayType.call(this, type) : '';
                };
            }
        }
    } catch (e) {
        console.warn('patchVideoJsTech error:', e);
    }
}
patchVideoJsTech();

// ==========================================
// SMART VIEWPORT SCALE-TO-FIT ENGINE (1650x750 Base)
// ==========================================
let isVirtualKeyboardOpen = false;
let stableLandscapeWidth = 0;
let stableLandscapeHeight = 0;

document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches('input, textarea, select')) {
        isVirtualKeyboardOpen = true;
    }
});

document.addEventListener('focusout', (e) => {
    if (e.target && e.target.matches('input, textarea, select')) {
        isVirtualKeyboardOpen = false;
        setTimeout(applyAutoScaling, 150);
    }
});

function applyAutoScaling() {
    const scaler = document.getElementById('app-scaler');
    if (!scaler) return;

    // Prevent scaling distortion when mobile virtual keyboard is displayed
    if (isVirtualKeyboardOpen) return;

    let windowWidth = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || screen.width;
    let windowHeight = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || screen.height;

    const isTvMode = document.body.classList.contains('tv-device-mode');
    const isDesktopMode = document.body.classList.contains('desktop-device-mode');
    const isElectronPlatform = document.body.classList.contains('platform-electron') || (window.electronAPI && window.electronAPI.isElectron);

    // ارتفاع كانفاس التصميم الأساسي الذي كُتبت عليه كل قياسات الواجهة
    const BASE_CANVAS_HEIGHT = 750;

    // إصلاح جوهري: وضع الشاشة/الريسيفر (وكذلك نمط الكمبيوتر) كان يعرض الواجهة بمقاس 1:1 دائماً
    // بافتراض أن الشاشة كبيرة فعلاً. عند تفعيل وضع الشاشة يدوياً من هاتف حقيقي (ارتفاع ~390px)
    // كانت كل العناصر المصممة على كانفاس ارتفاعه 750px تظهر بضعف حجمها تقريباً وتتراكب.
    // الآن: العرض 1:1 يبقى فقط عندما تكون الشاشة كبيرة فعلاً بما يكفي؛ وإن كانت أصغر من الكانفاس
    // الأساسي يتم تصغيرها تلقائياً بنفس منطق وضع النقال، فتتطابق النسب في كل الأوضاع والأجهزة.
    const isNativeSizeCapable = windowHeight >= BASE_CANVAS_HEIGHT;

    // On TV Mode (Android TV / TV Boxes / Receivers) and PC (Desktop / Electron Platform): Full-Screen 100% Edge-to-Edge 1:1 display
    if (isNativeSizeCapable && (isTvMode || isDesktopMode || isElectronPlatform || (!document.body.classList.contains('touch-device-mode') && windowWidth >= 1024))) {
        scaler.style.transform = 'none';
        scaler.style.transformOrigin = 'initial';
        scaler.style.top = '0';
        scaler.style.left = '0';
        scaler.style.width = '100vw';
        scaler.style.height = '100vh';
        scaler.style.minWidth = '100vw';
        scaler.style.minHeight = '100vh';
        scaler.style.maxWidth = '100vw';
        scaler.style.maxHeight = '100vh';
        scaler.style.position = 'fixed';
        scaler.style.boxShadow = 'none';
        scaler.style.borderRadius = '0';
        return;
    }

    // Touch Mode (Smartphones & Tablets in Landscape):
    // نظام ذكي لحساب أبعاد الكانفاس المتكيفة بدقة مع نسبة عرض الشاشة لمنع الحواف السوداء نهائياً
    scaler.style.position = 'absolute';
    scaler.style.top = '50%';
    scaler.style.left = '50%';

    const isLandscape = windowWidth > windowHeight || (window.screen && window.screen.orientation && String(window.screen.orientation.type).includes('landscape'));

    let effectiveW = windowWidth;
    let effectiveH = windowHeight;

    if (isLandscape) {
        // استخدام أبعاد الوضع العرضي بدقة حتى لو كان المتصفح في منتصف التدوير
        effectiveW = Math.max(windowWidth, windowHeight);
        effectiveH = Math.min(windowWidth, windowHeight);

        if (effectiveW > stableLandscapeWidth) stableLandscapeWidth = effectiveW;
        if (effectiveH > stableLandscapeHeight) stableLandscapeHeight = effectiveH;

        // If height collapsed drastically (soft keyboard open but focusin was missed)
        if (stableLandscapeHeight > 0 && effectiveH < stableLandscapeHeight * 0.72) {
            effectiveH = stableLandscapeHeight;
        }
    } else {
        stableLandscapeWidth = 0;
        stableLandscapeHeight = 0;
    }

    const baseHeight = BASE_CANVAS_HEIGHT;
    // حساب النسبة العرضية الفعلية للشاشة لتفادي أي حواف سوداء تماماً على الشاشات العريضة والأجهزة اللوحية
    const rawAspect = (effectiveH > 0) ? (effectiveW / effectiveH) : (1650 / 750);
    const clampedAspect = Math.max(1.33, Math.min(2.45, rawAspect));
    const baseWidth = Math.round(baseHeight * clampedAspect);

    scaler.style.width = baseWidth + 'px';
    scaler.style.height = baseHeight + 'px';
    scaler.style.minWidth = baseWidth + 'px';
    scaler.style.minHeight = baseHeight + 'px';
    scaler.style.maxWidth = baseWidth + 'px';
    scaler.style.maxHeight = baseHeight + 'px';
    scaler.style.boxShadow = '0 0 60px rgba(0, 0, 0, 0.85)';

    // DO NOT scale above 1.0 to prevent inflating/magnifying elements on large or high-DPI displays
    const scale = Math.min(1.0, effectiveH / baseHeight);

    scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
    scaler.style.transformOrigin = 'center center';
}

if (window.AlMeZ0Screen && typeof window.AlMeZ0Screen.onChange === 'function') {
    window.AlMeZ0Screen.onChange(() => {
        applyAutoScaling();
    });
}

window.addEventListener('resize', applyAutoScaling);
window.addEventListener('orientationchange', () => {
    stableLandscapeWidth = 0;
    stableLandscapeHeight = 0;
    applyAutoScaling();
    setTimeout(applyAutoScaling, 100);
    setTimeout(applyAutoScaling, 250);
    setTimeout(applyAutoScaling, 500);
});
if (window.screen && window.screen.orientation && typeof window.screen.orientation.addEventListener === 'function') {
    window.screen.orientation.addEventListener('change', () => {
        stableLandscapeWidth = 0;
        stableLandscapeHeight = 0;
        applyAutoScaling();
        setTimeout(applyAutoScaling, 100);
        setTimeout(applyAutoScaling, 250);
        setTimeout(applyAutoScaling, 500);
    });
}
window.addEventListener('pageshow', () => {
    applyAutoScaling();
    setTimeout(applyAutoScaling, 150);
});
document.addEventListener('DOMContentLoaded', () => {
    initDeviceMode();
    patchVideoJsTech();
    applyAutoScaling();
    if (window.AlMeZ0App && window.AlMeZ0App.isNative) {
        if (typeof window.AlMeZ0App.lockLandscape === 'function') {
            window.AlMeZ0App.lockLandscape();
        }
        if (typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') {
            window.AlMeZ0App.setImmersiveFullscreen(true);
        }
    }
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initDeviceMode();
    patchVideoJsTech();
    applyAutoScaling();
    if (window.AlMeZ0App && window.AlMeZ0App.isNative && typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') {
        window.AlMeZ0App.setImmersiveFullscreen(true);
    }
}

// =========================================================
// DEVICE PROFILE ENGINE (TV Box / Receiver vs Phone vs PC)
// =========================================================
function initDeviceMode() {
    let mode = localStorage.getItem('mizo_device_mode');
    const ua = (navigator.userAgent || '').toLowerCase();
    const isElectronPlatform = document.body.classList.contains('platform-electron') || (window.AlMeZ0App && window.AlMeZ0App.isElectron) || ua.includes('electron');
    const isAndroidPlatform = document.body.classList.contains('platform-android') || (window.AlMeZ0App && window.AlMeZ0App.isAndroid) || ua.includes('android');
    const hasNativeTv = window.AndroidNativeBridge && typeof window.AndroidNativeBridge.isTvDevice === 'function' && window.AndroidNativeBridge.isTvDevice();
    const isAndroidNoTouch = isAndroidPlatform && (navigator.maxTouchPoints === 0 || (!('ontouchstart' in window) && !('msMaxTouchPoints' in navigator)));
    const isTv = hasNativeTv || isAndroidNoTouch || ua.includes('tv') || ua.includes('box') || ua.includes('smart') || ua.includes('large') || ua.includes('amlogic') || ua.includes('rockchip') || ua.includes('allwinner');

    if (isElectronPlatform || (!isAndroidPlatform && !('ontouchstart' in window) && window.innerWidth >= 1024)) {
        mode = 'desktop';
        localStorage.setItem('mizo_device_mode', 'desktop');
    } else if (isAndroidPlatform) {
        document.body.classList.add('platform-android');
        // في الأندرويد: مسموح بنمطين فقط (شاشة ورسيفر أو هاتف وتابلت) ولا وجود لنمط الكمبيوتر نهائياً
        if (mode === 'desktop' || !mode) {
            mode = isTv ? 'tv' : 'touch';
        }
    } else {
        if (!mode) mode = isTv ? 'tv' : 'touch';
    }


    applyDeviceMode(mode, false);
}

function applyDeviceMode(mode, showToast = false) {
    document.body.classList.remove('tv-device-mode', 'desktop-device-mode', 'touch-device-mode');
    document.body.classList.add(mode + '-device-mode');
    if (mode === 'tv') {
        document.body.classList.add('tv-mode');
    } else {
        document.body.classList.remove('tv-mode');
    }

    const iconMap = { tv: 'fa-tv', touch: 'fa-mobile-alt', desktop: 'fa-desktop' };
    const nameMap = { tv: 'شاشة أندرويد ورسيفر', touch: 'هاتف وتابلت (لمس)', desktop: 'كمبيوتر ولابتوب' };

    const navIcon = document.getElementById('navDeviceModeIcon');
    if (navIcon) navIcon.className = 'fas ' + (iconMap[mode] || 'fa-tv');

    const authName = document.getElementById('authDeviceModeName');
    if (authName) authName.innerText = nameMap[mode] || mode;

    const authIcon = document.getElementById('authDeviceModeIcon');
    if (authIcon) authIcon.className = 'fas ' + (iconMap[mode] || 'fa-tv');

    ['touch', 'tv', 'desktop'].forEach(m => {
        const card = document.getElementById('deviceCard' + m.charAt(0).toUpperCase() + m.slice(1));
        if (card) card.classList.toggle('active', m === mode);
    });

    applyAutoScaling();

    if (showToast && typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'تم تفعيل النمط بنجاح',
            text: `نمط التشغيل الحالي: ${nameMap[mode]}`,
            timer: 1800,
            showConfirmButton: false,
            background: '#151926',
            color: '#fff'
        });
    }
}

function selectDeviceMode(mode) {
    localStorage.setItem('mizo_device_mode', mode);
    localStorage.setItem('mizo_device_mode_manual', 'true');
    applyDeviceMode(mode, true);
    closeDeviceModeModal();
}

function openDeviceModeModal() {
    const isElectronPlatform = document.body.classList.contains('platform-electron') || (window.AlMeZ0App && window.AlMeZ0App.isElectron) || (navigator.userAgent || '').toLowerCase().includes('electron');
    const isAndroidPlatform = document.body.classList.contains('platform-android') || (window.AlMeZ0App && window.AlMeZ0App.isAndroid) || (navigator.userAgent || '').toLowerCase().includes('android');

    const cardTouch = document.getElementById('deviceCardTouch');
    const cardTv = document.getElementById('deviceCardTv');
    const cardDesktop = document.getElementById('deviceCardDesktop');

    if (isElectronPlatform || (!isAndroidPlatform && window.innerWidth >= 1024 && !('ontouchstart' in window))) {
        if (cardTouch) cardTouch.style.display = 'none';
        if (cardTv) cardTv.style.display = 'none';
        if (cardDesktop) cardDesktop.style.display = '';
    } else if (isAndroidPlatform) {
        if (cardDesktop) cardDesktop.style.display = 'none';
        if (cardTouch) cardTouch.style.display = '';
        if (cardTv) cardTv.style.display = '';
    }

    const modal = document.getElementById('deviceModeModal');
    if (modal) {
        modal.classList.remove('hidden');
        const mode = localStorage.getItem('mizo_device_mode') || 'touch';
        ['touch', 'tv', 'desktop'].forEach(m => {
            const card = document.getElementById('deviceCard' + m.charAt(0).toUpperCase() + m.slice(1));
            if (card) card.classList.toggle('active', m === mode);
        });
    }
}


function closeDeviceModeModal() {
    const modal = document.getElementById('deviceModeModal');
    if (modal) modal.classList.add('hidden');
}

// =========================================================
// LIVE TV REMOTE CONTROL & TUNING HELPERS (0-9, CH+/-, OSD)
// =========================================================
let tvNumberBuffer = '';
let tvNumberTimer = null;
let tvOsdTimer = null;

function playAdjacentLiveChannel(direction) {
    if (!currentItemsArray || !currentItemsArray.length || !currentStreamInfo) return;
    const curId = String(currentStreamInfo.id);
    const curIndex = currentItemsArray.findIndex(item => String(item.stream_id || item.num) === curId);
    let nextIndex = 0;
    if (curIndex !== -1) {
        nextIndex = curIndex + direction;
        if (nextIndex < 0) nextIndex = currentItemsArray.length - 1;
        if (nextIndex >= currentItemsArray.length) nextIndex = 0;
    }
    const target = currentItemsArray[nextIndex];
    if (target) {
        playStream(target.stream_id, 'live', 'm3u8', target.name, target.stream_icon);
        showTvLiveOsd(target.name, target.stream_icon);
    }
}

function handleTvNumericKey(digit) {
    tvNumberBuffer += String(digit);
    const overlay = document.getElementById('tvChannelNumberOverlay');
    const textEl = document.getElementById('tvChannelNumberText');
    if (overlay && textEl) {
        textEl.innerText = tvNumberBuffer;
        overlay.classList.remove('hidden');
    }
    clearTimeout(tvNumberTimer);
    tvNumberTimer = setTimeout(() => {
        const targetNum = parseInt(tvNumberBuffer, 10);
        tvNumberBuffer = '';
        if (overlay) overlay.classList.add('hidden');
        if (isNaN(targetNum) || !currentItemsArray || !currentItemsArray.length) return;
        let target = currentItemsArray.find(item => item.num === targetNum || String(item.stream_id) === String(targetNum));
        if (!target && targetNum >= 1 && targetNum <= currentItemsArray.length) {
            target = currentItemsArray[targetNum - 1];
        }
        if (target) {
            playStream(target.stream_id, 'live', 'm3u8', target.name, target.stream_icon);
            showTvLiveOsd(target.name, target.stream_icon);
        }
    }, 1200);
}

function showTvLiveOsd(name, icon) {
    const osd = document.getElementById('tvLiveOsdBar');
    if (!osd) return;
    const nameEl = document.getElementById('tvOsdChannelName');
    const iconEl = document.getElementById('tvOsdChannelIcon');
    const catEl = document.getElementById('tvOsdCategoryName');
    if (nameEl) nameEl.innerText = name || 'Live Channel';
    if (iconEl) iconEl.src = icon || 'photo/logo.ico';
    const activeCat = document.querySelector('#liveCategories .list-item.active .cat-name');
    if (catEl && activeCat) catEl.innerText = activeCat.innerText;
    osd.classList.remove('hidden');
    clearTimeout(tvOsdTimer);
    tvOsdTimer = setTimeout(() => {
        osd.classList.add('hidden');
    }, 3500);
}

/**
 * قائمة التشغيل الجارية (قنوات القسم أو حلقات الموسم) وأزرار التالي/السابق في شريط المشغل،
 * مثل btn_next_item و btn_prev_item في مشغل أندرويد.
 */
window.mizoQueue = null;

function mizoSetQueue(kind, items, index) {
    if (!items || items.length < 2 || index < 0) { window.mizoQueue = null; return; }
    window.mizoQueue = { kind: kind, items: items.slice(), index: index };
}

function mizoPlayAdjacent(delta) {
    const q = window.mizoQueue;
    if (!q) return;
    let i = q.index + delta;
    if (q.kind === 'live') {
        // القنوات تدور: بعد الأخيرة نعود للأولى
        if (i < 0) i = q.items.length - 1;
        if (i >= q.items.length) i = 0;
    } else if (i < 0 || i >= q.items.length) {
        if (typeof showToast === 'function') {
            showToast(delta > 0 ? 'هذه آخر حلقة في الموسم' : 'هذه أول حلقة في الموسم', 'info');
        }
        return;
    }
    q.index = i;
    const it = q.items[i];
    if (q.kind === 'live') {
        playStream(it.stream_id, 'live', 'm3u8', it.name, it.stream_icon);
        if (typeof showTvLiveOsd === 'function') showTvLiveOsd(it.name, it.stream_icon);
    } else {
        playStream(it.id, 'series', it.ext || 'mp4', it.title, it.cover);
    }
}

/** حقن زرّي السابق والتالي في شريط تحكم المشغل بعد جهوزيته. */
function mizoInstallQueueButtons() {
    const bar = document.querySelector('.video-js .vjs-control-bar');
    if (!bar) return;
    const q = window.mizoQueue;
    const existing = bar.querySelectorAll('.mizo-queue-btn');
    if (!q) { existing.forEach(b => b.remove()); return; }
    const isLive = q.kind === 'live';
    const labels = isLive
        ? { prev: 'القناة السابقة', next: 'القناة التالية' }
        : { prev: 'الحلقة السابقة', next: 'الحلقة التالية' };
    if (existing.length === 2) {
        existing[0].title = labels.prev;
        existing[1].title = labels.next;
        return;
    }
    existing.forEach(b => b.remove());
    const make = (dir, title, icon, order) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vjs-control mizo-queue-btn mizo-queue-' + dir;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.style.order = order;
        // زر مكتوب بالنص مثل btn_next_item في أندرويد، لا أيقونة تختلط بأزرار التقديم
        b.innerHTML = '<i class="fas ' + icon + '"></i><span class="mizo-queue-text">' + title + '</span>';
        b.onclick = () => mizoPlayAdjacent(dir === 'next' ? 1 : -1);
        return b;
    };
    // ترتيب 8 و9: الوقت الحالي 5 والفاصل 6 والمدة 7، فكان 6 و7 يضعان الزرّين بين
    // عدّادي الوقت. الآن يأتيان بعد المدة مباشرة وقبل بقية الأزرار.
    bar.appendChild(make('prev', labels.prev, 'fa-backward-step', 8));
    bar.appendChild(make('next', labels.next, 'fa-forward-step', 9));
}

function playCurrentLiveNative() {
    if (!currentStreamInfo || currentStreamInfo.type !== 'live') return;
    const host = getBestHost();
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const ext = currentStreamInfo.extension || 'm3u8';
    const streamUrl = `${host}/live/${user}/${pass}/${currentStreamInfo.id}.${ext}`;
    const isTv = document.body.classList.contains('tv-device-mode') ||
                 (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.isTvDevice === 'function' && window.AndroidNativeBridge.isTvDevice());

    // إيقاف تشغيل الفيديو في متصفح الويب الداخلي مؤقتاً لتوفير موارد الرام والمعالج أثناء تشغيل مشغل ExoPlayer الأصيل
    if (window.vjsPlayer) {
        try { window.vjsPlayer.pause(); } catch (e) { }
    }
    const videoTag = document.querySelector('#livePlayerWrapper video');
    if (videoTag) {
        try { videoTag.pause(); } catch (e) { }
    }

    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.playNativeVideo === 'function') {
        window.AndroidNativeBridge.playNativeVideo(streamUrl, currentStreamInfo.name, currentStreamInfo.icon || '', true, isTv);
    } else if (window.AlMeZ0App && typeof window.AlMeZ0App.playNativeVideo === 'function') {
        window.AlMeZ0App.playNativeVideo(streamUrl, currentStreamInfo.name, currentStreamInfo.icon || '', true, isTv);
    }
}

const state = {
    serverCode: '',
    hostUrls: [],
    currentHostIndex: 0,
    username: '',
    password: '',
    userInfo: null,
    activeTab: 'dashboard'
};

// ==========================================
// FORCE LANDSCAPE INTERACTION
// ==========================================
function initForceLandscapeButton() {
    const btn = document.getElementById('forceLandscapeBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            if (window.AlMeZ0App && typeof window.AlMeZ0App.lockLandscape === 'function') {
                const locked = await window.AlMeZ0App.lockLandscape();
                if (locked) return;
            }
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
                return;
            }
        } catch (e) {
        }

        try {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
                await docEl.requestFullscreen();
            } else if (docEl.webkitRequestFullscreen) {
                await docEl.webkitRequestFullscreen();
            } else if (docEl.mozRequestFullScreen) {
                await docEl.mozRequestFullScreen();
            } else if (docEl.msRequestFullscreen) {
                await docEl.msRequestFullscreen();
            }

            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => { });
            }
        } catch (err) {
            console.warn('Fullscreen/Orientation request error:', err);
        }
    });
}

let isPlayerSessionInitialized = false;
function initPlayerSession() {
    if (isPlayerSessionInitialized) return;
    isPlayerSessionInitialized = true;

    initForceLandscapeButton();
    if (typeof initScrollTopListener === 'function') {
        initScrollTopListener();
    }

    // تحديث شارة الحسابات المحفوظة
    if (typeof updateSavedAccountsBadge === 'function') {
        updateSavedAccountsBadge();
    }

    // التحقق فقط مما إذا كان المستخدم مسجل الدخول بالكامل (لديه جلسة نشطة)
    let storedUser = localStorage.getItem('sp_user') || sessionStorage.getItem('sp_user');
    let storedHost = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    let storedPass = localStorage.getItem('sp_pass') || sessionStorage.getItem('sp_pass');

    const isExplicitlyLoggedOut = localStorage.getItem('sp_logged_out') === 'true';

    // محاولة الاستعادة من آخر حساب نشط في قوائم التشغيل إن لم تكن المفاتيح المباشرة موجودة (فقط إذا لم يكن مسجلاً خروجه يدوياً)
    if (!isExplicitlyLoggedOut && (!storedUser || !storedHost || !storedPass)) {
        const activeAccId = localStorage.getItem('sp_active_acc_id');
        const savedAccounts = typeof getSavedAccounts === 'function' ? getSavedAccounts() : [];
        if (activeAccId && savedAccounts.length > 0) {
            const acc = savedAccounts.find(a => a.id === activeAccId);
            if (acc && acc.userInfo && acc.host && acc.password) {
                storedUser = JSON.stringify(acc.userInfo);
                storedHost = acc.host;
                storedPass = acc.password;
                localStorage.setItem('sp_user', storedUser);
                localStorage.setItem('sp_host', storedHost);
                localStorage.setItem('sp_pass', storedPass);
                localStorage.setItem('sp_server_code', acc.serverCode || '001');
                localStorage.setItem('sp_server_info', JSON.stringify({ name: acc.serverName, logo: acc.serverLogo }));
                localStorage.setItem('sp_active_acc_id', acc.id);
            }
        }
    }

    if (storedUser && storedHost && storedPass) {
        try {
            state.userInfo = JSON.parse(storedUser);
        } catch (e) {
            state.userInfo = {};
        }
        state.username = (state.userInfo && state.userInfo.username) || '';
        state.password = storedPass;
        state.hostUrls = [storedHost];
        state.host = storedHost;
        state.serverCode = localStorage.getItem('sp_server_code') || sessionStorage.getItem('sp_server_code') || '001';

        // مزامنة مع sessionStorage
        sessionStorage.setItem('sp_user', storedUser);
        sessionStorage.setItem('sp_host', storedHost);
        sessionStorage.setItem('sp_pass', storedPass);
        sessionStorage.setItem('sp_server_code', state.serverCode);

        const navUserEl = document.getElementById('navUsername');
        if (navUserEl) navUserEl.innerText = state.username;

        const navEl = document.getElementById('dashboard-nav');
        if (navEl) navEl.classList.remove('hidden');

        if (typeof updateActiveServerBanner === 'function') {
            updateActiveServerBanner();
        }

        // تسجيل جلسة المشغل النشطة للرادار الأمني ومركز الذكاء (مرة واحدة لكل جلسة)
        if (!sessionStorage.getItem('sp_session_logged') && typeof logActivity === 'function') {
            sessionStorage.setItem('sp_session_logged', '1');
            try {
                const srvInfo = JSON.parse(localStorage.getItem('sp_server_info') || sessionStorage.getItem('sp_server_info') || '{}');
                logActivity({
                    action: 'iptv_player_session',
                    category: 'iptv',
                    severity: 'info',
                    title: `جلسة نشطة في مشغل الميزو: ${state.username}`,
                    details: { server: srvInfo.name || state.serverCode || 'سيرفر IPTV', username: state.username }
                });
            } catch (e) { }
        }

        // إذا كان مسجلاً مسبقاً، اذهب مباشرة للرئيسية
        showScreen('dashboard-screen');
    } else {
        // إذا لم يكن مسجلاً، اجعل البداية دائماً وأبداً من شاشة إدخال كود السيرفر (الخطوة الأولى)
        sessionStorage.removeItem('sp_server_code');
        sessionStorage.removeItem('sp_host_urls');
        sessionStorage.removeItem('sp_server_info');
        if (typeof updateSavedAccountsBadge === 'function') {
            updateSavedAccountsBadge();
        }
        showScreen('auth1-screen');
    }

    // ربط الأزرار الأساسية
    const connectBtn = document.getElementById('btnConnectServer');
    if (connectBtn) {
        connectBtn.onclick = handleServerCode;
        connectBtn.addEventListener('click', handleServerCode);
    }

    const loginBtn = document.getElementById('btnLogin');
    if (loginBtn) {
        loginBtn.onclick = handleLogin;
        loginBtn.addEventListener('click', handleLogin);
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initPlayerSession();
} else {
    document.addEventListener('DOMContentLoaded', initPlayerSession);
}
window.addEventListener('load', initPlayerSession);

let currentScreenId = null;
let isInitialRoute = true;

function showScreen(screenId, isBackNavigation = false) {
    // حماية أمنية ومنع أخطاء التوجيه: إذا كان المستخدم غير مسجل الدخول، امنع فتح أي شاشة سوى شاشات الدخول
    const isAuthed = !!(state.username || (localStorage.getItem('sp_user') && !localStorage.getItem('sp_logged_out')) || sessionStorage.getItem('sp_user'));
    if (!isAuthed && screenId !== 'auth1-screen' && screenId !== 'auth2-screen') {
        screenId = 'auth1-screen';
    }

    if (currentScreenId === 'live-screen' && screenId !== 'live-screen') {
        closeLivePlayer(false);
    }

    if (!isBackNavigation && currentScreenId !== screenId) {
        if (screenId !== 'auth1-screen' && screenId !== 'auth2-screen') {
            const stateObj = { screenId: screenId, tab: state.activeTab };
            if (isInitialRoute || currentScreenId === 'auth1-screen' || currentScreenId === 'auth2-screen') {
                history.replaceState(stateObj, '', window.location.href);
                isInitialRoute = false;
            } else {
                history.pushState(stateObj, '', window.location.href);
            }
        }
    }

    currentScreenId = screenId;
    document.documentElement.classList.remove('has-active-player-session');
    if (screenId !== 'auth1-screen') {
        sessionStorage.setItem('sp_current_screen', screenId);
    }
    if (screenId === 'dashboard-screen') {
        sessionStorage.setItem('sp_current_tab', 'dashboard');
        if (typeof updateActiveServerBanner === 'function') {
            updateActiveServerBanner();
        }
        // يعمل التحديث التلقائي المتسلسل عند الدخول للمشغل فقط ولا يتكرر عند التنقل الداخلي بين الباقات
        if (!window.hasPlayerInitialSyncRun && typeof runSequentialAutoSync === 'function') {
            window.hasPlayerInitialSyncRun = true;
            runSequentialAutoSync();
        } else if (typeof updateCardTimestamps === 'function') {
            updateCardTimestamps();
        }
    }

    document.querySelectorAll('.app-screen-container').forEach(el => {
        if (el.id === screenId) {
            el.classList.remove('hidden');
            el.inert = false;
            el.removeAttribute('aria-hidden');
            el.removeAttribute('tabindex');
        } else {
            el.classList.add('hidden');
            el.inert = true;
            el.setAttribute('aria-hidden', 'true');
            el.setAttribute('tabindex', '-1');
            // إزالة التركيز من أي عنصر داخل الشاشة المخفية لمنع تسرب أحداث لوحة المفاتيح
            if (document.activeElement && el.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        targetScreen.inert = false;
        targetScreen.removeAttribute('aria-hidden');
    }
    if (typeof syncModalInertState === 'function') {
        syncModalInertState();
    }

    // إخفاء زر الصعود للأعلى نهائياً عند الانتقال لأي شاشة
    const scrollTopBtn = document.getElementById('btnScrollTop');
    if (scrollTopBtn) scrollTopBtn.classList.add('hidden');

    // إخفاء زر مساعد الميزو الذكي في شاشات تسجيل الدخول والفرعية وإظهاره حصرياً في شاشة الداشبورد
    const aiFloatingBtn = document.getElementById('aiFloatingTrigger');
    if (aiFloatingBtn) {
        if (screenId === 'dashboard-screen') {
            aiFloatingBtn.classList.remove('hidden');
            aiFloatingBtn.style.display = 'inline-flex';
        } else {
            aiFloatingBtn.classList.add('hidden');
            aiFloatingBtn.style.display = 'none';
        }
    }

    // تفعيل التركيز التلقائي للريموت في وضع التلفزيون عند الانتقال لأي شاشة
    const isTvMode = document.body.classList.contains('tv-device-mode');
    // التركيز التلقائي للريموت لا يعمل ما دام المستخدم يستعمل الماوس، وإلا ظهر الإطار بلا سبب
    if (isTvMode && window.__mizoKeyboardNav && typeof setFocus === 'function') {
        setTimeout(() => {
            if (screenId === 'dashboard-screen') {
                const liveCard = document.getElementById('cardLive');
                if (liveCard) setFocus(liveCard);
            } else if (screenId === 'auth1-screen') {
                const sCode = document.getElementById('serverCode');
                if (sCode) setFocus(sCode);
            } else if (screenId === 'auth2-screen') {
                const uInp = document.getElementById('username');
                if (uInp) setFocus(uInp);
            } else if (screenId === 'live-screen') {
                const firstCat = document.querySelector('#liveCategories .list-item.active') || document.querySelector('#liveCategories .list-item');
                if (firstCat) setFocus(firstCat);
            } else if (screenId === 'vod-screen') {
                const firstCat = document.querySelector('#vodCategories .list-item.active') || document.querySelector('#vodCategories .list-item');
                if (firstCat) setFocus(firstCat);
            }
        }, 140);
    }

    // Toggle Navbar visibility based on screen
    const nav = document.getElementById('dashboard-nav');
    if (nav) {
        if (screenId === 'auth1-screen' || screenId === 'auth2-screen') {
            nav.classList.add('hidden');
        } else {
            nav.classList.remove('hidden');

            const isDashboard = (screenId === 'dashboard-screen');
            const isProfile = (screenId === 'profile-screen');
            document.body.classList.toggle('screen-is-dashboard', isDashboard);

            // Make nav-right container always visible so navReturnBtn is always accessible
            const navRight = nav.querySelector('.nav-right');
            if (navRight) {
                navRight.style.display = '';
            }

            // Hide/Show secondary action buttons (refresh, profile, logout, accounts, device mode)
            const refreshBtn = document.getElementById('navRefreshBtn');
            const profileBtn = document.getElementById('navProfileBtn');
            const logoutBtn = document.getElementById('navLogoutBtn');
            const accountsBtn = document.getElementById('navAccountsBtn');
            const deviceModeBtn = document.getElementById('navDeviceModeBtn');

            if (refreshBtn) refreshBtn.style.display = isDashboard ? '' : 'none';
            if (profileBtn) profileBtn.style.display = isDashboard ? '' : 'none';
            if (logoutBtn) logoutBtn.style.display = isDashboard ? '' : 'none';
            if (accountsBtn) accountsBtn.style.display = isDashboard ? '' : 'none';
            if (deviceModeBtn) deviceModeBtn.style.display = isDashboard ? '' : 'none';

            // Toggle Return Button (Home on Dashboard -> index.html, Arrow on other screens -> goBack to Dashboard)
            const returnBtn = document.getElementById('navReturnBtn');
            if (returnBtn) {
                returnBtn.style.display = '';
                if (isDashboard) {
                    returnBtn.href = 'index.html';
                    returnBtn.onclick = null;
                    returnBtn.title = 'الرجوع للموقع الرئيسي';
                    returnBtn.innerHTML = '<i class="fas fa-home"></i>';
                } else {
                    returnBtn.href = '#';
                    returnBtn.onclick = (e) => {
                        if (e) e.preventDefault();
                        goBack();
                    };
                    returnBtn.title = 'الرجوع للشاشة الرئيسية للمشغل';
                    returnBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
                }
            }
        }
    }

    // Reset specific elements based on screen
    if (screenId === 'live-screen' && !isBackNavigation && !currentStreamInfo) {
        document.getElementById('livePlayerWrapper').innerHTML = '<div class="empty-state">Select a channel to watch</div>';
        const topHeader = document.getElementById('playerTopHeader');
        if (topHeader) topHeader.classList.add('hidden');
    }
    if (screenId === 'profile-screen') {
        loadProfileData();
    }
    if (screenId === 'vod-screen') {
        const savedScroll = sessionStorage.getItem('sp_vod_scroll_pos');
        if (savedScroll) {
            const scrollEl = getScrollTarget('vod');
            if (scrollEl) {
                setTimeout(() => {
                    scrollEl.scrollTop = parseInt(savedScroll, 10) || 0;
                }, 30);
            }
        }
    }

    applyAutoScaling();
}

function backToAuth1() {
    sessionStorage.removeItem('sp_fixed_host');
    sessionStorage.removeItem('sp_current_screen');
    const uInput = document.getElementById('username');
    if (uInput) uInput.value = '';
    const pInput = document.getElementById('password');
    if (pInput) pInput.value = '';
    showScreen('auth1-screen');
}
window.backToAuth1 = backToAuth1;

function goBack() {
    if (currentScreenId === 'movie-details-screen' || currentScreenId === 'series-details-screen') {
        showScreen('vod-screen');
    } else if (currentScreenId === 'auth2-screen') {
        backToAuth1();
    } else {
        showScreen('dashboard-screen');
    }
}

// ==========================================
// ANDROID HARDWARE / GESTURE BACK BUTTON
// ==========================================
window.addEventListener('popstate', function (event) {
    const isAuthed = !!(state.username || (localStorage.getItem('sp_user') && !localStorage.getItem('sp_logged_out')) || sessionStorage.getItem('sp_user'));
    if (!isAuthed) {
        showScreen('auth1-screen', true);
        return;
    }

    const fullVideoModal = document.getElementById('fullscreenVideoModal');
    if (fullVideoModal && !fullVideoModal.classList.contains('hidden')) {
        if (!event.state || event.state.modal !== 'fullscreen') {
            closeFullscreenPlayer(true);
        }
    }

    if (event.state && event.state.modal === 'fullscreen') {
        return; // Modal state pushed, do nothing else.
    }

    const sortModal = document.getElementById('sortModal');
    if (sortModal && !sortModal.classList.contains('hidden')) {
        sortModal.classList.add('hidden');
    }

    if (event.state && event.state.screenId) {
        if (event.state.screenId !== 'movie-details-screen' && event.state.screenId !== 'series-details-screen') {
            sessionStorage.removeItem('sp_last_movie');
            sessionStorage.removeItem('sp_last_series');
        }
        let targetScreenId = event.state.screenId;
        if (targetScreenId === 'series-screen') {
            targetScreenId = 'vod-screen';
        }
        showScreen(targetScreenId, true);
    } else {
        showScreen('dashboard-screen', true);
    }
});

// ==========================================
// نوافذ التنبيه والتأكيد والإدخال بهوية الميزو
// ==========================================
// المشغل لا يحمّل ui.js، فكانت تنبيهاته تسقط إلى alert/confirm الافتراضية: في برنامج
// الكمبيوتر تظهر بتصميم ويندوز (حذف حساب من قوائم التشغيل مثلاً)، وفي أندرويد بتصميم النظام.
// هذه نسخة مكتفية بنفسها من نوافذ الموقع (نفس الألوان والشكل)، بلا مكتبة من الإنترنت،
// تعمل بالفأرة واللمس والكيبورد والريموت. لا تُعرَّف إن كانت نوافذ ui.js محمّلة.
(function () {
    const ICONS = {
        success: 'fa-circle-check', error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation', info: 'fa-circle-info', question: 'fa-circle-question'
    };
    const TITLES = { success: 'تم بنجاح', error: 'خطأ', warning: 'تنبيه', info: 'معلومة', question: 'تأكيد' };

    function guessType(message) {
        const s = String(message || '');
        if (/✅|بنجاح|^تم /.test(s)) return 'success';
        if (/خطأ|فشل|تعذر|غير صحيح/.test(s)) return 'error';
        return 'info';
    }

    function openDialog(opts) {
        return new Promise(function (resolve) {
            const type = opts.type || 'info';
            const overlay = document.createElement('div');
            overlay.className = 'mz-dlg-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            const box = document.createElement('div');
            box.className = 'mz-dlg-box mz-dlg-' + type;
            box.setAttribute('dir', 'rtl');

            const icon = document.createElement('i');
            icon.className = 'fas ' + (ICONS[type] || ICONS.info) + ' mz-dlg-icon';
            box.appendChild(icon);

            const title = document.createElement('h3');
            title.className = 'mz-dlg-title';
            title.textContent = opts.title || TITLES[type] || 'تنبيه';
            box.appendChild(title);

            const msg = document.createElement('p');
            msg.className = 'mz-dlg-message';
            msg.textContent = String(opts.message == null ? '' : opts.message);
            box.appendChild(msg);

            let input = null;
            if (opts.prompt) {
                input = document.createElement('input');
                input.className = 'mz-dlg-input';
                input.type = 'text';
                input.value = opts.defaultValue == null ? '' : String(opts.defaultValue);
                input.setAttribute('dir', 'auto');
                box.appendChild(input);
            }

            const buttons = document.createElement('div');
            buttons.className = 'mz-dlg-buttons';
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'mz-dlg-btn mz-dlg-ok' + (opts.danger ? ' mz-dlg-danger' : '');
            ok.textContent = opts.okText || 'حسناً';
            buttons.appendChild(ok);
            let cancel = null;
            if (opts.cancelText) {
                cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'mz-dlg-btn mz-dlg-cancel';
                cancel.textContent = opts.cancelText;
                buttons.appendChild(cancel);
            }
            box.appendChild(buttons);
            overlay.appendChild(box);

            const previouslyFocused = document.activeElement;
            let done = false;
            function close(result) {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.remove('visible');
                setTimeout(function () {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    try { if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus(); } catch (e) { }
                    resolve(result);
                }, 180);
            }
            const okValue = function () { return opts.prompt ? input.value : true; };
            const cancelValue = opts.prompt ? null : (opts.cancelText ? false : true);

            // الكيبورد والريموت: Enter للتأكيد، Escape/رجوع للإلغاء، والأسهم بين الزرين.
            // يُلتقط قبل محرك تنقل الريموت حتى لا تتسرب الأسهم للشاشة خلف النافذة.
            function onKey(e) {
                const k = e.key;
                if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || e.keyCode === 27) {
                    e.preventDefault(); e.stopPropagation(); close(cancelValue);
                } else if (k === 'Enter' || e.keyCode === 13) {
                    if (document.activeElement === cancel) return; // يُنفّذ الزر المُركَّز بضغطته
                    e.preventDefault(); e.stopPropagation(); close(okValue());
                } else if (/^Arrow(Left|Right|Up|Down)$/.test(k) || k === 'Tab') {
                    if (input && document.activeElement === input && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
                    e.preventDefault(); e.stopPropagation();
                    const order = [input, ok, cancel].filter(Boolean);
                    const i = order.indexOf(document.activeElement);
                    const back = k === 'ArrowUp' || k === 'ArrowRight' || (k === 'Tab' && e.shiftKey);
                    const next = order[(i + (back ? -1 : 1) + order.length) % order.length];
                    if (next) next.focus();
                }
            }
            ok.addEventListener('click', function () { close(okValue()); });
            if (cancel) cancel.addEventListener('click', function () { close(cancelValue); });
            overlay.addEventListener('click', function (e) { if (e.target === overlay) close(cancelValue); });
            document.addEventListener('keydown', onKey, true);

            document.body.appendChild(overlay);
            requestAnimationFrame(function () {
                overlay.classList.add('visible');
                const first = input || ok;
                try { first.focus(); if (input) input.select(); } catch (e) { }
            });
        });
    }

    if (typeof window.showAlert !== 'function') {
        window.showAlert = function (message, type, title) {
            return openDialog({ message: message, type: type || guessType(message), title: title });
        };
    }
    if (typeof window.showConfirm !== 'function') {
        window.showConfirm = function (message, opts) {
            opts = opts || {};
            return openDialog({
                message: message, type: opts.type || 'question', title: opts.title,
                okText: opts.okText || 'نعم، متأكد', cancelText: opts.cancelText || 'إلغاء', danger: opts.danger !== false
            });
        };
    }
    if (typeof window.showPrompt !== 'function') {
        window.showPrompt = function (message, defaultValue, title) {
            return openDialog({
                message: message, type: 'info', title: title || 'إدخال بيانات', prompt: true,
                defaultValue: defaultValue, okText: 'حفظ', cancelText: 'إلغاء'
            });
        };
    }
    // شبكة أمان: أي alert متبقٍّ (هنا أو في سكربت آخر) يظهر بهوية الميزو لا بتصميم النظام.
    // لا انتقال بعد أي alert في المشغل، فلا يضر أن النافذة لا توقف تنفيذ الكود.
    window.alert = function (message) { window.showAlert(message); };
})();

// ==========================================
// CUSTOM SWEETALERT2 POPUP & TOAST HELPERS
// ==========================================
function showAppAlert(text, icon = 'warning', title = '') {
    const defaultTitles = {
        error: 'خطأ',
        warning: 'تنبيه',
        success: 'تم بنجاح',
        info: 'معلومة'
    };
    if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
        return Swal.fire({
            title: title || defaultTitles[icon] || 'تنبيه',
            text: text,
            icon: icon,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#f4c242',
            background: '#141820',
            color: '#fff',
            customClass: {
                popup: 'almezo-swal-popup',
                confirmButton: 'almezo-swal-btn'
            }
        });
    } else {
        // SweetAlert من الإنترنت لم يُحمَّل: نافذة الميزو بدل تنبيه النظام الافتراضي
        return window.showAlert(text, icon, title || defaultTitles[icon]);
    }
}

function showToast(title, icon = 'success') {
    if (typeof Swal !== 'undefined' && typeof Swal.mixin === 'function') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true,
            background: '#141820',
            color: '#fff',
            iconColor: icon === 'success' ? '#4caf50' : '#f4c242'
        });
        Toast.fire({
            icon: icon,
            title: title
        });
    } else {
        // SweetAlert من الإنترنت لم يُحمَّل: كانت الرسالة تضيع بصمت. كبسولة بهوية الميزو بدلها.
        const old = document.querySelector('.mz-toast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'mz-toast mz-toast-' + (icon || 'info');
        t.setAttribute('role', 'status');
        t.textContent = String(title == null ? '' : title);
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('visible'));
        setTimeout(() => {
            t.classList.remove('visible');
            setTimeout(() => t.remove(), 250);
        }, 2600);
    }
}

// عرض إشعار داخلي عائم ومضيء داخل مشغل الفيديو مباشرة للأبعاد والترجمة
function showPlayerOsd(message, icon = 'fas fa-expand-arrows-alt', customTarget = null) {
    var target = customTarget ||
                 document.getElementById('livePlayerWrapper') ||
                 document.getElementById('mainPlayer') ||
                 document.querySelector('.video-js');

    if (!target) {
        if (typeof showToast === 'function') showToast(message, 'info');
        return;
    }

    var pill = target.querySelector('.vjs-player-osd-pill');
    if (!pill) {
        pill = document.createElement('div');
        pill.className = 'vjs-player-osd-pill';
        target.appendChild(pill);
    }

    pill.innerHTML = '<i class="' + icon + '" style="color: #22c55e;"></i> <span>' + message + '</span>';
    pill.classList.remove('show');
    void pill.offsetWidth;
    pill.classList.add('show');

    if (pill._osdTimeout) clearTimeout(pill._osdTimeout);
    pill._osdTimeout = setTimeout(function () {
        pill.classList.remove('show');
    }, 1900);
}

// ==========================================
// MULTI-ACCOUNT & PLAYLIST MANAGEMENT
// ==========================================

function getSavedAccounts() {
    try {
        const raw = localStorage.getItem('sp_accounts');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Error reading sp_accounts:', e);
        return [];
    }
}

function saveAccountToStorage(account) {
    let accounts = getSavedAccounts();
    const existingIdx = accounts.findIndex(a => 
        a.id === account.id || 
        (a.username && account.username && a.username.toLowerCase() === account.username.toLowerCase() && a.serverCode === account.serverCode)
    );
    if (existingIdx >= 0) {
        accounts[existingIdx] = { ...accounts[existingIdx], ...account };
    } else {
        accounts.unshift(account);
    }
    localStorage.setItem('sp_accounts', JSON.stringify(accounts));
    if (typeof updateSavedAccountsBadge === 'function') {
        updateSavedAccountsBadge();
    }
    return accounts;
}

async function deleteAccount(accId) {
    const accounts = getSavedAccounts();
    const target = accounts.find(a => a.id === accId);
    const targetName = target ? (target.serverName + ' (' + target.username + ')') : 'هذا السيرفر';

    // كانت confirm() الافتراضية: في برنامج الكمبيوتر تظهر بتصميم ويندوز
    const ok = await showConfirm(`هل أنت متأكد من رغبتك في حذف ${targetName} من قوائم التشغيل؟`, { title: 'حذف السيرفر' });
    if (!ok) return;

    const updated = accounts.filter(a => a.id !== accId);
    localStorage.setItem('sp_accounts', JSON.stringify(updated));
    if (typeof updateSavedAccountsBadge === 'function') {
        updateSavedAccountsBadge();
    }

    const activeId = localStorage.getItem('sp_active_acc_id');
    if (activeId === accId) {
        if (updated.length > 0) {
            activateAccount(updated[0].id);
        } else {
            localStorage.removeItem('sp_user');
            localStorage.removeItem('sp_host');
            localStorage.removeItem('sp_pass');
            localStorage.removeItem('sp_server_code');
            localStorage.removeItem('sp_server_info');
            localStorage.removeItem('sp_active_acc_id');
            Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith('sp_') || key.startsWith('iptv_')) {
                    sessionStorage.removeItem(key);
                }
            });
            closePlaylistsModal();
            showScreen('auth1-screen');
            showAppAlert('تم حذف جميع الحسابات المحفوظة', 'info');
            return;
        }
    }

    renderPlaylists();
    showAppAlert('تم حذف السيرفر بنجاح', 'success');
}

function activateAccount(accId) {
    // تبديل الحساب = محتوى مختلف كلياً: نفرض تحديث الباقات الثلاث مهما كان عمر الكاش
    try { sessionStorage.setItem('sp_account_changed', '1'); } catch (e) { }
    const accounts = getSavedAccounts();
    const target = accounts.find(a => a.id === accId);
    if (!target) return;

    // شاشة اتصال قصيرة بشعار السيرفر الجديد، مثل IntroActivity.showServer في أندرويد
    if (window.MizoIntro && typeof window.MizoIntro.showServer === 'function') {
        window.MizoIntro.showServer(target.serverLogo || 'photo/logo.ico', target.serverName || 'سيرفر');
    }

    if (typeof closeLivePlayer === 'function') closeLivePlayer();
    if (typeof closeFullscreenPlayer === 'function') closeFullscreenPlayer();

    localStorage.removeItem('sp_logged_out');
    localStorage.setItem('sp_active_acc_id', target.id);
    localStorage.setItem('sp_last_used_acc_id', target.id);
    localStorage.setItem('sp_user', JSON.stringify(target.userInfo || { username: target.username }));
    localStorage.setItem('sp_host', target.host);
    localStorage.setItem('sp_pass', target.password);
    const code = target.serverCode || '001';
    localStorage.setItem('sp_server_code', code);
    localStorage.setItem('sp_server_info', JSON.stringify({ name: target.serverName, logo: target.serverLogo }));

    sessionStorage.setItem('sp_user', JSON.stringify(target.userInfo || { username: target.username }));
    sessionStorage.setItem('sp_host', target.host);
    sessionStorage.setItem('sp_pass', target.password);
    sessionStorage.setItem('sp_server_code', code);
    sessionStorage.setItem('sp_server_info', JSON.stringify({ name: target.serverName, logo: target.serverLogo }));

    state.userInfo = target.userInfo || { username: target.username };
    state.username = target.username;
    state.password = target.password;
    state.host = target.host;
    state.hostUrls = [target.host];
    state.serverCode = code;

    // مسح كاش القنوات السابقة
    state.categories = [];
    state.streams = [];
    state.activeCategory = null;
    state.activeTab = 'dashboard';

    const navUserEl = document.getElementById('navUsername');
    if (navUserEl) navUserEl.innerText = state.username;

    const navEl = document.getElementById('dashboard-nav');
    if (navEl) navEl.classList.remove('hidden');

    if (typeof updateActiveServerBanner === 'function') {
        updateActiveServerBanner();
    }
    if (typeof updateSavedAccountsBadge === 'function') {
        updateSavedAccountsBadge();
    }

    closePlaylistsModal();
    showScreen('dashboard-screen');
    if (typeof showToast === 'function') {
        showToast(`تم الدخول بنجاح إلى: ${target.serverName}`, 'success');
    } else if (typeof showAppAlert === 'function') {
        showAppAlert(`تم الدخول بنجاح إلى: ${target.serverName}`, 'success');
    }
}

function openPlaylistsModal() {
    renderPlaylists();
    const modal = document.getElementById('playlistsModal');
    if (modal) modal.classList.remove('hidden');
}

function closePlaylistsModal() {
    const modal = document.getElementById('playlistsModal');
    if (modal) modal.classList.add('hidden');
}

function addNewPlaylistServer() {
    closePlaylistsModal();
    const sCodeInput = document.getElementById('serverCode');
    if (sCodeInput) sCodeInput.value = '';
    const uInput = document.getElementById('username');
    if (uInput) uInput.value = '';
    const pInput = document.getElementById('password');
    if (pInput) pInput.value = '';

    sessionStorage.removeItem('sp_server_code');
    sessionStorage.removeItem('sp_host_urls');
    sessionStorage.removeItem('sp_server_info');

    showScreen('auth1-screen');
    showAppAlert('أدخل كود السيرفر الجديد لإضافته كقائمة تشغيل إضافية', 'info');
}

function renderPlaylists() {
    const grid = document.getElementById('playlistsGrid');
    const countEl = document.getElementById('playlistsCountText');
    if (!grid) return;

    const accounts = getSavedAccounts();
    if (countEl) countEl.innerText = `${accounts.length} سيرفر(ات) محفوظة`;

    if (accounts.length === 0) {
        grid.innerHTML = `
            <div class="playlists-empty-state">
                <i class="fas fa-layer-group playlists-empty-icon"></i>
                <h4>لا توجد سيرفرات أو قوائم تشغيل محفوظة حالياً</h4>
                <p>اضغط على زر "إضافة سيرفر جديد" لإدخال بيانات اشتراكك وحفظه للرجوع إليه في أي وقت.</p>
            </div>
        `;
        return;
    }

    // التحقق الدقيق مما إذا كانت هناك جلسة متصلة حالياً
    const isSessionActive = !!(state.username && !localStorage.getItem('sp_logged_out'));
    const currentActiveId = isSessionActive ? (localStorage.getItem('sp_active_acc_id') || (accounts[0] ? accounts[0].id : null)) : null;
    const lastUsedId = localStorage.getItem('sp_last_used_acc_id') || localStorage.getItem('sp_active_acc_id');

    grid.innerHTML = accounts.map(acc => {
        const isCurrentlyConnected = isSessionActive && (acc.id === currentActiveId);
        const isLastUsed = !isSessionActive && (acc.id === lastUsedId);
        const serverName = acc.serverName || 'سيرفر IPTV';
        const serverLogo = acc.serverLogo || 'photo/logo.ico';
        const username = acc.username || '--';
        const expDate = acc.expDateText || 'غير متوفر';

        let badgeHtml = '';
        if (isCurrentlyConnected) {
            badgeHtml = '<div class="playlist-active-badge"><i class="fas fa-check-circle"></i> متصل حالياً</div>';
        } else if (isLastUsed) {
            badgeHtml = '<div class="playlist-active-badge last-used" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5);"><i class="fas fa-history"></i> آخر استخدام</div>';
        }

        let actionBtnHtml = '';
        if (isCurrentlyConnected) {
            actionBtnHtml = `
                <button type="button" class="btn-playlist-select current" onclick="event.stopPropagation(); closePlaylistsModal(); showScreen('dashboard-screen');" title="فتح لوحة تحكم السيرفر">
                    <i class="fas fa-tv"></i> متصل حالياً (فتح اللوحة)
                </button>
            `;
        } else if (isSessionActive) {
            actionBtnHtml = `
                <button type="button" class="btn-playlist-select" onclick="event.stopPropagation(); activateAccount('${acc.id}')" title="التبديل إلى هذا السيرفر">
                    <i class="fas fa-exchange-alt"></i> التبديل لهذا السيرفر
                </button>
            `;
        } else {
            actionBtnHtml = `
                <button type="button" class="btn-playlist-select btn-playlist-connect" onclick="event.stopPropagation(); activateAccount('${acc.id}')" title="دخول وتشغيل السيرفر">
                    <i class="fas fa-play-circle"></i> دخول للسيرفر
                </button>
            `;
        }

        const cardClickHandler = isCurrentlyConnected
            ? "closePlaylistsModal(); showScreen('dashboard-screen');"
            : `activateAccount('${acc.id}')`;

        return `
            <div class="playlist-card ${isCurrentlyConnected ? 'is-active' : ''}" onclick="${cardClickHandler}" title="اضغط للدخول إلى ${serverName}">
                ${badgeHtml}
                <div class="playlist-card-top">
                    <img src="${serverLogo}" alt="${serverName}" class="playlist-logo" onerror="this.src='photo/logo.ico'" />
                    <div class="playlist-card-meta">
                        <h4 title="${serverName}">${serverName}</h4>
                        <div class="playlist-username">
                            <i class="fas fa-user-circle"></i>
                            <span>${username}</span>
                        </div>
                        <div class="playlist-exp">
                            <i class="far fa-calendar-alt"></i>
                            <span>الانتهاء: ${expDate}</span>
                        </div>
                    </div>
                </div>
                <div class="playlist-card-actions">
                    ${actionBtnHtml}
                    <button type="button" class="btn-playlist-delete" onclick="event.stopPropagation(); deleteAccount('${acc.id}')" title="حذف من المحفوظات">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateSavedAccountsBadge() {
    const accounts = getSavedAccounts();
    const badgeBtn = document.getElementById('btnSavedAccountsAuth');
    const badgeCount = document.getElementById('savedAccCountBadge');
    if (badgeBtn && badgeCount) {
        badgeCount.innerText = accounts.length;
        if (accounts.length > 0) {
            badgeBtn.classList.remove('hidden');
        } else {
            badgeBtn.classList.add('hidden');
        }
    }
}

function updateActiveServerBanner() {
    const bannerLogo = document.getElementById('dashActiveServerLogo');
    const bannerName = document.getElementById('dashActiveServerName');
    const bannerUser = document.getElementById('dashActiveUsername');
    const bannerExp = document.getElementById('dashActiveExp');

    const accounts = getSavedAccounts();
    const activeId = localStorage.getItem('sp_active_acc_id');
    const currentAcc = (activeId && accounts.find(a => a.id === activeId)) || accounts[0];

    let sName = 'سيرفر ميزو';
    let sLogo = 'photo/logo.ico';
    let sUser = state.username || '--';
    let sExp = '--';

    if (currentAcc) {
        sName = currentAcc.serverName || sName;
        sLogo = currentAcc.serverLogo || sLogo;
        sUser = currentAcc.username || sUser;
        sExp = currentAcc.expDateText || sExp;
    } else {
        try {
            const sInfo = JSON.parse(localStorage.getItem('sp_server_info') || sessionStorage.getItem('sp_server_info') || '{}');
            if (sInfo.name) sName = sInfo.name;
            if (sInfo.logo) sLogo = sInfo.logo;
        } catch(e) {}
        if (state.userInfo && state.userInfo.exp_date) {
            sExp = typeof formatSubscriptionDate === 'function' ? formatSubscriptionDate(state.userInfo.exp_date) : state.userInfo.exp_date;
        }
    }

    if (bannerLogo) bannerLogo.src = sLogo;
    if (bannerName) bannerName.innerText = sName;
    if (bannerUser) bannerUser.innerText = sUser;
    if (bannerExp) bannerExp.innerText = sExp;
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
// خريطة أكواد السيرفرات المحلية

// 1. جلب الهوست من ملف servers.json المحلي وحفظه بشكل صحيح
async function handleServerCode() {
    const btn = document.getElementById('btnConnectServer');
    try {
        const inputEl = document.getElementById('serverCode');
        if (!inputEl) {
            console.error('serverCode input element not found');
            return;
        }
        let code = inputEl.value.trim();
        // تحويل الأرقام العربية الهندية (مثل ٠٠١ إلى 001) لمنع خطأ إدخال الكود في الشاشات
        code = code.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        inputEl.value = code;

        if (!code) {
            return showAppAlert('يرجى إدخال كود السيرفر للمتابعة', 'warning');
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner spinner"></i> جاري الاتصال...';
        }

        // 1. خريطة السيرفرات التي أضفتها أنت
        const serverHostsMap = {
            "001": "http://cafott.com",
            "002": "http://nv2egy.com:80",
            "003": "http://mar10.sbs",
            "004": "http://pk8dkz.mvten.net",
            "005": "http://mgtv.pro",
            "006": "http://n1.new2027.xyz:80",
            "007": "http://24.mhpro1.xyz:80"
        };

        // 2. التحقق من الكود مباشرة من القريطة
        const hostUrl = serverHostsMap[code];

        if (!hostUrl) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'الاتصال بالسيرفر';
            }
            if (typeof logActivity === 'function') {
                try {
                    logActivity({
                        action: 'player_server_failed',
                        category: 'security',
                        severity: 'danger',
                        title: '⚠️ محاولة إدخال كود سيرفر غير صالح في المشغل',
                        details: { attemptedCode: code }
                    });
                } catch (e) { }
            }
            return showAppAlert('كود السيرفر غير صحيح، يرجى التأكد من الكود والمحاولة مجدداً.', 'error');
        }

        // 3. حفظ الهوست والانتقال للخطوة التالية
        state.host = hostUrl;
        try { sessionStorage.setItem('sp_fixed_host', hostUrl); } catch (e) { }

        state.serverCode = code;
        try {
            localStorage.setItem('sp_server_code', code);
            sessionStorage.setItem('sp_server_code', code);
            sessionStorage.setItem('sp_current_screen', 'auth2-screen');
        } catch (e) { }

        const serverMap = {
            '001': { name: 'سيرفر اكس', logo: 'photo/x.jpeg' },
            '002': { name: 'سيرفر نوفا', logo: 'photo/nova.jpeg' },
            '003': { name: 'سيرفر مارفل', logo: 'photo/marvel.jpeg' },
            '004': { name: 'سيرفر مافين', logo: 'photo/maven.jpeg' },
            '005': { name: 'سيرفر ميجا', logo: 'photo/mega.jpeg' },
            '006': { name: 'سيرفر نينجا', logo: 'photo/ninja.jpeg' },
            '007': { name: 'سيرفر MH', logo: 'photo/mh.png' }
        };

        const sInfo = serverMap[code] || { name: `سيرفر (${code})`, logo: 'photo/logo.ico' };
        try {
            localStorage.setItem('sp_server_info', JSON.stringify(sInfo));
            sessionStorage.setItem('sp_server_info', JSON.stringify(sInfo));
        } catch (e) { }

        const srvDisplay = document.getElementById('authServerDisplay');
        if (srvDisplay) srvDisplay.innerText = sInfo.name;
        const srvLogo = document.getElementById('auth2Logo');
        if (srvLogo) srvLogo.src = sInfo.logo;

        showScreen('auth2-screen');

        if (typeof logActivity === 'function') {
            try {
                logActivity({
                    action: 'player_server_connected',
                    category: 'iptv',
                    severity: 'info',
                    title: `دخول لشاشة بيانات: ${sInfo.name}`,
                    details: { serverCode: code, serverName: sInfo.name }
                });
            } catch (e) { }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'الاتصال بالسيرفر';
        }
    } catch (err) {
        console.error('Error connecting server:', err);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'الاتصال بالسيرفر';
        }
        showAppAlert('حدث خطأ أثناء محاولة الاتصال بالسيرفر: ' + (err.message || err), 'error');
    }
}
window.handleServerCode = handleServerCode;

// 2. تسجيل الدخول وقراءة الهوست المحفوظ بشكل صحيح وحفظ الحسابات في قوائم التشغيل
async function handleLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) {
        return showAppAlert('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
    }

    // جلب الهوست من المتغير العام أو من الـ sessionStorage بجميع الاحتمالات المتاحة
    const host = state.host || sessionStorage.getItem('sp_fixed_host') || localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');

    if (!host) {
        showScreen('auth1-screen');
        return showAppAlert('حدث خطأ في بيانات السيرفر، يرجى إعادة إدخال الكود', 'error');
    }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner spinner"></i> جاري تسجيل الدخول...';

    const apiUrl = `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const proxyUrl = getProxyUrl(apiUrl);

    try {
        const res = await panelFetch(proxyUrl);
        const data = await res.json();

        if (data && data.user_info && data.user_info.auth === 1) {
            // دخول بحساب جديد: تحديث إجباري للباقات مثل تطبيق أندرويد
            try { sessionStorage.setItem('sp_account_changed', '1'); } catch (e) { }
            // تعريف السيرفر قبل أي استخدام: كانت هذه الثوابت مُعرَّفة تحت نداء الافتتاحية،
            // فكان كل دخول ناجح يرمي ReferenceError ويظهر للمستخدم كـ"تعذر الاتصال بالسيرفر".
            const currentCode = state.serverCode || sessionStorage.getItem('sp_server_code') || localStorage.getItem('sp_server_code') || '001';
            const serverMap = {
                '001': { name: 'سيرفر اكس', logo: 'photo/x.jpeg' },
                '002': { name: 'سيرفر نوفا', logo: 'photo/nova.jpeg' },
                '003': { name: 'سيرفر مارفل', logo: 'photo/marvel.jpeg' },
                '004': { name: 'سيرفر مافين', logo: 'photo/maven.jpeg' },
                '005': { name: 'سيرفر ميجا', logo: 'photo/mega.jpeg' },
                '006': { name: 'سيرفر نينجا', logo: 'photo/ninja.jpeg' },
                '007': { name: 'سيرفر MH', logo: 'photo/mh.png' }
            };
            const sInfo = serverMap[currentCode] || { name: `سيرفر (${currentCode})`, logo: 'photo/logo.ico' };

            if (window.MizoIntro && typeof window.MizoIntro.showServer === 'function') {
                window.MizoIntro.showServer(sInfo.logo || 'photo/logo.ico', sInfo.name || 'سيرفر');
            }
            state.userInfo = data.user_info;
            state.username = user;
            state.password = pass;
            state.host = host;
            state.hostUrls = [host];

            const expDateText = typeof formatSubscriptionDate === 'function' ? formatSubscriptionDate(data.user_info.exp_date) : (data.user_info.exp_date || 'غير متوفر');

            const accountId = 'acc_' + currentCode + '_' + user.toLowerCase();
            const accountObj = {
                id: accountId,
                serverCode: currentCode,
                serverName: sInfo.name,
                serverLogo: sInfo.logo,
                host: host,
                username: user,
                password: pass,
                userInfo: data.user_info,
                expDateText: expDateText,
                savedAt: Date.now()
            };

            saveAccountToStorage(accountObj);
            localStorage.removeItem('sp_logged_out');
            localStorage.setItem('sp_active_acc_id', accountId);

            // حفظ الجلسة محلياً ودائماً لضمان عدم طلب تسجيل الدخول مجدداً إلا عند الخروج يدوياً
            localStorage.setItem('sp_user', JSON.stringify(data.user_info));
            localStorage.setItem('sp_host', host);
            localStorage.setItem('sp_pass', pass);
            localStorage.setItem('sp_server_code', currentCode);
            localStorage.setItem('sp_server_info', JSON.stringify(sInfo));

            sessionStorage.setItem('sp_user', JSON.stringify(data.user_info));
            sessionStorage.setItem('sp_host', host);
            sessionStorage.setItem('sp_pass', pass);
            sessionStorage.setItem('sp_server_code', currentCode);
            sessionStorage.setItem('sp_server_info', JSON.stringify(sInfo));

            const navUserEl = document.getElementById('navUsername');
            if (navUserEl) navUserEl.innerText = user;

            const navEl = document.getElementById('dashboard-nav');
            if (navEl) navEl.classList.remove('hidden');

            updateActiveServerBanner();
            updateSavedAccountsBadge();

            // الانتقال للوحة التحكم الرئيسية (dashboard-screen)
            showScreen('dashboard-screen');

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'iptv_login_success',
                    category: 'iptv',
                    severity: 'success',
                    title: `دخول ناجح لسيرفر: ${sInfo.name}`,
                    details: { server: sInfo.name, username: user, expDate: expDateText }
                });
            }
        } else {
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'iptv_login_failed',
                    category: 'security',
                    severity: 'danger',
                    title: `⚠️ محاولة دخول فاشلة لسيرفر: ${sInfo.name || 'سيرفر'}`,
                    details: { server: sInfo.name, username: user }
                });
            }
            showAppAlert('بيانات الدخول غير صحيحة، يرجى التحقق من اسم المستخدم وكلمة المرور', 'error');
        }
    } catch (e) {
        console.error(e);
        showAppAlert('تعذر الاتصال بالسيرفر، تأكد من الاتصال أو البيانات', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'تسجيل الدخول';
    }
}
window.handleLogin = handleLogin;

function playStream(id, type, extension, name, icon) {
    // توحيد المعاملات عند الاستدعاء بأي ترتيب (Normalization)
    if (id === 'live' || id === 'vod' || id === 'series') {
        const tempType = id;
        id = type;
        type = tempType;
        name = extension;
        icon = name;
        extension = (type === 'live' ? 'm3u8' : 'mp4');
    }

    currentStreamInfo = { id, type, extension, name, icon, mediaDetails: window.currentMediaDetails || null };
    // قائمة تشغيل القنوات: كل قنوات القسم المعروض حالياً
    if (type === 'live' && Array.isArray(currentItemsArray) && currentItemsArray.length > 1) {
        const qi = currentItemsArray.findIndex(it => String(it.stream_id) === String(id));
        if (qi >= 0) mizoSetQueue('live', currentItemsArray, qi);
    } else if (type === 'vod') {
        // الفيلم عمل مستقل: لا معنى لزرّي التالي والسابق فيه
        window.mizoQueue = null;
    }
    if (type === 'live') {
        sessionStorage.setItem('sp_last_live_stream', JSON.stringify({ id, type, extension, name, icon }));
    }
    if (type !== 'series') {
        recordContinueWatching(id, type);
    }

    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const ext = extension ? extension.toLowerCase() : (type === 'live' ? 'm3u8' : 'mp4');

    // خريطة السيرفرات لربط كود السيرفر بالهوست المخصص له
    const serverHostsMap = {
        "001": "http://cafott.com"
    };

    // جلب كود السيرفر الحالي
    const currentServerCode = state.serverCode || sessionStorage.getItem('sp_server_code');
    let hostUrl = (serverHostsMap[currentServerCode] || localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host') || (state.hostUrls && state.hostUrls[0]) || '').replace(/\/+$/, '');

    // ================================================================
    // نظام فحص المتصفح وإعداد الروابط
    // ================================================================
    const userAgent = navigator.userAgent.toLowerCase();
    const isSafari = /safari/.test(userAgent) && userAgent.indexOf('chrome') === -1;
    const isAndroid = /android/i.test(userAgent) || (window.AlMeZ0App && window.AlMeZ0App.isAndroid);

    // بناء الرابط الأساسي لاستخدامه في المشغل أو المشغل الخارجي الاختياري
    let baseStreamUrl = '';
    if (type === 'live') {
        const liveExt = (extension && extension.toLowerCase() === 'ts') ? 'ts' : 'm3u8';
        baseStreamUrl = `${hostUrl}/live/${user}/${pass}/${id}.${liveExt}`;
    } else if (type === 'vod') {
        baseStreamUrl = `${hostUrl}/movie/${user}/${pass}/${id}.${ext}`;
    } else if (type === 'series') {
        baseStreamUrl = `${hostUrl}/series/${user}/${pass}/${id}.${ext}`;
    }

    // ================================================================
    // في تطبيق أندرويد فقط: تشغيل البث المباشر والأفلام والمسلسلات في المشغل المدمج الداخلي (ExoPlayer)
    // بملء الشاشة الفوري مع عتاد الأندرويد لتقديم أعلى جودة وسلاسة 60fps
    // ================================================================
    if (window.AndroidNativeBridge || (window.AlMeZ0App && window.AlMeZ0App.isAndroid)) {
        const isLive = (type === 'live');
        const isTv = document.body.classList.contains('tv-device-mode') ||
                     (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.isTvDevice === 'function' && window.AndroidNativeBridge.isTvDevice());
        if (window.AlMeZ0App && typeof window.AlMeZ0App.playNativeVideo === 'function') {
            const handled = window.AlMeZ0App.playNativeVideo(baseStreamUrl, name, icon, isLive, isTv);
            if (handled) return;
        }
        if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.playNativeVideo === 'function') {
            window.AndroidNativeBridge.playNativeVideo(baseStreamUrl, name || 'ALmEz0 Video', icon || '', isLive, isTv);
            return;
        }
    }

    // دالة مساعدة لتشغيل الرابط في مشغل وسائط خارجي (اختياري عند طلب المستخدم يدوياً)
    function launchExternalPlayer(targetUrl, mediaName) {
        if (window.AlMeZ0App && typeof window.AlMeZ0App.openInExternalPlayer === 'function') {
            window.AlMeZ0App.openInExternalPlayer(targetUrl, mediaName);
        } else {
            window.location.href = `vlc://${targetUrl}`;
            setTimeout(() => {
                window.open(targetUrl, '_blank');
            }, 800);
        }
    }

    // ================================================================
    // بناء قائمة الروابط والصيغ لتشغيلها مباشرة داخل المشغل المدمج
    // ================================================================
    let urlQueue = [];

    if (type === 'live') {
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}.m3u8`);
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}.ts`);
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}`);
    } else if (type === 'vod') {
        // تشغيل الفيلم داخل المشغل: الصيغة الفعلية للسيرفر أولاً، ثم mp4، ثم مباشر بدون امتداد
        urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}.${ext}`);
        // اللوحة ترسل container_extension ناقصاً أحياناً فيفشل التشغيل من أول مرة
        // وينجح في الثانية. نجرّب بقية الصيغ المعروفة بصمت قبل إظهار أي خطأ.
        ['mkv', 'mp4', 'avi', 'ts'].forEach(function (alt) {
            if (alt !== ext) urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}.${alt}`);
        });
        urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}`);
    } else if (type === 'series') {
        // تشغيل الحلقة داخل المشغل: الصيغة الفعلية للسيرفر أولاً، ثم mp4، ثم مباشر بدون امتداد
        urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}.${ext}`);
        // اللوحة ترسل container_extension ناقصاً أحياناً فيفشل التشغيل من أول مرة
        // وينجح في الثانية. نجرّب بقية الصيغ المعروفة بصمت قبل إظهار أي خطأ.
        ['mkv', 'mp4', 'avi', 'ts'].forEach(function (alt) {
            if (alt !== ext) urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}.${alt}`);
        });
        urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}`);
    }

    const preferredPlayer = localStorage.getItem('sp_preferred_player') || 'hlsjs';

    // تنظيف أي مشغل يعمل حالياً قبل لمس الـ DOM
    if (window.vjsPlayer) {
        try { window.vjsPlayer.dispose(); } catch (e) { }
        window.vjsPlayer = null;
    }
    if (window.hlsInstance) {
        try { window.hlsInstance.destroy(); } catch (e) { }
        window.hlsInstance = null;
    }

    let containerSelector = 'mizoPlayer';
    const isAndroidAppPlatform = document.body.classList.contains('platform-android') || (window.AlMeZ0App && window.AlMeZ0App.isAndroid) || !!window.AndroidNativeBridge;
    const isFullscreenModal = (type === 'vod' || type === 'series') || (type === 'live' && isAndroidAppPlatform);

    // إعداد واجهة المشغل
    if (isFullscreenModal) {
        currentStreamInfo = { type, id, name, icon };
        const modal = document.getElementById('fullscreenVideoModal');
        if (modal) modal.classList.remove('hidden');

        // فتح الفل سكرين تلقائياً للمتصفحات الداعمة
        openNativeFullscreen(modal);

        const container = document.getElementById('fullscreenVideoContainer');
        container.innerHTML = '<video id="mizoVodPlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline webkit-playsinline style="width:100%;height:100%;"></video>';
        containerSelector = 'mizoVodPlayer';
        if (typeof resetCloseBtnInactivityTimer === 'function') resetCloseBtnInactivityTimer();
        history.pushState({ screenId: typeof currentScreenId !== 'undefined' ? currentScreenId : null, modal: 'fullscreen' }, '', window.location.href);

        if (type === 'live' && typeof showTvLiveOsd === 'function') {
            showTvLiveOsd(name, icon);
        }
    } else {
        // Track current live channel info for TV navigation & OSD
        currentStreamInfo = { type: 'live', id, name, icon };

        const wrapper = document.getElementById('liveVideoContainer') || document.getElementById('livePlayerWrapper');
        wrapper.innerHTML = '<video id="mizoPlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline webkit-playsinline style="width:100%;height:100%;"></video>';
        containerSelector = 'mizoPlayer';

        const liveWrap = document.getElementById('livePlayerWrapper');
        if (liveWrap) liveWrap.classList.add('is-playing');
        if (typeof initLivePlayerGestures === 'function') initLivePlayerGestures();

        document.getElementById('playingChannelName').innerText = name || 'Live Channel';
        document.getElementById('playingChannelIcon').src = icon || 'photo/logo.ico';
        const favsLive = JSON.parse(localStorage.getItem('sp_favs_live') || '[]');
        const btnLiveFav = document.getElementById('btnLiveFav');
        if (btnLiveFav) btnLiveFav.classList.toggle('active', favsLive.includes(String(id)));
        document.getElementById('playerTopHeader').classList.remove('hidden');

        // Show native player toggle button on Android
        const btnNative = document.getElementById('btnLiveNativePlayer');
        if (btnNative) {
            const hasNative = !!(window.AndroidNativeBridge || (window.AlMeZ0App && window.AlMeZ0App.isAndroid));
            btnNative.classList.toggle('hidden', !hasNative);
        }

        if (typeof showTvLiveOsd === 'function') showTvLiveOsd(name, icon);
    }

    let currentTryIndex = 0;
    let fallbackTimer = null;

    function showLiveChannelLoading(channelName) {
        const overlay = document.getElementById('liveChannelLoadingOverlay');
        if (overlay) {
            const titleEl = document.getElementById('liveLoadingChannelTitle');
            if (titleEl && channelName) {
                titleEl.innerText = `جاري تشغيل ${channelName}...`;
            }
            overlay.classList.remove('hidden');
        }
    }

    function hideLiveChannelLoading() {
        const overlay = document.getElementById('liveChannelLoadingOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    // دالة تهيئة المشغل المختار
    function initSelectedPlayer(streamUrl) {
        // تنظيف المشغل القديم قبل إنشاء الجديد
        if (window.vjsPlayer) {
            try {
                window.vjsPlayer.dispose();
            } catch (e) { }
            window.vjsPlayer = null;
        }
        if (window.hlsInstance) {
            try {
                window.hlsInstance.destroy();
            } catch (e) { }
            window.hlsInstance = null;
        }

        if (type === 'live') {
            showLiveChannelLoading(name);
        }

        const parent = isFullscreenModal ? document.getElementById('fullscreenVideoContainer') : (document.getElementById('liveVideoContainer') || document.getElementById('livePlayerWrapper'));
        if (parent) {
            parent.innerHTML = `<video id="${containerSelector}" class="video-js vjs-default-skin" controls preload="auto" playsinline webkit-playsinline style="width:100%;height:100%;"></video>`;
        }

        patchVideoJsTech();

        const playUrl = streamUrl;
        const sLower = streamUrl.toLowerCase();
        // HLS مخصص فقط للبث المباشر أو ملفات m3u8 الحقيقية، وليس لملفات الأفلام والمسلسلات الثابتة
        const isHlsStream = (sLower.includes('.m3u8') || type === 'live') && !sLower.includes('.mp4') && !sLower.includes('.mkv');

        // تحديد نوع الملف بدقة مع إعطاء مرونة لفك ترميز MKV و MP4
        let mimeType = 'video/mp4';
        if (sLower.includes('.m3u8')) {
            mimeType = 'application/x-mpegURL';
        } else if (sLower.includes('.ts')) {
            mimeType = 'video/mp2t';
        } else if (sLower.includes('.webm')) {
            mimeType = 'video/webm';
        } else {
            mimeType = 'video/mp4';
        }

        const progressKey = `sp_progress_${type}_${id}`;
        let isSeeking = false;
        let seekTargetTime = 0;
        let seekRecoveryCount = 0;
        let lastProgressSaveTime = 0;

        try {
            window.vjsPlayer = videojs(containerSelector, {
                controls: true,
                autoplay: true,
                preload: 'auto',
                controlBar: {
                    pictureInPictureToggle: false,
                    playbackRateMenuButton: false,
                    skipButtons: (type === 'live') ? false : {
                        forward: 10,
                        backward: 10
                    },
                    progressControl: (type !== 'live'),
                    remainingTimeDisplay: false,
                    currentTimeDisplay: (type !== 'live'),
                    timeDivider: (type !== 'live'),
                    durationDisplay: (type !== 'live'),
                    liveDisplay: (type === 'live')
                },
                html5: {
                    nativeAudioTracks: false,
                    nativeVideoTracks: false,
                    vhs: {
                        overrideNative: !isSafari,
                        handlePartialData: true
                    }
                }
            });

            if (type === 'live') {
                window.vjsPlayer.on('playing', hideLiveChannelLoading);
                window.vjsPlayer.on('canplay', hideLiveChannelLoading);
                window.vjsPlayer.on('timeupdate', () => {
                    if (window.vjsPlayer && window.vjsPlayer.currentTime() > 0) {
                        hideLiveChannelLoading();
                    }
                });
                window.vjsPlayer.on('waiting', () => showLiveChannelLoading(name));
            }


            if (isHlsStream && typeof Hls !== 'undefined' && Hls.isSupported()) {
                const playerEl = window.vjsPlayer.el();
                const videoTag = (window.vjsPlayer.tech() && window.vjsPlayer.tech().el()) ||
                                 (playerEl && playerEl.querySelector('video')) ||
                                 document.querySelector(`#${containerSelector} video`) ||
                                 document.getElementById(containerSelector);

                window.hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false, // تعطيل نمط lowLatency لمنع تسريع/تبطيء الفيديو والتشويش البصري على سيرفرات IPTV
                    backBufferLength: 15,
                    maxBufferLength: 30, // تخزين مسبق مستقر (20-30 ثانية) لمنع أي تقطيع لحظي
                    maxMaxBufferLength: 60,
                    maxBufferSize: 60 * 1000 * 1000,
                    liveSyncDurationCount: 3, // التزامن مع 3 إلى 4 قطع بث لتفادي فجوات البث والتقطيع
                    liveMaxLatencyDurationCount: 6,
                    startFragPrefetch: true,
                    maxLoadingDelay: 4,
                    highBufferWatchdogPeriod: 2,
                    nudgeOffset: 0.1,
                    nudgeMaxRetry: 5,
                    maxBufferHole: 0.5,
                    fragLoadingTimeOut: 20000,
                    manifestLoadingTimeOut: 15000,
                    levelLoadingTimeOut: 15000
                });

                window.hlsInstance.loadSource(playUrl);
                if (videoTag) {
                    window.hlsInstance.attachMedia(videoTag);
                }

                let hlsNetworkRetries = 0;
                window.hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                    if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
                        console.warn("[HLS] Buffer Stalled, nudging video smoothly...");
                        if (videoTag && !videoTag.paused) {
                            try { videoTag.currentTime += 0.1; } catch (e) { }
                        }
                    }
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hlsNetworkRetries++;
                                if (hlsNetworkRetries <= 3) {
                                    console.warn(`HLS Network Error, retrying (${hlsNetworkRetries}/3)...`);
                                    window.hlsInstance.startLoad();
                                } else {
                                    console.warn("HLS Network Error retry limit reached, triggering fallback.");
                                    triggerFallback();
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn("HLS Media Error, recovering...");
                                window.hlsInstance.recoverMediaError();
                                break;
                            default:
                                triggerFallback();
                                break;
                        }
                    }
                });
            } else {
                // تمرير نوع video/mp4 لمشغل Video.js لتقبل كل من صيغ MP4 و MKV في WebView والمتصفحات
                window.vjsPlayer.src({ src: playUrl, type: mimeType });

                // التعيين المباشر على عنصر video لتسريع وتحفيز البث التدريجي فورا
                const playerEl = window.vjsPlayer.el();
                const videoTag = (window.vjsPlayer.tech() && window.vjsPlayer.tech().el()) || (playerEl && playerEl.querySelector('video'));
                if (videoTag && videoTag.src !== playUrl) {
                    videoTag.src = playUrl;
                    videoTag.load();
                }
            }

            window.vjsPlayer.ready(function () {
                const player = this;
                try { mizoInstallQueueButtons(); } catch (e) { }

                /*
                 * بعض مضيفات الملفات ترسل مقطعاً بديلاً مدته ثوانٍ فيه رسالة حظر (مثل رسالة
                 * Cloudflare) بدل الفيلم نفسه، وهو فيديو صالح فلا يلتقطه معالج الأخطاء.
                 * فيلم أو حلقة مدتها أقل من 20 ثانية ليست محتوى حقيقياً: نجرّب الرابط التالي.
                 */
                player.one('loadedmetadata', function () {
                    try {
                        const t = currentStreamInfo && currentStreamInfo.type;
                        if (t !== 'live') {
                            const d = player.duration();
                            if (d > 0 && d < 20 && currentTryIndex < urlQueue.length - 1) {
                                console.warn('مقطع قصير غير حقيقي (' + d + 'ث): تجربة الرابط التالي');
                                triggerFallback();
                            }
                        }
                    } catch (e) { }
                });

                // رصد عمليات التقديم والتأخير (Seeking) لمنع الانهيار وإخفاء علامة البوز
                player.on('seeking', function () {
                    isSeeking = true;
                    seekTargetTime = player.currentTime();
                    const pEl = player.el();
                    if (pEl) {
                        pEl.classList.add('is-seeking-custom');
                        pEl.classList.add('vjs-waiting');
                    }
                });

                player.on('seeked', function () {
                    const pEl = player.el();
                    player.one('playing', function () {
                        isSeeking = false;
                        seekRecoveryCount = 0;
                        if (pEl) {
                            pEl.classList.remove('is-seeking-custom');
                            pEl.classList.remove('vjs-waiting');
                        }
                    });
                    setTimeout(() => {
                        isSeeking = false;
                        seekRecoveryCount = 0;
                        if (pEl) {
                            pEl.classList.remove('is-seeking-custom');
                            pEl.classList.remove('vjs-waiting');
                        }
                    }, 2000);
                });

                // عند بطء النت أو انتظار وصول البيانات، إظهار علامة التحميل وإخفاء أي علامة بوز
                player.on('waiting', function () {
                    const pEl = player.el();
                    if (pEl) {
                        pEl.classList.add('is-seeking-custom');
                    }
                });

                player.on('playing', function () {
                    const pEl = player.el();
                    if (pEl) {
                        pEl.classList.remove('is-seeking-custom');
                        pEl.classList.remove('vjs-waiting');
                    }
                });

                // ميزة استكمال المشاهدة (Resume Playback) من النقطة الدقيقة
                if (type !== 'live') {
                    const savedTime = parseFloat(localStorage.getItem(progressKey) || '0');
                    if (savedTime > 0) {
                        let hasResumed = false;
                        const applyResume = () => {
                            if (hasResumed) return;
                            try {
                                if (player.duration() > 0 || player.readyState() >= 1) {
                                    player.currentTime(savedTime);
                                    hasResumed = true;
                                    if (typeof showToast === 'function') {
                                        showToast('تم استكمال المشاهدة من حيث توقفت', 'info');
                                    }
                                }
                            } catch (e) { }
                        };

                        player.one('loadedmetadata', applyResume);
                        player.one('canplay', applyResume);
                        player.one('playing', applyResume);
                        setTimeout(applyResume, 400);
                        setTimeout(applyResume, 1000);
                    }

                    player.on('timeupdate', function () {
                        if (isSeeking || player.seeking()) return;
                        const now = Date.now();
                        if (now - lastProgressSaveTime < 3500) return;
                        lastProgressSaveTime = now;

                        const currentTime = player.currentTime();
                        const duration = player.duration();
                        if (duration > 0) {
                            if (currentTime > 5 && (duration - currentTime) > 10) {
                                localStorage.setItem(progressKey, currentTime);
                            } else if ((duration - currentTime) <= 10) {
                                localStorage.removeItem(progressKey);
                            }
                        }
                    });

                    player.on('pause', function () {
                        const currentTime = player.currentTime();
                        const duration = player.duration();
                        if (duration > 0 && currentTime > 5 && (duration - currentTime) > 10) {
                            localStorage.setItem(progressKey, currentTime);
                        }
                    });
                }

                player.play().catch(e => {
                    if (e.name !== 'AbortError') {
                        console.warn("Autoplay prevented:", e);
                    }
                });

                if (isFullscreenModal && typeof tryLandscapeOnFullscreen === 'function') tryLandscapeOnFullscreen();

                const playerEl = player.el();
                const controlBar = playerEl.querySelector('.vjs-control-bar');

                // 1. الشريط العلوي (علامة الخطأ للإغلاق + معلومات الفيديو)
                const oldHeader = playerEl.querySelector('.vjs-custom-top-bar');
                if (oldHeader) oldHeader.remove();

                const topBarHtml = `
                    <div class="vjs-custom-top-bar">
                        <button class="vjs-top-btn" id="innerPlayerClose" title="إغلاق"><i class="fas fa-times"></i></button>
                        <div class="vjs-custom-title">${name || 'تشغيل'}</div>
                        <button class="vjs-top-btn" id="innerPlayerInfo" title="معلومات البث"><i class="fas fa-info"></i></button>
                    </div>
                `;
                playerEl.insertAdjacentHTML('beforeend', topBarHtml);

                const closeBtn = document.getElementById('innerPlayerClose');
                if (closeBtn) {
                    closeBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (isFullscreenModal && typeof closeFullscreenPlayer === 'function') closeFullscreenPlayer();
                        else if (typeof closeLivePlayer === 'function') closeLivePlayer(true);
                    };
                }

                const infoBtn = document.getElementById('innerPlayerInfo');
                if (infoBtn) {
                    infoBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const vTag = playerEl.querySelector('video');
                        const vWidth = vTag ? (vTag.videoWidth || 0) : 0;
                        const vHeight = vTag ? (vTag.videoHeight || 0) : 0;

                        const details = (currentStreamInfo && currentStreamInfo.mediaDetails) || window.currentMediaDetails || null;
                        const serverVideo = details && details.info && details.info.video;
                        const sWidth = serverVideo ? (serverVideo.width || serverVideo.coded_width || 0) : 0;
                        const sHeight = serverVideo ? (serverVideo.height || serverVideo.coded_height || 0) : 0;
                        const streamName = (currentStreamInfo && currentStreamInfo.name) || name || '';

                        const isTitle4k = /4k|uhd|2160/i.test(streamName);
                        const isTrue4k = (sWidth >= 3840 || sHeight >= 2160 || vWidth >= 3840 || vHeight >= 2160 || isTitle4k);

                        let sourceResText = '1920 × 1080 (Full HD ⚡)';
                        if (isTrue4k) {
                            sourceResText = '3840 × 2160 (4K Ultra HD ⚡)';
                        } else if (sWidth > 0 && sHeight > 0) {
                            sourceResText = `${sWidth} × ${sHeight}`;
                        } else if (/720|hd/i.test(streamName) && !/1080|fhd/i.test(streamName)) {
                            sourceResText = '1280 × 720 (HD ⚡)';
                        }

                        let currentResText = (vWidth > 0 && vHeight > 0) ? `${vWidth} × ${vHeight}` : 'جاري الرندرة...';
                        if (vWidth >= 3840 || vHeight >= 2160) {
                            currentResText += ' (4K UHD)';
                        } else if (vWidth >= 1920 || vHeight >= 1080) {
                            currentResText += ' (FHD 1080p)';
                        } else if (vWidth >= 1280 || vHeight >= 720) {
                            currentResText += ' (HD 720p)';
                        }

                        const rawCodec = (serverVideo && serverVideo.codec_name) ? serverVideo.codec_name.toUpperCase() : (isTrue4k ? 'HEVC (H.265)' : 'H.264 (AVC)');
                        const codecText = isTrue4k ? 'HEVC / H.265 (10-Bit HDR)' : rawCodec;

                        const oldModal = playerEl.querySelector('.custom-player-alert');
                        if (oldModal) oldModal.remove();

                        const alertHtml = `
                            <div class="custom-player-alert" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; color: #fff; font-family: inherit; animation: fadeInAlert 0.25s ease;">
                                <div style="background: #111827; border: 1px solid rgba(255,255,255,0.15); border-radius: 18px; padding: 24px 28px; text-align: center; max-width: 410px; width: 92%; box-shadow: 0 15px 35px rgba(0,0,0,0.85); direction: rtl;">
                                    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 14px;">
                                        <div style="font-size: 26px; color: #38bdf8;"><i class="fas fa-info-circle"></i></div>
                                        <h3 style="margin: 0; font-size: 19px; color: #fff; font-weight: 700;">معلومات الفيديو والبث</h3>
                                    </div>

                                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; text-align: right; display: flex; flex-direction: column; gap: 9px; font-size: 13.5px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: #94a3b8;"><i class="fas fa-server" style="margin-left: 6px;"></i> دقة المصدر الأصلية:</span>
                                            <span style="color: ${isTrue4k ? '#4ade80' : '#38bdf8'}; font-weight: bold; direction: ltr;">${sourceResText}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: #94a3b8;"><i class="fas fa-desktop" style="margin-left: 6px;"></i> دقة العرض الحالية:</span>
                                            <span style="color: #f1f5f9; font-weight: 600; direction: ltr;">${currentResText}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: #94a3b8;"><i class="fas fa-tachometer-alt" style="margin-left: 6px;"></i> معدل سلاسة الإطارات:</span>
                                            <span style="color: #fbbf24; font-weight: bold; direction: ltr;">60 - 120 FPS ⚡</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="color: #94a3b8;"><i class="fas fa-microchip" style="margin-left: 6px;"></i> ترميز الفيديو:</span>
                                            <span style="color: #cbd5e1; font-weight: 600; direction: ltr;">${codecText}</span>
                                        </div>
                                    </div>

                                    ${isTrue4k && vWidth > 0 && vWidth < 3840 ? `
                                        <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; font-size: 12px; color: #cbd5e1; line-height: 1.5; text-align: right;">
                                            <i class="fas fa-bolt" style="color: #38bdf8; margin-left: 5px;"></i> جودة الفيلم الأصلية 4K حقيقي. متصفحات الويب تقوم بالتوافق على 1080p، ويمكنك فتحه مباشرة في المشغل الخارجي بأعلى جودة خام 4K.
                                        </div>
                                    ` : ''}

                                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                                        ${isTrue4k ? `
                                            <button id="playerInfoExternalPlayBtn" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 9px 15px; font-weight: 600; border-radius: 8px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
                                                <i class="fas fa-external-link-alt"></i> تشغيل 4K Direct
                                            </button>
                                        ` : ''}
                                        <button id="closePlayerAlertBtn" style="background: #f59e0b; color: #000; border: none; padding: 9px 24px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 13.5px; transition: 0.2s;">حسناً</button>
                                    </div>
                                </div>
                            </div>
                        `;

                        playerEl.insertAdjacentHTML('beforeend', alertHtml);

                        const alertClose = document.getElementById('closePlayerAlertBtn');
                        if (alertClose) {
                            alertClose.onclick = (ev) => {
                                ev.stopPropagation();
                                const modal = playerEl.querySelector('.custom-player-alert');
                                if (modal) modal.remove();
                            };
                        }

                        const extBtn = document.getElementById('playerInfoExternalPlayBtn');
                        if (extBtn) {
                            extBtn.onclick = (ev) => {
                                ev.stopPropagation();
                                const modal = playerEl.querySelector('.custom-player-alert');
                                if (modal) modal.remove();
                                if (typeof launchExternalPlayer === 'function' && baseStreamUrl) {
                                    launchExternalPlayer(baseStreamUrl, streamName);
                                }
                            };
                        }
                    };
                }

                if (controlBar) {
                    const fsControl = controlBar.querySelector('.vjs-fullscreen-control');

                    // 0. فاصل مرن يدفع عناصر اليمين إلى أقصى اليمين دائماً (حتى في البث المباشر)
                    const spacer = document.createElement('div');
                    spacer.className = 'vjs-custom-spacer';

                    // 1. زر الترجمة والإعدادات
                    const settingsBtn = document.createElement('div');
                    settingsBtn.className = 'custom-vjs-btn vjs-control custom-vjs-settings-btn';
                    settingsBtn.innerHTML = '<i class="fas fa-closed-captioning"></i>';
                    settingsBtn.title = "الترجمة والصوتيات";
                    settingsBtn.onclick = () => {
                        const tracks = player.textTracks();
                        const hasSubtitles = Array.from(tracks || []).some(t => t.kind === 'subtitles' || t.kind === 'captions');
                        if (hasSubtitles) {
                            showPlayerOsd('استخدم أيقونة (CC) بجانب الزر لاختيار الترجمة', 'fas fa-closed-captioning', playerEl);
                        } else {
                            showPlayerOsd('لا توجد ملفات ترجمة مدمجة في هذا البث', 'fas fa-exclamation-circle', playerEl);
                        }
                    };

                    // 2. زر تغيير الأبعاد (Aspect Ratio) - 5 أوضاع احترافية
                    const aspectBtn = document.createElement('div');
                    aspectBtn.className = 'custom-vjs-btn vjs-control custom-vjs-aspect-btn';
                    aspectBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
                    aspectBtn.title = "تغيير الأبعاد";

                    const aspectStates = [
                        { id: 'fit', label: 'تناسب أصلي (Fit)' },
                        { id: '16:9', label: '16:9 (عريضة)' },
                        { id: '4:3', label: '4:3 (تلفزيون)' },
                        { id: 'fill', label: 'ملء الشاشة (تمديد)' },
                        { id: 'zoom', label: 'تكبير وقص (Zoom)' }
                    ];
                    let currentAspectIdx = 0;

                    const applyAspectRatio = (stateId) => {
                        const videoTag = playerEl.querySelector('video');
                        if (!videoTag) return;
                        ['aspect-fit', 'aspect-16-9', 'aspect-4-3', 'aspect-fill', 'aspect-zoom'].forEach(cls => {
                            playerEl.classList.remove(cls);
                            videoTag.classList.remove(cls);
                        });
                        videoTag.style.maxWidth = '';
                        videoTag.style.maxHeight = '';
                        videoTag.style.aspectRatio = '';
                        videoTag.style.margin = '';

                        if (stateId === 'fit') {
                            playerEl.classList.add('aspect-fit');
                            videoTag.classList.add('aspect-fit');
                            videoTag.style.setProperty('object-fit', 'contain', 'important');
                            videoTag.style.setProperty('width', '100%', 'important');
                            videoTag.style.setProperty('height', '100%', 'important');
                        } else if (stateId === '16:9') {
                            playerEl.classList.add('aspect-16-9');
                            videoTag.classList.add('aspect-16-9');
                            videoTag.style.setProperty('aspect-ratio', '16 / 9', 'important');
                            videoTag.style.setProperty('object-fit', 'fill', 'important');
                            videoTag.style.setProperty('max-width', '100%', 'important');
                            videoTag.style.setProperty('max-height', '100%', 'important');
                            videoTag.style.setProperty('margin', 'auto', 'important');
                        } else if (stateId === '4:3') {
                            playerEl.classList.add('aspect-4-3');
                            videoTag.classList.add('aspect-4-3');
                            videoTag.style.setProperty('aspect-ratio', '4 / 3', 'important');
                            videoTag.style.setProperty('object-fit', 'fill', 'important');
                            videoTag.style.setProperty('max-width', '100%', 'important');
                            videoTag.style.setProperty('max-height', '100%', 'important');
                            videoTag.style.setProperty('width', 'auto', 'important');
                            videoTag.style.setProperty('height', '100%', 'important');
                            videoTag.style.setProperty('margin', 'auto', 'important');
                        } else if (stateId === 'fill') {
                            playerEl.classList.add('aspect-fill');
                            videoTag.classList.add('aspect-fill');
                            videoTag.style.setProperty('object-fit', 'fill', 'important');
                            videoTag.style.setProperty('width', '100%', 'important');
                            videoTag.style.setProperty('height', '100%', 'important');
                        } else if (stateId === 'zoom') {
                            playerEl.classList.add('aspect-zoom');
                            videoTag.classList.add('aspect-zoom');
                            videoTag.style.setProperty('object-fit', 'cover', 'important');
                            videoTag.style.setProperty('width', '100%', 'important');
                            videoTag.style.setProperty('height', '100%', 'important');
                        }
                    };

                    aspectBtn.onclick = () => {
                        currentAspectIdx = (currentAspectIdx + 1) % aspectStates.length;
                        const current = aspectStates[currentAspectIdx];
                        applyAspectRatio(current.id);
                        showPlayerOsd(`الأبعاد: ${current.label}`, 'fas fa-expand-arrows-alt', playerEl);
                    };

                    // 3. زر ملء الشاشة المخصص (Fullscreen Button أقصى اليمين)
                    const customFsBtn = document.createElement('div');
                    customFsBtn.className = 'custom-vjs-btn vjs-control custom-vjs-fs-btn';
                    customFsBtn.innerHTML = '<i class="fas fa-expand"></i>';
                    customFsBtn.title = "ملء الشاشة";

                    const updateFsBtnState = () => {
                        const liveWrap = document.getElementById('livePlayerWrapper');
                        const isLiveFs = liveWrap && liveWrap.classList.contains('live-fullscreen-mode');
                        const isFs = isLiveFs || player.isFullscreen() || !!(document.fullscreenElement || document.webkitFullscreenElement);
                        customFsBtn.innerHTML = isFs ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
                        customFsBtn.title = isFs ? "تصغير الشاشة" : "ملء الشاشة";
                    };

                    customFsBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (type === 'live' && !isFullscreenModal) {
                            if (typeof toggleLivePlayerFullscreen === 'function') {
                                toggleLivePlayerFullscreen();
                            }
                            updateFsBtnState();
                            return;
                        }
                        const isFs = player.isFullscreen() || !!(document.fullscreenElement || document.webkitFullscreenElement);
                        if (isFs) {
                            if (player.isFullscreen()) {
                                player.exitFullscreen();
                            } else {
                                exitNativeFullscreen();
                            }
                        } else {
                            if (player.requestFullscreen) {
                                player.requestFullscreen();
                            } else {
                                openNativeFullscreen(playerEl);
                            }
                            if (typeof tryLandscapeOnFullscreen === 'function') {
                                tryLandscapeOnFullscreen();
                            } else if (window.AlMeZ0App && typeof window.AlMeZ0App.lockLandscape === 'function') {
                                window.AlMeZ0App.lockLandscape();
                            }
                        }
                    };

                    player.on('fullscreenchange', updateFsBtnState);
                    document.addEventListener('fullscreenchange', updateFsBtnState);
                    document.addEventListener('webkitfullscreenchange', updateFsBtnState);

                    // إلغاء زر الفيديو جي إس الافتراضي وربطه بالزر المخصص لمنع التكرار
                    if (fsControl) {
                        fsControl.style.setProperty('display', 'none', 'important');
                        fsControl.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            customFsBtn.click();
                        };
                        controlBar.insertBefore(spacer, fsControl);
                        controlBar.insertBefore(settingsBtn, fsControl);
                        controlBar.insertBefore(aspectBtn, fsControl);
                        controlBar.insertBefore(customFsBtn, fsControl);
                    } else {
                        controlBar.appendChild(spacer);
                        controlBar.appendChild(settingsBtn);
                        controlBar.appendChild(aspectBtn);
                        controlBar.appendChild(customFsBtn);
                    }
                }
            });

            // معالجة الأخطاء الذكية والاستشفاء التلقائي عند التقديم/التأخير
            window.vjsPlayer.on('error', function () {
                const player = window.vjsPlayer;
                if (!player) return;

                const mediaErr = player.error();
                const currentT = player.currentTime();

                console.warn("Video.js Error:", mediaErr, "currentT:", currentT, "isSeeking:", isSeeking);

                // إزالة شاشة الخطأ السوداء فوراً من المشغل حتى لا تومض رسالة الخطأ على الشاشة
                try {
                    player.error(null);
                } catch (e) { }

                // إذا حدث الخطأ أثناء التقديم (Seeking) أو أثناء تشغيل الفيديو بالفعل
                if (isSeeking || (player && player.seeking && player.seeking()) || currentT > 1) {
                    if (seekRecoveryCount < 3) {
                        seekRecoveryCount++;
                        console.warn(`[SeekRecovery] Attempt #${seekRecoveryCount}`);

                        if (typeof showToast === 'function') {
                            showToast('جاري استكمال البث وتجاوز انقطاع التقديم...', 'info', 2000);
                        }

                        const targetTime = seekTargetTime || currentT;

                        setTimeout(() => {
                            try {
                                player.src({ src: playUrl, type: mimeType });
                                player.one('loadedmetadata', function () {
                                    if (targetTime > 0) {
                                        player.currentTime(targetTime);
                                    }
                                    player.play().catch(() => {});
                                });
                            } catch (e) {
                                console.error("Seek recovery error:", e);
                            }
                        }, 500);

                        return; // منع هدم المشغل تماماً
                    }
                }

                triggerFallback();
            });
        } catch (e) {
            console.error("VideoJS Error:", e);
            triggerFallback();
        }
    }

    // دالة محاولة الروابط البديلة إذا فشل الرابط الأول
    function triggerFallback() {
        if (fallbackTimer) return;

        // في حال حدوث خطأ عند بداية التشغيل، يتم التبديل فوراً خلال 250ms بدلاً من الانتظار ثانيتين
        const isInitialStartError = !window.vjsPlayer || !window.vjsPlayer.currentTime || window.vjsPlayer.currentTime() <= 0.5;
        const delayMs = isInitialStartError ? 250 : 1500;

        fallbackTimer = setTimeout(() => {
            fallbackTimer = null;

            currentTryIndex++;
            if (currentTryIndex < urlQueue.length) {
                console.warn(`الرابط لم يبدأ، تجربة الصيغة البديلة (${currentTryIndex + 1}/${urlQueue.length}): ${urlQueue[currentTryIndex]}`);
                initSelectedPlayer(urlQueue[currentTryIndex]);
            } else {
                console.error("تم استنفاد جميع المحاولات والروابط.");
                const parent = isFullscreenModal ? document.getElementById('fullscreenVideoContainer') : document.getElementById('livePlayerWrapper');
                if (parent) {
                    parent.innerHTML = `
                        <div class="empty-state" style="padding: 40px 20px; text-align: center; color: #fff;">
                            <div style="font-size: 50px; color: #f59e0b; margin-bottom: 15px;"><i class="fas fa-film"></i></div>
                            <h3 style="margin-bottom: 10px; font-size: 22px;">تعذر تشغيل هذا المقطع داخل المشغل المدمج</h3>
                            <p style="color: #cbd5e1; font-size: 15px; max-width: 480px; margin: 0 auto 25px auto; line-height: 1.6;">
                                لم يتمكن المشغل الداخلي من قراءة هذا الملف من السيرفر، يمكنك تجربة تشغيله في مشغل خارجي.
                            </p>
                            <button id="btnFallbackExternalPlay" style="background: linear-gradient(135deg, #f4c242, #d4a017); color: #111; border: none; padding: 14px 32px; font-size: 17px; font-weight: bold; border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 4px 20px rgba(244,194,66,0.4);">
                                <i class="fas fa-play"></i> تشغيل عبر مشغل خارجي (VLC)
                            </button>
                        </div>
                    `;
                    const fbBtn = document.getElementById('btnFallbackExternalPlay');
                    if (fbBtn) {
                        fbBtn.onclick = () => {
                            if (window.AlMeZ0App && typeof window.AlMeZ0App.openInExternalPlayer === 'function') {
                                window.AlMeZ0App.openInExternalPlayer(baseStreamUrl, name);
                            } else {
                                window.location.href = `vlc://${baseStreamUrl}`;
                            }
                        };
                    }
                }
            }
        }, delayMs);
    }

    // تشغيل أول رابط في القائمة
    if (urlQueue.length > 0) {
        initSelectedPlayer(urlQueue[0]);
    }
}

function logout() {
    const oldModal = document.querySelector('.custom-logout-modal');
    if (oldModal) oldModal.remove();

    const logoutHtml = `
        <div class="custom-logout-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999999; color: #fff; font-family: inherit;">
            <div class="custom-logout-box" style="background: #161b22; border: 1.5px solid rgba(255,255,255,0.18); border-radius: 24px; padding: 45px 50px; text-align: center; max-width: 540px; width: 92%; box-shadow: 0 30px 80px rgba(0,0,0,0.95);">
                <div style="font-size: 70px; color: #f59e0b; margin-bottom: 20px;"><i class="fas fa-exclamation-triangle"></i></div>
                <h3 style="margin: 0 0 16px 0; font-size: 30px; color: #fff; font-weight: bold;">تسجيل الخروج</h3>
                <p style="margin: 0 0 30px 0; font-size: 18px; color: #cbd5e1; line-height: 1.6;">هل أنت متأكد أنك تريد تسجيل الخروج من السيرفر الحالي؟</p>
                <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
                    <button id="confirmLogoutBtn" class="logout-action-btn" style="background: #e53935; color: #fff; border: none; padding: 14px 34px; font-weight: bold; border-radius: 12px; cursor: pointer; font-size: 17px; box-shadow: 0 5px 20px rgba(229,57,53,0.4);">
                        <i class="fas fa-sign-out-alt"></i> نعم، خروج
                    </button>
                    <button id="cancelLogoutBtn" class="logout-action-btn" style="background: #374151; color: #fff; border: none; padding: 14px 28px; font-weight: bold; border-radius: 12px; cursor: pointer; font-size: 17px;">
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', logoutHtml);

    document.getElementById('confirmLogoutBtn').onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
        const modal = document.querySelector('.custom-logout-modal');
        if (modal) {
            modal.style.pointerEvents = 'none';
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 120);
        }

        // 1. إيقاف أي مشغل فيديو شغال فوراً
        if (typeof closeLivePlayer === 'function') closeLivePlayer();
        if (typeof closeFullscreenPlayer === 'function') closeFullscreenPlayer();

        // 2. الحساب يبقى محفوظاً في قوائم التشغيل بعد الخروج — نفس سلوك أندرويد
        //    (Store.logout يضع علامة خروج فقط ولا يحذف شيئاً). كان الخروج يمسح السيرفر
        //    من sp_accounts نهائياً فيفقد المستخدم بياناته ويعيد إدخالها من جديد.

        // مسح بيانات سيرفر المشغل النشط
        localStorage.removeItem('sp_user');
        localStorage.removeItem('sp_host');
        localStorage.removeItem('sp_pass');
        localStorage.removeItem('sp_server_code');
        localStorage.removeItem('sp_server_info');
        localStorage.removeItem('sp_active_acc_id');
        localStorage.setItem('sp_logged_out', 'true');
        document.documentElement.classList.remove('has-active-player-session');

        // مسح بيانات الجلسة المؤقتة الخاصة بالمشغل فقط دون المساس ببيانات تسجيل دخول الموقع الأساسي
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith('sp_') || key.startsWith('iptv_')) {
                sessionStorage.removeItem(key);
            }
        });

        // 3. تصفير بيانات الحالة في الذاكرة
        state.userInfo = null;
        state.username = '';
        state.password = '';
        state.host = '';
        state.hostUrls = [];
        state.serverCode = '';
        state.categories = [];
        state.streams = [];
        state.activeCategory = null;
        state.activeTab = null;

        // 4. إخفاء شريط التنقل العلوي
        const navEl = document.getElementById('dashboard-nav');
        if (navEl) navEl.classList.add('hidden');

        // 5. تصفير حقول الإدخال
        const sCodeInput = document.getElementById('serverCode');
        if (sCodeInput) sCodeInput.value = '';
        const uInput = document.getElementById('username');
        if (uInput) uInput.value = '';
        const pInput = document.getElementById('password');
        if (pInput) pInput.value = '';

        // 6. تحديث شارة الحسابات المحفوظة
        if (typeof updateSavedAccountsBadge === 'function') {
            updateSavedAccountsBadge();
        }

        // 7. تثبيت تاريخ المتصفح لمنع أي رجوع خاطئ للباقات
        try {
            history.replaceState({ screenId: 'auth1-screen' }, '', window.location.pathname);
        } catch (err) { }

        // 8. التوجيه الفوري والحصري لشاشة كتابة كود السيرفر داخل المشغل
        showScreen('auth1-screen', true);
        if (typeof showToast === 'function') {
            showToast('تم تسجيل الخروج من السيرفر بنجاح', 'success');
        }
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'player_server_logout',
                category: 'iptv',
                severity: 'info',
                title: 'تسجيل خروج من سيرفر مشغل الميزو',
                details: { activeServer: (state.serverInfo && state.serverInfo.name) || 'سيرفر' }
            });
        }
    };

    document.getElementById('cancelLogoutBtn').onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const modal = document.querySelector('.custom-logout-modal');
        if (modal) modal.remove();
    };
}

function switchTab(tabId, element) {
    const isAuthed = !!(state.username || (localStorage.getItem('sp_user') && !localStorage.getItem('sp_logged_out')) || sessionStorage.getItem('sp_user'));
    if (!isAuthed) {
        showScreen('auth1-screen');
        return;
    }

    state.activeTab = tabId;
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    // 💡 الإضافة الجديدة: إيقاف البث فوراً إذا ذهب المستخدم لأي قسم آخر غير "المباشر"
    if (tabId !== 'live') {
        if (typeof closeLivePlayer === 'function') {
            closeLivePlayer();
        }
    }

    if (tabId === 'dashboard') {
        showScreen('dashboard-screen');
    } else if (tabId === 'live') {
        if (typeof mizoLoadLogoIndex === 'function') mizoLoadLogoIndex();
        showScreen('live-screen');
        loadCategories('get_live_categories', 'live');
    } else if (tabId === 'movies') {
        showScreen('vod-screen');
        sessionStorage.setItem('sp_active_cat_vod', 'recent');
        const vodGrid = document.getElementById('vodGrid');
        if (vodGrid) {
            vodGrid.innerHTML = `
                <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:350px; color:#fff;">
                    <i class="fas fa-spinner fa-spin" style="font-size:45px; color:#e5b935; margin-bottom:15px;"></i>
                    <span style="font-size:22px; font-weight:bold;">جاري تحميل الأفلام...</span>
                </div>
            `;
            const scrollEl = getScrollTarget('vod');
            if (scrollEl) scrollEl.scrollTop = 0;
        }
        loadCategories('get_vod_categories', 'vod');
    } else if (tabId === 'series') {
        showScreen('vod-screen');
        sessionStorage.setItem('sp_active_cat_series', 'recent');
        const vodGrid = document.getElementById('vodGrid');
        if (vodGrid) {
            vodGrid.innerHTML = `
                <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:350px; color:#fff;">
                    <i class="fas fa-spinner fa-spin" style="font-size:45px; color:#e5b935; margin-bottom:15px;"></i>
                    <span style="font-size:22px; font-weight:bold;">جاري تحميل المسلسلات...</span>
                </div>
            `;
            const scrollEl = getScrollTarget('vod');
            if (scrollEl) scrollEl.scrollTop = 0;
        }
        loadCategories('get_series_categories', 'series');
    } else if (tabId === 'profile') {
        showScreen('profile-screen');
        loadProfileData();
    }
}

function formatSubscriptionDate(raw) {
    if (raw === undefined || raw === null || raw === '' || raw === '0' || raw === 0) {
        return 'غير متوفر';
    }
    if (String(raw).toLowerCase() === 'unlimited' || String(raw).toLowerCase() === 'null') {
        return 'غير محدود (دائم)';
    }

    const num = Number(raw);
    if (!isNaN(num) && num > 0) {
        const timestamp = num > 1e11 ? num : num * 1000;
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${day}/${m}/${y}`;
        }
    }

    if (typeof raw === 'string') {
        const d = new Date(raw.replace(' ', 'T'));
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${day}/${m}/${y}`;
        }
        return raw;
    }

    return 'غير متوفر';
}

async function loadProfileData() {
    let user = state.userInfo;
    if (!user || Object.keys(user).length === 0) {
        try {
            user = JSON.parse(sessionStorage.getItem('sp_user') || localStorage.getItem('sp_user') || '{}');
            state.userInfo = user;
        } catch (e) {
            user = {};
        }
    }

    renderProfileFields(user);

    // Fetch fresh user_info from Xtream server to guarantee live dates & active connections
    const host = (state.hostUrls && state.hostUrls[0]) || sessionStorage.getItem('sp_host');
    const uName = state.username || (user && user.username);
    const pass = state.password || sessionStorage.getItem('sp_pass');

    if (host && uName && pass) {
        const apiUrl = `${host}/player_api.php?username=${encodeURIComponent(uName)}&password=${encodeURIComponent(pass)}`;
        try {
            const data = await proxyFetch(apiUrl, false);
            if (data && data.user_info) {
                state.userInfo = data.user_info;
                sessionStorage.setItem('sp_user', JSON.stringify(data.user_info));
                renderProfileFields(data.user_info);
            }
        } catch (err) {
            console.warn('Profile refresh error:', err);
        }
    }
}

function renderProfileFields(user) {
    if (!user) return;

    // Username
    const uNameEl = document.getElementById('profileUsername');
    if (uNameEl) {
        uNameEl.innerText = user.username || state.username || 'المستخدم';
    }

    // اسم السيرفر النشط — صف موجود في شاشة حساب أندرويد وكان ناقصاً هنا
    const serverEl = document.getElementById('profileServer');
    if (serverEl) {
        let srvName = '';
        try {
            const info = JSON.parse(localStorage.getItem('sp_server_info') || '{}');
            srvName = info && info.name ? info.name : '';
        } catch (e) { }
        serverEl.innerText = srvName || localStorage.getItem('sp_server_code') || '--';
    }

    // Status & Type
    const statusEl = document.getElementById('profileStatus');
    const typeEl = document.getElementById('profileType');
    const isTrial = String(user.is_trial) === '1';

    let statusText = 'متصل';
    // نفس نص أندرويد حرفياً
    let typeText = isTrial ? 'حساب تجريبي' : 'حساب نشط ✓';

    if (user.status) {
        const sLower = String(user.status).toLowerCase();
        if (sLower === 'active') {
            statusText = 'متصل';
            typeText = isTrial ? 'حساب تجريبي' : 'حساب نشط';
        } else if (sLower === 'expired') {
            statusText = 'منتهي';
            typeText = 'حساب منتهي الصلاحية';
        } else if (sLower === 'banned' || sLower === 'disabled') {
            statusText = 'معطل';
            typeText = 'حساب غير نشط';
        } else {
            statusText = user.status;
            typeText = user.status;
        }
    }

    if (statusEl) {
        statusEl.innerText = statusText;
        if (user.status && String(user.status).toLowerCase() === 'expired') {
            statusEl.style.background = 'rgba(217, 36, 36, 0.2)';
            statusEl.style.color = '#ff5252';
        } else {
            statusEl.style.background = '';
            statusEl.style.color = '';
        }
    }
    if (typeEl) typeEl.innerText = typeText;

    // Max connections
    const maxConnEl = document.getElementById('profileMaxConn');
    if (maxConnEl) {
        maxConnEl.innerText = user.max_connections || user.max_cons || '1';
    }

    // Active connections (الرقم الحقيقي من السيرفر: 0 حين لا يشغّل أحد شيئاً)
    const activeConnEl = document.getElementById('profileActiveConn');
    if (activeConnEl) {
        let activeVal = user.active_cons !== undefined ? user.active_cons : (user.active_connections || 0);
        // الرقم الحقيقي من السيرفر: 0 بلا بث، ويزيد بعدد الأجهزة التي تشغّل بثاً
        activeConnEl.innerText = Math.max(0, Number(activeVal) || 0);
    }

    // Created At (تاريخ بدء الاشتراك)
    const rawCreated = (user.created_at !== undefined && user.created_at !== null) ? user.created_at :
                       (user.created !== undefined && user.created !== null) ? user.created :
                       (user.creation_date !== undefined && user.creation_date !== null) ? user.creation_date : user.start_date;
    const createdEl = document.getElementById('profileCreatedAt');
    if (createdEl && rawCreated !== undefined) {
        createdEl.innerText = formatSubscriptionDate(rawCreated);
    }

    // Expire Date (تاريخ انتهاء الاشتراك)
    const rawExp = (user.exp_date !== undefined && user.exp_date !== null) ? user.exp_date :
                   (user.expiration_date !== undefined && user.expiration_date !== null) ? user.expiration_date :
                   (user.expiry_date !== undefined && user.expiry_date !== null) ? user.expiry_date : user.expire_date;
    const expEl = document.getElementById('profileExpAt');
    if (expEl && rawExp !== undefined) {
        expEl.innerText = formatSubscriptionDate(rawExp);
    }

    // Sync preferred player dropdown (Default to hlsjs for super fast live streams)
    let prefPlayer = localStorage.getItem('sp_preferred_player');
    if (!prefPlayer || prefPlayer === 'artplayer') {
        prefPlayer = 'hlsjs';
        localStorage.setItem('sp_preferred_player', 'hlsjs');
    }
    const sel = document.getElementById('playerEngineSelect');
    if (sel) {
        sel.value = prefPlayer;
    }
}

function onPlayerEngineChange(val) {
    localStorage.setItem('sp_preferred_player', val);
    const names = {
        'videojs': 'Video.js (ممتاز للبث والأفلام)',
        'hlsjs': 'hls.js (مخصص للبث المباشر فقط)',
        'mediaelement': 'MediaElement.js',
        'flowplayer': 'Flow Player'
    };
    showToast(`تم اختيار: ${names[val] || val}`, 'success');
}

const fetchCache = {};
// ==========================================
// تعديل: تقليل مدة الكاش إلى 15 دقيقة فقط
// ==========================================
const CACHE_TTL_MS = 15 * 60 * 1000;

function formatRelativeTimeArabic(ts) {
    if (!ts || ts <= 0) return 'الآن';
    const diff = Date.now() - ts;
    if (diff < 5000) return 'الآن';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'منذ ثوانٍ';
    const minutes = Math.floor(diff / 60000);
    if (minutes === 1) return 'قبل دقيقة';
    if (minutes === 2) return 'قبل دقيقتين';
    if (minutes >= 3 && minutes <= 10) return `قبل ${minutes} دقائق`;
    if (minutes < 60) return `قبل ${minutes} دقيقة`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return 'قبل ساعة';
    if (hours === 2) return 'قبل ساعتين';
    if (hours >= 3 && hours <= 10) return `قبل ${hours} ساعات`;
    if (hours < 24) return `قبل ${hours} ساعة`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'قبل يوم';
    if (days === 2) return 'قبل يومين';
    if (days >= 3 && days <= 10) return `قبل ${days} أيام`;
    return `قبل ${days} يوماً`;
}

// دالة تحديث حالة شاشات التحديث على الكروت (نمط مارفل)
function setCardSyncState(type, syncState, timestamp = null) {
    const key = type === 'live' ? 'Live' : (type === 'vod' ? 'Vod' : 'Series');
    const overlay = document.getElementById('overlay' + key);
    const statusBox = document.getElementById('statusBox' + key);
    const btn = document.getElementById('btnRefresh' + key);

    if (syncState === 'updating') {
        if (overlay) {
            overlay.classList.remove('hidden', 'waiting');
        }
        if (btn) btn.classList.add('updating');
        if (statusBox) {
            statusBox.innerHTML = `<span class="card-sync-indicator updating"><i class="fas fa-circle-notch fa-spin"></i> جاري التحديث...</span>`;
        }
    } else if (syncState === 'waiting') {
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('waiting');
        }
        if (btn) btn.classList.remove('updating');
        if (statusBox) {
            statusBox.innerHTML = `<span class="card-sync-indicator waiting"><i class="far fa-clock"></i> في الانتظار...</span>`;
        }
    } else { // 'idle' or 'done'
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('waiting');
        }
        if (btn) btn.classList.remove('updating');
        const ts = timestamp || parseInt(localStorage.getItem('sp_last_updated_' + type) || '0', 10);
        if (statusBox) {
            statusBox.innerHTML = `<span class="card-update-text">آخر تحديث: <span id="lastUpdated${key}">${formatRelativeTimeArabic(ts)}</span></span>`;
        }
    }
}

function updateCardTimestamps() {
    if (isSequentialSyncRunning) return;

    ['live', 'vod', 'series'].forEach(type => {
        const key = type === 'live' ? 'Live' : (type === 'vod' ? 'Vod' : 'Series');
        const el = document.getElementById('lastUpdated' + key);
        if (el) {
            const ts = parseInt(localStorage.getItem('sp_last_updated_' + type) || '0', 10);
            el.innerText = formatRelativeTimeArabic(ts);
        }
    });
}

// تحديث التوقيتات النسبية كل 15 ثانية تلقائياً
setInterval(updateCardTimestamps, 15000);

let isSequentialSyncRunning = false;

// 💡 نظام التحديث التلقائي المتسلسل الإجباري عند كل دخول للمشغل (بشكل منفرد ونمط مارفل تماماً)
/** هل مرّت ساعتان على آخر تحديث لإحدى الباقات؟ (نفس قاعدة أندرويد: OPEN_REFRESH_AFTER_MS) */
const PACKAGES_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
function packagesStale() {
    const types = ['live', 'vod', 'series'];
    for (const t of types) {
        const last = parseInt(localStorage.getItem('sp_last_updated_' + t) || '0', 10);
        if (!last || Date.now() - last > PACKAGES_STALE_AFTER_MS) return true;
    }
    return false;
}

async function runSequentialAutoSync() {
    if (isSequentialSyncRunning) return;

    // التحديث الإجباري في كل فتح كان يُغرق لوحة السيرفر بستة طلبات ثقيلة فيُحظر الـIP.
    // القاعدة الآن كأندرويد: إجباري عند دخول أو تبديل حساب فقط، أو إن تجاوز الكاش ساعتين.
    let accountChanged = false;
    try {
        accountChanged = sessionStorage.getItem('sp_account_changed') === '1';
        if (accountChanged) sessionStorage.removeItem('sp_account_changed');
    } catch (e) { }
    if (!accountChanged && !packagesStale()) {
        if (typeof updateCardTimestamps === 'function') updateCardTimestamps();
        return;
    }

    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    if (!host || !state.username || !state.password) {
        updateCardTimestamps();
        return;
    }

    isSequentialSyncRunning = true;

    // مسح الكاش لإجبار السيرفر على إرسال أحدث البيانات لحظياً
    for (const key in fetchCache) {
        delete fetchCache[key];
    }

    const categories = [
        { type: 'live', action: 'get_live_categories', streams: 'get_live_streams', name: 'البث المباشر' },
        { type: 'vod', action: 'get_vod_categories', streams: 'get_vod_streams', name: 'الأفلام' },
        { type: 'series', action: 'get_series_categories', streams: 'get_series', name: 'المسلسلات' }
    ];

    // المرحلة الأولى: وضع الأولى في جاري التحديث، والأخريين في الانتظار (مطابق لصورة مارفل)
    setCardSyncState('live', 'updating');
    setCardSyncState('vod', 'waiting');
    setCardSyncState('series', 'waiting');

    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];

        // ضع البطاقة الحالية في جاري التحديث
        setCardSyncState(cat.type, 'updating');

        // ضع البطاقات اللاحقة في وضع الانتظار
        for (let j = i + 1; j < categories.length; j++) {
            setCardSyncState(categories[j].type, 'waiting');
        }

        try {
            await dropStreamsCache(cat.type);
            const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${cat.action}`;
            // الأقسام والقائمة معاً: طلبان متزامنان فقط، وهو سقف بوابة اللوحة نفسه (كالتحديث
            // اليدوي)، والباقات الثلاث تبقى متسلسلة. كان الطلبان متتاليين فيتضاعف الانتظار.
            await Promise.all([
                proxyFetch(url, false),
                (cat.streams && typeof getAllStreamsForType === 'function')
                    ? getAllStreamsForType(cat.type, cat.streams).catch(() => { })
                    : Promise.resolve()
            ]);
            const now = Date.now();
            localStorage.setItem('sp_last_updated_' + cat.type, String(now));
            setCardSyncState(cat.type, 'idle', now);
        } catch (err) {
            console.warn(`[AutoSync] Error updating ${cat.name}`, err);
            const now = Date.now();
            setCardSyncState(cat.type, 'idle', now);
        }

        // مهلة بصرية قصيرة بين البطاقات فقط، لا بعد الأخيرة (كانت 350ms بعد كل واحدة)
        if (i < categories.length - 1) await new Promise(resolve => setTimeout(resolve, 120));
    }

    isSequentialSyncRunning = false;
    updateCardTimestamps();
}

/**
 * يُسقط كاش قائمة نوع واحد (من الذاكرة ومن القرص) حتى يُجلب من السيرفر فعلاً.
 * التحديث التلقائي كان يمسح كاش الأقسام وحده، فتُقرأ قوائم القنوات والأفلام من نسخة
 * القرص (صالحة 12 ساعة) وتُعلَّم البطاقة "آخر تحديث: الآن" والمحتوى الجديد لا يظهر.
 */
async function dropStreamsCache(type) {
    try {
        const streamsAction = type === 'live' ? 'get_live_streams' : (type === 'vod' ? 'get_vod_streams' : 'get_series');
        const streamsKey = `${state.username || ''}_${streamsAction}`;
        delete globalStreamsCache[streamsKey];
        delete globalStreamsInFlight[streamsKey];
        const db = await openPersistCacheDb();
        if (db) {
            await new Promise(function (resolve) {
                const tx = db.transaction(PERSIST_CACHE_STORE, 'readwrite');
                tx.objectStore(PERSIST_CACHE_STORE).delete(streamsKey);
                tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
            });
        }
    } catch (e) { }
}

async function manualRefreshCategory(type, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    if (!host || !state.username || !state.password) return;

    setCardSyncState(type, 'updating');

    for (const key in fetchCache) {
        delete fetchCache[key];
    }

    // إصلاح مهم: زر التحديث كان يمسح كاش الأقسام فقط ولا يمسح كاش قوائم القنوات/الأفلام/المسلسلات،
    // فكانت الإضافات الجديدة على السيرفر لا تظهر للمستخدم حتى بعد الضغط على "تحديث".
    await dropStreamsCache(type);

    let action = 'get_live_categories';
    let typeName = 'البث المباشر';
    if (type === 'vod') { action = 'get_vod_categories'; typeName = 'الأفلام'; }
    if (type === 'series') { action = 'get_series_categories'; typeName = 'المسلسلات'; }

    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);

    try {
        const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;

        // تحديث فعلي كامل: نجلب الأقسام والقوائم معاً من السيرفر مباشرة (بدون كاش)،
        // بدل الاكتفاء بمسح الذاكرة المؤقتة كما كان سابقاً
        const streamsAction = type === 'live' ? 'get_live_streams' : (type === 'vod' ? 'get_vod_streams' : 'get_series');

        const [, freshStreams] = await Promise.all([
            proxyFetch(url, false),
            getAllStreamsForType(type === 'live' ? 'live' : (type === 'vod' ? 'vod' : 'series'), streamsAction)
        ]);

        const now = Date.now();
        localStorage.setItem('sp_last_updated_' + type, String(now));
        setCardSyncState(type, 'idle', now);

        // تحديث الواجهة المعروضة حالياً إن كانت تخص نفس النوع، حتى يرى المستخدم الجديد فوراً
        try {
            if (currentScreenId === 'live-screen' && type === 'live') {
                loadCategories('get_live_categories', 'live');
            } else if (currentScreenId === 'vod-screen' &&
                       ((type === 'vod' && state.activeTab === 'movies') || (type === 'series' && state.activeTab === 'series'))) {
                loadCategories(type === 'vod' ? 'get_vod_categories' : 'get_series_categories', state.activeTab);
            }
        } catch (e) { }

        // تحديث عدّاد عناصر الباقة على البطاقة إن كان متاحاً
        try {
            if (typeof updateCardItemsCount === 'function' && Array.isArray(freshStreams)) {
                updateCardItemsCount(type, freshStreams.length);
            }
        } catch (e) { }

        if (typeof showToast === 'function') {
            const count = Array.isArray(freshStreams) ? freshStreams.length : 0;
            showToast(count > 0
                ? `تم تحديث باقة ${typeName} بنجاح (${count} عنصر)`
                : `تم تحديث باقة ${typeName} بنجاح`, 'success');
        }
    } catch (e) {
        console.warn('Manual refresh failed', e);
        const now = Date.now();
        setCardSyncState(type, 'idle', now);
        if (typeof showToast === 'function') {
            showToast(`تعذر تحديث باقة ${typeName}`, 'warning');
        }
    }
}

function forceRefreshData() {
    for (const key in fetchCache) {
        delete fetchCache[key];
    }
    for (const key in globalStreamsCache) {
        delete globalStreamsCache[key];
    }
    for (const key in globalStreamsInFlight) {
        delete globalStreamsInFlight[key];
    }
    // مسح الكاش الدائم أيضاً حتى يكون "تحديث كامل" فعلياً من السيرفر
    clearPersistCache();
    showToast('جاري التحديث...', 'info');
    if (currentScreenId === 'vod-screen') {
        loadCategories(state.activeTab === 'movies' ? 'get_vod_categories' : 'get_series_categories', state.activeTab);
    } else if (currentScreenId === 'live-screen') {
        loadCategories('get_live_categories', 'live');
    } else {
        loadProfileData();
    }
}

/**
 * بوابة واحدة لكل طلبات لوحة السيرفر — نفس القاعدة المطبّقة في تطبيق أندرويد.
 *
 * لوحات Xtream تحظر الـIP عند رشقات الطلبات، وقد تأكّد ذلك عملياً: حين يقع الحظر يفشل
 * المتصفح أيضاً على نفس الشبكة، ويزول بتغيير الإنترنت. برنامج الكمبيوتر كان يتصل باللوحة
 * مباشرة بلا أي تنظيم، ويطلق طلبين ثقيلين معاً عند التحديث.
 *
 * الحد هنا: اتصالان متزامنان كحد أقصى، وربع ثانية على الأقل بين بداية طلب وآخر
 * (أربعة طلبات في الثانية سقفاً للبرنامج كله). سقف لا يمكن تجاوزه من أي شاشة.
 */
var PANEL_MAX_CONCURRENT = 2;
var PANEL_MIN_GAP_MS = 250;
var panelActiveCount = 0;
var panelLastStartedAt = 0;
var panelWaitQueue = [];

function panelGatePump() {
    if (!panelWaitQueue.length || panelActiveCount >= PANEL_MAX_CONCURRENT) return;
    var wait = panelLastStartedAt + PANEL_MIN_GAP_MS - Date.now();
    if (wait > 0) {
        setTimeout(panelGatePump, wait);
        return;
    }
    panelLastStartedAt = Date.now();
    panelActiveCount++;
    var run = panelWaitQueue.shift();
    run();
}

/** نفس fetch لكن عبر البوابة. يُستعمل لكل ما يذهب إلى لوحة السيرفر دون استثناء. */
function panelFetch(url, options) {
    return new Promise(function (resolve, reject) {
        panelWaitQueue.push(function () {
            var done = function () {
                panelActiveCount--;
                panelGatePump();
            };
            fetch(url, options).then(function (res) {
                done();
                resolve(res);
            }, function (err) {
                done();
                reject(err);
            });
        });
        panelGatePump();
    });
}

async function proxyFetch(apiUrl, useCache = true) {
    if (useCache && fetchCache[apiUrl]) {
        const cacheEntry = fetchCache[apiUrl];
        if (Date.now() - cacheEntry.time < CACHE_TTL_MS) {
            try {
                const data = await cacheEntry.promise;
                return Array.isArray(data) ? [...data] : (data && typeof data === 'object' ? Object.assign({}, data) : data);
            } catch (e) {
                // Ignore and fetch again if promise failed
            }
        }
    }

    const targetUrl = getProxyUrl(apiUrl);
    const burstUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

    const fetchPromise = panelFetch(burstUrl, { cache: 'no-store' }).then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data && data.error) {
            throw new Error(data.message || 'API error');
        }
        return data;
    });

    if (useCache) {
        fetchCache[apiUrl] = { promise: fetchPromise, time: Date.now() };
    }

    try {
        const data = await fetchPromise;
        return Array.isArray(data) ? [...data] : (data && typeof data === 'object' ? Object.assign({}, data) : data);
    } catch (e) {
        if (useCache) delete fetchCache[apiUrl];
        throw e;
    }
}

// ==========================================
// 1. دالة تحميل الأقسام (مصححة)
// ==========================================
async function loadCategories(action, type) {
    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;

    let container = '';
    if (type === 'live') {
        container = document.getElementById('liveCategories');
    } else {
        container = document.getElementById('vodCategories');
    }
    container.innerHTML = '';

    const effectiveType = (type === 'movies') ? 'vod' : type;
    const favsList = JSON.parse(localStorage.getItem('sp_favs_' + effectiveType) || '[]');
    const contList = JSON.parse(localStorage.getItem('sp_continue_' + effectiveType) || '[]');
    const favsCount = favsList.length;
    const contCount = contList.length;

    // استرجاع العدادات المحفوظة محلياً لضمان ظهور الأرقام فوراً وبدون أي تأخير
    const countsCacheKey = 'sp_counts_' + (state.username || '') + '_' + effectiveType;
    let cachedCounts = {};
    try {
        cachedCounts = JSON.parse(localStorage.getItem(countsCacheKey) || '{}');
    } catch (e) { }

    let specialCats = [
        { id: 'all', name: 'الكل', count: (cachedCounts['all'] !== undefined && cachedCounts['all'] !== '') ? cachedCounts['all'] : '' },
        { id: 'favs', name: 'المفضلة', count: favsCount > 0 ? favsCount : (cachedCounts['favs'] !== undefined ? cachedCounts['favs'] : 0) },
        { id: 'continue', name: 'متابعة المشاهدة', count: contCount > 0 ? contCount : (cachedCounts['continue'] !== undefined ? cachedCounts['continue'] : 0) },
        { id: 'recent', name: 'المضافة حديثاً', count: cachedCounts['recent'] || 20 }
    ];

    if (effectiveType === 'live') {
        specialCats = specialCats.filter(c => c.id !== 'continue' && c.id !== 'recent');
    }

    specialCats.forEach(cat => {
        const el = document.createElement('div');
        el.className = 'list-item special-category';
        const displayVal = cat.count !== '' ? cat.count : '';
        el.innerHTML = `
            <span class="cat-name">${cat.name}</span>
            <span class="cat-count" data-cat-id="${cat.id}">${displayVal}</span>
        `;
        el.onclick = () => {
            sessionStorage.setItem('sp_active_cat_' + type, cat.id);
            document.querySelectorAll(`#${container.id} .list-item`).forEach(i => i.classList.remove('active'));
            el.classList.add('active');

            if (type === 'live') {
                const titleEl = document.getElementById('liveItemsCategoryTitle');
                if (titleEl) titleEl.innerText = cat.name || 'القنوات';
                loadStreams('get_live_streams', cat.id, 'live');
            } else {
                let stAction = type === 'vod' ? 'get_vod_streams' : 'get_series';
                loadStreams(stAction, cat.id, type);
            }
        };
        container.appendChild(el);
    });

    try {
        const categories = await proxyFetch(url);

        categories.forEach(cat => {
            const rawName = (cat.category_name || '').trim().toUpperCase();
            if (rawName === 'LAST ADDED' || rawName === 'المضافة حديثاً' || rawName === 'المضاف حديثا') {
                return; // تجنب تكرار خانة المضافة حديثاً لأنها أصبحت خانة خاصة أساسية ثابتة
            }

            const el = document.createElement('div');
            el.className = 'list-item';
            let apiCount = undefined;
            const countKeys = ['count', 'stream_count', 'series_count', 'channel_count', 'num', 'total', 'total_items'];
            for (let ci = 0; ci < countKeys.length; ci++) {
                const val = cat[countKeys[ci]];
                if (val !== undefined && val !== null) { apiCount = val; break; }
            }
            const displayCount = (apiCount !== undefined && apiCount !== null && apiCount !== '')
                ? apiCount
                : ((cachedCounts[cat.category_id] !== undefined && cachedCounts[cat.category_id] !== null) ? cachedCounts[cat.category_id] : '');

            if (apiCount !== undefined && apiCount !== null && apiCount !== '') {
                cachedCounts[cat.category_id] = apiCount;
            }

            el.innerHTML = `
                <span class="cat-name">${cat.category_name}</span>
                <span class="cat-count" data-cat-id="${cat.category_id}">${displayCount}</span>
            `;
            el.onclick = () => {
                sessionStorage.setItem('sp_active_cat_' + type, cat.category_id);
                document.querySelectorAll(`#${container.id} .list-item`).forEach(i => i.classList.remove('active'));
                el.classList.add('active');

                if (type === 'live') {
                    const titleEl = document.getElementById('liveItemsCategoryTitle');
                    if (titleEl) titleEl.innerText = cat.category_name || 'القنوات';
                    loadStreams('get_live_streams', cat.category_id, 'live');
                } else {
                    let stAction = type === 'vod' ? 'get_vod_streams' : 'get_series';
                    loadStreams(stAction, cat.category_id, type);
                }
            };
            container.appendChild(el);
        });

        try {
            localStorage.setItem(countsCacheKey, JSON.stringify(cachedCounts));
        } catch (e) { }

        setTimeout(() => {
            fetchCategoryCounts(type, container.id);
        }, 1200);

        const savedCatId = sessionStorage.getItem('sp_active_cat_' + type);
        let defaultClicked = false;

        // فتح الأفلام والمسلسلات يبدأ دائماً من "المضافة حديثاً" (القسم المحفوظ يُضبط إلى
        // recent عند الضغط على البطاقة). كان recent مستثنى هنا فيُفتح أول قسم عادي بدلاً منه.
        if (savedCatId) {
            const savedCatEl = Array.from(container.querySelectorAll('.list-item')).find(el => {
                const countSpan = el.querySelector('.cat-count');
                return countSpan && countSpan.getAttribute('data-cat-id') === String(savedCatId);
            });
            if (savedCatEl) {
                savedCatEl.click();
                defaultClicked = true;
            }
        }

        if (!defaultClicked) {
            // فتح أول قسم فعلي مباشر يحتوي على محتويات سريعة التحميل
            const firstReal = container.querySelector('.list-item:not(.special-category)') || container.querySelector('.list-item');
            if (firstReal) {
                firstReal.click();
                defaultClicked = true;
            }
        }
    } catch (e) {
        console.error("Load Categories Error:", e);
        container.innerHTML = '<div class="empty-state">فشل في تحميل الأقسام</div>';
    }
}

// ==========================================
// 2. محرك كاش وتنسيق طلبات البث الموحد (Shared Streams Cache Engine)
// ==========================================
const globalStreamsCache = {};
const globalStreamsInFlight = {};

// ==========================================
// كاش دائم على القرص (IndexedDB) لقوائم القنوات والأفلام والمسلسلات
// ------------------------------------------
// المشكلة السابقة: الكاش كان في الذاكرة فقط ولمدة 10 دقائق، أي أن كل فتح جديد للتطبيق
// (وكل 10 دقائق أثناء الاستخدام) كان يعيد تحميل كامل قوائم السيرفر من جديد
// (عشرات آلاف العناصر = استهلاك بيانات كبير جداً وبطء واضح في الفتح).
// الحل: تخزين القوائم على القرص داخل التطبيق لتبقى بعد إغلاقه، مع تحديثها دورياً
// أو فور ضغط المستخدم على زر تحديث الباقة.
// ==========================================
const PERSIST_CACHE_DB = 'almezo_streams_cache';
const PERSIST_CACHE_STORE = 'catalogs';
const PERSIST_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;       // 10 دقائق (الذاكرة السريعة)

function openPersistCacheDb() {
    return new Promise((resolve) => {
        try {
            if (!window.indexedDB) return resolve(null);
            const req = indexedDB.open(PERSIST_CACHE_DB, 1);
            req.onupgradeneeded = () => {
                try {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(PERSIST_CACHE_STORE)) {
                        db.createObjectStore(PERSIST_CACHE_STORE);
                    }
                } catch (e) { }
            };
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

async function readPersistCache(key) {
    try {
        const db = await openPersistCacheDb();
        if (!db) return null;
        return await new Promise((resolve) => {
            try {
                const tx = db.transaction(PERSIST_CACHE_STORE, 'readonly');
                const req = tx.objectStore(PERSIST_CACHE_STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    } catch (e) {
        return null;
    }
}

async function writePersistCache(key, data) {
    try {
        const db = await openPersistCacheDb();
        if (!db) return;
        const tx = db.transaction(PERSIST_CACHE_STORE, 'readwrite');
        tx.objectStore(PERSIST_CACHE_STORE).put({ data: data, time: Date.now() }, key);
    } catch (e) { }
}

async function clearPersistCache() {
    try {
        const db = await openPersistCacheDb();
        if (!db) return;
        const tx = db.transaction(PERSIST_CACHE_STORE, 'readwrite');
        tx.objectStore(PERSIST_CACHE_STORE).clear();
    } catch (e) { }
}
window.clearPersistCache = clearPersistCache;

async function getAllStreamsForType(type, action) {
    const cacheKey = `${state.username || ''}_${action}`;

    // 1) الذاكرة السريعة (نفس الجلسة)
    if (globalStreamsCache[cacheKey] && Array.isArray(globalStreamsCache[cacheKey].data)) {
        if (Date.now() - globalStreamsCache[cacheKey].time < MEMORY_CACHE_TTL_MS) {
            return globalStreamsCache[cacheKey].data;
        }
    }

    if (globalStreamsInFlight[cacheKey]) {
        return await globalStreamsInFlight[cacheKey];
    }

    // 2) الكاش الدائم على القرص (يبقى بعد إغلاق التطبيق = بلا استهلاك بيانات جديد)
    try {
        const persisted = await readPersistCache(cacheKey);
        if (persisted && Array.isArray(persisted.data) && persisted.data.length > 0 &&
            (Date.now() - persisted.time) < PERSIST_CACHE_TTL_MS) {
            globalStreamsCache[cacheKey] = { data: persisted.data, time: Date.now() };
            return persisted.data;
        }
    } catch (e) { }

    // 3) التحميل من السيرفر (أول مرة أو بعد انتهاء صلاحية الكاش أو بعد تحديث يدوي)
    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;

    globalStreamsInFlight[cacheKey] = proxyFetch(url).then(data => {
        const list = Array.isArray(data) ? data : [];
        globalStreamsCache[cacheKey] = { data: list, time: Date.now() };
        if (list.length > 0) {
            writePersistCache(cacheKey, list);
        }
        delete globalStreamsInFlight[cacheKey];
        return list;
    }).catch(err => {
        delete globalStreamsInFlight[cacheKey];
        throw err;
    });

    return await globalStreamsInFlight[cacheKey];
}

window.getAllStreamsForType = getAllStreamsForType;
window.globalStreamsCache = globalStreamsCache;
window.proxyFetch = proxyFetch;

async function getAllCategoriesForType(type) {
    let action = type === 'live' ? 'get_live_categories' : (type === 'vod' ? 'get_vod_categories' : 'get_series_categories');
    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;
    return await proxyFetch(url).catch(() => []);
}
window.getAllCategoriesForType = getAllCategoriesForType;

async function fetchCategoryCounts(type, containerId) {
    let action = type === 'live' ? 'get_live_streams' : (type === 'vod' ? 'get_vod_streams' : 'get_series');

    try {
        const streams = await getAllStreamsForType(type, action);
        if (!Array.isArray(streams)) return;

        const counts = {};
        streams.forEach(s => {
            if (s.category_id) {
                counts[s.category_id] = (counts[s.category_id] || 0) + 1;
            }
            if (s.category_ids && Array.isArray(s.category_ids)) {
                s.category_ids.forEach(cid => {
                    counts[cid] = (counts[cid] || 0) + 1;
                });
            }
        });

        // حفظ كافة العدادات المحسوبة في التخزين المحلي لظهور فوري دائم
        const effectiveType = (type === 'movies') ? 'vod' : type;
        const favsList = JSON.parse(localStorage.getItem('sp_favs_' + effectiveType) || '[]');
        const contList = JSON.parse(localStorage.getItem('sp_continue_' + effectiveType) || '[]');
        const validFavs = streams.filter(s => favsList.includes(String(s.stream_id || s.series_id))).length;
        const validCont = streams.filter(s => contList.includes(String(s.stream_id || s.series_id))).length;

        counts['all'] = streams.length;
        counts['recent'] = Math.min(streams.length, 20);
        counts['favs'] = validFavs > 0 ? validFavs : (favsList.length > 0 ? favsList.length : 0);
        counts['continue'] = validCont > 0 ? validCont : (contList.length > 0 ? contList.length : 0);

        const allSpan = document.querySelector(`#${containerId} [data-cat-id="all"]`);
        if (allSpan) allSpan.innerText = counts['all'];

        const recentSpan = document.querySelector(`#${containerId} [data-cat-id="recent"]`);
        if (recentSpan) recentSpan.innerText = counts['recent'];

        const favSpan = document.querySelector(`#${containerId} [data-cat-id="favs"]`);
        if (favSpan) favSpan.innerText = counts['favs'];

        const contSpan = document.querySelector(`#${containerId} [data-cat-id="continue"]`);
        if (contSpan) contSpan.innerText = counts['continue'];

        for (const catId in counts) {
            const span = document.querySelector(`#${containerId} [data-cat-id="${catId}"]`);
            if (span) {
                const catNameEl = span.previousElementSibling;
                const text = catNameEl ? catNameEl.innerText.toLowerCase() : '';

                if (text.includes('حديث') || text.includes('recent') || text.includes('added') || text.includes('جديد')) {
                    span.innerText = Math.min(counts[catId], 20);
                } else {
                    span.innerText = counts[catId];
                }
            }
        }

        const countsCacheKey = 'sp_counts_' + (state.username || '') + '_' + effectiveType;
        try {
            const existing = JSON.parse(localStorage.getItem(countsCacheKey) || '{}');
            const merged = Object.assign(existing, counts);
            localStorage.setItem(countsCacheKey, JSON.stringify(merged));
        } catch (e) { }
    } catch (e) {
        console.error('Failed to fetch counts', e);
    }
}

// ==========================================
// 3. دالة تحميل المحتوى الفورية الذكية
// ==========================================
async function loadStreams(action, categoryId, type) {
    const specialIds = ['all', 'favs', 'continue', 'recent'];
    const cacheKey = `${state.username || ''}_${action}`;

    let container = '';
    const loadingHtml = `
        <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:300px; color:#fff;">
            <i class="fas fa-spinner fa-spin" style="font-size:45px; color:#e5b935; margin-bottom:15px;"></i>
            <span style="font-size:24px; font-weight:bold;">جاري التحميل...</span>
        </div>
    `;

    if (type === 'live') {
        container = document.getElementById('liveChannels');
        if (container) {
            container.innerHTML = loadingHtml;
            container.scrollTop = 0;
        }
    } else {
        container = document.getElementById('vodGrid');
        if (container) {
            container.innerHTML = loadingHtml;
            container.scrollTop = 0;
            if (container.parentElement) container.parentElement.scrollTop = 0;
        }
    }

    try {
        let items = [];
        // استخدام الكاش المشترك الفوري في حال كانت الباقة محملة أو جاري تحميلها أو لقسم خاص
        if (specialIds.includes(categoryId) || (globalStreamsCache[cacheKey] && Array.isArray(globalStreamsCache[cacheKey].data)) || globalStreamsInFlight[cacheKey]) {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
            const allStreams = await Promise.race([getAllStreamsForType(type, action), timeoutPromise]);
            if (specialIds.includes(categoryId)) {
                items = [...allStreams];
            } else {
                items = allStreams.filter(s => String(s.category_id) === String(categoryId) || (Array.isArray(s.category_ids) && s.category_ids.map(String).includes(String(categoryId))));
            }
        } else {
            const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
            const user = encodeURIComponent(state.username);
            const pass = encodeURIComponent(state.password);
            let url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}&category_id=${categoryId}`;
            let itemsRaw = await proxyFetch(url);
            items = Array.isArray(itemsRaw) ? itemsRaw : [];
        }
        if (!Array.isArray(items)) {
            items = [];
        }

        const isRecentCategory = (name) => {
            if (!name) return false;
            const text = name.toLowerCase();
            return text.includes('حديث') || text.includes('recent') || text.includes('added') || text.includes('جديد');
        };

        const activeCat = document.querySelector(`#${type === 'live' ? 'liveCategories' : 'vodCategories'} .list-item.active .cat-name`);
        const catName = activeCat ? activeCat.innerText : '';
        if (type === 'live' && catName) {
            const titleEl = document.getElementById('liveItemsCategoryTitle');
            if (titleEl) titleEl.innerText = catName;
        }

        const effectiveType = (type === 'movies') ? 'vod' : type;

        if (categoryId === 'favs') {
            const favs = JSON.parse(localStorage.getItem('sp_favs_' + effectiveType) || '[]');
            items = items.filter(item => favs.includes(String(item.stream_id || item.series_id))).slice(0, 30);
        } else if (categoryId === 'continue') {
            const cont = JSON.parse(localStorage.getItem('sp_continue_' + effectiveType) || '[]');
            items = items.filter(item => cont.includes(String(item.stream_id || item.series_id)));
            items.sort((a, b) => cont.indexOf(String(a.stream_id || a.series_id)) - cont.indexOf(String(b.stream_id || b.series_id)));
            items = items.slice(0, 30);
        } else if (categoryId === 'recent' || isRecentCategory(catName)) {
            items.sort((a, b) => {
                const parseAddedTime = (item) => {
                    if (!item) return 0;
                    const val = item.added;
                    const fallbackId = Number(item.stream_id || item.series_id || 0) || 0;
                    if (!val) return fallbackId;
                    if (typeof val === 'number') {
                        return val < 100000000000 ? val * 1000 : val;
                    }
                    if (typeof val === 'string') {
                        const trimmed = val.trim();
                        if (!isNaN(trimmed)) {
                            const num = Number(trimmed);
                            return num < 100000000000 ? num * 1000 : num;
                        }
                        const parsedIso = Date.parse(trimmed.replace(' ', 'T'));
                        if (!isNaN(parsedIso)) return parsedIso;
                        const parsedDirect = Date.parse(trimmed);
                        if (!isNaN(parsedDirect)) return parsedDirect;
                    }
                    return fallbackId;
                };
                return parseAddedTime(b) - parseAddedTime(a);
            });
            items = items.slice(0, 20);
        }

        originalItemsArray = items;
        currentItemsArray = [...items];
        currentSortContext = type;

        const activeCatBadge = document.querySelector(`#${type === 'live' ? 'liveCategories' : 'vodCategories'} .list-item.active .cat-count`);
        if (activeCatBadge) {
            activeCatBadge.innerText = items.length;
        }

        // حفظ عداد هذا القسم فوراً في التخزين المحلي ليبقى ظاهراً دوماً
        try {
            const effectiveType = (type === 'movies') ? 'vod' : type;
            const cKey = 'sp_counts_' + (state.username || '') + '_' + effectiveType;
            const curCounts = JSON.parse(localStorage.getItem(cKey) || '{}');
            curCounts[categoryId] = items.length;
            if (categoryId === 'all') curCounts['all'] = items.length;
            localStorage.setItem(cKey, JSON.stringify(curCounts));
        } catch (e) { }

        renderItems(currentItemsArray, type);
    } catch (e) {
        console.error("Load Streams Error:", e);
        const retryHtml = `
            <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:300px; color:#fff; text-align:center; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size:50px; color:#ef4444; margin-bottom:16px;"></i>
                <span style="font-size:22px; font-weight:bold; margin-bottom:14px;">تعذر تحميل المحتوى حالياً</span>
                <button class="btn-primary" style="background:#22c55e; color:#fff; border:none; padding:12px 28px; border-radius:10px; font-weight:bold; cursor:pointer; font-size:16px;" onclick="loadStreams('${action}', '${categoryId}', '${type}')">
                    <i class="fas fa-redo-alt"></i> إعادة المحاولة
                </button>
            </div>
        `;
        if (container) container.innerHTML = retryHtml;
    }
}

// ==========================================
// PLAYER LOGIC
// ==========================================
let art = null;
let hlsInstance = null;
let tsInstance = null;

// Track the current stream info for refreshing
let currentStreamInfo = null;

function handleExternalPlayer(playerType, streamUrl, title) {
    if (playerType === 'vlc') {
        showToast('جاري فتح الرابط في VLC Player...', 'info');
        window.location.href = `vlc://${streamUrl}`;
    } else if (playerType === 'potplayer') {
        showToast('جاري فتح الرابط في PotPlayer...', 'info');
        window.location.href = `potplayer://${streamUrl}`;
    } else if (playerType === 'mx') {
        showToast('جاري فتح الرابط في MX Player...', 'info');
        window.location.href = `intent:${streamUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end`;
    }
}

function openNativeFullscreen(el) {
    el = el || document.getElementById('fullscreenVideoModal') || document.documentElement;
    try {
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => { });
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
            el.msRequestFullscreen();
        }
    } catch (e) {
        console.warn('Native fullscreen request failed', e);
    }
}

function exitNativeFullscreen() {
    // ملء الشاشة عندنا ثلاث طبقات: صنف الصفحة، وملء شاشة المتصفح، ونافذة إلكترون.
    // كان يُلغى الأول فقط فيبقى البرنامج ملء الشاشة بعد إغلاق الفيديو.
    try {
        const liveWrap = document.getElementById('livePlayerWrapper');
        if (liveWrap && liveWrap.classList.contains('live-fullscreen-mode')
            && typeof toggleLivePlayerFullscreen === 'function') {
            toggleLivePlayerFullscreen(false);
        }
    } catch (e) { }
    try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullScreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => { });
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    } catch (e) { }
}

function toggleLivePlayerFullscreen(forceState) {
    const liveWrap = document.getElementById('livePlayerWrapper');
    if (!liveWrap) return;

    // في نظام أندرويد: الانتقال فوراً إلى مشغل ExoPlayer الأصيل الموحد بكامل كفاءته العتادية وواجهته
    const isAndroid = !!(window.AndroidNativeBridge || (window.AlMeZ0App && window.AlMeZ0App.isAndroid));
    if (isAndroid && currentStreamInfo && currentStreamInfo.type === 'live') {
        playCurrentLiveNative();
        return;
    }

    const currentlyFs = liveWrap.classList.contains('live-fullscreen-mode');
    const targetFs = (typeof forceState === 'boolean') ? forceState : !currentlyFs;

    const icon1 = document.getElementById('liveFullscreenIcon');
    const icon2 = document.getElementById('liveOverlayFsIcon');
    const customFsBtn = document.querySelector('.custom-vjs-fs-btn');

    if (targetFs) {
        liveWrap.classList.add('live-fullscreen-mode');
        document.body.classList.add('in-live-fullscreen');
        if (icon1) icon1.className = 'fas fa-compress';
        if (icon2) icon2.className = 'fas fa-compress';
        if (customFsBtn) {
            customFsBtn.innerHTML = '<i class="fas fa-compress"></i>';
            customFsBtn.title = 'تصغير الشاشة';
        }

        try {
            if (!document.fullscreenElement && !window.electronAPI && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } catch (e) { }

        if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.setImmersiveFullscreen === 'function') {
            window.AndroidNativeBridge.setImmersiveFullscreen(true);
        }
    } else {
        liveWrap.classList.remove('live-fullscreen-mode');
        document.body.classList.remove('in-live-fullscreen');
        if (icon1) icon1.className = 'fas fa-expand';
        if (icon2) icon2.className = 'fas fa-expand';
        if (customFsBtn) {
            customFsBtn.innerHTML = '<i class="fas fa-expand"></i>';
            customFsBtn.title = 'ملء الشاشة';
        }

        try {
            if (!window.electronAPI && (document.fullscreenElement || document.webkitFullscreenElement)) {
                if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        } catch (e) { }

        if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.setImmersiveFullscreen === 'function') {
            window.AndroidNativeBridge.setImmersiveFullscreen(false);
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const liveWrap = document.getElementById('livePlayerWrapper');
    if (!fsEl && !window.electronAPI && liveWrap && liveWrap.classList.contains('live-fullscreen-mode')) {
        toggleLivePlayerFullscreen(false);
    }
});

// اختصارات الكيبورد على الكمبيوتر (Escape للخروج من ملء الشاشة، و F للتبديل السريع)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const liveWrap = document.getElementById('livePlayerWrapper');
        const inLiveFs = liveWrap && liveWrap.classList.contains('live-fullscreen-mode');
        const inVideoFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (inLiveFs) {
            toggleLivePlayerFullscreen(false);
            e.preventDefault();
            e.stopPropagation();
        } else if (inVideoFs) {
            exitNativeFullscreen();
            e.preventDefault();
            e.stopPropagation();
        }
        // خارج ملء الشاشة: يكمل Escape طريقه المعتاد (الرجوع للشاشة السابقة)
    } else if ((e.key === 'f' || e.key === 'F') && !e.target.matches('input, textarea, select')) {
        const liveWrap = document.getElementById('livePlayerWrapper');
        if (liveWrap && currentStreamInfo && currentStreamInfo.type === 'live') {
            toggleLivePlayerFullscreen();
        }
    }
});

let closeBtnTimeout = null;

function resetCloseBtnInactivityTimer() {
    const btn = document.querySelector('.btn-close-video');
    if (!btn) return;

    btn.classList.remove('idle-hidden');
    clearTimeout(closeBtnTimeout);

    const modal = document.getElementById('fullscreenVideoModal');
    if (modal && !modal.classList.contains('hidden')) {
        closeBtnTimeout = setTimeout(() => {
            btn.classList.add('idle-hidden');
        }, 3000);
    }
}

// Show close button on mouse move, touch, or click
document.addEventListener('mousemove', resetCloseBtnInactivityTimer);
document.addEventListener('touchstart', resetCloseBtnInactivityTimer);
document.addEventListener('click', resetCloseBtnInactivityTimer);

function closeFullscreenPlayer(isFromPopState = false) {
    clearTimeout(closeBtnTimeout);
    if (window.vjsPlayer && currentStreamInfo && currentStreamInfo.type !== 'live') {
        try {
            const cur = window.vjsPlayer.currentTime();
            const dur = window.vjsPlayer.duration();
            if (dur > 0 && cur > 5 && (dur - cur) > 10) {
                localStorage.setItem(`sp_progress_${currentStreamInfo.type}_${currentStreamInfo.id}`, cur);
            }
        } catch (e) { }
    }
    exitNativeFullscreen();
    if (window.vjsPlayer) {
        try {
            window.vjsPlayer.pause();
            window.vjsPlayer.dispose();
        } catch (e) { }
        window.vjsPlayer = null;
    }
    if (art) {
        art.destroy(false);
        art = null;
    }
    // 💡 التعديل هنا: إيقاف وتدمير مكتبة HLS للفل سكرين بشكل صحيح
    if (window.hlsInstance) {
        try {
            window.hlsInstance.detachMedia();
            window.hlsInstance.destroy();
        } catch (e) { }
        window.hlsInstance = null;
    }
    const container = document.getElementById('fullscreenVideoContainer');
    if (container) container.innerHTML = '';

    const modal = document.getElementById('fullscreenVideoModal');
    const wasOpen = !!(modal && !modal.classList.contains('hidden'));
    if (modal) modal.classList.add('hidden');

    /*
     * الرجوع في التاريخ يُلغي حالة {modal:'fullscreen'} التي دفعناها عند فتح المشغل
     * بملء الشاشة — فقط إن كنا قد دفعناها فعلاً.
     *
     * كان history.back() يُنفَّذ بلا شرط، وتُستدعى هذه الدالة احتياطاً لإيقاف أي فيديو
     * من تسجيل الخروج ومن تبديل السيرفر والمشغل مغلق أصلاً، فيرجع المتصفح خطوة إلى
     * index.html ويخرج المستخدم من المشغل كلياً بدل أن تُفتح شاشة كود السيرفر أو
     * لوحة السيرفر الجديد.
     */
    const onFullscreenEntry = !!(history.state && history.state.modal === 'fullscreen');
    if (!isFromPopState && wasOpen && onFullscreenEntry) {
        history.back();
    }
}

// Close player if user exits fullscreen via ESC key
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        const modal = document.getElementById('fullscreenVideoModal');
        if (modal && !modal.classList.contains('hidden')) {
            closeFullscreenPlayer();
        }
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) {
        const modal = document.getElementById('fullscreenVideoModal');
        if (modal && !modal.classList.contains('hidden')) {
            closeFullscreenPlayer();
        }
    }
});

function closeLivePlayer(clearSaved = true) {
    // زر الإغلاق الأحمر في ملء الشاشة: يغلق القناة ويخرج من ملء الشاشة معاً، وكان يوقف
    // البث فقط فيبقى المستخدم أمام شاشة سوداء بملء الشاشة بلا قناة.
    const fsWrap = document.getElementById('livePlayerWrapper');
    if (fsWrap && fsWrap.classList.contains('live-fullscreen-mode')) {
        const onAndroid = !!(window.AndroidNativeBridge || (window.AlMeZ0App && window.AlMeZ0App.isAndroid));
        if (onAndroid) {
            // على أندرويد يفتح toggleLivePlayerFullscreen المشغل الأصلي، فنزيل الوضع يدوياً
            fsWrap.classList.remove('live-fullscreen-mode');
            document.body.classList.remove('in-live-fullscreen');
        } else {
            toggleLivePlayerFullscreen(false);
        }
    }
    if (window.vjsPlayer) {
        try {
            window.vjsPlayer.pause();
            window.vjsPlayer.dispose();
        } catch (e) { }
        window.vjsPlayer = null;
    }
    if (art) {
        art.destroy(false);
        art = null;
    }
    // 💡 التعديل هنا: إيقاف وتدمير مكتبة HLS للبث المباشر بشكل صحيح ومنع عملها في الخلفية
    if (window.hlsInstance) {
        try {
            window.hlsInstance.detachMedia();
            window.hlsInstance.destroy();
        } catch (e) { }
        window.hlsInstance = null;
    }
    currentStreamInfo = null;
    if (clearSaved) {
        sessionStorage.removeItem('sp_last_live_stream');
    }

    const topHeader = document.getElementById('playerTopHeader');
    if (topHeader) topHeader.classList.add('hidden');

    const liveWrap = document.getElementById('livePlayerWrapper');
    if (liveWrap) liveWrap.classList.remove('is-playing');

    const wrapper = document.getElementById('liveVideoContainer') || document.getElementById('livePlayerWrapper');
    if (wrapper) wrapper.innerHTML = '<div class="empty-state">اختر قناة لبدء المشاهدة</div>';

    const loadingOverlay = document.getElementById('liveChannelLoadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');

    document.querySelectorAll('#liveChannels .list-item').forEach(i => i.classList.remove('active'));
}

function toggleCurrentLiveFavorite() {
    if (!currentStreamInfo || currentStreamInfo.type !== 'live') return;
    toggleFavorite(currentStreamInfo.id, 'live');
    const favsLive = JSON.parse(localStorage.getItem('sp_favs_live') || '[]');
    const btnLiveFav = document.getElementById('btnLiveFav');
    if (btnLiveFav) {
        btnLiveFav.classList.toggle('active', favsLive.includes(String(currentStreamInfo.id)));
    }
}

function refreshPlayer() {
    if (currentStreamInfo) {
        playStream(
            currentStreamInfo.id,
            currentStreamInfo.type,
            currentStreamInfo.extension,
            currentStreamInfo.name,
            currentStreamInfo.icon
        );
    }
}

// ==========================================
// نافذة إدخال كود السيرفر المخصصة للهواتف
// ==========================================
function openServerCodePrompt() {
    Swal.fire({
        title: 'أدخل كود السيرفر',
        input: 'text',
        inputPlaceholder: 'مثال: 123',
        inputValue: document.getElementById('serverCode').value, // لو كاتب شي مسبقاً يظهر له
        showCancelButton: true,
        confirmButtonText: 'تأكيد',
        cancelButtonText: 'إلغاء',
        background: '#141820',
        color: '#fff',
        inputAttributes: {
            inputmode: 'numeric',
            pattern: '[0-9]*',
            style: 'text-align: center; font-size: 26px; font-weight: bold; letter-spacing: 2px;'
        },
        customClass: {
            popup: 'almezo-swal-popup',
            confirmButton: 'almezo-swal-btn',
            input: 'input-field'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // نقل الرقم الذي كتبه المستخدم في النافذة إلى الصندوق الأساسي بالصفحة
            document.getElementById('serverCode').value = result.value.trim();
        }
    });
}

// ==========================================
// ARABIC TRANSLATION HELPERS
// ==========================================
const genreDictionary = {
    'action': 'أكشن',
    'adventure': 'مغامرة',
    'animation': 'رسوم متحركة',
    'anime': 'أنمي',
    'comedy': 'كوميدي',
    'crime': 'جريمة',
    'documentary': 'وثائقي',
    'drama': 'دراما',
    'family': 'عائلي',
    'fantasy': 'فانتازيا',
    'history': 'تاريخي',
    'horror': 'رعب',
    'music': 'موسيقى',
    'musical': 'موسيقي',
    'mystery': 'غموض',
    'romance': 'رومانسي',
    'romantic': 'رومانسي',
    'sci-fi': 'خيال علمي',
    'science fiction': 'خيال علمي',
    'thriller': 'إثارة وتشويق',
    'war': 'حرب',
    'western': 'غرب أمريكي',
    'biography': 'سيرة ذاتية',
    'sport': 'رياضة',
    'sports': 'رياضة',
    'news': 'أخبار',
    'talk-show': 'برنامج حواري',
    'reality-tv': 'واقعي',
    'short': 'قصير'
};

const countryDictionary = {
    'united states of america': 'أمريكا',
    'united states': 'أمريكا',
    'usa': 'أمريكا',
    'united kingdom': 'بريطانيا',
    'uk': 'بريطانيا',
    'china': 'الصين',
    'france': 'فرنسا',
    'germany': 'ألمانيا',
    'italy': 'إيطاليا',
    'spain': 'إسبانيا',
    'canada': 'كندا',
    'japan': 'اليابان',
    'south korea': 'كوريا الجنوبية',
    'korea': 'كوريا',
    'india': 'الهند',
    'egypt': 'مصر',
    'turkey': 'تركيا',
    'lebanon': 'لبنان',
    'syria': 'سوريا',
    'saudi arabia': 'السعودية',
    'uae': 'الإمارات',
    'morocco': 'المغرب',
    'tunisia': 'تونس',
    'algeria': 'الجزائر',
    'mexico': 'المكسيك',
    'australia': 'أستراليا',
    'russia': 'روسيا'
};

function translateGenreAndCountry(genreStr, countryStr) {
    let genres = [];
    if (genreStr) {
        genres = genreStr.split(/[,|\/]/).map(g => {
            const clean = g.trim().toLowerCase();
            return genreDictionary[clean] || g.trim();
        });
    }

    let countries = [];
    if (countryStr) {
        countries = countryStr.split(/[,|\/]/).map(c => {
            const clean = c.trim().toLowerCase();
            return countryDictionary[clean] || c.trim();
        });
    }

    return {
        genre: genres.join('، '),
        country: countries.join('، ')
    };
}

async function translateToArabic(text) {
    if (!text || typeof text !== 'string') return text;
    const arabicRegex = /[\u0600-\u06FF]/;
    if (arabicRegex.test(text) && text.length > 20) {
        return text;
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) return text;
        const data = await res.json();
        if (data && data[0]) {
            return data[0].map(item => item[0]).join('');
        }
    } catch (e) {
        console.warn('Translation failed', e);
    }
    return text;
}

// ==========================================
// MOVIE DETAILS SCREEN (معدل بالنمط السينمائي)
// ==========================================
async function showMovieDetails(movieId, name, cover, ext) {
    sessionStorage.setItem('sp_current_screen', 'movie-details-screen');
    sessionStorage.setItem('sp_last_movie', JSON.stringify({ movieId, name, cover, ext }));
    showScreen('movie-details-screen');
    scrollToTopDetails();

    // تعيين المعلومات الأساسية فوراً
    document.getElementById('movieTitle').innerText = name;
    document.getElementById('moviePoster').src = cover || 'photo/logo.ico';
    const backdropEl = document.getElementById('movieBackdrop');
    if (backdropEl) {
        backdropEl.style.backgroundImage = `url('${cover || 'photo/logo.ico'}')`;
    }

    // عرض قسم الأفلام المقترحة فوراً من نفس التصنيف
    let currentVodItem = (originalItemsArray || []).find(item => String(item.stream_id || '') === String(movieId));
    renderPopularShelf('vod', movieId, currentVodItem ? currentVodItem.category_id : null);

    // إخفاء زر الإعلان مؤقتاً لحين جلبه
    const movieTrailerBtn = document.getElementById('btnPlayMovieTrailer');
    if (movieTrailerBtn) movieTrailerBtn.classList.add('hidden');

    // Set favorite button state
    const favsVod = JSON.parse(localStorage.getItem('sp_favs_vod') || '[]');
    const btnFav = document.getElementById('btnMovieFav');
    if (btnFav) {
        btnFav.classList.toggle('active', favsVod.includes(String(movieId)));
        btnFav.onclick = () => {
            toggleFavorite(movieId, 'vod');
            const updated = JSON.parse(localStorage.getItem('sp_favs_vod') || '[]');
            btnFav.classList.toggle('active', updated.includes(String(movieId)));
        };
    }

    // زر شاهد الآن
    document.getElementById('btnWatchMovie').onclick = () => {
        playStream(movieId, 'vod', ext, name, cover);
    };

    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);

    // Fetch Movie Info
    const infoUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_info&vod_id=${movieId}`;

    try {
        const data = await proxyFetch(infoUrl);
        window.currentMediaDetails = { movieId, name, cover, ext, info: data.info || {}, movie_data: data.movie_data || {} };
        const info = data.info || {};
        if (data.movie_data && data.movie_data.container_extension) {
            ext = data.movie_data.container_extension;
            document.getElementById('btnWatchMovie').onclick = () => {
                playStream(movieId, 'vod', ext, name, cover);
            };
        }

        // 1. استخراج الباك دروب عالي الدقة (Backdrop Path أو Movie Image أو Cover Big)
        let backdropUrl = null;
        let bPath = info.backdrop_path;
        if (typeof bPath === 'string') {
            bPath = bPath.trim();
            if (bPath.startsWith('[') && bPath.endsWith(']')) {
                try {
                    bPath = JSON.parse(bPath);
                } catch (e) { }
            }
        }
        if (Array.isArray(bPath) && bPath.length > 0) {
            backdropUrl = bPath[0];
        } else if (typeof bPath === 'string' && bPath.startsWith('http')) {
            backdropUrl = bPath;
        }
        if (!backdropUrl && info.movie_image) {
            backdropUrl = info.movie_image;
        }
        if (!backdropUrl && info.cover_big) {
            backdropUrl = info.cover_big;
        }

        // ترقية دقة صورة TMDB إلى original لتكون فائقة الوضوح وبدون أي تشويش
        if (backdropUrl && typeof backdropUrl === 'string') {
            backdropUrl = backdropUrl.replace(/\/t\/p\/w\d+\//, '/t/p/original/');
            if (backdropEl) {
                backdropEl.style.backgroundImage = `url('${backdropUrl}')`;
            }
        }

        // 2. إعداد زر الإعلان الترويجي (Play trailer)
        const trailerBtn = document.getElementById('btnPlayMovieTrailer');
        if (trailerBtn) {
            const trailerKey = info.youtube_trailer || info.trailer;
            trailerBtn.classList.remove('hidden');
            trailerBtn.onclick = () => openTrailerModal(trailerKey, name);
        }

        const rawGenre = info.genre || 'Movie';
        const duration = info.duration ? info.duration : '';
        const rawCountry = info.country ? info.country : '';

        const { genre: arGenre, country: arCountry } = translateGenreAndCountry(rawGenre, rawCountry);

        let metaParts = [];
        if (arGenre) metaParts.push(arGenre);
        if (duration) metaParts.push(duration);
        if (arCountry) metaParts.push(arCountry);

        document.getElementById('movieGenre').innerText = metaParts.join(' | ');
        document.getElementById('movieRating').innerText = info.rating || 'N/A';
        document.getElementById('movieDirector').innerText = info.director || 'غير معروف';
        document.getElementById('movieCast').innerText = info.cast || info.actors || 'غير معروف';

        // Translate Movie Plot to Arabic
        const rawPlot = info.plot || info.description;
        if (rawPlot) {
            document.getElementById('moviePlot').innerText = 'جاري ترجمة القصة...';
            translateToArabic(rawPlot).then(arPlot => {
                document.getElementById('moviePlot').innerText = arPlot;
            }).catch(() => {
                document.getElementById('moviePlot').innerText = rawPlot;
            });
        } else {
            document.getElementById('moviePlot').innerText = 'لا توجد قصة متاحة.';
        }

        // تحديث قسم الاقتراحات بدقة وفق تصنيف الفيلم ونوعه المستخرج من السيرفر
        renderPopularShelf('vod', movieId, (data.movie_data && data.movie_data.category_id) || (currentVodItem ? currentVodItem.category_id : null), info.genre);
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// SERIES DETAILS SCREEN (معدل بالنمط السينمائي)
// ==========================================
async function showSeriesDetails(seriesId, name, cover) {
    sessionStorage.setItem('sp_current_screen', 'series-details-screen');
    sessionStorage.setItem('sp_last_series', JSON.stringify({ seriesId, name, cover }));
    showScreen('series-details-screen');
    scrollToTopDetails();
    recordContinueWatching(seriesId, 'series');

    // تعيين المعلومات الأساسية فوراً
    document.getElementById('seriesTitle').innerText = name;
    document.getElementById('seriesTitleBottom').innerText = name;
    document.getElementById('seriesPoster').src = cover || 'photo/logo.ico';
    const backdropEl = document.getElementById('seriesBackdrop');
    if (backdropEl) {
        backdropEl.style.backgroundImage = `url('${cover || 'photo/logo.ico'}')`;
    }

    // عرض قسم المسلسلات المقترحة فوراً من نفس التصنيف
    let currentSeriesItem = (originalItemsArray || []).find(item => String(item.series_id || '') === String(seriesId));
    renderPopularShelf('series', seriesId, currentSeriesItem ? currentSeriesItem.category_id : null);

    // إخفاء زر الإعلان مؤقتاً لحين جلبه
    const seriesTrailerBtn = document.getElementById('btnPlaySeriesTrailer');
    if (seriesTrailerBtn) seriesTrailerBtn.classList.add('hidden');

    // Set favorite button state
    const favsSeries = JSON.parse(localStorage.getItem('sp_favs_series') || '[]');
    const btnSeriesFav = document.getElementById('btnSeriesFav');
    if (btnSeriesFav) {
        btnSeriesFav.classList.toggle('active', favsSeries.includes(String(seriesId)));
        btnSeriesFav.onclick = () => {
            toggleFavorite(seriesId, 'series');
            const updated = JSON.parse(localStorage.getItem('sp_favs_series') || '[]');
            btnSeriesFav.classList.toggle('active', updated.includes(String(seriesId)));
        };
    }

    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);

    // 1. Fetch Series Info
    const infoUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_series_info&series_id=${seriesId}`;

    const container = document.getElementById('seasonsContainer');
    container.innerHTML = '<div class="empty-state" style="margin-top: 50px;">جاري تحميل الحلقات...</div>';

    try {
        const data = await proxyFetch(infoUrl);
        const info = data.info || {};

        // تحديث قسم الاقتراحات بدقة وفق تصنيف ونوع المسلسل المستخرج من السيرفر
        renderPopularShelf('series', seriesId, info.category_id || (currentSeriesItem ? currentSeriesItem.category_id : null), info.genre);

        // 1. استخراج الباك دروب عالي الدقة للمسلسلات وترقية جودته
        let backdropUrl = null;
        let bPath = info.backdrop_path;
        if (typeof bPath === 'string') {
            bPath = bPath.trim();
            if (bPath.startsWith('[') && bPath.endsWith(']')) {
                try {
                    bPath = JSON.parse(bPath);
                } catch (e) { }
            }
        }
        if (Array.isArray(bPath) && bPath.length > 0) {
            backdropUrl = bPath[0];
        } else if (typeof bPath === 'string' && bPath.startsWith('http')) {
            backdropUrl = bPath;
        }
        if (!backdropUrl && info.cover_big) {
            backdropUrl = info.cover_big;
        } else if (!backdropUrl && info.cover) {
            backdropUrl = info.cover;
        }

        if (backdropUrl && typeof backdropUrl === 'string') {
            backdropUrl = backdropUrl.replace(/\/t\/p\/w\d+\//, '/t/p/original/');
            if (backdropEl) {
                backdropEl.style.backgroundImage = `url('${backdropUrl}')`;
            }
        }

        // 2. إعداد زر الإعلان الترويجي
        const trailerBtn = document.getElementById('btnPlaySeriesTrailer');
        if (trailerBtn) {
            const trailerKey = info.youtube_trailer || info.trailer;
            trailerBtn.classList.remove('hidden');
            trailerBtn.onclick = () => openTrailerModal(trailerKey, name);
        }

        const rawGenre = info.genre || 'Series';
        const { genre: arGenre } = translateGenreAndCountry(rawGenre, '');

        document.getElementById('seriesGenre').innerText = arGenre || 'مسلسل';
        document.getElementById('seriesRating').innerText = info.rating || 'N/A';
        document.getElementById('seriesDirector').innerText = info.director || 'غير معروف';
        document.getElementById('seriesCast').innerText = info.cast || 'غير معروف';

        // Translate Series Plot to Arabic
        const rawPlot = info.plot;
        if (rawPlot) {
            document.getElementById('seriesPlot').innerText = 'جاري ترجمة القصة...';
            translateToArabic(rawPlot).then(arPlot => {
                document.getElementById('seriesPlot').innerText = arPlot;
            }).catch(() => {
                document.getElementById('seriesPlot').innerText = rawPlot;
            });
        } else {
            document.getElementById('seriesPlot').innerText = 'لا توجد قصة متاحة.';
        }

        // 2. Render Episodes grouped by Season with Tabs
        container.innerHTML = '';
        const episodesBySeason = data.episodes || {};
        const seasonKeys = Object.keys(episodesBySeason);

        if (seasonKeys.length === 0) {
            container.innerHTML = '<div class="empty-state">لا توجد حلقات متاحة لهذا المسلسل</div>';
            return;
        }

        const tabsWrapper = document.createElement('div');
        tabsWrapper.className = 'seasons-tabs-wrapper';

        const epGrid = document.createElement('div');
        epGrid.className = 'episodes-grid';

        container.appendChild(tabsWrapper);
        container.appendChild(epGrid);

        function renderSeasonEpisodes(seasonNum) {
            // Update active tab button
            tabsWrapper.querySelectorAll('.season-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.season === String(seasonNum));
            });

            epGrid.innerHTML = '';
            const seasonData = episodesBySeason[seasonNum] || [];

            if (seasonData.length === 0) {
                epGrid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">لا توجد حلقات في هذا الموسم</div>';
                return;
            }

            seasonData.forEach((ep, epIndex) => {
                const epCard = document.createElement('div');
                epCard.className = 'episode-card';

                let epCover = (ep.info && ep.info.movie_image) ? ep.info.movie_image : cover;
                let epNum = ep.episode_num || '';
                let epTitle = ep.title || (epNum ? `الحلقة ${epNum}` : 'حلقة');

                // Clean up title if technical format e.g. "The Clan.S01.E04"
                if (epTitle.match(/S\d+[\.\s]?E\d+/i)) {
                    const cleanNum = epTitle.match(/E(\d+)/i);
                    if (cleanNum && cleanNum[1]) {
                        epTitle = `الحلقة ${parseInt(cleanNum[1])}`;
                    }
                }

                epCard.innerHTML = `
                    <div class="episode-thumb-box">
                        <img src="${epCover}" class="episode-thumb-img" onerror="this.src='${cover || 'photo/logo.ico'}'" alt="${epTitle}">
                        <div class="episode-play-overlay">
                            <div class="episode-play-icon"><i class="fas fa-play"></i></div>
                        </div>
                        ${epNum ? `<span class="episode-badge">${epNum}</span>` : ''}
                    </div>
                    <div class="episode-info-box">
                        <div class="episode-card-title" title="${epTitle}">${epTitle}</div>
                        ${ep.info && ep.info.duration ? `<div class="episode-card-duration"><i class="far fa-clock"></i> ${ep.info.duration}</div>` : ''}
                    </div>
                `;

                let epId = ep.id || ep.stream_id || ep.episode_id;

                // عند الضغط على الحلقة (الاعتماد على playStream مباشرة لفحص الـ MKV ومنع الفل سكرين الخاطئ)
                epCard.onclick = () => {
                    if (!epId) {
                        showToast('بيانات الحلقة غير صالحة', 'error');
                        return;
                    }
                    recordContinueWatching(seriesId, 'series');
                    try {
                        localStorage.setItem('sp_series_last_ep_' + seriesId, JSON.stringify({
                            epId,
                            epTitle,
                            epNum,
                            time: Date.now()
                        }));
                    } catch (e) { }
                    // قائمة تشغيل الحلقات: كل حلقات الموسم المعروض، لأزرار السابق والتالي
                    try {
                        const qItems = seasonData.map((e, i) => {
                            let t = e.title || (e.episode_num ? ('الحلقة ' + e.episode_num) : ('حلقة ' + (i + 1)));
                            const m = String(t).match(/E(\d+)/i);
                            if (m && m[1] && /S\d+[\.\s]?E\d+/i.test(t)) t = 'الحلقة ' + parseInt(m[1]);
                            return {
                                id: e.id || e.stream_id || e.episode_id,
                                ext: e.container_extension || 'mp4',
                                title: name + ' - ' + t,
                                cover: (e.info && e.info.movie_image) ? e.info.movie_image : cover
                            };
                        }).filter(e => e.id);
                        const qi = qItems.findIndex(e => String(e.id) === String(epId));
                        mizoSetQueue('series', qItems, qi);
                    } catch (e) { }
                    playStream(epId, 'series', ep.container_extension || 'mp4', `${name} - ${epTitle}`, epCover);
                };

                epGrid.appendChild(epCard);
            });
        }

        // Create Season Tabs
        seasonKeys.forEach((seasonNum, index) => {
            const tabBtn = document.createElement('button');
            tabBtn.className = `season-tab-btn ${index === 0 ? 'active' : ''}`;
            tabBtn.dataset.season = seasonNum;
            const epCount = (episodesBySeason[seasonNum] || []).length;
            tabBtn.innerHTML = `<i class="fas fa-layer-group"></i> موسم ${seasonNum} <span class="season-count-pill">${epCount}</span>`;
            tabBtn.onclick = () => renderSeasonEpisodes(seasonNum);
            tabsWrapper.appendChild(tabBtn);
        });

        // Render first season by default
        renderSeasonEpisodes(seasonKeys[0]);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">فشل تحميل بيانات المسلسل</div>';
    }
}

// ==========================================
// POPULAR SHELF & CINEMATIC HELPERS
// ==========================================
function renderPopularShelf(type, currentId, targetCategoryId, genreText) {
    const containerId = type === 'vod' ? 'popularMoviesGrid' : 'popularSeriesGrid';
    const sectionId = type === 'vod' ? 'moviePopularSection' : 'seriesPopularSection';
    const titleId = type === 'vod' ? 'moviePopularTitle' : 'seriesPopularTitle';
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    const titleEl = document.getElementById(titleId);
    if (!container || !section) return;

    let sourceItems = (originalItemsArray && originalItemsArray.length > 0) ? originalItemsArray : (currentItemsArray || []);

    // تحديد العمل الحالي لمعرفة تصنيفه
    let currentItem = sourceItems.find(item => String(item.stream_id || item.series_id || '') === String(currentId));
    let catId = targetCategoryId || (currentItem ? currentItem.category_id : null);

    // فلترة العنصر الحالي حتى لا يتكرر
    let candidateItems = sourceItems.filter(item => {
        const itemId = String(item.stream_id || item.series_id || '');
        return itemId && itemId !== String(currentId);
    });

    if (candidateItems.length === 0) {
        section.style.display = 'none';
        return;
    }

    // مطابقة ذكية حسب التصنيف (شرط المستخدم: عند اختيار فيلم أكشن تكون الاقتراحات لنفس التصنيف):
    // 1. الأولوية الأولى: الأعمال من نفس التصنيف المختار (category_id)
    let categoryMatches = [];
    if (catId) {
        categoryMatches = candidateItems.filter(item => {
            if (String(item.category_id) === String(catId)) return true;
            if (item.category_ids && Array.isArray(item.category_ids) && item.category_ids.some(cid => String(cid) === String(catId))) return true;
            return false;
        });
    }

    // 2. الأولوية الثانية: مطابقة الكلمات الدلالية لنوع العمل (Genre)
    let genreMatches = [];
    if (genreText && typeof genreText === 'string') {
        const normGenre = genreText.toLowerCase();
        const keywords = normGenre.split(/[\s,/|]+/).filter(k => k.length > 2);
        if (keywords.length > 0) {
            genreMatches = candidateItems.filter(item => {
                const itemName = (item.name || '').toLowerCase();
                return keywords.some(k => itemName.includes(k));
            });
        }
    }

    // تجميع الاقتراحات بحيث تكون أعمال نفس التصنيف في المقدمة دائماً
    let sortedCandidates = [];
    const seenIds = new Set();

    [...categoryMatches, ...genreMatches, ...candidateItems].forEach(item => {
        const itemId = String(item.stream_id || item.series_id || '');
        if (itemId && !seenIds.has(itemId)) {
            seenIds.add(itemId);
            sortedCandidates.push(item);
        }
    });

    if (sortedCandidates.length === 0) {
        section.style.display = 'none';
        return;
    }

    // تحديث عنوان شريط الاقتراحات ليعكس التصنيف المطابق
    if (titleEl) {
        if (categoryMatches.length > 0 && typeof currentCategoryName !== 'undefined' && currentCategoryName && currentCategoryName !== 'الكل') {
            titleEl.innerHTML = `<i class="fas fa-film" style="color:var(--accent-red); margin-left:8px;"></i> أعمال أخرى في قسم "${currentCategoryName}"`;
        } else {
            titleEl.innerHTML = `<i class="fas fa-film" style="color:var(--accent-red); margin-left:8px;"></i> ${type === 'vod' ? 'أفلام' : 'مسلسلات'} مقترحة من نفس التصنيف`;
        }
    }

    section.style.display = 'flex';
    container.innerHTML = '';

    // اختيار أول 18 عنصراً للعرض في الشريط
    const displayItems = sortedCandidates.slice(0, 18);

    displayItems.forEach(item => {
        const id = item.stream_id || item.series_id;
        const name = item.name || '';
        const cover = item.stream_icon || item.cover || 'photo/logo.ico';
        const rating = item.rating || (item.rating_5based ? (Number(item.rating_5based) * 2).toFixed(1) : null);
        const ext = item.container_extension || 'mp4';

        const card = document.createElement('div');
        card.className = 'popular-card';
        card.innerHTML = `
            <div class="popular-card-poster-wrap">
                <img src="${cover}" class="popular-card-poster" loading="lazy" onerror="this.src='photo/logo.ico'" alt="${name}">
                ${rating ? `<div class="popular-card-badge"><i class="fas fa-star"></i> ${rating}</div>` : ''}
            </div>
            <div class="popular-card-title" title="${name}">${name}</div>
        `;

        card.onclick = () => {
            scrollToTopDetails();
            if (type === 'vod') {
                showMovieDetails(id, name, cover, ext);
            } else {
                showSeriesDetails(id, name, cover);
            }
        };

        container.appendChild(card);
    });
}

// نافذة عرض الإعلان الترويجي (Trailer Modal)
/**
 * فتح الإعلان الترويجي في المتصفح الخارجي — نفس سلوك تطبيق أندرويد
 * (MovieDetailsActivity.openTrailer يستدعي Intent.ACTION_VIEW).
 *
 * التضمين داخل نافذة كان يفشل بالخطأ 153 من يوتيوب، ومعناه أن صاحب الفيديو منع التضمين،
 * وهو شائع جداً في إعلانات الأفلام الرسمية. فتحه خارجياً يعمل دائماً بلا أخطاء.
 */
function openTrailerModal(trailerKey, title) {
    let url = '';
    if (trailerKey && typeof trailerKey === 'string' && trailerKey.trim() !== '' && trailerKey.trim() !== 'null') {
        const key = trailerKey.trim();
        url = key.startsWith('http') ? key : ('https://www.youtube.com/watch?v=' + key);
    } else {
        url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent((title || '') + ' trailer اعلان');
    }

    if (window.AlMeZ0App && typeof window.AlMeZ0App.openExternal === 'function') {
        window.AlMeZ0App.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

/** النسخة القديمة بالتضمين — محفوظة للرجوع إليها إن لزم، ولا يناديها أحد. */
function openTrailerModalEmbedded(trailerKey, title) {
    videoWrap.innerHTML = `<iframe src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    modal.classList.remove('hidden');
}

function closeTrailerModal() {
    const modal = document.getElementById('trailerModal');
    const videoWrap = document.getElementById('trailerVideoWrapper');
    if (videoWrap) videoWrap.innerHTML = '';
    if (modal) modal.classList.add('hidden');
}

// التحكم بالصعود للأعلى
function scrollToTopDetails() {
    const movieScreen = document.getElementById('movie-details-screen');
    const seriesScreen = document.getElementById('series-details-screen');
    if (movieScreen && !movieScreen.classList.contains('hidden')) {
        movieScreen.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (seriesScreen && !seriesScreen.classList.contains('hidden')) {
        seriesScreen.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const btn = document.getElementById('btnScrollTop');
    if (btn) btn.classList.add('hidden');
}

function initScrollTopListener() {
    const btn = document.getElementById('btnScrollTop');
    if (!btn) return;

    const checkScroll = (screenEl) => {
        // إذا كانت الشاشة مخفية، اخفِ الزر فوراً لمنع بقائه عالقاً
        if (!screenEl || screenEl.classList.contains('hidden')) {
            btn.classList.add('hidden');
            return;
        }
        if (screenEl.scrollTop > 180) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    };

    const movieScreen = document.getElementById('movie-details-screen');
    const seriesScreen = document.getElementById('series-details-screen');

    if (movieScreen) {
        movieScreen.addEventListener('scroll', () => checkScroll(movieScreen), { passive: true });
    }
    if (seriesScreen) {
        seriesScreen.addEventListener('scroll', () => checkScroll(seriesScreen), { passive: true });
    }
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('togglePasswordIcon');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// ==========================================
// ADVANCED UI: HIDE NAMES & SORT MODAL
// ==========================================
let currentSortContext = 'vod';
let currentItemsArray = [];
let originalItemsArray = [];

function toggleHideNames() {
    const grid = document.getElementById('vodGrid');
    if (grid) {
        grid.classList.toggle('hide-vod-names');
    }
}

function openSortModal(context) {
    currentSortContext = context;

    // Hide 'Recently Added' option for live TV
    const addedOption = document.getElementById('sortOptionAdded');
    if (addedOption) {
        if (context === 'live') {
            addedOption.style.display = 'none';
            // If 'added' was checked, reset to 'default'
            const checkedOption = document.querySelector('input[name="sortOption"]:checked');
            if (checkedOption && checkedOption.value === 'added') {
                document.querySelector('input[name="sortOption"][value="default"]').checked = true;
            }
        } else {
            addedOption.style.display = '';
        }
    }

    document.getElementById('sortModal').classList.remove('hidden');
}

function applySort() {
    const option = document.querySelector('input[name="sortOption"]:checked').value;
    document.getElementById('sortModal').classList.add('hidden');

    if (currentItemsArray.length === 0) return;

    let sorted = [...currentItemsArray];

    if (option === 'default') {
        sorted = [...originalItemsArray];
    } else if (option === 'added') {
        const parseAddedTime = (item) => {
            if (!item) return 0;
            const val = item.added;
            const fallbackId = Number(item.stream_id || item.series_id || 0) || 0;
            if (!val) return fallbackId;
            if (typeof val === 'number') {
                return val < 100000000000 ? val * 1000 : val;
            }
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (!isNaN(trimmed)) {
                    const num = Number(trimmed);
                    return num < 100000000000 ? num * 1000 : num;
                }
                const parsedIso = Date.parse(trimmed.replace(' ', 'T'));
                if (!isNaN(parsedIso)) return parsedIso;
                const parsedDirect = Date.parse(trimmed);
                if (!isNaN(parsedDirect)) return parsedDirect;
            }
            return fallbackId;
        };

        sorted.sort((a, b) => parseAddedTime(b) - parseAddedTime(a));
    } else if (option === 'asc') {
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (option === 'desc') {
        sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    renderItems(sorted, currentSortContext);
}

// ==========================================
// IMAGE MEMORY UNLOAD ENGINE
// تفريغ ذاكرة صور (bitmaps) البطاقات/القنوات البعيدة تماماً عن منطقة الرؤية أثناء التمرير
// الطويل في قوائم تضم آلاف العناصر، مع إبقاء بنية البطاقة كما هي كي تعود فوراً بلا أي قفزة
// أو فقدان لموضع التمرير عند العودة إليها. هذا يحل مشكلة تراكم ذاكرة الصور على الأجهزة
// ضعيفة الرام دون المخاطرة بحذف عناصر DOM فعلياً (وهو ما قد يكسر التمرير للخلف).
// ==========================================
const OFFSCREEN_IMG_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

// صورة SVG شفافة مقاسها الذاتي 2×3 تُستخدم لإعطاء صندوق شعار القناة نفس نسبة ملصق الفيلم.
// الصور ذات المقاس الذاتي تُحسب في ارتفاع صفوف الـ Grid على كل إصدارات WebView، بعكس
// aspect-ratio أو padding-bottom النسبية.
const CHANNEL_POSTER_SPACER_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3' viewBox='0 0 2 3'%3E%3C/svg%3E";
const offscreenImageObservers = new WeakMap();

function getOffscreenImageObserver(rootEl) {
    if (!rootEl || typeof IntersectionObserver === 'undefined') return null;
    if (offscreenImageObservers.has(rootEl)) return offscreenImageObservers.get(rootEl);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const img = entry.target;
            if (entry.isIntersecting) {
                if (img.dataset.unloadedSrc) {
                    img.src = img.dataset.unloadedSrc;
                    delete img.dataset.unloadedSrc;
                }
            } else if (img.src && !img.dataset.unloadedSrc && img.src.indexOf(OFFSCREEN_IMG_PLACEHOLDER) === -1) {
                img.dataset.unloadedSrc = img.src;
                img.src = OFFSCREEN_IMG_PLACEHOLDER;
            }
        });
    }, {
        root: rootEl,
        // هامش أمان كبير جداً كي لا تُفرَّغ أي صورة قريبة من حافة الشاشة (تُفرَّغ فقط الأبعد بكثير)
        rootMargin: '1200px 0px 1200px 0px',
        threshold: 0
    });

    offscreenImageObservers.set(rootEl, observer);
    return observer;
}

function watchImageForOffscreenUnload(img, rootEl) {
    try {
        const observer = getOffscreenImageObserver(rootEl);
        if (observer) observer.observe(img);
    } catch (e) { }
}

// ==========================================
// PROGRESSIVE CHUNKED RENDERING ENGINE
// ==========================================
let activeRenderList = [];
let activeRenderType = '';
let activeRenderOffset = 0;
const RENDER_CHUNK_SIZE = 25;
let isAppendingChunk = false;

/**
 * شعارات القنوات من الفهرس المدمج — نفس نظام ChannelLogos في تطبيق أندرويد.
 *
 * أغلب لوحات Xtream لا ترسل stream_icon للقنوات، فتظهر كلها بالشعار الافتراضي. الفهرس
 * (channel_logos.json) يربط اسم القناة المُطبَّع برابط شعارها من قاعدة iptv-org المفتوحة،
 * ويُبنى بـ scripts/build-channel-logos.js. يُحمَّل مرة واحدة وعند الحاجة فقط.
 *
 * في برنامج الكمبيوتر الملف مدمج محلياً فلا يُنزَّل شيء. وفي المتصفح لا نحمّله إطلاقاً
 * حتى لا نُحمّل زوار الموقع ملفين ميجا بلا داعٍ.
 */
var mizoLogoIndex = null;
var mizoLogoIndexKeys = null;
var mizoLogoLoading = false;

function mizoLoadLogoIndex() {
    if (mizoLogoIndex || mizoLogoLoading) return;
    var native = !!(window.electronAPI && window.electronAPI.isElectron)
        || document.body.classList.contains('platform-electron');
    if (!native) return;
    mizoLogoLoading = true;
    fetch('channel_logos.json').then(function (r) {
        return r.ok ? r.json() : null;
    }).then(function (data) {
        if (data) {
            mizoLogoIndex = data;
            mizoLogoIndexKeys = Object.keys(data).sort();
        }
        mizoLogoLoading = false;
    }).catch(function () { mizoLogoLoading = false; });
}

/** نفس تطبيع الأسماء في أندرويد: بلا بادئة دولة ولا لواحق جودة ولا تشكيل. */
function mizoNormalizeChannel(name) {
    if (!name) return '';
    var s = String(name).toLowerCase();
    s = s.replace(/^[a-z]{2,3}\s*[|:\-]\s*/i, '');
    s = s.replace(/^\[[^\]]*\]\s*/, '');
    s = s.replace(/[ـً-ْ]/g, '');
    s = s.replace(/[آأإ]/g, 'ا');
    s = s.replace(/ة/g, 'ه');
    s = s.replace(/ى/g, 'ي');
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    s = s.replace(/(hd|fhd|uhd|sd|4k|8k|1080p?|720p?|h265|hevc|raw|backup|multi|vip|plus)/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

/** رابط شعار القناة من الفهرس، أو '' إن لم تُعرف. */
function mizoChannelLogo(name) {
    if (!mizoLogoIndex) return '';
    var q = mizoNormalizeChannel(name);
    if (q.length < 3) return '';
    if (mizoLogoIndex[q]) return mizoLogoIndex[q];
    // أطول مفتاح يبدأ به الاسم: "bein sports 1 premium" -> "bein sports 1"
    var keys = mizoLogoIndexKeys;
    if (!keys) return '';
    var lo = 0, hi = keys.length - 1, best = -1;
    while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (keys[mid] <= q) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best >= 0) {
        var k = keys[best];
        if (k.length >= 5 && q.indexOf(k) === 0) return mizoLogoIndex[k];
    }
    return '';
}

function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return 'photo/logo.ico';
    url = url.trim();
    if (!url || url === 'null' || url === 'undefined' || url.length < 5) return 'photo/logo.ico';
    if (url.includes(' ') && !url.includes('%20')) {
        url = url.replace(/ /g, '%20');
    }
    return url;
}

function getScrollTarget(type) {
    if (type === 'live') {
        return document.getElementById('liveChannels');
    }
    const grid = document.getElementById('vodGrid');
    return (grid && grid.parentElement) ? grid.parentElement : grid;
}

function handleInfiniteScroll() {
    if (isAppendingChunk) return;
    const st = getScrollTarget(activeRenderType);
    if (!st) return;
    const remaining = st.scrollHeight - (st.scrollTop + st.clientHeight);
    if (remaining <= 800) {
        appendNextItemChunk();
    }
}

function renderItems(items, type) {
    const gridContainer = type === 'live' ? document.getElementById('liveChannels') : document.getElementById('vodGrid');
    if (!gridContainer) return;

    if (type === 'live') {
        const isGridMode = document.body.classList.contains('platform-android') || (window.AlMeZ0App && window.AlMeZ0App.isAndroid) || !!window.AndroidNativeBridge || document.body.classList.contains('tv-device-mode');
        if (isGridMode) {
            gridContainer.classList.add('channels-grid-mode');
        } else {
            gridContainer.classList.remove('channels-grid-mode');
        }
    }

    const scrollTarget = getScrollTarget(type);
    if (scrollTarget) {
        scrollTarget.scrollTop = 0;
    }

    gridContainer.innerHTML = '';
    activeRenderList = Array.isArray(items) ? items : [];
    activeRenderType = type;
    activeRenderOffset = 0;

    // Attach scroll listener directly to the element with overflow-y: auto
    if (scrollTarget && !scrollTarget._hasInfiniteScroll) {
        scrollTarget._hasInfiniteScroll = true;
        scrollTarget.addEventListener('scroll', handleInfiniteScroll, { passive: true });
    }

    // Attach to window as global listener
    if (!window._hasGlobalInfiniteScroll) {
        window._hasGlobalInfiniteScroll = true;
        window.addEventListener('scroll', handleInfiniteScroll, { passive: true });
    }

    // Render initial batch of items immediately (25 for VOD/Series, 50 for live)
    appendNextItemChunk(type === 'live' ? 50 : 25);

    // If screen has high resolution and hasn't formed a scrollbar yet, append another batch
    setTimeout(() => {
        const st = getScrollTarget(activeRenderType);
        if (st && st.scrollHeight <= st.clientHeight + 300 && activeRenderOffset < activeRenderList.length) {
            appendNextItemChunk(type === 'live' ? 50 : 25);
        }
    }, 60);
}

function appendNextItemChunk(customSize) {
    const chunkSize = customSize || RENDER_CHUNK_SIZE;
    if (activeRenderOffset >= activeRenderList.length || isAppendingChunk) return;
    isAppendingChunk = true;

    const container = activeRenderType === 'live' ? document.getElementById('liveChannels') : document.getElementById('vodGrid');
    if (!container) {
        isAppendingChunk = false;
        return;
    }

    const chunk = activeRenderList.slice(activeRenderOffset, activeRenderOffset + chunkSize);
    const fragment = document.createDocumentFragment();
    const unloadRootEl = getScrollTarget(activeRenderType);

    if (activeRenderType === 'live') {
        const isAndroidAppPlatform = document.body.classList.contains('platform-android') || (window.AlMeZ0App && window.AlMeZ0App.isAndroid) || !!window.AndroidNativeBridge || document.body.classList.contains('tv-device-mode');
        const savedLive = sessionStorage.getItem('sp_last_live_stream');
        let savedLiveObj = null;
        if (savedLive) {
            try { savedLiveObj = JSON.parse(savedLive); } catch (e) { }
        }

        chunk.forEach((item, index) => {
            const el = document.createElement('div');
            el.dataset.streamId = String(item.stream_id);
            el.setAttribute('tabindex', '0');

            const isCurrentlyPlaying = currentStreamInfo && String(currentStreamInfo.id) === String(item.stream_id);
            const isSavedMatch = !currentStreamInfo && savedLiveObj && String(savedLiveObj.id) === String(item.stream_id);

            // لا شعار من السيرفر: نكمله من الفهرس المدمج باسم القناة
            const iconSrc = cleanImageUrl(item.stream_icon || mizoChannelLogo(item.name));
            const isPriority = (activeRenderOffset + index) < 15;
            const loadingAttr = isPriority ? 'eager' : 'lazy';
            const fetchPriorityAttr = isPriority ? 'fetchpriority="high"' : 'fetchpriority="low"';

            const isGridDisplay = isAndroidAppPlatform || (container && container.classList.contains('channels-grid-mode'));
            if (isGridDisplay) {
                el.className = 'vod-card live-card';
                if (isCurrentlyPlaying || isSavedMatch) {
                    el.classList.add('active');
                }
                // صندوق الشعار: صورة شفافة بمقاس ذاتي 2×3 تحدد ارتفاعه (مثل ملصق الفيلم تماماً)،
                // بدل div فارغ يعتمد على aspect-ratio التي لا تدعمها WebView القديمة في صناديق التلفاز.
                // أُزيلت فئة vod-poster من الصندوق حتى لا تتسرب إليه قواعد الملصق (aspect-ratio/object-fit).
                el.innerHTML = `
                    <div class="channel-poster-box">
                        <img class="channel-poster-spacer" src="${CHANNEL_POSTER_SPACER_SRC}" alt="" aria-hidden="true">
                        <img src="${iconSrc}" class="channel-poster-img" loading="${loadingAttr}" decoding="async" ${fetchPriorityAttr} referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='photo/logo.ico'">
                    </div>
                    <div class="vod-info">
                        <div class="vod-title" title="${item.name || ''}">${item.name || ''}</div>
                    </div>
                `;
            } else {
                el.className = 'list-item';
                if (isCurrentlyPlaying || isSavedMatch) {
                    el.classList.add('active');
                }
                el.innerHTML = `
                    <img src="${iconSrc}" class="channel-icon" loading="${loadingAttr}" decoding="async" ${fetchPriorityAttr} referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='photo/logo.ico'">
                    <span>${item.name || ''}</span>
                `;
            }

            // نستهدف صورة الشعار تحديداً وليس أول صورة في البطاقة: أول صورة الآن هي صورة المقاس
            // الشفافة، ولو فُرِّغت واستُبدلت بصورة 1×1 لتغيّر ارتفاع البطاقة أثناء التمرير
            const elImg = el.querySelector('.channel-poster-img, .channel-icon');
            if (elImg) watchImageForOffscreenUnload(elImg, unloadRootEl);

            el.onclick = () => {
                document.querySelectorAll('#liveChannels .vod-card, #liveChannels .live-card, #liveChannels .list-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
                playStream(item.stream_id, 'live', 'm3u8', item.name, item.stream_icon);
            };
            fragment.appendChild(el);
        });
    } else {
        chunk.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'vod-card';
            const id = item.stream_id || item.series_id;
            const name = item.name || '';
            const rawCover = item.stream_icon || item.cover || item.poster || (Array.isArray(item.backdrop_path) ? item.backdrop_path[0] : item.backdrop_path);
            const cover = cleanImageUrl(rawCover);
            const ext = item.container_extension || 'mp4';

            const isPriority = (activeRenderOffset + index) < 15;
            const loadingAttr = isPriority ? 'eager' : 'lazy';
            const fetchPriorityAttr = isPriority ? 'fetchpriority="high"' : 'fetchpriority="low"';

            card.innerHTML = `
                <img src="${cover}" class="vod-poster" loading="${loadingAttr}" decoding="async" ${fetchPriorityAttr} referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='photo/logo.ico'">
                <div class="vod-info">
                    <div class="vod-title" title="${name}">${name}</div>
                </div>
            `;
            const cardImg = card.querySelector('img');
            if (cardImg) watchImageForOffscreenUnload(cardImg, unloadRootEl);

            card.onclick = () => {
                const scrollEl = getScrollTarget('vod');
                if (scrollEl) {
                    sessionStorage.setItem('sp_vod_scroll_pos', String(scrollEl.scrollTop));
                }
                if (activeRenderType === 'series') {
                    showSeriesDetails(id, name, cover);
                } else {
                    showMovieDetails(id, name, cover, ext);
                }
            };
            fragment.appendChild(card);
        });
    }

    container.appendChild(fragment);
    activeRenderOffset += chunk.length;
    isAppendingChunk = false;
}

// ==========================================
// FAVOURITES & CONTINUE WATCHING LOGIC
// ==========================================
let currentPlayingItem = null;

function updateCategoryBadges(type) {
    try {
        const effectiveType = (type === 'movies') ? 'vod' : type;
        const containerId = (effectiveType === 'vod' || effectiveType === 'series') ? 'vodCategories' : 'liveCategories';
        const favsList = JSON.parse(localStorage.getItem('sp_favs_' + effectiveType) || '[]');
        const contList = JSON.parse(localStorage.getItem('sp_continue_' + effectiveType) || '[]');

        const favSpan = document.querySelector(`#${containerId} [data-cat-id="favs"]`);
        if (favSpan) {
            favSpan.innerText = favsList.length > 0 ? favsList.length : '';
        }
        const contSpan = document.querySelector(`#${containerId} [data-cat-id="continue"]`);
        if (contSpan) {
            contSpan.innerText = contList.length > 0 ? contList.length : '';
        }
    } catch (e) {
        console.error('Failed to update category badges', e);
    }
}

function toggleFavorite(id, type) {
    if (!id) return;
    id = String(id);
    const effectiveType = (type === 'movies') ? 'vod' : type;
    const storageKey = 'sp_favs_' + effectiveType;
    let favs = JSON.parse(localStorage.getItem(storageKey) || '[]');

    if (favs.includes(id)) {
        favs = favs.filter(f => f !== id);
        showToast('تمت الإزالة من المفضلة', 'info');
    } else {
        // منع الإضافة إذا وصلت المفضلة لـ 30 عنصراً
        if (favs.length >= 30) {
            showToast('عذراً، المفضلة ممتلئة (الحد الأقصى 30)', 'warning');
            return;
        }
        favs.push(id);
        showToast('تمت الإضافة إلى المفضلة', 'success');
    }

    localStorage.setItem(storageKey, JSON.stringify(favs));
    updateCategoryBadges(effectiveType);

    const activeSpecialSpan = document.querySelector('.special-category.active span');
    if (currentSortContext === effectiveType && activeSpecialSpan && activeSpecialSpan.innerText === 'المفضلة') {
        const action = effectiveType === 'live' ? 'get_live_streams' : (effectiveType === 'vod' ? 'get_vod_streams' : 'get_series');
        loadStreams(action, 'favs', effectiveType);
    }
}

function recordContinueWatching(id, type) {
    if (!id) return;
    id = String(id);
    const effectiveType = (type === 'movies') ? 'vod' : type;
    const storageKey = 'sp_continue_' + effectiveType;
    let cont = JSON.parse(localStorage.getItem(storageKey) || '[]');

    // إزالة العنصر لو كان موجوداً لنقله إلى بداية القائمة
    cont = cont.filter(c => c !== id);
    cont.unshift(id);

    // الاحتفاظ بآخر 30 عنصر فقط بدلاً من 50
    if (cont.length > 30) cont.pop();

    localStorage.setItem(storageKey, JSON.stringify(cont));
    updateCategoryBadges(effectiveType);
}

// ==========================================
// SEARCH LOGIC & CONTROLS (CONTENT ONLY - ALL CATALOG)
// ==========================================
function toggleLiveSearch() {
    const wrap = document.getElementById('liveItemsSearchWrap');
    if (!wrap) return;
    const isHidden = wrap.classList.toggle('hidden');
    if (!isHidden) {
        const inp = document.getElementById('searchLiveItems');
        if (inp) {
            inp.focus();
            inp.select();
        }
    } else {
        clearLiveSearch();
    }
}

function clearLiveSearch() {
    const wrap = document.getElementById('liveItemsSearchWrap');
    if (wrap) wrap.classList.add('hidden');
    const inp = document.getElementById('searchLiveItems');
    if (inp) inp.value = '';
    const titleEl = document.getElementById('liveItemsCategoryTitle');
    if (titleEl && state.activeCategory) {
        titleEl.innerText = state.activeCategory.name || 'القنوات';
    }
    renderItems(currentItemsArray, 'live');
}

function toggleVodSearch() {
    const wrap = document.getElementById('vodSearchWrap');
    if (!wrap) return;
    const isHidden = wrap.classList.toggle('hidden');
    if (!isHidden) {
        const inp = document.getElementById('searchVodItems');
        if (inp) {
            inp.focus();
            inp.select();
        }
    } else {
        clearVodSearch();
    }
}

function clearVodSearch() {
    const wrap = document.getElementById('vodSearchWrap');
    if (wrap) wrap.classList.add('hidden');
    const inp = document.getElementById('searchVodItems');
    if (inp) inp.value = '';
    const ctx = currentSortContext || (state.activeTab === 'movies' ? 'vod' : 'series');
    renderItems(currentItemsArray, ctx);
}

window.toggleLiveSearch = toggleLiveSearch;
window.clearLiveSearch = clearLiveSearch;
window.toggleVodSearch = toggleVodSearch;
window.clearVodSearch = clearVodSearch;

document.addEventListener('DOMContentLoaded', () => {
    const searchLiveItems = document.getElementById('searchLiveItems');
    if (searchLiveItems) {
        let liveSearchTimer = null;
        searchLiveItems.addEventListener('input', (e) => {
            clearTimeout(liveSearchTimer);
            const term = e.target.value.trim().toLowerCase();
            liveSearchTimer = setTimeout(async () => {
                if (!term) {
                    renderItems(currentItemsArray, 'live');
                    const titleEl = document.getElementById('liveItemsCategoryTitle');
                    if (titleEl && state.activeCategory) {
                        titleEl.innerText = state.activeCategory.name || 'القنوات';
                    }
                } else {
                    const titleEl = document.getElementById('liveItemsCategoryTitle');
                    if (titleEl) titleEl.innerText = `نتائج البحث: "${term}"`;
                    try {
                        const allLive = await getAllStreamsForType('live', 'get_live_streams');
                        const filtered = (Array.isArray(allLive) ? allLive : []).filter(i => (i.name || '').toLowerCase().includes(term));
                        renderItems(filtered, 'live');
                    } catch (err) {
                        const filtered = currentItemsArray.filter(i => (i.name || '').toLowerCase().includes(term));
                        renderItems(filtered, 'live');
                    }
                }
            }, 180);
        });
    }

    const searchVodItems = document.getElementById('searchVodItems');
    if (searchVodItems) {
        let vodSearchTimer = null;
        searchVodItems.addEventListener('input', (e) => {
            clearTimeout(vodSearchTimer);
            const term = e.target.value.trim().toLowerCase();
            const ctx = currentSortContext || (state.activeTab === 'movies' ? 'vod' : 'series');
            const action = ctx === 'vod' ? 'get_vod_streams' : 'get_series';
            vodSearchTimer = setTimeout(async () => {
                if (!term) {
                    renderItems(currentItemsArray, ctx);
                } else {
                    try {
                        const allItems = await getAllStreamsForType(ctx, action);
                        const filtered = (Array.isArray(allItems) ? allItems : []).filter(i => (i.name || '').toLowerCase().includes(term));
                        renderItems(filtered, ctx);
                    } catch (err) {
                        const filtered = currentItemsArray.filter(i => (i.name || '').toLowerCase().includes(term));
                        renderItems(filtered, ctx);
                    }
                }
            }, 180);
        });
    }
});

// =========================================================
// LIVE TV VERTICAL BRIGHTNESS & VOLUME SLIDERS & GESTURES
// =========================================================
let livePlayerBrightness = 1.0;
let livePlayerVolume = 1.0;

function initLivePlayerGestures() {
    // شرائح السطوع والصوت العمودية مخصصة حصرياً للهواتف اللمسية (نقالات)
    // في الكمبيوتر وشاشات التلفزيون والرسيفر وتيفي بوكس: تلغى تماماً لأنها تعمل بالريموت أو الماوس
    if (document.body.classList.contains('desktop-device-mode') || document.body.classList.contains('tv-device-mode')) {
        return;
    }

    const wrapper = document.getElementById('livePlayerWrapper');
    if (!wrapper || wrapper._hasGestureEngine) return;
    wrapper._hasGestureEngine = true;

    const bSlider = document.getElementById('liveSliderBrightness');
    const bFill = document.getElementById('liveSliderBrightnessFill');
    const bVal = document.getElementById('liveSliderBrightnessVal');

    const vSlider = document.getElementById('liveSliderVolume');
    const vFill = document.getElementById('liveSliderVolumeFill');
    const vVal = document.getElementById('liveSliderVolumeVal');

    function updateLiveBrightness(delta) {
        livePlayerBrightness = Math.max(0.2, Math.min(1.6, livePlayerBrightness + delta));
        const video = wrapper.querySelector('video');
        if (video) {
            video.style.filter = `brightness(${livePlayerBrightness})`;
        }
        const pct = Math.round((livePlayerBrightness / 1.6) * 100);
        if (bFill) bFill.style.height = `${pct}%`;
        if (bVal) bVal.innerText = `${pct}%`;
        if (bSlider) {
            bSlider.classList.add('active');
            clearTimeout(bSlider._timer);
            bSlider._timer = setTimeout(() => bSlider.classList.remove('active'), 2500);
        }
    }

    function updateLiveVolume(delta) {
        livePlayerVolume = Math.max(0.0, Math.min(1.0, livePlayerVolume + delta));
        const video = wrapper.querySelector('video');
        if (video) {
            video.volume = livePlayerVolume;
        }
        if (window.vjsPlayer) {
            try { window.vjsPlayer.volume(livePlayerVolume); } catch (e) { }
        }
        const pct = Math.round(livePlayerVolume * 100);
        if (vFill) vFill.style.height = `${pct}%`;
        if (vVal) vVal.innerText = `${pct}%`;
        if (vSlider) {
            vSlider.classList.add('active');
            clearTimeout(vSlider._timer);
            vSlider._timer = setTimeout(() => vSlider.classList.remove('active'), 2500);
        }
    }

    let touchStartY = 0;
    let touchStartX = 0;
    let isDragging = false;
    let isBrightnessSide = false;

    wrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const rect = wrapper.getBoundingClientRect();
        touchStartY = touch.clientY;
        touchStartX = touch.clientX;
        isDragging = false;
        // In Arabic RTL layout, brightness slider is on left side (x < 50%)
        isBrightnessSide = (touchStartX - rect.left) < (rect.width * 0.5);
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const deltaY = touchStartY - touch.clientY;
        const deltaX = Math.abs(touch.clientX - touchStartX);

        if (!isDragging && Math.abs(deltaY) > 12 && Math.abs(deltaY) > deltaX) {
            isDragging = true;
        }

        if (isDragging) {
            const rect = wrapper.getBoundingClientRect();
            const step = deltaY / (rect.height * 0.75);
            if (isBrightnessSide) {
                updateLiveBrightness(step);
            } else {
                updateLiveVolume(step);
            }
            touchStartY = touch.clientY;
        }
    }, { passive: true });

    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const rect = wrapper.getBoundingClientRect();
        if ((e.clientX - rect.left) < (rect.width * 0.5)) {
            updateLiveBrightness(delta);
        } else {
            updateLiveVolume(delta);
        }
    }, { passive: false });

    // Desktop PC mouse drag support
    let isMouseDown = false;
    let mouseStartY = 0;
    let mouseStartX = 0;
    let isMouseDragging = false;
    let isMouseBrightnessSide = false;

    wrapper.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button, a, input, select, .vjs-control-bar, .channel-item')) return;
        const rect = wrapper.getBoundingClientRect();
        mouseStartY = e.clientY;
        mouseStartX = e.clientX;
        isMouseDown = true;
        isMouseDragging = false;
        isMouseBrightnessSide = (mouseStartX - rect.left) < (rect.width * 0.5);
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const deltaY = mouseStartY - e.clientY;
        const deltaX = Math.abs(e.clientX - mouseStartX);

        if (!isMouseDragging && Math.abs(deltaY) > 8 && Math.abs(deltaY) > deltaX) {
            isMouseDragging = true;
        }

        if (isMouseDragging) {
            const rect = wrapper.getBoundingClientRect();
            const step = deltaY / (rect.height * 0.75);
            if (isMouseBrightnessSide) {
                updateLiveBrightness(step);
            } else {
                updateLiveVolume(step);
            }
            mouseStartY = e.clientY;
        }
    });

    window.addEventListener('mouseup', () => {
        isMouseDown = false;
        isMouseDragging = false;
    });
}

// =========================================================
// عزل الشاشات الخلفية ومنع تسرب التركيز (Phantom Focus Prevention)
// =========================================================
/*
 * هل توجد نافذة حقيقية مفتوحة؟ رسائل التنبيه الصغيرة (toast) ليست نوافذ: هي في
 * حاوية .swal2-container مثل النوافذ، فكانت تُحسب نافذة وتُعزل الشاشة التي تحتها.
 * وقعت هذه بالضبط بعد تسجيل الخروج: رسالة "تم تسجيل الخروج بنجاح" تظهر لحظة عرض
 * شاشة كود السيرفر، فتُعزل الشاشة وزر "الاتصال بالسيرفر" لا يقبل أي نقرة، ولا يفكّها
 * إلا Escape. قِستُ ذلك فعلياً في برنامج الكمبيوتر.
 * ونافذة تسجيل الخروج أثناء اختفائها (قبل حذفها بلحظات) ليست مفتوحة أيضاً.
 */
function isBlockingModalOpen() {
    if (document.querySelector('.mz-dlg-overlay')) return true;
    const candidates = document.querySelectorAll(
        '#almezoAiModal:not(.hidden), #fullscreenVideoModal:not(.hidden), #playlistsModal:not(.hidden), #deviceModeModal:not(.hidden), #trailerModal:not(.hidden), #sortModal:not(.hidden), .custom-logout-modal, .swal2-container, .modal:not(.hidden)'
    );
    for (const m of candidates) {
        if (m.classList.contains('swal2-container') && m.querySelector('.swal2-toast')) continue;
        if (m.style && (m.style.opacity === '0' || m.style.pointerEvents === 'none')) continue;
        return true;
    }
    return false;
}

function syncModalInertState() {
    try {
        const isModalOpen = isBlockingModalOpen();
        document.querySelectorAll('.app-screen-container').forEach(s => {
            if (isModalOpen) {
                s.inert = true;
                s.setAttribute('aria-hidden', 'true');
            } else {
                const isCurrent = (s.id === currentScreenId && !s.classList.contains('hidden'));
                s.inert = !isCurrent;
                if (isCurrent) {
                    s.removeAttribute('aria-hidden');
                } else {
                    s.setAttribute('aria-hidden', 'true');
                }
            }
        });
        const nav = document.getElementById('dashboard-nav');
        if (nav) {
            nav.inert = isModalOpen;
            if (isModalOpen) nav.setAttribute('aria-hidden', 'true');
            else nav.removeAttribute('aria-hidden');
        }
    } catch (e) { }
}

// مراقبة النوافذ المنبثقة تلقائياً لعزل الشاشات الخلفية فور فتح أي نافذة
if (typeof MutationObserver !== 'undefined') {
    const modalObserver = new MutationObserver(() => {
        syncModalInertState();
    });
    window.addEventListener('DOMContentLoaded', () => {
        syncModalInertState();
        document.querySelectorAll('#playlistsModal, #deviceModeModal, #sortModal, #fullscreenVideoModal, #trailerModal, #almezoAiModal, .modal').forEach(m => {
            modalObserver.observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
        });
        // النوافذ المؤقتة (تسجيل الخروج، رسائل SweetAlert) تُضاف وتُحذف مباشرة تحت body،
        // وبلا هذه المراقبة كان العزل المحسوب لحظة ظهورها يبقى بعد زوالها.
        modalObserver.observe(document.body, { childList: true });
    });
}

// حارس تهيئة واحدة: كانت الدالة تُستدعى من مساعد الميزو مع كل رسالة جديدة، فتُضاف في كل مرة
// مستمعات keydown/touchstart/mousedown/F11 جديدة فوق القديمة. بعد عشر رسائل تصبح كل ضغطة سهم
// تنفَّذ عشر مرات (قفزات في التركيز وإطارات خضراء تظهر فجأة واستهلاك متزايد للمعالج).
// المحرك يقرأ العناصر من الصفحة لحظياً عند كل ضغطة، فلا حاجة لإعادة تهيئته أبداً.
let tvNavigationEngineInitialized = false;

function initTvNavigationEngine() {
    if (tvNavigationEngineInitialized) return;
    tvNavigationEngineInitialized = true;

    let currentFocusedEl = null;

    const FOCUSABLE_SELECTOR = [
        '.dash-card',
        '.card-refresh-btn',
        '.ai-floating-trigger',
        '#aiFloatingTrigger',
        '.nav-action-btn',
        '.cat-item',
        '.list-item',
        '.live-card',
        '.live-channel-card',
        '.vod-card',
        '.episode-card',
        '.server-card',
        '.device-card',
        '.btn-select-mode',
        '.nav-btn-device-mode',
        '.action-btn-native-player',
        '.action-btn-fullscreen',
        '.action-btn-fav',
        '.live-fullscreen-btn-overlay',
        '.btn-close-video',
        '.btn-close-trailer',
        '.action-btn',
        '.btn-primary',
        '.btn-close-playlists',
        '.btn-close-device-mode',
        '.btn-close-live-player',
        '.btn-server-option',
        '.vjs-control-bar .vjs-button',
        '.vjs-play-control',
        '.vjs-volume-panel .vjs-mute-control',
        '.custom-vjs-aspect-btn',
        '.custom-vjs-fs-btn',
        '.custom-vjs-btn',
        // عناصر كانت خارج تغطية الريموت تماماً: أزرار البحث والخيارات في ترويسة القوائم،
        // وعناصر القائمة المنسدلة (الترتيب/إخفاء الأسماء)، وزر مسح البحث، وأزرار مساعد الميزو
        '.header-icon-btn',
        '.dropdown-item',
        '.prominent-search-clear',
        '.ai-chip-btn',
        '.ai-btn-icon',
        '.ai-btn-send',
        '.ai-btn-mic',
        '.ai-btn-close',
        '.ai-card-btn-play',
        '.ai-btn-quality',
        '.ai-history-item',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        '[tabindex="0"]',
        'a[href]'
    ].join(',');

    function getVisibleFocusables() {
        // فحص النوافذ المنبثقة النشطة لحصر التركيز داخلها ومنع تسرب الأسهم لخلفية الشاشة
        // نافذة التنبيه/التأكيد أولاً: قد تُفتح فوق نافذة أخرى (تأكيد حذف فوق قوائم التشغيل)
        const activeModal = document.querySelector('.mz-dlg-overlay') || document.querySelector('#almezoAiModal:not(.hidden), #fullscreenVideoModal:not(.hidden), #playlistsModal:not(.hidden), #deviceModeModal:not(.hidden), #trailerModal:not(.hidden), #sortModal:not(.hidden), .custom-logout-modal, .swal2-container, .modal:not(.hidden)');
        let container = activeModal;
        let includeNav = false;

        if (!container) {
            // حصر الحاوية حصرياً في الشاشة النشطة الحالية لمنع تسرب التركيز إلى الشاشات المفتوحة بالخلفية
            container = document.getElementById(currentScreenId);
            if (!container) {
                container = document.querySelector('.app-screen-container:not(.hidden)') || document.body;
            }
            // تضمين أزرار النافبار العلوي النشط فقط إذا كانت الشاشة الحالية تدعم ظهوره ولم يكن معطلاً بـ inert
            const nav = document.getElementById('dashboard-nav');
            if (nav && !nav.classList.contains('hidden') && nav.offsetParent !== null && !nav.inert) {
                includeNav = true;
            }
        }

        let all = [];
        if (container) {
            all = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
        }
        if (includeNav) {
            const nav = document.getElementById('dashboard-nav');
            if (nav) {
                const navItems = Array.from(nav.querySelectorAll(FOCUSABLE_SELECTOR));
                all = navItems.concat(all);
            }
        }

        return all.filter(el => {
            if (el.disabled) return false;
            if (el.inert || el.closest('[inert]')) return false;
            if (el.classList.contains('hidden')) return false;
            if (el.closest('.hidden')) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            // عناصر الشاشة القابلة للتمرير (البطاقات والقوائم) يجب شملها لتتمكن الأسهم والريموت من النزول إليها
            const isScrollChild = !!el.closest('#vodGrid, #liveChannels, .list-container, .vod-grid');
            if (isScrollChild) {
                return r.width > 0 && r.height > 0;
            }
            return r.width > 0 && r.height > 0 && r.bottom >= -100 && r.top <= ((window.innerHeight || document.documentElement.clientHeight) + 100);
        });
    }

    /**
     * وضع الإدخال الحالي. الإطار الأخضر يخص التنقل بلوحة المفاتيح والريموت فقط؛ كان يظهر
     * لمستخدم الماوس أيضاً لأن البرنامج يضع التركيز تلقائياً عند كل تغيير شاشة.
     */
    window.__mizoKeyboardNav = false;
    function markKeyboardNav() {
        window.__mizoKeyboardNav = true;
        document.body.classList.add('kbd-nav');
    }
    function markPointerNav() {
        window.__mizoKeyboardNav = false;
        document.body.classList.remove('kbd-nav');
        clearTvFocus();
    }
    window.addEventListener('mousedown', markPointerNav, { passive: true });

    function setFocus(el) {
        if (!el) return;
        // لا إطار ولا تركيز قسري ما دام المستخدم يعمل بالماوس
        if (!window.__mizoKeyboardNav) return;
        if (currentFocusedEl && currentFocusedEl !== el) {
            currentFocusedEl.classList.remove('tv-focused');
        }
        currentFocusedEl = el;
        el.classList.add('tv-focused');
        document.body.classList.add('tv-mode');

        // إبقاء شريط التحكم بمشغل الفيديو ظاهراً أثناء تنقل الريموت فوق أزراره
        if (el.closest('.video-js') || el.closest('#livePlayerWrapper')) {
            const vjs = el.closest('.video-js');
            if (vjs) {
                vjs.classList.add('vjs-user-active');
                vjs.classList.remove('vjs-user-inactive');
            }
        }

        try {
            el.focus({ preventScroll: true });
        } catch (e) {}
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch (e) {}
    }

    function clearTvFocus() {
        if (currentFocusedEl) {
            currentFocusedEl.classList.remove('tv-focused');
            currentFocusedEl = null;
        }
        document.body.classList.remove('tv-mode');
    }

    function findNextElement(direction) {
        const focusables = getVisibleFocusables();
        if (!focusables.length) return null;

        if (!currentFocusedEl || !focusables.includes(currentFocusedEl)) {
            const dashCard = focusables.find(e => e.classList.contains('dash-card'));
            return dashCard || focusables[0];
        }

        const currentRect = currentFocusedEl.getBoundingClientRect();
        const curCx = currentRect.left + currentRect.width / 2;
        const curCy = currentRect.top + currentRect.height / 2;

        let bestCandidate = null;
        let bestScore = Infinity;

        for (const candidate of focusables) {
            if (candidate === currentFocusedEl) continue;
            const rect = candidate.getBoundingClientRect();
            const candCx = rect.left + rect.width / 2;
            const candCy = rect.top + rect.height / 2;

            const dx = candCx - curCx;
            const dy = candCy - curCy;

            let isDirectionValid = false;
            let primaryDist = 0;
            let secondaryDist = 0;

            if (direction === 'up') {
                if (dy < -4) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dy);
                    secondaryDist = Math.abs(dx);
                }
            } else if (direction === 'down') {
                if (dy > 4) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dy);
                    secondaryDist = Math.abs(dx);
                }
            } else if (direction === 'left') {
                if (dx < -4) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dx);
                    secondaryDist = Math.abs(dy);
                }
            } else if (direction === 'right') {
                if (dx > 4) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dx);
                    secondaryDist = Math.abs(dy);
                }
            }

            if (isDirectionValid) {
                const score = primaryDist + (secondaryDist * 1.8);
                if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }
        }

        return bestCandidate;
    }

    // تنظيم سرعة أسهم الريموت: عند الضغط المستمر يرسل الريموت ~30 ضغطة في الثانية، وكل ضغطة
    // تفحص كل عناصر الشاشة (قد تكون آلاف البطاقات). على الأجهزة الضعيفة تتراكم هذه الأعمال
    // فيتأخر التركيز ثم يقفز فجأة. نسمح بحركة واحدة كل فترة قصيرة جداً لا يلاحظها المستخدم.
    let lastArrowMoveTime = 0;
    const ARROW_MOVE_MIN_INTERVAL_MS = 70;

    window.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key)
            || (e.keyCode >= 37 && e.keyCode <= 40) || e.keyCode === 9 || e.keyCode === 13) {
            markKeyboardNav();
        }
        const isArrowKey = (e.keyCode >= 37 && e.keyCode <= 40) || /^Arrow/.test(e.key || '');
        if (isArrowKey && e.repeat) {
            const nowTs = Date.now();
            if (nowTs - lastArrowMoveTime < ARROW_MOVE_MIN_INTERVAL_MS) {
                const tag = document.activeElement && document.activeElement.tagName;
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
                return;
            }
            lastArrowMoveTime = nowTs;
        } else if (isArrowKey) {
            lastArrowMoveTime = Date.now();
        }

        const activeTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toUpperCase() : '';
        const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) ||
                        ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) ||
                        (document.activeElement && document.activeElement.isContentEditable) ||
                        (e.target && e.target.isContentEditable);

        // تحكم ذكي أثناء الكتابة في حقول البحث لمنع فقدان التركيز
        if (isInput) {
            if (e.key === 'Backspace' || e.keyCode === 8 || e.key === 'Delete' || e.keyCode === 46 ||
                e.key === 'ArrowLeft' || e.keyCode === 37 || e.key === 'ArrowRight' || e.keyCode === 39) {
                return; // السماح بالكتابة والمسح الطبيعي
            }
            const isSearchInput = (e.target.id === 'searchVod' || e.target.id === 'searchLive' || e.target.id === 'searchSeries' || (e.target.closest && e.target.closest('#vodItemsSearchWrap, .search-box')));
            if (isSearchInput && (e.key === 'ArrowDown' || e.keyCode === 40 || e.key === 'Enter' || e.keyCode === 13)) {
                e.preventDefault();
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                // الانتقال المباشر لأول بطاقة في النتائج (أفلام، مسلسلات، قنوات)
                const firstResult = document.querySelector('#vodGrid .vod-card:not(.hidden), #liveChannels .vod-card:not(.hidden), #liveChannels .live-card:not(.hidden), #liveChannels .list-item:not(.hidden), .channel-item:not(.hidden)');
                if (firstResult) {
                    setFocus(firstResult);
                    return;
                }
            }
            if (!isSearchInput && (e.key === 'ArrowDown' || e.keyCode === 40 || e.key === 'ArrowUp' || e.keyCode === 38)) {
                // إذا كان حقلاً عادياً (كود السيرفر أو داخل نافذة منبثقة): نسمح للأسهم بالانتقال للحقل أو الزر التالي بسلاسة
            } else if (e.key === 'Escape' || e.keyCode === 27) {
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                return;
            }
        }

        const liveWrapperEl = document.getElementById('livePlayerWrapper');
        const isLivePlaying = !!(liveWrapperEl && liveWrapperEl.classList.contains('is-playing'));

        // TV Remote Numeric Tuning (0-9) when watching live
        if (!isInput && isLivePlaying && e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            handleTvNumericKey(e.key);
            return;
        }

        // TV Remote Channel Up / Down
        if (!isInput && isLivePlaying && (e.key === 'ChannelUp' || e.key === 'PageUp')) {
            e.preventDefault();
            playAdjacentLiveChannel(-1);
            return;
        }
        if (!isInput && isLivePlaying && (e.key === 'ChannelDown' || e.key === 'PageDown')) {
            e.preventDefault();
            playAdjacentLiveChannel(1);
            return;
        }

        // TV Remote Info / Menu key on Live
        if (!isInput && isLivePlaying && (e.key === 'Info' || e.key === 'Menu' || e.key === 'Guide')) {
            e.preventDefault();
            if (currentStreamInfo) showTvLiveOsd(currentStreamInfo.name, currentStreamInfo.icon);
            return;
        }

        // تنقل سلس ومحسوب بين كروت الشاشة الرئيسية (البث المباشر، الأفلام، المسلسلات، وزر مساعد الميزو)
        if (currentFocusedEl && (currentFocusedEl.classList.contains('dash-card') || currentFocusedEl.id === 'aiFloatingTrigger' || currentFocusedEl.classList.contains('ai-floating-trigger'))) {
            const dashCards = Array.from(document.querySelectorAll('#dashboard-screen .dash-card'));
            const isAiBtn = currentFocusedEl.id === 'aiFloatingTrigger' || currentFocusedEl.classList.contains('ai-floating-trigger');

            if (isAiBtn) {
                if (e.key === 'ArrowUp' || e.keyCode === 38) {
                    e.preventDefault();
                    setFocus(dashCards[0] || document.getElementById('cardLive'));
                    return;
                }
            } else {
                const dashIndex = dashCards.indexOf(currentFocusedEl);
                if (dashIndex !== -1) {
                    if (e.key === 'ArrowLeft' || e.keyCode === 37) {
                        // في الواجهة العربية: سهم اليسار ينتقل للكرت التالي
                        if (dashIndex + 1 < dashCards.length) {
                            e.preventDefault();
                            setFocus(dashCards[dashIndex + 1]);
                            return;
                        }
                    } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
                        if (dashIndex - 1 >= 0) {
                            e.preventDefault();
                            setFocus(dashCards[dashIndex - 1]);
                            return;
                        }
                    } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
                        const aiBtn = document.getElementById('aiFloatingTrigger');
                        if (aiBtn && !aiBtn.classList.contains('hidden') && aiBtn.offsetParent !== null) {
                            e.preventDefault();
                            setFocus(aiBtn);
                            return;
                        }
                    } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                        const navFirst = document.querySelector('#dashboard-nav button:not([disabled])');
                        if (navFirst && !navFirst.closest('.hidden')) {
                            e.preventDefault();
                            setFocus(navFirst);
                            return;
                        }
                    }
                }
            }
        }

        // تنقل هندسي دقيق في شبكة بطاقات الأفلام والمسلسلات وقنوات البث المباشر بنظام 5 أعمدة
        if (currentFocusedEl && (currentFocusedEl.classList.contains('vod-card') || currentFocusedEl.classList.contains('live-card') || currentFocusedEl.classList.contains('live-channel-card'))) {
            const isLiveCard = currentFocusedEl.classList.contains('live-card') || currentFocusedEl.classList.contains('live-channel-card') || !!currentFocusedEl.closest('#liveChannels');
            const allCards = Array.from(document.querySelectorAll(isLiveCard ? '#liveChannels .vod-card, #liveChannels .live-card, #liveChannels .live-channel-card' : '#vodGrid .vod-card'));
            const cardIndex = allCards.indexOf(currentFocusedEl);
            if (cardIndex !== -1) {
                if (e.key === 'ArrowDown' || e.keyCode === 40) {
                    if (cardIndex + 5 < allCards.length) {
                        e.preventDefault();
                        setFocus(allCards[cardIndex + 5]);
                        return;
                    } else {
                        // عند الوصول لآخر صف: تحميل الدفعة التالية فوراً واستمرار النزول بسلاسة
                        if (activeRenderOffset < activeRenderList.length && typeof appendNextItemChunk === 'function') {
                            e.preventDefault();
                            appendNextItemChunk();
                            setTimeout(() => {
                                const updatedCards = Array.from(document.querySelectorAll(isLiveCard ? '#liveChannels .vod-card, #liveChannels .live-card, #liveChannels .live-channel-card' : '#vodGrid .vod-card'));
                                if (cardIndex + 5 < updatedCards.length) {
                                    setFocus(updatedCards[cardIndex + 5]);
                                } else if (updatedCards.length > cardIndex + 1) {
                                    setFocus(updatedCards[cardIndex + 1]);
                                }
                            }, 50);
                            return;
                        }
                    }
                } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                    if (cardIndex - 5 >= 0) {
                        e.preventDefault();
                        setFocus(allCards[cardIndex - 5]);
                        return;
                    } else {
                        // العودة لحقل البحث أو الهيدر عند الوصول للصف الأول
                        const searchInput = document.querySelector(isLiveCard ? '#searchLiveItems, #liveItemsSearchWrap input, #btnLiveSearchTrigger' : '#searchVodItems, #vodSearchWrap input, #btnVodSearchTrigger');
                        if (searchInput) {
                            e.preventDefault();
                            setFocus(searchInput);
                            return;
                        }
                    }
                } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
                    // في الواجهة العربية: اليمين يتنقل للبطاقة السابقة في الصف أو يعود لقائمة التصنيفات
                    if (cardIndex % 5 === 0) {
                        const activeCat = document.querySelector(
                            isLiveCard
                                ? '#liveCategories .list-item.active, #liveCategories .list-item, #liveCategories .cat-item'
                                : '#vodCategories .list-item.active, #vodCategories .list-item, #vodCategories .cat-item'
                        );
                        if (activeCat) {
                            e.preventDefault();
                            setFocus(activeCat);
                            return;
                        }
                    } else if (cardIndex - 1 >= 0) {
                        e.preventDefault();
                        setFocus(allCards[cardIndex - 1]);
                        return;
                    }
                } else if (e.key === 'ArrowLeft' || e.keyCode === 37) {
                    // الانتقال للبطاقة التالية مع دعم الالتفاف التلقائي للصف التالي
                    if (cardIndex + 1 < allCards.length) {
                        e.preventDefault();
                        setFocus(allCards[cardIndex + 1]);
                        return;
                    }
                }
            }
        }

        // تنقل ذكي من قائمة الأقسام إلى شبكة البطاقات (البث المباشر والأفلام والمسلسلات)
        if (currentFocusedEl && (currentFocusedEl.classList.contains('cat-item') || (currentFocusedEl.classList.contains('list-item') && currentFocusedEl.closest('#liveCategories, #vodCategories')))) {
            if (e.key === 'ArrowLeft' || e.keyCode === 37) {
                const isLiveCat = !!currentFocusedEl.closest('#liveCategories');
                const firstTargetCard = document.querySelector(
                    isLiveCat
                        ? '#liveChannels .vod-card.active, #liveChannels .live-card.active, #liveChannels .vod-card, #liveChannels .live-card, #liveChannels .list-item.active, #liveChannels .list-item'
                        : '#vodGrid .vod-card'
                );
                if (firstTargetCard) {
                    e.preventDefault();
                    setFocus(firstTargetCard);
                    return;
                }
            }
        } else if (currentFocusedEl && (currentFocusedEl.classList.contains('list-item') || currentFocusedEl.classList.contains('vod-card') || currentFocusedEl.classList.contains('live-card')) && currentFocusedEl.closest('#liveChannels')) {
            if (e.key === 'ArrowRight' || e.keyCode === 39) {
                const activeCat = document.querySelector('#liveCategories .list-item.active, #liveCategories .list-item');
                if (activeCat) {
                    e.preventDefault();
                    setFocus(activeCat);
                    return;
                }
            }
        }

        if (e.key === 'ArrowUp' || e.keyCode === 38) {
            const next = findNextElement('up');
            if (next) {
                e.preventDefault();
                setFocus(next);
            }
        } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
            const next = findNextElement('down');
            if (next) {
                e.preventDefault();
                setFocus(next);
            }
        } else if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            const next = findNextElement('left');
            if (next) {
                e.preventDefault();
                setFocus(next);
            }
        } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
            const next = findNextElement('right');
            if (next) {
                e.preventDefault();
                setFocus(next);
            }
        } else if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Select') {
            if (currentFocusedEl && !['INPUT', 'TEXTAREA'].includes(currentFocusedEl.tagName)) {
                e.preventDefault();
                currentFocusedEl.click();
            } else if (isLivePlaying) {
                if (currentStreamInfo) showTvLiveOsd(currentStreamInfo.name, currentStreamInfo.icon);
            }
        } else if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 27 || (!isInput && (e.key === 'Backspace' || e.keyCode === 8))) {
            const fullModal = document.getElementById('fullscreenVideoModal');
            if (fullModal && !fullModal.classList.contains('hidden')) {
                e.preventDefault();
                if (typeof closeFullscreenPlayer === 'function') closeFullscreenPlayer();
                return;
            }
            const devModal = document.getElementById('deviceModeModal');
            if (devModal && !devModal.classList.contains('hidden')) {
                e.preventDefault();
                closeDeviceModeModal();
                return;
            }
            const modal = document.getElementById('playlistsModal');
            if (modal && !modal.classList.contains('hidden')) {
                e.preventDefault();
                closePlaylistsModal();
                return;
            }
            const trailerModal = document.getElementById('trailerModal');
            if (trailerModal && !trailerModal.classList.contains('hidden')) {
                e.preventDefault();
                if (typeof closeTrailerModal === 'function') closeTrailerModal();
                return;
            }
            const activeScreen = (typeof currentScreenId !== 'undefined') ? currentScreenId : sessionStorage.getItem('sp_current_screen');
            if (activeScreen === 'movie-details-screen') {
                e.preventDefault();
                showScreen('vod-screen');
            } else if (activeScreen === 'series-details-screen') {
                e.preventDefault();
                showScreen('vod-screen');
            } else if (['vod-screen', 'live-screen', 'profile-screen'].includes(activeScreen)) {
                e.preventDefault();
                showScreen('dashboard-screen');
            }
        }
    });

    window.addEventListener('touchstart', clearTvFocus, { passive: true });
    window.addEventListener('mousedown', clearTvFocus, { passive: true });


    // F11 Fullscreen Toggle Shortcut for PC / Windows
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F11') {
            e.preventDefault();
            if (window.AlMeZ0App && typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') {
                const isCurrentlyFS = !!document.fullscreenElement;
                window.AlMeZ0App.setImmersiveFullscreen(!isCurrentlyFS);
            }
        }
    });
}

function initVodScrollHandler() {
    const vodCol = document.querySelector('#vod-screen .col-player');
    if (vodCol) {
        vodCol.addEventListener('wheel', (e) => {
            if (e.deltaY) {
                vodCol.scrollTop += e.deltaY;
            }
        }, { passive: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initTvNavigationEngine();
        initVodScrollHandler();
    });
} else {
    initTvNavigationEngine();
    initVodScrollHandler();
}