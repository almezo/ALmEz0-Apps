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

// ==========================================
// SMART VIEWPORT SCALE-TO-FIT ENGINE
// ==========================================
function applyAutoScaling() {
    const scaler = document.getElementById('app-scaler');
    if (!scaler) return;

    const baseWidth = 1200;
    const baseHeight = 750;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const scaleX = windowWidth / baseWidth;
    const scaleY = windowHeight / baseHeight;
    const scale = Math.min(scaleX, scaleY);

    scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
    scaler.style.transformOrigin = 'center center';
}

window.addEventListener('resize', applyAutoScaling);
window.addEventListener('orientationchange', () => {
    applyAutoScaling();
    setTimeout(applyAutoScaling, 150);
    setTimeout(applyAutoScaling, 300);
});
document.addEventListener('DOMContentLoaded', applyAutoScaling);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    applyAutoScaling();
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
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
                return;
            }
        } catch (e) {
            console.log('Direct orientation lock not supported, falling back to fullscreen.');
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

document.addEventListener('DOMContentLoaded', () => {
    initForceLandscapeButton();
    if (typeof initScrollTopListener === 'function') {
        initScrollTopListener();
    }

    // التحقق فقط مما إذا كان المستخدم مسجل الدخول بالكامل (لديه جلسة نشطة)
    const storedUser = localStorage.getItem('sp_user') || sessionStorage.getItem('sp_user');
    const storedHost = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const storedPass = localStorage.getItem('sp_pass') || sessionStorage.getItem('sp_pass');

    if (storedUser && storedHost && storedPass) {
        state.userInfo = JSON.parse(storedUser);
        state.username = state.userInfo.username;
        state.password = storedPass;
        state.hostUrls = [storedHost];

        const navUserEl = document.getElementById('navUsername');
        if (navUserEl) navUserEl.innerText = state.username;

        // إذا كان مسجلاً مسبقاً، اذهب مباشرة للرئيسية
        showScreen('dashboard-screen');
    } else {
        // إذا لم يكن مسجلاً، اجعل البداية دائماً وأبداً من شاشة إدخال كود السيرفر (الخطوة الأولى)
        sessionStorage.removeItem('sp_server_code');
        sessionStorage.removeItem('sp_host_urls');
        sessionStorage.removeItem('sp_server_info');
        showScreen('auth1-screen');
    }

    // ربط الأزرار الأساسية
    const connectBtn = document.getElementById('btnConnectServer');
    if (connectBtn) connectBtn.addEventListener('click', handleServerCode);

    const loginBtn = document.getElementById('btnLogin');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
});

let currentScreenId = null;
let isInitialRoute = true;

function showScreen(screenId, isBackNavigation = false) {
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
    if (screenId !== 'auth1-screen') {
        sessionStorage.setItem('sp_current_screen', screenId);
    }
    if (screenId === 'dashboard-screen') {
        sessionStorage.setItem('sp_current_tab', 'dashboard');
    }

    document.querySelectorAll('.app-screen-container').forEach(el => el.classList.add('hidden'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.remove('hidden');

    // إخفاء زر الصعود للأعلى نهائياً عند الانتقال لأي شاشة
    const scrollTopBtn = document.getElementById('btnScrollTop');
    if (scrollTopBtn) scrollTopBtn.classList.add('hidden');

    // Toggle Navbar visibility based on screen
    const nav = document.getElementById('dashboard-nav');
    if (nav) {
        if (screenId === 'auth1-screen' || screenId === 'auth2-screen') {
            nav.classList.add('hidden');
        } else {
            nav.classList.remove('hidden');

            const isDashboard = (screenId === 'dashboard-screen');
            const isProfile = (screenId === 'profile-screen');

            // Make nav-right container always visible so navReturnBtn is always accessible
            const navRight = nav.querySelector('.nav-right');
            if (navRight) {
                navRight.style.display = '';
            }

            // Hide/Show secondary action buttons (refresh, profile, logout)
            const refreshBtn = document.getElementById('navRefreshBtn');
            const profileBtn = document.getElementById('navProfileBtn');
            const logoutBtn = document.getElementById('navLogoutBtn');

            if (refreshBtn) refreshBtn.style.display = (isDashboard || isProfile) ? '' : 'none';
            if (profileBtn) profileBtn.style.display = (isDashboard || isProfile) ? '' : 'none';
            if (logoutBtn) logoutBtn.style.display = (isDashboard || isProfile) ? '' : 'none';

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

    applyAutoScaling();
}

function goBack() {
    if (currentScreenId === 'movie-details-screen' || currentScreenId === 'series-details-screen') {
        showScreen('vod-screen');
    } else {
        showScreen('dashboard-screen');
    }
}

// ==========================================
// ANDROID HARDWARE / GESTURE BACK BUTTON
// ==========================================
window.addEventListener('popstate', function (event) {
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
        showScreen(event.state.screenId, true);
    } else {
        showScreen('dashboard-screen', true);
    }
});

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
}

function showToast(title, icon = 'success') {
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
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
// خريطة أكواد السيرفرات المحلية

// 1. جلب الهوست من ملف servers.json المحلي وحفظه بشكل صحيح
async function handleServerCode() {
    const code = document.getElementById('serverCode').value.trim();
    if (!code) {
        return showAppAlert('يرجى إدخال كود السيرفر للمتابعة', 'warning');
    }

    const btn = document.getElementById('btnConnectServer');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner spinner"></i> جاري الاتصال...';

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
        btn.disabled = false;
        btn.innerHTML = 'الاتصال بالسيرفر';
        return showAppAlert('كود السيرفر غير صحيح، يرجى التأكد من الكود والمحاولة مجدداً.', 'error');
    }

    // 3. حفظ الهوست والانتقال للخطوة التالية
    state.host = hostUrl;
    sessionStorage.setItem('sp_fixed_host', hostUrl);

    state.serverCode = code;
    sessionStorage.setItem('sp_server_code', code);
    sessionStorage.setItem('sp_current_screen', 'auth2-screen');

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
    sessionStorage.setItem('sp_server_info', JSON.stringify(sInfo));

    document.getElementById('authServerDisplay').innerText = sInfo.name;
    document.getElementById('auth2Logo').src = sInfo.logo;

    showScreen('auth2-screen');

    btn.disabled = false;
    btn.innerHTML = 'الاتصال بالسيرفر';
}

// 2. تسجيل الدخول وقراءة الهوست المحفوظ بشكل صحيح دون إرجاعك للخلف
async function handleLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) {
        return showAppAlert('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
    }

    // جلب الهوست من المتغير العام أو من الـ sessionStorage بجميع الاحتمالات المتاحة
    const host = state.host || sessionStorage.getItem('sp_fixed_host') || sessionStorage.getItem('sp_host');

    if (!host) {
        // لو مش موجود يرجع لشاشة الكود، ولكن مع التعديل بالأعلى لن يحدث هذا أبداً
        showScreen('auth1-screen');
        return showAppAlert('حدث خطأ في بيانات السيرفر، يرجى إعادة إدخال الكود', 'error');
    }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner spinner"></i> جاري تسجيل الدخول...';

    const apiUrl = `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const proxyUrl = getProxyUrl(apiUrl);

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();

        if (data && data.user_info && data.user_info.auth === 1) {
            state.userInfo = data.user_info;
            state.username = user;
            state.password = pass;
            state.host = host;

            // حفظ الجلسة بالكامل لضمان الانتقال للوحة التحكم الرئيسية
            sessionStorage.setItem('sp_user', JSON.stringify(data.user_info));
            sessionStorage.setItem('almezo_cached_user', JSON.stringify(data.user_info));
            sessionStorage.setItem('sp_host', host);
            sessionStorage.setItem('sp_pass', pass);

            // الانتقال للوحة التحكم الرئيسية (dashboard-screen)
            showScreen('dashboard-screen');
        } else {
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

// ==========================================
// 2. الخطوة الثانية: تسجيل الدخول بهوست واحد وثابت
// ==========================================
async function handleLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) {
        Swal.fire('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }

    const host = state.host || sessionStorage.getItem('sp_fixed_host');
    if (!host) {
        showScreen('auth1-screen');
        return;
    }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';

    const apiUrl = `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const proxyUrl = getProxyUrl(apiUrl);

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();

        if (data && data.user_info && data.user_info.auth === 1) {
            state.userInfo = data.user_info;
            state.username = user;
            state.password = pass;

            // حفظ الجلسة في sessionStorage و الـ cached_user لكي تتوافق مع صفحة الحماية player.html
            sessionStorage.setItem('sp_user', JSON.stringify(data.user_info));
            sessionStorage.setItem('almezo_cached_user', JSON.stringify(data.user_info));
            sessionStorage.setItem('sp_host', host);
            sessionStorage.setItem('sp_pass', pass);

            showScreen('dashboard-screen');
        } else {
            Swal.fire('خطأ', 'بيانات الدخول غير صحيحة', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('خطأ', 'تعذر الاتصال بالسيرفر، تأكد من البيانات', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'تسجيل الدخول';
    }
}

function playStream(id, type, extension, name, icon) {
    currentStreamInfo = { id, type, extension, name, icon };
    if (type === 'live') {
        sessionStorage.setItem('sp_last_live_stream', JSON.stringify({ id, type, extension, name, icon }));
    }
    recordContinueWatching(id, type);

    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    const ext = extension ? extension.toLowerCase() : 'mp4';

    // خريطة السيرفرات لربط كود السيرفر بالهوست المخصص له
    const serverHostsMap = {
        "001": "http://cafott.com" //[cite: 1]
        // يمكنك إضافة المزيد من الأكواد هنا
    };

    // جلب كود السيرفر الحالي
    const currentServerCode = state.serverCode || sessionStorage.getItem('sp_server_code');
    const hostUrl = serverHostsMap[currentServerCode] || sessionStorage.getItem('sp_host');

    // ================================================================
    // 1. نظام كشف المتصفحات الشامل لدعم صيغة MKV
    // ================================================================
    const userAgent = navigator.userAgent.toLowerCase();

    // فحص جميع أجهزة آبل (آيفون، آيباد، آيبود) - جميع متصفحاتها ترفض MKV
    const isIOS = /ipad|iphone|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // فحص متصفح سفاري على أجهزة الماك (لا يحتوي على كلمة chrome)
    const isSafari = /safari/.test(userAgent) && userAgent.indexOf('chrome') === -1;

    // فحص متصفح فايرفوكس
    const isFirefox = userAgent.indexOf('firefox') > -1;

    // الشرط: إذا كان المتصفح أحد هؤلاء، فهو لا يدعم MKV نهائياً
    const isUnsupportedMKVBrowser = isFirefox || isSafari || isIOS;

    // بناء الرابط الأساسي لاستخدامه في التنبيه أو المشغل
    let baseStreamUrl = '';
    if (type === 'live') {
        baseStreamUrl = `${hostUrl}/live/${user}/${pass}/${id}.m3u8`;
    } else if (type === 'vod') {
        baseStreamUrl = `${hostUrl}/movie/${user}/${pass}/${id}.${ext}`;
    } else if (type === 'series') {
        baseStreamUrl = `${hostUrl}/series/${user}/${pass}/${id}.${ext}`;
    }

    // ================================================================
    // 2. صندوق تنبيه VLC (يظهر فقط إذا كانت الصيغة MKV والمتصفح لا يدعمها)
    // ================================================================
    if (ext === 'mkv' && isUnsupportedMKVBrowser) {
        // رسالة مخصصة حسب نوع المتصفح
        let browserWarning = isFirefox ?
            "متصفح <b>Firefox</b> لا يدعم تشغيل صيغة MKV بشكل مباشر داخل الصفحة." :
            (isIOS || isSafari) ? "متصفحات <b>Safari</b> وأجهزة <b>Apple</b> لا تدعم تشغيل صيغة MKV." :
                "متصفحك الحالي لا يدعم تشغيل حاوية هذا الملف مباشرة.";

        Swal.fire({
            title: '<span style="color: #f4c242;">🎬 تشغيل عبر مشغل VLC</span>',
            width: '32em',
            html: `
                <div style="text-align: center; direction: rtl; color: #fff; font-size: 15px; line-height: 1.6; white-space: normal !important; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; box-sizing: border-box; padding: 0 10px;">
                    <!-- 💡 تم تصحيح اسم المتغير هنا ليطابق browserWarning -->
                    <p style="margin: 0; white-space: normal !important; word-break: break-word;">${browserWarning} تم إعداد التشغيل ليعمل بكفاءة مطلقة عبر برنامج <b style="white-space: nowrap;">VLC Media Player</b>.</p>
                    <p style="margin-top: 10px; color: #aaa; font-size: 13px; white-space: normal !important; word-break: break-word;">* إذا كان برنامج VLC مثبتًا لديك، سيفتح المقطع تلقائياً فور النقر على زر التشغيل أدناه.</p>
                </div>
            `,
            icon: 'info',
            background: '#161b22',
            color: '#fff',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-play"></i> فتح في برنامج VLC',
            cancelButtonText: 'إغلاق',
            confirmButtonColor: '#f4c242',
            cancelButtonColor: '#333',
            footer: '<a href="https://www.videolan.org/vlc/" target="_blank" style="color: #4caf50; font-size: 13px; text-decoration: underline;">لست تمتلك برنامج VLC؟ اضغط هنا لتحميله مجاناً</a>'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = `vlc://${baseStreamUrl}`;
                setTimeout(() => {
                    window.open(baseStreamUrl, '_blank');
                }, 1000);
            }
        });

        return;
    }

    // ================================================================
    // 3. بناء قائمة الروابط (إذا كان المتصفح يدعم التشغيل مثل Chrome/Edge)
    // ================================================================
    let urlQueue = [];

    if (type === 'live') {
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}.m3u8`);
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}.ts`);
        urlQueue.push(`${hostUrl}/live/${user}/${pass}/${id}`);
    } else if (type === 'vod') {
        urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}.${ext}`);
        urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}.m3u8`);
        if (ext !== 'mp4') urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}.mp4`);
        urlQueue.push(`${hostUrl}/movie/${user}/${pass}/${id}`);
    } else if (type === 'series') {
        urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}.${ext}`);
        urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}.m3u8`);
        if (ext !== 'mp4') urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}.mp4`);
        urlQueue.push(`${hostUrl}/series/${user}/${pass}/${id}`);
    }

    const preferredPlayer = localStorage.getItem('sp_preferred_player') || 'hlsjs';

    // تنظيف أي مشغل يعمل حالياً
    if (window.vjsPlayer) {
        window.vjsPlayer.dispose();
        window.vjsPlayer = null;
    }
    if (window.hlsInstance) {
        window.hlsInstance.destroy();
        window.hlsInstance = null;
    }

    let containerSelector = 'mizoPlayer';
    const isFullscreenModal = (type === 'vod' || type === 'series');

    // إعداد واجهة المشغل
    if (isFullscreenModal) {
        const modal = document.getElementById('fullscreenVideoModal');
        if (modal) modal.classList.remove('hidden');

        // فتح الفل سكرين تلقائياً للمتصفحات الداعمة
        openNativeFullscreen(modal);

        const container = document.getElementById('fullscreenVideoContainer');
        container.innerHTML = '<video id="mizoVodPlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline style="width:100%;height:100%;"></video>';
        containerSelector = 'mizoVodPlayer';
        if (typeof resetCloseBtnInactivityTimer === 'function') resetCloseBtnInactivityTimer();
        history.pushState({ screenId: typeof currentScreenId !== 'undefined' ? currentScreenId : null, modal: 'fullscreen' }, '', window.location.href);
    } else {
        const wrapper = document.getElementById('livePlayerWrapper');
        wrapper.innerHTML = '<video id="mizoPlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline style="width:100%;height:100%;"></video>';
        containerSelector = 'mizoPlayer';

        document.getElementById('playingChannelName').innerText = name || 'Live Channel';
        document.getElementById('playingChannelIcon').src = icon || 'photo/logo.ico';
        const favsLive = JSON.parse(localStorage.getItem('sp_favs_live') || '[]');
        const btnLiveFav = document.getElementById('btnLiveFav');
        if (btnLiveFav) btnLiveFav.classList.toggle('active', favsLive.includes(String(id)));
        document.getElementById('playerTopHeader').classList.remove('hidden');
    }

    let currentTryIndex = 0;
    let fallbackTimer = null;

    // دالة تهيئة المشغل المختار
    function initSelectedPlayer(streamUrl) {
        // تنظيف المشغل القديم قبل إنشاء الجديد
        if (window.vjsPlayer) {
            window.vjsPlayer.dispose();
            window.vjsPlayer = null;
        }
        if (window.hlsInstance) {
            window.hlsInstance.destroy();
            window.hlsInstance = null;
        }

        const parent = isFullscreenModal ? document.getElementById('fullscreenVideoContainer') : document.getElementById('livePlayerWrapper');
        if (parent) {
            parent.innerHTML = `<video id="${containerSelector}" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline style="width:100%;height:100%;"></video>`;
        }

        const playUrl = streamUrl;

        // تحديد نوع الملف بدقة لتجنب أخطاء المشغل ومتصفح كروم عند التقديم
        let mimeType = 'video/mp4';
        const sLower = streamUrl.toLowerCase();
        if (sLower.includes('.m3u8')) {
            mimeType = 'application/x-mpegURL';
        } else if (sLower.includes('.ts')) {
            mimeType = 'video/mp2t';
        } else if (sLower.includes('.mkv')) {
            mimeType = 'video/webm'; // يتيح لكروم استخدام مفكك الحاويات Matroska بدلاً من MP4
        } else if (sLower.includes('.mp4')) {
            mimeType = 'video/mp4';
        } else if (type === 'live') {
            mimeType = 'application/x-mpegURL';
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
                playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                controlBar: {
                    pictureInPictureToggle: false,
                    skipButtons: {
                        forward: 10,
                        backward: 10
                    }
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

            const isHlsStream = streamUrl.toLowerCase().includes('.m3u8') || type === 'live';

            if (isHlsStream && typeof Hls !== 'undefined' && Hls.isSupported()) {
                const videoTag = document.querySelector(`#${containerSelector} video`);

                window.hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: type === 'live',
                    backBufferLength: type === 'live' ? 15 : 90,
                    maxBufferLength: type === 'live' ? 8 : 60,
                    maxMaxBufferLength: type === 'live' ? 16 : 120,
                    liveSyncDurationCount: 2,
                    liveMaxLatencyDurationCount: 4,
                    startFragPrefetch: true,
                    maxLoadingDelay: 2
                });

                window.hlsInstance.loadSource(playUrl);
                window.hlsInstance.attachMedia(videoTag);

                window.hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn("HLS Network Error, recovering...");
                                window.hlsInstance.startLoad();
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
                window.vjsPlayer.src({ src: playUrl, type: mimeType });
            }

            window.vjsPlayer.ready(function () {
                const player = this;

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

                // ميزة استكمال المشاهدة (Resume Playback)
                if (type !== 'live') {
                    const savedTime = localStorage.getItem(progressKey);
                    if (savedTime && parseFloat(savedTime) > 0) {
                        player.currentTime(parseFloat(savedTime));
                        if (typeof showToast === 'function') showToast('تم استكمال المشاهدة من حيث توقفت', 'info');
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
                        const vWidth = vTag ? (vTag.videoWidth || 'غير متوفر') : 'غير متوفر';
                        const vHeight = vTag ? (vTag.videoHeight || 'غير متوفر') : 'غير متوفر';

                        const oldModal = playerEl.querySelector('.custom-player-alert');
                        if (oldModal) oldModal.remove();

                        const alertHtml = `
                            <div class="custom-player-alert" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; color: #fff; font-family: inherit; animation: fadeInAlert 0.3s ease;">
                                <div style="background: #161b22; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 25px 35px; text-align: center; max-width: 350px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                                    <div style="font-size: 40px; color: #38bdf8; margin-bottom: 10px;"><i class="fas fa-info-circle"></i></div>
                                    <h3 style="margin: 0 0 15px 0; font-size: 20px; color: #fff;">معلومات البث</h3>
                                    <p style="margin: 0 0 20px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">جودة الصورة: ${vWidth} × ${vHeight}</p>
                                    <button id="closePlayerAlertBtn" style="background: #f59e0b; color: #000; border: none; padding: 10px 25px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 14px; transition: 0.2s;">حسناً</button>
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
                    };
                }

                if (controlBar) {
                    const fsControl = controlBar.querySelector('.vjs-fullscreen-control');

                    // 2. زر الترجمة والإعدادات
                    const settingsBtn = document.createElement('div');
                    settingsBtn.className = 'custom-vjs-btn vjs-control';
                    settingsBtn.innerHTML = '<i class="fas fa-closed-captioning"></i>';
                    settingsBtn.title = "الترجمة والصوتيات";
                    settingsBtn.onclick = () => {
                        const tracks = player.textTracks();
                        const hasSubtitles = Array.from(tracks || []).some(t => t.kind === 'subtitles' || t.kind === 'captions');
                        if (hasSubtitles) {
                            if (typeof showToast === 'function') showToast('استخدم أيقونة (CC) التي ظهرت بجانب هذا الزر لاختيار الترجمة', 'success');
                        } else {
                            if (typeof showToast === 'function') showToast('لا توجد ملفات ترجمة مدمجة في هذا البث', 'warning');
                        }
                    };

                    // 3. زر تغيير الأبعاد (Aspect Ratio)
                    const aspectBtn = document.createElement('div');
                    aspectBtn.className = 'custom-vjs-btn vjs-control';
                    aspectBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
                    aspectBtn.title = "تغيير الأبعاد";

                    const aspectStates = ['default', '16:9', '4:3', 'fill'];
                    let currentAspect = 0;
                    aspectBtn.onclick = () => {
                        currentAspect = (currentAspect + 1) % aspectStates.length;
                        const state = aspectStates[currentAspect];
                        const videoTag = playerEl.querySelector('video');
                        if (videoTag) {
                            if (state === 'default') { videoTag.style.objectFit = 'contain'; }
                            else if (state === 'fill') { videoTag.style.objectFit = 'cover'; }
                            else { videoTag.style.objectFit = 'fill'; }
                        }
                        if (typeof showToast === 'function') showToast(`الأبعاد: ${state.toUpperCase()}`, 'info');
                    };

                    if (fsControl) {
                        controlBar.insertBefore(settingsBtn, fsControl);
                        controlBar.insertBefore(aspectBtn, fsControl);
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

                // إذا حدث الخطأ أثناء التقديم (Seeking) أو أثناء تشغيل الفيديو بالفعل
                if (isSeeking || (player && player.seeking && player.seeking()) || currentT > 1) {
                    if (seekRecoveryCount < 3) {
                        seekRecoveryCount++;
                        console.warn(`[SeekRecovery] Attempt #${seekRecoveryCount}`);

                        // إزالة شاشة الخطأ السوداء فوراً من المشغل حتى لا يظهر "تعذر تشغيل"
                        player.error(null);

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

        fallbackTimer = setTimeout(() => {
            fallbackTimer = null;

            currentTryIndex++;
            if (currentTryIndex < urlQueue.length) {
                console.warn(`الرابط فشل، تجربة الصيغة التالية: ${urlQueue[currentTryIndex]}`);
                initSelectedPlayer(urlQueue[currentTryIndex]);
            } else {
                console.error("تم استنفاد جميع المحاولات والروابط.");
                const parent = isFullscreenModal ? document.getElementById('fullscreenVideoContainer') : document.getElementById('livePlayerWrapper');
                if (parent) {
                    parent.innerHTML = '<div class="empty-state">عذراً، فشل تشغيل هذا المحتوى.<br>يرجى التحقق من اتصالك أو تجربة مشغل آخر.</div>';
                }
            }
        }, 2000);
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
            <div class="custom-logout-box" style="background: #161b22; border: 1.5px solid rgba(255,255,255,0.18); border-radius: 24px; padding: 50px 60px; text-align: center; max-width: 580px; width: 92%; box-shadow: 0 30px 80px rgba(0,0,0,0.95);">
                <div style="font-size: 75px; color: #f59e0b; margin-bottom: 20px;"><i class="fas fa-exclamation-triangle"></i></div>
                <h3 style="margin: 0 0 18px 0; font-size: 32px; color: #fff; font-weight: bold;">تسجيل الخروج</h3>
                <p style="margin: 0 0 35px 0; font-size: 20px; color: #cbd5e1; line-height: 1.6;">هل أنت متأكد أنك تريد تسجيل الخروج من السيرفر؟</p>
                <div style="display: flex; gap: 20px; justify-content: center;">
                    <button id="confirmLogoutBtn" class="logout-action-btn" style="background: #e53935; color: #fff; border: none; padding: 15px 35px; font-weight: bold; border-radius: 12px; cursor: pointer; font-size: 18px; box-shadow: 0 5px 20px rgba(229,57,53,0.4);">نعم، خروج</button>
                    <button id="cancelLogoutBtn" class="logout-action-btn" style="background: #4caf50; color: #fff; border: none; padding: 15px 35px; font-weight: bold; border-radius: 12px; cursor: pointer; font-size: 18px; box-shadow: 0 5px 20px rgba(76,175,80,0.4);">إلغاء</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', logoutHtml);

    document.getElementById('confirmLogoutBtn').onclick = () => {
        // مسح بيانات سيرفر المشغل فقط
        localStorage.removeItem('sp_user');
        localStorage.removeItem('sp_host');
        localStorage.removeItem('sp_pass');
        sessionStorage.clear();

        // التعديل هنا: توجيه المستخدم إلى الصفحة الرئيسية للموقع مباشرة
        window.location.href = 'index.html';
    };

    document.getElementById('cancelLogoutBtn').onclick = () => {
        const modal = document.querySelector('.custom-logout-modal');
        if (modal) modal.remove();
    };
}

function switchTab(tabId, element) {
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
        showScreen('live-screen');
        loadCategories('get_live_categories', 'live');
    } else if (tabId === 'movies') {
        showScreen('vod-screen');
        loadCategories('get_vod_categories', 'vod');
    } else if (tabId === 'series') {
        showScreen('vod-screen');
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

    // Status & Type
    const statusEl = document.getElementById('profileStatus');
    const typeEl = document.getElementById('profileType');
    const isTrial = String(user.is_trial) === '1';

    let statusText = 'متصل';
    let typeText = isTrial ? 'حساب تجريبي' : 'حساب نشط';

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

    // Active connections (تبدأ من 1 كحد أدنى)
    const activeConnEl = document.getElementById('profileActiveConn');
    if (activeConnEl) {
        let activeVal = user.active_cons !== undefined ? user.active_cons : (user.active_connections || 0);
        activeConnEl.innerText = Math.max(1, Number(activeVal) || 1);
    }

    // Created At (تاريخ بدء الاشتراك)
    const rawCreated = user.created_at ?? user.created ?? user.creation_date ?? user.start_date;
    const createdEl = document.getElementById('profileCreatedAt');
    if (createdEl && rawCreated !== undefined) {
        createdEl.innerText = formatSubscriptionDate(rawCreated);
    }

    // Expire Date (تاريخ انتهاء الاشتراك)
    const rawExp = user.exp_date ?? user.expiration_date ?? user.expiry_date ?? user.expire_date;
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

function forceRefreshData() {
    for (const key in fetchCache) {
        delete fetchCache[key];
    }
    showToast('جاري التحديث...', 'info');
    if (currentScreenId === 'vod-screen') {
        loadCategories(state.activeTab === 'movies' ? 'get_vod_categories' : 'get_series_categories', state.activeTab);
    } else if (currentScreenId === 'live-screen') {
        loadCategories('get_live_categories', 'live');
    } else {
        loadProfileData();
    }
}

async function proxyFetch(apiUrl, useCache = true) {
    if (useCache && fetchCache[apiUrl]) {
        const cacheEntry = fetchCache[apiUrl];
        if (Date.now() - cacheEntry.time < CACHE_TTL_MS) {
            try {
                const data = await cacheEntry.promise;
                return data ? JSON.parse(JSON.stringify(data)) : data;
            } catch (e) {
                // Ignore and fetch again if promise failed
            }
        }
    }

    const targetUrl = getProxyUrl(apiUrl);
    const burstUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

    const fetchPromise = fetch(burstUrl, { cache: 'no-store' }).then(async res => {
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
        return data ? JSON.parse(JSON.stringify(data)) : data;
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

    const favsCount = JSON.parse(localStorage.getItem('sp_favs_' + type) || '[]').length;
    const contCount = JSON.parse(localStorage.getItem('sp_continue_' + type) || '[]').length;

    let specialCats = [
        { id: 'all', name: 'الكل', count: '' },
        { id: 'favs', name: 'المفضلة', count: favsCount > 0 ? favsCount : '' },
        { id: 'continue', name: 'متابعة المشاهدة', count: contCount > 0 ? contCount : '' }
    ];

    if (type === 'live') {
        specialCats = specialCats.filter(c => c.id !== 'continue');
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
            if (cat.category_name && cat.category_name.toUpperCase() === 'LAST ADDED') {
                cat.category_name = 'المضافة حديثاً';
            }

            const el = document.createElement('div');
            el.className = 'list-item';
            const apiCount = cat.count ?? cat.stream_count ?? cat.series_count ?? cat.channel_count ?? '';
            el.innerHTML = `
                <span class="cat-name">${cat.category_name}</span>
                <span class="cat-count" data-cat-id="${cat.category_id}">${apiCount}</span>
            `;
            el.onclick = () => {
                sessionStorage.setItem('sp_active_cat_' + type, cat.category_id);
                document.querySelectorAll(`#${container.id} .list-item`).forEach(i => i.classList.remove('active'));
                el.classList.add('active');

                if (type === 'live') {
                    loadStreams('get_live_streams', cat.category_id, 'live');
                } else {
                    let stAction = type === 'vod' ? 'get_vod_streams' : 'get_series';
                    loadStreams(stAction, cat.category_id, type);
                }
            };
            container.appendChild(el);
        });

        fetchCategoryCounts(type, container.id);

        const savedCatId = sessionStorage.getItem('sp_active_cat_' + type);
        let defaultClicked = false;

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
            if (type === 'live') {
                const xtvCat = Array.from(container.querySelectorAll('.list-item')).find(el => el.innerText.toUpperCase().includes('XTV | LIVE EVENTS'));
                if (xtvCat) {
                    xtvCat.click();
                    defaultClicked = true;
                }
            } else if (type === 'vod') {
                const recentCat = Array.from(container.querySelectorAll('.list-item:not(.special-category)')).find(el => el.innerText.includes('المضافة حديثاً'));
                if (recentCat) {
                    recentCat.click();
                    defaultClicked = true;
                }
            } else if (type === 'series') {
                const firstRealCat = container.querySelector('.list-item:not(.special-category)');
                if (firstRealCat) {
                    firstRealCat.click();
                    defaultClicked = true;
                }
            }
        }

        if (!defaultClicked) {
            const firstReal = container.querySelector('.list-item:not(.special-category)') || container.querySelector('.list-item');
            if (firstReal) firstReal.click();
        }
    } catch (e) {
        console.error("Load Categories Error:", e);
        container.innerHTML = '<div class="empty-state">فشل في تحميل الأقسام</div>';
    }
}

// ==========================================
// 2. دالة إحضار الأرقام (مع حد أقصى 30)
// ==========================================
async function fetchCategoryCounts(type, containerId) {
    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    let action = type === 'live' ? 'get_live_streams' : (type === 'vod' ? 'get_vod_streams' : 'get_series');
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;

    try {
        const streams = await proxyFetch(url);
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

        const allSpan = document.querySelector(`#${containerId} [data-cat-id="all"]`);
        if (allSpan) allSpan.innerText = streams.length;

        const recentSpan = document.querySelector(`#${containerId} [data-cat-id="recent"]`);
        if (recentSpan) recentSpan.innerText = Math.min(streams.length, 30);

        for (const catId in counts) {
            const span = document.querySelector(`#${containerId} [data-cat-id="${catId}"]`);
            if (span) {
                const catNameEl = span.previousElementSibling;
                const text = catNameEl ? catNameEl.innerText.toLowerCase() : '';

                if (text.includes('حديث') || text.includes('recent') || text.includes('added') || text.includes('جديد')) {
                    span.innerText = Math.min(counts[catId], 30);
                } else {
                    span.innerText = counts[catId];
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch counts', e);
    }
}

// ==========================================
// 3. دالة تحميل المحتوى (مع حد أقصى 30)
// ==========================================
async function loadStreams(action, categoryId, type) {
    const host = localStorage.getItem('sp_host') || sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);

    const specialIds = ['all', 'favs', 'continue', 'recent'];
    let url = `${host}/player_api.php?username=${user}&password=${pass}&action=${action}`;
    if (!specialIds.includes(categoryId)) {
        url += `&category_id=${categoryId}`;
    }

    let container = '';
    const loadingHtml = `
        <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:300px; color:#fff;">
            <i class="fas fa-spinner fa-spin" style="font-size:45px; color:#e5b935; margin-bottom:15px;"></i>
            <span style="font-size:24px; font-weight:bold;">جاري التحميل...</span>
        </div>
    `;

    if (type === 'live') {
        container = document.getElementById('liveChannels');
        container.innerHTML = loadingHtml;
    } else {
        container = document.getElementById('vodGrid');
        container.innerHTML = loadingHtml;
    }

    try {
        let items = await proxyFetch(url);
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

        if (categoryId === 'favs') {
            const favs = JSON.parse(localStorage.getItem('sp_favs_' + type) || '[]');
            items = items.filter(item => favs.includes(String(item.stream_id || item.series_id))).slice(0, 30);
        } else if (categoryId === 'continue') {
            const cont = JSON.parse(localStorage.getItem('sp_continue_' + type) || '[]');
            items = items.filter(item => cont.includes(String(item.stream_id || item.series_id)));
            items.sort((a, b) => cont.indexOf(String(a.stream_id || a.series_id)) - cont.indexOf(String(b.stream_id || b.series_id)));
            items = items.slice(0, 30);
        } else if (categoryId === 'recent' || isRecentCategory(catName)) {
            items.sort((a, b) => {
                const getTime = (val) => {
                    if (!val) return 0;
                    if (!isNaN(val)) {
                        let timeNum = Number(val);
                        return timeNum < 100000000000 ? timeNum * 1000 : timeNum;
                    }
                    const d = Date.parse(val);
                    return isNaN(d) ? 0 : d;
                };
                const dateA = a.added ? getTime(a.added) : (a.stream_id || a.series_id || 0);
                const dateB = b.added ? getTime(b.added) : (b.stream_id || b.series_id || 0);
                return dateB - dateA;
            });
            items = items.slice(0, 30);
        }

        originalItemsArray = items;
        currentItemsArray = [...items];
        currentSortContext = type;

        const activeCatBadge = document.querySelector(`#${type === 'live' ? 'liveCategories' : 'vodCategories'} .list-item.active .cat-count`);
        if (activeCatBadge) {
            activeCatBadge.innerText = items.length;
        }

        renderItems(currentItemsArray, type);
    } catch (e) {
        console.error("Load Streams Error:", e);
        container.innerHTML = '<div class="empty-state">فشل في تحميل المحتوى</div>';
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
    if (modal) modal.classList.add('hidden');

    if (!isFromPopState) {
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

    const wrapper = document.getElementById('livePlayerWrapper');
    if (wrapper) wrapper.innerHTML = '<div class="empty-state">اختر قناة لبدء المشاهدة</div>';

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

    // عرض قسم الأفلام الرائجة فوراً من الكاش أو القائمة الحالية
    renderPopularShelf('vod', movieId);

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
        const info = data.info || {};

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

    // تعيين المعلومات الأساسية فوراً
    document.getElementById('seriesTitle').innerText = name;
    document.getElementById('seriesTitleBottom').innerText = name;
    document.getElementById('seriesPoster').src = cover || 'photo/logo.ico';
    const backdropEl = document.getElementById('seriesBackdrop');
    if (backdropEl) {
        backdropEl.style.backgroundImage = `url('${cover || 'photo/logo.ico'}')`;
    }

    // عرض قسم المسلسلات الرائجة فوراً
    renderPopularShelf('series', seriesId);

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

            seasonData.forEach(ep => {
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
function renderPopularShelf(type, currentId) {
    const containerId = type === 'vod' ? 'popularMoviesGrid' : 'popularSeriesGrid';
    const sectionId = type === 'vod' ? 'moviePopularSection' : 'seriesPopularSection';
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    if (!container || !section) return;

    let sourceItems = (originalItemsArray && originalItemsArray.length > 0) ? originalItemsArray : (currentItemsArray || []);

    // فلترة العنصر الحالي حتى لا يتكرر
    let candidateItems = sourceItems.filter(item => {
        const itemId = String(item.stream_id || item.series_id || '');
        return itemId && itemId !== String(currentId);
    });

    if (candidateItems.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'flex';
    container.innerHTML = '';

    // اختيار أول 18 عنصراً للعرض في الشريط
    const displayItems = candidateItems.slice(0, 18);

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
function openTrailerModal(trailerKey, title) {
    const modal = document.getElementById('trailerModal');
    const titleEl = document.getElementById('trailerModalTitle');
    const videoWrap = document.getElementById('trailerVideoWrapper');
    if (!modal || !videoWrap) return;

    if (titleEl) {
        titleEl.innerHTML = `<i class="fab fa-youtube" style="color:#ff2a2a; margin-left:8px;"></i> إعلان: ${title || 'الإعلان الترويجي'}`;
    }

    let embedUrl = '';
    if (trailerKey && typeof trailerKey === 'string' && trailerKey.trim() !== '') {
        const key = trailerKey.trim();
        if (key.includes('youtube.com') || key.includes('youtu.be')) {
            const videoIdMatch = key.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            const id = videoIdMatch ? videoIdMatch[1] : '';
            embedUrl = id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : key;
        } else {
            embedUrl = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`;
        }
    } else {
        const query = encodeURIComponent((title || '') + ' official trailer');
        embedUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${query}&autoplay=1`;
    }

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
        // Sort by added descending (assuming added string is a timestamp or date)
        // If 'added' is not available, we sort by stream_id descending (newer is usually higher id)
        sorted.sort((a, b) => {
            const dateA = a.added ? new Date(a.added * 1000).getTime() : (a.stream_id || a.series_id || 0);
            const dateB = b.added ? new Date(b.added * 1000).getTime() : (b.stream_id || b.series_id || 0);
            return dateB - dateA;
        });
    } else if (option === 'asc') {
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (option === 'desc') {
        sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    renderItems(sorted, currentSortContext);
}

function renderItems(items, type) {
    let container = type === 'live' ? document.getElementById('liveChannels') : document.getElementById('vodGrid');
    container.innerHTML = '';

    if (type === 'live') {
        const savedLive = sessionStorage.getItem('sp_last_live_stream');
        let savedLiveObj = null;
        if (savedLive) {
            try { savedLiveObj = JSON.parse(savedLive); } catch (e) { }
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.dataset.streamId = String(item.stream_id);

            const isCurrentlyPlaying = currentStreamInfo && String(currentStreamInfo.id) === String(item.stream_id);
            const isSavedMatch = !currentStreamInfo && savedLiveObj && String(savedLiveObj.id) === String(item.stream_id);

            if (isCurrentlyPlaying || isSavedMatch) {
                el.classList.add('active');
            }

            el.innerHTML = `
                <img src="${item.stream_icon || 'photo/logo.ico'}" class="channel-icon" onerror="this.src='photo/logo.ico'">
                <span>${item.name}</span>
            `;
            el.onclick = () => {
                document.querySelectorAll('#liveChannels .list-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
                playStream(item.stream_id, 'live', 'm3u8', item.name, item.stream_icon);
            };
            container.appendChild(el);
        });
    } else {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'vod-card';
            let id = item.stream_id || item.series_id;
            let name = item.name;
            let cover = item.stream_icon || item.cover || 'photo/logo.ico';
            let ext = item.container_extension || 'mp4';

            card.innerHTML = `
                <img src="${cover}" class="vod-poster" onerror="this.src='photo/logo.ico'">
                <div class="vod-info">
                    <div class="vod-title" title="${name}">${name}</div>
                </div>
            `;
            card.onclick = () => {
                if (type === 'series') {
                    showSeriesDetails(id, name, cover);
                } else {
                    showMovieDetails(id, name, cover, ext);
                }
            };
            container.appendChild(card);
        });
    }
}

// ==========================================
// FAVOURITES & CONTINUE WATCHING LOGIC
// ==========================================
let currentPlayingItem = null;

function toggleFavorite(id, type) {
    id = String(id);
    const storageKey = 'sp_favs_' + type;
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

    if (currentSortContext === type && document.querySelector('.special-category.active span')?.innerText === 'المفضلة') {
        const action = type === 'live' ? 'get_live_streams' : (type === 'vod' ? 'get_vod_streams' : 'get_series');
        loadStreams(action, 'favs', type);
    }
}

function recordContinueWatching(id, type) {
    id = String(id);
    const storageKey = 'sp_continue_' + type;
    let cont = JSON.parse(localStorage.getItem(storageKey) || '[]');

    // إزالة العنصر لو كان موجوداً لنقله إلى بداية القائمة
    cont = cont.filter(c => c !== id);
    cont.unshift(id);

    // الاحتفاظ بآخر 30 عنصر فقط بدلاً من 50
    if (cont.length > 30) cont.pop();

    localStorage.setItem(storageKey, JSON.stringify(cont));
}

// ==========================================
// SEARCH LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const searchLiveCats = document.getElementById('searchLiveCategories');
    if (searchLiveCats) {
        searchLiveCats.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#liveCategories .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchVodCats = document.getElementById('searchVodCategories');
    if (searchVodCats) {
        searchVodCats.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vodCategories .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchLiveItems = document.getElementById('searchLiveItems');
    if (searchLiveItems) {
        searchLiveItems.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#liveChannels .list-item').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    const searchVodItems = document.getElementById('searchVodItems');
    if (searchVodItems) {
        searchVodItems.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#vodGrid .vod-card').forEach(el => {
                const text = el.innerText.toLowerCase();
                el.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }
});