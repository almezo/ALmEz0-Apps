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

    window.AlMeZ0App = {
        isElectron: isElectron,
        isCapacitor: isCapacitor,
        isAndroid: isAndroid,
        isIOS: isIOS,
        isNative: isElectron || isCapacitor,
        platform: isElectron ? 'electron' : (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        // Helper to open links safely across platforms
        openExternal: function (url) {
            if (!url) return;
            if (isElectron && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(url);
            } else if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                window.Capacitor.Plugins.Browser.open({ url: url });
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
    };

    // Add CSS class to body for platform-specific styling
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

        // Intercept external anchor clicks in Electron and Native apps
        document.addEventListener('click', function (e) {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            const isExternal =
                href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('tel:') ||
                href.startsWith('whatsapp:') ||
                href.startsWith('mailto:');

            const isSocialOrExternal =
                href.includes('wa.me') ||
                href.includes('facebook.com') ||
                href.includes('player.almezo.store') ||
                href.startsWith('tel:') ||
                href.startsWith('whatsapp:');

            if (isElectron && isSocialOrExternal) {
                e.preventDefault();
                window.AlMeZ0App.openExternal(href);
            }
        }, true);

        // Capacitor Android Hardware Back Button Handling
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.addListener('backButton', function (canGoBack) {
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
                    // Double-tap or prompt to exit app
                    window.Capacitor.Plugins.App.exitApp();
                }
            });
        }
    });
})();
