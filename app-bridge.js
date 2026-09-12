/**
 * AlMeZ0 Cross-Platform App Bridge
 * Handles platform detection, hardware back button, external URLs, orientation, and safe-area adjustments
 * for Electron (Windows), Capacitor (Android / iOS), and standard Web.
 */
(function () {
    const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
    const isCapacitor = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    const isAndroid = isCapacitor && window.Capacitor.getPlatform() === 'android';
    const isIOS = isCapacitor && window.Capacitor.getPlatform() === 'ios';
    const isNative = isElectron || isCapacitor;

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
                            showScreen(activeScreen === 'series-details-screen' ? 'series-screen' : 'vod-screen');
                            return;
                        }
                    }

                    // ب) إذا كان في أقسام الأفلام أو المسلسلات أو البث المباشر أو الملف الشخصي، يرجع للوحة التحكم الرئيسية للمشغل
                    if (activeScreen === 'vod-screen' || activeScreen === 'series-screen' || activeScreen === 'live-screen' || activeScreen === 'profile-screen') {
                        if (typeof showScreen === 'function') {
                            showScreen('dashboard-screen');
                            return;
                        }
                    }

                    // ج) إذا كان في شاشة الداشبورد أو شاشة الدخول فقط، يرجع للموقع الرئيسي مع إعادة تدوير الشاشة لوضعها الطبيعي
                    if (activeScreen === 'dashboard-screen' || activeScreen === 'auth1-screen' || activeScreen === 'auth2-screen' || !activeScreen) {
                        if (window.AlMeZ0App && typeof window.AlMeZ0App.lockPortrait === 'function') {
                            window.AlMeZ0App.lockPortrait();
                        }
                        window.location.href = 'index.html';
                        return;
                    }

                    // خيار احتياطي لتاريخ المتصفح
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        if (window.AlMeZ0App && typeof window.AlMeZ0App.lockPortrait === 'function') {
                            window.AlMeZ0App.lockPortrait();
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
})();
