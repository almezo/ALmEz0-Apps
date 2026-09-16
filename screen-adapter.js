/**
 * AlMeZ0 Smart Screen Intelligence & Universal Adaptive Engine
 * محرك ذكاء الشاشات والتكيف التلقائي الشامل لجميع الأجهزة والمنصات
 * Supports: Web Browsers, Android (Phones, Tablets, Foldables, Android TV, TV Box), Windows (Electron).
 */
(function (global) {
    'use strict';

    if (global.AlMeZ0Screen) {
        return; // Prevent double initialization
    }

    const listeners = new Set();
    let isInitialized = false;
    let cachedMetrics = null;
    let resizeTimer = null;
    let hudElement = null;
    let isHudVisible = false;

    // Helper: Safe area inset detection element
    let safeAreaProbe = null;

    function getSafeAreaInsets() {
        if (!document.body) {
            return { top: 0, bottom: 0, left: 0, right: 0 };
        }

        if (!safeAreaProbe) {
            safeAreaProbe = document.createElement('div');
            safeAreaProbe.id = 'almezo-safe-area-probe';
            safeAreaProbe.style.cssText = [
                'position: fixed',
                'top: 0',
                'left: 0',
                'width: 0',
                'height: 0',
                'visibility: hidden',
                'pointer-events: none',
                'z-index: -9999',
                'padding-top: env(safe-area-inset-top, 0px)',
                'padding-bottom: env(safe-area-inset-bottom, 0px)',
                'padding-left: env(safe-area-inset-left, 0px)',
                'padding-right: env(safe-area-inset-right, 0px)'
            ].join(';');
            document.body.appendChild(safeAreaProbe);
        }

        try {
            const cs = window.getComputedStyle(safeAreaProbe);
            return {
                top: parseFloat(cs.paddingTop) || 0,
                bottom: parseFloat(cs.paddingBottom) || 0,
                left: parseFloat(cs.paddingLeft) || 0,
                right: parseFloat(cs.paddingRight) || 0
            };
        } catch (e) {
            return { top: 0, bottom: 0, left: 0, right: 0 };
        }
    }

    function detectPlatform() {
        if (global.electronAPI && global.electronAPI.isElectron) return 'electron';
        if (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform()) {
            return global.Capacitor.getPlatform() || 'capacitor';
        }
        if (global.AndroidNativeBridge) return 'android';
        const ua = (navigator.userAgent || '').toLowerCase();
        if (/iphone|ipad|ipod/.test(ua)) return 'ios';
        if (/android/.test(ua)) return 'android';
        if (/windows/.test(ua)) return 'windows';
        if (/macintosh|mac os x/.test(ua)) return 'mac';
        return 'web';
    }

    function detectIsTV() {
        const ua = (navigator.userAgent || '').toLowerCase();
        // TV user agent signatures
        const tvRegex = /smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv|tizen|webos|viera|bravia|boxee|roku|aft|firetv|mibox|shield android tv|dtv|crkey|large screen/i;
        if (tvRegex.test(ua)) return true;

        // Pointer none/coarse on large resolution with no touch points (typical for TV boxes / Smart TVs)
        const isBigScreen = (window.screen && window.screen.width >= 1920 && window.screen.height >= 1080);
        const hasNoTouch = navigator.maxTouchPoints === 0;
        const hasNoHover = window.matchMedia && window.matchMedia('(hover: none) and (pointer: none)').matches;
        if (isBigScreen && hasNoTouch && hasNoHover) return true;

        return false;
    }

    function detectInputMode(isTV) {
        if (isTV) return 'remote';
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const hasMouse = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
        if (hasTouch && !hasMouse) return 'touch';
        if (hasTouch && hasMouse) return 'hybrid';
        return 'mouse';
    }

    function computeDeviceTier(width) {
        if (width < 340) return 'watch';
        if (width < 380) return 'compact-phone';
        if (width < 600) return 'regular-phone';
        if (width < 768) return 'phablet-fold';
        if (width < 992) return 'tablet-portrait';
        if (width < 1200) return 'tablet-landscape';
        if (width < 1440) return 'laptop';
        if (width <= 1920) return 'desktop-fhd';
        if (width <= 2560) return 'desktop-2k';
        return 'tv-4k';
    }

    function computeAspectCategory(ratio) {
        if (ratio >= 2.1) return 'ultrawide';
        if (ratio >= 1.6) return 'widescreen';
        if (ratio >= 1.25) return 'standard';
        if (ratio >= 0.75) return 'square-fold';
        return 'tall';
    }

    function computeDprTier(dpr) {
        if (dpr < 1.2) return '1x';
        if (dpr < 1.7) return '1.5x';
        if (dpr < 2.5) return '2x';
        if (dpr < 3.5) return '3x';
        return '4x';
    }

    function computeScaleFactor(width, height, isTV, tier) {
        if (isTV || tier === 'tv-4k') {
            // Generous scale factor for TV viewing distance (10ft away)
            return width >= 3840 ? 1.35 : 1.25;
        }
        if (tier === 'desktop-2k') return 1.12;
        if (tier === 'desktop-fhd') return 1.0;
        if (tier === 'laptop') return 0.98;
        if (tier === 'tablet-landscape' || tier === 'tablet-portrait') return 1.0;
        if (tier === 'phablet-fold') return 0.96;
        if (tier === 'regular-phone') return 1.0;
        if (tier === 'compact-phone') return 0.92;
        if (tier === 'watch') return 0.82;
        return 1.0;
    }

    function computeOptimalGridCols(tier, orientation) {
        if (orientation === 'portrait') {
            if (tier === 'watch' || tier === 'compact-phone') return 1;
            if (tier === 'regular-phone') return 2;
            if (tier === 'phablet-fold') return 2;
            if (tier === 'tablet-portrait') return 3;
            return 3;
        } else {
            // Landscape
            if (tier === 'compact-phone' || tier === 'regular-phone') return 2;
            if (tier === 'phablet-fold') return 3;
            if (tier === 'tablet-portrait' || tier === 'tablet-landscape') return 4;
            if (tier === 'laptop') return 4;
            if (tier === 'desktop-fhd') return 5;
            if (tier === 'desktop-2k') return 6;
            if (tier === 'tv-4k') return 6;
            return 4;
        }
    }

    function detectFoldable(aspectCategory, isTouch, platform) {
        // Dual screen / foldable media query detection
        const hasSpanning = (
            (window.matchMedia && window.matchMedia('(screen-spanning: single-fold-vertical)').matches) ||
            (window.matchMedia && window.matchMedia('(screen-spanning: single-fold-horizontal)').matches) ||
            (window.matchMedia && window.matchMedia('(horizontal-viewport-segments: 2)').matches)
        );
        if (hasSpanning) return true;
        // High likelihood of unfolded foldable if square-ish aspect ratio on mobile touch
        if (aspectCategory === 'square-fold' && isTouch && (platform === 'android' || platform === 'web')) {
            return true;
        }
        return false;
    }

    // Core calculation function
    function analyzeScreen() {
        const vp = window.visualViewport;
        const width = Math.round(vp ? vp.width : (window.innerWidth || document.documentElement.clientWidth || screen.width));
        const height = Math.round(vp ? vp.height : (window.innerHeight || document.documentElement.clientHeight || screen.height));
        const screenW = screen.width || width;
        const screenH = screen.height || height;
        const availW = screen.availWidth || screenW;
        const availH = screen.availHeight || screenH;
        const dpr = window.devicePixelRatio || 1;
        const colorDepth = screen.colorDepth || 24;

        const ratio = parseFloat((width / (height || 1)).toFixed(3));
        const orientation = (width >= height) ? 'landscape' : 'portrait';

        let orientationAngle = 0;
        let orientationType = orientation + '-primary';
        if (screen.orientation) {
            orientationAngle = screen.orientation.angle || 0;
            orientationType = screen.orientation.type || orientationType;
        } else if (typeof window.orientation !== 'undefined') {
            orientationAngle = window.orientation;
        }

        const isTV = detectIsTV();
        const platform = detectPlatform();
        const inputMode = detectInputMode(isTV);
        const isTouch = inputMode === 'touch' || inputMode === 'hybrid';
        const tier = computeDeviceTier(width);
        const aspectCategory = computeAspectCategory(ratio);
        const dprTier = computeDprTier(dpr);
        const isFoldable = detectFoldable(aspectCategory, isTouch, platform);
        const safeArea = getSafeAreaInsets();
        const scaleFactor = computeScaleFactor(width, height, isTV, tier);
        const gridCols = computeOptimalGridCols(tier, orientation);

        return {
            timestamp: Date.now(),
            width,
            height,
            screenWidth: screenW,
            screenHeight: screenH,
            availWidth: availW,
            availHeight: availH,
            dpr: parseFloat(dpr.toFixed(2)),
            dprTier,
            colorDepth,
            aspectRatio: ratio,
            aspectCategory,
            orientation,
            orientationAngle,
            orientationType,
            deviceTier: tier,
            isTV,
            isFoldable,
            inputMode,
            platform,
            safeArea,
            scaleFactor,
            optimalGridCols: gridCols
        };
    }

    // Injects CSS Variables & DOM Data Attributes
    function applyMetrics(metrics) {
        if (!document.documentElement) return;
        const root = document.documentElement;
        const body = document.body;

        // 1. Inject CSS Custom Properties into :root
        root.style.setProperty('--screen-w', `${metrics.width}px`);
        root.style.setProperty('--screen-h', `${metrics.height}px`);
        root.style.setProperty('--screen-avail-w', `${metrics.availWidth}px`);
        root.style.setProperty('--screen-avail-h', `${metrics.availHeight}px`);
        root.style.setProperty('--screen-dpr', `${metrics.dpr}`);
        root.style.setProperty('--screen-aspect', `${metrics.aspectRatio}`);
        root.style.setProperty('--screen-scale', `${metrics.scaleFactor}`);
        root.style.setProperty('--screen-grid-cols', `${metrics.optimalGridCols}`);
        root.style.setProperty('--safe-top', `${metrics.safeArea.top}px`);
        root.style.setProperty('--safe-bottom', `${metrics.safeArea.bottom}px`);
        root.style.setProperty('--safe-left', `${metrics.safeArea.left}px`);
        root.style.setProperty('--safe-right', `${metrics.safeArea.right}px`);

        // 2. Set dynamic data-* attributes on html and body for CSS matching
        const attrs = {
            'data-device-tier': metrics.deviceTier,
            'data-aspect-ratio': metrics.aspectCategory,
            'data-orientation': metrics.orientation,
            'data-dpr': metrics.dprTier,
            'data-platform': metrics.platform,
            'data-input-mode': metrics.inputMode,
            'data-is-tv': String(metrics.isTV),
            'data-is-foldable': String(metrics.isFoldable)
        };

        Object.keys(attrs).forEach((key) => {
            root.setAttribute(key, attrs[key]);
            if (body) body.setAttribute(key, attrs[key]);
        });

        // 3. Update Diagnostics HUD if open
        if (isHudVisible && hudElement) {
            renderHud(metrics);
        }
    }

    // Debounced updater triggered on resize/orientation changes
    function triggerUpdate() {
        if (resizeTimer) cancelAnimationFrame(resizeTimer);
        resizeTimer = requestAnimationFrame(() => {
            const newMetrics = analyzeScreen();
            cachedMetrics = newMetrics;
            applyMetrics(newMetrics);

            // Notify registered listeners
            listeners.forEach((fn) => {
                try {
                    fn(newMetrics);
                } catch (e) {
                    console.error('[AlMeZ0Screen] listener error:', e);
                }
            });

            // Dispatch native DOM custom event
            try {
                window.dispatchEvent(new CustomEvent('almezo:screen-change', { detail: newMetrics }));
            } catch (e) { }
        });
    }

    // Interactive Screen Diagnostics HUD Component
    function createHud() {
        if (hudElement) return;

        hudElement = document.createElement('div');
        hudElement.id = 'almezo-screen-hud';
        hudElement.setAttribute('dir', 'ltr');
        hudElement.style.cssText = [
            'position: fixed',
            'bottom: 18px',
            'right: 18px',
            'width: 320px',
            'max-width: calc(100vw - 36px)',
            'background: rgba(10, 15, 26, 0.94)',
            'color: #f1f5f9',
            'backdrop-filter: blur(16px)',
            '-webkit-backdrop-filter: blur(16px)',
            'border: 1px solid rgba(139, 92, 246, 0.45)',
            'border-radius: 16px',
            'box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 25px rgba(139, 92, 246, 0.25)',
            'padding: 16px',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'font-size: 12px',
            'line-height: 1.5',
            'z-index: 999999',
            'opacity: 0',
            'transform: translateY(20px) scale(0.96)',
            'transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            'user-select: none',
            'pointer-events: none',
            'display: none'
        ].join(';');

        document.body.appendChild(hudElement);
    }

    function renderHud(m) {
        if (!hudElement) return;
        const tierLabels = {
            'watch': '⌚ Watch (< 340px)',
            'compact-phone': '📱 Compact Phone (< 380px)',
            'regular-phone': '📱 Standard Phone (380-599px)',
            'phablet-fold': '📖 Phablet / Folded (600-767px)',
            'tablet-portrait': '📟 Tablet Portrait (768-991px)',
            'tablet-landscape': '💻 Tablet Landscape (992-1199px)',
            'laptop': '💻 Laptop (1200-1439px)',
            'desktop-fhd': '🖥️ Desktop FHD 1080p (1440-1920px)',
            'desktop-2k': '🖥️ Desktop 2K/QHD (1921-2560px)',
            'tv-4k': '📺 Smart TV / 4K UHD (> 2560px)'
        };

        const aspectNames = {
            'ultrawide': '21:9+ UltraWide',
            'widescreen': '16:9 / 16:10 Wide',
            'standard': '4:3 / 3:2 Standard',
            'square-fold': '~1:1 Square Foldable',
            'tall': '19.5:9 / 20:9 Tall Mobile'
        };

        hudElement.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:8px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>
                    <strong style="font-size:13px;letter-spacing:0.5px;color:#a78bfa;">AlMeZ0 Screen Intelligence</strong>
                </div>
                <button id="almezo-hud-close-btn" style="background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:6px;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:background 0.2s;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:10px;">
                <div>
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Viewport Size</div>
                    <div style="font-weight:700;color:#f8fafc;font-size:13px;">${m.width} × ${m.height} px</div>
                </div>
                <div>
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Physical Display</div>
                    <div style="font-weight:700;color:#f8fafc;font-size:13px;">${m.screenWidth} × ${m.screenHeight} px</div>
                </div>
                <div>
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">DPI / DPR Scale</div>
                    <div style="font-weight:700;color:#38bdf8;">${m.dpr}x (${m.dprTier})</div>
                </div>
                <div>
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Fluid Scale Multiplier</div>
                    <div style="font-weight:700;color:#f59e0b;">${m.scaleFactor}x (${m.optimalGridCols} Cols)</div>
                </div>
                <div style="grid-column: span 2;">
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Device Tier</div>
                    <div style="font-weight:700;color:#a78bfa;font-size:12px;">${tierLabels[m.deviceTier] || m.deviceTier}</div>
                </div>
                <div style="grid-column: span 2;">
                    <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Aspect Ratio & Orientation</div>
                    <div style="font-weight:600;color:#e2e8f0;font-size:12px;">${aspectNames[m.aspectCategory] || m.aspectCategory} (${m.aspectRatio}) • ${m.orientation.toUpperCase()} (${m.orientationAngle}°)</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;">
                <div>Platform: <strong style="color:#fff;">${m.platform.toUpperCase()}</strong></div>
                <div>Input: <strong style="color:#fff;">${m.inputMode}</strong></div>
                <div>TV: <strong style="color:${m.isTV ? '#10b981' : '#94a3b8'};">${m.isTV ? 'YES' : 'NO'}</strong></div>
            </div>
            ${(m.safeArea.top > 0 || m.safeArea.bottom > 0) ? `
                <div style="margin-top:6px;font-size:10px;color:#94a3b8;text-align:center;">
                    Safe Areas: Top ${m.safeArea.top}px | Bottom ${m.safeArea.bottom}px
                </div>
            ` : ''}
        `;

        const closeBtn = document.getElementById('almezo-hud-close-btn');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                toggleHud(false);
            };
        }
    }

    function toggleHud(forceState) {
        createHud();
        isHudVisible = typeof forceState === 'boolean' ? forceState : !isHudVisible;
        if (isHudVisible) {
            hudElement.style.display = 'block';
            hudElement.style.pointerEvents = 'auto';
            requestAnimationFrame(() => {
                hudElement.style.opacity = '1';
                hudElement.style.transform = 'translateY(0) scale(1)';
                renderHud(cachedMetrics || analyzeScreen());
            });
        } else {
            hudElement.style.opacity = '0';
            hudElement.style.transform = 'translateY(20px) scale(0.96)';
            hudElement.style.pointerEvents = 'none';
            setTimeout(() => {
                if (!isHudVisible && hudElement) {
                    hudElement.style.display = 'none';
                }
            }, 250);
        }
    }

    // Keyboard shortcut (Ctrl + Alt + S) & Multiple click detection on brand/logo
    function setupTriggers() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
                e.preventDefault();
                toggleHud();
            }
        });

        // 4 rapid taps on any element with .logo or #brand-logo or footer copyright
        let tapCount = 0;
        let lastTapTime = 0;
        document.addEventListener('click', (e) => {
            const target = e.target.closest('.logo, .brand, .app-title, .footer-bottom, header h1');
            if (!target) return;
            const now = Date.now();
            if (now - lastTapTime < 500) {
                tapCount++;
                if (tapCount >= 4) {
                    tapCount = 0;
                    toggleHud();
                }
            } else {
                tapCount = 1;
            }
            lastTapTime = now;
        }, true);
    }

    function init() {
        if (isInitialized) return;
        isInitialized = true;

        // Perform initial analysis and apply to DOM
        cachedMetrics = analyzeScreen();
        applyMetrics(cachedMetrics);

        // Core dynamic listeners
        window.addEventListener('resize', triggerUpdate, { passive: true });
        window.addEventListener('orientationchange', triggerUpdate, { passive: true });
        if (screen.orientation) {
            screen.orientation.addEventListener('change', triggerUpdate);
        }
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', triggerUpdate, { passive: true });
        }

        // Listen to DPI / Resolution changes (e.g. moving windows between monitors)
        try {
            const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            if (dprQuery && dprQuery.addEventListener) {
                dprQuery.addEventListener('change', triggerUpdate);
            }
        } catch (e) { }

        setupTriggers();
    }

    // Public API
    const AlMeZ0Screen = {
        init,
        getInfo: function () {
            if (!cachedMetrics) cachedMetrics = analyzeScreen();
            return Object.assign({}, cachedMetrics);
        },
        refresh: triggerUpdate,
        onChange: function (callback) {
            if (typeof callback === 'function') {
                listeners.add(callback);
                // Call immediately with current metrics
                callback(this.getInfo());
            }
            return () => listeners.delete(callback);
        },
        toggleDiagnostics: toggleHud,
        isTV: () => (cachedMetrics ? cachedMetrics.isTV : detectIsTV()),
        isFoldable: () => (cachedMetrics ? cachedMetrics.isFoldable : false),
        getTier: () => (cachedMetrics ? cachedMetrics.deviceTier : computeDeviceTier(window.innerWidth || 1024))
    };

    global.AlMeZ0Screen = AlMeZ0Screen;

    // Auto-init on DOM ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(typeof window !== 'undefined' ? window : this);
