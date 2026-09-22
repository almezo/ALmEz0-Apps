// =============================================
// منطق لوحة تقارير المدير (Admin Dashboard)
// =============================================

/**
 * تهريب النصوص قبل وضعها في الصفحة. بيانات العمليات يكتبها المناديب (وكان أي عميل مسجّل يستطيع
 * إنشاء عملية قبل تشديد القواعد)، فاسم منتج أو سبب سحب فيه وسم HTML كان يُنفَّذ داخل لوحة المدير
 * بصلاحيات المدير. escRecordForHtml نسخة للعرض فقط: النصوص مُهرَّبة، والأرقام والتواريخ كما هي.
 */
function escH(v) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * مجاميع عمليات مندوب واحد (مبيعات وسحوبات لكل محفظة). منقولة حرفياً من حساب البطاقات حتى
 * يستعملها العرض و"إقفال الحساب" بنفس المنطق تماماً: الرصيد = الرصيد الأساسي + هذه المجاميع.
 * include(tData) يحدد العمليات الداخلة (بعد آخر إقفال للعرض، أو حتى لحظة الإقفال للإقفال).
 */
function computeStaffLedgerSums(staffId, staffName, isIbrahim, docs, include) {
    let libyanaSales = 0, libyanaWithdrawals = 0;
    let almadarSales = 0, almadarWithdrawals = 0;
    let cashSales = 0, cashWithdrawals = 0;

    docs.forEach(tDoc => {
        const tData = tDoc.data();
        if (!include(tData)) return;

        // العمليات كمستلم (Taker)
        if (tData.type === 'sale') {
            const p = parseFloat(tData.price) || 0;

            // ليبيانا: تذهب لمحفظة المندوب المستلم للرصيد (أو للمندوب البائع كدعم رجعي إذا لم يحدد)
            if (tData.method === 'ليبيانا') {
                const libyanaRecipientId = tData.creditRecipientId || tData.staffId;
                if (libyanaRecipientId === staffId) {
                    libyanaSales += p;
                }
            } else if (tData.method === 'المدار') {
                // المدار: تذهب لمحفظة المندوب المستلم للرصيد (أو للمندوب البائع كدعم رجعي إذا لم يحدد)
                const almadarRecipientId = tData.creditRecipientId || tData.staffId;
                if (almadarRecipientId === staffId) {
                    almadarSales += p;
                }
            } else if (tData.method === 'دفع مشترك (ليبيانا + مدار)' && tData.splitDetails) {
                // دفع مشترك: توزيع كل جزء على المستلم المحدد له
                if (tData.splitDetails.libyanaRecipientId === staffId) {
                    libyanaSales += parseFloat(tData.splitDetails.libyanaAmount) || 0;
                }
                if (tData.splitDetails.almadarRecipientId === staffId) {
                    almadarSales += parseFloat(tData.splitDetails.almadarAmount) || 0;
                }
            } else if (tData.staffId === staffId) {
                // كاش ودين: تذهب دائماً للمندوب الذي قام بالبيعة
                if (tData.method === 'كاش' || tData.method === 'دين') {
                    cashSales += p;
                }
            }
        } else if (tData.type === 'withdrawal') {
            if (tData.staffId === staffId) {
                const amt = parseFloat(tData.amount) || 0;
                if (tData.wallet === 'ليبيانا') libyanaWithdrawals += amt;
                if (tData.wallet === 'المدار') almadarWithdrawals += amt;
                if (tData.wallet === 'كاش') cashWithdrawals += amt;
            }
        } else if (tData.type === 'debt_transfer') {
            if (tData.staffId === staffId) {
                // للمندوب ابراهيم فقط: سحب الرصيد من مندوب آخر لا يضاف في مطلوب كاش ولا يخصم من صافي الربح
                if (!isIbrahim) {
                    const amt = parseFloat(tData.amount) || 0;
                    if (tData.wallet === 'ليبيانا') cashSales += amt;
                    if (tData.wallet === 'المدار') cashSales += amt;
                }
            }
        }

        // العمليات كمعطي (Giver)
        if (tData.debtor === staffName || (tData.debtor && (tData.debtor.includes(staffName) || staffName.includes(tData.debtor)))) {
            if (tData.type === 'debt_transfer') {
                const origCredit = parseFloat(tData.originalCredit) || 0;
                if (tData.wallet === 'ليبيانا') libyanaWithdrawals += origCredit;
                if (tData.wallet === 'المدار') almadarWithdrawals += origCredit;
            }
        }
    });

    // حسابات خاصة بمندوب ابراهيم (حساب المصرفي / سداد / USDT) من مبيعات وسحوبات المناديب
    let bankSales = 0, sadadSales = 0, usdtSales = 0;
    let bankWithdrawals = 0, sadadWithdrawals = 0, usdtWithdrawals = 0;
    if (isIbrahim) {
        docs.forEach(tDoc => {
            const tData = tDoc.data();
            if (!include(tData)) return;
            if (tData.type === 'sale') {
                const p = parseFloat(tData.price) || 0;
                const m = (tData.method || '').trim();
                if (m === 'تحويلات مصرفية' || m.includes('مصرف')) {
                    bankSales += p;
                } else if (m === 'سداد' || m.includes('سداد')) {
                    sadadSales += p;
                } else if (m.toUpperCase() === 'USDT' || m.toUpperCase().includes('USDT')) {
                    usdtSales += p;
                }
            } else if (tData.type === 'withdrawal' || tData.type === 'debt_transfer') {
                const isIbrTrans = (tData.staffId === staffId) || (tData.debtor && (tData.debtor.includes('ابراهيم') || staffName.includes(tData.debtor)));
                if (isIbrTrans) {
                    const amt = parseFloat(tData.amount) || 0;
                    const w = (tData.wallet || '').trim();
                    if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) {
                        bankWithdrawals += amt;
                    } else if (w === 'سداد' || w.includes('سداد')) {
                        sadadWithdrawals += amt;
                    } else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) {
                        usdtWithdrawals += amt;
                    }
                }
            }
        });
    }


    return {
        libyanaSales, libyanaWithdrawals, almadarSales, almadarWithdrawals, cashSales, cashWithdrawals,
        bankSales, sadadSales, usdtSales, bankWithdrawals, sadadWithdrawals, usdtWithdrawals
    };
}

function escRecordForHtml(d) {
    if (!d || typeof d !== 'object') return d;
    const out = {};
    Object.keys(d).forEach(function (k) {
        const v = d[k];
        if (typeof v === 'string') out[k] = escH(v);
        else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.toDate !== 'function') out[k] = escRecordForHtml(v);
        else out[k] = v;
    });
    return out;
}

document.addEventListener('DOMContentLoaded', () => {
    const adminMainContent = document.getElementById('adminMainContent');

    // ضع المتغيرين هنا ليكونوا متاحين لكل الدوال في الصفحة
    let productsLoaded = false;
    let pendingMasterHistory = false;

    // 1. حماية الصفحة والتحقق من الصلاحيات (المدير فقط)
    auth.onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser) {
            window.location.replace('index.html');
            return;
        }

        let isAdmin = (firebaseUser.uid === ADMIN_UID);
        if (!isAdmin) {
            try {
                const adminDoc = await db.collection('admins').doc(firebaseUser.uid).get();
                isAdmin = adminDoc.exists;
            } catch (e) { isAdmin = false; }
        }

        if (!isAdmin) {
            // ليس المدير، إعادة توجيه
            window.location.replace('index.html');
            return;
        }

        // إظهار المحتوى للمدير
        adminMainContent.style.display = 'block';

        // بدء العمليات المباشرة
        initStaffBalancesRealtime();
    });

    // =============================================
    // جلب المنتجات لتصنيفها
    // =============================================
    function fetchProducts() {
        db.collection('products').orderBy('sortOrder', 'asc').onSnapshot((snapshot) => {
            window.productsCategoryMap = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                window.productsCategoryMap[data.name] = data.category;
            });
            productsLoaded = true;
            if (pendingMasterHistory) {
                pendingMasterHistory = false;
                if (window.fetchMasterHistory) window.fetchMasterHistory();
            }
        }, err => {
            console.error('Error fetching products:', err);
        });
    }

    // استدعاء جلب المنتجات
    fetchProducts();

    function calculateTotalCommission(productName, duration) {
        if (typeof window.calculateTotalCommission === 'function' && window.calculateTotalCommission !== calculateTotalCommission) {
            return window.calculateTotalCommission(productName, duration);
        }
        return 0;
    }

    // =============================================
    // جلب وحساب أرصدة المناديب بشكل حي وتلقائي
    // =============================================
    let staffDocs = [];
    let transactionsDocs = [];
    let staffBalancesUnsubscribe = null;
    let transactionsUnsubscribe = null;

    // =============================================
    // إعدادات شركات التوزيع (صناديق منفصلة عن المناديب)
    // القيمة method يجب أن تطابق تماماً قيمة الخيار في staff.html
    // =============================================
    const COMPANY_CONFIG = [
        { id: 'almadhala', method: 'المظلة', label: 'المظلة', percent: 0.85 },
        { id: 'anees', method: 'انيس', label: 'انيس', percent: 0.90 },
        { id: 'point', method: 'بوينت', label: 'بوينت', percent: 0.85 },
        { id: 'bn', method: 'Bn+', label: 'Bn+', percent: 0.85 }
    ];
    let companyBalancesDocs = {}; // companyId -> resetAt (Date | null)
    let companyBalancesUnsubscribe = null;

    function initStaffBalancesRealtime() {
        const grid = document.getElementById('staffBalancesGrid');
        if (!grid) return;

        grid.innerHTML = '<p style="text-align:center; width:100%; color:var(--text-secondary);">جاري الحساب المباشر...</p>';

        if (staffBalancesUnsubscribe) staffBalancesUnsubscribe();
        if (transactionsUnsubscribe) transactionsUnsubscribe();
        if (companyBalancesUnsubscribe) companyBalancesUnsubscribe();

        // 1. الاستماع الحي للمناديب (Customers)
        staffBalancesUnsubscribe = db.collection('customers').where('role', '==', 'staff').onSnapshot(custSnapshot => {
            staffDocs = custSnapshot.docs;
            renderRealtimeBalances();
        }, err => {
            console.error('Error listening to staff:', err);
            grid.innerHTML = '<p style="color: #f44336;">حدث خطأ أثناء جلب المناديب.</p>';
        });

        // 2. الاستماع الحي للعمليات: بعد آخر "إقفال للحساب" فقط (وما يلزم لربح الأسبوع وفاتورة
        //    الشهر). كان يُنزّل كل العمليات منذ أول يوم مع كل فتح للوحة، فتثقل وتكلف أكثر كل يوم.
        //    بلا إقفال سابق يبقى كما كان: كل العمليات.
        const subscribeTransactions = () => {
            if (transactionsUnsubscribe) transactionsUnsubscribe();
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const weekStart = (typeof window.getLibyaWeekStart === 'function') ? window.getLibyaWeekStart() : null;
            const from = window.MizoLedger ? window.MizoLedger.windowStart([monthStart, weekStart]) : null;
            window.transactionsLoadedFrom = from;
            let q = db.collection('transactions');
            if (from) q = q.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(from));
            transactionsUnsubscribe = q.onSnapshot(transSnapshot => {
                transactionsDocs = transSnapshot.docs;
                renderRealtimeBalances();
                renderCompanyBalances();
                if (typeof window.onLedgerDataRefreshed === 'function') window.onLedgerDataRefreshed();
            }, err => {
                console.error('Error listening to transactions:', err);
            });
        };
        if (window.MizoLedger) window.MizoLedger.subscribe(subscribeTransactions);
        else subscribeTransactions();

        // 3. الاستماع الحي لآخر تصفية تمت مع كل شركة (تحدد نقطة بداية الحساب)
        companyBalancesUnsubscribe = db.collection('companyBalances').onSnapshot(compSnapshot => {
            companyBalancesDocs = {};
            compSnapshot.forEach(doc => {
                companyBalancesDocs[doc.id] = doc.data() || {};
            });
            renderCompanyBalances();
        }, err => {
            console.error('Error listening to companyBalances:', err);
        });
    }

    // =============================================
    // إقفال الحساب مع كل المناديب (مرة كل شهر أو شهرين)
    // =============================================
    // يضيف مجاميع العمليات حتى لحظة الإقفال إلى الأرصدة الأساسية لكل مندوب (ولكل شركة)، ويحفظ
    // تاريخ الإقفال. بعده تنزّل الصفحات العمليات اللاحقة فقط. الأرصدة المعروضة لا تتغير: الرصيد =
    // الأساسي + المجاميع، وما انتقل من المجاميع أُضيف للأساسي بنفس القيمة. العمليات القديمة لا تُحذف.
    function ledgerScreenNumbers() {
        return Array.from(document.querySelectorAll('#staffBalancesGrid .balance-val-amount, #companyBalancesGrid .balance-val-amount'))
            .map(el => el.textContent.trim()).join('|');
    }

    function renderLedgerStatus() {
        const el = document.getElementById('ledgerStatusLine');
        if (!el) return;
        const c = window.MizoLedger ? window.MizoLedger.cutoffMs() : null;
        el.innerHTML = c
            ? '<i class="fas fa-lock"></i> آخر إقفال للحساب: <span dir="ltr">' + new Date(c).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) + '</span>'
            : '<i class="fas fa-lock-open"></i> لم يتم إقفال الحساب بعد — الأرصدة تُحسب من كل العمليات منذ البداية';
    }
    if (window.MizoLedger) window.MizoLedger.subscribe(renderLedgerStatus);

    window.closeLedgerNow = async function () {
        if (!staffDocs || !staffDocs.length) return;
        const oldCutoff = window.MizoLedger ? window.MizoLedger.cutoffMs() : null;
        const ok = await showConfirm(
            'سيتم إقفال الحساب مع كل المناديب الآن:\n\n' +
            '• أرصدة كل مندوب وكل شركة تبقى كما هي تماماً.\n' +
            '• العمليات حتى هذه اللحظة تُحفظ داخل الأرصدة، فلا تُنزَّل مرة أخرى عند فتح الصفحات (أسرع وأقل تكلفة).\n' +
            '• العمليات القديمة لا تُحذف، وتبقى في السجل والتقارير.\n' +
            '• تعديل أو حذف عملية قبل الإقفال لاحقاً لن يغيّر الأرصدة.',
            { title: 'إقفال الحساب مع المناديب', okText: 'إقفال الحساب', cancelText: 'تراجع', danger: false });
        if (!ok) return;

        const btn = document.getElementById('btnCloseLedger');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإقفال...'; }
        const before = ledgerScreenNumbers();
        try {
            const FV = firebase.firestore.FieldValue;
            const TS = firebase.firestore.Timestamp;
            const ledgerRef = db.collection('systemSettings').doc('ledger');

            // 1) وقت الإقفال من ساعة الخادم (لا ساعة الجهاز)، ثم مهلة لتصل أي عملية تُكتب الآن
            const probeRef = db.collection('systemSettings').doc('ledger_probe');
            await probeRef.set({ at: FV.serverTimestamp() });
            const probe = await probeRef.get({ source: 'server' });
            const cutoffTs = probe.data().at;
            await new Promise(r => setTimeout(r, 2500));

            // 2) عمليات ما بين الإقفال السابق وهذا الإقفال، من الخادم مباشرة
            let q = db.collection('transactions').where('timestamp', '<=', cutoffTs);
            if (oldCutoff !== null) q = q.where('timestamp', '>', TS.fromMillis(oldCutoff));
            const docs = (await q.get({ source: 'server' })).docs;

            // 3) مجاميع كل مندوب بنفس دالة العرض
            const staffIncs = staffDocs.map(doc => {
                const d = doc.data();
                const staffName = escH(d.firstName ? d.firstName.trim() : (d.name ? d.name.trim().split(' ')[0] : (d.phone || 'مندوب غير معروف')));
                const isIbrahim = staffName.includes('ابراهيم');
                const x = computeStaffLedgerSums(doc.id, staffName, isIbrahim, docs, () => true);
                return {
                    ref: doc.ref, name: staffName,
                    inc: {
                        baseLibyana: x.libyanaSales - x.libyanaWithdrawals,
                        baseAlmadar: x.almadarSales - x.almadarWithdrawals,
                        baseCash: x.cashSales - x.cashWithdrawals,
                        baseBank: x.bankSales - x.bankWithdrawals,
                        baseSadad: x.sadadSales - x.sadadWithdrawals,
                        baseUsdt: x.usdtSales - x.usdtWithdrawals
                    }
                };
            });

            // 4) الشركات: مبيعات ما بعد آخر تصفية وحتى الإقفال تُضاف إلى salesAdjustment
            const companyIncs = COMPANY_CONFIG.map(c => {
                const cd = companyBalancesDocs[c.id] || {};
                const resetMs = cd.resetAt && typeof cd.resetAt.toMillis === 'function' ? cd.resetAt.toMillis() : null;
                let fold = 0;
                docs.forEach(t => {
                    const x = t.data();
                    if (x.type !== 'sale' || x.method !== c.method) return;
                    if (resetMs === null || window.MizoLedger.timeOf(x) > resetMs) fold += parseFloat(x.price) || 0;
                });
                return { id: c.id, fold };
            });

            // 5) كل شيء في معاملة واحدة، ويُرفض إن أُقفل الحساب من جهاز آخر في نفس الوقت
            await db.runTransaction(async tx => {
                const cur = await tx.get(ledgerRef);
                const curCut = cur.exists && cur.data().cutoff && typeof cur.data().cutoff.toMillis === 'function' ? cur.data().cutoff.toMillis() : null;
                if (curCut !== oldCutoff) throw new Error('ledger-changed');
                staffIncs.forEach(u => {
                    // سجل التراجع يُمسح: الأرصدة الأساسية تغيّرت فلا يصح التراجع عن تعديل قبل الإقفال
                    const upd = { balanceUndo: [], balanceRedo: [] };
                    Object.keys(u.inc).forEach(k => { if (u.inc[k]) upd[k] = FV.increment(u.inc[k]); });
                    tx.update(u.ref, upd);
                });
                companyIncs.forEach(c => {
                    if (c.fold) tx.set(db.collection('companyBalances').doc(c.id), { salesAdjustment: FV.increment(c.fold) }, { merge: true });
                });
                tx.set(ledgerRef, {
                    cutoff: cutoffTs,
                    previousCutoff: oldCutoff !== null ? TS.fromMillis(oldCutoff) : null,
                    closedAt: FV.serverTimestamp(),
                    transactionsClosed: docs.length
                });
            });

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_close_ledger',
                    category: 'admin',
                    severity: 'warning',
                    title: 'إقفال الحساب مع المناديب (' + docs.length + ' عملية)',
                    details: {
                        transactions: docs.length,
                        staff: staffIncs.map(u => u.name + ': ' + Object.keys(u.inc).filter(k => u.inc[k]).map(k => k + ' +' + u.inc[k].toFixed(2)).join(' ')).join(' | ').slice(0, 1500),
                        companies: companyIncs.filter(c => c.fold).map(c => c.id + ' +' + c.fold.toFixed(2)).join(' | ')
                    }
                });
            }

            // 6) التحقق: كل رقم على الشاشة بعد الإقفال يجب أن يطابق ما قبله
            setTimeout(() => {
                const after = ledgerScreenNumbers();
                if (after === before) {
                    showToast('تم إقفال الحساب (' + docs.length + ' عملية) — كل الأرصدة مطابقة لما قبل الإقفال', 'success');
                } else {
                    console.warn('ledger check', { before, after });
                    showAlert('تم الإقفال، لكن بعض الأرقام على الشاشة تغيّرت بعده. قد تكون عملية جديدة سُجلت أثناء الإقفال. راجع الأرصدة، وأرسل لي صورة إن لم تكن هناك عملية جديدة.', 'warning', 'مراجعة الأرصدة');
                }
            }, 5000);
        } catch (e) {
            console.error('closeLedger', e);
            showAlert(e && e.message === 'ledger-changed'
                ? 'تم إقفال الحساب من جهاز آخر للتو. لم يتغير شيء.'
                : 'تعذّر إقفال الحساب، ولم يتغير أي رصيد. حاول مرة أخرى.', 'error', 'إقفال الحساب');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
        }
    };

    // =============================================
    // توسيط الصندوق اليتيم إذا بقي وحيداً في آخر صف
    // (بدل ما يتمدد ليملأ عرض الصف بالكامل)
    // =============================================
    function centerOrphanRow(grid) {
        if (!grid) return;
        const items = Array.from(grid.children).filter(el => el.nodeType === 1);
        items.forEach(el => { el.style.gridColumn = ''; el.style.maxWidth = ''; el.style.margin = ''; });
        if (items.length < 2) return;

        const rows = [];
        items.forEach(el => {
            const top = el.offsetTop;
            let row = rows.find(r => Math.abs(r.top - top) < 3);
            if (!row) { row = { top: top, els: [] }; rows.push(row); }
            row.els.push(el);
        });

        const maxCount = Math.max(...rows.map(r => r.els.length));
        if (maxCount <= 1) return; // عرض عمودي (موبايل) - لا داعي للتعديل

        const fullRow = rows.find(r => r.els.length === maxCount);
        const cardWidth = fullRow ? fullRow.els[0].offsetWidth : null;

        rows.forEach(row => {
            if (row.els.length === 1 && row.els.length < maxCount) {
                row.els[0].style.gridColumn = '1 / -1';
                if (cardWidth) row.els[0].style.maxWidth = cardWidth + 'px';
                row.els[0].style.margin = '0 auto';
            }
        });
    }

    let orphanRowResizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(orphanRowResizeTimer);
        orphanRowResizeTimer = setTimeout(() => {
            centerOrphanRow(document.getElementById('staffBalancesGrid'));
            centerOrphanRow(document.getElementById('companyBalancesGrid'));
        }, 200);
    });

    // =============================================
    // حساب وعرض صناديق شركات التوزيع
    // إجمالي المبيعات = مجموع كل عمليات البيع بهذه الطريقة منذ آخر تصفية (resetAt)
    // مطلوب كاش = إجمالي المبيعات × نسبة الشركة (يُحسب تلقائياً، حي)
    // =============================================
    function renderCompanyBalances() {
        const grid = document.getElementById('companyBalancesGrid');
        if (!grid) return;

        let html = '';

        COMPANY_CONFIG.forEach(company => {
            const companyDoc = companyBalancesDocs[company.id] || {};
            const resetAt = companyDoc.resetAt ? companyDoc.resetAt.toDate() : null;
            const salesAdjustment = parseFloat(companyDoc.salesAdjustment) || 0;
            const customPercent = (companyDoc.customPercent !== undefined && companyDoc.customPercent !== null) ? companyDoc.customPercent : company.percent;
            const receivedTotal = parseFloat(companyDoc.receivedTotal) || 0;

            let liveSales = 0;
            transactionsDocs.forEach(tDoc => {
                const tData = tDoc.data();
                if (tData.type === 'sale' && tData.method === company.method) {
                    const ts = tData.timestamp ? tData.timestamp.toDate() : null;
                    // نحسب فقط العمليات التي تمت بعد آخر تصفية (أو كل العمليات إذا لم تتم أي تصفية بعد)،
                    // وبعد آخر إقفال للحساب: ما قبله أُضيف إلى salesAdjustment لحظة الإقفال
                    if ((!resetAt || (ts && ts > resetAt)) && (!window.MizoLedger || window.MizoLedger.counts(tData))) {
                        liveSales += parseFloat(tData.price) || 0;
                    }
                }
            });

            // إجمالي المبيعات = المبيعات الحية من العمليات + أي تعديل يدوي (يشمل حسابات قديمة قبل الموقع)
            const totalSales = liveSales + salesAdjustment;
            const cashDue = (totalSales * customPercent) - receivedTotal;
            const percentLabel = Math.round(customPercent * 100);

            html += `
            <div class="main-category-card staff-card right-text" style="position: relative; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                <div style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; width: 100%; gap: 10px; flex-wrap: wrap;">
                        <h3 class="staff-form-title" style="margin: 0;"><i class="fas fa-building"></i> ${company.label}</h3>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button type="button" class="company-invoice-btn" onclick="searchSpecificCompanySales('${company.id}')" title="عرض وتنزيل فاتورة ${company.label}"><i class="fas fa-file-invoice"></i> الفاتورة</button>
                            <button type="button" class="settle-company-btn" onclick="editCompanyBalance('${company.id}', '${company.label}', ${totalSales}, ${percentLabel}, ${receivedTotal})"><i class="fas fa-edit"></i> تعديل</button>
                        </div>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 15px;">نسبة المستحق من إجمالي المبيعات: ${percentLabel}%</p>
                </div>

                <div class="staff-balances-container company-balances-subcontainer">
                    <div class="balance-card balance-card-company-sales">
                        <h4 class="balance-card-title">إجمالي مبيعات</h4>
                        <div class="balance-card-amount balance-val-company-sales">
                            <span class="balance-val-amount">${totalSales.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-cash">
                        <h4 class="balance-card-title">مطلوب كاش</h4>
                        <div class="balance-card-amount balance-val-cash">
                            <span class="balance-val-amount">${cashDue.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        });

        grid.innerHTML = html;
        centerOrphanRow(grid);

        // تحديث قسم مبيعات وفواتير الشركات
        if (window.initCompanySalesSection) {
            window.initCompanySalesSection();
        }
    }

    // =============================================
    // تعديل حساب شركة توزيع (إجمالي المبيعات / نسبة التصفية / القيمة المستلمة)
    // يسمح بإدخال حسابات قديمة يدوياً (قبل الموقع) دون حذف أي عملية بيع من السجل
    // =============================================
    window.editCompanyBalance = function (companyId, companyLabel, currentTotalSales, currentPercentLabel, currentReceivedTotal) {
        document.getElementById('editCompanyId').value = companyId;
        document.getElementById('editCompanyName').innerText = companyLabel;
        document.getElementById('editCompanyTotalSales').value = currentTotalSales.toFixed(2);
        document.getElementById('editCompanyPercent').value = currentPercentLabel;
        const currentNet = currentTotalSales * (currentPercentLabel / 100);
        const netInput = document.getElementById('editCompanyNetSales');
        if (netInput) netInput.value = currentNet.toFixed(2);
        document.getElementById('editCompanyReceivedTotal').value = currentReceivedTotal.toFixed(2);
        document.getElementById('editCompanyModal').style.display = 'block';
    };

    window.closeEditCompanyModal = function () {
        document.getElementById('editCompanyModal').style.display = 'none';
    };

    // ربط متبادل حي بين إجمالي المبيعات ونسبة التصفية وخانة الصافي
    const editCompanyTotalSalesEl = document.getElementById('editCompanyTotalSales');
    const editCompanyPercentEl = document.getElementById('editCompanyPercent');
    const editCompanyNetSalesEl = document.getElementById('editCompanyNetSales');

    if (editCompanyTotalSalesEl && editCompanyPercentEl && editCompanyNetSalesEl) {
        // عند تغيير إجمالي المبيعات، يتم تحديث الصافي
        editCompanyTotalSalesEl.addEventListener('input', () => {
            const total = parseFloat(editCompanyTotalSalesEl.value);
            const percent = parseFloat(editCompanyPercentEl.value);
            if (!isNaN(total) && !isNaN(percent)) {
                editCompanyNetSalesEl.value = (total * (percent / 100)).toFixed(2);
            } else if (editCompanyTotalSalesEl.value === '') {
                editCompanyNetSalesEl.value = '';
            }
        });

        // عند تغيير الصافي، يتم تحديث إجمالي المبيعات (والعكس صحيح)
        editCompanyNetSalesEl.addEventListener('input', () => {
            const net = parseFloat(editCompanyNetSalesEl.value);
            const percent = parseFloat(editCompanyPercentEl.value);
            if (!isNaN(net) && !isNaN(percent) && percent > 0) {
                editCompanyTotalSalesEl.value = (net / (percent / 100)).toFixed(2);
            } else if (editCompanyNetSalesEl.value === '') {
                editCompanyTotalSalesEl.value = '';
            }
        });

        // عند تغيير نسبة التصفية، يتم إعادة حساب الصافي بناءً على إجمالي المبيعات
        editCompanyPercentEl.addEventListener('input', () => {
            const total = parseFloat(editCompanyTotalSalesEl.value);
            const percent = parseFloat(editCompanyPercentEl.value);
            if (!isNaN(total) && !isNaN(percent)) {
                editCompanyNetSalesEl.value = (total * (percent / 100)).toFixed(2);
            }
        });
    }

    window.saveCompanyBalance = async function () {
        const companyId = document.getElementById('editCompanyId').value;
        if (!companyId) return;

        const config = COMPANY_CONFIG.find(c => c.id === companyId);
        const companyLabel = document.getElementById('editCompanyName').innerText;

        // نعيد حساب المبيعات الحية (منذ آخر resetAt إن وُجد) بنفس طريقة renderCompanyBalances
        const companyDoc = companyBalancesDocs[companyId] || {};
        const resetAt = companyDoc.resetAt ? companyDoc.resetAt.toDate() : null;
        let liveSales = 0;
        transactionsDocs.forEach(tDoc => {
            const tData = tDoc.data();
            if (tData.type === 'sale' && tData.method === config.method) {
                const ts = tData.timestamp ? tData.timestamp.toDate() : null;
                if ((!resetAt || (ts && ts > resetAt)) && (!window.MizoLedger || window.MizoLedger.counts(tData))) {
                    liveSales += parseFloat(tData.price) || 0;
                }
            }
        });

        const newTotalSales = parseFloat(document.getElementById('editCompanyTotalSales').value) || 0;
        const newPercentInput = parseFloat(document.getElementById('editCompanyPercent').value);
        const newReceivedTotal = parseFloat(document.getElementById('editCompanyReceivedTotal').value) || 0;

        if (isNaN(newPercentInput) || newPercentInput < 0 || newPercentInput > 100) {
            if (typeof showToast === 'function') showToast('يرجى إدخال نسبة صحيحة بين 0 و 100', 'error');
            else showAlert('يرجى إدخال نسبة صحيحة بين 0 و 100');
            return;
        }

        // الفرق بين القيمة المُدخلة والمبيعات الحية يُخزَّن كـ"قاعدة" ثابتة
        // (تماماً كما تُحسب أرصدة المناديب الأساسية)، وأي مبيعات جديدة تُضاف عليها تلقائياً
        const salesAdjustment = newTotalSales - liveSales;
        const customPercent = newPercentInput / 100;

        const btn = document.querySelector('#editCompanyModal .edit-balances-modal-save');
        const oldText = btn ? btn.innerHTML : '';

        try {
            if (btn) { btn.innerHTML = 'جاري الحفظ...'; btn.disabled = true; }

            await db.collection('companyBalances').doc(companyId).set({
                companyLabel: companyLabel,
                salesAdjustment: salesAdjustment,
                customPercent: customPercent,
                receivedTotal: newReceivedTotal
            }, { merge: true });

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_edit_company_balance',
                    category: 'admin',
                    severity: 'warning',
                    title: 'تعديل حساب شركة توزيع: ' + companyLabel,
                    details: { companyId: companyId, newTotalSales: newTotalSales, newPercentInput: newPercentInput, newReceivedTotal: newReceivedTotal }
                });
            }

            window.closeEditCompanyModal();
            if (typeof showToast === 'function') showToast('تم حفظ تعديلات ' + companyLabel + ' بنجاح', 'success');
        } catch (err) {
            console.error('Error saving company balance:', err);
            showAlert('فشل الحفظ: ' + err.message);
        } finally {
            if (btn) { btn.innerHTML = oldText || '<i class="fas fa-save icon-spacing-left"></i> حفظ التعديلات'; btn.disabled = false; }
        }
    };

    // =============================================
    // تصفح وفواتير مبيعات شركات التوزيع (فترة مخصصة وافتراضياً لمدة شهر)
    // =============================================
    const COMPANY_METHODS_LIST = COMPANY_CONFIG.map(c => c.method);

    function formatYMD(d) {
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDisplayDate(d) {
        if (!d) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const y = d.getFullYear();
        return `${day}/${m}/${y}`;
    }

    window.getDefaultCompanyMonthRange = function () {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
            start: start,
            end: end,
            startStr: formatYMD(start),
            endStr: formatYMD(end)
        };
    };

    window.getDefaultWeekRange = function () {
        const now = new Date();
        const day = now.getDay(); // 0 is Sunday, 6 is Saturday
        const diffToSaturday = (day === 6) ? 0 : (day + 1);

        const start = new Date(now);
        start.setDate(now.getDate() - diffToSaturday);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6); // السبت + 6 أيام = الجمعة
        end.setHours(23, 59, 59, 999);

        return {
            start: start,
            end: end,
            startStr: formatYMD(start),
            endStr: formatYMD(end)
        };
    };

    window.initCompanySalesSection = function () {
        const select = document.getElementById('companyFilterSelect');
        if (select) {
            select.value = 'all';
        }

        const startEl = document.getElementById('companyStartDate');
        const endEl = document.getElementById('companyEndDate');
        if (!startEl || !endEl) return;

        // إعادة التواريخ إلى الشهر الحالي الافتراضي
        const def = window.getDefaultCompanyMonthRange();
        if (window.companyStartFp) {
            window.companyStartFp.setDate(def.startStr);
        } else {
            startEl.value = def.startStr;
        }

        if (window.companyEndFp) {
            window.companyEndFp.setDate(def.endStr);
        } else {
            endEl.value = def.endStr;
        }

        window.searchCompanySales();
    };

    window.resetCompanySalesToCurrentMonth = function () {
        const def = window.getDefaultCompanyMonthRange();
        const startEl = document.getElementById('companyStartDate');
        const endEl = document.getElementById('companyEndDate');

        if (window.companyStartFp) {
            window.companyStartFp.setDate(def.startStr);
        } else if (startEl) {
            startEl.value = def.startStr;
        }

        if (window.companyEndFp) {
            window.companyEndFp.setDate(def.endStr);
        } else if (endEl) {
            endEl.value = def.endStr;
        }

        window.searchCompanySales();
        if (typeof showToast === 'function') {
            showToast('تمت إعادة ضبط الفترة للشهر الحالي كاملاً', 'info');
        }
    };

    window.searchSpecificCompanySales = function (companyId) {
        const select = document.getElementById('companyFilterSelect');
        if (select) {
            select.value = companyId;
        }

        const section = document.querySelector('.company-sales-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        window.searchCompanySales();
    };

    window.resetToAllCompaniesSales = function () {
        const select = document.getElementById('companyFilterSelect');
        if (select) {
            select.value = 'all';
        }

        const section = document.querySelector('.company-sales-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        window.searchCompanySales();
        if (typeof showToast === 'function') {
            showToast('تم إغلاق الفاتورة والرجوع لمقارنة جميع الشركات', 'info');
        }
    };

    /** نافذة إجمالي مبيعات المنتجات لكل شركة على حدة، بنفس الفترة والشركة المختارتين في القسم. */
    window.openCompanyProductSalesSummary = function () {
        if (!window.companyPeriodSales) window.searchCompanySales();
        const period = window.companyPeriodSales || { filtered: [], companyId: 'all' };
        const subtitle = `الفترة: ${period.startDisplay || ''} - ${period.endDisplay || ''}`;

        const companies = [];
        let totalSalesCount = 0;
        let totalSalesAmount = 0;
        COMPANY_CONFIG.forEach(c => {
            if (period.companyId !== 'all' && period.companyId !== c.id) return;
            const sales = period.filtered.filter(item => item.data.method === c.method);
            const summary = window.summarizeSalesByProduct(sales.map(item => item.data));
            if (summary.count === 0) return;
            companies.push({ id: c.id, label: c.label, list: summary.list, count: summary.count, amount: summary.amount });
            totalSalesCount += summary.count;
            totalSalesAmount += summary.amount;
        });

        window.currentActiveProductSummary = {
            groupKey: subtitle,
            periodSubtitle: subtitle,
            isPeriod: true,
            isCompany: true,
            companies: companies,
            list: [].concat(...companies.map(c => c.list)),
            totalSalesCount: totalSalesCount,
            totalSalesAmount: totalSalesAmount
        };

        const modal = document.getElementById('productSalesSummaryModal');
        if (!modal) return;
        document.getElementById('productSummaryTitle').textContent = 'إجمالي مبيعات الشركات للفترة المحددة';
        document.getElementById('productSummarySubtitle').textContent = `📅 ${subtitle}`;
        document.getElementById('summaryTotalSalesCount').textContent = totalSalesCount;
        document.getElementById('summaryTotalSalesAmount').textContent = totalSalesAmount.toFixed(2) + ' د.ل';
        document.getElementById('summaryDistinctProductsCount').textContent = companies.length;
        const thirdLabel = document.getElementById('summaryThirdStatLabel');
        if (thirdLabel) thirdLabel.textContent = 'عدد الشركات';

        const searchInput = document.getElementById('productSummarySearch');
        if (searchInput) searchInput.value = '';

        window.renderCompanySummaryTable(companies);
        modal.style.display = 'block';
        const tableWrap = document.querySelector('.product-summary-table-wrap');
        if (tableWrap) tableWrap.scrollTop = 0;
    };

    window.searchCompanySales = function () {
        const container = document.getElementById('companyMonthlyHistoryContainer');
        const select = document.getElementById('companyFilterSelect');
        const startEl = document.getElementById('companyStartDate');
        const endEl = document.getElementById('companyEndDate');
        const dlBtn = document.getElementById('btnDownloadCompanyInvoice');

        if (!container) return;

        const companyId = select ? select.value : 'all';
        const startVal = startEl ? startEl.value : '';
        const endVal = endEl ? endEl.value : '';

        let startDate = null;
        let endDate = null;

        if (startVal) {
            startDate = new Date(startVal);
            startDate.setHours(0, 0, 0, 0);
        }
        if (endVal) {
            endDate = new Date(endVal);
            endDate.setHours(23, 59, 59, 999);
        }

        // إذا لم يتم تحديد أي تاريخ نعتمد الشهر الحالي كاملاً
        if (!startDate && !endDate) {
            const def = window.getDefaultCompanyMonthRange();
            startDate = def.start;
            startDate.setHours(0, 0, 0, 0);
            endDate = def.end;
            endDate.setHours(23, 59, 59, 999);
        }

        const startDisplay = startDate ? formatDisplayDate(startDate) : 'البداية';
        const endDisplay = endDate ? formatDisplayDate(endDate) : 'الآن';

        // فترة أقدم من العمليات المحمّلة (قبل آخر إقفال للحساب): تُجلب من قاعدة البيانات مرة واحدة
        let sourceDocs = transactionsDocs;
        const loadedFrom = window.transactionsLoadedFrom;
        if (loadedFrom && (!startDate || startDate < loadedFrom)) {
            const key = (startDate ? startDate.getTime() : 0) + '_' + (endDate ? endDate.getTime() : 0);
            if (window._companyArchive && window._companyArchive.key === key) {
                sourceDocs = window._companyArchive.docs;
            } else {
                container.innerHTML = '<div class="table-empty-message mt-20"><i class="fas fa-spinner fa-spin"></i> جاري جلب مبيعات الفترة...</div>';
                let q = db.collection('transactions');
                if (startDate) q = q.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(startDate));
                if (endDate) q = q.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(endDate));
                q.get().then(snap => {
                    window._companyArchive = { key: key, docs: snap.docs };
                    window.searchCompanySales();
                }).catch(err => {
                    console.error('company archive fetch:', err);
                    container.innerHTML = '<div class="table-empty-message mt-20">تعذّر جلب مبيعات هذه الفترة</div>';
                });
                return;
            }
        }

        // تصفية العمليات في الفترة المحددة
        const filtered = [];
        sourceDocs.forEach(tDoc => {
            const tData = tDoc.data();
            if (tData.type !== 'sale') return;
            if (!tData.timestamp) return;

            const d = tData.timestamp.toDate();
            if (startDate && d < startDate) return;
            if (endDate && d > endDate) return;

            if (companyId !== 'all') {
                const cConfig = COMPANY_CONFIG.find(c => c.id === companyId);
                if (!cConfig || tData.method !== cConfig.method) return;
            } else {
                if (!COMPANY_METHODS_LIST.includes(tData.method)) return;
            }

            filtered.push({ id: tDoc.id, data: tData, date: d });
        });

        // فرز تنازلي حسب التاريخ والوقت
        filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

        // لزر "إجمالي مبيعات الشركات للفترة": نفس الفترة والشركة المعروضتين هنا
        window.companyPeriodSales = { filtered: filtered, companyId: companyId, startDisplay: startDisplay, endDisplay: endDisplay };
        const companyBadge = document.getElementById('companySalesBadge');
        if (companyBadge) companyBadge.textContent = window.summarizeSalesByProduct(filtered.map(item => item.data)).count;

        // حالة 1: تصفية لشركة محددة (عرض مفصل وإمكانية تنزيل الفاتورة وتعديل الحصص)
        if (companyId !== 'all') {
            const cConfig = COMPANY_CONFIG.find(c => c.id === companyId);
            const compDoc = (companyBalancesDocs && companyBalancesDocs[companyId]) || {};
            const almezoPercent = (compDoc.customPercent !== undefined && compDoc.customPercent !== null) ? compDoc.customPercent : cConfig.percent;
            const companyPercent = Math.max(0, 1 - almezoPercent);
            const almezoPercentLabel = Math.round(almezoPercent * 100);
            const companyPercentLabel = Math.round(companyPercent * 100);

            let totalSales = 0;
            let totalAlmezoShare = 0;
            let totalCompanyShare = 0;

            filtered.forEach(item => {
                const tData = item.data;
                const price = parseFloat(tData.price) || 0;
                let almezoShare = 0;
                let companyShare = 0;
                let isCustom = false;

                if (tData.almezoShare !== undefined && tData.almezoShare !== null) {
                    almezoShare = parseFloat(tData.almezoShare) || 0;
                    companyShare = (tData.companyShare !== undefined && tData.companyShare !== null)
                        ? parseFloat(tData.companyShare) || 0
                        : Math.max(0, price - almezoShare);
                    isCustom = true;
                } else if (tData.companyShare !== undefined && tData.companyShare !== null) {
                    companyShare = parseFloat(tData.companyShare) || 0;
                    almezoShare = Math.max(0, price - companyShare);
                    isCustom = true;
                } else {
                    almezoShare = price * almezoPercent;
                    companyShare = price * companyPercent;
                    isCustom = false;
                }

                item.price = price;
                item.almezoShare = almezoShare;
                item.companyShare = companyShare;
                item.isCustom = isCustom;

                totalSales += price;
                totalAlmezoShare += almezoShare;
                totalCompanyShare += companyShare;
            });

            const totalCount = filtered.length;

            window.currentCompanyInvoiceData = {
                companyId: companyId,
                companyLabel: cConfig.label,
                companyMethod: cConfig.method,
                almezoPercent: almezoPercent,
                companyPercent: companyPercent,
                almezoPercentLabel: almezoPercentLabel,
                companyPercentLabel: companyPercentLabel,
                startDate: startDate,
                endDate: endDate,
                startDateStr: startDisplay,
                endDateStr: endDisplay,
                totalSales: totalSales,
                totalAlmezoShare: totalAlmezoShare,
                totalCompanyShare: totalCompanyShare,
                totalCount: totalCount,
                transactions: filtered
            };

            if (dlBtn) {
                dlBtn.disabled = false;
                dlBtn.title = `تنزيل فاتورة مبيعات ${cConfig.label}`;
                dlBtn.innerHTML = `<i class="fas fa-camera"></i> تنزيل فاتورة (${cConfig.label})`;
            }

            let rowsHtml = '';
            if (filtered.length === 0) {
                rowsHtml = `
                    <tr>
                        <td colspan="8" class="table-empty-message" style="text-align:center; padding:25px; color:var(--text-secondary);">
                            <i class="fas fa-info-circle" style="margin-left:6px;"></i> لا توجد مبيعات مسجلة لشركة <strong>${cConfig.label}</strong> في الفترة المحددة (${startDisplay} إلى ${endDisplay}).
                        </td>
                    </tr>
                `;
            } else {
                filtered.forEach((item, idx) => {
                    const tData = escRecordForHtml(item.data);
                    const price = item.price;
                    const almezoShare = item.almezoShare;
                    const companyShare = item.companyShare;
                    const isCustom = item.isCustom;

                    const dateShort = item.date.toLocaleDateString('en-GB');
                    const timeShort = item.date.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
                    const timeFormatted = item.date.toLocaleDateString('en-GB') + ' ' + timeShort;
                    const staffName = (window.staffNamesCache && window.staffNamesCache[tData.staffId])
                        ? escH(window.staffNamesCache[tData.staffId].split(' ')[0])
                        : (tData.staffName ? tData.staffName.split(' ')[0] : (tData.performedBy || 'مندوب'));
                    const productDisplay = (tData.product || 'منتج') + (tData.duration ? ` - ${tData.duration}` : '');

                    rowsHtml += `
                        <tr>
                            <td class="col-num">${idx + 1}</td>
                            <td class="col-date">
                                <span class="date-full">${timeFormatted}</span>
                                <span class="date-mobile">${dateShort} ${timeShort}</span>
                            </td>
                            <td class="col-staff">${staffName}</td>
                            <td class="col-product" style="font-weight:600; color:var(--text-primary);">${productDisplay}</td>
                            <td class="col-price" style="font-weight:700; color:#38bdf8;">${price.toFixed(2)} <span class="curr-lbl">د.ل</span></td>
                            <td class="col-share-almezo" style="font-weight:700; color:#4ade80;">
                                ${almezoShare.toFixed(2)} <span class="curr-lbl">د.ل</span>
                                ${isCustom ? '<span class="custom-share-badge" title="تم تعديل الحصة يدوياً"><i class="fas fa-pen"></i> مخصص</span>' : ''}
                            </td>
                            <td class="col-share-company" style="font-weight:700; color:#fbbf24;">
                                ${companyShare.toFixed(2)} <span class="curr-lbl">د.ل</span>
                            </td>
                            <td class="col-actions">
                                <button type="button" class="btn-edit-share" onclick="openEditCompanySaleShareModal('${item.id}', '${encodeURIComponent((item.data.product || 'منتج') + (item.data.duration ? ' - ' + item.data.duration : '')).replace(/'/g, '%27')}', ${price}, ${almezoShare}, ${companyShare}, '${cConfig.id}', '${encodeURIComponent(cConfig.label)}', ${almezoPercentLabel}, ${companyPercentLabel})" title="تعديل الحصص يدوياً لهذه المبيعة">
                                    <i class="fas fa-edit"></i> <span class="edit-share-btn-text">تعديل</span>
                                </button>
                            </td>
                        </tr>
                    `;
                });
            }

            container.innerHTML = `
                <div class="company-invoice-header-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:20px; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <h4 style="margin:0; font-size:1.15rem; color:#38bdf8; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-building"></i> مبيعات شركة ${cConfig.label}
                        </h4>
                        <span style="font-size:0.85rem; padding:3px 10px; border-radius:20px; background:rgba(56, 189, 248, 0.15); color:#38bdf8; border:1px solid rgba(56, 189, 248, 0.3);">
                            📅 الفترة: ${startDisplay} - ${endDisplay}
                        </span>
                    </div>
                    <div class="company-invoice-actions" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn-close-company-invoice" onclick="resetToAllCompaniesSales()" title="إغلاق فاتورة الشركة والرجوع لمقارنة جميع الشركات">
                            <i class="fas fa-arrow-right"></i> إغلاق الفاتورة (عرض جميع الشركات)
                        </button>
                        <button type="button" class="btn-download-company-invoice" onclick="downloadCompanyInvoice(this)">
                            <i class="fas fa-file-invoice"></i> تنزيل الفاتورة كـ صورة عالية الدقة
                        </button>
                    </div>
                </div>

                <!-- بطاقات مؤشرات الأداء للفترة -->
                <div class="company-invoice-summary-grid">
                    <div class="company-invoice-card sales">
                        <div class="company-invoice-stat-lbl">إجمالي مبيعات الفترة</div>
                        <div class="company-invoice-stat-val" style="color:#38bdf8;">${totalSales.toFixed(2)} <span style="font-size:0.85rem;">د.ل</span></div>
                    </div>
                    <div class="company-invoice-card due">
                        <div class="company-invoice-stat-lbl">إجمالي حصة الميزو (${almezoPercentLabel}%)</div>
                        <div class="company-invoice-stat-val" style="color:#4ade80;">${totalAlmezoShare.toFixed(2)} <span style="font-size:0.85rem;">د.ل</span></div>
                    </div>
                    <div class="company-invoice-card count">
                        <div class="company-invoice-stat-lbl">إجمالي حصة ${cConfig.label} (${companyPercentLabel}%)</div>
                        <div class="company-invoice-stat-val" style="color:#fbbf24;">${totalCompanyShare.toFixed(2)} <span style="font-size:0.85rem;">د.ل</span></div>
                    </div>
                    <div class="company-invoice-card percent">
                        <div class="company-invoice-stat-lbl">عدد العمليات الناجحة</div>
                        <div class="company-invoice-stat-val" style="color:#c084fc;">${totalCount} <span style="font-size:0.85rem;">عملية</span></div>
                    </div>
                </div>

                <!-- جدول العمليات المفصلة -->
                <div class="table-responsive company-sales-responsive">
                    <table class="data-table company-sales-table company-detail-sales-table">
                        <thead>
                            <tr>
                                <th class="col-num">#</th>
                                <th class="col-date">
                                    <span class="col-hdr-full">التاريخ والوقت</span>
                                    <span class="col-hdr-mobile">الوقت</span>
                                </th>
                                <th class="col-staff">
                                    <span class="col-hdr-full">المندوب / البائع</span>
                                    <span class="col-hdr-mobile">المندوب</span>
                                </th>
                                <th class="col-product">
                                    <span class="col-hdr-full">المنتج / الباقة</span>
                                    <span class="col-hdr-mobile">المنتج</span>
                                </th>
                                <th class="col-price">
                                    <span class="col-hdr-full">سعر البيع</span>
                                    <span class="col-hdr-mobile">السعر</span>
                                </th>
                                <th class="col-share-almezo">
                                    <span class="col-hdr-full">حصة الميزو (${almezoPercentLabel}%)</span>
                                    <span class="col-hdr-mobile">الميزو (${almezoPercentLabel}%)</span>
                                </th>
                                <th class="col-share-company">
                                    <span class="col-hdr-full">حصة ${cConfig.label} (${companyPercentLabel}%)</span>
                                    <span class="col-hdr-mobile">${cConfig.label} (${companyPercentLabel}%)</span>
                                </th>
                                <th class="col-actions">
                                    <span class="col-hdr-full">الإجراءات</span>
                                    <span class="col-hdr-mobile">إجراء</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        ${filtered.length > 0 ? `
                        <tfoot>
                            <tr style="background:rgba(255,255,255,0.04); font-weight:bold;">
                                <td colspan="4" class="col-detail-total-lbl" style="text-align:right; padding-right:6px;">الإجمالي الكلي للفترة:</td>
                                <td class="col-price" style="color:#38bdf8;">${totalSales.toFixed(2)} <span class="curr-lbl">د.ل</span></td>
                                <td class="col-share-almezo" style="color:#4ade80;">${totalAlmezoShare.toFixed(2)} <span class="curr-lbl">د.ل</span></td>
                                <td class="col-share-company" style="color:#fbbf24;">${totalCompanyShare.toFixed(2)} <span class="curr-lbl">د.ل</span></td>
                                <td class="col-actions"></td>
                            </tr>
                        </tfoot>` : ''}
                    </table>
                </div>
            `;
        } else {
            // حالة 2: جميع الشركات (مقارنة شاملة مع زر لكل شركة لتنزيل فاتورتها)
            window.currentCompanyInvoiceData = { companyId: 'all' };

            if (dlBtn) {
                dlBtn.disabled = true;
                dlBtn.title = 'اختر شركة محددة لتنزيل فاتورتها الرسمية';
                dlBtn.innerHTML = '<i class="fas fa-camera"></i> تنزيل الفاتورة';
            }

            const totalsByMethod = {};
            const almezoShareByMethod = {};
            const companyShareByMethod = {};
            const countByMethod = {};
            COMPANY_METHODS_LIST.forEach(m => {
                totalsByMethod[m] = 0;
                almezoShareByMethod[m] = 0;
                companyShareByMethod[m] = 0;
                countByMethod[m] = 0;
            });

            filtered.forEach(item => {
                const tData = item.data;
                const m = tData.method;
                const price = parseFloat(tData.price) || 0;
                const cConfig = COMPANY_CONFIG.find(c => c.method === m);
                const compDoc = (cConfig && companyBalancesDocs && companyBalancesDocs[cConfig.id]) || {};
                const almezoP = (compDoc.customPercent !== undefined && compDoc.customPercent !== null) ? compDoc.customPercent : (cConfig ? cConfig.percent : 0.85);
                const compP = Math.max(0, 1 - almezoP);

                let aShare = 0;
                let cShare = 0;
                if (tData.almezoShare !== undefined && tData.almezoShare !== null) {
                    aShare = parseFloat(tData.almezoShare) || 0;
                    cShare = (tData.companyShare !== undefined && tData.companyShare !== null) ? parseFloat(tData.companyShare) || 0 : Math.max(0, price - aShare);
                } else if (tData.companyShare !== undefined && tData.companyShare !== null) {
                    cShare = parseFloat(tData.companyShare) || 0;
                    aShare = Math.max(0, price - cShare);
                } else {
                    aShare = price * almezoP;
                    cShare = price * compP;
                }

                if (totalsByMethod.hasOwnProperty(m)) {
                    totalsByMethod[m] += price;
                    almezoShareByMethod[m] += aShare;
                    companyShareByMethod[m] += cShare;
                    countByMethod[m] += 1;
                }
            });

            let overallSales = 0;
            let overallAlmezoShare = 0;
            let overallCompanyShare = 0;
            let overallCount = 0;
            let rows = '';

            COMPANY_CONFIG.forEach(c => {
                const compDoc = (companyBalancesDocs && companyBalancesDocs[c.id]) || {};
                const almezoPercent = (compDoc.customPercent !== undefined && compDoc.customPercent !== null) ? compDoc.customPercent : c.percent;
                const companyPercent = Math.max(0, 1 - almezoPercent);
                const almezoPercentLabel = Math.round(almezoPercent * 100);
                const companyPercentLabel = Math.round(companyPercent * 100);

                const sales = totalsByMethod[c.method] || 0;
                const almezoShare = almezoShareByMethod[c.method] || 0;
                const companyShare = companyShareByMethod[c.method] || 0;
                const count = countByMethod[c.method] || 0;

                overallSales += sales;
                overallAlmezoShare += almezoShare;
                overallCompanyShare += companyShare;
                overallCount += count;

                rows += `
                    <tr>
                        <td class="col-cgen-name" style="font-weight:700; color:var(--text-primary);"><i class="fas fa-building" style="margin-left:4px; color:#38bdf8;"></i> ${c.label}</td>
                        <td class="col-cgen-rate" style="text-align:center;"><span class="cgen-rate-badge" style="background:rgba(56,189,248,0.15); color:#38bdf8; border-radius:12px; font-weight:700;">الميزو ${almezoPercentLabel}% / ${companyPercentLabel}%</span></td>
                        <td class="col-cgen-sales" style="font-weight:700; color:#38bdf8;">${sales.toFixed(2)} د.ل</td>
                        <td class="col-cgen-almezo" style="font-weight:700; color:#4ade80;">${almezoShare.toFixed(2)} د.ل</td>
                        <td class="col-cgen-company" style="font-weight:700; color:#fbbf24;">${companyShare.toFixed(2)} د.ل</td>
                        <td class="col-cgen-count" style="text-align:center;"><span class="cgen-count-badge" style="background:rgba(168,85,247,0.15); color:#c084fc; border-radius:12px; font-weight:700;">${count}</span></td>
                        <td class="col-cgen-action" style="text-align:center;">
                            <button type="button" class="company-invoice-btn" onclick="searchSpecificCompanySales('${c.id}')" title="عرض وتنزيل فاتورة ${c.label}">
                                <i class="fas fa-file-invoice"></i> الفاتورة
                            </button>
                        </td>
                    </tr>
                `;
            });

            container.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:20px; margin-bottom:12px;">
                    <h4 style="margin:0; font-size:1.15rem; color:#38bdf8; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-chart-bar"></i> مقارنة مبيعات شركات التوزيع للفترة
                    </h4>
                    <span style="font-size:0.85rem; padding:4px 12px; border-radius:20px; background:rgba(56, 189, 248, 0.15); color:#38bdf8; border:1px solid rgba(56, 189, 248, 0.3);">
                        📅 الفترة: ${startDisplay} - ${endDisplay}
                    </span>
                </div>
                <div class="table-responsive company-sales-responsive">
                    <table class="data-table company-sales-table company-general-table">
                        <thead>
                            <tr>
                                <th class="col-cgen-name">الشركة</th>
                                <th class="col-cgen-rate" style="text-align:center;">نسبة الاتفاق</th>
                                <th class="col-cgen-sales">مبيعات الفترة</th>
                                <th class="col-cgen-almezo">حصة الميزو</th>
                                <th class="col-cgen-company">حصة الشركة</th>
                                <th class="col-cgen-count" style="text-align:center;">العمليات</th>
                                <th class="col-cgen-action" style="text-align:center;">الفاتورة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                        <tfoot>
                            <tr style="background:rgba(255,255,255,0.05); font-weight:bold;">
                                <td colspan="2" class="col-cgen-total-lbl" style="text-align:right; padding-right:6px;">الإجمالي العام:</td>
                                <td class="col-cgen-sales" style="color:#38bdf8;">${overallSales.toFixed(2)} د.ل</td>
                                <td class="col-cgen-almezo" style="color:#4ade80;">${overallAlmezoShare.toFixed(2)} د.ل</td>
                                <td class="col-cgen-company" style="color:#fbbf24;">${overallCompanyShare.toFixed(2)} د.ل</td>
                                <td class="col-cgen-count" style="text-align:center; color:#c084fc;">${overallCount}</td>
                                <td class="col-cgen-action"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
        }
    };

    // دوال إدارة النافذة المنبثقة لتعديل حصص مبيعة شركة التوزيع يدوياً
    window.openEditCompanySaleShareModal = function (txId, encodedProduct, price, currentAlmezo, currentCompany, companyId, encodedCompanyLabel, almezoPercentLabel, companyPercentLabel) {
        const product = decodeURIComponent(encodedProduct);
        const companyLabel = decodeURIComponent(encodedCompanyLabel);

        const txInput = document.getElementById('editShareTxId');
        txInput.value = txId;
        txInput.dataset.isRestored = 'false';

        const numPrice = Number(price) || 0;
        document.getElementById('editShareSalePrice').value = numPrice;
        const inputSalePriceEl = document.getElementById('inputSalePrice');
        if (inputSalePriceEl) inputSalePriceEl.value = numPrice.toFixed(2);
        document.getElementById('editShareDefaultAlmezoPercent').value = almezoPercentLabel;

        document.getElementById('editShareProductLabel').textContent = product;
        document.getElementById('editSharePriceLabel').textContent = numPrice.toFixed(2) + ' د.ل';
        document.getElementById('editShareCompanyLabel').textContent = companyLabel;
        document.getElementById('labelEditShareCompany').textContent = companyLabel;
        document.getElementById('restorePercentBadge').textContent = `${almezoPercentLabel}% / ${companyPercentLabel}%`;

        document.getElementById('inputShareAlmezo').value = currentAlmezo.toFixed(2);
        document.getElementById('inputShareCompany').value = currentCompany.toFixed(2);

        const modal = document.getElementById('editCompanySaleShareModal');
        if (modal) modal.style.display = 'block';
    };

    window.closeEditCompanySaleShareModal = function () {
        const modal = document.getElementById('editCompanySaleShareModal');
        if (modal) modal.style.display = 'none';
    };

    window.onSalePriceInput = function (val) {
        const txInput = document.getElementById('editShareTxId');
        if (txInput) txInput.dataset.isRestored = 'false';

        const newPrice = parseFloat(val);
        if (!isNaN(newPrice) && newPrice >= 0) {
            document.getElementById('editShareSalePrice').value = newPrice;
            document.getElementById('editSharePriceLabel').textContent = newPrice.toFixed(2) + ' د.ل';

            const defPercent = parseFloat(document.getElementById('editShareDefaultAlmezoPercent').value) || 85;
            const almezoVal = newPrice * (defPercent / 100);
            const compVal = Math.max(0, newPrice - almezoVal);

            document.getElementById('inputShareAlmezo').value = almezoVal.toFixed(2);
            document.getElementById('inputShareCompany').value = compVal.toFixed(2);
        } else if (val === '') {
            document.getElementById('editShareSalePrice').value = '0';
            document.getElementById('editSharePriceLabel').textContent = '0.00 د.ل';
            document.getElementById('inputShareAlmezo').value = '0.00';
            document.getElementById('inputShareCompany').value = '0.00';
        }
    };

    window.onAlmezoShareInput = function (val) {
        const txInput = document.getElementById('editShareTxId');
        if (txInput) txInput.dataset.isRestored = 'false';

        const priceInput = document.getElementById('inputSalePrice');
        const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(document.getElementById('editShareSalePrice').value) || 0);
        const almezoVal = parseFloat(val);
        if (!isNaN(almezoVal)) {
            const compVal = Math.max(0, price - almezoVal);
            document.getElementById('inputShareCompany').value = compVal.toFixed(2);
        }
    };

    window.onCompanyShareInput = function (val) {
        const txInput = document.getElementById('editShareTxId');
        if (txInput) txInput.dataset.isRestored = 'false';

        const priceInput = document.getElementById('inputSalePrice');
        const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(document.getElementById('editShareSalePrice').value) || 0);
        const compVal = parseFloat(val);
        if (!isNaN(compVal)) {
            const almezoVal = Math.max(0, price - compVal);
            document.getElementById('inputShareAlmezo').value = almezoVal.toFixed(2);
        }
    };

    window.restoreDefaultCompanyShare = function () {
        const txInput = document.getElementById('editShareTxId');
        if (txInput) txInput.dataset.isRestored = 'true';

        const priceInput = document.getElementById('inputSalePrice');
        const price = priceInput ? (parseFloat(priceInput.value) || 0) : (parseFloat(document.getElementById('editShareSalePrice').value) || 0);
        const defPercent = parseFloat(document.getElementById('editShareDefaultAlmezoPercent').value) || 85;
        const almezoVal = price * (defPercent / 100);
        const compVal = Math.max(0, price - almezoVal);

        document.getElementById('inputShareAlmezo').value = almezoVal.toFixed(2);
        document.getElementById('inputShareCompany').value = compVal.toFixed(2);
    };

    window.saveCompanySaleShare = async function () {
        const txInput = document.getElementById('editShareTxId');
        const txId = txInput ? txInput.value : '';
        if (!txId) return;

        const isRestored = txInput && txInput.dataset.isRestored === 'true';
        const salePriceInput = document.getElementById('inputSalePrice');
        const salePrice = salePriceInput ? parseFloat(salePriceInput.value) : parseFloat(document.getElementById('editShareSalePrice').value);
        const almezoShare = parseFloat(document.getElementById('inputShareAlmezo').value);
        const companyShare = parseFloat(document.getElementById('inputShareCompany').value);

        if (isNaN(salePrice) || salePrice < 0) {
            if (typeof showToast === 'function') showToast('يرجى إدخال سعر بيع صحيح', 'error');
            else showAlert('يرجى إدخال سعر بيع صحيح');
            return;
        }

        if (isNaN(almezoShare) || almezoShare < 0 || isNaN(companyShare) || companyShare < 0) {
            if (typeof showToast === 'function') showToast('يرجى إدخال قيم صحيحة للحصص', 'error');
            else showAlert('يرجى إدخال قيم صحيحة للحصص');
            return;
        }

        const btn = document.querySelector('#editCompanySaleShareModal .edit-balances-modal-save');
        const oldText = btn ? btn.innerHTML : '';

        try {
            if (btn) { btn.innerHTML = 'جاري الحفظ...'; btn.disabled = true; }

            if (isRestored) {
                await db.collection('transactions').doc(txId).update({
                    price: salePrice,
                    almezoShare: firebase.firestore.FieldValue.delete(),
                    companyShare: firebase.firestore.FieldValue.delete(),
                    isCustomShare: firebase.firestore.FieldValue.delete()
                });
            } else {
                await db.collection('transactions').doc(txId).update({
                    price: salePrice,
                    almezoShare: almezoShare,
                    companyShare: companyShare,
                    isCustomShare: true
                });
            }

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_edit_company_sale_share',
                    category: 'admin',
                    severity: 'info',
                    title: 'تعديل يدوي لسعر وحصص عملية بيع شركة: ' + txId,
                    details: { txId: txId, price: salePrice, almezoShare: almezoShare, companyShare: companyShare }
                });
            }

            window.closeEditCompanySaleShareModal();
            if (typeof showToast === 'function') showToast('تم حفظ وتحديث سعر وحصص العملية بنجاح', 'success');

            // تحديث العرض فوراً
            if (window.searchCompanySales) window.searchCompanySales();
        } catch (err) {
            console.error('Error saving company sale share:', err);
            showAlert('فشل حفظ الحصص: ' + err.message);
        } finally {
            if (btn) { btn.innerHTML = oldText || '<i class="fas fa-save icon-spacing-left"></i> حفظ الحصص'; btn.disabled = false; }
        }
    };

    // دالة تصدير الفاتورة الرسمية كـ صورة عالية الدقة
    window.downloadCompanyInvoice = async function (triggerBtn) {
        const data = window.currentCompanyInvoiceData;
        if (!data || data.companyId === 'all') {
            if (typeof showToast === 'function') {
                showToast('يرجى اختيار شركة محددة أولاً لتنزيل فاتورة مبيعاتها المفصلة', 'warning');
            } else {
                showAlert('يرجى اختيار شركة محددة أولاً لتنزيل فاتورة مبيعاتها المفصلة');
            }
            return;
        }

        if (typeof html2canvas === 'undefined') {
            showAlert('مكتبة تصدير الصور غير متوفرة حالياً، يرجى تحديث الصفحة والمحاولة مجدداً');
            return;
        }

        const btn = triggerBtn || document.querySelector('.btn-download-company-invoice') || document.getElementById('btnDownloadCompanyInvoice');
        const oldBtnContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إعداد الفاتورة...';
        }

        try {
            const now = new Date();
            const issueDateFormatted = now.toLocaleDateString('en-GB') + ' - ' + now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
            const invoiceNumber = `INV-${data.companyId.toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

            let trRows = '';
            if (!data.transactions || data.transactions.length === 0) {
                trRows = `
                    <tr>
                        <td colspan="7" style="padding: 20px; text-align: center; color: #8b949e; border-bottom: 1px solid rgba(255,255,255,0.08);">
                            لا توجد مبيعات مسجلة لهذه الشركة خلال الفترة المحددة.
                        </td>
                    </tr>
                `;
            } else {
                data.transactions.forEach((item, i) => {
                    const tData = escRecordForHtml(item.data);
                    const price = item.price !== undefined ? item.price : (parseFloat(tData.price) || 0);
                    const almezoShare = item.almezoShare !== undefined ? item.almezoShare : (price * data.almezoPercent);
                    const companyShare = item.companyShare !== undefined ? item.companyShare : (price * data.companyPercent);
                    const isCustom = item.isCustom;

                    const timeStr = item.date.toLocaleDateString('en-GB') + ' ' + item.date.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
                    const staffName = (window.staffNamesCache && window.staffNamesCache[tData.staffId])
                        ? escH(window.staffNamesCache[tData.staffId].split(' ')[0])
                        : (tData.staffName ? tData.staffName.split(' ')[0] : (tData.performedBy || 'مندوب'));
                    const prod = (tData.product || 'منتج') + (tData.duration ? ` - ${tData.duration}` : '');
                    const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';

                    trRows += `
                        <tr style="background:${bg};">
                            <td style="padding:10px 8px; text-align:center; color:#8b949e; border-bottom:1px solid rgba(255,255,255,0.06);">${i + 1}</td>
                            <td style="padding:10px 8px; white-space:nowrap; direction:ltr; text-align:right; color:#cbd5e1; border-bottom:1px solid rgba(255,255,255,0.06);">${timeStr}</td>
                            <td style="padding:10px 8px; color:#f0f6fc; border-bottom:1px solid rgba(255,255,255,0.06); font-weight:600;">${staffName}</td>
                            <td style="padding:10px 8px; color:#f0f6fc; border-bottom:1px solid rgba(255,255,255,0.06);">${prod}</td>
                            <td style="padding:10px 8px; text-align:center; font-weight:700; color:#38bdf8; border-bottom:1px solid rgba(255,255,255,0.06);">${price.toFixed(2)} د.ل</td>
                            <td style="padding:10px 8px; text-align:center; font-weight:700; color:#4ade80; border-bottom:1px solid rgba(255,255,255,0.06);">
                                ${almezoShare.toFixed(2)} د.ل
                                ${isCustom ? ' <span style="font-size:0.7rem; color:#fbbf24; border:1px solid rgba(251,191,36,0.4); padding:1px 4px; border-radius:3px;">مخصص</span>' : ''}
                            </td>
                            <td style="padding:10px 8px; text-align:center; font-weight:700; color:#fbbf24; border-bottom:1px solid rgba(255,255,255,0.06);">${companyShare.toFixed(2)} د.ل</td>
                        </tr>
                    `;
                });
            }

            const invoiceWrapper = document.createElement('div');
            invoiceWrapper.style.position = 'fixed';
            invoiceWrapper.style.left = '-9999px';
            invoiceWrapper.style.top = '0';
            invoiceWrapper.style.width = '980px';
            invoiceWrapper.style.backgroundColor = '#0b0f19';
            invoiceWrapper.style.color = '#f0f6fc';
            invoiceWrapper.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
            invoiceWrapper.style.padding = '35px 40px';
            invoiceWrapper.style.direction = 'rtl';
            invoiceWrapper.style.boxSizing = 'border-box';
            invoiceWrapper.style.borderRadius = '14px';
            invoiceWrapper.style.border = '1px solid rgba(255,255,255,0.12)';
            invoiceWrapper.style.zIndex = '-9999';

            invoiceWrapper.innerHTML = `
                <!-- ترويسة الفاتورة -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid rgba(56, 189, 248, 0.3); padding-bottom: 22px; margin-bottom: 22px;">
                    <div>
                        <h2 style="margin: 0 0 6px 0; font-size: 1.6rem; color: #38bdf8; letter-spacing: -0.5px;">
                            سيرفرات الميزو - ALmEz0
                        </h2>
                        <p style="margin: 0; color: #94a3b8; font-size: 0.85rem;">
                            المنظومة الإدارية المتكاملة لخدمات البث والاشتراكات
                        </p>
                        <div style="display:inline-block; margin-top:10px; padding: 4px 12px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; color: #38bdf8; font-weight: 700; font-size: 0.82rem;">
                            كشف حساب وفاتورة مبيعات رسمية
                        </div>
                    </div>
                    <div style="text-align: left; direction: ltr;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: #f0f6fc; margin-bottom: 4px;">#${invoiceNumber}</div>
                        <div style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 3px;">تاريخ الإصدار: <span style="color:#f0f6fc;">${issueDateFormatted}</span></div>
                        <div style="font-size: 0.82rem; color: #94a3b8;">الفترة: <span style="color:#38bdf8; font-weight: 600;">${data.startDateStr} ➔ ${data.endDateStr}</span></div>
                    </div>
                </div>

                <!-- تفاصيل الشركة والفترة -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(22, 27, 34, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 14px 20px; margin-bottom: 20px;">
                    <div>
                        <span style="color: #94a3b8; font-size: 0.85rem;">اسم الشركة المعتمدة:</span>
                        <strong style="color: #ffffff; font-size: 1.25rem; margin-right: 8px;">${data.companyLabel}</strong>
                    </div>
                    <div>
                        <span style="color: #94a3b8; font-size: 0.85rem;">نسبة الاتفاق:</span>
                        <strong style="color: #4ade80; font-size: 1.15rem; margin-right: 8px;">الميزو ${data.almezoPercentLabel}%</strong>
                        <span style="color: #94a3b8; margin: 0 4px;">/</span>
                        <strong style="color: #fbbf24; font-size: 1.15rem;">${data.companyLabel} ${data.companyPercentLabel}%</strong>
                    </div>
                    <div>
                        <span style="color: #94a3b8; font-size: 0.85rem;">الجهة المصدرة:</span>
                        <strong style="color: #38bdf8; font-size: 0.95rem; margin-right: 8px;">إدارة سيرفرات الميزو</strong>
                    </div>
                </div>

                <!-- الملخص المالي (4 بطاقات) -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
                    <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 10px; padding: 14px; text-align: center;">
                        <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px;">إجمالي المبيعات</div>
                        <div style="font-size: 1.35rem; font-weight: 800; color: #38bdf8;">${data.totalSales.toFixed(2)} <span style="font-size: 0.8rem; font-weight: 400;">د.ل</span></div>
                    </div>
                    <div style="background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.35); border-radius: 10px; padding: 14px; text-align: center;">
                        <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px;">إجمالي حصة الميزو (${data.almezoPercentLabel}%)</div>
                        <div style="font-size: 1.35rem; font-weight: 800; color: #4ade80;">${data.totalAlmezoShare.toFixed(2)} <span style="font-size: 0.8rem; font-weight: 400;">د.ل</span></div>
                    </div>
                    <div style="background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.35); border-radius: 10px; padding: 14px; text-align: center;">
                        <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px;">إجمالي حصة ${data.companyLabel} (${data.companyPercentLabel}%)</div>
                        <div style="font-size: 1.35rem; font-weight: 800; color: #fbbf24;">${data.totalCompanyShare.toFixed(2)} <span style="font-size: 0.8rem; font-weight: 400;">د.ل</span></div>
                    </div>
                    <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 14px; text-align: center;">
                        <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px;">عدد العمليات</div>
                        <div style="font-size: 1.35rem; font-weight: 800; color: #c084fc;">${data.totalCount} <span style="font-size: 0.8rem; font-weight: 400;">عملية</span></div>
                    </div>
                </div>

                <!-- جدول العمليات -->
                <div style="margin-bottom: 24px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.86rem; text-align: right;">
                        <thead>
                            <tr style="background: rgba(255, 255, 255, 0.08); color: #94a3b8; font-weight: 700;">
                                <th style="padding: 10px 8px; width: 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.12);">#</th>
                                <th style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.12);">التاريخ والوقت</th>
                                <th style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.12);">المندوب / البائع</th>
                                <th style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.12);">المنتج / الباقة</th>
                                <th style="padding: 10px 8px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.12);">سعر البيع</th>
                                <th style="padding: 10px 8px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.12);">حصة الميزو (${data.almezoPercentLabel}%)</th>
                                <th style="padding: 10px 8px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.12);">حصة ${data.companyLabel} (${data.companyPercentLabel}%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trRows}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(255, 255, 255, 0.06); font-weight: 800; border-top: 2px solid rgba(255,255,255,0.15);">
                                <td colspan="4" style="padding: 12px 10px; color: #ffffff;">الإجمالي الكلي للفترة:</td>
                                <td style="padding: 12px 10px; text-align: center; color: #38bdf8; font-size: 1.05rem;">${data.totalSales.toFixed(2)} د.ل</td>
                                <td style="padding: 12px 10px; text-align: center; color: #4ade80; font-size: 1.05rem;">${data.totalAlmezoShare.toFixed(2)} د.ل</td>
                                <td style="padding: 12px 10px; text-align: center; color: #fbbf24; font-size: 1.05rem;">${data.totalCompanyShare.toFixed(2)} د.ل</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- تذييل الفاتورة والتوقيعات -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 15px; border-top: 1px dashed rgba(255, 255, 255, 0.15);">
                    <div style="font-size: 0.78rem; color: #64748b;">
                        <div>* تم استخراج هذه الفاتورة الرسمية آلياً عبر منظومة سيرفرات الميزو.</div>
                        <div>* جميع المبالغ المذكورة بالدينار الليبي (د.ل).</div>
                    </div>
                    <div style="display: flex; gap: 40px; text-align: center;">
                        <div>
                            <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 30px;">اعتماد إدارة سيرفرات الميزو</div>
                            <div style="border-top: 1px solid #475569; width: 140px; margin: 0 auto;"></div>
                        </div>
                        <div>
                            <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 30px;">توقيع / استلام ${data.companyLabel}</div>
                            <div style="border-top: 1px solid #475569; width: 140px; margin: 0 auto;"></div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(invoiceWrapper);

            // إتاحة وقت قصير لاكتمال تصيير الخطوط
            await new Promise(r => setTimeout(r, 120));

            const canvas = await html2canvas(invoiceWrapper, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0b0f19',
                logging: false
            });

            document.body.removeChild(invoiceWrapper);

            const cleanStart = data.startDateStr.replace(/\//g, '-');
            const cleanEnd = data.endDateStr.replace(/\//g, '-');
            const fileName = `فاتورة_مبيعات_${data.companyLabel}_من_${cleanStart}_إلى_${cleanEnd}.png`;

            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (typeof showToast === 'function') {
                showToast(`تم تنزيل فاتورة مبيعات ${data.companyLabel} بنجاح`, 'success');
            }
        } catch (err) {
            console.error('Error generating company invoice:', err);
            showAlert('حدث خطأ أثناء إنشاء الفاتورة: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldBtnContent || '<i class="fas fa-file-invoice"></i> تنزيل الفاتورة كـ صورة عالية الدقة';
            }
        }
    };

    // توافق مع أي استدعاء قديم
    function populateCompanyMonthSelect() {
        if (window.initCompanySalesSection) window.initCompanySalesSection();
    }
    window.filterCompanyMonthly = function () {
        if (window.searchCompanySales) window.searchCompanySales();
    };

    function renderRealtimeBalances() {
        const grid = document.getElementById('staffBalancesGrid');
        if (!grid) return;

        if (!staffDocs || staffDocs.length === 0) {
            grid.innerHTML = '<p style="text-align:center; width:100%; color:var(--text-secondary);">لا يوجد مناديب مسجلين حالياً.</p>';
            return;
        }

        window.staffNamesCache = {};
        let html = '';

        staffDocs.forEach(doc => {
            const staffData = doc.data();
            const staffId = doc.id;
            const staffName = escH(staffData.firstName ? staffData.firstName.trim() : (staffData.name ? staffData.name.trim().split(' ')[0] : (staffData.phone || 'مندوب غير معروف')));

            window.staffNamesCache[staffId] = staffName;
            const isIbrahim = staffName.includes('ابراهيم');

            // ترحيل تلقائي لأي أرباح أسبوع سابق لم تُدفع إلى خانة "مستحقات" (للمناديب الثلاثة فقط)
            if (typeof window.getCurrentWeekKey === 'function' && staffData.lastWeekStart !== window.getCurrentWeekKey()) {
                window.rolloverUnpaidWeeklyProfit(staffId);
            }

            // مجاميع العمليات بعد آخر إقفال للحساب (MizoLedger)؛ ما قبله داخل الأرصدة الأساسية
            const sums = computeStaffLedgerSums(staffId, staffName, isIbrahim, transactionsDocs,
                (t) => !window.MizoLedger || window.MizoLedger.counts(t));
            const { libyanaSales, libyanaWithdrawals, almadarSales, almadarWithdrawals, cashSales, cashWithdrawals } = sums;

            const baseLibyana = parseFloat(staffData.baseLibyana) || 0;
            const baseAlmadar = parseFloat(staffData.baseAlmadar) || 0;
            const baseCash = parseFloat(staffData.baseCash) || 0;
            const baseProfit = parseFloat(staffData.baseProfit) || 0;
            const duesOwed = parseFloat(staffData.duesOwed) || 0;
            const libyanaTotal = libyanaSales - libyanaWithdrawals + baseLibyana;
            const almadarTotal = almadarSales - almadarWithdrawals + baseAlmadar;
            const cashTotal = cashSales - cashWithdrawals + baseCash;

            // حسابات ابراهيم (المصرفي / سداد / USDT) ضمن sums أعلاه
            const { bankSales, sadadSales, usdtSales, bankWithdrawals, sadadWithdrawals, usdtWithdrawals } = sums;

            const baseBank = parseFloat(staffData.baseBank) || 0;
            const baseSadad = parseFloat(staffData.baseSadad) || 0;
            const baseUsdt = parseFloat(staffData.baseUsdt) || 0;

            const bankTotal = bankSales - bankWithdrawals + baseBank;
            const sadadTotal = sadadSales - sadadWithdrawals + baseSadad;
            const usdtTotal = usdtSales - usdtWithdrawals + baseUsdt;

            // القيم الحية (من العمليات) لكل مندوب: نافذة التعديل تحسب منها لحظة الحفظ، لا من
            // أرقام الشاشة لحظة فتح النافذة — بيعة تُسجَّل أثناء التعديل لا تُفسد الحساب.
            window.staffLive = window.staffLive || {};
            window.staffLive[staffId] = {
                name: staffName,
                isIbrahim: isIbrahim,
                netLibyana: libyanaSales - libyanaWithdrawals,
                netAlmadar: almadarSales - almadarWithdrawals,
                netCash: cashSales - cashWithdrawals,
                netBank: bankSales - bankWithdrawals,
                netSadad: sadadSales - sadadWithdrawals,
                netUsdt: usdtSales - usdtWithdrawals
            };
            const undoStack = Array.isArray(staffData.balanceUndo) ? staffData.balanceUndo : [];
            const redoStack = Array.isArray(staffData.balanceRedo) ? staffData.balanceRedo : [];
            const lastUndo = undoStack.length ? undoStack[undoStack.length - 1] : null;
            const lastRedo = redoStack.length ? redoStack[redoStack.length - 1] : null;
            const escAttr = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            const undoTitle = lastUndo ? 'تراجع عن: ' + escAttr(lastUndo.summary) : 'لا يوجد تعديل للتراجع عنه';
            const redoTitle = lastRedo ? 'إعادة: ' + escAttr(lastRedo.summary) : 'لا يوجد ما يُعاد';
            const profitAdvance = parseFloat(staffData.profitAdvance) || 0;

            // (تم إيقاف الكتابة التلقائية لتخفيف الضغط على قاعدة البيانات ولأن المندوب يحسبها بنفسه)
            // const updates = {};
            // if (staffData.currentLibyana !== libyanaTotal) updates.currentLibyana = libyanaTotal;
            // if (staffData.currentAlmadar !== almadarTotal) updates.currentAlmadar = almadarTotal;

            // if (Object.keys(updates).length > 0) {
            //     db.collection('customers').doc(staffId).update(updates).catch(err => console.error("Error updating staff balances:", err));
            // }

            // إضافة بطاقة المندوب
            html += `
            <div class="main-category-card staff-card right-text" style="position: relative; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                <div style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: none; margin-bottom: 10px; width: 100%; gap: 15px;">
                        <h3 class="staff-form-title" style="margin: 0;"><i class="fas fa-user-tie"></i> ${staffName}</h3>
                        <div class="staff-edit-actions">
                            <button type="button" class="balance-step-btn" title="${undoTitle}" ${undoStack.length ? '' : 'disabled'} onclick="undoBalanceEdit('${staffId}')"><i class="fas fa-rotate-left"></i></button>
                            <button type="button" class="balance-step-btn" title="${redoTitle}" ${redoStack.length ? '' : 'disabled'} onclick="redoBalanceEdit('${staffId}')"><i class="fas fa-rotate-right"></i></button>
                            <button class="edit-balance-btn" style="background: linear-gradient(135deg, #4CAF50, #2E7D32); border: none; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3); display: flex; align-items: center; gap: 6px;" onclick="editBalances('${staffId}')"><i class="fas fa-edit"></i> تعديل</button>
                        </div>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 15px;">رقم الهاتف: <span style="direction:ltr; display:inline-block;">${staffData.phone}</span></p>
                </div>
                
                <div class="staff-balances-container">
                    <div class="balance-card balance-card-libyana">
                        <h4 class="balance-card-title">مطلوب ليبيانا</h4>
                        <div class="balance-card-amount balance-val-libyana">
                            <span class="balance-val-amount">${libyanaTotal.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-almadar">
                        <h4 class="balance-card-title">مطلوب المدار</h4>
                        <div class="balance-card-amount balance-val-almadar">
                            <span class="balance-val-amount">${almadarTotal.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-cash" data-staff-id="${staffId}">
                        <h4 class="balance-card-title">مطلوب كاش</h4>
                        <div class="balance-card-amount balance-val-cash">
                            <span class="balance-val-amount card-cash-amount">${cashTotal.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    ${isIbrahim ? `
                    <div class="balance-card balance-card-profit balance-card-bank" data-staff-id="${staffId}" data-staff-name="${staffName}">
                        <h4 class="balance-card-title">حساب المصرفي</h4>
                        <div class="balance-card-amount balance-val-bank">
                            <span class="balance-val-amount card-bank-amount">${bankTotal.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-dues balance-card-sadad" data-staff-id="${staffId}">
                        <h4 class="balance-card-title">سداد</h4>
                        <div class="balance-card-amount balance-val-sadad">
                            <span class="balance-val-amount card-sadad-amount">${sadadTotal.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-net balance-card-usdt" data-staff-id="${staffId}">
                        <h4 class="balance-card-title">USDT</h4>
                        <div class="balance-card-amount balance-val-usdt">
                            <span class="balance-val-amount card-usdt-amount">${usdtTotal.toFixed(2)}</span> <span class="balance-val-currency">$</span>
                        </div>
                    </div>
                    ` : `
                    <div class="balance-card balance-card-profit" data-staff-id="${staffId}" data-staff-name="${staffName}" data-cash-total="${cashTotal}" data-base-profit="${baseProfit}" data-dues-owed="${duesOwed}" data-profit-advance="${profitAdvance}">
                        <h4 class="balance-card-title card-profit-title">ربح الأسبوع</h4>
                        <div class="balance-card-amount balance-val-profit">
                            <span class="balance-val-amount card-profit-amount">0.00</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-dues" data-staff-id="${staffId}">
                        <h4 class="balance-card-title">مستحقات</h4>
                        <div class="balance-card-amount balance-val-dues">
                            <span class="balance-val-amount card-dues-amount">${duesOwed.toFixed(2)}</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    <div class="balance-card balance-card-net" data-staff-id="${staffId}">
                        <h4 class="balance-card-title card-net-title">الصافي</h4>
                        <div class="balance-card-amount balance-val-net">
                            <span class="balance-val-amount card-net-amount">0.00</span> <span class="balance-val-currency">د.ل</span>
                        </div>
                    </div>
                    `}
                </div>
            </div>
            `;
        });

        grid.innerHTML = html;
        centerOrphanRow(grid);

        // تحديث صافي الربح والكاش المعروض بناءً على آخر أرباح تم حسابها
        updateStaffProfitsFromLatestTotal();

        // استدعاء السجل بعد أن تم تعبئة نافذة التخزين المؤقت للأسماء
        if (window.fetchMasterHistory && !window.masterHistoryInitialized) {
            window.masterHistoryInitialized = true;
            window.fetchMasterHistory();
        }
    }

    /**
     * مجموع ربح الأسبوع الحالي (من السبت) من كل العمليات. كان ربح البطاقات يُؤخذ من فترة
     * سجل المبيعات المعروضة، فالبحث عن أسبوع سابق كان يغيّر ربح الأسبوع والصافي على البطاقات،
     * وإن ضُغط "تعديل" وقتها حُفظ الحساب على أرقام ذلك الأسبوع.
     */
    function currentWeekProfitTotal() {
        const start = (typeof window.getLibyaWeekStart === 'function') ? window.getLibyaWeekStart() : new Date(0);
        let total = 0;
        transactionsDocs.forEach(doc => {
            const t = doc.data();
            if (t.type !== 'sale') return;
            const ts = (t.timestamp && typeof t.timestamp.toDate === 'function') ? t.timestamp.toDate() : new Date();
            if (ts >= start) total += window.saleCommission(t);
        });
        return total;
    }
    window.currentWeekProfitTotal = currentWeekProfitTotal;

    function updateStaffProfitsFromLatestTotal() {
        const weekTotal = currentWeekProfitTotal();
        document.querySelectorAll('.balance-card-profit').forEach(card => {
            if (card.classList.contains('balance-card-bank')) return; // بطاقة المصرفي عند ابراهيم
            const staffId = card.getAttribute('data-staff-id');
            const staffName = card.getAttribute('data-staff-name') || '';
            const rawCash = parseFloat(card.getAttribute('data-cash-total')) || 0;
            const baseProfit = parseFloat(card.getAttribute('data-base-profit')) || 0;
            const duesOwed = parseFloat(card.getAttribute('data-dues-owed')) || 0;
            const advance = parseFloat(card.getAttribute('data-profit-advance')) || 0;

            const earnedProfit = window.staffProfitShare(staffName, weekTotal) + baseProfit;
            // الصافي = مطلوب كاش − (المستحقات + ربح الأسبوع − السلفة). موجب: على المندوب
            const netAmount = rawCash - (duesOwed + earnedProfit - advance);

            const profitSpan = card.querySelector('.card-profit-amount');
            if (profitSpan) profitSpan.textContent = earnedProfit.toFixed(2);
            const profitTitle = card.querySelector('.card-profit-title');
            if (profitTitle) profitTitle.textContent = advance > 0.004 ? 'ربح الأسبوع (مدفوع مقدماً ' + advance.toFixed(2) + ')' : 'ربح الأسبوع';

            const netCard = document.querySelector(`.balance-card-net[data-staff-id="${staffId}"]`);
            if (netCard) {
                const netSpan = netCard.querySelector('.card-net-amount');
                const netTitle = netCard.querySelector('.card-net-title');
                if (netTitle) netTitle.textContent = netAmount > 0.004 ? 'الصافي — على المندوب' : (netAmount < -0.004 ? 'الصافي — للمندوب' : 'الصافي');
                if (netSpan) {
                    netSpan.textContent = Math.abs(netAmount).toFixed(2);
                    netSpan.style.color = netAmount > 0.004 ? 'var(--danger-color, #f87171)'
                        : (netAmount < -0.004 ? 'var(--success-color, #4ade80)' : '#ffffff');
                }
            }
        });
    }

    // =============================================
    // دوال فرز وعرض سجل العمليات
    // =============================================
    window.parseDurationMonths = function (durationStr) {
        if (!durationStr) return 0;
        const s = durationStr.toString().trim();
        const match = s.match(/\d+/);
        if (match) {
            return parseInt(match[0], 10);
        }
        if (s.includes('سنتين')) return 24;
        if (s.includes('سنة') || s.includes('عام')) return 12;
        if (s.includes('شهر') && !s.includes('أشهر') && !s.includes('اشهر')) return 1;
        return 999;
    };

    window.getGroupSortedItems = function (items, sortKey, sortDir) {
        if (!items || !items.length) return [];
        const sorted = [...items];
        sorted.sort((a, b) => {
            let res = 0;
            if (sortKey === 'time') {
                const tA = a.d ? a.d.getTime() : 0;
                const tB = b.d ? b.d.getTime() : 0;
                res = tA - tB;
            } else if (sortKey === 'price') {
                const getVal = (x) => {
                    if (x.data.type === 'debt_transfer') {
                        const factor = (window.currentStaffRules && window.currentStaffRules.transfers && !isNaN(window.currentStaffRules.transfers.debtCreditFactor))
                            ? Number(window.currentStaffRules.transfers.debtCreditFactor)
                            : 0.75;
                        const rawVal = (x.data.originalCredit !== undefined && x.data.originalCredit !== null && x.data.originalCredit !== '')
                            ? Number(x.data.originalCredit)
                            : ((x.data.wallet === 'ليبيانا' || x.data.wallet === 'المدار') && x.data.amount ? Math.round(Number(x.data.amount) / factor) : Number(x.data.amount));
                        return isNaN(rawVal) ? 0 : rawVal;
                    }
                    return parseFloat(x.data.price !== undefined ? x.data.price : x.data.amount) || 0;
                };
                res = getVal(a) - getVal(b);
            } else if (sortKey === 'staff') {
                const sA = (window.staffNamesCache && window.staffNamesCache[a.data.staffId]) || a.data.staffId || '';
                const sB = (window.staffNamesCache && window.staffNamesCache[b.data.staffId]) || b.data.staffId || '';
                res = sA.localeCompare(sB, 'ar');
            } else if (sortKey === 'product') {
                const prodA = (a.data.product || a.data.reason || a.data.debtor || '').toString().trim();
                const prodB = (b.data.product || b.data.reason || b.data.debtor || '').toString().trim();
                const nameComp = prodA.localeCompare(prodB, 'ar');
                if (nameComp !== 0) {
                    res = nameComp;
                } else {
                    // نفس نوع المنتج (مثل: سيرفر اكس): ترتيب المدد تصاعدياً (3 أشهر ثم 6 ثم 12 شهر)
                    const durA = window.parseDurationMonths(a.data.duration);
                    const durB = window.parseDurationMonths(b.data.duration);
                    if (durA !== durB) {
                        res = durA - durB;
                    } else {
                        // نفس الباقة: الأحدث أولاً
                        const tA = a.d ? a.d.getTime() : 0;
                        const tB = b.d ? b.d.getTime() : 0;
                        res = tB - tA;
                    }
                }
            } else if (sortKey === 'type') {
                const typeWeight = { sale: 1, debt_transfer: 2, withdrawal: 3 };
                const wA = typeWeight[a.data.type] || 9;
                const wB = typeWeight[b.data.type] || 9;
                res = wA - wB;
            } else if (sortKey === 'method') {
                const mA = (a.data.method || a.data.wallet || '').toString();
                const mB = (b.data.method || b.data.wallet || '').toString();
                res = mA.localeCompare(mB, 'ar');
            }
            return sortDir === 'desc' ? -res : res;
        });
        return sorted;
    };

    window.renderGroupTableRows = function (items) {
        if (!items || !items.length) {
            return `
                <tr>
                    <td colspan="7" class="table-empty-message" style="text-align: center; padding: 20px; color: #8b949e;">
                        لا توجد عمليات مسجلة
                    </td>
                </tr>
            `;
        }

        let rowsHtml = '';
        items.forEach(item => {
            const data = escRecordForHtml(item.data);
            const formattedTime = new Intl.DateTimeFormat('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: true
            }).format(item.d);

            const dateStrHtml = `<span dir="ltr">${formattedTime}</span>`;

            const staffName = (window.staffNamesCache && window.staffNamesCache[data.staffId])
                ? escH(window.staffNamesCache[data.staffId].split(' ')[0])
                : (data.staffId || 'مندوب');

            if (data.type === 'sale') {
                let methodDisplay = data.method || '-';
                let rName = (data.creditRecipientName ? data.creditRecipientName.split(' ')[0] : '') || (data.creditRecipientId && window.staffNamesCache && window.staffNamesCache[data.creditRecipientId]);
                if ((data.method === 'ليبيانا' || data.method === 'المدار') && rName) {
                    methodDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(الرصيد لـ: ${rName.split(' ')[0]})</span>`;
                } else if (data.method === 'دفع مشترك (ليبيانا + مدار)' && data.splitDetails) {
                    const lName = data.splitDetails.libyanaRecipientName ? data.splitDetails.libyanaRecipientName.split(' ')[0] : (data.splitDetails.libyanaRecipientId && window.staffNamesCache && window.staffNamesCache[data.splitDetails.libyanaRecipientId] ? escH(window.staffNamesCache[data.splitDetails.libyanaRecipientId].split(' ')[0]) : '');
                    const aName = data.splitDetails.almadarRecipientName ? data.splitDetails.almadarRecipientName.split(' ')[0] : (data.splitDetails.almadarRecipientId && window.staffNamesCache && window.staffNamesCache[data.splitDetails.almadarRecipientId] ? escH(window.staffNamesCache[data.splitDetails.almadarRecipientId].split(' ')[0]) : '');
                    methodDisplay = `<span style="font-weight:bold; color:var(--primary-color);">دفع مشترك:</span><br>` +
                        `<span style="font-size:0.75rem; color:#c084fc;">ليبيانا: ${data.splitDetails.libyanaAmount} د.ل (${lName})</span><br>` +
                        `<span style="font-size:0.75rem; color:#81c784;">المدار: ${data.splitDetails.almadarAmount} د.ل (${aName})</span>`;
                }
                let badgeText = 'مبيعة';
                const isIbrTrans = staffName.includes('ابراهيم');
                const isDirectWithoutProduct = (data.isDirectSale || data.product === 'مبيعة مباشرة' || !data.duration);
                if (isIbrTrans && isDirectWithoutProduct) {
                    const m = (data.method || '').trim();
                    if (m === 'تحويلات مصرفية' || m.includes('مصرف')) {
                        badgeText = 'اضافة رصيد مصرفي';
                    } else if (m === 'سداد' || m.includes('سداد')) {
                        badgeText = 'اضافة سداد';
                    } else if (m.toUpperCase() === 'USDT' || m.toUpperCase().includes('USDT')) {
                        badgeText = 'اضافة USDT';
                    } else if (m === 'كاش') {
                        badgeText = 'اضافة كاش';
                    } else if (m === 'ليبيانا' || m === 'المدار' || m.includes('مشترك')) {
                        badgeText = 'اضافة رصيد';
                    }
                }
                rowsHtml += `
                    <tr>
                        <td><i class="fas fa-user-tie" style="color:var(--primary-color);"></i> ${staffName}</td>
                        <td>${dateStrHtml}</td>
                        <td><span class="badge badge-sale">${badgeText}</span></td>
                        <td>${data.product || ''} ${data.duration ? ' - ' + data.duration : ''}</td>
                        <td>${methodDisplay}</td>
                        <td><strong style="color:var(--success-color);">${data.price}</strong></td>
                        <td>
                            <button class="btn-edit-trans" onclick="openEditSaleModal('${item.id}')" title="تعديل العملية"><i class="fas fa-pen"></i></button>
                            <button class="btn-delete-trans" onclick="deleteTransaction('${item.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;

                // تخزين بيانات العملية في ذاكرة مؤقتة عالمية لاستخدامها عند فتح نافذة التعديل
                window.masterHistoryDocsCache = window.masterHistoryDocsCache || {};
                // من البيانات الأصلية لا النسخة المُهرَّبة للعرض، وإلا ظهر & كـ &amp; في نافذة التعديل وحُفظ هكذا
                const raw = item.data;
                window.masterHistoryDocsCache[item.id] = {
                    product: raw.product || '',
                    duration: raw.duration || '',
                    method: raw.method || '',
                    price: raw.price || 0,
                    timestamp: raw.timestamp || null
                };
            } else if (data.type === 'withdrawal') {
                let badgeText = 'سحب رصيد';
                const w = (data.wallet || '').trim();
                if (w === 'كاش') badgeText = 'سحب كاش';
                else if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) badgeText = 'سحب مصرفي';
                else if (w === 'سداد' || w.includes('سداد')) badgeText = 'سحب سداد';
                else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) badgeText = 'سحب USDT';

                const debtorFirst = data.debtor ? data.debtor.split(' ')[0] : '';
                const displayReason = data.reason || (debtorFirst ? `من: ${debtorFirst}` : '-');
                let walletDisplay = data.wallet || '-';
                if (debtorFirst && data.reason && data.reason !== data.debtor) {
                    walletDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(من: ${debtorFirst})</span>`;
                }
                rowsHtml += `
                    <tr>
                        <td><i class="fas fa-user-tie" style="color:var(--primary-color);"></i> ${staffName}</td>
                        <td>${dateStrHtml}</td>
                        <td><span class="badge badge-withdrawal">${badgeText}</span></td>
                        <td>${displayReason}</td>
                        <td>${walletDisplay}</td>
                        <td><strong style="color:var(--danger-color);">${data.amount}</strong></td>
                        <td><button class="btn-delete-trans" onclick="deleteTransaction('${item.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `;
            } else if (data.type === 'debt_transfer') {
                const debtorFirst = data.debtor ? data.debtor.split(' ')[0] : '';
                const factor = (window.currentStaffRules && window.currentStaffRules.transfers && !isNaN(window.currentStaffRules.transfers.debtCreditFactor))
                    ? Number(window.currentStaffRules.transfers.debtCreditFactor)
                    : 0.75;
                const rawVal = (data.originalCredit !== undefined && data.originalCredit !== null && data.originalCredit !== '')
                    ? Number(data.originalCredit)
                    : ((data.wallet === 'ليبيانا' || data.wallet === 'المدار') && data.amount ? Math.round(Number(data.amount) / factor) : Number(data.amount));
                const transferVal = isNaN(rawVal) ? (data.originalCredit || data.amount) : (rawVal % 1 === 0 ? rawVal : rawVal.toFixed(2));
                let badgeText = 'سحب رصيد';
                const w = (data.wallet || '').trim();
                if (w === 'كاش') badgeText = 'سحب كاش';
                else if (w === 'حساب المصرفي' || w === 'تحويلات مصرفية' || w.includes('مصرف')) badgeText = 'سحب مصرفي';
                else if (w === 'سداد' || w.includes('سداد')) badgeText = 'سحب سداد';
                else if (w.toUpperCase() === 'USDT' || w.toUpperCase().includes('USDT')) badgeText = 'سحب USDT';

                const displayReason = data.reason || (debtorFirst ? `من: ${debtorFirst}` : '-');
                let walletDisplay = data.wallet || '-';
                if (debtorFirst && data.reason && data.reason !== data.debtor) {
                    walletDisplay += ` <br><span style="font-size:0.75rem; color:#888;">(من: ${debtorFirst})</span>`;
                }
                rowsHtml += `
                    <tr>
                        <td><i class="fas fa-user-tie" style="color:var(--primary-color);"></i> ${staffName}</td>
                        <td>${dateStrHtml}</td>
                        <td><span class="badge badge-debt">${badgeText}</span></td>
                        <td>${displayReason}</td>
                        <td>${walletDisplay}</td>
                        <td><strong style="color:#ff9800;">${transferVal}</strong></td>
                        <td><button class="btn-delete-trans" onclick="deleteTransaction('${item.id}')" title="إلغاء العملية"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `;
            }
        });

        return rowsHtml;
    };

    // =============================================
    // السجل العام للعمليات
    // =============================================
    window.fetchMasterHistory = function (startDate = null, endDate = null) {
        const container = document.getElementById('masterHistoryContainer');
        if (!container) return;

        container.innerHTML = '<div class="table-empty-message mt-20">جاري جلب البيانات...</div>';

        let query = db.collection('transactions');

        if (!startDate && !endDate) {
            const defWeek = (window.getDefaultWeekRange ? window.getDefaultWeekRange() : null);
            if (defWeek) {
                startDate = defWeek.start;
                endDate = defWeek.end;
            } else {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                const day = d.getDay();
                const diff = (day === 6) ? 0 : (day + 1);
                d.setDate(d.getDate() - diff);
                startDate = d;
            }
        }

        if (startDate) {
            query = query.where('timestamp', '>=', startDate);
        }
        if (endDate) {
            query = query.where('timestamp', '<=', endDate);
        }

        if (!productsLoaded) {
            pendingMasterHistory = true;
            return;
        }

        // تم إزالة الحد (limit) بدون ترتيب لأن ذلك يتسبب في إرجاع مستندات عشوائية (أو أقدم المستندات) 
        // query = query.limit(500);

        if (window.masterHistoryUnsubscribe) {
            window.masterHistoryUnsubscribe();
        }

        window.masterHistoryUnsubscribe = query.onSnapshot(snapshot => {
            let totalProfits = 0;
            const profitsElement = document.getElementById('totalProfitsValue');

            if (snapshot.empty) {
                container.innerHTML = '<div class="table-empty-message mt-20">لا توجد عمليات مسجلة في هذه الفترة</div>';
                if (profitsElement) profitsElement.textContent = '0.00 د.ل';
                const periodBadge = document.getElementById('periodSalesBadge');
                if (periodBadge) periodBadge.textContent = '0';
            }

            const groups = {};
            const daysArr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

            let docsArr = [];
            snapshot.forEach(doc => {
                docsArr.push({ id: doc.id, data: doc.data() });
            });

            // الترتيب في جافاسكريبت لتفادي مشاكل الفهارس في فايربيز
            docsArr.sort((a, b) => {
                const t1 = a.data.timestamp ? a.data.timestamp.toMillis() : 0;
                const t2 = b.data.timestamp ? b.data.timestamp.toMillis() : 0;
                return t2 - t1; // تنازلي
            });

            docsArr.forEach(item => {
                const data = item.data;
                const docId = item.id;

                if (data.type === 'sale') {
                    totalProfits += window.saleCommission(data);
                }
                let d = new Date();
                if (data.timestamp) {
                    d = data.timestamp.toDate();
                }

                const dateStr = d.toLocaleDateString('en-GB');
                const dayName = daysArr[d.getDay()];
                const groupKey = `يوم ${dayName} ${dateStr}`;

                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push({ id: docId, data: data, d: d });
            });

            window.masterGroupsData = groups;
            window.masterPeriodDocs = docsArr;
            window.masterPeriodFilter = {
                startDate: startDate,
                endDate: endDate
            };

            const companyMethods = ['المظلة', 'انيس', 'بوينت', 'Bn+'];
            const periodSalesItems = docsArr.filter(i => {
                if (!i.data || i.data.type !== 'sale') return false;
                if (companyMethods.includes(i.data.method)) return false;
                const norm = (i.data.product || '').trim().replace(/ه/g, 'ة');
                if (i.data.isDirectSale || norm === 'مبيعة مباشرة' || norm.includes('مبيعة مباشرة')) return false;
                return true;
            });
            const periodBadge = document.getElementById('periodSalesBadge');
            if (periodBadge) {
                periodBadge.textContent = periodSalesItems.length;
            }

            if (!snapshot.empty) {
                let html = '';
                let groupIndex = 0;

                for (const groupKey in groups) {
                    groupIndex++;
                    const tableId = `salesTable_${groupIndex}`;
                    const groupItems = groups[groupKey];
                    const salesCount = groupItems.filter(i => {
                        if (!i.data || i.data.type !== 'sale') return false;
                        const norm = (i.data.product || '').trim().replace(/ه/g, 'ة');
                        if (i.data.isDirectSale || norm === 'مبيعة مباشرة' || norm.includes('مبيعة مباشرة')) return false;
                        return true;
                    }).length;

                    // إعداد الترتيب الحالي للمجموعة (الافتراضي: الوقت تنازلي)
                    window.masterGroupsSort = window.masterGroupsSort || {};
                    if (!window.masterGroupsSort[groupKey]) {
                        window.masterGroupsSort[groupKey] = { key: 'time', dir: 'desc' };
                    }
                    const activeSort = window.masterGroupsSort[groupKey];
                    const sortedItems = getGroupSortedItems(groupItems, activeSort.key, activeSort.dir);
                    const rowsHtml = renderGroupTableRows(sortedItems);

                    html += `
                      <div class="sales-log-header-bar" data-group-key="${encodeURIComponent(groupKey)}">
                          <div class="sales-log-header-right">
                              <h4 class="page-title table-section-title" style="margin:0; font-size:1.15rem; color:var(--blue-accent); display:flex; align-items:center; gap:8px;">
                                  <i class="fas fa-calendar-alt"></i> سجل مبيعات ${groupKey}
                              </h4>
                              <span class="sales-count-pill" title="عدد العمليات الكلي">${groupItems.length} عملية</span>
                          </div>
                          <div class="sales-log-header-left">
                              <!-- زر إجمالي مبيعات المنتجات المفصل (فوق عمود الإجراءات بالجانب الأيسر) -->
                              <button type="button" class="btn-product-summary" onclick="openProductSalesSummary('${encodeURIComponent(groupKey)}')" title="عرض إجمالي مبيعات كل منتج بالتفصيل">
                                  <i class="fas fa-chart-pie"></i> إجمالي مبيعات المنتجات
                                  <span class="summary-btn-badge" title="عدد المبيعات">${salesCount}</span>
                              </button>

                              <!-- قائمة الفرز والترتيب -->
                              <div class="sales-sort-wrap" title="ترتيب السجل حسب">
                                  <i class="fas fa-sort-amount-down sales-sort-icon"></i>
                                  <select class="sales-sort-select" onchange="handleGroupSortSelect('${encodeURIComponent(groupKey)}', this.value)">
                                      <option value="time-desc" ${activeSort.key === 'time' && activeSort.dir === 'desc' ? 'selected' : ''}>الوقت (الأحدث أولاً)</option>
                                      <option value="time-asc" ${activeSort.key === 'time' && activeSort.dir === 'asc' ? 'selected' : ''}>الوقت (الأقدم أولاً)</option>
                                      <option value="price-desc" ${activeSort.key === 'price' && activeSort.dir === 'desc' ? 'selected' : ''}>القيمة (الأعلى أولاً)</option>
                                      <option value="price-asc" ${activeSort.key === 'price' && activeSort.dir === 'asc' ? 'selected' : ''}>القيمة (الأقل أولاً)</option>
                                      <option value="staff-asc" ${activeSort.key === 'staff' && activeSort.dir === 'asc' ? 'selected' : ''}>المندوب (أ - ي)</option>
                                      <option value="staff-desc" ${activeSort.key === 'staff' && activeSort.dir === 'desc' ? 'selected' : ''}>المندوب (ي - أ)</option>
                                      <option value="product-asc" ${activeSort.key === 'product' && activeSort.dir === 'asc' ? 'selected' : ''}>المنتج (أ - ي)</option>
                                      <option value="type-asc" ${activeSort.key === 'type' && activeSort.dir === 'asc' ? 'selected' : ''}>نوع العملية</option>
                                  </select>
                              </div>
                          </div>
                      </div>
                      <div class="table-responsive table-scrollable" style="margin-bottom: 25px;">
                          <table class="data-table" id="${tableId}" data-group-key="${encodeURIComponent(groupKey)}">
                              <thead>
                                  <tr>
                                      <th class="sortable-th ${activeSort.key === 'staff' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'staff')" title="انقر لفرز المندوب">
                                          <span>المندوب</span>
                                          <i class="fas ${activeSort.key === 'staff' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th class="sortable-th ${activeSort.key === 'time' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'time')" title="انقر لفرز الوقت">
                                          <span>الوقت</span>
                                          <i class="fas ${activeSort.key === 'time' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th class="sortable-th ${activeSort.key === 'type' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'type')" title="انقر لفرز نوع العملية">
                                          <span>نوع العملية</span>
                                          <i class="fas ${activeSort.key === 'type' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th class="sortable-th ${activeSort.key === 'product' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'product')" title="انقر لفرز المنتج">
                                          <span>المنتج / السبب</span>
                                          <i class="fas ${activeSort.key === 'product' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th class="sortable-th ${activeSort.key === 'method' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'method')" title="انقر لفرز المحفظة">
                                          <span>المحفظة</span>
                                          <i class="fas ${activeSort.key === 'method' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th class="sortable-th ${activeSort.key === 'price' ? 'active-sort' : ''}" onclick="handleThSort('${encodeURIComponent(groupKey)}', 'price')" title="انقر لفرز القيمة">
                                          <span>القيمة (د.ل)</span>
                                          <i class="fas ${activeSort.key === 'price' ? (activeSort.dir === 'asc' ? 'fa-sort-up active' : 'fa-sort-down active') : 'fa-sort'} sort-th-icon"></i>
                                      </th>
                                      <th>الإجراءات</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  ${rowsHtml}
                              </tbody>
                          </table>
                      </div>
                    `;
                }
                container.innerHTML = html;
            }

            if (profitsElement) {
                profitsElement.textContent = totalProfits.toFixed(2) + ' د.ل';
            }

            window.latestWeeklyTotalProfits = totalProfits;
            updateStaffProfitsFromLatestTotal();
        }, err => {
            console.error("Error listening to master history:", err);
        });
    }
});

// =============================================
// إدارة فرز جداول المبيعات
// =============================================
window.applyGroupTableSort = function (groupKey, sortKey, sortDir) {
    window.masterGroupsSort = window.masterGroupsSort || {};
    window.masterGroupsSort[groupKey] = { key: sortKey, dir: sortDir };

    const encodedGroupKey = encodeURIComponent(groupKey);
    const table = document.querySelector(`table.data-table[data-group-key="${encodedGroupKey}"]`);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const items = (window.masterGroupsData && window.masterGroupsData[groupKey]) || [];
    const sortedItems = window.getGroupSortedItems(items, sortKey, sortDir);
    tbody.innerHTML = window.renderGroupTableRows(sortedItems);

    // تحديث القائمة المنسدلة للفرز
    const headerBar = document.querySelector(`.sales-log-header-bar[data-group-key="${encodedGroupKey}"]`);
    if (headerBar) {
        const select = headerBar.querySelector('.sales-sort-select');
        if (select) {
            const val = `${sortKey}-${sortDir}`;
            if (Array.from(select.options).some(o => o.value === val)) {
                select.value = val;
            }
        }
    }

    // تحديث أيقونات رؤوس الأعمدة
    const ths = table.querySelectorAll('th.sortable-th');
    ths.forEach(th => {
        const icon = th.querySelector('.sort-th-icon');
        const onclickAttr = th.getAttribute('onclick') || '';
        const match = onclickAttr.match(/,\s*'([^']+)'\)/);
        const thKey = match ? match[1] : '';

        if (thKey === sortKey) {
            th.classList.add('active-sort');
            if (icon) {
                icon.className = `fas fa-sort-${sortDir === 'asc' ? 'up' : 'down'} sort-th-icon active`;
            }
        } else {
            th.classList.remove('active-sort');
            if (icon) {
                icon.className = 'fas fa-sort sort-th-icon';
            }
        }
    });
};

window.handleGroupSortSelect = function (encodedGroupKey, sortValue) {
    const groupKey = decodeURIComponent(encodedGroupKey);
    const [sortKey, sortDir] = sortValue.split('-');
    window.applyGroupTableSort(groupKey, sortKey, sortDir);
};

window.handleThSort = function (encodedGroupKey, sortKey) {
    const groupKey = decodeURIComponent(encodedGroupKey);
    window.masterGroupsSort = window.masterGroupsSort || {};
    const current = window.masterGroupsSort[groupKey] || { key: 'time', dir: 'desc' };

    let newDir = 'asc';
    if (current.key === sortKey) {
        newDir = current.dir === 'asc' ? 'desc' : 'asc';
    } else {
        newDir = (sortKey === 'time' || sortKey === 'price') ? 'desc' : 'asc';
    }

    window.applyGroupTableSort(groupKey, sortKey, newDir);
};

// =============================================
// إحصائيات مبيعات المنتجات المفصلة (النافذة المنبثقة)
// =============================================
window.openProductSalesSummary = function (encodedGroupKey) {
    const groupKey = decodeURIComponent(encodedGroupKey);
    const items = (window.masterGroupsData && window.masterGroupsData[groupKey]) || [];

    const summaryMap = {};
    let totalSalesCount = 0;
    let totalSalesAmount = 0;

    items.forEach(item => {
        if (!item.data || item.data.type !== 'sale') return;
        const rawProd = (item.data.product || '').trim();
        const normProd = rawProd.replace(/ه/g, 'ة');
        if (item.data.isDirectSale || normProd === 'مبيعة مباشرة' || normProd.includes('مبيعة مباشرة')) return;

        const p = rawProd || 'منتج غير محدد';
        const dur = (item.data.duration || '').trim();
        const key = dur ? `${p} - ${dur}` : p;
        const price = parseFloat(item.data.price) || 0;

        if (!summaryMap[key]) {
            summaryMap[key] = {
                productName: p,
                duration: dur,
                displayName: key,
                count: 0,
                totalAmount: 0,
                points: 0,
                pricedAmount: 0
            };
        }
        summaryMap[key].count += 1;
        summaryMap[key].totalAmount += price;
        // نقاط المخزن التي أدخلها المندوب. سعر النقطة يُحسب من المبيعات التي فيها نقاط فقط،
        // فالمبيعات القديمة أو التي بلا نقاط لا تُنزّل المتوسط
        const salePoints = parseFloat(item.data.inventoryPointsDeducted) || 0;
        if (salePoints > 0) {
            summaryMap[key].points += salePoints;
            summaryMap[key].pricedAmount += price;
        }
        totalSalesCount += 1;
        totalSalesAmount += price;
    });

    const summaryList = Object.values(summaryMap);
    summaryList.sort((a, b) => {
        // 1. فرز حسب اسم المنتج أولاً لتجميع كل نوع (مثل سيرفر اكس) تحت بعضه
        const nameComp = a.productName.localeCompare(b.productName, 'ar');
        if (nameComp !== 0) return nameComp;

        // 2. داخل نفس المنتج: ترتيب الباقات تصاعدياً حسب المدة (3 أشهر ثم 6 ثم 12 شهر)
        const durA = window.parseDurationMonths(a.duration);
        const durB = window.parseDurationMonths(b.duration);
        return durA - durB;
    });

    window.currentActiveProductSummary = {
        groupKey: groupKey,
        list: summaryList,
        totalSalesCount: totalSalesCount,
        totalSalesAmount: totalSalesAmount
    };

    const modal = document.getElementById('productSalesSummaryModal');
    if (!modal) return;

    document.getElementById('productSummaryTitle').textContent = 'إجمالي مبيعات المنتجات';
    document.getElementById('productSummarySubtitle').textContent = `📅 ${groupKey}`;
    document.getElementById('summaryTotalSalesCount').textContent = totalSalesCount;
    document.getElementById('summaryTotalSalesAmount').textContent = totalSalesAmount.toFixed(2) + ' د.ل';
    document.getElementById('summaryDistinctProductsCount').textContent = summaryList.length;
    const thirdStatLabel = document.getElementById('summaryThirdStatLabel');
    if (thirdStatLabel) thirdStatLabel.textContent = 'تنوع المنتجات';

    const searchInput = document.getElementById('productSummarySearch');
    if (searchInput) searchInput.value = '';

    window.renderProductSummaryTable(summaryList, totalSalesCount);

    modal.style.display = 'block';

    const tableWrap = document.querySelector('.product-summary-table-wrap');
    if (tableWrap) tableWrap.scrollTop = 0;
};

/** عدد النقاط بلا أصفار زائدة: 4 لا 4.00، و7.5 كما هي. */
function formatSummaryNumber(n) {
    return String(Math.round(n * 100) / 100);
}

/** صفوف جدول إجمالي المنتجات (مشتركة بين نافذة المنتجات ونافذة الشركات). */
window.productSummaryRowsHtml = function (list, totalCount) {
    let html = '';
    let lastProductName = null;
    list.forEach((item, index) => {
        const percent = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : '0';
        const isNewGroup = lastProductName !== null && lastProductName !== item.productName;
        lastProductName = item.productName;
        const rowClass = isNewGroup ? 'class="product-group-separator"' : '';
        html += `
            <tr ${rowClass}>
                <td style="color: #8b949e; font-size: 0.9rem; text-align: center;">${index + 1}</td>
                <td style="text-align: right;">
                    <div class="product-summary-name">${item.displayName}</div>
                    <div class="product-summary-progress-bg">
                        <div class="product-summary-progress-bar" style="width: ${percent}%;"></div>
                    </div>
                </td>
                <td style="text-align: center;">
                    <span class="product-summary-qty-badge">
                        <i class="fas fa-check-circle"></i> ${item.count}
                    </span>
                    <span class="product-summary-percent">(${percent}%)</span>
                </td>
                <td style="text-align: center;">
                    <span class="product-summary-points" dir="ltr">${item.points > 0 ? formatSummaryNumber(item.points) : '—'}</span>
                </td>
                <td style="text-align: center;">
                    <span class="product-summary-point-price" dir="ltr">${item.points > 0 ? (item.pricedAmount / item.points).toFixed(2) + ' د.ل' : '—'}</span>
                </td>
                <td style="text-align: center;">
                    <strong class="product-summary-amount" dir="ltr">${item.totalAmount.toFixed(2)} د.ل</strong>
                </td>
            </tr>
        `;
    });

    return html;
};

/**
 * تجميع مبيعات حسب المنتج والباقة (نفس قواعد نافذة إجمالي المنتجات): المبيعات المباشرة لا تدخل،
 * وسعر النقطة من المبيعات التي أُدخلت لها نقاط فقط.
 */
window.summarizeSalesByProduct = function (salesData) {
    const map = {};
    let count = 0;
    let amount = 0;
    salesData.forEach(d => {
        if (!d || d.type !== 'sale') return;
        const rawProd = (d.product || '').trim();
        const normProd = rawProd.replace(/ه/g, 'ة');
        if (d.isDirectSale || normProd.includes('مبيعة مباشرة')) return;
        const p = rawProd || 'منتج غير محدد';
        const dur = (d.duration || '').trim();
        const key = dur ? `${p} - ${dur}` : p;
        const price = parseFloat(d.price) || 0;
        if (!map[key]) map[key] = { productName: p, duration: dur, displayName: key, count: 0, totalAmount: 0, points: 0, pricedAmount: 0 };
        map[key].count += 1;
        map[key].totalAmount += price;
        const salePoints = parseFloat(d.inventoryPointsDeducted) || 0;
        if (salePoints > 0) {
            map[key].points += salePoints;
            map[key].pricedAmount += price;
        }
        count += 1;
        amount += price;
    });
    const list = Object.values(map);
    list.sort((a, b) => {
        const nameComp = a.productName.localeCompare(b.productName, 'ar');
        if (nameComp !== 0) return nameComp;
        return (window.parseDurationMonths ? window.parseDurationMonths(a.duration) - window.parseDurationMonths(b.duration) : 0);
    });
    return { list: list, count: count, amount: amount };
};

/** جدول نافذة الشركات: عنوان لكل شركة ثم منتجاتها، والنسبة من مبيعات الشركة نفسها. */
window.renderCompanySummaryTable = function (companies, query) {
    const tbody = document.getElementById('productSummaryTableBody');
    if (!tbody) return;
    const q = (query || '').trim().toLowerCase();
    let html = '';
    (companies || []).forEach(c => {
        const rows = q ? c.list.filter(item => item.displayName.toLowerCase().includes(q)) : c.list;
        if (!rows.length) return;
        html += `
            <tr class="company-summary-head">
                <td colspan="6">
                    <i class="fas fa-building"></i> ${c.label}
                    <span class="company-summary-head-meta" dir="rtl">${c.count} مبيعة · <span dir="ltr">${c.amount.toFixed(2)} د.ل</span></span>
                </td>
            </tr>`;
        html += window.productSummaryRowsHtml(rows, c.count);
    });
    if (!html) {
        html = `
            <tr>
                <td colspan="6" class="table-empty-message" style="text-align: center; padding: 25px; color: #8b949e;">
                    <i class="fas fa-box-open" style="font-size: 1.5rem; display: block; margin-bottom: 8px; opacity: 0.6;"></i>
                    ${q ? 'لا توجد منتجات مطابقة للبحث' : 'لا توجد مبيعات للشركات في هذه الفترة'}
                </td>
            </tr>`;
    }
    tbody.innerHTML = html;
};

window.renderProductSummaryTable = function (list, totalCount) {
    const tbody = document.getElementById('productSummaryTableBody');
    if (!tbody) return;

    if (!list || list.length === 0) {
        const isPeriod = window.currentActiveProductSummary && window.currentActiveProductSummary.isPeriod;
        const emptyMsg = isPeriod ? 'لا توجد مبيعات مسجلة في هذه الفترة' : 'لا توجد مبيعات مسجلة في هذا اليوم';
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty-message" style="text-align: center; padding: 25px; color: #8b949e;">
                    <i class="fas fa-box-open" style="font-size: 1.5rem; display: block; margin-bottom: 8px; opacity: 0.6;"></i>
                    ${emptyMsg}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.productSummaryRowsHtml(list, totalCount);
};

window.filterProductSummary = function (query) {
    if (!window.currentActiveProductSummary) return;
    if (window.currentActiveProductSummary.isCompany) {
        window.renderCompanySummaryTable(window.currentActiveProductSummary.companies, query);
        return;
    }
    const q = (query || '').trim().toLowerCase();
    const list = window.currentActiveProductSummary.list || [];
    const totalCount = window.currentActiveProductSummary.totalSalesCount || 0;

    if (!q) {
        window.renderProductSummaryTable(list, totalCount);
        return;
    }

    const filtered = list.filter(item => item.displayName.toLowerCase().includes(q));
    window.renderProductSummaryTable(filtered, totalCount);
};

window.copyProductSummaryToClipboard = async function () {
    if (!window.currentActiveProductSummary) return;
    const { groupKey, periodSubtitle, isPeriod, list, totalSalesCount, totalSalesAmount } = window.currentActiveProductSummary;

    if (!list || list.length === 0) {
        if (typeof showToast === 'function') showToast('لا توجد مبيعات لنسخها', 'info');
        return;
    }

    const titleSuffix = isPeriod ? (periodSubtitle || groupKey) : groupKey;
    const isCompany = !!window.currentActiveProductSummary.isCompany;
    const lineOf = (item, idx) => {
        const pointsText = item.points > 0
            ? ` | نقاط: ${formatSummaryNumber(item.points)} | سعر النقطة: ${(item.pricedAmount / item.points).toFixed(2)} د.ل`
            : '';
        return `${idx + 1}. ${item.displayName}: عدد ${item.count}${pointsText} (إجمالي: ${item.totalAmount.toFixed(2)} د.ل)\n`;
    };
    let text = `📊 ${isCompany ? 'إجمالي مبيعات الشركات' : 'إجمالي مبيعات المنتجات'} (${titleSuffix})\n`;
    text += `═══════════════════════════════════\n`;
    if (isCompany) {
        window.currentActiveProductSummary.companies.forEach(c => {
            text += `\n🏢 ${c.label} — ${c.count} مبيعة (${c.amount.toFixed(2)} د.ل)\n`;
            c.list.forEach((item, idx) => { text += lineOf(item, idx); });
        });
    } else {
        list.forEach((item, idx) => { text += lineOf(item, idx); });
    }
    text += `───────────────────────────────────\n`;
    text += `🔹 إجمالي عدد المبيعات: ${totalSalesCount}\n`;
    text += `💰 إجمالي مبالغ المبيعات: ${totalSalesAmount.toFixed(2)} د.ل\n`;
    text += `📦 عدد الباقات المختلفة: ${list.length}\n`;
    text += `سيرفرات الميزو - ALmEz0\n`;

    try {
        await navigator.clipboard.writeText(text);
        if (typeof showToast === 'function') {
            showToast('تم نسخ تقرير مبيعات المنتجات بنجاح!', 'success');
        } else {
            showAlert('تم نسخ تقرير مبيعات المنتجات بنجاح!');
        }
    } catch (err) {
        console.error('Clipboard copy error:', err);
        if (typeof showToast === 'function') {
            showToast('تعذر النسخ التلقائي، يرجى المحاولة مرة أخرى', 'error');
        }
    }
};

// =============================================
// إجمالي مبيعات المنتجات للفترة المحددة
// =============================================
window.openPeriodProductSalesSummary = function () {
    const filter = window.masterPeriodFilter || {};
    const startDate = filter.startDate;
    const endDate = filter.endDate;

    let subtitleText = '';
    if (startDate && endDate) {
        const sStr = startDate.toLocaleDateString('en-GB');
        const eStr = endDate.toLocaleDateString('en-GB');
        if (sStr === eStr) {
            subtitleText = `يوم ${sStr}`;
        } else {
            subtitleText = `الفترة: ${sStr} إلى ${eStr}`;
        }
    } else if (startDate && !endDate) {
        subtitleText = `من تاريخ ${startDate.toLocaleDateString('en-GB')} إلى الآن`;
    } else if (!startDate && endDate) {
        subtitleText = `حتى تاريخ ${endDate.toLocaleDateString('en-GB')}`;
    } else {
        subtitleText = 'الأسبوع الحالي (من السبت إلى اليوم)';
    }

    // تجميع كافة مبيعات الفترة المعروضة
    let allItems = [];
    if (window.masterPeriodDocs && window.masterPeriodDocs.length > 0) {
        allItems = window.masterPeriodDocs;
    } else if (window.masterGroupsData) {
        Object.values(window.masterGroupsData).forEach(arr => {
            allItems = allItems.concat(arr);
        });
    }

    const companyMethods = ['المظلة', 'انيس', 'بوينت', 'Bn+'];
    const summaryMap = {};
    let totalSalesCount = 0;
    let totalSalesAmount = 0;

    allItems.forEach(item => {
        const tData = item.data;
        if (!tData || tData.type !== 'sale') return;

        // استثناء مبيعات شركات التوزيع بناءً على طلب المدير (لها قسم وبحث وفواتير خاصة بها)
        if (companyMethods.includes(tData.method)) return;

        // استثناء المبيعات المباشرة بناءً على طلب المدير
        const rawProd = (tData.product || '').trim();
        const normProd = rawProd.replace(/ه/g, 'ة');
        if (tData.isDirectSale || normProd === 'مبيعة مباشرة' || normProd.includes('مبيعة مباشرة')) return;

        const p = rawProd || 'منتج غير محدد';
        const dur = (tData.duration || '').trim();
        const key = dur ? `${p} - ${dur}` : p;
        const price = parseFloat(tData.price) || 0;

        if (!summaryMap[key]) {
            summaryMap[key] = {
                productName: p,
                duration: dur,
                displayName: key,
                count: 0,
                totalAmount: 0,
                points: 0,
                pricedAmount: 0
            };
        }
        summaryMap[key].count += 1;
        summaryMap[key].totalAmount += price;
        // نقاط المخزن التي أدخلها المندوب. سعر النقطة يُحسب من المبيعات التي فيها نقاط فقط،
        // فالمبيعات القديمة أو التي بلا نقاط لا تُنزّل المتوسط
        const salePoints = parseFloat(tData.inventoryPointsDeducted) || 0;
        if (salePoints > 0) {
            summaryMap[key].points += salePoints;
            summaryMap[key].pricedAmount += price;
        }
        totalSalesCount += 1;
        totalSalesAmount += price;
    });

    const summaryList = Object.values(summaryMap);
    summaryList.sort((a, b) => {
        // 1. فرز حسب اسم المنتج أولاً لتجميع كل نوع (مثل سيرفر اكس) تحت بعضه
        const nameComp = a.productName.localeCompare(b.productName, 'ar');
        if (nameComp !== 0) return nameComp;

        // 2. داخل نفس المنتج: ترتيب الباقات تصاعدياً حسب المدة (3 أشهر ثم 6 ثم 12 شهر)
        const durA = (window.parseDurationMonths ? window.parseDurationMonths(a.duration) : 0);
        const durB = (window.parseDurationMonths ? window.parseDurationMonths(b.duration) : 0);
        return durA - durB;
    });

    window.currentActiveProductSummary = {
        groupKey: subtitleText,
        periodSubtitle: subtitleText,
        isPeriod: true,
        list: summaryList,
        totalSalesCount: totalSalesCount,
        totalSalesAmount: totalSalesAmount
    };

    const modal = document.getElementById('productSalesSummaryModal');
    if (!modal) return;

    document.getElementById('productSummaryTitle').textContent = 'إجمالي مبيعات المنتجات للفترة المحددة';
    document.getElementById('productSummarySubtitle').textContent = `📅 ${subtitleText}`;
    document.getElementById('summaryTotalSalesCount').textContent = totalSalesCount;
    document.getElementById('summaryTotalSalesAmount').textContent = totalSalesAmount.toFixed(2) + ' د.ل';
    document.getElementById('summaryDistinctProductsCount').textContent = summaryList.length;
    const thirdStatLabel = document.getElementById('summaryThirdStatLabel');
    if (thirdStatLabel) thirdStatLabel.textContent = 'تنوع المنتجات';

    const searchInput = document.getElementById('productSummarySearch');
    if (searchInput) searchInput.value = '';

    window.renderProductSummaryTable(summaryList, totalSalesCount);

    modal.style.display = 'block';

    const tableWrap = document.querySelector('.product-summary-table-wrap');
    if (tableWrap) tableWrap.scrollTop = 0;
};

window.closeProductSummaryModal = function () {
    const modal = document.getElementById('productSalesSummaryModal');
    if (modal) modal.style.display = 'none';
};

// إغلاق النوافذ المنبثقة عند النقر بالخارج أو زر Escape
window.addEventListener('click', (event) => {
    const pModal = document.getElementById('productSalesSummaryModal');
    if (event.target === pModal) {
        window.closeProductSummaryModal();
    }
    const sModal = document.getElementById('editCompanySaleShareModal');
    if (event.target === sModal) {
        window.closeEditCompanySaleShareModal();
    }
    const rModal = document.getElementById('staffRulesModal');
    if (event.target === rModal) {
        window.closeStaffRulesModal();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const pModal = document.getElementById('productSalesSummaryModal');
        if (pModal && pModal.style.display === 'block') {
            window.closeProductSummaryModal();
        }
        const sModal = document.getElementById('editCompanySaleShareModal');
        if (sModal && sModal.style.display === 'block') {
            window.closeEditCompanySaleShareModal();
        }
        const rModal = document.getElementById('staffRulesModal');
        if (rModal && (rModal.style.display === 'block' || rModal.style.display === 'flex')) {
            window.closeStaffRulesModal();
        }
    }
});

// =============================================
// Edit Staff Balances Logic
// =============================================
// =============================================
// أرصدة المناديب: القيم الأساسية وطريقة عرضها
// =============================================
// قواعد المدير:
// - ربح الأسبوع لا يمسّه أي تعديل: يتغيّر بالمبيعات فقط ويُرحَّل للمستحقات بداية الأسبوع.
// - "استلمت كاش من المندوب" يُخصم من مطلوب الكاش فقط؛ الزائد عنه يُضاف لمستحقاته.
// - "دفعت للمندوب" يُخصم من المستحقات، ثم سلفة على ربح الأسبوع، ثم الزائد يصير مطلوب كاش.
// - لا مطلوب كاش ولا مستحقات بالسالب.
// - الصافي = مطلوب كاش − (المستحقات + ربح الأسبوع − السلفة). موجب: على المندوب.
const BALANCE_BASE_FIELDS = ['baseLibyana', 'baseAlmadar', 'baseCash', 'baseProfit', 'duesOwed', 'profitAdvance', 'baseBank', 'baseSadad', 'baseUsdt'];

function roundMoney(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function snapshotBalanceBases(data) {
    const o = {};
    BALANCE_BASE_FIELDS.forEach(k => { o[k] = roundMoney(data ? data[k] : 0); });
    return o;
}

function sameBalanceBases(a, b) {
    return BALANCE_BASE_FIELDS.every(k => Math.abs((Number(a[k]) || 0) - (Number(b[k]) || 0)) < 0.005);
}

/** الأرقام كما تظهر على البطاقة، من القيم الأساسية + العمليات الحية. */
function balanceView(staffId, bases) {
    const live = (window.staffLive || {})[staffId] || {};
    const weekTotal = (typeof window.currentWeekProfitTotal === 'function') ? window.currentWeekProfitTotal() : 0;
    const share = live.isIbrahim ? 0 : window.staffProfitShare(live.name, weekTotal);
    const view = {
        libyana: (live.netLibyana || 0) + bases.baseLibyana,
        almadar: (live.netAlmadar || 0) + bases.baseAlmadar,
        cash: (live.netCash || 0) + bases.baseCash,
        dues: bases.duesOwed,
        profit: share + bases.baseProfit,
        advance: bases.profitAdvance,
        bank: (live.netBank || 0) + bases.baseBank,
        sadad: (live.netSadad || 0) + bases.baseSadad,
        usdt: (live.netUsdt || 0) + bases.baseUsdt,
        share: share
    };
    view.net = view.cash - (view.dues + view.profit - view.advance);
    return view;
}

function netLabel(net) {
    if (net > 0.004) return net.toFixed(2) + ' على المندوب';
    if (net < -0.004) return Math.abs(net).toFixed(2) + ' للمندوب';
    return '0.00 (مصفّر)';
}

/** نص المراجعة: كل رقم قبل ← بعد، وما لم يتغيّر يُكتب بجانبه (بدون تغيير). */
function balancePreviewText(live, before, after, notes) {
    const rows = live.isIbrahim
        ? [['مطلوب ليبيانا', 'libyana'], ['مطلوب المدار', 'almadar'], ['مطلوب كاش', 'cash'], ['حساب المصرفي', 'bank'], ['سداد', 'sadad'], ['USDT', 'usdt']]
        : [['مطلوب ليبيانا', 'libyana'], ['مطلوب المدار', 'almadar'], ['مطلوب كاش', 'cash'], ['المستحقات', 'dues'], ['ربح الأسبوع', 'profit'], ['سلفة على ربح الأسبوع', 'advance']];
    const lines = [];
    if (notes && notes.length) lines.push(notes.join('\n'), '');
    rows.forEach(([label, key]) => {
        const a = Number(before[key]) || 0, b = Number(after[key]) || 0;
        if (key === 'advance' && Math.abs(a) < 0.005 && Math.abs(b) < 0.005) return;
        lines.push(Math.abs(a - b) < 0.005
            ? `${label}: ${b.toFixed(2)} (بدون تغيير)`
            : `${label}: ${a.toFixed(2)} ← ${b.toFixed(2)}`);
    });
    if (!live.isIbrahim) {
        lines.push(Math.abs(before.net - after.net) < 0.005
            ? `الصافي: ${netLabel(after.net)} (بدون تغيير)`
            : `الصافي: ${netLabel(before.net)} ← ${netLabel(after.net)}`);
    }
    return lines.join('\n');
}

window.editBalances = async function (staffId) {
    const live = (window.staffLive || {})[staffId];
    if (!live) {
        showToast('بيانات المندوب لم تُحمَّل بعد، حاول بعد لحظات', 'warning');
        return;
    }
    let bases;
    try {
        const doc = await db.collection('customers').doc(staffId).get();
        bases = snapshotBalanceBases(doc.data() || {});
    } catch (e) {
        showToast('تعذر جلب حساب المندوب: ' + e.message, 'error');
        return;
    }
    const v = balanceView(staffId, bases);

    document.getElementById('editStaffId').value = staffId;
    document.getElementById('editStaffName').innerText = live.name;
    document.getElementById('newLibyanaVal').value = v.libyana.toFixed(2);
    document.getElementById('newAlmadarVal').value = v.almadar.toFixed(2);

    const ibrahimFields = document.getElementById('ibrahimEditFields');
    const standardGroup = document.getElementById('standardSettlementGroup');
    if (live.isIbrahim) {
        if (ibrahimFields) ibrahimFields.style.display = 'block';
        if (standardGroup) standardGroup.style.display = 'none';
        document.getElementById('newCashVal').value = v.cash.toFixed(2);
        document.getElementById('newBankVal').value = v.bank.toFixed(2);
        document.getElementById('newSadadVal').value = v.sadad.toFixed(2);
        document.getElementById('newUsdtVal').value = v.usdt.toFixed(2);
    } else {
        if (ibrahimFields) ibrahimFields.style.display = 'none';
        if (standardGroup) standardGroup.style.display = 'block';
        const summary = document.getElementById('balanceCurrentSummary');
        if (summary) {
            summary.innerHTML =
                `<div><span>مطلوب كاش</span><strong>${v.cash.toFixed(2)}</strong></div>` +
                `<div><span>المستحقات</span><strong>${v.dues.toFixed(2)}</strong></div>` +
                `<div><span>ربح الأسبوع</span><strong>${v.profit.toFixed(2)}</strong></div>` +
                (v.advance > 0.004 ? `<div><span>سلفة على الربح</span><strong>${v.advance.toFixed(2)}</strong></div>` : '') +
                `<div class="balance-summary-net"><span>الصافي</span><strong>${netLabel(v.net)}</strong></div>`;
        }
        document.getElementById('receivedCashVal').value = '';
        document.getElementById('paidToStaffVal').value = '';
        document.getElementById('fixCashVal').value = v.cash.toFixed(2);
        document.getElementById('fixDuesVal').value = v.dues.toFixed(2);
        document.getElementById('fixProfitVal').value = v.profit.toFixed(2);
        const hint = document.getElementById('fixProfitHint');
        if (hint) hint.textContent = `ربح المبيعات هذا الأسبوع وحده: ${v.share.toFixed(2)} د.ل`;
        const toggle = document.getElementById('manualFixToggle');
        if (toggle) toggle.checked = false;
        const fixGroup = document.getElementById('manualFixFields');
        if (fixGroup) fixGroup.style.display = 'none';
    }

    document.getElementById('editBalancesModal').style.display = 'block';
};

window.toggleManualFix = function (on) {
    const fixGroup = document.getElementById('manualFixFields');
    if (fixGroup) fixGroup.style.display = on ? 'block' : 'none';
    ['receivedCashVal', 'paidToStaffVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = !!on; if (on) el.value = ''; }
    });
};

window.closeEditBalancesModal = function () {
    document.getElementById('editBalancesModal').style.display = 'none';
};

// =============================================
// تعديل عملية بيع (سعر البيع / اسم المنتج / المدة / طريقة الدفع)
// من سجل المبيعات في لوحة المدير
// =============================================
window.openEditSaleModal = function (transactionId) {
    const data = (window.masterHistoryDocsCache && window.masterHistoryDocsCache[transactionId]) || null;
    if (!data) {
        if (typeof showToast === 'function') showToast('تعذر إيجاد بيانات هذه العملية، حاول تحديث الصفحة', 'error');
        return;
    }

    document.getElementById('editSaleId').value = transactionId;
    document.getElementById('editSaleProduct').value = data.product || '';
    document.getElementById('editSaleDuration').value = data.duration || '';
    document.getElementById('editSalePrice').value = data.price || 0;

    const methodSelect = document.getElementById('editSaleMethod');
    if (methodSelect) {
        const hasOption = Array.from(methodSelect.options).some(o => o.value === data.method);
        if (!hasOption && data.method) {
            const opt = document.createElement('option');
            opt.value = data.method;
            opt.textContent = data.method;
            methodSelect.appendChild(opt);
        }
        methodSelect.value = data.method || 'كاش';
    }

    document.getElementById('editSaleModal').style.display = 'block';
    if (window.MizoLedger && !window.MizoLedger.counts(data)) {
        showToast('هذه العملية قبل آخر إقفال للحساب: تعديلها يغيّر السجل والتقارير فقط، ولا يغيّر أرصدة المناديب', 'warning', 7000);
    }
};

window.closeEditSaleModal = function () {
    document.getElementById('editSaleModal').style.display = 'none';
};

window.saveEditedSale = async function () {
    const transactionId = document.getElementById('editSaleId').value;
    if (!transactionId) return;

    const newProduct = document.getElementById('editSaleProduct').value.trim();
    const newDuration = document.getElementById('editSaleDuration').value.trim();
    const newMethod = document.getElementById('editSaleMethod').value;
    const newPrice = parseFloat(document.getElementById('editSalePrice').value);

    if (!newProduct) {
        if (typeof showToast === 'function') showToast('يرجى إدخال اسم المنتج', 'error');
        else showAlert('يرجى إدخال اسم المنتج');
        return;
    }
    if (isNaN(newPrice) || newPrice <= 0) {
        if (typeof showToast === 'function') showToast('يرجى إدخال سعر بيع صحيح', 'error');
        else showAlert('يرجى إدخال سعر بيع صحيح');
        return;
    }
    if (!newMethod) {
        if (typeof showToast === 'function') showToast('يرجى اختيار طريقة الدفع', 'error');
        else showAlert('يرجى اختيار طريقة الدفع');
        return;
    }

    const btn = document.querySelector('#editSaleModal .edit-balances-modal-save');
    const oldText = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.innerHTML = 'جاري الحفظ...';
            btn.disabled = true;
        }

        await db.collection('transactions').doc(transactionId).update({
            product: newProduct,
            duration: newDuration,
            method: newMethod,
            price: newPrice
        });

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_edit_transaction',
                category: 'admin',
                severity: 'warning',
                title: 'تعديل عملية بيع: ' + newProduct,
                details: { transactionId: transactionId, product: newProduct, duration: newDuration, method: newMethod, price: newPrice }
            });
        }

        window.closeEditSaleModal();
        if (typeof showToast === 'function') showToast('تم حفظ التعديل بنجاح', 'success');
    } catch (err) {
        console.error('Error updating transaction:', err);
        showAlert('فشل الحفظ: ' + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = oldText || '<i class="fas fa-save icon-spacing-left"></i> حفظ التعديل';
            btn.disabled = false;
        }
    }
};

/** يحسب القيم الأساسية الجديدة من خانات النافذة، بقواعد المدير (انظر أعلى القسم). */
function computeBalanceEdit(live, bases, view) {
    const b = Object.assign({}, bases);
    const notes = [];
    const num = (id) => {
        const el = document.getElementById(id);
        if (!el || el.disabled || String(el.value).trim() === '') return null;
        const v = parseFloat(el.value);
        return isNaN(v) ? NaN : v;
    };
    const setTarget = (inputId, viewKey, baseKey, netValue, label) => {
        const t = num(inputId);
        if (t === null) return;
        if (isNaN(t)) throw new Error('قيمة غير صحيحة في خانة ' + label);
        if (Math.abs(t - view[viewKey]) < 0.005) return;
        b[baseKey] = roundMoney(t - (netValue || 0));
        notes.push(`${label} ← ${t.toFixed(2)}`);
    };

    setTarget('newLibyanaVal', 'libyana', 'baseLibyana', live.netLibyana, 'مطلوب ليبيانا');
    setTarget('newAlmadarVal', 'almadar', 'baseAlmadar', live.netAlmadar, 'مطلوب المدار');

    if (live.isIbrahim) {
        setTarget('newCashVal', 'cash', 'baseCash', live.netCash, 'مطلوب كاش');
        setTarget('newBankVal', 'bank', 'baseBank', live.netBank, 'حساب المصرفي');
        setTarget('newSadadVal', 'sadad', 'baseSadad', live.netSadad, 'سداد');
        setTarget('newUsdtVal', 'usdt', 'baseUsdt', live.netUsdt, 'USDT');
        return { bases: b, notes: notes };
    }

    const manual = document.getElementById('manualFixToggle') && document.getElementById('manualFixToggle').checked;
    if (manual) {
        const fc = num('fixCashVal'), fd = num('fixDuesVal'), fp = num('fixProfitVal');
        if (fc === null || fd === null || fp === null || isNaN(fc) || isNaN(fd) || isNaN(fp)) {
            throw new Error('أكمل خانات التصحيح اليدوي الثلاث بأرقام صحيحة');
        }
        if (fc < 0 || fd < 0) throw new Error('مطلوب الكاش والمستحقات لا يكونان بالسالب');
        b.baseCash = roundMoney(fc - (live.netCash || 0));
        b.duesOwed = roundMoney(fd);
        b.baseProfit = roundMoney(fp - view.share);
        notes.push('تصحيح يدوي للأرصدة');
        return { bases: b, notes: notes };
    }

    const received = num('receivedCashVal');
    const paid = num('paidToStaffVal');
    if (isNaN(received) || isNaN(paid)) throw new Error('أدخل المبلغ بأرقام صحيحة');
    if ((received || 0) < 0 || (paid || 0) < 0) throw new Error('المبالغ لا تكون بالسالب');

    let cash = view.cash, dues = b.duesOwed, advance = b.profitAdvance;

    if (received > 0) {
        // يُخصم من مطلوب الكاش فقط؛ الزائد عنه يُضاف لمستحقات المندوب
        const fromCash = Math.min(received, Math.max(cash, 0));
        cash -= fromCash;
        const extra = received - fromCash;
        dues += extra;
        notes.push(`استلمت كاش من المندوب: ${received.toFixed(2)}` +
            (extra > 0.004 ? ` — الزائد عن مطلوب الكاش (${extra.toFixed(2)}) أُضيف لمستحقاته` : ''));
    }

    if (paid > 0) {
        // من المستحقات أولاً، ثم سلفة على ربح الأسبوع الحالي، ثم الزائد يصير مطلوب كاش
        const fromDues = Math.min(paid, Math.max(dues, 0));
        dues -= fromDues;
        let rest = paid - fromDues;
        const room = Math.max(view.profit - advance, 0);
        const fromProfit = Math.min(rest, room);
        advance += fromProfit;
        rest -= fromProfit;
        cash += rest;
        const parts = [];
        if (fromDues > 0.004) parts.push(`${fromDues.toFixed(2)} من المستحقات`);
        if (fromProfit > 0.004) parts.push(`${fromProfit.toFixed(2)} سلفة على ربح الأسبوع`);
        if (rest > 0.004) parts.push(`${rest.toFixed(2)} أُضيفت لمطلوب الكاش عليه`);
        notes.push(`دفعت للمندوب: ${paid.toFixed(2)}` + (parts.length ? ` (${parts.join('، ')})` : ''));
    }

    b.baseCash = roundMoney(bases.baseCash + (cash - view.cash));
    b.duesOwed = roundMoney(dues);
    b.profitAdvance = roundMoney(advance);
    return { bases: b, notes: notes };
}

window.saveNewBalances = async function () {
    const staffId = document.getElementById('editStaffId').value;
    const live = (window.staffLive || {})[staffId];
    if (!staffId || !live) return;
    const ref = db.collection('customers').doc(staffId);
    const btn = document.querySelector('#editBalancesModal .edit-balances-modal-save');

    let fresh, before, result;
    try {
        fresh = snapshotBalanceBases((await ref.get()).data() || {});
        before = balanceView(staffId, fresh);
        result = computeBalanceEdit(live, fresh, before);
    } catch (e) {
        showToast(e.message, 'error');
        return;
    }
    if (sameBalanceBases(fresh, result.bases)) {
        showToast('لا يوجد أي تغيير للحفظ', 'info');
        return;
    }

    const after = balanceView(staffId, result.bases);
    const ok = await showConfirm(balancePreviewText(live, before, after, result.notes), {
        title: 'مراجعة التعديل — ' + live.name, okText: 'تأكيد الحفظ', danger: false
    });
    if (!ok) return;

    const summary = result.notes.join(' • ') || 'تعديل الأرصدة';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = 'جاري الحفظ...'; }
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const d = snap.data() || {};
            if (!sameBalanceBases(snapshotBalanceBases(d), fresh)) {
                throw new Error('تغيّر حساب المندوب أثناء المراجعة (تعديل آخر أو ترحيل). أغلق النافذة وأعد التعديل.');
            }
            const undo = (Array.isArray(d.balanceUndo) ? d.balanceUndo : []).slice(-19);
            undo.push({
                at: Date.now(),
                week: window.getCurrentWeekKey(),
                before: fresh,
                after: result.bases,
                summary: summary
            });
            tx.update(ref, Object.assign({}, result.bases, { balanceUndo: undo, balanceRedo: [] }));
        });

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_adjust_balances',
                category: 'admin',
                severity: 'warning',
                title: 'تعديل أرصدة المندوب: ' + live.name,
                details: { staffId: staffId, summary: summary, before: fresh, after: result.bases }
            });
        }
        window.closeEditBalancesModal();
        showToast('تم حفظ التعديل ✅ ويمكن التراجع عنه من زر الرجوع', 'success');
    } catch (err) {
        console.error('Error updating balances:', err);
        showAlert('فشل الحفظ: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save icon-spacing-left"></i> حفظ التعديلات'; }
    }
};

/**
 * الرجوع خطوة أو التقدّم خطوة في تعديلات المندوب. يعمل داخل الأسبوع نفسه فقط: الترحيل
 * يمسح السجل، لأن الرجوع لتعديل قبله كان سيلغي الترحيل ويُفسد المستحقات.
 */
async function stepBalanceHistory(staffId, direction) {
    const live = (window.staffLive || {})[staffId];
    if (!live) return;
    const ref = db.collection('customers').doc(staffId);
    const isUndo = direction === 'undo';

    let d;
    try {
        d = (await ref.get()).data() || {};
    } catch (e) {
        showToast('تعذر جلب حساب المندوب: ' + e.message, 'error');
        return;
    }
    const stack = Array.isArray(isUndo ? d.balanceUndo : d.balanceRedo) ? (isUndo ? d.balanceUndo : d.balanceRedo) : [];
    if (!stack.length) {
        showToast(isUndo ? 'لا يوجد تعديل للتراجع عنه' : 'لا يوجد ما يُعاد', 'info');
        return;
    }
    const entry = stack[stack.length - 1];
    if (entry.week && entry.week !== window.getCurrentWeekKey()) {
        showAlert('هذا التعديل من أسبوع سابق وقد رُحِّلت الأرباح بعده، فلا يمكن التراجع عنه تلقائياً. استخدم التصحيح اليدوي في نافذة التعديل.', 'warning');
        return;
    }
    const current = snapshotBalanceBases(d);
    const expected = isUndo ? entry.after : entry.before;
    const target = snapshotBalanceBases(isUndo ? entry.before : entry.after);
    if (!sameBalanceBases(current, expected)) {
        showAlert('تغيّر حساب المندوب بعد هذا التعديل، فلا يمكن ' + (isUndo ? 'التراجع عنه' : 'إعادته') + ' تلقائياً. استخدم التصحيح اليدوي في نافذة التعديل.', 'warning');
        return;
    }

    const text = balancePreviewText(live, balanceView(staffId, current), balanceView(staffId, target),
        [(isUndo ? 'التراجع عن: ' : 'إعادة: ') + (entry.summary || 'تعديل')]);
    const ok = await showConfirm(text, {
        title: (isUndo ? 'الرجوع خطوة — ' : 'التقدّم خطوة — ') + live.name,
        okText: isUndo ? 'تراجع' : 'أعد التعديل', danger: false
    });
    if (!ok) return;

    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const cur = snap.data() || {};
            if (!sameBalanceBases(snapshotBalanceBases(cur), expected)) {
                throw new Error('تغيّر حساب المندوب للتو، أعد المحاولة');
            }
            const undo = Array.isArray(cur.balanceUndo) ? cur.balanceUndo.slice() : [];
            const redo = Array.isArray(cur.balanceRedo) ? cur.balanceRedo.slice() : [];
            if (isUndo) redo.push(undo.pop()); else undo.push(redo.pop());
            tx.update(ref, Object.assign({}, target, { balanceUndo: undo.slice(-20), balanceRedo: redo.slice(-20) }));
        });
        if (typeof logActivity === 'function') {
            logActivity({
                action: isUndo ? 'admin_undo_balances' : 'admin_redo_balances',
                category: 'admin',
                severity: 'warning',
                title: (isUndo ? 'تراجع عن تعديل أرصدة ' : 'إعادة تعديل أرصدة ') + live.name,
                details: { staffId: staffId, summary: entry.summary, restored: target }
            });
        }
        showToast(isUndo ? 'تم الرجوع خطوة ✅' : 'تمت إعادة التعديل ✅', 'success');
    } catch (err) {
        showAlert('فشل: ' + err.message, 'error');
    }
}

window.undoBalanceEdit = function (staffId) { return stepBalanceHistory(staffId, 'undo'); };
window.redoBalanceEdit = function (staffId) { return stepBalanceHistory(staffId, 'redo'); };

// =============================================
// Search & Filter History Logic
// =============================================
window.searchHistory = function () {
    const startInput = document.getElementById('historyStartDate').value;
    const endInput = document.getElementById('historyEndDate').value;

    let startDate = null;
    let endDate = null;

    if (startInput) {
        startDate = new Date(startInput);
        startDate.setHours(0, 0, 0, 0);
    }

    if (endInput) {
        endDate = new Date(endInput);
        endDate.setHours(23, 59, 59, 999);
    }

    if (!startDate && !endDate) {
        showAlert("يرجى اختيار تاريخ للبحث");
        return;
    }

    if (window.fetchMasterHistory) {
        window.fetchMasterHistory(startDate, endDate);
    }
};

window.resetHistory = function () {
    const defWeek = (window.getDefaultWeekRange ? window.getDefaultWeekRange() : null);
    const startEl = document.getElementById('historyStartDate');
    const endEl = document.getElementById('historyEndDate');

    if (defWeek) {
        if (window.historyStartFp) {
            window.historyStartFp.setDate(defWeek.startStr);
        } else if (startEl) {
            startEl.value = defWeek.startStr;
        }

        if (window.historyEndFp) {
            window.historyEndFp.setDate(defWeek.endStr);
        } else if (endEl) {
            endEl.value = defWeek.endStr;
        }

        if (window.fetchMasterHistory) {
            window.fetchMasterHistory(defWeek.start, defWeek.end);
        }
    } else {
        if (startEl) {
            if (startEl._flatpickr) startEl._flatpickr.clear();
            startEl.value = '';
        }
        if (endEl) {
            if (endEl._flatpickr) endEl._flatpickr.clear();
            endEl.value = '';
        }
        if (window.fetchMasterHistory) {
            window.fetchMasterHistory(null, null);
        }
    }

    if (typeof showToast === 'function') {
        showToast('تمت استعادة السجل للأسبوع الحالي', 'info');
    }
};

// =============================================
// تهيئة مكتبة Flatpickr وإعادة ضبط صناديق البحث للوضع الافتراضي عند كل تحديث
// =============================================
function resetAllSearchBoxesToDefaults() {
    // 1. إعادة ضبط صندوق اختيار الشركة إلى "جميع الشركات"
    const compSelect = document.getElementById('companyFilterSelect');
    if (compSelect) {
        compSelect.value = 'all';
    }

    // 2. إعادة ضبط تواريخ شركات التوزيع للشهر الحالي كاملاً
    const defComp = (window.getDefaultCompanyMonthRange ? window.getDefaultCompanyMonthRange() : null);
    if (defComp) {
        const companyStartEl = document.getElementById('companyStartDate');
        const companyEndEl = document.getElementById('companyEndDate');
        if (window.companyStartFp) {
            window.companyStartFp.setDate(defComp.startStr);
        } else if (companyStartEl) {
            companyStartEl.value = defComp.startStr;
        }

        if (window.companyEndFp) {
            window.companyEndFp.setDate(defComp.endStr);
        } else if (companyEndEl) {
            companyEndEl.value = defComp.endStr;
        }
    }

    // 3. ضبط حقول البحث في السجل العام للأسبوع الحالي (من السبت إلى الجمعة)
    const defWeek = (window.getDefaultWeekRange ? window.getDefaultWeekRange() : null);
    if (defWeek) {
        const histStartEl = document.getElementById('historyStartDate');
        const histEndEl = document.getElementById('historyEndDate');
        if (window.historyStartFp) {
            window.historyStartFp.setDate(defWeek.startStr);
        } else if (histStartEl) {
            histStartEl.value = defWeek.startStr;
        }

        if (window.historyEndFp) {
            window.historyEndFp.setDate(defWeek.endStr);
        } else if (histEndEl) {
            histEndEl.value = defWeek.endStr;
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const compSelect = document.getElementById('companyFilterSelect');
    if (compSelect) compSelect.value = 'all';

    const defWeek = (window.getDefaultWeekRange ? window.getDefaultWeekRange() : null);
    const defComp = (window.getDefaultCompanyMonthRange ? window.getDefaultCompanyMonthRange() : null);

    if (typeof flatpickr !== 'undefined') {
        const flatpickrConfig = {
            dateFormat: "Y-m-d", // الصيغة الفعلية للكود
            altInput: true,      // إنشاء حقل واجهة للعرض فقط
            altFormat: "d/m/Y",  // الصيغة التي يراها المستخدم (dd/mm/yyyy)
            allowInput: true,    // السماح بالكتابة اليدوية إذا أراد المستخدم
            disableMobile: true  // إجبار ظهور صيغة dd/mm/yyyy على الهواتف النقالة ومنع التحويل للنمط الافتراضي
        };

        window.historyStartFp = flatpickr("#historyStartDate", {
            ...flatpickrConfig,
            defaultDate: defWeek ? defWeek.startStr : undefined
        });
        window.historyEndFp = flatpickr("#historyEndDate", {
            ...flatpickrConfig,
            defaultDate: defWeek ? defWeek.endStr : undefined
        });

        // حقول فواتير وتصفح مبيعات شركات التوزيع
        const companyStartEl = document.getElementById('companyStartDate');
        const companyEndEl = document.getElementById('companyEndDate');
        if (companyStartEl && companyEndEl) {
            window.companyStartFp = flatpickr("#companyStartDate", {
                ...flatpickrConfig,
                defaultDate: defComp ? defComp.startStr : undefined
            });
            window.companyEndFp = flatpickr("#companyEndDate", {
                ...flatpickrConfig,
                defaultDate: defComp ? defComp.endStr : undefined
            });
        }
    }

    resetAllSearchBoxesToDefaults();
});

// التعامل مع bfcache وإعادة التحميل من الذاكرة لضمان عدم حفظ الاختيارات السابقة
window.addEventListener("pageshow", () => {
    resetAllSearchBoxesToDefaults();
});

// =============================================
// دالة إلغاء العملية
// =============================================
window.deleteTransaction = async function (transactionId) {
    const cached = window.masterHistoryDocsCache && window.masterHistoryDocsCache[transactionId];
    const beforeClose = cached && window.MizoLedger && !window.MizoLedger.counts(cached);
    const isConfirmed = await showConfirm(beforeClose
        ? 'هذه العملية قبل آخر إقفال للحساب. حذفها يزيلها من السجل والتقارير فقط، ولا يغيّر أرصدة المناديب.\n\nهل تريد حذفها؟'
        : 'هل أنت متأكد من إلغاء هذه العملية؟');
    if (isConfirmed) {
        try {
            await db.collection('transactions').doc(transactionId).delete();
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_delete_transaction',
                    category: 'admin',
                    severity: 'danger',
                    title: 'إلغاء وحذف معاملة مالية: ' + transactionId,
                    details: { transactionId: transactionId }
                });
            }
            if (typeof showToast === 'function') showToast('تم إلغاء العملية بنجاح', 'success');
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            if (typeof showToast === 'function') showToast('حدث خطأ أثناء إلغاء العملية', 'error');
        }
    }
};

function escapeForAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// =============================================
// مركز التحكم في قوانين وعمولات ونسب المناديب
// =============================================
function openStaffRulesModal() {
    const modal = document.getElementById('staffRulesModal');
    if (!modal) {
        console.error('Modal #staffRulesModal not found in DOM');
        return;
    }
    try {
        if (typeof populateStaffRulesForm === 'function') {
            populateStaffRulesForm();
        } else if (typeof window.populateStaffRulesForm === 'function') {
            window.populateStaffRulesForm();
        }
    } catch (e) {
        console.error('Error populating staff rules form:', e);
    }
    try {
        if (typeof switchStaffRulesTab === 'function') {
            switchStaffRulesTab('tabCommissions');
        } else if (typeof window.switchStaffRulesTab === 'function') {
            window.switchStaffRulesTab('tabCommissions');
        }
    } catch (e) {
        console.error('Error switching tab:', e);
    }
    modal.style.display = 'flex';
}
window.openStaffRulesModal = openStaffRulesModal;

function closeStaffRulesModal() {
    const modal = document.getElementById('staffRulesModal');
    if (modal) modal.style.display = 'none';
}
window.closeStaffRulesModal = closeStaffRulesModal;

window.switchStaffRulesTab = function (tabId) {
    document.querySelectorAll('.staff-rules-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.staff-rules-tab-pane').forEach(pane => pane.classList.remove('active'));

    const activeBtn = document.querySelector(`.staff-rules-tab-btn[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add('active');
};

window.toggleProfitSharingModeUI = function (mode) {
    const isCustom = (mode === 'custom');
    document.querySelectorAll('.staff-custom-percent-input-wrap').forEach(el => {
        el.style.display = isCustom ? 'flex' : 'none';
    });
};

window.populateStaffRulesForm = function (customRulesObj) {
    const rules = customRulesObj || window.currentStaffRules || window.DEFAULT_STAFF_RULES;
    if (!rules) return;

    // 1. العمولات
    const comm = rules.commissions || {};
    if (document.getElementById('rule_comm_iptv_3m')) document.getElementById('rule_comm_iptv_3m').value = comm.iptv_3m !== undefined ? comm.iptv_3m : 9;
    if (document.getElementById('rule_comm_iptv_6m')) document.getElementById('rule_comm_iptv_6m').value = comm.iptv_6m !== undefined ? comm.iptv_6m : 12;
    if (document.getElementById('rule_comm_iptv_12m')) document.getElementById('rule_comm_iptv_12m').value = comm.iptv_12m !== undefined ? comm.iptv_12m : 15;
    if (document.getElementById('rule_comm_smart_12m')) document.getElementById('rule_comm_smart_12m').value = comm.smart_12m !== undefined ? comm.smart_12m : 10;
    if (document.getElementById('rule_comm_smart_life')) document.getElementById('rule_comm_smart_life').value = comm.smart_life !== undefined ? comm.smart_life : 20;
    if (document.getElementById('rule_comm_vip_default')) document.getElementById('rule_comm_vip_default').value = comm.vip_default !== undefined ? comm.vip_default : 7.5;

    // 2. توزيع الأرباح
    const sharing = rules.profitSharing || {};
    const mode = sharing.mode || 'equal';
    if (document.getElementById('rule_profit_mode')) document.getElementById('rule_profit_mode').value = mode;

    const eligibleList = sharing.eligibleStaff || ['اسلام', 'ايوب', 'اسامه'];
    const customPercents = sharing.customPercents || {};

    const container = document.getElementById('rulesEligibleStaffContainer');
    if (container) {
        let staffList = [];
        if (window.staffDocs && window.staffDocs.length > 0) {
            staffList = window.staffDocs.map(d => {
                const data = d.data();
                return data.firstName ? data.firstName.trim() : (data.name ? data.name.trim().split(' ')[0] : 'مندوب');
            });
        }
        const allUniqueNames = Array.from(new Set([...eligibleList, ...staffList])).filter(Boolean);

        let html = '';
        allUniqueNames.forEach(name => {
            const isChecked = eligibleList.some(el => name.includes(el) || el.includes(name));
            const pct = customPercents[name] !== undefined ? customPercents[name] : (100 / Math.max(1, eligibleList.length)).toFixed(2);
            html += `
                <div class="staff-toggle-row">
                    <label class="staff-toggle-label">
                        <input type="checkbox" class="rule-staff-checkbox" data-staff-name="${escapeForAttr(name)}" ${isChecked ? 'checked' : ''} title="المندوب ${escapeForAttr(name)}" aria-label="المندوب ${escapeForAttr(name)}" style="transform: scale(1.2); cursor: pointer;">
                        <span>${name}</span>
                    </label>
                    <div class="staff-custom-percent-input-wrap" style="display: ${mode === 'custom' ? 'flex' : 'none'}; align-items: center; gap: 6px;">
                        <input type="number" step="0.1" min="0" max="100" class="rules-field-input rule-staff-percent-input" data-staff-name="${escapeForAttr(name)}" value="${pct}" placeholder="0" title="نسبة الربح للمندوب ${escapeForAttr(name)}" aria-label="نسبة الربح للمندوب ${escapeForAttr(name)}" style="width: 85px; padding: 6px 10px; font-size: 0.9rem; text-align: center;">
                        <span style="color: #94a3b8; font-size: 0.85rem; font-weight: bold;">%</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    const excluded = sharing.excludedStaff || ['ابراهيم'];
    if (document.getElementById('rule_excluded_staff')) document.getElementById('rule_excluded_staff').value = excluded.join('، ');

    // 3. التحويلات
    const transfers = rules.transfers || {};
    if (document.getElementById('rule_transfer_factor')) document.getElementById('rule_transfer_factor').value = transfers.debtCreditFactor !== undefined ? transfers.debtCreditFactor : 0.75;

    // 4. دورة الأسبوع
    const week = rules.weekCycle || {};
    if (document.getElementById('rule_week_start_day')) document.getElementById('rule_week_start_day').value = week.startDay !== undefined ? week.startDay : 6;
    if (document.getElementById('rule_auto_rollover')) document.getElementById('rule_auto_rollover').value = String(week.autoRollover !== false);
};

window.saveStaffRulesFromModal = async function () {
    const saveBtn = document.querySelector('.btn-rules-save');
    const feedbackEl = document.getElementById('staffRulesSaveFeedback');

    try {
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
            saveBtn.disabled = true;
        }

        // 1. قراءة العمولات
        const commissions = {
            iptv_3m: parseFloat(document.getElementById('rule_comm_iptv_3m')?.value) || 0,
            iptv_6m: parseFloat(document.getElementById('rule_comm_iptv_6m')?.value) || 0,
            iptv_12m: parseFloat(document.getElementById('rule_comm_iptv_12m')?.value) || 0,
            smart_12m: parseFloat(document.getElementById('rule_comm_smart_12m')?.value) || 0,
            smart_life: parseFloat(document.getElementById('rule_comm_smart_life')?.value) || 0,
            vip_default: parseFloat(document.getElementById('rule_comm_vip_default')?.value) || 0
        };

        // 2. قراءة المناديب
        const mode = document.getElementById('rule_profit_mode')?.value || 'equal';
        const eligibleStaff = [];
        const customPercents = {};

        document.querySelectorAll('.rule-staff-checkbox:checked').forEach(cb => {
            const sName = cb.getAttribute('data-staff-name');
            if (sName) {
                eligibleStaff.push(sName);
                const pctInput = document.querySelector(`.rule-staff-percent-input[data-staff-name="${sName}"]`);
                if (pctInput) {
                    customPercents[sName] = parseFloat(pctInput.value) || 0;
                }
            }
        });

        const excludedRaw = document.getElementById('rule_excluded_staff')?.value || '';
        const excludedStaff = excludedRaw.split(/[,،]/).map(s => s.trim()).filter(Boolean);

        const profitSharing = {
            mode: mode,
            eligibleStaff: eligibleStaff,
            customPercents: customPercents,
            excludedStaff: excludedStaff
        };

        // 3. التحويلات
        const debtCreditFactor = parseFloat(document.getElementById('rule_transfer_factor')?.value) || 0.75;
        const transfers = {
            debtCreditFactor: debtCreditFactor
        };

        // 4. الشركات (الحفاظ على الإعدادات الافتراضية للشركات)
        const currentComp = (window.currentStaffRules && window.currentStaffRules.companyDefaults) || {};
        const companyDefaults = {
            almezoPercent: currentComp.almezoPercent !== undefined ? currentComp.almezoPercent : 85,
            companyPercent: currentComp.companyPercent !== undefined ? currentComp.companyPercent : 15
        };

        // 5. دورة الأسبوع
        const weekCycle = {
            startDay: parseInt(document.getElementById('rule_week_start_day')?.value, 10) || 6,
            autoRollover: document.getElementById('rule_auto_rollover')?.value === 'true'
        };

        const newRules = {
            commissions: commissions,
            profitSharing: profitSharing,
            transfers: transfers,
            companyDefaults: companyDefaults,
            weekCycle: weekCycle,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'admin'
        };

        await window.saveStaffRules(newRules);

        // إظهار رسالة التأكيد الخضراء وتحديث حالة الزر لعلامة الصح ليتأكد المدير فوراً أن كل تغييراته محفوظة
        if (feedbackEl) {
            feedbackEl.classList.add('show');
        }

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> تم الحفظ بنجاح!';
            saveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        }

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_update_staff_rules',
                category: 'admin',
                severity: 'warning',
                title: 'تحديث مركز قوانين وعمولات المناديب والمبيعات',
                details: { rules: newRules }
            });
        }

        // إبقاء إشعار التأكيد الأخضر لثوانٍ معدودة ليتأكد المدير تماماً، ثم إغلاق النافذة
        await new Promise(resolve => setTimeout(resolve, 1100));

        window.closeStaffRulesModal();

        if (typeof showToast === 'function') {
            showToast('✓ تم حفظ وتطبيق القوانين الجديدة بنجاح على جميع اللوحات!', 'success');
        } else {
            showAlert('تم حفظ وتطبيق القوانين الجديدة بنجاح على جميع اللوحات!');
        }

        // تحديث الواجهة فوراً
        if (typeof renderRealtimeBalances === 'function') renderRealtimeBalances();
        if (typeof searchCompanySales === 'function') searchCompanySales();
    } catch (err) {
        console.error('Error saving staff rules:', err);
        showAlert('فشل حفظ القوانين: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ وتطبيق القوانين';
            saveBtn.style.background = '';
        }
        if (feedbackEl) {
            feedbackEl.classList.remove('show');
            feedbackEl.style.display = '';
        }
    }
};

window.restoreDefaultStaffRules = async function () {
    const isConfirmed = await showConfirm('هل أنت متأكد من استعادة كافة القوانين والنسب الافتراضية للنظام؟');
    if (isConfirmed) {
        window.populateStaffRulesForm(window.DEFAULT_STAFF_RULES);
        if (typeof showToast === 'function') showToast('تمت استعادة القيم الافتراضية في الحقول، اضغط حفظ لتطبيقها', 'info');
    }
};

window.addEventListener('staffRulesChanged', () => {
    if (typeof window.fetchMasterHistory === 'function') {
        window.fetchMasterHistory();
    }
    if (typeof renderRealtimeBalances === 'function') {
        renderRealtimeBalances();
    }
    if (typeof searchCompanySales === 'function') {
        searchCompanySales();
    }
});

// ربط زر فتح نافذة القوانين والعمولات بالحدث برمجياً
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnStaffRules') || document.querySelector('.btn-staff-rules');
    if (btn) {
        btn.onclick = function (e) {
            e.preventDefault();
            openStaffRulesModal();
        };
    }
});

// إشعارات المدير: التنفيذ الوحيد في ui.js (المحمَّل في هذه الصفحة أيضاً). كانت هنا نسخة
// مكررة تستدعي Swal.fire بينما الصفحة لا تحمّل مكتبة SweetAlert، فكان الإرسال والحذف من
// لوحة المدير يتوقفان بخطأ "Swal is not defined".






