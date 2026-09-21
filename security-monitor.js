// =============================================
// غرفة المراقبة والأمان - AlMeZ0 SOC Dashboard
// منطق الرصد اللحظي، الفلترة، تحليل التهديدات، وتصدير التقارير
// متوافق بالكامل مع الهواتف الذكية والحواسيب
// =============================================

(function () {
    const ADMIN_TARGET_UID = '7Rfvdr6GpwPcY9uDQwX0fIuWeRv1';

    let allLogs = [];
    let currentFilterCategory = 'all';
    let currentSearchQuery = '';
    let currentSelectedDate = null;
    let logsUnsubscribe = null;
    // سجلات يوم محدد من التقويم: البث الحي يحمل آخر 500 حركة فقط، فكان اختيار يوم سابق
    // يعرض "لا توجد حركات" رغم وجودها. يُجلب اليوم المختار باستعلام مستقل عند الطلب.
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
        autoCleanupOldLogs();
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

        // استماع فوري لأحدث 500 سجل فقط لضمان سرعة الصفحة وعدم وجود تكلفة
        const logsRef = db.collection('activity_logs').orderBy('timestamp', 'desc').limit(500);

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

            // تحديث الإحصائيات ورسم الجدول
            updateKpiMetrics();
            renderLogsTable();
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
                .limit(1000)
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
            const logDate = new Date(getLogMillis(log));
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
            return;
        }

        const filtered = getFilteredLogs();

        // تحديث شارة العدد
        const badgeEl = document.getElementById('visibleLogsBadge');
        if (badgeEl) badgeEl.innerText = `${filtered.length} حركة`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 45px 20px; color:var(--text-secondary);">
                        <i class="fas fa-inbox fa-3x" style="opacity:0.3; margin-bottom:10px;"></i>
                        <p style="font-size:1.05rem;">لا توجد حركات تطابق معايير البحث والفلترة المحددة</p>
                        <p style="font-size:0.85rem; color:#7c4dff; margin-top:8px;">اضغط على زر "تجربة تسجيل حركة حية" بالأعلى لاختبار التسجيل فوراً</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach((log) => {
            const logMillis = getLogMillis(log);
            const dateFormatted = formatDate(logMillis);
            const timeFormatted = formatTime(logMillis);
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

            // رتبة المستخدم
            const role = (log.user && log.user.role) ? log.user.role : 'visitor';
            const roleLabel = getRoleBadge(role);
            const userName = (log.user && log.user.name) ? log.user.name : 'زائر مجهول';
            const userPhone = (log.user && log.user.phone) ? log.user.phone : '';

            // شارة مستوى الخطورة / النشاط
            const sevBadge = getSeverityBadge(log.severity, log.action);

            // تفاصيل الجهاز والـ IP وبصمة العتاد
            const device = log.device || {};
            const deviceTypeIcon = (device.type && device.type.includes('هاتف')) ? 'fa-mobile-alt' : ((device.type && device.type.includes('لوحي')) ? 'fa-tablet-alt' : 'fa-desktop');
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
                            ${(log.action === 'client_locked_out' || log.action === 'lockout_attempt' || (log.details && log.details.tier)) && hwFp ? `
                                <button type="button" class="btn-lift-ban" onclick="liftLockoutAction(${jsArg(hwFp)}, ${jsArg(userPhone || '')})" title="رفع الحظر الأمني عن هذا الجهاز فوراً">
                                    <i class="fas fa-unlock-alt"></i> رفع الحظر
                                </button>
                            ` : ''}
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
        if (action === 'player_server_logout') {
            return '<span class="severity-badge sev-info" style="border-color:#9e9e9e; background:rgba(158,158,158,0.2); color:#bdbdbd;"><i class="fas fa-sign-out-alt"></i> خروج سيرفر</span>';
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
        if (details.product) parts.push(`📦 <strong>${escapeHtml(details.product)}</strong>`);
        if (details.duration && !details.formattedDuration) parts.push(`⏳ ${escapeHtml(details.duration)}`);
        if (details.price) parts.push(`💰 ${escapeHtml(String(details.price))} د.ل`);
        if (details.amount) parts.push(`💸 ${escapeHtml(String(details.amount))} د.ل`);
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

        const isLockoutLog = log.action === 'client_locked_out' || log.action === 'lockout_attempt' || (log.details && log.details.tier);
        const userPhone = log.user && log.user.phone ? log.user.phone : '';

        const device = log.device || {};
        const ipAddress = log.publicIp || device.publicIp || '';
        const locationStr = [device.city, device.country].filter(Boolean).join(', ');
        const ispStr = device.isp || '';
        const hwFp = log.hardwareFingerprint || device.hardwareFingerprint || 'غير متوفر';

        let lockoutControlHtml = '';
        if (isLockoutLog && hwFp && hwFp !== 'غير متوفر') {
            lockoutControlHtml = `
                <div class="lockout-control-card">
                    <div>
                        <div style="color:#ff5252; font-weight:800; font-size:0.98rem; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-user-lock fa-shake"></i> هذا الجهاز مسجل كجهاز محظور أمنياً
                        </div>
                        <div style="font-size:0.82rem; color:#cfd8dc;">
                            بصمة الجهاز: <span style="color:#b388ff; font-family:monospace; font-weight:bold;">${escapeHtml(hwFp)}</span>
                            ${userPhone ? ` | الهاتف: <span style="color:#69f0ae; font-family:monospace;">${escapeHtml(userPhone)}</span>` : ''}
                        </div>
                    </div>
                    <button type="button" class="btn-lift-ban" style="padding:9px 18px; font-size:0.9rem;" onclick="liftLockoutAction(${jsArg(hwFp)}, ${jsArg(userPhone)})">
                        <i class="fas fa-unlock-alt"></i> رفع الحظر فوراً
                    </button>
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
                <p><strong>بصمة الجهاز الرقمية والعتادية (Hardware ID):</strong> <span style="color:#b388ff; font-family:monospace; font-weight:bold;">${escapeHtml(hwFp)}</span></p>
                <p><strong>الصفحة:</strong> ${escapeHtml(log.page || '—')}</p>
                <p><strong>الجهاز والمتصفح:</strong> ${escapeHtml(log.device ? `${log.device.os} - ${log.device.browser} (${log.device.type})` : '—')}</p>
            </div>
        `;

        if (modal) modal.style.display = 'flex';
    };

    /**
     * تنفيذ رفع الحظر الأمني عن جهاز أو رقم من قبل المدير
     */
    window.liftLockoutAction = async function (hw, phone) {
        if (!hw || hw === 'غير متوفر') {
            if (typeof showToast === 'function') showToast('⚠️ لا يمكن تحديد بصمة الجهاز لهذا السجل', 'error');
            return;
        }

        const phoneLabel = phone ? ` ورقم الهاتف (${phone})` : '';
        let confirmed = true;
        if (typeof showConfirm === 'function') {
            confirmed = await showConfirm(`هل أنت متأكد من رفع الحظر الأمني عن الجهاز (${hw})${phoneLabel} فوراً؟`);
        } else {
            confirmed = confirm(`هل أنت متأكد من رفع الحظر الأمني عن الجهاز (${hw})${phoneLabel} فوراً؟`);
        }
        if (!confirmed) return;

        try {
            // رفع الحظر فعلياً = الكتابة في السحابة، فالجهاز المحظور يقرأ حالته منها.
            // (تصفير التخزين المحلي هنا كان يمسّ متصفح المدير نفسه لا الجهاز المحظور.)
            if (typeof adminLiftDeviceLockout !== 'function') throw new Error('دالة رفع الحظر غير محمّلة');
            await adminLiftDeviceLockout(hw, phone);

            if (typeof showToast === 'function') {
                showToast(`✅ تم رفع الحظر الأمني عن الجهاز (${hw}) بنجاح`, 'success', 5000);
            }
            const modal = document.getElementById('logDetailsModal');
            if (modal) modal.style.display = 'none';
        } catch (err) {
            // كان يُعرض هنا "✅ تم فك الحظر" والجهاز ما زال محظوراً فعلاً في السحابة
            console.error('فشل رفع الحظر:', err);
            if (typeof showToast === 'function') {
                showToast('❌ لم يُرفع الحظر: ' + (err && err.message ? err.message : 'خطأ غير معروف') + ' — الجهاز ما زال محظوراً، حاول مجدداً.', 'error', 7000);
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
                if (typeof showToast === 'function') {
                    showToast('✅ تم إرسال الحركة التجريبية بنجاح. راقب ظهورها في الجدول الآن.', 'success');
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
        try {
            const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            // دفعات من 400: فايربيز يرفض أي دفعة فوق 500 عملية، فكان وجود أكثر من 500 سجل
            // قديم يُفشل التنظيف كله في كل مرة بصمت، وتتراكم السجلات بلا نهاية.
            let removed = 0;
            for (let round = 0; round < 50; round++) {
                const snapshot = await db.collection('activity_logs').where('timestamp', '<', sevenDaysAgo).limit(400).get();
                if (snapshot.empty) break;
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                removed += snapshot.size;
                if (snapshot.size < 400) break;
            }
            if (removed) console.log(`Auto-cleanup: Removed ${removed} old logs.`);
        } catch (err) {
            console.error('Error auto-clearing old logs:', err);
        }
    }

    // =============================================
    // 11. إعداد الأحداث والتحكم
    // =============================================
    function setupEventListeners() {
        // تبويبات الفلاتر
        document.querySelectorAll('.soc-tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilterCategory = this.dataset.filter || 'all';
                renderLogsTable();
            });
        });

        // البحث النصي
        const searchInput = document.getElementById('logSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                currentSearchQuery = this.value.trim();
                renderLogsTable();
            });
        }

        // زر التحديث اللحظي
        const btnRefresh = document.getElementById('btnRefreshFeed');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', function () {
                startRealtimeLogsFeed();
                showToast('تم تحديث تدفق السجلات مباشرة 🔄', 'info', 1500);
            });
        }

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
                    renderLogsTable();
                    loadSelectedDay();
                }
            });
        }
    }
})();
