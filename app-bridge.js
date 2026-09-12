/**
 * AlMeZ0 Cross-Platform App Bridge
 * Handles platform detection, hardware back button, external URLs, and safe-area adjustments
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

        // Helper to open links safely across platforms
        openExternal: function (url) {
            if (!url) return;

            // Map internal go-player redirect to the real live player URL
            if (url.includes('go-player.php') || url.includes('player.almezo.store')) {
                url = 'http://player.almezo.store';
            }

            if (isElectron && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(url);
            } else if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                // Use Capacitor Browser plugin for websites (Player, Facebook)
                if (url.startsWith('tel:') || url.startsWith('whatsapp:') || url.includes('wa.me')) {
                    // For WhatsApp and Phone calls, location.href triggers Android's native intent app launcher
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
        if (cleanUrl.includes('go-player.php') || cleanUrl.includes('player.almezo.store')) {
            cleanUrl = 'http://player.almezo.store';
        }

        const isSocialOrExternal =
            cleanUrl.includes('wa.me') ||
            cleanUrl.includes('facebook.com') ||
            cleanUrl.includes('player.almezo.store') ||
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
            body.classList.add('platform-electron');
        } else if (isAndroid) {
            body.classList.add('platform-native', 'platform-android');
        } else if (isIOS) {
            body.classList.add('platform-native', 'platform-ios');
        }

        // Intercept all link clicks in native Android, iOS and Electron
        document.addEventListener('click', function (e) {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            let href = anchor.getAttribute('href');
            if (!href) return;

            if (href.includes('go-player.php')) {
                href = 'http://player.almezo.store';
            }

            const isSocialOrExternal =
                href.includes('wa.me') ||
                href.includes('facebook.com') ||
                href.includes('player.almezo.store') ||
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
            window.Capacitor.Plugins.App.addListener('backButton', function () {
                // If modal is open, close modal first
                const openModal = document.querySelector('.modal.active, .modal.show, [id*="modal"][style*="block"], [id*="Modal"][style*="flex"]');
                if (openModal) {
                    const closeBtn = openModal.querySelector('.close-btn, .modal-close, button[onclick*="close"]');
                    if (closeBtn) {
                        closeBtn.click();
                        return;
                    }
                }

                // If not at home page, navigate back
                const currentPath = window.location.pathname.toLowerCase();
                const isHome = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/');

                if (!isHome && window.history.length > 1) {
                    window.history.back();
                } else if (!isHome) {
                    window.location.href = 'index.html';
                } else {
                    window.Capacitor.Plugins.App.exitApp();
                }
            });
        }
    });
})();
