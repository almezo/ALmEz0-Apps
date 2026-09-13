/**
 * AlMeZ0 Cross-Platform App Bridge
 * Handles platform detection, hardware back button, external URLs, orientation, and safe-area adjustments
 * for Electron (Windows), Capacitor (Android / iOS), and standard Web.
 */
(function () {
    const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
    const isCapacitor = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    const isAndroid = (isCapacitor && window.Capacitor.getPlatform() === 'android') || !!(window.AndroidNativeBridge);
    const isIOS = isCapacitor && window.Capacitor.getPlatform() === 'ios';
    const isNative = isElectron || isCapacitor || !!(window.AndroidNativeBridge);

    window.AlMeZ0App = {
        isElectron: isElectron,
        isCapacitor: isCapacitor,
        isAndroid: isAndroid,
        isIOS: isIOS,
        isNative: isNative,
        platform: isElectron ? 'electron' : (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        // Helper to lock screen to landscape (e.g. for Player)
        lockLandscape: async function () {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) {
                    await window.Capacitor.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
                    return true;
                }
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('landscape');
                    return true;
                }
            } catch (e) {
                console.warn('ScreenOrientation lockLandscape failed:', e);
            }
            return false;
        },

        // Helper to lock screen to portrait (e.g. for Main Site)
        lockPortrait: async function () {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) {
                    await window.Capacitor.Plugins.ScreenOrientation.lock({ orientation: 'portrait' });
                    return true;
                }
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('portrait');
                    return true;
                }
            } catch (e) {
                console.warn('ScreenOrientation lockPortrait failed:', e);
            }
            return false;
        },

        // Helper to unlock screen orientation
        unlockOrientation: async function () {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) {
                    await window.Capacitor.Plugins.ScreenOrientation.unlock();
                    return true;
                }
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                    return true;
                }
            } catch (e) { }
            return false;
        },

        // Helper to toggle full immersive edge-to-edge mode (hide Android status bar and navigation bar)
        setImmersiveFullscreen: function (enabled) {
            try {
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.setImmersiveFullscreen === 'function') {
                    window.AndroidNativeBridge.setImmersiveFullscreen(!!enabled);
                    return true;
                }
            } catch (e) {
                console.warn('setImmersiveFullscreen failed:', e);
            }
            return false;
        },

        // Helper to launch hardware-accelerated internal native video player (ExoPlayer)
        playNativeVideo: function (videoUrl, title, posterUrl) {
            try {
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.playNativeVideo === 'function') {
                    window.AndroidNativeBridge.playNativeVideo(videoUrl, title || 'ALmEz0 Video', posterUrl || '');
                    return true;
                }
            } catch (e) {
                console.warn('playNativeVideo failed:', e);
            }
            return false;
        },

        // Helper to open media streams in external players (VLC, MX Player, Android Intent)
        openInExternalPlayer: function (streamUrl, title) {
            if (!streamUrl) return;
            const cleanUrl = String(streamUrl).trim();

            if (isAndroid) {
                const cleanNoProto = cleanUrl.replace(/^https?:\/\//, '');
                // Android intent to trigger video player chooser (VLC, MX Player, Nova, System)
                const generalIntent = `intent://${cleanNoProto}#Intent;scheme=http;type=video/*;action=android.intent.action.VIEW;end`;

                try {
                    window.location.href = `vlc://${cleanUrl}`;
                } catch (e) { }

                setTimeout(() => {
                    window.location.href = generalIntent;
                }, 250);
            } else {
                window.location.href = `vlc://${cleanUrl}`;
            }
        },

        // Helper to open links safely across platforms
        openExternal: function (url) {
            if (!url) return;

            if (isElectron && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(url);
            } else if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                // For WhatsApp and Phone calls, location.href triggers Android's native intent app launcher
                if (url.startsWith('tel:') || url.startsWith('whatsapp:') || url.includes('wa.me')) {
                    window.location.href = url;
                } else {
                    window.Capacitor.Plugins.Browser.open({ url: url }).catch(function () {
                        window.location.href = url;
                    });
                }
            } else if (isCapacitor) {
                window.location.href = url;
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
    };

    // Safe global interceptor for window.open
    const _origWindowOpen = window.open;
    window.open = function (url, target, features) {
        if (!url) return null;

        let cleanUrl = String(url);

        // Player routing (only if initiated via window.open):
        if (cleanUrl.includes('go-player.php') || cleanUrl.includes('player.html')) {
            if (isNative) {
                window.location.href = 'player.html';
                return null;
            }
        }

        const isSocialOrExternal =
            cleanUrl.includes('wa.me') ||
            cleanUrl.includes('facebook.com') ||
            cleanUrl.startsWith('tel:') ||
            cleanUrl.startsWith('whatsapp:');

        if (isNative && isSocialOrExternal) {
            window.AlMeZ0App.openExternal(cleanUrl);
            return null;
        }

        return _origWindowOpen.call(window, cleanUrl, target, features);
    };

    document.addEventListener('DOMContentLoaded', function () {
        const body = document.body;
        if (!body) return;

        if (isElectron) {
            body.classList.add('platform-native', 'platform-electron');
            document.documentElement.classList.add('platform-native');
        } else if (isAndroid) {
            body.classList.add('platform-native', 'platform-android');
            document.documentElement.classList.add('platform-native');
        } else if (isIOS) {
            body.classList.add('platform-native', 'platform-ios');
            document.documentElement.classList.add('platform-native');
        }

        // إخفاء وحذف صندوق تثبيت التطبيق تماماً في كل التطبيقات المثبتة
        if (isNative) {
            const pwaBox = document.getElementById('pwa-install-container');
            if (pwaBox) {
                pwaBox.style.setProperty('display', 'none', 'important');
                pwaBox.remove();
            }

            // فحص وجود تحديثات جديدة للتطبيق وعرض نافذة التحديث للعميل القديم
            setTimeout(checkInAppUpdate, 3500);
        }

        // Intercept external social/contact link clicks in native Android, iOS and Electron
        // NOTE: We DO NOT intercept go-player.php here so handlePlayerCardClick can verify authentication!
        document.addEventListener('click', function (e) {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            let href = anchor.getAttribute('href');
            if (!href) return;

            const isSocialOrExternal =
                href.includes('wa.me') ||
                href.includes('facebook.com') ||
                href.startsWith('tel:') ||
                href.startsWith('whatsapp:');

            if (isNative && isSocialOrExternal) {
                e.preventDefault();
                e.stopPropagation();
                window.AlMeZ0App.openExternal(href);
            }
        }, true);

        // Capacitor Android Hardware Back Button Handling
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            let lastBackPress = 0;

            window.Capacitor.Plugins.App.addListener('backButton', function () {
                // 1. إغلاق أي نافذة تنبيه SweetAlert2 مفتوحة
                if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                    Swal.close();
                    return;
                }

                // 2. إذا كان مشغل الفيديو مفتوحاً بملء الشاشة، يتم إغلاق المشغل والرجوع للشاشة التي كان فيها
                const videoModal = document.getElementById('fullscreenVideoModal');
                if (videoModal && !videoModal.classList.contains('hidden')) {
                    if (typeof closeFullscreenPlayer === 'function') {
                        closeFullscreenPlayer();
                        return;
                    }
                }

                // 3. إذا كانت هناك نافذة فرعية مفتوحة (نافذة الدخول، ترتيب، خروج، إلخ) يتم إغلاقها
                const openModal = document.querySelector('.modal.active, .modal.show, [id*="modal"][style*="block"], [id*="modal"][style*="flex"], [id*="Modal"][style*="block"], [id*="Modal"][style*="flex"], .sort-modal:not(.hidden)');
                if (openModal) {
                    if (openModal.id === 'loginModal' && typeof closeLoginModal === 'function') {
                        closeLoginModal();
                        return;
                    }
                    if (openModal.id === 'sortModal') {
                        openModal.classList.add('hidden');
                        return;
                    }
                    const closeBtn = openModal.querySelector('.close-btn, .modal-close, button[onclick*="close"], .btn-sort-close');
                    if (closeBtn) {
                        closeBtn.click();
                        return;
                    }
                    openModal.style.display = 'none';
                    return;
                }

                // 4. داخل مشغل ميزو (player.html): الرجوع خطوة بخطوة (تفاصيل -> القائمة -> الداشبورد -> الموقع)
                const currentPath = window.location.pathname.toLowerCase();
                if (currentPath.includes('player.html')) {
                    const activeScreen = (typeof currentScreenId !== 'undefined') ? currentScreenId : sessionStorage.getItem('sp_current_screen');

                    // أ) إذا كان في تفاصيل فيلم أو مسلسل، يرجع لقائمة الأفلام/المسلسلات
                    if (activeScreen === 'movie-details-screen' || activeScreen === 'series-details-screen') {
                        if (typeof goBack === 'function') {
                            goBack();
                            return;
                        } else if (typeof showScreen === 'function') {
                            showScreen('vod-screen');
                            return;
                        }
                    }

                    // ب) إذا كان في أقسام الأفلام أو المسلسلات أو البث المباشر أو الملف الشخصي، يرجع للوحة التحكم الرئيسية للمشغل
                    if (activeScreen === 'vod-screen' || activeScreen === 'live-screen' || activeScreen === 'profile-screen') {
                        if (typeof showScreen === 'function') {
                            showScreen('dashboard-screen');
                            return;
                        }
                    }

                    // ج) إذا كان في شاشة الداشبورد أو شاشة الدخول فقط، يرجع للموقع الرئيسي مع إعادة تدوير الشاشة لوضعها الطبيعي
                    if (activeScreen === 'dashboard-screen' || activeScreen === 'auth1-screen' || activeScreen === 'auth2-screen' || !activeScreen) {
                        if (window.AlMeZ0App) {
                            if (typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') window.AlMeZ0App.setImmersiveFullscreen(false);
                            if (typeof window.AlMeZ0App.lockPortrait === 'function') window.AlMeZ0App.lockPortrait();
                        }
                        window.location.href = 'index.html';
                        return;
                    }

                    // خيار احتياطي لتاريخ المتصفح
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        if (window.AlMeZ0App) {
                            if (typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') window.AlMeZ0App.setImmersiveFullscreen(false);
                            if (typeof window.AlMeZ0App.lockPortrait === 'function') window.AlMeZ0App.lockPortrait();
                        }
                        window.location.href = 'index.html';
                    }
                    return;
                }

                // 5. في صفحات الموقع الأخرى (مثل iptv.html, server-details.html, vip.html)
                const isHome = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/');

                if (!isHome) {
                    // الرجوع للصفحة السابقة التي كان فيها المستخدم
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.href = 'index.html';
                    }
                    return;
                }

                // 6. في الصفحة الرئيسية للموقع (index.html): الخروج بضغطة مزدوجة لمنع الإغلاق بالخطأ
                const now = Date.now();
                if (now - lastBackPress < 2000) {
                    window.Capacitor.Plugins.App.exitApp();
                } else {
                    lastBackPress = now;
                    if (typeof showToast === 'function') {
                        showToast('اضغط مرة أخرى للخروج من التطبيق', 'info');
                    } else if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            toast: true,
                            position: 'bottom',
                            title: 'اضغط مرة أخرى للخروج من التطبيق',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    }
                }
            });
        }
    });

    // =========================================================================
    // نظام فحص وتنبيه التحديثات الذكي داخل التطبيق (In-App Smart Updater)
    // =========================================================================
    const CURRENT_APP_VERSION = '1.0.0';

    function compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;
        const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const len = Math.max(p1.length, p2.length);
        for (let i = 0; i < len; i++) {
            const num1 = p1[i] || 0;
            const num2 = p2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    async function checkInAppUpdate() {
        if (!isNative) return;

        try {
            let versionData = null;
            const endpoints = [
                'https://raw.githubusercontent.com/almezo/ALmEz0-Downloads/main/version.json?t=' + Date.now(),
                'version.json?t=' + Date.now()
            ];

            for (const url of endpoints) {
                try {
                    const res = await fetch(url, { cache: 'no-store' });
                    if (res.ok) {
                        versionData = await res.json();
                        break;
                    }
                } catch (e) {}
            }

            if (!versionData || !versionData.version) return;

            const latestVer = versionData.version;
            if (compareVersions(latestVer, CURRENT_APP_VERSION) <= 0) {
                return; // التطبيق على أحدث إصدار
            }

            const dismissKey = 'almezo_dismissed_update_' + latestVer;
            if (sessionStorage.getItem(dismissKey)) {
                return;
            }

            showInAppUpdateBanner(versionData);
        } catch (err) {
            console.warn('In-app update check failed:', err);
        }
    }

    function showInAppUpdateBanner(info) {
        if (document.getElementById('almezo-inapp-update-banner')) return;

        const downloadUrl = (isAndroid)
            ? (info.downloadUrls?.android || 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.apk')
            : (info.downloadUrls?.windows || 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.exe');

        const banner = document.createElement('div');
        banner.id = 'almezo-inapp-update-banner';
        banner.innerHTML = `
            <div class="inapp-update-card">
                <div class="inapp-update-icon-glow">
                    <i class="fas fa-rocket"></i>
                </div>
                <div class="inapp-update-body">
                    <div class="inapp-update-header">
                        <span class="inapp-update-badge">تحديث جديد v${info.version}</span>
                        <span class="inapp-update-title">${info.title || 'يتوفر إصدار جديد لتطبيق الميزو'}</span>
                    </div>
                    <div class="inapp-update-notes">${info.notes || 'قم بتحديث التطبيق للاستمتاع بأحدث الميزات وتحسينات المشغل.'}</div>
                </div>
                <div class="inapp-update-actions">
                    <button type="button" class="inapp-btn-update" id="inappBtnUpdate">
                        <i class="fas fa-download"></i> تثبيت التحديث الآن
                    </button>
                    <button type="button" class="inapp-btn-dismiss" id="inappBtnDismiss">
                        لاحقاً
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);
        injectInAppUpdateStyles();

        const btnUpdate = banner.querySelector('#inappBtnUpdate');
        const btnDismiss = banner.querySelector('#inappBtnDismiss');

        btnUpdate.addEventListener('click', () => {
            btnUpdate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التنزيل...';
            btnUpdate.disabled = true;

            if (typeof showToast === 'function') {
                showToast('🚀 جاري بدء تنزيل التحديث...', 'info', 4000);
            }

            setTimeout(() => {
                window.AlMeZ0App.openExternal(downloadUrl);
                setTimeout(() => {
                    banner.classList.add('hide');
                    setTimeout(() => banner.remove(), 400);
                }, 1500);
            }, 300);
        });

        btnDismiss.addEventListener('click', () => {
            sessionStorage.setItem('almezo_dismissed_update_' + info.version, 'true');
            banner.classList.add('hide');
            setTimeout(() => banner.remove(), 400);
        });
    }

    function injectInAppUpdateStyles() {
        if (document.getElementById('inapp-update-styles')) return;
        const style = document.createElement('style');
        style.id = 'inapp-update-styles';
        style.textContent = `
            #almezo-inapp-update-banner {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(0);
                width: calc(100% - 32px);
                max-width: 580px;
                z-index: 9999999;
                font-family: 'Cairo', 'Tajawal', sans-serif;
                direction: rtl;
                text-align: right;
                animation: inappSlideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            #almezo-inapp-update-banner.hide {
                animation: inappSlideDown 0.35s ease forwards;
            }
            @keyframes inappSlideUp {
                from { opacity: 0; transform: translateX(-50%) translateY(60px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes inappSlideDown {
                from { opacity: 1; transform: translateX(-50%) translateY(0); }
                to { opacity: 0; transform: translateX(-50%) translateY(60px); }
            }
            .inapp-update-card {
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.96));
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(56, 189, 248, 0.45);
                box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.25);
                border-radius: 18px;
                padding: 16px 18px;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 14px;
            }
            .inapp-update-icon-glow {
                width: 46px;
                height: 46px;
                border-radius: 13px;
                background: linear-gradient(135deg, #0284c7, #0ea5e9);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 20px;
                flex-shrink: 0;
                box-shadow: 0 0 16px rgba(14, 165, 233, 0.6);
            }
            .inapp-update-body {
                flex: 1 1 240px;
                min-width: 200px;
            }
            .inapp-update-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            .inapp-update-badge {
                font-size: 11px;
                font-weight: 700;
                background: rgba(14, 165, 233, 0.2);
                color: #38bdf8;
                border: 1px solid rgba(56, 189, 248, 0.4);
                padding: 2px 8px;
                border-radius: 20px;
            }
            .inapp-update-title {
                color: #fff;
                font-size: 14px;
                font-weight: 800;
            }
            .inapp-update-notes {
                color: #94a3b8;
                font-size: 12px;
                line-height: 1.5;
            }
            .inapp-update-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
            }
            .inapp-btn-update {
                flex: 1;
                background: linear-gradient(135deg, #0284c7, #025381);
                color: #fff;
                border: none;
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
            }
            .inapp-btn-update:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 18px rgba(2, 132, 199, 0.6);
            }
            .inapp-btn-dismiss {
                background: rgba(255, 255, 255, 0.08);
                color: #cbd5e1;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .inapp-btn-dismiss:hover {
                background: rgba(255, 255, 255, 0.16);
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    window.AlMeZ0App.checkUpdate = checkInAppUpdate;
    window.AlMeZ0App.showInAppUpdateBanner = showInAppUpdateBanner;
})();
