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

    // مزامنة ملف Manifest واسم التطبيق تلقائياً بحسب لغة جهاز العميل (عربي -> "الميزو" / إنجليزي -> "ALmEz0")
    function syncLocalizedManifest() {
        try {
            const lang = (navigator.language || navigator.userLanguage || 'ar').toLowerCase();
            const isAr = lang.startsWith('ar');
            const targetManifest = isAr ? 'manifest-ar.json' : 'manifest-en.json';
            const mLink = document.querySelector('link[rel="manifest"]');
            if (mLink) mLink.setAttribute('href', targetManifest);
            const aTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
            if (aTitle) aTitle.setAttribute('content', isAr ? 'الميزو' : 'ALmEz0');
        } catch (e) { }
    }
    syncLocalizedManifest();

    // تحميل نظام ذكاء الشاشات والتكيف التلقائي (Screen Intelligence Engine)
    if (!window.AlMeZ0Screen && typeof document !== 'undefined') {
        try {
            const screenScript = document.createElement('script');
            screenScript.src = 'screen-adapter.js';
            screenScript.async = false;
            document.head.appendChild(screenScript);
        } catch (e) { }
    }

    window.AlMeZ0App = {
        isElectron: isElectron,
        isCapacitor: isCapacitor,
        isAndroid: isAndroid,
        isIOS: isIOS,
        isNative: isNative,
        platform: isElectron ? 'electron' : (isCapacitor ? window.Capacitor.getPlatform() : 'web'),
        get screen() {
            return window.AlMeZ0Screen || null;
        },

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

        // Helper to toggle full immersive edge-to-edge mode (hide Android status/nav bars, Windows titlebar and taskbar)
        setImmersiveFullscreen: function (enabled) {
            try {
                // 1. Android Native Bridge (Immersive sticky mode: hides status bar and navigation bar)
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.setImmersiveFullscreen === 'function') {
                    window.AndroidNativeBridge.setImmersiveFullscreen(!!enabled);
                }
                // 2. Electron on Windows (True Fullscreen: hides top titlebar and covers Windows taskbar)
                if (window.electronAPI && typeof window.electronAPI.setFullScreen === 'function') {
                    window.electronAPI.setFullScreen(!!enabled);
                }
                // 3. HTML5 Fullscreen API fallback for web browsers
                if (enabled) {
                    if (!document.fullscreenElement && document.documentElement && typeof document.documentElement.requestFullscreen === 'function') {
                        document.documentElement.requestFullscreen().catch(() => {});
                    }
                } else {
                    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
                        document.exitFullscreen().catch(() => {});
                    }
                }
                return true;
            } catch (e) {
                console.warn('setImmersiveFullscreen failed:', e);
            }
            return false;
        },

        hasRecordAudioPermission: function () {
            try {
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.hasRecordAudioPermission === 'function') {
                    return window.AndroidNativeBridge.hasRecordAudioPermission();
                }
            } catch (e) { }
            return true;
        },

        requestRecordAudioPermission: function () {
            try {
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.requestRecordAudioPermission === 'function') {
                    window.AndroidNativeBridge.requestRecordAudioPermission();
                    return true;
                }
            } catch (e) { }
            return false;
        },

        // Helper to launch hardware-accelerated internal native video player (ExoPlayer)
        playNativeVideo: function (videoUrl, title, posterUrl, isLive, isTv) {
            try {
                if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.playNativeVideo === 'function') {
                    if (typeof isTv !== 'undefined') {
                        window.AndroidNativeBridge.playNativeVideo(videoUrl, title || 'ALmEz0 Video', posterUrl || '', !!isLive, !!isTv);
                    } else if (typeof isLive !== 'undefined') {
                        window.AndroidNativeBridge.playNativeVideo(videoUrl, title || 'ALmEz0 Video', posterUrl || '', !!isLive);
                    } else {
                        window.AndroidNativeBridge.playNativeVideo(videoUrl, title || 'ALmEz0 Video', posterUrl || '');
                    }
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
            const ua = (navigator.userAgent || '').toLowerCase();
            const hasNativeTv = window.AndroidNativeBridge && typeof window.AndroidNativeBridge.isTvDevice === 'function' && window.AndroidNativeBridge.isTvDevice();
            const isNoTouch = (navigator.maxTouchPoints === 0 || (!('ontouchstart' in window) && !('msMaxTouchPoints' in navigator)));
            const isTv = hasNativeTv || isNoTouch || ua.includes('tv') || ua.includes('box') || ua.includes('large') || ua.includes('amlogic') || ua.includes('allwinner') || ua.includes('rockchip') || localStorage.getItem('mizo_device_mode') === 'tv';
            if (isTv) {
                body.classList.add('tv-device-mode', 'tv-mode');
                document.documentElement.classList.add('tv-device-mode', 'tv-mode');
                document.documentElement.setAttribute('data-is-tv', 'true');
            }
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

        // =========================================================================
        // محرك التحكم بالريموت وحصر التركيز داخل النوافذ (Universal TV Remote & Focus Trap Engine)
        // =========================================================================
        var NON_MODAL_TAGS = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'I', 'SPAN', 'H1', 'H2', 'H3', 'P', 'LABEL'];

        var modalStack = [];
        var lockedBackgroundSiblings = [];
        var lockedFallbackElements = [];
        var activeTrappedModal = null;

        function isModalElementVisible(el) {
            if (!el || !(el instanceof HTMLElement)) return false;
            if (el.classList.contains('hidden')) return false;
            if (el.id === 'app-scaler' || el.id === 'livePlayerWrapper') return false;
            // رسالة toast ليست نافذة: عزل الصفحة خلفها كان يجمّد الشاشة التي تظهر عليها
            if (el.classList.contains('swal2-container') && el.querySelector('.swal2-toast')) return false;
            if (NON_MODAL_TAGS.indexOf(el.tagName) !== -1) return false;

            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            var isOverlay = (style.position === 'fixed' || style.position === 'absolute') || el.classList.contains('modal') || el.classList.contains('swal2-container');
            if (!isOverlay) return false;

            if (el.offsetParent === null && style.position !== 'fixed') return false;

            var rect = el.getBoundingClientRect();
            return (rect.width >= 30 && rect.height >= 30);
        }

        function getOpenModal() {
            var prioritySelectors = [
                '.custom-confirm-overlay.visible',
                '.custom-alert-overlay.visible',
                '.custom-prompt-overlay.visible',
                '.swal2-container',
                '#almezo-inapp-update-overlay',
                '#logoutModal',
                '#loginModal',
                '#checkoutModal',
                '#usersIntelModalOverlay',
                '#staffManagementModal',
                '#sortModal',
                '#playlistsModal',
                '#deviceModeModal',
                '#trailerModal',
                '#fullscreenVideoModal',
                '.modal.active',
                '.modal.show',
                '.modal',
                '[role="dialog"]',
                '.custom-logout-modal',
                '#player-exclusive-overlay.active',
                '.pwa-fallback-overlay.active'
            ];

            var foundCandidates = [];
            for (var i = 0; i < prioritySelectors.length; i++) {
                var list = Array.from(document.querySelectorAll(prioritySelectors[i]));
                for (var j = 0; j < list.length; j++) {
                    var el = list[j];
                    if (isModalElementVisible(el) && foundCandidates.indexOf(el) === -1) {
                        foundCandidates.push(el);
                    }
                }
            }

            if (!foundCandidates.length) return null;
            if (foundCandidates.length === 1) return foundCandidates[0];

            foundCandidates.sort(function (a, b) {
                var za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
                var zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
                if (za !== zb) return zb - za;
                return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
            });

            return foundCandidates[0];
        }

        /**
         * الطبقة الشفافة خلف بطاقة النافذة (backdrop): وظيفتها الإغلاق عند الضغط خارج
         * البطاقة فقط، ويجب ألا تُعامَل أبداً كعنصر قابل للتركيز.
         *
         * كانت تُلتقط بمحدّد [onclick*="close"] أدناه لأن onclick فيها هو
         * closePlaylistsModal()، فيُفرض عليها tabindex="0" وتصير أول عنصر في النافذة،
         * ثم يضع عليها محرّك التركيز صنف tv-focused الذي يفرض z-index:999 !important —
         * فتقفز الطبقة فوق البطاقة كلها. نتيجته أن كل ضغطة داخل النافذة تقع على الطبقة
         * فتُغلقها، ولوحة المفاتيح تبقى حبيسة عليها، وقبل نقل التعتيم كانت تُعتِم البطاقة
         * كاملة ولا يزول التعتيم إلا بنقل التركيز عنها بسهم أو بضغطة فأرة.
         */
        function isModalBackdrop(el) {
            return !!(el && el.className && typeof el.className === 'string'
                && /(^|[\s-])backdrop([\s-]|$)/.test(el.className));
        }

        function getModalFocusables(modalEl) {
            if (!modalEl) return [];

            var closeAndClickables = modalEl.querySelectorAll('.close-btn, .modal-close, .account-back-btn, [onclick*="close"], .btn-sort-close, .account-btn, .toggle-password-btn');
            for (var c = 0; c < closeAndClickables.length; c++) {
                var item = closeAndClickables[c];
                if (isModalBackdrop(item)) {
                    item.setAttribute('tabindex', '-1');
                    item.removeAttribute('role');
                    item.classList.remove('tv-focused');
                    continue;
                }
                if (!item.hasAttribute('tabindex') || item.getAttribute('tabindex') === '-1') {
                    item.setAttribute('tabindex', '0');
                }
                if (!item.hasAttribute('role')) {
                    item.setAttribute('role', 'button');
                }
            }

            var selector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], .close-btn, .modal-close, .account-back-btn, .account-btn, .btn, .confirm-btn, .btn-confirm-yes, .btn-confirm-no, .btn-alert-ok, .btn-prompt-ok, .btn-prompt-cancel, [tabindex="0"]';
            var all = Array.from(modalEl.querySelectorAll(selector));

            return all.filter(function (el) {
                if (el.disabled) return false;
                if (isModalBackdrop(el)) return false;
                if (el.closest('.hidden')) return false;

                var parentView = el.closest('.account-view, .auth-view');
                if (parentView) {
                    var pStyle = window.getComputedStyle(parentView);
                    if (pStyle.display === 'none' || pStyle.visibility === 'hidden') return false;
                }

                var style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                var r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
        }

        function focusInitialModalElement(modalEl) {
            var focusables = getModalFocusables(modalEl);
            if (!focusables.length) return;

            if (document.activeElement && modalEl.contains(document.activeElement) && focusables.indexOf(document.activeElement) !== -1) {
                document.activeElement.classList.add('tv-focused');
                return;
            }

            var oldTvFocused = document.querySelectorAll('.tv-focused');
            oldTvFocused.forEach(function (el) {
                if (!modalEl.contains(el)) el.classList.remove('tv-focused');
            });

            var targetEl = null;
            var isChangePassOpen = modalEl.querySelector('#accountChangePassView:not([style*="display: none"]):not([style*="display:none"])');
            var isAccountMainOpen = modalEl.querySelector('#accountMainView:not([style*="display: none"]):not([style*="display:none"])');

            if (isAccountMainOpen) {
                var changePassBtn = focusables.find(function (el) {
                    return el.id === 'openChangePassBtn';
                });
                targetEl = changePassBtn || focusables[0];
            } else if (isChangePassOpen) {
                var firstInput = focusables.find(function (el) {
                    return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'hidden';
                });
                targetEl = firstInput || focusables[0];
            } else {
                var primaryAction = focusables.find(function (el) {
                    return el.classList.contains('confirm-btn') || el.classList.contains('btn-confirm-yes') || el.classList.contains('btn-alert-ok') || (el.tagName === 'INPUT' && el.type !== 'hidden');
                });
                targetEl = primaryAction || focusables[0];
            }

            if (targetEl) {
                try {
                    targetEl.focus();
                    targetEl.classList.add('tv-focused');
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) { }
            }
        }

        /** يرفع علامات العزل عن عنصر واحد ويعيد له tabindex الأصلي. */
        function clearLockMarks(el) {
            if (!el || !el.hasAttribute) return;
            if (el.hasAttribute('data-tv-inert-applied')) {
                if (el.inert !== undefined) el.inert = false;
                el.removeAttribute('data-tv-inert-applied');
                el.removeAttribute('aria-hidden');
                var a = lockedBackgroundSiblings.indexOf(el);
                if (a !== -1) lockedBackgroundSiblings.splice(a, 1);
            }
            if (el.hasAttribute('data-tv-orig-tabindex')) {
                var orig = el.getAttribute('data-tv-orig-tabindex');
                if (orig !== null && orig !== '') {
                    el.setAttribute('tabindex', orig);
                } else {
                    el.removeAttribute('tabindex');
                }
                el.removeAttribute('data-tv-orig-tabindex');
                var b = lockedFallbackElements.indexOf(el);
                if (b !== -1) lockedFallbackElements.splice(b, 1);
            }
        }

        /** يرفع العزل عن عنصر وكل ما بداخله. */
        function releaseLock(root) {
            if (!root) return;
            clearLockMarks(root);
            var inner = root.querySelectorAll('[data-tv-inert-applied], [data-tv-orig-tabindex]');
            for (var i = 0; i < inner.length; i++) clearLockMarks(inner[i]);
        }

        function lockBackgroundForModal(modalEl) {
            if (!modalEl) return;
            if (activeTrappedModal === modalEl) return;

            /*
             * النافذة التي نفتحها الآن قد تكون عُزلت قبل قليل ضمن خلفية نافذة أخرى.
             * يحدث هذا مع النوافذ الموجودة أصلاً في الصفحة — نافذة الفرز ووضع الجهاز
             * ومشغل الفيديو بملء الشاشة ونوافذ التأكيد — لأن الحلقة أدناه تتخطّى
             * النافذة الهدف دون أن ترفع عنها عزلاً سابقاً.
             *
             * النتيجة التي قِستُها فعلياً: النافذة تظهر سليمة تماماً ولا تصل إليها أي
             * نقرة إطلاقاً (كل ضغطة تمر من فوقها إلى body)، والبرنامج يبدو متجمّداً بلا
             * أي أثر بصري، ولا يفكّه إلا Escape لأن مستمعه على المستند لا على النافذة.
             * لذلك نرفع العزل عنها وعن كل ما بداخله قبل عزل الخلفية من جديد.
             */
            releaseLock(modalEl);

            var currentActive = document.activeElement;
            var triggerEl = (currentActive && currentActive !== document.body && !modalEl.contains(currentActive)) ? currentActive : null;

            modalStack.push({
                modal: modalEl,
                trigger: triggerEl
            });
            activeTrappedModal = modalEl;

            // 1. العزل النواة التام عبر خاصية inert على كافة عناصر الصفحة خارج النافذة
            var bodyChildren = Array.from(document.body.children);
            for (var i = 0; i < bodyChildren.length; i++) {
                var child = bodyChildren[i];
                if (child === modalEl || child.contains(modalEl) || child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;

                if (!child.hasAttribute('data-tv-inert-applied')) {
                    if (child.inert !== undefined) {
                        child.inert = true;
                    }
                    child.setAttribute('data-tv-inert-applied', 'true');
                    child.setAttribute('aria-hidden', 'true');
                    lockedBackgroundSiblings.push(child);
                }
            }

            // 2. طبقة حماية إضافية (Fallback لمتصفحات قديمة): سحب الـ TabIndex من عناصر الخلفية
            var allFocusables = Array.from(document.querySelectorAll('a, button, input, select, textarea, [tabindex]'));
            for (var j = 0; j < allFocusables.length; j++) {
                var fEl = allFocusables[j];
                if (modalEl.contains(fEl)) continue;
                if (!fEl.hasAttribute('data-tv-orig-tabindex')) {
                    var orig = fEl.getAttribute('tabindex');
                    fEl.setAttribute('data-tv-orig-tabindex', orig !== null ? orig : '');
                    fEl.setAttribute('tabindex', '-1');
                    lockedFallbackElements.push(fEl);
                }
            }

            // 3. توجيه التركيز فورياً داخل النافذة وتحديده بوضوح
            focusInitialModalElement(modalEl);
        }

        function unlockBackgroundFromModal() {
            for (var i = 0; i < lockedBackgroundSiblings.length; i++) {
                var child = lockedBackgroundSiblings[i];
                if (child.inert !== undefined) {
                    child.inert = false;
                }
                child.removeAttribute('data-tv-inert-applied');
                child.removeAttribute('aria-hidden');
            }
            lockedBackgroundSiblings = [];

            for (var j = 0; j < lockedFallbackElements.length; j++) {
                var fEl = lockedFallbackElements[j];
                var orig = fEl.getAttribute('data-tv-orig-tabindex');
                if (orig !== null && orig !== '') {
                    fEl.setAttribute('tabindex', orig);
                } else {
                    fEl.removeAttribute('tabindex');
                }
                fEl.removeAttribute('data-tv-orig-tabindex');
            }
            lockedFallbackElements = [];

            var lastTrigger = null;
            if (modalStack.length > 0) {
                var lastEntry = modalStack.pop();
                lastTrigger = lastEntry ? lastEntry.trigger : null;
            }
            modalStack = [];
            activeTrappedModal = null;

            var modalTvFocused = document.querySelectorAll('.modal .tv-focused, .custom-confirm-overlay .tv-focused, .custom-alert-overlay .tv-focused');
            modalTvFocused.forEach(function (el) { el.classList.remove('tv-focused'); });

            if (lastTrigger && typeof lastTrigger.focus === 'function' && document.body.contains(lastTrigger)) {
                try {
                    lastTrigger.focus();
                    lastTrigger.classList.add('tv-focused');
                    lastTrigger.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) { }
            }
        }

        function handleModalDpadNavigation(modalEl, e) {
            var focusables = getModalFocusables(modalEl);
            if (!focusables.length) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            var currentEl = document.activeElement && modalEl.contains(document.activeElement) ? document.activeElement : null;
            var nextEl = null;

            var isInput = currentEl && (currentEl.tagName === 'INPUT' || currentEl.tagName === 'TEXTAREA');
            if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.keyCode === 37 || e.keyCode === 39)) {
                return;
            }
            if (isInput && e.key === 'Tab') {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (!currentEl || focusables.indexOf(currentEl) === -1) {
                nextEl = focusables[0];
            } else {
                var curIndex = focusables.indexOf(currentEl);
                var isUp = (e.key === 'ArrowUp' || e.keyCode === 38 || (e.key === 'Tab' && e.shiftKey));
                var isDown = (e.key === 'ArrowDown' || e.keyCode === 40 || (e.key === 'Tab' && !e.shiftKey));
                var isLeft = (e.key === 'ArrowLeft' || e.keyCode === 37);
                var isRight = (e.key === 'ArrowRight' || e.keyCode === 39);

                if (isDown) {
                    if (curIndex < focusables.length - 1) {
                        nextEl = focusables[curIndex + 1];
                    } else {
                        nextEl = focusables[0];
                    }
                } else if (isUp) {
                    if (curIndex > 0) {
                        nextEl = focusables[curIndex - 1];
                    } else {
                        nextEl = focusables[focusables.length - 1];
                    }
                } else if (isLeft || isRight) {
                    var spatialNeighbor = find2DSpatialNeighbor(currentEl, focusables, isLeft ? 'left' : 'right');
                    if (spatialNeighbor) {
                        nextEl = spatialNeighbor;
                    } else {
                        nextEl = currentEl;
                    }
                }
            }

            if (nextEl) {
                if (currentEl && currentEl !== nextEl) currentEl.classList.remove('tv-focused');
                try {
                    nextEl.focus();
                } catch (err) { }
                nextEl.classList.add('tv-focused');
                try {
                    nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (err) { }
            }
        }

        function getSiteFocusables() {
            var selector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], .main-category-card, .category-card, .price-card, .btn, [tabindex="0"]';
            var all = Array.from(document.querySelectorAll(selector));
            return all.filter(function (el) {
                if (el.closest('.hidden') || el.closest('[style*="display: none"]')) return false;
                var style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                var r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
        }

        function find2DSpatialNeighbor(currentEl, candidates, direction) {
            var curRect = currentEl.getBoundingClientRect();
            var curCx = curRect.left + curRect.width / 2;
            var curCy = curRect.top + curRect.height / 2;

            var bestCandidate = null;
            var bestScore = Infinity;

            for (var i = 0; i < candidates.length; i++) {
                var cand = candidates[i];
                if (cand === currentEl) continue;
                var r = cand.getBoundingClientRect();
                var candCx = r.left + r.width / 2;
                var candCy = r.top + r.height / 2;

                var dx = candCx - curCx;
                var dy = candCy - curCy;

                var valid = false;
                var primary = 0;
                var secondary = 0;

                if (direction === 'up' && dy < -4) {
                    valid = true;
                    primary = Math.abs(dy);
                    secondary = Math.abs(dx);
                } else if (direction === 'down' && dy > 4) {
                    valid = true;
                    primary = Math.abs(dy);
                    secondary = Math.abs(dx);
                } else if (direction === 'left' && dx < -4) {
                    valid = true;
                    primary = Math.abs(dx);
                    secondary = Math.abs(dy);
                } else if (direction === 'right' && dx > 4) {
                    valid = true;
                    primary = Math.abs(dx);
                    secondary = Math.abs(dy);
                }

                if (valid) {
                    var score = primary + (secondary * 1.5);
                    if (score < bestScore) {
                        bestScore = score;
                        bestCandidate = cand;
                    }
                }
            }
            return bestCandidate;
        }

        function isAlMeZ0PlayerEnv() {
            // المسار فقط (بدون الاستعلام): بعد الرجوع من المشغل قد يبقى الرابط index.html?auth_required=player
            // فكان يُعتبر داخل المشغل، فيعيد تحميل الصفحة بدل تنبيه "اضغط مرة أخرى للخروج"
            return !!document.getElementById('app-scaler') ||
                   !!document.getElementById('dashboard-screen') ||
                   !!document.getElementById('auth1-screen') ||
                   window.location.pathname.toLowerCase().includes('player');
        }

        function handleSitePageDpadNavigation(e) {
            if (isAlMeZ0PlayerEnv()) {
                return;
            }

            var navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
            var navKeyCodes = [37, 38, 39, 40];
            if (!navKeys.includes(e.key) && !navKeyCodes.includes(e.keyCode)) {
                return;
            }

            document.body.classList.add('tv-nav-active');
            document.documentElement.setAttribute('data-input-mode', 'remote');

            var siteFocusables = getSiteFocusables();
            if (!siteFocusables.length) return;

            var currentEl = document.activeElement && siteFocusables.includes(document.activeElement) ? document.activeElement : null;

            var isInput = currentEl && (currentEl.tagName === 'INPUT' || currentEl.tagName === 'TEXTAREA');
            if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.keyCode === 37 || e.keyCode === 39)) {
                return;
            }
            // نفس المنطق: نترك Tab يعمل بسلوكه الطبيعي بين الحقول عند الكتابة الفعلية من لوحة مفاتيح حقيقية
            if (isInput && e.key === 'Tab') {
                return;
            }

            e.preventDefault();

            var nextEl = null;
            if (!currentEl) {
                var firstCard = document.querySelector('#homeCategoriesGrid .main-category-card, .main-category-card, .category-card, .price-card, .btn');
                nextEl = firstCard || siteFocusables[0];
            } else {
                var direction = 'down';
                if (e.key === 'ArrowUp' || e.keyCode === 38 || (e.key === 'Tab' && e.shiftKey)) direction = 'up';
                else if (e.key === 'ArrowDown' || e.keyCode === 40 || (e.key === 'Tab' && !e.shiftKey)) direction = 'down';
                else if (e.key === 'ArrowLeft' || e.keyCode === 37) direction = 'left';
                else if (e.key === 'ArrowRight' || e.keyCode === 39) direction = 'right';

                nextEl = find2DSpatialNeighbor(currentEl, siteFocusables, direction);

                // الانتقال التتابعي السلس إذا لم يتم العثور على جار مكاني مباشر في ذلك الاتجاه
                if (!nextEl) {
                    var curIdx = siteFocusables.indexOf(currentEl);
                    if (direction === 'down' && curIdx !== -1 && curIdx < siteFocusables.length - 1) {
                        nextEl = siteFocusables[curIdx + 1];
                    } else if (direction === 'up' && curIdx !== -1 && curIdx > 0) {
                        nextEl = siteFocusables[curIdx - 1];
                    }
                }
            }

            if (nextEl) {
                if (currentEl) currentEl.classList.remove('tv-focused');
                nextEl.focus();
                nextEl.classList.add('tv-focused');
                try {
                    nextEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                } catch (err) { }
            }
        }

        // مزامنة حالة النوافذ المنبثقة فوري عند التفاعل وعبر مراقب DOM دقيق
        function syncModalState() {
            var currentModal = getOpenModal();
            if (currentModal && currentModal !== activeTrappedModal) {
                lockBackgroundForModal(currentModal);
            } else if (!currentModal && activeTrappedModal) {
                unlockBackgroundFromModal();
            }
            return currentModal;
        }

        /*
         * حارس: لا يجوز أن يبقى أي عزل وليس هناك نافذة مفتوحة.
         *
         * عزلٌ عالق يعني صفحة لا تقبل أي نقرة مع أنها تبدو سليمة تماماً، وهو عطل
         * لا يشفى إلا بإعادة تحميل الصفحة. مهما كان التسلسل الذي أوصلنا إليه — نافذة
         * حُذفت من DOM قبل أن يلتقطها المراقب، أو انتقال بين الشاشات وسط الحركة —
         * يصلحه هذا الفحص عند أول نقرة أو عند العودة إلى البرنامج.
         */
        var lastStuckCheck = 0;
        function releaseStuckLocks() {
            var now = Date.now();
            if (now - lastStuckCheck < 400) return;
            lastStuckCheck = now;
            if (getOpenModal()) return;
            var stale = document.querySelectorAll('[data-tv-inert-applied], [data-tv-orig-tabindex]');
            if (!stale.length) return;
            for (var i = 0; i < stale.length; i++) clearLockMarks(stale[i]);
            lockedBackgroundSiblings = [];
            lockedFallbackElements = [];
            modalStack = [];
            activeTrappedModal = null;
        }

        // مراقب DOM فوري لرصد فتح أو إغلاق أي نافذة تلقائياً وعزل الخلفية فوراً
        var modalObserver = null;
        try {
            modalObserver = new MutationObserver(function () {
                syncModalState();
            });
            modalObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden']
            });
        } catch (obsErr) { }

        window.addEventListener('click', function () {
            syncModalState();
            releaseStuckLocks();
        }, true);
        // العودة للبرنامج من نافذة أخرى: أكثر لحظة اشتكى فيها المستخدم من توقف النقر
        window.addEventListener('focus', releaseStuckLocks);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) releaseStuckLocks();
        });

        // حارس أمني دائم: منع تسرب التركيز إلى خارج النافذة نهائياً
        document.addEventListener('focusin', function (e) {
            if (activeTrappedModal && document.body.contains(activeTrappedModal)) {
                if (!activeTrappedModal.contains(e.target)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    focusInitialModalElement(activeTrappedModal);
                }
            }
        }, true);

        // إدارة زر الرجوع الموحد (Universal Back Handler)
        var lastBackPress = 0;
        // fromNative: تطبيق أندرويد يسأل الصفحة أولاً؛ إن لم يبقَ ما يُغلق أو يُرجَع إليه في الصفحة
        // الرئيسية تُعيد 'exit' ويتولى التطبيق تنبيه "اضغط مرة أخرى للخروج" والخروج بنفسه
        /**
         * العودة من المشغل إلى الشاشة الرئيسية تمرّ بافتتاحية "سيرفرات الميزو"، بنفس
         * سلوك تطبيق أندرويد (DashboardActivity.exitToHome).
         */
        function goHomeWithIntro() {
            if (window.MizoIntro && window.MizoIntro.isDesktopApp()) {
                window.MizoIntro.navigate('home', 'index.html');
            } else {
                window.location.href = 'index.html';
            }
        }

        /**
         * أزرار "الرجوع للرئيسية" الظاهرة في المشغل روابط <a href="index.html"> عادية،
         * فكانت تتجاوز goHomeWithIntro وتنتقل بلا افتتاحية بعكس تطبيق أندرويد.
         * نعترضها هنا مرة واحدة بدل تعديل كل زر. المستمع في مرحلة الالتقاط ليقرأ الشاشة
         * المعروضة قبل أن يغيّرها معالج الزر نفسه (goBack)، وإلا رجعنا شاشتين بضغطة.
         * في حالة الخروج لا نوقف الحدث، فينفَّذ onclick المكتوب داخل الرابط (إلغاء ملء
         * الشاشة) أثناء الافتتاحية كما كان.
         */
        (function interceptHomeLinks() {
            if (!/player\.html$/i.test(location.pathname)) return;
            document.addEventListener('click', function (e) {
                var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
                if (!a) return;
                var href = a.getAttribute('href') || '';
                var isHomeLink = /^index\.html(\?|#|$)/i.test(href) || a.id === 'navReturnBtn';
                if (!isHomeLink) return;
                e.preventDefault();

                // داخل شاشة (البث أو الأفلام أو المسلسلات أو الملف الشخصي) يرجع الزر
                // شاشةً واحدة لا خارج المشغل كلياً. كان يخرج إلى الموقع من أي شاشة لأن
                // الرابط يذهب إلى index.html بغضّ النظر عن الشاشة المعروضة.
                var screen = null;
                try { screen = sessionStorage.getItem('sp_current_screen'); } catch (err) { }
                if (typeof currentScreenId !== 'undefined' && currentScreenId) screen = currentScreenId;
                var inner = ['live-screen', 'vod-screen', 'series-screen', 'profile-screen',
                             'movie-details-screen', 'series-details-screen', 'vod-details-screen'];
                if (inner.indexOf(screen) !== -1) {
                    e.stopPropagation();
                    if (typeof goBack === 'function') goBack();
                    else if (typeof showScreen === 'function') showScreen('dashboard-screen');
                    return;
                }

                if (window.MizoIntro && window.MizoIntro.isDesktopApp()) {
                    window.MizoIntro.navigate('home', href);
                } else {
                    window.location.href = /^index\.html/i.test(href) ? href : 'index.html';
                }
            }, true);
        })();

        function handleUniversalBackButton(e, fromNative) {
            if (document.getElementById('almezo-inapp-update-overlay')) {
                var vData = window._almezoVersionData;
                if (vData && vData.isMandatory) {
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                    return true;
                }
                var btnLater = document.getElementById('inappBtnLater');
                if (btnLater && !btnLater.classList.contains('hidden') && btnLater.offsetParent !== null) {
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                    btnLater.click();
                    return true;
                }
            }

            if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                Swal.close();
                return true;
            }

            var videoModal = document.getElementById('fullscreenVideoModal');
            if (videoModal && !videoModal.classList.contains('hidden')) {
                if (typeof closeFullscreenPlayer === 'function') {
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                    closeFullscreenPlayer();
                    return true;
                }
            }

            var openModal = getOpenModal();
            if (openModal) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

                // 1. التعامل الهرمي مع نافذة إدارة الحساب وتغيير كلمة السر
                if (openModal.id === 'logoutModal') {
                    var changePassView = document.getElementById('accountChangePassView');
                    if (changePassView && window.getComputedStyle(changePassView).display !== 'none') {
                        if (typeof switchAccountView === 'function') {
                            switchAccountView('main');
                            focusInitialModalElement(openModal);
                            return true;
                        }
                    }
                    if (typeof closeLogoutModal === 'function') {
                        closeLogoutModal();
                        syncModalState();
                        return true;
                    }
                }

                // 2. حوارات التأكيد والتنبيه المنبثقة
                if (openModal.classList.contains('custom-confirm-overlay')) {
                    var btnCancel = openModal.querySelector('.btn-confirm-no');
                    if (btnCancel) { btnCancel.click(); return true; }
                }
                if (openModal.classList.contains('custom-alert-overlay')) {
                    var btnAlertOk = openModal.querySelector('.btn-alert-ok');
                    if (btnAlertOk) { btnAlertOk.click(); return true; }
                }
                if (openModal.classList.contains('custom-prompt-overlay')) {
                    var btnPromptCancel = openModal.querySelector('.btn-prompt-cancel');
                    if (btnPromptCancel) { btnPromptCancel.click(); return true; }
                }

                if (openModal.id === 'loginModal' && typeof closeLoginModal === 'function') {
                    closeLoginModal();
                    syncModalState();
                    return true;
                }
                if (openModal.id === 'checkoutModal' && typeof closeModal === 'function') {
                    closeModal();
                    syncModalState();
                    return true;
                }
                if (openModal.id === 'sortModal') {
                    openModal.classList.add('hidden');
                    syncModalState();
                    return true;
                }
                if (openModal.id === 'playlistsModal' && typeof closePlaylistsModal === 'function') {
                    closePlaylistsModal();
                    syncModalState();
                    return true;
                }
                if (openModal.id === 'deviceModeModal' && typeof closeDeviceModeModal === 'function') {
                    closeDeviceModeModal();
                    syncModalState();
                    return true;
                }
                if (openModal.id === 'trailerModal' && typeof closeTrailerModal === 'function') {
                    closeTrailerModal();
                    syncModalState();
                    return true;
                }
                var closeBtn = openModal.querySelector('.close-btn, .modal-close, button[onclick*="close"], .btn-sort-close, #btnClosePlayerExclusiveModal');
                if (closeBtn) {
                    closeBtn.click();
                    syncModalState();
                    return true;
                }
                openModal.style.display = 'none';
                openModal.classList.remove('active', 'show', 'visible');
                syncModalState();
                return true;
            }

            if (isAlMeZ0PlayerEnv()) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                var activeScreen = (typeof currentScreenId !== 'undefined') ? currentScreenId : sessionStorage.getItem('sp_current_screen');

                if (activeScreen === 'movie-details-screen' || activeScreen === 'series-details-screen' || activeScreen === 'vod-details-screen') {
                    if (typeof goBack === 'function') {
                        goBack();
                        return true;
                    } else if (typeof showScreen === 'function') {
                        showScreen('vod-screen');
                        return true;
                    }
                }

                if (activeScreen === 'vod-screen' || activeScreen === 'live-screen' || activeScreen === 'profile-screen' || activeScreen === 'series-screen') {
                    if (typeof showScreen === 'function') {
                        showScreen('dashboard-screen');
                        return true;
                    }
                }

                if (activeScreen === 'auth2-screen') {
                    if (typeof backToAuth1 === 'function') {
                        backToAuth1();
                        return true;
                    } else if (typeof showScreen === 'function') {
                        showScreen('auth1-screen');
                        return true;
                    }
                }

                if (activeScreen === 'dashboard-screen' || activeScreen === 'auth1-screen' || !activeScreen) {
                    if (window.AlMeZ0App) {
                        if (typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') window.AlMeZ0App.setImmersiveFullscreen(false);
                        if (typeof window.AlMeZ0App.lockPortrait === 'function') window.AlMeZ0App.lockPortrait();
                    }
                    goHomeWithIntro();
                    return true;
                }

                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    if (window.AlMeZ0App) {
                        if (typeof window.AlMeZ0App.setImmersiveFullscreen === 'function') window.AlMeZ0App.setImmersiveFullscreen(false);
                        if (typeof window.AlMeZ0App.lockPortrait === 'function') window.AlMeZ0App.lockPortrait();
                    }
                    goHomeWithIntro();
                }
                return true;
            }

            // مسار الصفحة الحالي. كان مستخدماً بلا تعريف منذ إعادة هيكلة الدالة، فيرمي
            // ReferenceError ويعيد __almezoBack القيمة 'legacy' بدل 'exit'، فلا يخرج التطبيق أبداً.
            var currentPath = (window.location.pathname || '').toLowerCase();

            var isHome = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/') || currentPath === '';

            if (!isHome) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    goHomeWithIntro();
                }
                return true;
            }

            if (fromNative) return 'exit';

            var now = Date.now();
            if (now - lastBackPress < 2000) {
                if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                    window.Capacitor.Plugins.App.exitApp();
                }
            } else {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
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
            return true;
        }

        // يستدعيه تطبيق أندرويد (MainActivity) عند كل ضغطة رجوع
        window.__almezoBack = function () {
            try {
                return handleUniversalBackButton(null, true) === 'exit' ? 'exit' : 'handled';
            } catch (err) {
                return 'legacy';
            }
        };

        // الاستماع المباشر لزر الريموت في كاباسيتور
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.addListener('backButton', function () {
                handleUniversalBackButton(null);
            });
        }

        // الاستماع المباشر لكافة أزرار الريموت ولوحة المفاتيح في المتصفح والـ WebView
        window.addEventListener('keydown', function (e) {
            // 1. زر الرجوع في الريموت
            if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 27 || e.keyCode === 4) {
                var handled = handleUniversalBackButton(e);
                if (handled) return;
            }

            // 2. تفعيل وضع الريموت
            var navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
            var navCodes = [37, 38, 39, 40];
            var isNavKey = navKeys.includes(e.key) || navCodes.includes(e.keyCode);

            if (isNavKey) {
                document.body.classList.add('tv-nav-active');
                document.documentElement.setAttribute('data-input-mode', 'remote');
            }

            var isPlayer = isAlMeZ0PlayerEnv();

            if (!isPlayer) {
                // 3. إذا كان هناك نافذة منبثقة مفتوحة (حصر الحركة بداخلها تماماً)
                var currentOpenModal = syncModalState();
                if (currentOpenModal) {
                    if (isNavKey) {
                        handleModalDpadNavigation(currentOpenModal, e);
                        return;
                    }
                } else if (isNavKey) {
                    // 4. في صفحات الموقع الرئيسية العادية
                    handleSitePageDpadNavigation(e);
                    return;
                }

                // 5. زر التأكيد (D-Pad Center / OK / Enter)
                if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66) {
                    var active = document.activeElement;
                    if (active && active !== document.body) {
                        var isFormInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
                        if (!isFormInput) {
                            e.preventDefault();
                            active.click();
                        }
                    }
                }
            }
        }, true);
        syncLocalizedManifest();
    });

    // =========================================================================
    // نظام فحص وتنبيه التحديثات الذكي داخل التطبيق (In-App Smart Updater)
    // =========================================================================
    // 4. رقم الإصدار الحالي للتطبيق
    const CURRENT_APP_VERSION = '1.2.3';
    const CURRENT_WINDOWS_VERSION = '1.0.88';

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

    // دالة جلب احتياطية متوافقة 100% مع أجهزة الأندرويد القديمة مثل TX9 Pro
    function fetchJsonFallback(url) {
        return new Promise(function (resolve) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 8000;
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                var parsed = JSON.parse(xhr.responseText);
                                resolve(parsed);
                            } catch (e) { resolve(null); }
                        } else {
                            resolve(null);
                        }
                    }
                };
                xhr.onerror = function () { resolve(null); };
                xhr.ontimeout = function () { resolve(null); };
                xhr.send();
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function checkInAppUpdate() {
        // يظهر صندوق التحديث فقط داخل تطبيقات الأجهزة المثبتة (أندرويد والكمبيوتر)، ولا يظهر في الموقع
        if (!isNative) {
            const existingBanner = document.getElementById('almezo-inapp-update-banner');
            if (existingBanner) existingBanner.remove();
            return;
        }

        try {
            let versionData = null;
            const isLocal = window.location.protocol === 'file:' ||
                window.location.protocol === 'capacitor:' ||
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';

            const endpoints = [
                'https://almezo.store/version.json?t=' + Date.now(),
                (!isLocal && window.location.origin ? window.location.origin + '/version.json?t=' + Date.now() : ''),
                'https://raw.githubusercontent.com/almezo/ALmEz0-Downloads/main/version.json?t=' + Date.now(),
                'version.json?t=' + Date.now()
            ].filter(Boolean);

            for (const url of endpoints) {
                try {
                    if (typeof fetch === 'function') {
                        const res = await fetch(url);
                        if (res && res.ok) {
                            const data = await res.json();
                            if (data && data.version) {
                                versionData = data;
                                break;
                            }
                        }
                    }
                } catch (e) { }

                // إذا فشل fetch في المتصفحات القديمة (مثل أندرويد 7 في أجهزة TV Box) نستخدم XHR
                if (!versionData) {
                    try {
                        const xhrData = await fetchJsonFallback(url);
                        if (xhrData && xhrData.version) {
                            versionData = xhrData;
                            break;
                        }
                    } catch (errXhr) { }
                }
            }

            if (!versionData || !versionData.version) return;

            let installedVersion = CURRENT_APP_VERSION;
            let latestVer = versionData.version;
            let minSupported = versionData.minSupportedVersion || '1.0.0';
            let updateTitle = versionData.title || '';
            let updateNotes = versionData.notes || '';

            // فصل تام بين نظام ويندوز (الكمبيوتر) ونظام أندرويد
            if (isElectron) {
                // نحن على برنامج الكمبيوتر (Windows):
                if (window.electronAPI && window.electronAPI.appVersion) {
                    installedVersion = window.electronAPI.appVersion;
                } else {
                    installedVersion = CURRENT_WINDOWS_VERSION;
                }

                // التحقق من قسم الويندوز المستقل في version.json
                if (versionData.windows && versionData.windows.version) {
                    latestVer = versionData.windows.version;
                    minSupported = versionData.windows.minSupportedVersion || '1.0.0';
                    if (versionData.windows.title) updateTitle = versionData.windows.title;
                    if (versionData.windows.notes) updateNotes = versionData.windows.notes;
                } else if (versionData.windowsVersion) {
                    latestVer = versionData.windowsVersion;
                    minSupported = versionData.windowsMinSupportedVersion || '1.0.0';
                } else {
                    // إذا لم يوجد قسم خاص بالويندوز، لا نطلب أي تحديث على الكمبيوتر نهائياً
                    return;
                }
            } else {
                // نحن على نظام أندرويد (أو الويب):
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && typeof window.Capacitor.Plugins.App.getInfo === 'function') {
                    try {
                        const appInfo = await window.Capacitor.Plugins.App.getInfo();
                        if (appInfo && appInfo.version) {
                            installedVersion = appInfo.version;
                        }
                    } catch (e) { }
                }

                if (versionData.android && versionData.android.version) {
                    latestVer = versionData.android.version;
                    minSupported = versionData.android.minSupportedVersion || versionData.minSupportedVersion || '1.0.0';
                    if (versionData.android.title) updateTitle = versionData.android.title;
                    if (versionData.android.notes) updateNotes = versionData.android.notes;
                }
            }

            if (compareVersions(latestVer, installedVersion) <= 0) {
                return; // التطبيق على أحدث إصدار
            }

            // التحقق مما إذا كان التحديث إلزامياً أو اختيارياً لتفادي إزعاج العملاء
            const isMandatory = !!(
                (minSupported && compareVersions(minSupported, installedVersion) > 0) ||
                versionData.mandatory === true
            );

            // إذا كان التحديث غير إلزامي واختار المستخدم تأجيله في هذه الجلسة، لا نزعجه مجدداً
            if (!isMandatory) {
                try {
                    const dismissed = sessionStorage.getItem('almezo_dismissed_update_' + latestVer);
                    if (dismissed) return;
                } catch (e) { }
            }

            // إعداد كائن البيانات الممرر للنافذة المنبثقة
            const activeVersionInfo = Object.assign({}, versionData, {
                version: latestVer,
                title: updateTitle || versionData.title,
                notes: updateNotes || versionData.notes
            });

            // عرض نافذة التحديث في منتصف الشاشة
            showInAppUpdateBanner(activeVersionInfo, isMandatory);
        } catch (err) {
            console.warn('In-app update check failed:', err);
        }
    }

    // فحص دوري للتحديثات كل 30 دقيقة وأثناء العودة للتطبيق
    setInterval(checkInAppUpdate, 30 * 60 * 1000);
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        try {
            window.Capacitor.Plugins.App.addListener('appStateChange', (state) => {
                if (state && state.isActive) {
                    checkInAppUpdate();
                }
            });
        } catch (e) { }
    }

    function showInAppUpdateBanner(info, mandatoryFlag = false) {
        if (document.getElementById('almezo-inapp-update-overlay')) return;

        const isMandatory = !!mandatoryFlag;
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        const isUserAndroid = isAndroid || /android/i.test(ua);
        const downloadUrl = (isUserAndroid)
            ? ((info.downloadUrls && info.downloadUrls.android) ? info.downloadUrls.android : 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.apk')
            : ((info.downloadUrls && info.downloadUrls.windows) ? info.downloadUrls.windows : 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.exe');

        const overlay = document.createElement('div');
        overlay.id = 'almezo-inapp-update-overlay';
        overlay.className = 'inapp-update-overlay';
        overlay.setAttribute('dir', 'rtl');

        const badgeHtml = isMandatory
            ? `<span class="inapp-center-badge"><i class="fas fa-shield-alt"></i> تحديث إلزامي v${info.version}</span>`
            : `<span class="inapp-center-badge" style="background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.4); color: #4ade80;"><i class="fas fa-sparkles"></i> تحديث جديد متاح v${info.version}</span>`;

        const titleText = isMandatory
            ? 'يتوفر إصدار جديد ومطلوب للبرنامج'
            : 'يتوفر إصدار جديد للبرنامج';

        const descText = isMandatory
            ? `يجب تثبيت الإصدار الجديد <strong>v${info.version}</strong> للمتابعة، لضمان استقرار المشغل وتحديث السيرفرات وجودة البث.`
            : `يتوفر الإصدار الجديد <strong>v${info.version}</strong> متضمناً تحسينات وميزات جديدة. يمكنك التحديث الآن أو الاستمرار في الاستخدام والتحديث لاحقاً.`;

        const closeBtnHtml = !isMandatory
            ? `<button type="button" class="inapp-close-btn" id="inappBtnClose" title="إغلاق والتحديث لاحقاً" style="position: absolute; top: 16px; left: 16px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #94a3b8; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;"><i class="fas fa-times"></i></button>`
            : '';

        const laterBtnHtml = !isMandatory
            ? `<button type="button" class="inapp-btn-later" id="inappBtnLater" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 12px; padding: 12px 20px; font-weight: 700; font-family: inherit; font-size: 0.92rem; cursor: pointer; transition: all 0.2s; margin-top: 10px; width: 100%;"><i class="fas fa-clock"></i> المتابعة والتحديث لاحقاً</button>`
            : '';

        overlay.innerHTML = `
            <div class="inapp-center-card" style="position: relative;">
                ${closeBtnHtml}
                <div class="inapp-center-icon-glow">
                    <div class="inapp-pulse-ring"></div>
                    <i class="fas fa-arrow-circle-down inapp-main-icon"></i>
                </div>
                <div class="inapp-center-header">
                    ${badgeHtml}
                    <h2 class="inapp-center-title">${titleText}</h2>
                    <p class="inapp-center-desc">${descText}</p>
                </div>
                <div class="inapp-center-action-area">
                    <button type="button" class="inapp-btn-start-update" id="inappBtnStartUpdate">
                        <i class="fas fa-download"></i> تنزيل وتثبيت التحديث الآن
                    </button>
                    ${laterBtnHtml}

                    <div class="inapp-progress-box hidden" id="inappProgressBox">
                        <div class="inapp-progress-top">
                            <span class="inapp-progress-status" id="inappProgressStatus">
                                <i class="fas fa-spinner fa-spin"></i> جاري تنزيل التحديث داخلياً...
                            </span>
                            <span class="inapp-progress-pct" id="inappProgressPct">0%</span>
                        </div>
                        <div class="inapp-progress-track">
                            <div class="inapp-progress-fill" id="inappProgressFill" style="width: 0%;"></div>
                        </div>
                        <div class="inapp-progress-sub">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span id="inappProgressBytes">جاري الاتصال بالسيرفر...</span>
                                <span id="inappProgressSpeed" class="inapp-speed-tag hidden"><i class="fas fa-arrow-down"></i> 0.0 MB/s</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button type="button" class="inapp-btn-pause-resume" id="inappBtnPauseResume" title="إيقاف مؤقت / استئناف">
                                    <i class="fas fa-pause"></i> إيقاف مؤقت
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="inapp-error-box hidden" id="inappErrorBox">
                        <p class="inapp-error-msg"><i class="fas fa-exclamation-triangle"></i> تعذر إكمال التنزيل التلقائي، يرجى التأكد من اتصال الإنترنت.</p>
                        <div class="inapp-error-btns">
                            <button type="button" class="inapp-btn-retry" id="inappBtnRetry"><i class="fas fa-redo-alt"></i> إعادة المحاولة</button>
                            <button type="button" class="inapp-btn-external-dl" id="inappBtnExternalDl"><i class="fas fa-external-link-alt"></i> تنزيل عبر المتصفح</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        injectInAppUpdateStyles();

        const btnLater = overlay.querySelector('#inappBtnLater');
        const btnClose = overlay.querySelector('#inappBtnClose');
        const dismissUpdate = () => {
            try { sessionStorage.setItem('almezo_dismissed_update_' + info.version, '1'); } catch (e) { }
            overlay.remove();
        };

        if (btnLater) btnLater.addEventListener('click', dismissUpdate);
        if (btnClose) btnClose.addEventListener('click', dismissUpdate);

        if (isMandatory) {
            // منع أي ضغطات مفاتيح لإغلاق الصندوق في التحديث الإلزامي (Escape, Backspace, etc.)
            const blockKeys = (e) => {
                if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            window.addEventListener('keydown', blockKeys, true);
        } else {
            // في التحديث الاختياري: زر Escape يغلق النافذة بسلاسة
            const onEsc = (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    dismissUpdate();
                    window.removeEventListener('keydown', onEsc, true);
                }
            };
            window.addEventListener('keydown', onEsc, true);
        }

        const btnStart = overlay.querySelector('#inappBtnStartUpdate');
        const progressBox = overlay.querySelector('#inappProgressBox');
        const progressStatus = overlay.querySelector('#inappProgressStatus');
        const progressPct = overlay.querySelector('#inappProgressPct');
        const progressFill = overlay.querySelector('#inappProgressFill');
        const progressBytes = overlay.querySelector('#inappProgressBytes');
        const progressSpeed = overlay.querySelector('#inappProgressSpeed');

        // إصلاح ترتيب النص: النص "5.0 MB / 123.5 MB" كان يُبنى صحيحاً في الكود لكنه يُعرض
        // مقلوباً ("MB / 123.5 MB 5.0") لأن العنصر داخل حاوية عربية (RTL)، فتقوم خوارزمية
        // الاتجاه ثنائي الاتجاه (bidi) بإعادة ترتيب الأرقام والحروف اللاتينية.
        // الحل: فرض اتجاه LTR وعزل النص على عناصر الأرقام فقط.
        [progressBytes, progressSpeed, progressPct].forEach((el) => {
            if (!el) return;
            try {
                el.setAttribute('dir', 'ltr');
                el.style.direction = 'ltr';
                el.style.unicodeBidi = 'isolate';
                el.style.textAlign = 'center';
            } catch (e) { }
        });
        const btnPauseResume = overlay.querySelector('#inappBtnPauseResume');
        const errorBox = overlay.querySelector('#inappErrorBox');
        const btnRetry = overlay.querySelector('#inappBtnRetry');
        const btnExternalDl = overlay.querySelector('#inappBtnExternalDl');

        // التركيز التلقائي على زر التحديث ودعم ريموت الشاشات والـ TV Box
        if (btnStart) {
            btnStart.tabIndex = 0;
            btnStart.classList.add('tv-focused');
            setTimeout(function () {
                try { btnStart.focus(); } catch (e) { }
            }, 100);
        }
        if (btnLater) btnLater.tabIndex = 0;

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.keyCode === 40) {
                if (document.activeElement === btnStart && btnLater) {
                    e.preventDefault();
                    btnStart.classList.remove('tv-focused');
                    btnLater.classList.add('tv-focused');
                    btnLater.focus();
                }
            } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                if (document.activeElement === btnLater && btnStart) {
                    e.preventDefault();
                    btnLater.classList.remove('tv-focused');
                    btnStart.classList.add('tv-focused');
                    btnStart.focus();
                }
            } else if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66) {
                var act = document.activeElement;
                if (act && (act === btnStart || act === btnLater || act === btnClose || act === btnRetry || act === btnExternalDl)) {
                    e.preventDefault();
                    act.click();
                }
            }
        });

        let isDownloadPaused = false;
        let lastDownloadedBytes = 0;
        let lastSpeedTime = Date.now();
        let currentSpeedStr = '0.0 MB/s';

        // حراسة تصاعدية لعداد التحميل: تقارير التقدم قد تصل من الطبقة الأصلية بترتيب غير مضمون
        // أو بعد إعادة اتصال/تحويل (redirect) فيعود الرقم للخلف (مثلاً 72% ثم 63%).
        // الواجهة الآن لا تعرض أبداً قيمة أقل مما عُرض فعلاً، ولا تتراجع النسبة إطلاقاً.
        let maxShownPct = 0;
        let maxShownBytes = 0;
        let isDownloadRunning = false;

        function resetProgressGuards() {
            maxShownPct = 0;
            maxShownBytes = 0;
            lastDownloadedBytes = 0;
            lastSpeedTime = Date.now();
            currentSpeedStr = '0.0 MB/s';
        }

        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '0.0 MB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function setProgress(pct, downloaded, total) {
            let clamped = Math.max(0, Math.min(100, Math.round(pct)));

            // لا نسمح أبداً بتراجع النسبة أو حجم المُنزَّل للخلف
            if (clamped < maxShownPct) {
                clamped = maxShownPct;
            } else {
                maxShownPct = clamped;
            }

            if (typeof downloaded === 'number' && downloaded > 0) {
                if (downloaded < maxShownBytes) {
                    downloaded = maxShownBytes;
                } else {
                    maxShownBytes = downloaded;
                }
            }

            progressFill.style.width = clamped + '%';
            progressPct.innerText = clamped + '%';

            // Calculate download speed
            const now = Date.now();
            const timeDiff = (now - lastSpeedTime) / 1000;
            if (timeDiff >= 0.35 && downloaded > lastDownloadedBytes) {
                const bytesDiff = downloaded - lastDownloadedBytes;
                const bytesPerSec = bytesDiff / timeDiff;
                if (bytesPerSec >= 1024 * 1024) {
                    currentSpeedStr = (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
                } else {
                    currentSpeedStr = (bytesPerSec / 1024).toFixed(0) + ' KB/s';
                }
                lastSpeedTime = now;
                lastDownloadedBytes = downloaded;
                if (progressSpeed) {
                    progressSpeed.innerHTML = `<i class="fas fa-arrow-down"></i> ${currentSpeedStr}`;
                    progressSpeed.classList.remove('hidden');
                }
            }

            if (downloaded && total && total > 0) {
                progressBytes.innerText = `${formatBytes(downloaded)} / ${formatBytes(total)}`;
            } else if (downloaded) {
                progressBytes.innerText = formatBytes(downloaded);
            }
        }

        if (btnPauseResume) {
            btnPauseResume.addEventListener('click', () => {
                if (!isDownloadPaused) {
                    isDownloadPaused = true;
                    btnPauseResume.innerHTML = '<i class="fas fa-play"></i> استئناف';
                    btnPauseResume.style.background = 'rgba(34, 197, 94, 0.25)';
                    btnPauseResume.style.borderColor = '#22c55e';
                    btnPauseResume.style.color = '#4ade80';
                    progressStatus.innerHTML = '<i class="fas fa-pause-circle" style="color:#fbbf24;"></i> التنزيل متوقف مؤقتاً';
                    if (progressSpeed) progressSpeed.innerHTML = '<i class="fas fa-pause"></i> متوقف';

                    if (isElectron && window.electronAPI && typeof window.electronAPI.pauseUpdateDownload === 'function') {
                        window.electronAPI.pauseUpdateDownload();
                    } else if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.pauseUpdateDownload === 'function') {
                        window.AndroidNativeBridge.pauseUpdateDownload();
                    }
                } else {
                    isDownloadPaused = false;
                    btnPauseResume.innerHTML = '<i class="fas fa-pause"></i> إيقاف مؤقت';
                    btnPauseResume.style.background = 'rgba(255, 255, 255, 0.08)';
                    btnPauseResume.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    btnPauseResume.style.color = '#ffffff';
                    progressStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تنزيل التحديث داخلياً...';
                    lastSpeedTime = Date.now();

                    if (isElectron && window.electronAPI && typeof window.electronAPI.resumeUpdateDownload === 'function') {
                        window.electronAPI.resumeUpdateDownload(downloadUrl);
                    } else if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.resumeUpdateDownload === 'function') {
                        window.AndroidNativeBridge.resumeUpdateDownload();
                    }
                }
            });
        }

        function startDownload() {
            // منع بدء تنزيلين متوازيين على نفس الملف (كل واحد بعدّاده الخاص)،
            // وهو سبب معروف لظهور تراجع مفاجئ في النسبة أثناء التحميل
            if (isDownloadRunning) return;
            isDownloadRunning = true;

            resetProgressGuards();
            btnStart.classList.add('hidden');
            errorBox.classList.add('hidden');
            progressBox.classList.remove('hidden');
            setProgress(0, 0, 0);
            progressStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تنزيل التحديث داخلياً...';

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'app_inapp_update',
                    category: 'visitor',
                    severity: 'info',
                    title: `بدء تحديث التطبيق الداخلي إلى v${info.version}`,
                    details: { currentVersion: CURRENT_APP_VERSION, targetVersion: info.version }
                });
            }

            // 1. برمجيات الكمبيوتر (Windows Electron)
            if (isElectron && window.electronAPI && typeof window.electronAPI.startUpdateDownload === 'function') {
                window.electronAPI.onUpdateProgress((data) => {
                    const pct = data.percent !== undefined && data.percent >= 0 ? data.percent : 0;
                    setProgress(pct, data.downloadedBytes, data.totalBytes);
                });

                window.electronAPI.onUpdateComplete(() => {
                    setProgress(100);
                    progressStatus.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;"></i> تم اكتمال التنزيل! جاري التثبيت التلقائي...';
                });

                window.electronAPI.onUpdateError(() => {
                    isDownloadRunning = false;
                    progressBox.classList.add('hidden');
                    errorBox.classList.remove('hidden');
                });

                window.electronAPI.startUpdateDownload(downloadUrl);
                return;
            }

            // 2. تطبيقات الأندرويد (Android Native Bridge)
            if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.downloadAndInstallApk === 'function') {
                window.onAndroidUpdateProgress = (data) => {
                    const pct = data.percent !== undefined && data.percent >= 0 ? data.percent : 0;
                    setProgress(pct, data.downloadedBytes, data.totalBytes);
                };

                window.onAndroidUpdateComplete = () => {
                    setProgress(100);
                    progressStatus.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;"></i> تم التنزيل! جاري فتح شاشة التثبيت...';
                };

                window.onAndroidUpdateError = () => {
                    isDownloadRunning = false;
                    progressBox.classList.add('hidden');
                    errorBox.classList.remove('hidden');
                };

                window.AndroidNativeBridge.downloadAndInstallApk(downloadUrl);
                return;
            }

            // 3. مسار احتياطي عبر المتصفح إذا لم تتوفر البيئة الأصلية
            if (window.AlMeZ0App && typeof window.AlMeZ0App.openExternal === 'function') {
                window.AlMeZ0App.openExternal(downloadUrl);
            } else {
                window.location.href = downloadUrl;
            }
        }

        btnStart.addEventListener('click', startDownload);
        btnRetry.addEventListener('click', startDownload);
        btnExternalDl.addEventListener('click', () => {
            if (window.AlMeZ0App && typeof window.AlMeZ0App.openExternal === 'function') {
                window.AlMeZ0App.openExternal(downloadUrl);
            } else {
                window.location.href = downloadUrl;
            }
        });
    }

    function injectInAppUpdateStyles() {
        if (document.getElementById('inapp-update-styles')) return;
        const style = document.createElement('style');
        style.id = 'inapp-update-styles';
        style.textContent = `
            .inapp-update-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(3, 7, 10, 0.88);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                z-index: 999999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                font-family: 'Cairo', 'Tajawal', sans-serif;
                animation: inappOverlayFadeIn 0.35s ease forwards;
            }
            @keyframes inappOverlayFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .inapp-center-card {
                background: linear-gradient(145deg, rgba(17, 24, 30, 0.98), rgba(9, 13, 17, 0.99));
                border: 1.5px solid rgba(34, 197, 94, 0.5);
                border-radius: 26px;
                padding: 34px 28px;
                max-width: 520px;
                width: 100%;
                text-align: center;
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.95), 0 0 35px rgba(34, 197, 94, 0.25);
                animation: inappCardScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                direction: rtl;
                position: relative;
                box-sizing: border-box;
            }
            @keyframes inappCardScaleIn {
                from { opacity: 0; transform: scale(0.88); }
                to { opacity: 1; transform: scale(1); }
            }
            .inapp-center-icon-glow {
                width: 72px;
                height: 72px;
                margin: 0 auto 16px auto;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                border-radius: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: 34px;
                box-shadow: 0 0 28px rgba(34, 197, 94, 0.6);
                position: relative;
            }
            .inapp-pulse-ring {
                position: absolute;
                inset: -6px;
                border: 2px solid rgba(34, 197, 94, 0.4);
                border-radius: 26px;
                animation: inappPulse 2s infinite ease-in-out;
            }
            @keyframes inappPulse {
                0% { transform: scale(0.95); opacity: 0.8; }
                50% { transform: scale(1.1); opacity: 0.2; }
                100% { transform: scale(0.95); opacity: 0.8; }
            }
            .inapp-center-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                font-weight: 800;
                background: rgba(34, 197, 94, 0.18);
                color: #4ade80;
                border: 1px solid rgba(34, 197, 94, 0.45);
                padding: 4px 14px;
                border-radius: 20px;
                margin-bottom: 12px;
            }
            .inapp-center-title {
                color: #ffffff;
                font-size: 21px;
                font-weight: 800;
                margin: 0 0 10px 0;
            }
            .inapp-center-desc {
                color: #cbd5e1;
                font-size: 14.5px;
                line-height: 1.6;
                margin: 0 0 18px 0;
            }
            .inapp-center-notes {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px;
                padding: 12px 16px;
                text-align: right;
                margin-bottom: 22px;
            }
            .inapp-notes-title {
                color: #f59e0b;
                font-size: 12.5px;
                font-weight: 700;
                margin-bottom: 6px;
            }
            .inapp-notes-text {
                color: #e2e8f0;
                font-size: 13px;
                margin: 0;
                line-height: 1.5;
            }
            .inapp-btn-start-update {
                width: 100%;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                color: #ffffff;
                border: none;
                border-radius: 14px;
                padding: 14px 20px;
                font-size: 16px;
                font-weight: 800;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                box-shadow: 0 6px 22px rgba(34, 197, 94, 0.4);
            }
            .inapp-btn-start-update:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 26px rgba(34, 197, 94, 0.6);
                filter: brightness(1.08);
            }
            .inapp-progress-box {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 16px;
                padding: 16px;
                text-align: right;
            }
            .inapp-progress-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .inapp-progress-status {
                color: #ffffff;
                font-size: 13.5px;
                font-weight: 700;
            }
            .inapp-progress-pct {
                color: #4ade80;
                font-size: 15px;
                font-weight: 800;
            }
            .inapp-progress-track {
                width: 100%;
                height: 12px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                overflow: hidden;
                position: relative;
            }
            .inapp-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #16a34a, #4ade80);
                border-radius: 10px;
                transition: width 0.25s ease;
                box-shadow: 0 0 12px rgba(74, 222, 128, 0.6);
            }
            .inapp-progress-sub {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 10px;
                font-size: 12px;
                color: #94a3b8;
            }
            .inapp-fast-tag {
                color: #f59e0b;
                font-weight: 700;
            }
            .inapp-speed-tag {
                background: rgba(34, 197, 94, 0.15);
                border: 1px solid rgba(34, 197, 94, 0.4);
                color: #4ade80;
                padding: 2px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 800;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .inapp-btn-pause-resume {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #ffffff;
                border-radius: 8px;
                padding: 4px 10px;
                font-size: 11.5px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            .inapp-btn-pause-resume:hover {
                background: rgba(255, 255, 255, 0.18);
                transform: scale(1.03);
            }
            .inapp-error-box {
                background: rgba(239, 68, 68, 0.12);
                border: 1px solid rgba(239, 68, 68, 0.35);
                border-radius: 14px;
                padding: 14px;
                text-align: center;
            }
            .inapp-error-msg {
                color: #fca5a5;
                font-size: 13.5px;
                margin: 0 0 12px 0;
            }
            .inapp-error-btns {
                display: flex;
                gap: 10px;
                justify-content: center;
            }
            .inapp-btn-retry {
                background: #ef4444;
                color: #fff;
                border: none;
                border-radius: 10px;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
            }
            .inapp-btn-external-dl {
                background: #334155;
                color: #fff;
                border: none;
                border-radius: 10px;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
            }
            .hidden { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // =========================================================
    // BROADCAST NOTIFICATION CLIENT LISTENER & IN-APP PUSH
    // =========================================================
    function playNotificationChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.45);
        } catch (e) { }
    }

    function showBroadcastPushBanner(notif) {
        if (!notif || !notif.title) return;

        function safeEsc(s) {
            if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
            return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }

        // Play chime and trigger vibration
        playNotificationChime();
        if (navigator.vibrate) {
            try { navigator.vibrate([120, 60, 120]); } catch (e) { }
        }

        // 1. Android Native System Tray Notification (Hardware StatusBar)
        try {
            // بالمعرّف: التطبيق الأصلي يجلب الإشعارات بنفسه أيضاً، فيمنع ظهور الإشعار مرتين
            if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.showBroadcastNotification === 'function' && notif.id) {
                window.AndroidNativeBridge.showBroadcastNotification(String(notif.id), String(notif.timestamp || 0), notif.title || '', notif.message || '', notif.actionUrl || '');
            } else if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.showNotification === 'function') {
                window.AndroidNativeBridge.showNotification(notif.title, notif.message, notif.actionUrl || '');
            }
        } catch (e) { }

        // 2. Windows PC Native System Notification (Action Center)
        try {
            if (window.electronAPI && typeof window.electronAPI.showNotification === 'function') {
                window.electronAPI.showNotification(notif.title, notif.message);
            }
        } catch (e) { }

        // 3. Web Notification API (Browser)
        try {
            if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                    const n = new Notification(notif.title, {
                        body: notif.message,
                        icon: 'photo/logo.ico',
                        badge: 'photo/logo.ico',
                        tag: notif.id || 'almezo_notif'
                    });
                    if (notif.actionUrl) {
                        n.onclick = () => {
                            window.focus();
                            window.location.href = notif.actionUrl;
                        };
                    }
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(perm => {
                        if (perm === 'granted') {
                            new Notification(notif.title, {
                                body: notif.message,
                                icon: 'photo/logo.ico',
                                badge: 'photo/logo.ico'
                            });
                        }
                    });
                }
            }
        } catch (e) { }

        // 4. In-App Floating Luxury Banner
        const existing = document.getElementById('almezo-broadcast-banner');
        if (existing) existing.remove();

        const typeBadges = {
            'update': { label: '🚀 تحديث جديد', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' },
            'promo': { label: '🔥 عرض خاص', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.4)' },
            'product': { label: '✨ منتج جديد', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.4)' },
            'general': { label: '📢 إشعار عام', color: '#4ade80', glow: 'rgba(74, 222, 128, 0.4)' }
        };

        const config = typeBadges[notif.type] || typeBadges['general'];

        const banner = document.createElement('div');
        banner.id = 'almezo-broadcast-banner';
        banner.className = 'almezo-push-banner';
        banner.setAttribute('dir', 'rtl');

        banner.innerHTML = `
            <div class="push-banner-inner" style="border-top: 3px solid ${config.color}; box-shadow: 0 16px 36px rgba(0,0,0,0.6), 0 0 24px ${config.glow};">
                <div class="push-banner-header">
                    <div class="push-app-id">
                        <img src="photo/logo.ico" alt="ALmEz0" class="push-icon" onerror="this.src='photo/logo.png'">
                        <span class="push-app-title">سيرفرات الميزو • ALmEz0</span>
                    </div>
                    <div class="push-meta">
                        <span class="push-badge" style="color: ${config.color}; border-color: ${config.color}; background: rgba(255,255,255,0.06);">${config.label}</span>
                        <button type="button" class="push-close-btn" id="btnClosePushBanner" title="إغلاق">&times;</button>
                    </div>
                </div>
                <div class="push-banner-content">
                    <h4 class="push-notif-title">${safeEsc(notif.title)}</h4>
                    <p class="push-notif-body">${safeEsc(notif.message)}</p>
                </div>
                ${notif.actionUrl ? `
                <div class="push-banner-actions">
                    <a href="${safeEsc(notif.actionUrl)}" class="push-action-btn" id="btnPushAction">
                        <i class="fas fa-external-link-alt"></i> فتح الرابط / التفاصيل
                    </a>
                </div>
                ` : ''}
            </div>
        `;

        // Inject banner CSS if not exists
        if (!document.getElementById('almezo-push-banner-style')) {
            const style = document.createElement('style');
            style.id = 'almezo-push-banner-style';
            style.textContent = `
                .almezo-push-banner {
                    position: fixed;
                    top: 18px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-120%);
                    z-index: 99999999;
                    width: calc(100% - 32px);
                    max-width: 520px;
                    transition: transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
                }
                .almezo-push-banner.visible {
                    transform: translateX(-50%) translateY(0);
                }
                .push-banner-inner {
                    background: linear-gradient(135deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.98));
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1.5px solid rgba(255, 255, 255, 0.14);
                    border-radius: 16px;
                    padding: 14px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    box-sizing: border-box;
                }
                .push-banner-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .push-app-id {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .push-icon {
                    width: 22px;
                    height: 22px;
                    border-radius: 5px;
                }
                .push-app-title {
                    font-size: 12px;
                    font-weight: 700;
                    color: #94a3b8;
                }
                .push-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .push-badge {
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 8px;
                    border-radius: 12px;
                    border: 1px solid;
                }
                .push-close-btn {
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 20px;
                    line-height: 1;
                    cursor: pointer;
                    padding: 0 4px;
                    transition: color 0.2s;
                }
                .push-close-btn:hover {
                    color: #fff;
                }
                .push-notif-title {
                    color: #fff;
                    font-size: 14.5px;
                    font-weight: 800;
                    margin: 0 0 4px 0;
                    line-height: 1.3;
                }
                .push-notif-body {
                    color: #cbd5e1;
                    font-size: 13px;
                    margin: 0;
                    line-height: 1.45;
                }
                .push-banner-actions {
                    margin-top: 4px;
                }
                .push-action-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    text-decoration: none;
                    border-radius: 10px;
                    padding: 6px 14px;
                    font-size: 12.5px;
                    font-weight: 700;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    transition: all 0.2s;
                }
                .push-action-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateY(-1px);
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });

        const dismissBtn = banner.querySelector('#btnClosePushBanner');
        if (dismissBtn) {
            dismissBtn.onclick = () => {
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 450);
            };
        }

        // Auto dismiss after 15 seconds
        setTimeout(() => {
            if (banner.parentElement) {
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 450);
            }
        }, 15000);
    }

    function initBroadcastNotificationListener() {
        if (window._almezoBroadcastListenerActive) return;
        let attempts = 0;
        const maxAttempts = 30;

        function getFirestore() {
            try {
                if (window.db) return window.db;
                if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.firestore === 'function') {
                    return firebase.firestore();
                }
            } catch (e) { }
            return null;
        }

        const timer = setInterval(() => {
            attempts++;
            const firestore = getFirestore();

            if (firestore) {
                clearInterval(timer);
                window._almezoBroadcastListenerActive = true;
                try {
                    firestore.collection('broadcast_notifications')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .onSnapshot(snapshot => {
                            if (!snapshot || snapshot.empty) return;

                            const doc = snapshot.docs[0];
                            const data = doc.data();
                            data.id = doc.id;

                            const lastId = localStorage.getItem('almezo_last_broadcast_id');
                            const lastTs = parseInt(localStorage.getItem('almezo_last_broadcast_ts') || '0', 10);
                            const notifTs = parseInt(data.timestamp || '0', 10);
                            const now = Date.now();
                            const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

                            // Show if new notification ID or newer timestamp within 48h
                            if (doc.id !== lastId && notifTs > lastTs && (now - notifTs < FORTY_EIGHT_HOURS)) {
                                localStorage.setItem('almezo_last_broadcast_id', doc.id);
                                localStorage.setItem('almezo_last_broadcast_ts', String(notifTs));
                                showBroadcastPushBanner(data);
                            }
                        }, err => {
                            console.warn('[BroadcastNotif] Listener error:', err);
                        });
                } catch (e) {
                    console.warn('[BroadcastNotif] Setup failed:', e);
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }, 600);
    }

    // تنظيف أي إعدادات أو أنماط متبقية من استوديو التعديل القديم
    try {
        localStorage.removeItem('almezo_remote_ui_config');
        const oldStyle = document.getElementById('almezo-remote-ui-styles');
        if (oldStyle) oldStyle.remove();
        const oldTicker = document.getElementById('almezoRemoteTicker');
        if (oldTicker) oldTicker.remove();
    } catch (e) { }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initBroadcastNotificationListener();
            setTimeout(checkInAppUpdate, 1500);
        });
    } else {
        initBroadcastNotificationListener();
        setTimeout(checkInAppUpdate, 1500);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkInAppUpdate();
        }
    });

    window.AlMeZ0App.checkUpdate = checkInAppUpdate;
    window.AlMeZ0App.showInAppUpdateBanner = showInAppUpdateBanner;
    window.AlMeZ0App.showBroadcastPushBanner = showBroadcastPushBanner;
    window.AlMeZ0App.screen = window.AlMeZ0Screen || null;
})();

