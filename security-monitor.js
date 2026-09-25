// =============================================
// غرفة المراقبة والأمان - AlMeZ0 SOC Dashboard
// منطق الرصد اللحظي، الفلترة، تحليل التهديدات، وتصدير التقارير
// متوافق بالكامل مع الهواتف الذكية والحواسيب
// =============================================

(function () {
    const ADMIN_TARGET_UID = '7Rfvdr6GpwPcY9uDQwX0fIuWeRv1';

    // حد البث الحي المباشر (1500 سجل لتغطية شاملة لليوم مع الحفاظ على سرعة الريل-تايم الفائقة بفضل الترقيم)
    const LIVE_LOGS_LIMIT = 1500;
    const PAGE_SIZE = 50;
    let currentPage = 1;
    let isRefreshingFeed = false;
    let renderDebounceTimer = null;
    let lastTopLogId = null;

    let allLogs = [];
    let currentFilterCategory = 'all';
    let currentSearchQuery = '';
    let currentSelectedDate = null;
    let logsUnsubscribe = null;
    const bannedDevicesSet = new Set();
    let lockoutsUnsubscribe = null;
    // سجلات يوم محدد من التقويم: تُجلب باستعلام مستقل عند الطلب مع كاش محلي
    const dayLogsCache = {};
    let dayLogsLoading = null;

    // =============================================
    // 1. التحقق الصارم من صلاحيات المدير
    // =============================================
    auth.onAuthStateChanged(async function (user) {
        if (!user) {
            kickOut(user);
            return;
        }

        let isAdmin = (user.uid === ADMIN_TARGET_UID);
        if (!isAdmin) {
            try {
                const adminDoc = await db.collection('admins').doc(user.uid).get();
                isAdmin = adminDoc.exists;
            } catch(e) { isAdmin = false; }
        }

        if (!isAdmin) {
            kickOut(user);
            return;
        }

        function kickOut(usr) {
            document.body.innerHTML = `
                <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px; background:#0a0d12; color:#fff; font-family:'Tajawal', sans-serif;">
                    <div style="width:85px; height:85px; border-radius:50%; background:rgba(229,57,53,0.15); border:2px solid #e53935; display:flex; align-items:center; justify-content:center; font-size:2.6rem; color:#e53935; margin-bottom:20px; box-shadow: 0 0 25px rgba(229,57,53,0.3);">
                        <i class="fas fa-user-lock"></i>
                    </div>
                    <h1 style="color:#e53935; font-size:1.8rem; margin-bottom:12px;">⚠️ منطقة أمنية مشفرة ومحظورة</h1>
                    <p style="color:#9e9e9e; font-size:1.05rem; max-width:480px; margin-bottom:25px; line-height:1.7;">
                        هذه الغرفة مخصصة فقط وحصرياً للمدير العام لحماية ورصد أنشطة الموقع. تم رفض الإذن وتم تسجيل المحاولة للأسباب الأمنية.
                    </p>
                    <a href="index.html" style="background:linear-gradient(135deg, #1b5e20, #2e7d32); color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; box-shadow: 0 4px 15px rgba(46,125,50,0.4);"><i class="fas fa-home"></i> العودة للصفحة الرئيسية</a>
                </div>
            `;
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'unauthorized_access_attempt',
                    category: 'security',
                    severity: 'danger',
                    title: '🚨 محاولة دخول غير مصرح لغرفة المراقبة والأمان',
                    details: { attemptedUid: usr ? usr.uid : 'guest', url: window.location.href }
                });
            }
            setTimeout(function () {
                window.location.href = 'index.html';
            }, 3500);
        }

        // المدير مصرح له بنجاح
        initSecurityMonitor();
    });

    // =============================================
    // 2. تهيئة وتشغيل غرفة المراقبة
    // =============================================
    function initSecurityMonitor() {
        setupEventListeners();
        setupDatePicker();
        startRealtimeLogsFeed();
        startLockoutsFeed();
        autoCleanupOldLogs();
    }

    /**
     * الاستماع الحي لقائمة الأجهزة المحظورة في السحابة وتحديث الشاشة فوراً
     */
    function startLockoutsFeed() {
        if (lockoutsUnsubscribe) {
            try { lockoutsUnsubscribe(); } catch(e){}
            lockoutsUnsubscribe = null;
        }
        if (typeof db === 'undefined' || !db) return;

        lockoutsUnsubscribe = db.collection('security_lockouts').onSnapshot(function (snapshot) {
            bannedDevicesSet.clear();
            snapshot.forEach(doc => {
                const data = doc.data() || {};
                // الحظر الدائم فقط هو الذي تم بقرار يدوي من المدير
                const isPermanentBan = (
                    (data.status === 'permanent_banned' || data.isPermanent === true || data.isBanned === true) &&
                    data.status !== 'lifted_by_admin'
                );
                const hwVal = (data.hw || doc.id.replace(/^hw_/, '')).trim();
                if (isPermanentBan && hwVal) {
                    bannedDevicesSet.add(hwVal);
                }
            });
            renderLogsTable();
        }, function (err) {
            console.warn('⚠️ lockouts stream warning:', err);
        });
    }

    // =============================================
    // 3. الاستماع الحي للسجلات من Firestore (Real-Time Stream)
    // =============================================
    function startRealtimeLogsFeed() {
        if (logsUnsubscribe) {
            logsUnsubscribe();
            logsUnsubscribe = null;
        }

        const rulesAlertEl = document.getElementById('socRulesAlert');
        if (rulesAlertEl) rulesAlertEl.style.display = 'none';

        // المحاولة 1: استعلام مرتب حسب timestamp
        trySubscribeLogs(true);
    }

    function trySubscribeLogs() {
        if (logsUnsubscribe) {
            try { logsUnsubscribe(); } catch (e) { }
            logsUnsubscribe = null;
        }

        if (typeof db === 'undefined' || !db) return;

        // استماع فوري لأحدث 1500 سجل للبث الحي
        const logsRef = db.collection('activity_logs').orderBy('timestamp', 'desc').limit(LIVE_LOGS_LIMIT);

        logsUnsubscribe = logsRef.onSnapshot(function (snapshot) {
            const rulesAlertEl = document.getElementById('socRulesAlert');
            if (rulesAlertEl) rulesAlertEl.style.display = 'none';

            allLogs = [];
            snapshot.forEach(doc => {
                allLogs.push({ id: doc.id, ...doc.data() });
            });

            // ترتيب السجلات في الذاكرة لضمان الدقة
            allLogs.sort((a, b) => getLogMillis(b) - getLogMillis(a));

            // تحديث وقت المزامنة
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const lastSyncEl = document.getElementById('lastSyncTime');
            if (lastSyncEl) lastSyncEl.innerText = timeStr;

            // تحديث الإحصائيات ورسم الجدول بسلاسة فائقة
            updateKpiMetrics();
            scheduleRenderTable();
        }, function (error) {
            console.warn('⚠️ Error on activity_logs stream:', error);

            // إذا كان خطأ أذونات الصلاحيات
            const rulesAlertEl = document.getElementById('socRulesAlert');
            if (rulesAlertEl) {
                rulesAlertEl.style.display = 'block';
                rulesAlertEl.scrollIntoView({ behavior: 'smooth' });
            }

            const tbody = document.getElementById('socTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding: 35px 15px; color:#ff5252;">
                            <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:10px;"></i>
                            <p style="font-size:1rem; font-weight:700;">تعذر جلب السجلات: ${escapeHtml(error.message)}</p>
                            <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:5px;">يرجى التأكد من تطبيق ونشر قواعد firestore.rules في Firebase Console</p>
                        </td>
                    </tr>
                `;
            }

            if (typeof showToast === 'function') {
                showToast('⚠️ خطأ في قراءة السجلات السحابية: ' + error.message, 'error', 5000);
            }
        });
    }

    /**
     * جدولة رسم الجدول مع تقليل العبء باستخدام requestAnimationFrame لمنع تجميد المتصفح
     */
    function scheduleRenderTable() {
        if (renderDebounceTimer) return;
        renderDebounceTimer = requestAnimationFrame(function () {
            renderDebounceTimer = null;
            renderLogsTable();
        });
    }

    // =============================================
    // 4. حساب وتحديث الإحصائيات (KPI Cards)
    // =============================================
    function updateKpiMetrics() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);

        let todayCount = 0;
        let threatsCount = 0;
        const activeVisitorsSet = new Set();
        let lastAdminLog = null;

        allLogs.forEach(log => {
            const logMillis = getLogMillis(log);

            // 1. حركات اليوم
            if (logMillis >= startOfToday) {
                todayCount++;
            }

            // 2. التنبيهات الأمنية والمحاولات الفاشلة والمشبوهة فقط (استثناء حركات المدير الناجحة والتجارب)
            const isSecurityThreat = (
                log.severity === 'danger' ||
                log.category === 'security' ||
                log.action === 'login_failed' ||
                log.action === 'client_locked_out' ||
                log.action === 'lockout_attempt' ||
                log.action === 'brute_force_warning' ||
                log.action === 'unauthorized_access_attempt' ||
                (log.title && (log.title.includes('فاشلة') || log.title.includes('غير مصرح') || log.title.includes('مشبو') || log.title.includes('حظر') || log.title.includes('خطر') || log.title.includes('خاطئ') || log.title.includes('كلمة سر') || log.title.includes('هاتف')))
            ) && log.action !== 'admin_test_ping' && log.action !== 'admin_lift_lockout' && log.severity !== 'success';

            if (isSecurityThreat && logMillis >= startOfToday) {
                threatsCount++;
            }

            // 3. الزوار والعملاء النشطين اليوم (يتم التصفير في منتصف الليل)
            if (logMillis >= startOfToday) {
                // الاعتماد على بصمة الجهاز (Hardware ID) أو عنوان IP العام للزوار غير المسجلين بناءً على طلبك
                const visitorKey = log.hardwareFingerprint || (log.device && log.device.hardwareFingerprint) || log.publicIp || (log.device && log.device.publicIp) || (log.user && log.user.uid) || (log.user && log.user.phone) || log.id;
                activeVisitorsSet.add(visitorKey);
            }

            // 4. آخر حركة للمدير
            if (!lastAdminLog && log.user && (log.user.role === 'admin' || log.user.uid === ADMIN_TARGET_UID)) {
                lastAdminLog = log;
            }
        });

        // تحديث عناصر الواجهة
        const todayCountEl = document.getElementById('kpiTodayCount');
        if (todayCountEl) todayCountEl.innerText = todayCount.toLocaleString();

        const threatsCountEl = document.getElementById('kpiThreatsCount');
        if (threatsCountEl) threatsCountEl.innerText = threatsCount.toLocaleString();

        const activeCountEl = document.getElementById('kpiActiveUsersCount');
        if (activeCountEl) activeCountEl.innerText = activeVisitorsSet.size.toLocaleString();

        const adminLastActionEl = document.getElementById('kpiAdminLastAction');
        const adminLastTimeEl = document.getElementById('kpiAdminLastTime');
        if (adminLastActionEl && adminLastTimeEl) {
            if (lastAdminLog) {
                let actionText = lastAdminLog.title || lastAdminLog.action || 'نشاط للمدير';
                if (actionText.includes('فحص') || actionText.includes('رادار') || lastAdminLog.action === 'admin_test_ping') {
                    actionText = 'فحص أمني للرادار';
                }
                adminLastActionEl.innerText = actionText;
                adminLastTimeEl.innerText = formatRelativeTime(getLogMillis(lastAdminLog));
            } else {
                adminLastActionEl.innerText = 'لا توجد حركات';
                adminLastTimeEl.innerText = '--';
            }
        }
    }

    // =============================================
    // 5. فلترة وعرض جدول السجلات
    // =============================================
    /** معامل آمن داخل onclick: JSON يعطي نصاً سليماً في JS، ثم التهريب لسياق السمة. */
    function jsArg(value) {
        return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
    }

    /** بداية اليوم المختار بالتوقيت المحلي (new Date('2026-09-20') يُقرأ بتوقيت UTC). */
    function selectedDayStart() {
        if (!currentSelectedDate) {
            const n = new Date();
            return new Date(n.getFullYear(), n.getMonth(), n.getDate());
        }
        const p = String(currentSelectedDate).split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function isTodaySelected() {
        const d = selectedDayStart(), n = new Date();
        return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    }

    function sourceLogs() {
        if (!isTodaySelected() && currentSelectedDate && dayLogsCache[currentSelectedDate]) {
            return dayLogsCache[currentSelectedDate];
        }
        return allLogs;
    }

    async function loadSelectedDay() {
        if (!currentSelectedDate || isTodaySelected() || dayLogsCache[currentSelectedDate]) return;
        if (typeof db === 'undefined' || !db) return;
        const key = currentSelectedDate;
        const start = selectedDayStart();
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        dayLogsLoading = key;
        renderLogsTable();
        try {
            const snap = await db.collection('activity_logs')
                .where('timestamp', '>=', start)
                .where('timestamp', '<', end)
                .orderBy('timestamp', 'desc')
                .limit(5000)
                .get();
            const list = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            dayLogsCache[key] = list;
        } catch (e) {
            console.warn('تعذر جلب سجلات اليوم المحدد:', e);
            if (typeof showToast === 'function') showToast('تعذر جلب سجلات هذا اليوم: ' + e.message, 'error');
        } finally {
            if (dayLogsLoading === key) dayLogsLoading = null;
            renderLogsTable();
        }
    }

    /**
     * بيانات جهاز السجل. السجلات القديمة قد تحمل نوعاً خاطئاً أو ناقصاً (كان كل من يفتح
     * الموقع من متصفح يُسجَّل "برنامج كمبيوتر")، فنستنتجها من بصمة المتصفح المحفوظة معها.
     */
    function deviceOf(log) {
        const d = Object.assign({}, log.device || {});
        const ua = d.userAgent || '';
        const unknown = (v) => !v || v === 'غير معروف' || v === 'غير متوفر';
        if (ua) {
            const isApp = d.appPlatform === 'android_app' || /ALmEz0-Android|Capacitor/i.test(ua);
            const isPc = d.appPlatform === 'windows_app' || /Electron|ALmEz0-PC/i.test(ua);
            const isTv = /tv|smart-tv|smarttv|googletv|crkey|bravia|aft|mibox|tx9|box|webos|tizen/i.test(ua);
            if (unknown(d.os)) {
                if (/android/i.test(ua)) d.os = 'Android';
                else if (/iphone/i.test(ua)) d.os = 'iOS (iPhone)';
                else if (/ipad/i.test(ua)) d.os = 'iPadOS';
                else if (/windows nt 10/i.test(ua)) d.os = 'Windows 10/11';
                else if (/windows/i.test(ua)) d.os = 'Windows';
                else if (/mac os x|macintosh/i.test(ua)) d.os = 'macOS';
                else if (/linux/i.test(ua)) d.os = 'Linux';
            }
            // النوع: يُعاد استنتاجه متى ناقض بصمة المتصفح
            const uaSaysPhone = /iphone/i.test(ua) || (/android/i.test(ua) && /mobile/i.test(ua));
            const uaSaysTablet = /ipad/i.test(ua) || /tablet/i.test(ua);
            if (unknown(d.type) || (uaSaysPhone && /كمبيوتر/.test(d.type || '')) || (uaSaysTablet && /كمبيوتر/.test(d.type || ''))) {
                if (isTv) d.type = 'شاشة / TV Box';
                else if (/iphone/i.test(ua)) d.type = 'آيفون (iPhone)';
                else if (/ipad/i.test(ua)) d.type = 'آيباد (iPad)';
                else if (/android/i.test(ua)) d.type = /mobile/i.test(ua) ? 'هاتف أندرويد' : 'جهاز أندرويد لوحي';
                else if (/mobile/i.test(ua)) d.type = 'هاتف (Mobile)';
                else d.type = isPc ? 'كمبيوتر (برنامج ALmEz0)' : 'كمبيوتر (Desktop)';
            }
            if (unknown(d.browser)) {
                if (isApp) d.browser = 'تطبيق أندرويد (ALmEz0 App)';
                else if (isPc) d.browser = 'برنامج كمبيوتر (ALmEz0 PC)';
                else if (/edg/i.test(ua)) d.browser = 'Microsoft Edge';
                else if (/samsungbrowser/i.test(ua)) d.browser = 'Samsung Internet';
                else if (/firefox|fxios/i.test(ua)) d.browser = 'Firefox';
                else if (/crios|chrome/i.test(ua)) d.browser = 'Chrome';
                else if (/safari/i.test(ua)) d.browser = 'Safari';
            }
        }
        return d;
    }

    function getFilteredLogs() {
        return sourceLogs().filter(log => {
            // 1. فلترة التبويبات
            if (currentFilterCategory === 'security') {
                const isSecThreat = (
                    log.severity === 'danger' ||
                    log.category === 'security' ||
                    log.action === 'login_failed' ||
                    log.action === 'client_locked_out' ||
                    log.action === 'lockout_attempt' ||
                    log.action === 'brute_force_warning' ||
                    log.action === 'unauthorized_access_attempt' ||
                    (log.title && (log.title.includes('فاشلة') || log.title.includes('غير مصرح') || log.title.includes('مشبو') || log.title.includes('حظر') || log.title.includes('خطر') || log.title.includes('خاطئ') || log.title.includes('كلمة سر') || log.title.includes('هاتف')))
                ) && log.action !== 'admin_test_ping' && log.action !== 'admin_lift_lockout' && log.severity !== 'success';
                if (!isSecThreat) return false;
            } else if (currentFilterCategory === 'iptv') {
                const isIptv = log.category === 'iptv' ||
                    (log.action && (log.action.includes('iptv') || log.action.includes('player') || log.action.includes('server'))) ||
                    (log.page && log.page.includes('player')) ||
                    (log.title && (log.title.includes('سيرفر') || log.title.includes('المشغل') || log.title.includes('قناة') || log.title.includes('بث')));
                if (!isIptv) return false;
            } else if (currentFilterCategory === 'admin') {
                if (!log.user || (log.user.role !== 'admin' && log.user.uid !== ADMIN_TARGET_UID)) return false;
            } else if (currentFilterCategory === 'staff') {
                if (!log.user || log.user.role !== 'staff') return false;
            } else if (currentFilterCategory === 'customer') {
                if (!log.user || log.user.role !== 'customer') return false;
            } else if (currentFilterCategory === 'visitor') {
                if (log.user && log.user.role !== 'visitor') return false;
            } else if (currentFilterCategory === 'sales') {
                // المبيعات والطلبات وعمليات الشراء
                const isSales = log.category === 'sales' || log.category === 'order' ||
                    (log.action && /sale|order|purchase|transaction|invoice|balance/i.test(log.action));
                if (!isSales) return false;
            } else if (currentFilterCategory === 'auth') {
                // تسجيل الدخول والخروج وتغيير كلمة المرور
                const isAuth = log.category === 'auth' ||
                    (log.action && /login|logout|register|password|session/i.test(log.action));
                if (!isAuth) return false;
            }

            // 2. فلترة البحث النصي
            if (currentSearchQuery) {
                const q = currentSearchQuery.toLowerCase();
                const userName = (log.user && log.user.name) ? log.user.name.toLowerCase() : '';
                const userPhone = (log.user && log.user.phone) ? log.user.phone.toLowerCase() : '';
                const title = (log.title || '').toLowerCase();
                const action = (log.action || '').toLowerCase();
                const page = (log.page || '').toLowerCase();
                const os = (log.device && log.device.os) ? log.device.os.toLowerCase() : '';
                const browser = (log.device && log.device.browser) ? log.device.browser.toLowerCase() : '';
                const ip = (log.publicIp || (log.device && log.device.publicIp) || '').toLowerCase();
                const hw = (log.hardwareFingerprint || (log.device && log.device.hardwareFingerprint) || '').toLowerCase();
                const city = ((log.device && log.device.city) || '').toLowerCase();
                const country = ((log.device && log.device.country) || '').toLowerCase();
                const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details).toLowerCase() : String(log.details || '').toLowerCase();

                const match = userName.includes(q) || userPhone.includes(q) || title.includes(q) || action.includes(q) || page.includes(q) || os.includes(q) || browser.includes(q) || ip.includes(q) || hw.includes(q) || city.includes(q) || country.includes(q) || detailsStr.includes(q);
                if (!match) return false;
            }

            // 3. فلترة التاريخ (عرض نتائج اليوم فقط كافتراضي)
            const logMillis = log._millis || (log._millis = getLogMillis(log));
            const logDate = new Date(logMillis);
            const targetDate = selectedDayStart();

            const isSameDay = logDate.getFullYear() === targetDate.getFullYear() &&
                logDate.getMonth() === targetDate.getMonth() &&
                logDate.getDate() === targetDate.getDate();

            if (!isSameDay) return false;

            return true;
        });
    }

    function renderLogsTable() {
        const tbody = document.getElementById('socTableBody');
        if (!tbody) return;

        if (dayLogsLoading && dayLogsLoading === currentSelectedDate) {
            tbody.innerHTML = `
                <tr><td colspan="7" style="text-align:center; padding: 40px 20px; color:var(--text-secondary);">
                    <i class="fas fa-spinner fa-spin fa-2x" style="margin-bottom:10px; color:#b388ff;"></i>
                    <p>جاري جلب حركات اليوم المحدد...</p>
                </td></tr>`;
            const pagBar = document.getElementById('socPaginationBar');
            if (pagBar) pagBar.style.display = 'none';
            return;
        }

        const filtered = getFilteredLogs();
        const totalLogs = filtered.length;

        // تحديث شارة العدد
        const badgeEl = document.getElementById('visibleLogsBadge');
        if (badgeEl) badgeEl.innerText = `${totalLogs} حركة`;

        const pagBar = document.getElementById('socPaginationBar');

        if (totalLogs === 0) {
            if (pagBar) pagBar.style.display = 'none';
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 45px 20px; color:var(--text-secondary);">
                        <i class="fas fa-inbox fa-3x" style="opacity:0.3; margin-bottom:10px;"></i>
                        <p style="font-size:1.05rem;">لا توجد حركات تطابق معايير البحث والفلترة المحددة</p>
                        <p style="font-size:0.85rem; color:#7c4dff; margin-top:8px;">اضغط على زر "فحص أمني للرادار" بالأعلى لاختبار التسجيل فوراً</p>
                    </td>
                </tr>
            `;
            return;
        }

        // حسابات الترقيم (50 حركة في الصفحة لضمان 60 إطار في الثانية وبدون أي تجميد)
        const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, totalLogs);
        const pageLogs = filtered.slice(startIndex, endIndex);

        // تحديث عناصر شريط الترقيم
        if (pagBar) pagBar.style.display = 'flex';
        const pStartEl = document.getElementById('pagStart');
        const pEndEl = document.getElementById('pagEnd');
        const pTotalEl = document.getElementById('pagTotal');
        const curPageEl = document.getElementById('currentPageNum');
        const totPageEl = document.getElementById('totalPageNum');
        const btnFirst = document.getElementById('btnFirstPage');
        const btnPrev = document.getElementById('btnPrevPage');
        const btnNext = document.getElementById('btnNextPage');
        const btnLast = document.getElementById('btnLastPage');

        if (pStartEl) pStartEl.innerText = String(startIndex + 1);
        if (pEndEl) pEndEl.innerText = String(endIndex);
        if (pTotalEl) pTotalEl.innerText = String(totalLogs);
        if (curPageEl) curPageEl.innerText = String(currentPage);
        if (totPageEl) totPageEl.innerText = String(totalPages);
        if (btnFirst) btnFirst.disabled = (currentPage <= 1);
        if (btnPrev) btnPrev.disabled = (currentPage <= 1);
        if (btnNext) btnNext.disabled = (currentPage >= totalPages);
        if (btnLast) btnLast.disabled = (currentPage >= totalPages);

        // كشف وصول حركة جديدة لحظية لتمييزها بنبضة إشعاعية خفيفة
        const isFirstPage = (currentPage === 1);
        const currentTopId = pageLogs.length > 0 ? pageLogs[0].id : null;
        let shouldHighlightFirst = false;
        if (isFirstPage && currentTopId && lastTopLogId && currentTopId !== lastTopLogId) {
            shouldHighlightFirst = true;
        }
        if (isFirstPage && currentTopId) {
            lastTopLogId = currentTopId;
        }

        let html = '';
        pageLogs.forEach((log, index) => {
            const logMillis = log._millis || (log._millis = getLogMillis(log));
            const dateFormatted = log._date || (log._date = formatDate(logMillis));
            const timeFormatted = log._time || (log._time = formatTime(logMillis));
            const relTime = formatRelativeTime(logMillis);

            // تحديد فئة الصف والألوان
            let rowClass = '';
            if (log.severity === 'danger' || log.category === 'security' || log.action === 'login_failed') {
                rowClass = 'log-danger';
            } else if (log.user && (log.user.role === 'admin' || log.user.uid === ADMIN_TARGET_UID)) {
                rowClass = 'log-admin';
            } else if (log.user && log.user.role === 'staff') {
                rowClass = 'log-staff';
            } else if (log.user && log.user.role === 'customer') {
                rowClass = 'log-customer';
            }

            if (index === 0 && shouldHighlightFirst) {
                rowClass += ' log-row-new';
            }

            // رتبة المستخدم
            const role = (log.user && log.user.role) ? log.user.role : 'visitor';
            const roleLabel = getRoleBadge(role);
            const userName = (log.user && log.user.name) ? log.user.name : 'زائر مجهول';
            const userPhone = (log.user && log.user.phone) ? log.user.phone : '';

            // شارة مستوى الخطورة / النشاط
            const sevBadge = getSeverityBadge(log.severity, log.action);

            // تفاصيل الجهاز والـ IP وبصمة العتاد (محفوظة في الذاكرة لتفادي الـ regex المتكرر)
            const device = log._device || (log._device = deviceOf(log));
            const t = device.type || '';
            const deviceTypeIcon = /تلفاز|شاشة|TV/i.test(t) ? 'fa-tv'
                : (/هاتف|آيفون|iPhone/i.test(t) ? 'fa-mobile-alt'
                    : (/لوحي|آيباد|iPad/i.test(t) ? 'fa-tablet-alt' : 'fa-desktop'));
            const osText = device.os || 'غير معروف';
            const browserText = device.browser || '';
            const ipAddress = log.publicIp || device.publicIp || '';
            const locationStr = [device.city, device.country].filter(Boolean).join(', ');
            const hwFp = log.hardwareFingerprint || device.hardwareFingerprint || '';

            // تفاصيل مختصرة للحركة
            const detailsSummary = formatDetailsSummary(log.details, log.action, log.title);

            html += `
                <tr class="${rowClass}">
                    <td class="time-cell">
                        <div style="color:#fff; font-weight:700;">${timeFormatted}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${dateFormatted}</div>
                        <div style="font-size:0.72rem; color:#b388ff;">(${relTime})</div>
                    </td>
                    <td>
                        <div style="margin-bottom:3px;">${roleLabel}</div>
                        <strong style="font-size:0.95rem; color:#fff;">${escapeHtml(userName)}</strong>
                        ${userPhone ? `<div style="font-size:0.8rem; color:var(--green-accent); font-family:monospace; direction:ltr; text-align:right;"><i class="fas fa-phone-alt" style="font-size:0.7rem;"></i> ${escapeHtml(userPhone)}</div>` : ''}
                    </td>
                    <td>
                        ${sevBadge}
                    </td>
                    <td style="max-width: 250px;">
                        <div style="font-weight:700; color:#fff; font-size:0.95rem; line-height:1.4;">${escapeHtml(log.title || log.action)}</div>
                        ${detailsSummary && detailsSummary !== '—' ? `<div style="font-size:0.85rem; line-height:1.4; color:var(--text-secondary); word-break:break-word; margin-top:5px; padding-top:5px; border-top:1px solid rgba(255,255,255,0.05);">${detailsSummary}</div>` : ''}
                    </td>
                    <td>
                        ${(device.appPlatform === 'android_app' || (browserText && browserText.includes('أندرويد'))) ? `
                            <div style="margin-bottom:5px;">
                                <span style="background:rgba(34,197,94,0.18); border:1px solid #22c55e; color:#4ade80; padding:2px 7px; border-radius:6px; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; gap:4px; box-shadow: 0 0 10px rgba(34,197,94,0.2);">
                                    <i class="fab fa-android"></i> تطبيق أندرويد
                                </span>
                            </div>
                        ` : (device.appPlatform === 'windows_app' || (browserText && browserText.includes('ويندوز')) || (device.type && device.type.includes('برنامج ALmEz0'))) ? `
                            <div style="margin-bottom:5px;">
                                <span style="background:rgba(56,189,248,0.18); border:1px solid #0288d1; color:#38bdf8; padding:2px 7px; border-radius:6px; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; gap:4px; box-shadow: 0 0 10px rgba(56,189,248,0.2);">
                                    <i class="fab fa-windows"></i> برنامج كمبيوتر
                                </span>
                            </div>
                        ` : ''}
                        <div class="device-pill" style="margin-bottom: 4px; flex-wrap: wrap; word-break: break-word; max-width: 100%;">
                            <i class="fas ${deviceTypeIcon}"></i>
                            <span>${escapeHtml(osText)}</span>
                            ${browserText ? `<span>• ${escapeHtml(browserText)}</span>` : ''}
                        </div>
                        ${ipAddress ? `
                            <div style="font-family:monospace; font-size:0.78rem; color:#4fc3f7; display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:3px; word-break:break-all; max-width:100%;" title="عنوان IP العام">
                                <i class="fas fa-globe-americas"></i>
                                <span style="word-break:break-all;">${escapeHtml(ipAddress)}</span>
                                ${locationStr ? `<span style="color:var(--text-secondary); font-size:0.72rem;">(${escapeHtml(locationStr)})</span>` : ''}
                            </div>
                        ` : ''}
                        ${hwFp ? `
                            <div style="font-family:monospace; font-size:0.73rem; color:#b388ff; margin-top:2px; word-break:break-all; max-width:100%;" title="بصمة العتاد الفريدة">
                                <i class="fas fa-fingerprint"></i> ${escapeHtml(hwFp)}
                            </div>
                        ` : ''}
                        ${(function () {
                            const cHw = hwFp ? hwFp.replace(/[^\w-]/g, '').trim() : '';
                            const isBanned = cHw && cHw !== 'غير متوفر' && bannedDevicesSet.has(cHw);
                            if (isBanned) {
                                return `
                                    <div style="margin-top:3px;">
                                        <span style="background:rgba(255,23,68,0.22); border:1px solid #ff1744; color:#ff5252; padding:2px 7px; border-radius:5px; font-size:0.72rem; font-weight:800; display:inline-flex; align-items:center; gap:4px; box-shadow:0 0 10px rgba(255,23,68,0.3);">
                                            <i class="fas fa-ban"></i> محظور إدارياً
                                        </span>
                                    </div>
                                `;
                            }
                            return '';
                        })()}
                    </td>
                    <td>
                        <span style="font-family:monospace; font-size:0.82rem; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">
                            ${escapeHtml(log.page || 'index.html')}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <button type="button" class="btn-view-details" onclick="openLogDetailsModal(${jsArg(log.id)})" title="عرض السجل الكامل">
                                <i class="fas fa-eye"></i> التفاصيل
                            </button>
                            ${(function () {
                                const cHw = hwFp ? hwFp.replace(/[^\w-]/g, '').trim() : '';
                                if (!cHw || cHw === 'غير متوفر') return '';
                                const isBanned = bannedDevicesSet.has(cHw);
                                if (isBanned) {
                                    return `
                                        <button type="button" class="btn-lift-ban" onclick="liftLockoutAction(${jsArg(cHw)}, ${jsArg(userPhone || '')})" title="رفع الحظر الأمني عن هذا الجهاز فوراً">
                                            <i class="fas fa-unlock-alt"></i> رفع الحظر
                                        </button>
                                    `;
                                } else {
                                    return `
                                        <button type="button" class="btn-ban-device" onclick="banDeviceAction(${jsArg(cHw)}, ${jsArg(userName)})" title="حظر هذا الجهاز نهائياً من دخول الموقع">
                                            <i class="fas fa-ban"></i> حظر
                                        </button>
                                    `;
                                }
                            })()}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // =============================================
    // 6. أدوات التنسيق والمساعدات (Helpers)
    // =============================================

    function getLogMillis(log) {
        if (log.timestamp && typeof log.timestamp.toMillis === 'function') {
            return log.timestamp.toMillis();
        }
        if (log.createdAt && typeof log.createdAt === 'number') {
            return log.createdAt;
        }
        if (log.clientTime) {
            return new Date(log.clientTime).getTime();
        }
        return Date.now();
    }

    function formatDate(millis) {
        const d = new Date(millis);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    function formatTime(millis) {
        const d = new Date(millis);
        return d.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }

    function formatRelativeTime(millis) {
        const diffSec = Math.floor((Date.now() - millis) / 1000);
        if (diffSec < 45) return 'الآن';
        if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
        if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
        return `منذ ${Math.floor(diffSec / 86400)} يوم`;
    }

    function getRoleBadge(role) {
        switch (role) {
            case 'admin':
                return '<span class="role-badge role-admin"><i class="fas fa-crown"></i> مدير عام</span>';
            case 'staff':
                return '<span class="role-badge role-staff"><i class="fas fa-briefcase"></i> مندوب مبيعات</span>';
            case 'customer':
                return '<span class="role-badge role-customer"><i class="fas fa-user-check"></i> عميل مسجل</span>';
            default:
                return '<span class="role-badge role-visitor"><i class="fas fa-globe"></i> زائر</span>';
        }
    }

    function getSeverityBadge(severity, action) {
        if (action === 'client_locked_out') {
            return '<span class="severity-badge sev-danger" style="animation: pulseDanger 1.2s infinite; border-color:#ff1744; background:rgba(255,23,68,0.3);"><i class="fas fa-user-lock"></i> حظر</span>';
        }
        if (action === 'brute_force_warning') {
            return '<span class="severity-badge sev-danger" style="animation: pulseDanger 1.5s infinite; border-color:#ff1744; background:rgba(255,23,68,0.25);"><i class="fas fa-biohazard"></i> حظر</span>';
        }
        if (severity === 'danger' || action === 'login_failed' || action === 'unauthorized_access_attempt') {
            return '<span class="severity-badge sev-danger"><i class="fas fa-radiation"></i> تنبيه</span>';
        }
        if (action === 'admin_test_ping') {
            return '<span class="severity-badge sev-success"><i class="fas fa-satellite"></i> فحص</span>';
        }
        if (severity === 'warning' || action === 'password_changed' || action === 'staff_withdrawal') {
            return '<span class="severity-badge sev-warning"><i class="fas fa-exclamation-circle"></i> تنبيه</span>';
        }
        if (action === 'logout') {
            return '<span class="severity-badge sev-info" style="border-color:#9e9e9e; background:rgba(158,158,158,0.2); color:#bdbdbd;"><i class="fas fa-sign-out-alt"></i> خروج</span>';
        }
        if (action === 'order_confirmed_whatsapp' || action === 'purchase') {
            return '<span class="severity-badge sev-success" style="border-color:#4caf50; background:rgba(76,175,80,0.2); color:#69f0ae;"><i class="fas fa-shopping-cart"></i> شراء</span>';
        }
        if (action === 'demo_account_request') {
            return '<span class="severity-badge sev-info" style="border-color:#2196f3; background:rgba(33,150,243,0.2); color:#40c4ff;"><i class="fas fa-vial"></i> تجريبي</span>';
        }
        if (action === 'iptv_login_success') {
            return '<span class="severity-badge sev-success" style="border-color:#4caf50; background:rgba(76,175,80,0.25); color:#69f0ae;"><i class="fas fa-tv"></i> دخول سيرفر</span>';
        }
        if (action === 'player_server_connected') {
            return '<span class="severity-badge sev-info" style="border-color:#7c4dff; background:rgba(124,77,255,0.25); color:#b388ff;"><i class="fas fa-satellite-dish"></i> ربط سيرفر</span>';
        }
        if (action === 'player_server_failed' || action === 'iptv_login_failed') {
            return '<span class="severity-badge sev-danger"><i class="fas fa-times-circle"></i> خطأ سيرفر</span>';
        }
        if (action === 'player_server_logout' || action === 'iptv_logout') {
            return '<span class="severity-badge sev-info" style="border-color:#9e9e9e; background:rgba(158,158,158,0.2); color:#bdbdbd;"><i class="fas fa-sign-out-alt"></i> خروج سيرفر</span>';
        }
        if (action === 'player_play_channel') {
            return '<span class="severity-badge sev-success" style="border-color:#00e676; background:rgba(0,230,118,0.2); color:#69f0ae;"><i class="fas fa-play-circle"></i> بث مباشر</span>';
        }
        if (action === 'player_play_movie') {
            return '<span class="severity-badge sev-info" style="border-color:#e040fb; background:rgba(224,64,251,0.2); color:#ea80fc;"><i class="fas fa-film"></i> فيلم</span>';
        }
        if (action === 'player_play_series') {
            return '<span class="severity-badge sev-info" style="border-color:#ff9100; background:rgba(255,145,0,0.2); color:#ffab40;"><i class="fas fa-tv"></i> مسلسل</span>';
        }
        if (action === 'player_search') {
            return '<span class="severity-badge sev-info" style="border-color:#ba68c8; background:rgba(186,104,200,0.18); color:#e1bee7;"><i class="fas fa-search"></i> بحث مشغل</span>';
        }
        if (action === 'player_open') {
            return '<span class="severity-badge sev-info" style="border-color:#00b0ff; background:rgba(0,176,255,0.2); color:#80d8ff;"><i class="fas fa-play"></i> مشغل الميزو</span>';
        }
        if (action === 'player_browse_live') {
            return '<span class="severity-badge sev-info" style="border-color:#00e676; background:rgba(0,230,118,0.15); color:#b9f6ca;"><i class="fas fa-list-ol"></i> قنوات مباشر</span>';
        }
        if (action === 'player_browse_movies') {
            return '<span class="severity-badge sev-info" style="border-color:#ab47bc; background:rgba(171,71,188,0.15); color:#e1bee7;"><i class="fas fa-photo-video"></i> مكتبة أفلام</span>';
        }
        if (action === 'player_browse_series') {
            return '<span class="severity-badge sev-info" style="border-color:#ffa726; background:rgba(255,167,38,0.15); color:#ffe082;"><i class="fas fa-layer-group"></i> مكتبة مسلسلات</span>';
        }
        if (action === 'home_view') {
            return '<span class="severity-badge sev-info" style="border-color:#38bdf8; background:rgba(56,189,248,0.15); color:#7dd3fc;"><i class="fas fa-home"></i> الرئيسية</span>';
        }
        if (action === 'iptv_browse') {
            return '<span class="severity-badge sev-info" style="border-color:#29b6f6; background:rgba(41,182,246,0.15); color:#81d4fa;"><i class="fas fa-satellite-dish"></i> باقات IPTV</span>';
        }
        if (action === 'smart_browse') {
            return '<span class="severity-badge sev-info" style="border-color:#26a69a; background:rgba(38,166,154,0.15); color:#80cbc4;"><i class="fas fa-tv"></i> شاشات Smart</span>';
        }
        if (action === 'vip_browse') {
            return '<span class="severity-badge sev-warning" style="border-color:#ffd700; background:rgba(255,215,0,0.15); color:#ffe082;"><i class="fas fa-crown"></i> باقات VIP</span>';
        }
        if (action === 'app_download') {
            return '<span class="severity-badge sev-success" style="border-color:#00e676; background:rgba(0,230,118,0.2); color:#69f0ae;"><i class="fas fa-download"></i> تنزيل تطبيق</span>';
        }
        if (action === 'app_inapp_update') {
            return '<span class="severity-badge sev-info" style="border-color:#ff9100; background:rgba(255,145,0,0.25); color:#ffab40;"><i class="fas fa-sync-alt"></i> تحديث تطبيق</span>';
        }
        if (severity === 'success' || action === 'login_success' || action === 'registration' || action === 'staff_sale') {
            return '<span class="severity-badge sev-success"><i class="fas fa-check-circle"></i> دخول</span>';
        }
        return '<span class="severity-badge sev-info"><i class="fas fa-info-circle"></i> تصفح</span>';
    }

    function formatDetailsSummary(details, action, title) {
        if (!details) return '—';
        if (typeof details === 'string') {
            if (details.startsWith('{') && details.includes('page')) return '—';
            if (title && (title.includes(details) || details.includes(title))) return '—';
            return escapeHtml(details);
        }

        let parts = [];

        // بيانات تشغيل ومشاهدة القنوات والأفلام والمسلسلات
        if (details.channel) parts.push(`📺 القناة: <strong style="color:#69f0ae;">${escapeHtml(details.channel)}</strong>`);
        if (details.movie) parts.push(`🎬 الفيلم: <strong style="color:#ea80fc;">${escapeHtml(details.movie)}</strong>`);
        if (details.series) parts.push(`🍿 المسلسل: <strong style="color:#ffab40;">${escapeHtml(details.series)}</strong>`);
        if (details.server && (!title || !title.includes(details.server))) parts.push(`🛰️ السيرفر: <strong style="color:#80d8ff;">${escapeHtml(details.server)}</strong>`);
        if (details.username && (!title || !title.includes(details.username))) parts.push(`👤 الاشتراك: <code style="color:#b388ff; background:rgba(179,136,255,0.12); padding:1px 5px; border-radius:4px; font-weight:bold;">${escapeHtml(details.username)}</code>`);
        if (details.section) parts.push(`📑 القسم: <strong>${escapeHtml(details.section)}</strong>`);
        if (details.query) parts.push(`🔍 البحث: "<strong>${escapeHtml(details.query)}</strong>"`);
        if (details.expDate) parts.push(`📅 الانتهاء: ${escapeHtml(details.expDate)}`);

        // الحظر والتنبيهات
        if (details.formattedDuration && (!title || !title.includes(details.formattedDuration))) {
            parts.push(`⏳ مدة الحظر: <strong style="color:#ff5252;">${escapeHtml(details.formattedDuration)}</strong>`);
        }
        if (details.tier && action !== 'client_locked_out' && action !== 'lockout_attempt') {
            parts.push(`🪜 مستوى ${escapeHtml(String(details.tier))}`);
        }
        if (details.alert) parts.push(`<strong style="color:#ff5252;">${escapeHtml(details.alert)}</strong>`);
        if (details.attempts && !details.tier && (!title || !title.includes(`المحاولة ${details.attempts}`))) {
            parts.push(`🔢 المحاولة ${escapeHtml(String(details.attempts))}`);
        }

        // المنتجات والمشتريات
        if (details.product && (!title || !title.includes(details.product))) parts.push(`📦 <strong>${escapeHtml(details.product)}</strong>`);
        if (details.duration && !details.formattedDuration) parts.push(`⏳ ${escapeHtml(details.duration)}`);
        if (details.price) parts.push(`💰 ${escapeHtml(String(details.price))} د.ل`);
        if (details.amount) parts.push(`💸 ${escapeHtml(String(details.amount))} د.ل`);
        if (details.paymentMethod) parts.push(`💳 ${escapeHtml(details.paymentMethod)}`);
        if (details.customerName && (!title || !title.includes(details.customerName))) parts.push(`👤 العميل: ${escapeHtml(details.customerName)}`);
        if (details.newRole) parts.push(`🎖️ رتبة: ${escapeHtml(details.newRole)}`);
        if (details.oldName) parts.push(`سابقاً: ${escapeHtml(details.oldName)}`);

        if (details.reason && details.reason !== 'رفع يدوي من لوحة تحكم الرادار الأمني') {
            let rsn = details.reason;
            if (rsn.includes('تكرار إدخال كلمة سر خاطئة 3 مرات') || rsn.includes('Brute-Force')) {
                rsn = 'تخمين كلمة مرور (Brute-Force)';
            }
            if (title && typeof title === 'string') {
                if (title.includes('كلمة سر') && rsn.includes('كلمة سر')) rsn = '';
                if (title.includes('هاتف') && rsn.includes('هاتف')) rsn = '';
            }
            if (action !== 'client_locked_out' && action !== 'lockout_attempt' && rsn) {
                parts.push(`📝 ${escapeHtml(rsn)}`);
            }
        }
        if (details.message) parts.push(`${escapeHtml(details.message)}`);
        if (details.test) parts.push(`⚡ ${escapeHtml(details.test)}`);

        if (parts.length > 0) return parts.join(' | ');
        return '—';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =============================================
    // 7. نافذة التفاصيل المنبثقة (Full Details Modal)
    // =============================================
    window.openLogDetailsModal = function (logId) {
        const log = sourceLogs().find(l => l.id === logId) || allLogs.find(l => l.id === logId);
        if (!log) return;

        const modal = document.getElementById('logDetailsModal');
        const summaryEl = document.getElementById('modalLogSummary');

        const logMillis = getLogMillis(log);
        const timeFormatted = formatTime(logMillis);
        const dateFormatted = formatDate(logMillis);
        const hwFp = log.hardwareFingerprint || (log.device && log.device.hardwareFingerprint) || '';
        const cleanHwFp = hwFp ? hwFp.replace(/[^\w-]/g, '').trim() : '';
        const isHwBanned = cleanHwFp && cleanHwFp !== 'غير متوفر' && bannedDevicesSet.has(cleanHwFp);
        const userPhone = log.user && log.user.phone ? log.user.phone : '';

        const device = log.device || {};
        const ipAddress = log.publicIp || device.publicIp || '';
        const locationStr = [device.city, device.country].filter(Boolean).join(', ');
        const ispStr = device.isp || '';

        let lockoutControlHtml = '';
        if (cleanHwFp && cleanHwFp !== 'غير متوفر') {
            if (isHwBanned) {
                lockoutControlHtml = `
                    <div class="lockout-control-card" style="border-color:#ff1744; background:linear-gradient(135deg, rgba(255,23,68,0.22), rgba(0,0,0,0.55)); margin-bottom:14px;">
                        <div>
                            <div style="color:#ff5252; font-weight:800; font-size:0.98rem; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-ban fa-shake"></i> هذا الجهاز مسجل كجهاز محظور أمنياً نهائياً من دخول الموقع
                            </div>
                            <div style="font-size:0.82rem; color:#cfd8dc;">
                                بصمة الجهاز: <span style="color:#b388ff; font-family:monospace; font-weight:bold;">${escapeHtml(cleanHwFp)}</span>
                                ${userPhone ? ` | الهاتف: <span style="color:#69f0ae; font-family:monospace;">${escapeHtml(userPhone)}</span>` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn-lift-ban" style="padding:9px 18px; font-size:0.9rem;" onclick="liftLockoutAction(${jsArg(cleanHwFp)}, ${jsArg(userPhone)})">
                            <i class="fas fa-unlock-alt"></i> رفع الحظر فوراً
                        </button>
                    </div>
                `;
            } else {
                lockoutControlHtml = `
                    <div class="lockout-control-card" style="border-color:#7c4dff; background:linear-gradient(135deg, rgba(124,77,255,0.12), rgba(0,0,0,0.45)); margin-bottom:14px;">
                        <div>
                            <div style="color:#b388ff; font-weight:800; font-size:0.98rem; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-shield-alt"></i> إجراءات أمان الجهاز
                            </div>
                            <div style="font-size:0.82rem; color:#cfd8dc;">
                                بصمة الجهاز: <span style="color:#b388ff; font-family:monospace; font-weight:bold;">${escapeHtml(cleanHwFp)}</span>
                                ${userPhone ? ` | الهاتف: <span style="color:#69f0ae; font-family:monospace;">${escapeHtml(userPhone)}</span>` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn-ban-device" style="padding:9px 18px; font-size:0.9rem;" onclick="banDeviceAction(${jsArg(cleanHwFp)}, ${jsArg(log.user ? log.user.name : '')})">
                            <i class="fas fa-ban"></i> حظر هذا الجهاز نهائياً
                        </button>
                    </div>
                `;
            }
        }

        let detailsExtraHtml = '';
        if (log.details && (typeof log.details === 'object' ? Object.keys(log.details).length > 0 : String(log.details).trim())) {
            let innerText = '';
            if (typeof log.details === 'object') {
                const friendlyKeyMap = {
                    channel: '📺 اسم القناة',
                    movie: '🎬 اسم الفيلم',
                    series: '🍿 اسم المسلسل',
                    server: '🛰️ اسم السيرفر',
                    serverName: '🛰️ اسم السيرفر',
                    serverCode: '🔢 كود السيرفر',
                    username: '👤 اسم المستخدم / كود الاشتراك',
                    streamId: '🔢 معرّف البث (Stream ID)',
                    expDate: '📅 تاريخ انتهاء الاشتراك',
                    type: '🎯 نوع المحتوى',
                    section: '📑 القسم المفتوح',
                    page: '📄 اسم الصفحة',
                    mode: '⚙️ نمط التشغيل',
                    query: '🔍 كلمة البحث',
                    product: '📦 اسم المنتج / الخدمة',
                    productId: '🆔 معرّف المنتج',
                    name: '🏷️ الاسم',
                    price: '💰 السعر',
                    amount: '💸 المبلغ',
                    duration: '⏳ المدة',
                    paymentMethod: '💳 طريقة الدفع',
                    customerName: '👤 اسم العميل',
                    customerId: '🆔 معرّف العميل',
                    phone: '📞 رقم الهاتف',
                    newRole: '🎖️ الرتبة المحددة',
                    oldName: '📝 الاسم السابق',
                    appName: '📱 اسم التطبيق',
                    platform: '💻 المنصة',
                    reason: '⚠️ السبب المسجل',
                    attempts: '🔢 عدد المحاولات',
                    formattedDuration: '⏳ مدة الحظر المؤقت',
                    tier: '🪜 مستوى الحظر',
                    alert: '🚨 نوع التنبيه',
                    cardKey: '🔑 مفتاح البطاقة',
                    enabled: '🔘 الحالة',
                    portal: '🌐 البوابة'
                };
                innerText = Object.entries(log.details).map(([k, v]) => {
                    const label = friendlyKeyMap[k] || k;
                    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return `<div style="margin-bottom:5px;"><strong style="color:#b388ff;">${escapeHtml(label)}:</strong> <span style="color:#cfd8dc; font-weight:600;">${escapeHtml(val)}</span></div>`;
                }).join('');
            } else {
                innerText = escapeHtml(String(log.details));
            }
            detailsExtraHtml = `
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px 14px; margin-top:12px;">
                    <div style="color:#ffb74d; font-weight:bold; font-size:0.9rem; margin-bottom:8px;"><i class="fas fa-info-circle"></i> تفاصيل إضافية للحركة:</div>
                    <div style="font-size:0.85rem; line-height:1.7;">${innerText}</div>
                </div>
            `;
        }

        summaryEl.innerHTML = `
            ${lockoutControlHtml}
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:16px; border-radius:8px; margin-bottom:12px; line-height:1.9;">
                <p><strong>العنوان:</strong> ${escapeHtml(log.title || log.action)}</p>
                <p><strong>الفاعل:</strong> ${escapeHtml(log.user ? log.user.name : 'زائر')} (${escapeHtml(log.user && log.user.role ? log.user.role : 'visitor')})</p>
                <p><strong>الهاتف:</strong> ${log.user && log.user.phone ? escapeHtml(log.user.phone) : 'غير متوفر'}</p>
                <p><strong>التوقيت:</strong> ${dateFormatted} - ${timeFormatted}</p>
                <p><strong>عنوان IP العام (Public IP):</strong> <span style="color:#4fc3f7; font-family:monospace; font-weight:bold; font-size:1.05rem;">${escapeHtml(ipAddress)}</span> ${locationStr ? `<span style="color:var(--text-secondary);">(${escapeHtml(locationStr)}${ispStr ? ` - ${escapeHtml(ispStr)}` : ''})</span>` : ''}</p>
                <p><strong>بصمة الجهاز الرقمية والعتادية (Hardware ID):</strong> <span style="color:#b388ff; font-family:monospace; font-weight:bold;">${escapeHtml(cleanHwFp || hwFp)}</span></p>
                <p><strong>الصفحة:</strong> ${escapeHtml(log.page || '—')}</p>
                <p><strong>الجهاز والمتصفح:</strong> ${escapeHtml(log.device ? `${log.device.os} - ${log.device.browser} (${log.device.type})` : '—')}</p>
                ${detailsExtraHtml}
            </div>
        `;

        if (modal) modal.style.display = 'flex';
    };

    /**
     * تنفيذ حظر جهاز نهائياً ببصمته من قبل المدير
     */
    window.banDeviceAction = async function (hw, userName) {
        if (!hw || hw === 'غير متوفر') {
            if (typeof showToast === 'function') showToast('⚠️ لا يمكن تحديد بصمة الجهاز لهذا السجل', 'error');
            return;
        }

        const cleanHw = hw.replace(/[^\w-]/g, '').trim();

        // حماية المدير من حظر جهازه الحالي بالخطأ
        const currentHw = (typeof getHardwareFingerprint === 'function') ? getHardwareFingerprint() : '';
        if (currentHw && currentHw === cleanHw) {
            const selfConfirm = await showConfirm(
                '⚠️ تحذير أمني شديد الخطورة:\nبصمة هذا الجهاز تطابق بصمة جهازك الحالي الذي تستخدمه الآن!\nحظر جهازك سيؤدي فوراً لمنعك من دخول الموقع بالكامل.\n\nهل أنت متأكد تماماً من رغبتك في حظر جهازك الشخصي؟',
                { title: 'تحذير: حظر جهاز المدير' }
            );
            if (!selfConfirm) return;
        }

        const userLabel = userName ? ` للمستخدم (${userName})` : '';
        const confirmed = await showConfirm(
            `هل أنت متأكد من حظر هذا الجهاز نهائياً من دخول الموقع؟\n\nالبصمة: (${cleanHw})${userLabel}\n\n⚠️ هذا الحظر دائم ومخصص لبصمة الجهاز ولن يتمكن صاحبه من فتح أي صفحة في الموقع حتى تقوم برفع الحظر عنه بنفسك.`,
            { title: 'تأكيد حظر الجهاز نهائياً' }
        );
        if (!confirmed) return;

        try {
            if (typeof adminBanDevice !== 'function') throw new Error('دالة حظر الجهاز غير محمّلة');
            await adminBanDevice(cleanHw, 'حظر إداري دائم بقرار من المدير العام');

            bannedDevicesSet.add(cleanHw);
            renderLogsTable();

            if (typeof showToast === 'function') {
                showToast(`⛔ تم حظر الجهاز (${cleanHw}) نهائياً بنجاح ومنعه من الموقع`, 'success', 5000);
            }

            const modal = document.getElementById('logDetailsModal');
            if (modal) modal.style.display = 'none';
        } catch (err) {
            console.error('فشل حظر الجهاز:', err);
            if (typeof showToast === 'function') {
                showToast('❌ تعذر تنفيذ الحظر: ' + (err.message || 'خطأ غير معروف'), 'error', 6000);
            }
        }
    };

    /**
     * تنفيذ رفع الحظر الأمني عن جهاز من قبل المدير
     */
    window.liftLockoutAction = async function (hw, phone) {
        if (!hw || hw === 'غير متوفر') {
            if (typeof showToast === 'function') showToast('⚠️ لا يمكن تحديد بصمة الجهاز لهذا السجل', 'error');
            return;
        }

        const cleanHw = hw.replace(/[^\w-]/g, '').trim();

        const phoneLabel = phone ? ` ورقم الهاتف (${phone})` : '';
        const confirmed = await showConfirm(
            `هل أنت متأكد من رفع الحظر الأمني عن الجهاز:\n(${cleanHw})${phoneLabel}\n\nسيعود الجهاز قادراً على فتح الموقع واستخدامه فوراً.`,
            { title: 'تأكيد رفع الحظر عن الجهاز' }
        );
        if (!confirmed) return;

        try {
            if (typeof adminLiftDeviceLockout !== 'function') throw new Error('دالة رفع الحظر غير محمّلة');
            await adminLiftDeviceLockout(cleanHw, phone || '');

            bannedDevicesSet.delete(cleanHw);
            renderLogsTable();

            if (typeof showToast === 'function') {
                showToast(`✅ تم رفع الحظر الأمني عن الجهاز (${cleanHw}) بنجاح`, 'success', 5000);
            }
            const modal = document.getElementById('logDetailsModal');
            if (modal) modal.style.display = 'none';
        } catch (err) {
            console.error('فشل رفع الحظر:', err);
            if (typeof showToast === 'function') {
                showToast('❌ لم يُرفع الحظر: ' + (err && err.message ? err.message : 'خطأ غير معروف'), 'error', 7000);
            }
        }
    };

    function closeLogDetailsModal() {
        const modal = document.getElementById('logDetailsModal');
        if (modal) modal.style.display = 'none';
    }

    // =============================================
    // 8. تجربة تسجيل حركة حية فورية
    // =============================================
    async function triggerTestLogEvent() {
        const btn = document.getElementById('btnTestLog');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        }

        try {
            if (typeof logActivity === 'function') {
                await logActivity({
                    action: 'admin_test_ping',
                    category: 'admin',
                    severity: 'success',
                    title: '🛰️ فحص أمني للرادار',
                    details: { test: 'فحص الاتصال اللحظي', time: new Date().toLocaleTimeString('ar-LY') }
                });
                currentPage = 1;
                renderLogsTable();
                if (typeof showToast === 'function') {
                    showToast('✅ تم إرسال الحركة التجريبية بنجاح. راقب ظهورها فوراً بأعلى الجدول ⚡', 'success');
                }
            }
        } catch (e) {
            console.error('Error sending test log:', e);
            if (typeof showToast === 'function') {
                showToast('❌ فشل إرسال الحركة: ' + e.message, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }
    // 9. تصدير السجل بصيغة CSV / Excel
    // =============================================
    function exportLogsToCsv() {
        // يُصدَّر ما يعرضه الجدول بالفلاتر والتاريخ والبحث الحالية، لا آخر 500 حركة كيفما كانت
        const rows = getFilteredLogs();
        if (!rows || rows.length === 0) {
            showToast('لا توجد سجلات لتصديرها حالياً', 'info');
            return;
        }

        const headers = ['التاريخ', 'الوقت', 'الاسم', 'رقم الهاتف', 'الرتبة', 'عنوان IP العام', 'الموقع ومزود الخدمة', 'بصمة الجهاز (Hardware ID)', 'عنوان الحركة', 'نوع الحركة', 'مستوى الخطورة', 'التفاصيل'];

        let csvContent = "\uFEFF" + headers.join(',') + "\n";

        rows.forEach(log => {
            const logMillis = getLogMillis(log);
            const dateStr = formatDate(logMillis);
            const timeStr = formatTime(logMillis);
            const userName = (log.user && log.user.name) ? log.user.name : 'زائر مجهول';
            const userPhone = (log.user && log.user.phone) ? log.user.phone : '';
            const role = (log.user && log.user.role) ? log.user.role : 'visitor';
            const ip = log.publicIp || (log.device && log.device.publicIp) || '';
            const location = [(log.device && log.device.city), (log.device && log.device.country)].filter(Boolean).join(' - ');
            const hw = log.hardwareFingerprint || (log.device && log.device.hardwareFingerprint) || '';
            const title = log.title || log.action || '';
            const action = log.action || '';
            const severity = log.severity || 'info';

            let detailsStr = '';
            if (typeof log.details === 'object') {
                try { detailsStr = JSON.stringify(log.details); } catch(e){}
            } else if (log.details) {
                detailsStr = String(log.details);
            }

            const row = [
                dateStr, timeStr, userName, userPhone, role, ip, location, hw, title, action, severity, detailsStr
            ].map(val => {
                let v = String(val);
                // حقن الصيغ: اسم أو هاتف يبدأ بـ = + - @ يُنفَّذ صيغةً عند فتح الملف في Excel
                if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
                return '"' + v.replace(/"/g, '""') + '"';
            });

            csvContent += row.join(',') + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `security_logs_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_export_logs',
                category: 'admin',
                severity: 'warning',
                title: `تصدير سجل الحركات الأمنية إلى Excel (${rows.length} سجل)`,
                details: { exportedCount: rows.length }
            });
        }
    }

    // =============================================
    // 10. تنظيف السجلات
    // =============================================
    async function clearOldLogs() {
        const isConfirmed = await showConfirm('هل أنت متأكد من حذف جميع السجلات بالكامل من قاعدة البيانات؟\nهذا الإجراء نهائي ولا يمكن التراجع عنه.');
        if (!isConfirmed) return;

        try {
            let totalDeleted = 0;
            async function deleteBatch() {
                const snapshot = await db.collection('activity_logs').limit(500).get();
                if (snapshot.empty) {
                    return totalDeleted;
                }
                const batch = db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                totalDeleted += snapshot.size;
                if (snapshot.size === 500) {
                    return await deleteBatch();
                }
                return totalDeleted;
            }

            totalDeleted = await deleteBatch();

            if (totalDeleted === 0) {
                showToast('لا توجد سجلات لحذفها.', 'info');
                return;
            }

            showToast(`تم مسح ${totalDeleted} سجل بنجاح 🧹`, 'success');

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_clear_logs',
                    category: 'admin',
                    severity: 'warning',
                    title: `تنظيف وحذف جميع السجلات (${totalDeleted} سجل)`,
                    details: { deletedCount: totalDeleted }
                });
            }
        } catch (err) {
            console.error('Error clearing logs:', err);
            showToast('حدث خطأ أثناء تنظيف السجلات: ' + err.message, 'error');
        }
    }
    async function autoCleanupOldLogs() {
        // التنظيف انتقل إلى السيرفر: دالة cleanupActivityLogs تعمل كل ليلة وتحتفظ بـ60 يوماً،
        // فلم يعد يعتمد على فتح المدير للصفحة، ولم تعد الأدلة تُحذف بعد أسبوع.
        return;
    }

    // =============================================
    // 11. إعداد الأحداث والتحكم
    // =============================================
    /**
     * تحديث فوري مباشر للرادار وسجل الحركات مع إجبار جلب من السيرفر وإلغاء الكاش
     */
    async function handleManualRefreshFeed() {
        if (isRefreshingFeed) return;
        isRefreshingFeed = true;

        const btn = document.getElementById('btnRefreshFeed');
        const icon = document.getElementById('refreshFeedIcon') || (btn ? btn.querySelector('i') : null);
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');

        try {
            // 1. إذا كان المدير يتصفح يوماً محدداً من التقويم
            if (!isTodaySelected() && currentSelectedDate) {
                delete dayLogsCache[currentSelectedDate];
                await loadSelectedDay();
            } else {
                // 2. تحديث البث المباشر لليوم: جلب فوري من السيرفر لكسر أي كاش محلي
                if (typeof db !== 'undefined' && db) {
                    try {
                        const snap = await db.collection('activity_logs')
                            .orderBy('timestamp', 'desc')
                            .limit(LIVE_LOGS_LIMIT)
                            .get({ source: 'server' })
                            .catch(() => db.collection('activity_logs').orderBy('timestamp', 'desc').limit(LIVE_LOGS_LIMIT).get());

                        if (snap && !snap.empty) {
                            allLogs = [];
                            snap.forEach(doc => {
                                allLogs.push({ id: doc.id, ...doc.data() });
                            });
                            allLogs.sort((a, b) => getLogMillis(b) - getLogMillis(a));
                        }
                    } catch (e) {
                        console.warn('⚠️ Server force-fetch error:', e);
                    }
                }

                // إعادة تفعيل المستمع اللحظي للسجلات وقائمة الحظر
                startRealtimeLogsFeed();
                startLockoutsFeed();
                updateKpiMetrics();
            }

            currentPage = 1;
            renderLogsTable();

            // تحديث وقت المزامنة فوراً
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const lastSyncEl = document.getElementById('lastSyncTime');
            if (lastSyncEl) lastSyncEl.innerText = timeStr;

            if (typeof showToast === 'function') {
                showToast('✅ تم تحديث الرادار وسجل الحركات بنجاح 🔄', 'success', 2500);
            }
        } catch (err) {
            console.error('Error during manual feed refresh:', err);
            if (typeof showToast === 'function') {
                showToast('⚠️ تعذر تحديث السجلات: ' + (err.message || 'خطأ غير معروف'), 'error', 4000);
            }
        } finally {
            if (icon) icon.classList.remove('fa-spin');
            if (btn) btn.disabled = false;
            setTimeout(() => { isRefreshingFeed = false; }, 400);
        }
    }

    function setupEventListeners() {
        // تبويبات الفلاتر
        document.querySelectorAll('.soc-tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilterCategory = this.dataset.filter || 'all';
                currentPage = 1;
                renderLogsTable();
            });
        });

        // البحث النصي
        const searchInput = document.getElementById('logSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                currentSearchQuery = this.value.trim();
                currentPage = 1;
                renderLogsTable();
            });
        }

        // زر التحديث اللحظي المطور
        const btnRefresh = document.getElementById('btnRefreshFeed');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', handleManualRefreshFeed);
        }

        // أزرار الترقيم السريع لجدول الرصد اللحظي
        const btnFirst = document.getElementById('btnFirstPage');
        if (btnFirst) btnFirst.addEventListener('click', () => { currentPage = 1; renderLogsTable(); });

        const btnPrev = document.getElementById('btnPrevPage');
        if (btnPrev) btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderLogsTable();
                const tbl = document.getElementById('socTable');
                if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        const btnNext = document.getElementById('btnNextPage');
        if (btnNext) btnNext.addEventListener('click', () => {
            const filtered = getFilteredLogs();
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            if (currentPage < totalPages) {
                currentPage++;
                renderLogsTable();
                const tbl = document.getElementById('socTable');
                if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        const btnLast = document.getElementById('btnLastPage');
        if (btnLast) btnLast.addEventListener('click', () => {
            const filtered = getFilteredLogs();
            currentPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            renderLogsTable();
        });

        // زر إرسال حركة تجريبية
        const btnTest = document.getElementById('btnTestLog');
        if (btnTest) {
            btnTest.addEventListener('click', triggerTestLogEvent);
        }

        // زر التصدير
        const btnExport = document.getElementById('btnExportCsv');
        if (btnExport) {
            btnExport.addEventListener('click', exportLogsToCsv);
        }

        // زر تنظيف السجلات
        const btnClear = document.getElementById('btnClearLogs');
        if (btnClear) {
            btnClear.addEventListener('click', clearOldLogs);
        }

        // إغلاق النافذة المنبثقة
        const closeBtn1 = document.getElementById('closeDetailsModalBtn');
        if (closeBtn1) closeBtn1.addEventListener('click', closeLogDetailsModal);
    }

    // =============================================
    // 12. إعداد Flatpickr لاختيار التاريخ
    // =============================================
    function setupDatePicker() {
        const dateInput = document.getElementById('socDatePicker');
        if (dateInput && typeof flatpickr !== 'undefined') {
            flatpickr(dateInput, {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d/m/Y",
                allowInput: true,
                disableMobile: true,
                locale: "ar",
                onChange: function (selectedDates, dateStr) {
                    currentSelectedDate = dateStr || null;
                    currentPage = 1;
                    renderLogsTable();
                    loadSelectedDay();
                }
            });
        }
    }
})();
