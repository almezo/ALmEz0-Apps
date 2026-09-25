// =============================================
// ملف واجهة المستخدم الرئيسي (UI Logic)
// يحتوي على:
// - حقن النوافذ المنبثقة ديناميكياً (DOMParser - آمن ونظيف)
// - دوال عرض المنتجات والسيرفرات
// - نظام التسجيل واعتراض زر الشراء
// - نظام الإشعارات (Toast)
// - تشفير كلمات المرور بـ SHA-256
// - نظام تسجيل دخول مزدوج (Dual-mode) لترحيل المستخدمين القدامى
// =============================================

// تحميل جسر المنصات (App Bridge) تلقائياً لدعم تطبيقات الجوال والكمبيوتر
if (!window.AlMeZ0App) {
    (function () {
        var s = document.createElement('script');
        s.src = 'app-bridge.js';
        document.head.appendChild(s);
    })();
}

// === متغيرات عامة ===
let siteData = { iptv: [], smartApps: [], vip: [] };

var ADMIN_UID = window.ADMIN_UID || '7Rfvdr6GpwPcY9uDQwX0fIuWeRv1';
let isEditMode = false;
let isDataLoadedFromFirestore = false;

// =============================================
// وضع التعديل: حماية التعديلات غير المحفوظة
// =============================================
// كل بطاقة تعديل تحمل data-edit-id. أي كتابة فيها تجعلها "غير محفوظة"، وعند إعادة رسم الصفحة
// (بعد حفظ منتج آخر أو تحديث من فايربيز) تبقى البطاقة نفسها بما كتبه المدير بدل أن تُستبدل بالقيم القديمة.
const editDirty = new Set();

/** قيمة آمنة داخل value="" أو textarea: علامة " في اسم كانت تقطع الخانة وتُحفظ مقطوعة. */
function escEdit(v) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function markEditDirty(id) {
    if (!id || !isEditMode) return;
    editDirty.add(id);
    updateSaveAllButton();
}

function clearEditDirty(id) {
    editDirty.delete(id);
    updateSaveAllButton();
}

function editCardSelector(id) {
    return '[data-edit-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]';
}

/** يرسم الحاوية من جديد مع إبقاء بطاقات التعديل غير المحفوظة كما هي (بكل ما كُتب فيها). */
function renderKeepingEdits(container, html) {
    var kept = {};
    if (isEditMode && editDirty.size) {
        container.querySelectorAll('[data-edit-id]').forEach(function (node) {
            if (editDirty.has(node.dataset.editId)) kept[node.dataset.editId] = node;
        });
    }
    container.innerHTML = html;
    Object.keys(kept).forEach(function (id) {
        var fresh = container.querySelector(editCardSelector(id));
        if (fresh) fresh.replaceWith(kept[id]);
        else clearEditDirty(id); // المنتج حُذف من مكان آخر
    });
}

window.removeEditRow = function (btn) {
    var card = btn.closest('[data-edit-id]');
    btn.parentElement.remove();
    if (card) markEditDirty(card.dataset.editId);
};

['input', 'change'].forEach(function (type) {
    document.addEventListener(type, function (e) {
        if (!isEditMode || !e.target || !e.target.closest) return;
        var card = e.target.closest('[data-edit-id]');
        if (card) markEditDirty(card.dataset.editId);
    }, true);
});

/** زر "حفظ كل التعديلات" العائم: يظهر فقط حين توجد تعديلات غير محفوظة. */
function updateSaveAllButton() {
    var btn = document.getElementById('adminSaveAllBtn');
    var count = isEditMode ? editDirty.size : 0;
    if (!count) {
        if (btn) btn.remove();
        return;
    }
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'adminSaveAllBtn';
        btn.type = 'button';
        btn.className = 'admin-save-all-btn';
        btn.onclick = function () { window.saveAllEdits(); };
        document.body.appendChild(btn);
    }
    btn.innerHTML = '<i class="fas fa-save"></i> حفظ كل التعديلات <span class="admin-save-all-count">' + count + '</span>';
}

window.saveAllEdits = async function () {
    var ids = Array.from(editDirty);
    if (!ids.length) return;
    var btn = document.getElementById('adminSaveAllBtn');
    if (btn) btn.disabled = true;
    var ok = 0, failed = 0;
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var card = document.querySelector(editCardSelector(id));
        if (!card) { clearEditDirty(id); continue; }
        var kind = card.dataset.editKind;
        var saved = false;
        if (kind === 'home') saved = await window.saveHomeCard(id.slice(5), { silent: true });
        else if (kind === 'details') saved = await window.saveProductDetails(id, card.dataset.editCategory, { silent: true });
        else saved = await window.saveProduct(id, { silent: true });
        if (saved) ok++; else failed++;
    }
    btn = document.getElementById('adminSaveAllBtn');
    if (btn) btn.disabled = false;
    if (failed) showToast('تم حفظ ' + ok + ' وتعذّر حفظ ' + failed + ' — راجع البطاقات المتبقية', 'error');
    else showToast('تم حفظ كل التعديلات (' + ok + ')', 'success');
};

/** قبل الخروج من وضع التعديل أو مغادرة الصفحة: تنبيه إن كانت هناك تعديلات لم تُحفظ. */
async function confirmDiscardEdits() {
    if (!isEditMode || !editDirty.size) return true;
    var ok = await showConfirm('لديك تعديلات غير محفوظة على ' + editDirty.size + ' عنصر.\nإذا تابعت ستضيع هذه التعديلات.',
        { title: 'تعديلات غير محفوظة' });
    if (ok) {
        editDirty.clear();
        updateSaveAllButton();
    }
    return ok;
}

document.addEventListener('click', async function (e) {
    if (!isEditMode || !editDirty.size) return;
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || link.target === '_blank' || link.getAttribute('href').charAt(0) === '#') return;
    e.preventDefault();
    e.stopPropagation();
    if (await confirmDiscardEdits()) window.location.href = link.href;
}, true);

// المنتجات المحذوفة: نسخة كاملة على جهاز المدير (آخر 10) وفي سجل النشاط، فيمكن استرجاعها
const DELETED_PRODUCTS_KEY = 'almezo_deleted_products';

function readDeletedProducts() {
    try { return JSON.parse(localStorage.getItem(DELETED_PRODUCTS_KEY) || '[]') || []; } catch (e) { return []; }
}

function writeDeletedProducts(list) {
    try { localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { }
}

function deletedProductsHtml(categoryKey) {
    var list = readDeletedProducts().filter(function (d) { return d.data && d.data.category === categoryKey; });
    if (!list.length) return '';
    var html = '<div class="admin-restore-box"><div class="admin-restore-title"><i class="fas fa-trash-arrow-up"></i> منتجات محذوفة يمكن استرجاعها</div>';
    list.forEach(function (d) {
        html += '<button type="button" class="admin-restore-btn" onclick="restoreDeletedProduct(\'' + escEdit(d.id) + '\')">'
            + '<i class="fas fa-rotate-left"></i> ' + escEdit(d.data.name || d.id)
            + ' <span class="admin-restore-date">' + new Date(d.deletedAt).toLocaleDateString('en-GB') + '</span></button>';
    });
    return html + '</div>';
}

window.restoreDeletedProduct = async function (id) {
    var list = readDeletedProducts();
    var entry = list.find(function (d) { return d.id === id; });
    if (!entry) return;
    try {
        var ref = db.collection('products').doc(id);
        var existing = await ref.get();
        if (existing.exists) {
            showToast('يوجد منتج بنفس المعرّف حالياً، لا يمكن الاسترجاع فوقه', 'error');
            return;
        }
        await ref.set(entry.data);
        writeDeletedProducts(list.filter(function (d) { return d.id !== id; }));
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_restore_product',
                category: 'admin',
                severity: 'success',
                title: 'استرجاع منتج محذوف: ' + (entry.data.name || id),
                details: { productId: id, name: entry.data.name || '' }
            });
        }
        showToast('تم استرجاع المنتج: ' + (entry.data.name || id), 'success');
        renderCurrentPage();
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الاسترجاع', 'error');
    }
};

/**
 * توحيد شكل السعر والمدة عند الحفظ. الأرقام العربية (٥٠) تتحول إلى 50: أرباح المناديب تتعرف على
 * الباقة بالبحث عن "3" أو "12" في المدة، فمدة مكتوبة "٣ أشهر" كانت تُحسب بلا ربح.
 * السعر الذي هو رقم وعملة فقط (50، ٥٠ دل، 50د.ل) يُحفظ "50 د.ل"، وأي نص آخر يبقى كما كُتب.
 */
function normalizeDigits(text) {
    return String(text || '').replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
        .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
        .replace(/٫/g, '.');
}

function normalizePrice(text) {
    var t = normalizeDigits(text).trim();
    var m = t.match(/^(\d+(?:[.,]\d+)?)\s*(د\s*\.?\s*ل\s*\.?|دينار(\s*ليبي)?|ل\s*\.?\s*د\s*\.?|lyd)?$/i);
    if (!m) return t;
    return m[1].replace(',', '.') + ' د.ل';
}

window.renderCurrentPage = function () {
    if (document.getElementById('homeCategoriesGrid')) renderHomeCards();
    if (document.getElementById('vip-container')) renderLogoList('vip', 'vip-container', 'vip-details.html');
    if (window.location.pathname.includes('vip-details')) renderDetails('vip');
    if (document.getElementById('smart-container')) renderLogoList('smartApps', 'smart-container', 'app-details.html');
    if (document.getElementById('iptv-container')) renderIptvList('iptv-container');
    if (window.location.pathname.includes('server-details')) renderDetails('iptv');
    if (window.location.pathname.includes('app-details')) renderDetails('smartApps');
};

function checkFABMode() {
    const user = getCurrentUser();

    // إزالة الأزرار القديمة لتجنب التكرار
    const oldFab = document.getElementById('adminFab');
    if (oldFab) oldFab.remove();

    const existingFabContainer = document.getElementById('globalFabContainer');
    if (existingFabContainer) existingFabContainer.remove();

    // إزالة حاوية الأدمن القديمة إن وجدت
    const oldAdminContainer = document.getElementById('adminFabContainer');
    if (oldAdminContainer) oldAdminContainer.remove();

    // إزالة الحاوية اليمنى القديمة إن وجدت لتجنب التكرار
    const existingRightFabContainer = document.getElementById('globalFabContainerRight');
    if (existingRightFabContainer) existingRightFabContainer.remove();

    isEditMode = false;

    if (user && (user.uid === ADMIN_UID || user.role === 'staff' || user.role === 'admin')) {
        // حاوية اليسار (للتقارير والمشتريات)
        const fabContainerLeft = document.createElement('div');
        fabContainerLeft.id = 'globalFabContainer';
        fabContainerLeft.className = 'global-fab-container';

        // حاوية اليمين (للتعديل والأمان)
        const fabContainerRight = document.createElement('div');
        fabContainerRight.id = 'globalFabContainerRight';
        fabContainerRight.className = 'global-fab-container global-fab-right';

        if (user.uid === ADMIN_UID || user.role === 'admin') {
            // 1. زر إرسال الإشعارات لجميع الأجهزة والعملاء (يمين)
            const broadcastFab = document.createElement('button');
            broadcastFab.id = 'adminBroadcastFab';
            broadcastFab.className = 'floating-btn broadcast-fab';
            broadcastFab.innerHTML = '<i class="fas fa-bullhorn"></i>';
            broadcastFab.title = 'إرسال إشعار فوري لجميع الأجهزة والعملاء';
            broadcastFab.onclick = function () {
                if (typeof openBroadcastModal === 'function') {
                    openBroadcastModal();
                }
            };

            // 2. زر التعديل (يمين)
            const editFab = document.createElement('button');
            editFab.id = 'adminFab';
            editFab.className = 'floating-btn edit-fab';
            editFab.innerHTML = '<i class="fas fa-pen-to-square"></i>';
            editFab.title = 'تعديل الأسعار والمحتوى';
            editFab.onclick = async function () {
                if (isEditMode && !(await confirmDiscardEdits())) return;
                isEditMode = !isEditMode;
                if (!isEditMode) { editDirty.clear(); updateSaveAllButton(); }
                editFab.classList.toggle('edit-mode-active', isEditMode);
                editFab.innerHTML = isEditMode ? '<i class="fas fa-times"></i>' : '<i class="fas fa-pen-to-square"></i>';
                renderCurrentPage();
                toggleAdminLayoutPanel(isEditMode);
            };

            // 3. زر غرفة المراقبة والأمان (يمين)
            const securityFab = document.createElement('button');
            securityFab.id = 'adminSecurityBtn';
            securityFab.className = 'floating-btn security-fab';
            securityFab.innerHTML = '<i class="fas fa-shield-halved"></i>';
            securityFab.title = 'غرفة المراقبة والأمان';
            securityFab.onclick = function () { window.location.href = 'security-monitor.html'; };

            // 4. زر تقارير المبيعات ولوحة الإدارة (يسار)
            const reportsFab = document.createElement('button');
            reportsFab.id = 'adminReportsBtn';
            reportsFab.className = 'floating-btn reports-fab';
            reportsFab.innerHTML = '<i class="fas fa-chart-pie"></i>';
            reportsFab.title = 'تقارير المبيعات ولوحة الإدارة';
            reportsFab.onclick = function () { window.location.href = 'admin-dashboard.html'; };

            // 5. زر المشتريات والمخزن (يسار)
            const purchasesFab = document.createElement('button');
            purchasesFab.id = 'adminPurchasesBtn';
            purchasesFab.className = 'floating-btn purchases-fab';
            purchasesFab.innerHTML = '<i class="fas fa-boxes-packing"></i>';
            purchasesFab.title = 'لوحة المشتريات والمخزون';
            purchasesFab.onclick = function () { window.location.href = 'purchases.html'; };

            // 6. زر مركز ذكاء العملاء ومستخدمي المشغل (يسار - فوق المشتريات والمبيعات)
            const usersIntelFab = document.createElement('button');
            usersIntelFab.id = 'adminUsersIntelBtn';
            usersIntelFab.className = 'floating-btn users-intel-fab';
            usersIntelFab.innerHTML = '<i class="fas fa-users-gear"></i>';
            usersIntelFab.title = 'قاعدة بيانات العملاء ومستخدمي المشغل';
            usersIntelFab.onclick = function () { openUsersIntelModal(); };

            // إضافة الأزرار للحاويات المخصصة لها
            fabContainerRight.appendChild(broadcastFab);
            fabContainerRight.appendChild(editFab);
            fabContainerRight.appendChild(securityFab);

            fabContainerLeft.appendChild(reportsFab);
            fabContainerLeft.appendChild(purchasesFab);
            fabContainerLeft.appendChild(usersIntelFab);


        } else if (user.role === 'staff') {
            // زر المندوبين (يسار)
            const staffDashboardBtn = document.createElement('button');
            staffDashboardBtn.id = 'staffDashboardBtn';
            staffDashboardBtn.className = 'floating-btn staff-fab-yellow';
            staffDashboardBtn.innerHTML = '<i class="fas fa-cash-register"></i>';
            staffDashboardBtn.title = 'لوحة المبيعات للمندوبين';
            staffDashboardBtn.onclick = function () { window.location.href = 'staff.html'; };

            fabContainerLeft.appendChild(staffDashboardBtn);
        }

        // طباعة الحاويتين في الشاشة
        document.body.appendChild(fabContainerLeft);
        document.body.appendChild(fabContainerRight);

        if (user.uid === ADMIN_UID || user.role === 'admin') {
            applyAdminFabLayout();
            subscribeAdminFabLayout();
        }
    }
    toggleAdminLayoutPanel(false);
}

// =========================================================
// ترتيب أزرار المدير العائمة (من زر التعديل)
// =========================================================
// الترتيب محفوظ كما تراه العين من الأعلى للأسفل. الحاويات مرتّبة بـ column-reverse،
// فأول عنصر في DOM يظهر في الأسفل؛ التحويل يتم عند التطبيق فقط.
// يُحفظ في siteConfig/adminLayout (الكتابة للمدير وحده في firestore.rules)، فيتبع المدير
// على كل أجهزته، مع نسخة محلية تُطبَّق فوراً قبل وصول فايربيز.
const ADMIN_FAB_LABELS = {
    adminBroadcastFab: { name: 'إرسال الإشعارات', icon: 'fa-bullhorn' },
    adminFab: { name: 'زر التعديل', icon: 'fa-pen-to-square' },
    adminSecurityBtn: { name: 'غرفة المراقبة والأمان', icon: 'fa-shield-halved' },
    adminReportsBtn: { name: 'التقارير ولوحة الإدارة', icon: 'fa-chart-pie' },
    adminPurchasesBtn: { name: 'المشتريات والمخزون', icon: 'fa-boxes-packing' },
    adminUsersIntelBtn: { name: 'مركز العملاء', icon: 'fa-users-gear' }
};
const DEFAULT_ADMIN_FAB_LAYOUT = {
    right: ['adminSecurityBtn', 'adminFab', 'adminBroadcastFab'],
    left: ['adminUsersIntelBtn', 'adminPurchasesBtn', 'adminReportsBtn']
};
let adminFabLayout = null;
let adminFabLayoutUnsub = null;

function readAdminFabLayout() {
    let layout = adminFabLayout;
    if (!layout) {
        try { layout = JSON.parse(localStorage.getItem('almezo_admin_fab_layout') || 'null'); } catch (e) { layout = null; }
    }
    return normalizeAdminFabLayout(layout);
}

/** كل زر معروف يظهر مرة واحدة بالضبط؛ ما ليس في المحفوظ يعود لمكانه الافتراضي. */
function normalizeAdminFabLayout(layout) {
    const known = Object.keys(ADMIN_FAB_LABELS);
    const seen = new Set();
    const clean = { right: [], left: [] };
    ['right', 'left'].forEach(function (side) {
        const list = layout && Array.isArray(layout[side]) ? layout[side] : [];
        list.forEach(function (id) {
            if (known.indexOf(id) !== -1 && !seen.has(id)) { seen.add(id); clean[side].push(id); }
        });
    });
    ['right', 'left'].forEach(function (side) {
        DEFAULT_ADMIN_FAB_LAYOUT[side].forEach(function (id) {
            if (!seen.has(id)) { seen.add(id); clean[side].push(id); }
        });
    });
    return clean;
}

function applyAdminFabLayout() {
    const right = document.getElementById('globalFabContainerRight');
    const left = document.getElementById('globalFabContainer');
    if (!right || !left) return;
    const layout = readAdminFabLayout();
    [['right', right], ['left', left]].forEach(function (pair) {
        // من الأسفل للأعلى داخل column-reverse
        layout[pair[0]].slice().reverse().forEach(function (id) {
            const btn = document.getElementById(id);
            if (btn) pair[1].appendChild(btn);
        });
    });
}

function subscribeAdminFabLayout() {
    if (adminFabLayoutUnsub || typeof db === 'undefined' || !db) return;
    try {
        adminFabLayoutUnsub = db.collection('siteConfig').doc('adminLayout').onSnapshot(function (doc) {
            if (!doc.exists) return;
            const data = doc.data() || {};
            adminFabLayout = normalizeAdminFabLayout({ right: data.right, left: data.left });
            try { localStorage.setItem('almezo_admin_fab_layout', JSON.stringify(adminFabLayout)); } catch (e) { }
            applyAdminFabLayout();
            if (document.getElementById('adminLayoutPanel')) renderAdminLayoutPanel();
        }, function () { });
    } catch (e) { }
}

async function saveAdminFabLayout(layout) {
    const previous = readAdminFabLayout();
    adminFabLayout = normalizeAdminFabLayout(layout);
    try { localStorage.setItem('almezo_admin_fab_layout', JSON.stringify(adminFabLayout)); } catch (e) { }
    applyAdminFabLayout();
    renderAdminLayoutPanel();
    try {
        await db.collection('siteConfig').doc('adminLayout').set({
            right: adminFabLayout.right,
            left: adminFabLayout.left,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (e) {
        console.error('تعذر حفظ ترتيب الأزرار:', e);
        adminFabLayout = previous;
        try { localStorage.setItem('almezo_admin_fab_layout', JSON.stringify(previous)); } catch (err) { }
        applyAdminFabLayout();
        renderAdminLayoutPanel();
        if (typeof showToast === 'function') showToast('تعذر حفظ الترتيب - تأكد أنك مسجل دخول كمدير', 'error');
    }
}

/** تحريك زر للأعلى (-1) أو للأسفل (+1) في عموده، أو نقله للعمود الآخر ('swap'). */
window.moveAdminFab = function (id, action) {
    const layout = readAdminFabLayout();
    const side = layout.right.indexOf(id) !== -1 ? 'right' : 'left';
    const list = layout[side];
    const i = list.indexOf(id);
    if (i === -1) return;
    if (action === 'swap') {
        list.splice(i, 1);
        layout[side === 'right' ? 'left' : 'right'].push(id);
    } else {
        const j = i + action;
        if (j < 0 || j >= list.length) return;
        list[i] = list[j];
        list[j] = id;
    }
    saveAdminFabLayout(layout);
};

window.resetAdminFabLayout = function () {
    saveAdminFabLayout(DEFAULT_ADMIN_FAB_LAYOUT);
};

function renderAdminLayoutPanel() {
    const panel = document.getElementById('adminLayoutPanel');
    if (!panel) return;
    const layout = readAdminFabLayout();
    function column(side, title) {
        const list = layout[side];
        const rows = list.map(function (id, i) {
            const meta = ADMIN_FAB_LABELS[id];
            return '<div class="alp-row">' +
                '<span class="alp-name"><i class="fas ' + meta.icon + '"></i> ' + meta.name + '</span>' +
                '<span class="alp-actions">' +
                '<button type="button" onclick="moveAdminFab(\'' + id + '\', -1)" title="للأعلى"' + (i === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" onclick="moveAdminFab(\'' + id + '\', 1)" title="للأسفل"' + (i === list.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                '<button type="button" onclick="moveAdminFab(\'' + id + '\', \'swap\')" title="نقله للجهة الأخرى"><i class="fas fa-right-left"></i></button>' +
                '</span></div>';
        }).join('');
        return '<div class="alp-col"><div class="alp-col-title">' + title + '</div>' + (rows || '<div class="alp-empty">لا أزرار</div>') + '</div>';
    }
    panel.innerHTML =
        '<div class="alp-head"><span><i class="fas fa-grip"></i> ترتيب أزرار المدير</span>' +
        '<button type="button" class="alp-reset" onclick="resetAdminFabLayout()">الترتيب الأصلي</button></div>' +
        '<div class="alp-cols">' + column('right', 'الجهة اليمنى') + column('left', 'الجهة اليسرى') + '</div>' +
        '<div class="alp-hint">الترتيب يُحفظ فوراً ويظهر على كل أجهزتك. ترتيب بطاقات الأقسام من أزرار التقديم والتأخير على كل بطاقة.</div>';
}

function toggleAdminLayoutPanel(show) {
    let panel = document.getElementById('adminLayoutPanel');
    const isAdminUser = !!document.getElementById('adminFab');
    if (!show || !isAdminUser) {
        if (panel) panel.remove();
        return;
    }
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adminLayoutPanel';
        panel.className = 'admin-layout-panel';
        // جزء من الصفحة فوق البطاقات لا طبقة عائمة فوقها، حتى تبقى حقول تعديل البطاقات متاحة
        const grid = document.getElementById('homeCategoriesGrid');
        const anchor = grid || document.querySelector('main') || document.querySelector('.container');
        if (grid && grid.parentNode) grid.parentNode.insertBefore(panel, grid);
        else if (anchor) anchor.insertBefore(panel, anchor.firstChild);
        else document.body.appendChild(panel);
    }
    renderAdminLayoutPanel();
}

// =========================================================
// BROADCAST NOTIFICATION MODAL CONTROLLER (UI Integration)
// =========================================================
function injectBroadcastModalHtml() {
    if (document.getElementById('broadcastNotificationModal')) return;

    const modal = document.createElement('div');
    modal.id = 'broadcastNotificationModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.height = '100dvh';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.webkitBackdropFilter = 'blur(8px)';
    modal.style.zIndex = '999999';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.padding = '12px';
    modal.style.boxSizing = 'border-box';
    modal.style.overflow = 'hidden';

    modal.innerHTML = `
        <div class="modal-content broadcast-modal-content">
            <div class="modal-header broadcast-modal-header">
                <h2 class="broadcast-modal-title">
                    <i class="fas fa-bullhorn icon-amber"></i>
                    مركز إرسال الإشعارات لجميع الأجهزة والعملاء
                </h2>
                <span class="close-modal" onclick="closeBroadcastModal()" style="cursor:pointer; font-size: 26px; color: #94a3b8;">&times;</span>
            </div>
            <div class="modal-body broadcast-modal-body">
                <div class="broadcast-tabs">
                    <button type="button" class="broadcast-tab active" id="bcTabSend" onclick="switchBroadcastTab('send')">
                        <i class="fas fa-paper-plane"></i> إرسال إشعار
                    </button>
                    <button type="button" class="broadcast-tab" id="bcTabInbox" onclick="switchBroadcastTab('inbox')">
                        <i class="fas fa-inbox"></i> الإشعارات الواردة
                        <span class="broadcast-tab-badge hidden" id="bcInboxBadge"></span>
                    </button>
                </div>

                <div id="broadcastInboxView">
                    <div class="mz-notif-list" id="adminInboxList"></div>
                </div>

                <div id="broadcastSendView">
                <div class="broadcast-info-banner">
                    <i class="fas fa-info-circle"></i>
                    <span>سيصل هذا الإشعار فوراً لشريط الإشعارات في أجهزة العملاء (أندرويد، كمبيوتر، متصفح) مع تنبيه مرئي وصوتي فور الإرسال.</span>
                </div>

                <div class="broadcast-form-grid">
                    <div class="broadcast-field-group">
                        <label for="broadcastNotifType" class="broadcast-label">
                            <i class="fas fa-tag"></i> نوع الإشعار:
                        </label>
                        <select id="broadcastNotifType" class="broadcast-select" onchange="updateBroadcastPreview()">
                            <option value="update">🚀 تحديث جديد للتطبيق (App Update)</option>
                            <option value="promo">🔥 عرض خاص وتخفيضات (Offers & Promos)</option>
                            <option value="product">✨ توفر منتج جديد (New Product)</option>
                            <option value="general">📢 تنبيه عام وصيانة (General Announcement)</option>
                        </select>
                    </div>

                    <div class="broadcast-field-group">
                        <label for="broadcastNotifTitle" class="broadcast-label">
                            <i class="fas fa-heading"></i> عنوان الإشعار:
                        </label>
                        <input type="text" id="broadcastNotifTitle" class="broadcast-input" placeholder="مثال: تحديث جديد لتطبيق الميزو v1.0.1 متاح الآن!" maxlength="80" oninput="updateBroadcastPreview()">
                    </div>

                    <div class="broadcast-field-group full-width">
                        <label for="broadcastNotifMessage" class="broadcast-label">
                            <i class="fas fa-comment-dots"></i> نص رسالة الإشعار:
                        </label>
                        <textarea id="broadcastNotifMessage" class="broadcast-textarea" rows="3" placeholder="اكتب تفاصيل الإشعار هنا... مثال: يتضمن التحديث الجديد سرعة تشغيل فائقة وتحديثات للأفلام والمسلسلات." maxlength="250" oninput="updateBroadcastPreview()"></textarea>
                    </div>

                    <div class="broadcast-field-group full-width">
                        <label class="broadcast-label">
                            <i class="fas fa-image"></i> صورة الإشعار (اختياري - تظهر داخل الموقع والبرنامج):
                        </label>
                        <div class="broadcast-image-row">
                            <input type="file" id="broadcastNotifImageFile" accept="image/*" style="display:none;" onchange="pickBroadcastImage(this)">
                            <button type="button" class="broadcast-img-btn" onclick="document.getElementById('broadcastNotifImageFile').click()">
                                <i class="fas fa-upload"></i> اختر صورة من جهازك
                            </button>
                            <button type="button" class="broadcast-img-btn danger" id="broadcastImgClear" style="display:none;" onclick="clearBroadcastImage()">
                                <i class="fas fa-times"></i> إزالة الصورة
                            </button>
                            <span class="broadcast-img-note" id="broadcastImgNote"></span>
                        </div>
                    </div>

                    <div class="broadcast-field-group full-width">
                        <label class="broadcast-label">
                            <i class="fas fa-clock"></i> وقت الإرسال:
                        </label>
                        <div class="broadcast-schedule-row">
                            <label class="broadcast-radio"><input type="radio" name="bcWhen" value="now" checked onchange="toggleBroadcastSchedule()"> إرسال فوري</label>
                            <label class="broadcast-radio"><input type="radio" name="bcWhen" value="later" onchange="toggleBroadcastSchedule()"> إرسال مجدول</label>
                            <input type="datetime-local" id="broadcastNotifSchedule" class="broadcast-input" style="display:none; max-width:240px;">
                        </div>
                    </div>

                    <div class="broadcast-field-group full-width">
                        <label for="broadcastNotifActionUrl" class="broadcast-label">
                            <i class="fas fa-link"></i> رابط الوجهة (اختياري - يفتح عند الضغط على الإشعار):
                        </label>
                        <input type="text" id="broadcastNotifActionUrl" class="broadcast-input" placeholder="مثال: https://almezo.store أو https://wa.me/218945772649">
                    </div>
                </div>

                <!-- معاينة حية لشكل الإشعار في جهاز العميل -->
                <div class="broadcast-preview-container">
                    <span class="preview-heading"><i class="fas fa-mobile-alt"></i> معاينة شكل الإشعار كما سيظهر في شريط هاتف أو كمبيوتر العميل:</span>
                    <div class="broadcast-preview-card" id="broadcastPreviewCard">
                        <div class="preview-top-row">
                            <div class="preview-app-identity">
                                <img src="photo/logo.ico" alt="ALmEz0" class="preview-app-icon" onerror="this.src='photo/logo-clean.png'">
                                <span class="preview-app-name">سيرفرات الميزو • ALmEz0</span>
                            </div>
                            <span class="preview-badge" id="previewBadge">🚀 تحديث جديد</span>
                            <span class="preview-time">الآن</span>
                        </div>
                        <div class="preview-body-row">
                            <img id="previewImage" class="preview-image" style="display:none;" alt="">
                            <div class="preview-text-block">
                                <h4 id="previewTitle" class="preview-title">تحديث جديد لتطبيق الميزو متاح الآن!</h4>
                                <p id="previewMessage" class="preview-message">يتضمن التحديث الجديد سرعة تشغيل فائقة وتحديثات للأفلام والمسلسلات.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- جدول آخر الإشعارات المرسلة -->
                <div class="broadcast-history-section">
                    <div class="broadcast-history-header">
                        <h4 class="broadcast-history-title"><i class="fas fa-history"></i> سجل آخر الإشعارات المرسلة</h4>
                        <button type="button" class="btn-refresh-history" onclick="loadBroadcastHistory()" title="تحديث السجل">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <div id="broadcastHistoryList" class="broadcast-history-list">
                        <div class="empty-state-sm" style="color: #64748b; text-align: center; padding: 10px;">جاري جلب السجل...</div>
                    </div>
                </div>

                </div>
            </div>

            <div class="modal-footer broadcast-modal-footer">
                <button type="button" class="btn-broadcast-cancel" onclick="closeBroadcastModal()">إلغاء</button>
                <button type="button" id="btnSendBroadcast" class="btn-send-broadcast" onclick="sendBroadcastNotification()">
                    <i class="fas fa-paper-plane"></i> إرسال الإشعار لجميع الأجهزة الآن
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeBroadcastModal();
        }
    });
}

/** التبويبان داخل نافذة الإشعارات: إرسال إشعار جديد، أو قراءة الإشعارات الواردة إليك. */
window.switchBroadcastTab = function (tab) {
    const sendView = document.getElementById('broadcastSendView');
    const inboxView = document.getElementById('broadcastInboxView');
    const tabSend = document.getElementById('bcTabSend');
    const tabInbox = document.getElementById('bcTabInbox');
    const footer = document.querySelector('#broadcastNotificationModal .broadcast-modal-footer');
    const isInbox = tab === 'inbox';
    if (sendView) sendView.style.display = isInbox ? 'none' : 'block';
    if (inboxView) inboxView.style.display = isInbox ? 'block' : 'none';
    if (footer) footer.classList.toggle('bc-footer-hidden', isInbox);
    if (tabSend) tabSend.classList.toggle('active', !isInbox);
    if (tabInbox) tabInbox.classList.toggle('active', isInbox);
    if (isInbox && window.MizoNotifCenter && window.MizoNotifCenter.renderInto) {
        window.MizoNotifCenter.renderInto(document.getElementById('adminInboxList'));
        const badge = document.getElementById('bcInboxBadge');
        if (badge) { badge.classList.add('hidden'); badge.textContent = ''; }
    }
};

window.openBroadcastModal = function () {
    injectBroadcastModalHtml();
    const modal = document.getElementById('broadcastNotificationModal');
    if (modal) {
        modal.style.display = 'flex';
        switchBroadcastTab('send');
        updateBroadcastPreview();
        loadBroadcastHistory();
        if (window.MizoNotifCenter && window.MizoNotifCenter.unread) {
            window.MizoNotifCenter.unread().then(function (n) {
                const badge = document.getElementById('bcInboxBadge');
                if (!badge) return;
                badge.textContent = n > 9 ? '9+' : String(n);
                badge.classList.toggle('hidden', !n);
            });
        }
    }
};

window.closeBroadcastModal = function () {
    const modal = document.getElementById('broadcastNotificationModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.updateBroadcastPreview = function () {
    const typeEl = document.getElementById('broadcastNotifType');
    const titleEl = document.getElementById('broadcastNotifTitle');
    const msgEl = document.getElementById('broadcastNotifMessage');

    const badgeEl = document.getElementById('previewBadge');
    const previewTitle = document.getElementById('previewTitle');
    const previewMessage = document.getElementById('previewMessage');

    if (!typeEl || !badgeEl || !previewTitle || !previewMessage) return;

    const type = typeEl.value;
    const typeLabels = {
        'update': '🚀 تحديث جديد',
        'promo': '🔥 عرض خاص',
        'product': '✨ منتج جديد',
        'general': '📢 تنبيه عام'
    };

    badgeEl.innerText = typeLabels[type] || '📢 إشعار';
    previewTitle.innerText = (titleEl && titleEl.value.trim()) || 'سيرفرات الميزو - ALmEz0';
    previewMessage.innerText = (msgEl && msgEl.value.trim()) || 'معاينة نص الإشعار كما سيظهر في شريط إشعارات هاتف وجهاز العميل...';

    const previewImg = document.getElementById('previewImage');
    if (previewImg) {
        if (window._broadcastImageData) {
            previewImg.src = window._broadcastImageData;
            previewImg.style.display = 'block';
        } else {
            previewImg.removeAttribute('src');
            previewImg.style.display = 'none';
        }
    }
};

// صورة الإشعار: تُصغَّر وتُضغط في المتصفح ثم تُحفظ داخل وثيقة الإشعار نفسها، فلا نحتاج خدمة
// تخزين مدفوعة. الحد الأقصى لوثيقة Firestore ميجابايت واحد، ونبقى تحت 150 كيلوبايت.
window._broadcastImageData = '';

window.pickBroadcastImage = function (input) {
    const file = input && input.files && input.files[0];
    const note = document.getElementById('broadcastImgNote');
    if (!file) return;
    if (!/^image\//.test(file.type)) {
        showToast('اختر ملف صورة', 'warning');
        return;
    }
    if (note) note.textContent = 'جاري تجهيز الصورة...';
    const reader = new FileReader();
    reader.onload = function () {
        const img = new Image();
        img.onload = function () {
            const maxW = 900;
            const scale = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            let quality = 0.82, data = canvas.toDataURL('image/jpeg', quality);
            while (data.length > 150000 && quality > 0.35) {
                quality -= 0.12;
                data = canvas.toDataURL('image/jpeg', quality);
            }
            if (data.length > 150000) {
                if (note) note.textContent = '';
                showToast('الصورة كبيرة جداً، جرّب صورة أصغر', 'error');
                return;
            }
            window._broadcastImageData = data;
            const clearBtn = document.getElementById('broadcastImgClear');
            if (clearBtn) clearBtn.style.display = '';
            if (note) note.textContent = 'تم تجهيز الصورة (' + Math.round(data.length / 1024) + ' كيلوبايت)';
            updateBroadcastPreview();
        };
        img.onerror = function () {
            if (note) note.textContent = '';
            showToast('تعذر قراءة الصورة', 'error');
        };
        img.src = reader.result;
    };
    reader.onerror = function () {
        if (note) note.textContent = '';
        showToast('تعذر قراءة الملف', 'error');
    };
    reader.readAsDataURL(file);
    input.value = '';
};

window.clearBroadcastImage = function () {
    window._broadcastImageData = '';
    const clearBtn = document.getElementById('broadcastImgClear');
    if (clearBtn) clearBtn.style.display = 'none';
    const note = document.getElementById('broadcastImgNote');
    if (note) note.textContent = '';
    updateBroadcastPreview();
};

window.toggleBroadcastSchedule = function () {
    const later = document.querySelector('input[name="bcWhen"]:checked');
    const input = document.getElementById('broadcastNotifSchedule');
    const btn = document.getElementById('btnSendBroadcast');
    const isLater = later && later.value === 'later';
    if (input) {
        input.style.display = isLater ? '' : 'none';
        if (isLater && !input.value) {
            const d = new Date(Date.now() + 60 * 60 * 1000);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            input.value = d.toISOString().slice(0, 16);
        }
    }
    if (btn) btn.innerHTML = isLater
        ? '<i class="fas fa-clock"></i> جدولة الإشعار'
        : '<i class="fas fa-paper-plane"></i> إرسال الإشعار لجميع الأجهزة الآن';
};

window.sendBroadcastNotification = async function () {
    const titleEl = document.getElementById('broadcastNotifTitle');
    const msgEl = document.getElementById('broadcastNotifMessage');
    const typeEl = document.getElementById('broadcastNotifType');
    const urlEl = document.getElementById('broadcastNotifActionUrl');
    const sendBtn = document.getElementById('btnSendBroadcast');

    const title = titleEl ? titleEl.value.trim() : '';
    const message = msgEl ? msgEl.value.trim() : '';
    const type = typeEl ? typeEl.value : 'general';
    const actionUrl = urlEl ? urlEl.value.trim() : '';

    if (!title) {
        showToast('يرجى كتابة عنوان الإشعار', 'warning');
        if (titleEl) titleEl.focus();
        return;
    }

    if (!message) {
        showToast('يرجى كتابة نص رسالة الإشعار', 'warning');
        if (msgEl) msgEl.focus();
        return;
    }

    // الرابط يُفتح عند الضغط على الإشعار في أجهزة العملاء: http/https فقط
    if (actionUrl && !/^https?:\/\/[^\s]+$/i.test(actionUrl)) {
        showToast('رابط الإشعار يجب أن يبدأ بـ https:// أو http://', 'warning');
        if (urlEl) urlEl.focus();
        return;
    }

    // كانت confirm() الافتراضية حين لا تُحمَّل مكتبة SweetAlert (الصفحة الرئيسية وتطبيق أندرويد)،
    // فتظهر بتصميم النظام. نافذة الموقع المصمّمة دائماً.
    // وقت الإرسال: فوري أو مجدول
    const whenEl = document.querySelector('input[name="bcWhen"]:checked');
    const isScheduled = whenEl && whenEl.value === 'later';
    let sendAt = 0;
    if (isScheduled) {
        const schedEl = document.getElementById('broadcastNotifSchedule');
        sendAt = schedEl && schedEl.value ? new Date(schedEl.value).getTime() : 0;
        if (!sendAt || isNaN(sendAt)) {
            showToast('حدد تاريخ ووقت الإرسال', 'warning');
            if (schedEl) schedEl.focus();
            return;
        }
        if (sendAt < Date.now() + 60000) {
            showToast('اختر وقتاً بعد دقيقة على الأقل من الآن', 'warning');
            return;
        }
    }

    const whenText = isScheduled
        ? 'سيُرسل هذا الإشعار تلقائياً في ' + new Date(sendAt).toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' })
        : 'سيتم إرسال هذا الإشعار فوراً لجميع أجهزة وعملاء سيرفرات الميزو';
    const confirmed = await showConfirm(`${whenText} (${title})، هل تريد المتابعة؟`, { title: isScheduled ? 'تأكيد جدولة الإشعار' : 'تأكيد إرسال الإشعار', okText: isScheduled ? 'نعم، جدوله' : 'نعم، أرسل الآن', danger: false });
    if (!confirmed) return;

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال لجميع الأجهزة...';
    }

    try {
        const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        const firestore = (window.db) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);

        if (!firestore) throw new Error('Firestore not initialized');

        const notifDoc = {
            type: type,
            title: title,
            message: message,
            actionUrl: actionUrl,
            timestamp: Date.now(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            senderUid: currentUser ? currentUser.uid : 'admin',
            active: true,
            // فارغ = إشعار عام للجميع. الإشعار الشخصي يحمل معرّف صاحبه (تنبيه اشتراك أو تنبيه أمني)
            targetUid: '',
            image: window._broadcastImageData || '',
            // المجدول: لا يظهر للعملاء إلا بعد أن ترسله الدالة المجدولة في وقته
            scheduledFor: isScheduled ? sendAt : 0,
            pending: isScheduled
        };
        if (isScheduled) notifDoc.timestamp = sendAt;

        await firestore.collection('broadcast_notifications').add(notifDoc);

        if (isScheduled) {
            showAlert('سيُرسل الإشعار تلقائياً في موعده المحدد، حتى لو كانت لوحة الإدارة مغلقة. يمكنك حذفه من السجل قبل موعده لإلغائه.', 'success', 'تمت الجدولة بنجاح! ⏰');
            clearBroadcastImage();
            if (titleEl) titleEl.value = '';
            if (msgEl) msgEl.value = '';
            if (urlEl) urlEl.value = '';
            updateBroadcastPreview();
            loadBroadcastHistory();
            if (sendBtn) {
                sendBtn.disabled = false;
                toggleBroadcastSchedule();
            }
            return;
        }

        clearBroadcastImage();
        showAlert('يصل فوراً إلى شريط إشعارات أجهزة أندرويد حتى والتطبيق مغلق، ويظهر لكل من يفتح الموقع أو برنامج الكمبيوتر الآن. (أجهزة أندرويد بلا خدمات Google Play تستلمه خلال 15 دقيقة.)', 'success', 'تم الإرسال بنجاح! 📢');

        if (titleEl) titleEl.value = '';
        if (msgEl) msgEl.value = '';
        if (urlEl) urlEl.value = '';
        updateBroadcastPreview();
        loadBroadcastHistory();

    } catch (err) {
        console.error('Failed to send broadcast notification:', err);
        showAlert('فشل إرسال الإشعار: ' + (err.message || 'خطأ في الاتصال'), 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار لجميع الأجهزة الآن';
        }
    }
};

window.loadBroadcastHistory = async function () {
    const listContainer = document.getElementById('broadcastHistoryList');
    if (!listContainer) return;

    try {
        const firestore = (window.db) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
        if (!firestore) return;

        const snap = await firestore.collection('broadcast_notifications')
            .orderBy('timestamp', 'desc')
            .limit(8)
            .get();

        if (snap.empty) {
            listContainer.innerHTML = '<div class="empty-state-sm" style="color: #64748b; text-align: center; padding: 10px;">لا توجد إشعارات مرسلة سابقة</div>';
            return;
        }

        function safeEsc(s) {
            return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' }) : 'غير محدد';
            const typeBadge = data.type === 'update' ? '🚀 تحديث' : (data.type === 'promo' ? '🔥 عرض' : (data.type === 'product' ? '✨ منتج' : '📢 عام'));
            const stateBadge = data.pending
                ? `<span class="notif-state pending">⏰ مجدول: ${new Date(data.scheduledFor || data.timestamp).toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' })}</span>`
                : `<span class="notif-state seen" title="عدد من رأى الإشعار (اضغط للتفاصيل)" onclick="openNotificationViewers('${safeEsc(doc.id)}', '${safeEsc(String(data.title || '').replace(/'/g, ''))}')">👁️ ${Number(data.seenCount || 0)} شاهدوه · ${Number(data.clickCount || 0)} ضغطوا</span>`;

            html += `
                <div class="history-notif-item">
                    <div class="history-notif-info">
                        <span class="history-notif-title">${typeBadge} - ${safeEsc(data.title || '')}</span>
                        <span class="history-notif-time">${dateStr} | ${safeEsc(String(data.message || '').substring(0, 50))}${String(data.message || '').length > 50 ? '...' : ''}</span>
                        ${stateBadge}
                    </div>
                    <button type="button" class="btn-delete-notif" onclick="deleteBroadcastNotification('${safeEsc(doc.id)}')" title="حذف هذا الإشعار">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    } catch (err) {
        console.error('Failed to load broadcast history:', err);
        listContainer.innerHTML = '<div class="empty-state-sm" style="color: #ef4444; text-align: center; padding: 10px;">تعذر تحميل السجل</div>';
    }
};

window.deleteBroadcastNotification = async function (docId) {
    if (!docId) return;
    if (await showConfirm('هل أنت متأكد من رغبتك في حذف هذا الإشعار من السجل؟', { title: 'حذف الإشعار' })) {
        try {
            const firestore = (window.db) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
            if (firestore) {
                await firestore.collection('broadcast_notifications').doc(docId).delete();
                showToast('تم حذف الإشعار', 'info');
                loadBroadcastHistory();
                if (typeof window.mzRefreshBellNotifs === 'function') window.mzRefreshBellNotifs();
                var adminBox = document.getElementById('adminInboxList');
                if (adminBox && window.MizoNotifCenter && window.MizoNotifCenter.renderInto) {
                    window.MizoNotifCenter.renderInto(adminBox);
                }
            }
        } catch (e) {
            console.error('Delete notification failed', e);
            showToast('تعذر حذف الإشعار: ' + (e.message || 'خطأ في الاتصال'), 'error');
        }
    }
};

// =========================================================
// USERS & IPTV PLAYER INTELLIGENCE CENTER (مركز ذكاء العملاء والمشغل)
// =========================================================
let usersIntelModalOpen = false;
let usersIntelCustomersCache = [];
let usersIntelIptvLogsCache = [];
let usersIntelActiveTab = 'customers'; // 'customers' | 'player'
let usersIntelCustomersUnsub = null;
let usersIntelLogsUnsub = null;

function safeIntelEsc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/**
 * معامل آمن داخل onclick/onchange. تهريب HTML وحده لا يكفي داخل كود JavaScript في سمة:
 * المتصفح يفكّ &#39; إلى ' قبل تنفيذ الكود، فاسم عميل مثل  x');fetch(...);//  كان
 * يخرج من النص ويُنفَّذ في جلسة المدير — والاسم والهاتف يكتبهما العميل بنفسه عند التسجيل.
 * JSON يعطي نصاً سليماً في JS، ثم التهريب لسياق السمة.
 */
function intelJsArg(v) {
    return safeIntelEsc(JSON.stringify(String(v == null ? '' : v)));
}

window.openUsersIntelModal = function () {
    let overlay = document.getElementById('usersIntelModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'usersIntelModalOverlay';
        overlay.className = 'users-intel-overlay';
        overlay.setAttribute('dir', 'rtl');
        overlay.innerHTML = `
            <div class="users-intel-card">
                <div class="users-intel-header">
                    <div class="users-intel-title-group">
                        <div class="users-intel-icon-box">
                            <i class="fas fa-users-gear"></i>
                        </div>
                        <div>
                            <h3 class="users-intel-title">مركز ذكاء العملاء ومستخدمي المشغل</h3>
                            <p class="users-intel-sub">قاعدة بيانات العملاء المباشرة وسجلات مستخدمي سيرفرات IPTV</p>
                        </div>
                    </div>
                    <button type="button" class="users-intel-close-btn" id="usersIntelCloseBtn" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="users-intel-stats-grid" id="usersIntelStatsGrid">
                    <!-- كروت الإحصائيات الحية ديناميكياً -->
                </div>

                <div class="users-intel-tabs">
                    <button type="button" class="intel-tab-btn active" id="tabBtnCustomers" onclick="switchUsersIntelTab('customers')">
                        <i class="fas fa-user-group"></i> قاعدة بيانات العملاء (<span id="intelCountCustomers">0</span>)
                    </button>
                    <button type="button" class="intel-tab-btn" id="tabBtnPlayer" onclick="switchUsersIntelTab('player')">
                        <i class="fas fa-tv"></i> مستخدمو المشغل وسيرفرات IPTV (<span id="intelCountPlayer">0</span>)
                    </button>
                    <button type="button" class="intel-tab-btn" id="tabBtnNotifs" onclick="openNotificationsReport()">
                        <i class="fas fa-bell"></i> من رأى الإشعارات
                    </button>
                </div>

                <div class="users-intel-toolbar">
                    <div class="intel-search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="intelSearchInput" placeholder="بحث بالاسم، رقم الهاتف، المدينة، أو المعرف...">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <select id="intelRoleFilter" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; padding:9px 14px; font-family:inherit; outline:none; font-size:0.85rem; cursor:pointer;">
                            <option value="all">كل الرتب</option>
                            <option value="customer">عملاء فقط</option>
                            <option value="staff">مناديب فقط</option>
                            <option value="admin">مدراء فقط</option>
                            <option value="blocked">محظورين فقط</option>
                        </select>
                        <button type="button" class="intel-btn-export" id="intelExportBtn">
                            <i class="fas fa-file-excel"></i> تصدير البيانات (CSV)
                        </button>
                    </div>
                </div>

                <div class="users-intel-body" id="usersIntelBody">
                    <div style="text-align:center; padding: 40px 20px; color:#94a3b8;">
                        <i class="fas fa-spinner fa-spin" style="font-size:28px; color:#a855f7; margin-bottom:12px;"></i>
                        <p>جاري جلب البيانات المباشرة من السحابة...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('usersIntelCloseBtn').onclick = closeUsersIntelModal;
        overlay.onclick = function (e) {
            if (e.target === overlay) closeUsersIntelModal();
        };

        document.getElementById('intelSearchInput').addEventListener('input', () => {
            renderUsersIntelContent();
        });

        document.getElementById('intelRoleFilter').addEventListener('change', () => {
            renderUsersIntelContent();
        });

        document.getElementById('intelExportBtn').onclick = exportUsersIntelData;

        // دعم زر Escape للإغلاق
        window.addEventListener('keydown', (e) => {
            if (usersIntelModalOpen && (e.key === 'Escape' || e.keyCode === 27)) {
                closeUsersIntelModal();
            }
        });
    }

    overlay.style.display = 'flex';
    usersIntelModalOpen = true;

    // البدء في جلب البيانات الحية
    subscribeUsersIntelData();
};

window.closeUsersIntelModal = function () {
    const overlay = document.getElementById('usersIntelModalOverlay');
    if (overlay) overlay.style.display = 'none';
    usersIntelModalOpen = false;
    // إيقاف المستمعين عند الإغلاق: كانا يبقيان يعملان بعد إغلاق النافذة، فكل تعديل على أي عميل
    // يعيد قراءة مجموعة العملاء كاملة وسجلات المشغل من فايربيز بلا فائدة (قراءات مدفوعة).
    // تُفتح من جديد عند فتح النافذة (subscribeUsersIntelData).
    try { if (usersIntelCustomersUnsub) usersIntelCustomersUnsub(); } catch (e) { }
    try { if (usersIntelLogsUnsub) usersIntelLogsUnsub(); } catch (e) { }
    usersIntelCustomersUnsub = null;
    usersIntelLogsUnsub = null;
};

/**
 * تقرير الإشعارات: لكل إشعار عدد من رآه ومن ضغط عليه، والضغط عليه يعرض أسماءهم.
 * المصدر: notification_views (يكتبه جهاز العميل لحظة ظهور الإشعار عنده).
 */
/**
 * حذف حساب عميل نهائياً: بياناته وحساب دخوله معاً (دالة deleteCustomer في السيرفر).
 * الحذف من قاعدة البيانات وحده كان يترك حساب الدخول قائماً، فيبقى الرقم محجوزاً ولا
 * يستطيع صاحبه التسجيل من جديد. العملية تُسجَّل في سجل الحركات ولا يمكن التراجع عنها.
 */
window.deleteCustomerAccount = async function (uid, name, phone) {
    if (!uid) return;
    const label = (name || 'هذا العميل') + (phone ? ' (' + phone + ')' : '');
    const confirmed = await showConfirm(
        'سيُحذف حساب ' + label + ' نهائياً: بياناته وحساب دخوله واشتراكاته المحفوظة.\n' +
        'لا يمكن التراجع عن هذه العملية.\n\nهل أنت متأكد؟',
        { title: 'حذف حساب عميل', okText: 'نعم، احذف نهائياً', danger: true }
    );
    if (!confirmed) return;

    try {
        if (typeof functions === 'undefined' || !functions) throw new Error('خدمة الحذف غير متاحة في هذه الصفحة');
        showToast('جاري حذف الحساب...', 'info', 2000);
        const res = await functions.httpsCallable('deleteCustomer')({ uid: uid });
        const data = (res && res.data) || {};
        if (!data.ok) throw new Error('تعذر حذف الحساب');

        // إزالة الصف فوراً بدل انتظار تحديث القائمة
        usersIntelCustomersCache = usersIntelCustomersCache.filter(function (c) { return c.id !== uid; });
        renderUsersIntelContent();
        showToast('تم حذف حساب ' + (data.name || label) + ' نهائياً', 'success', 4000);
    } catch (e) {
        console.error('delete customer failed', e);
        showToast('تعذر الحذف: ' + ((e && e.message) || 'خطأ في الاتصال'), 'error', 6000);
    }
};

window.openNotificationsReport = async function () {
    const box = document.getElementById('usersIntelBody');
    const firestore = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    if (!box || !firestore) return;
    document.querySelectorAll('.intel-tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tabBtnNotifs');
    if (btn) btn.classList.add('active');
    box.innerHTML = '<div class="intel-loading">جاري جلب تقرير الإشعارات...</div>';
    try {
        const snap = await firestore.collection('broadcast_notifications').orderBy('timestamp', 'desc').limit(20).get();
        if (snap.empty) {
            box.innerHTML = '<div class="intel-empty">لا توجد إشعارات مرسلة بعد</div>';
            return;
        }
        let rows = '';
        snap.forEach(doc => {
            const d = doc.data() || {};
            const when = d.timestamp ? new Date(d.timestamp).toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' }) : '-';
            const state = d.pending ? '<span style="color:#fbbf24;">⏰ مجدول</span>' : '<span style="color:#22c55e;">تم الإرسال</span>';
            rows += `<tr>
                <td>${escNotifH(d.title || '')}</td>
                <td>${escNotifH(when)}</td>
                <td>${state}</td>
                <td style="font-weight:800;">${Number(d.seenCount || 0)}</td>
                <td style="font-weight:800;">${Number(d.clickCount || 0)}</td>
                <td><button type="button" class="intel-mini-btn" onclick="openNotificationViewers('${escNotifH(doc.id)}')">عرض الأسماء</button></td>
            </tr>`;
        });
        box.innerHTML = `
            <div class="intel-notifs-report">
                <table class="intel-table">
                    <thead><tr><th>الإشعار</th><th>التاريخ</th><th>الحالة</th><th>شاهدوه</th><th>ضغطوا</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <p class="intel-note">تُحتسب المشاهدة لكل عميل مسجّل دخوله ظهر له الإشعار في الموقع أو البرنامج. زوار الموقع غير المسجّلين لا تُسجَّل أسماؤهم.</p>
                <div id="notifViewersBox"></div>
            </div>`;
    } catch (e) {
        console.error('notifications report failed', e);
        box.innerHTML = '<div class="intel-empty">تعذر جلب التقرير</div>';
    }
};

window.openNotificationViewers = async function (notifId) {
    const firestore = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    if (!firestore || !notifId) return;
    let target = document.getElementById('notifViewersBox');
    if (!target) {
        await window.openNotificationsReport();
        target = document.getElementById('notifViewersBox');
        if (!target) return;
    }
    target.innerHTML = '<div class="intel-loading">جاري جلب الأسماء...</div>';
    try {
        const snap = await firestore.collection('notification_views').where('notificationId', '==', notifId).limit(300).get();
        if (snap.empty) {
            target.innerHTML = '<div class="intel-empty">لم يرَ هذا الإشعار أي عميل مسجّل بعد</div>';
            return;
        }
        const list = [];
        snap.forEach(doc => list.push(doc.data() || {}));
        list.sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
        let rows = '';
        list.forEach(v => {
            rows += `<tr>
                <td>${escNotifH(v.name || 'عميل')}</td>
                <td dir="ltr">${escNotifH(v.phone || '')}</td>
                <td>${escNotifH(v.device || '')}</td>
                <td>${v.seenAt ? escNotifH(new Date(v.seenAt).toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' })) : '-'}</td>
                <td>${v.clicked ? '✅ ضغط عليه' : '—'}</td>
            </tr>`;
        });
        target.innerHTML = `
            <h4 class="intel-sub-title">من رأى هذا الإشعار (${list.length})</h4>
            <table class="intel-table">
                <thead><tr><th>الاسم</th><th>الهاتف</th><th>الجهاز</th><th>وقت الظهور</th><th>الضغط</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (e) {
        console.error('viewers failed', e);
        target.innerHTML = '<div class="intel-empty">تعذر جلب الأسماء</div>';
    }
};

function escNotifH(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

window.switchUsersIntelTab = function (tab) {
    usersIntelActiveTab = tab;
    const btnCust = document.getElementById('tabBtnCustomers');
    const btnPlay = document.getElementById('tabBtnPlayer');
    const filterRole = document.getElementById('intelRoleFilter');
    const searchInput = document.getElementById('intelSearchInput');

    if (tab === 'customers') {
        if (btnCust) btnCust.classList.add('active');
        if (btnPlay) btnPlay.classList.remove('active');
        if (filterRole) filterRole.style.display = 'inline-block';
        if (searchInput) searchInput.placeholder = 'بحث بالاسم، رقم الهاتف، المدينة، أو المعرف...';
    } else {
        if (btnCust) btnCust.classList.remove('active');
        if (btnPlay) btnPlay.classList.add('active');
        if (filterRole) filterRole.style.display = 'none';
        if (searchInput) searchInput.placeholder = 'بحث باسم المستخدم بالسيرفر، اسم السيرفر، الجهاز، أو الـ IP...';
    }
    renderUsersIntelContent();
};

function subscribeUsersIntelData() {
    const firestore = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    if (!firestore) return;

    // 1. الاستماع الحي لبيانات العملاء في مجموعة customers
    if (!usersIntelCustomersUnsub) {
        try {
            usersIntelCustomersUnsub = firestore.collection('customers').onSnapshot((snapshot) => {
                const list = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    list.push({ id: doc.id, ...data });
                });
                usersIntelCustomersCache = list;
                const countEl = document.getElementById('intelCountCustomers');
                if (countEl) countEl.innerText = list.length;
                renderUsersIntelContent();
            }, (err) => {
                console.warn('Customers listener notice:', err);
            });
        } catch (e) {
            console.warn('Error subscribing to customers:', e);
        }
    }

    // 2. جلب سجلات المشغل والسيرفرات من activity_logs
    if (!usersIntelLogsUnsub) {
        try {
            usersIntelLogsUnsub = firestore.collection('activity_logs')
                .where('category', '==', 'iptv')
                .limit(300)
                .onSnapshot((snapshot) => {
                    const list = [];
                    snapshot.forEach((doc) => {
                        list.push({ id: doc.id, ...doc.data() });
                    });
                    list.sort((a, b) => {
                        const tA = (a.createdAt || (a.timestamp && a.timestamp.seconds ? a.timestamp.seconds * 1000 : 0));
                        const tB = (b.createdAt || (b.timestamp && b.timestamp.seconds ? b.timestamp.seconds * 1000 : 0));
                        return tB - tA;
                    });
                    usersIntelIptvLogsCache = list;
                    const countEl = document.getElementById('intelCountPlayer');
                    if (countEl) countEl.innerText = list.length;
                    if (usersIntelActiveTab === 'player') {
                        renderUsersIntelContent();
                    }
                }, (err) => {
                    console.warn('IPTV logs query fallback:', err);
                    // في حال عدم وجود فهرس مركب، نجلب السجلات العامة ونفلترها
                    firestore.collection('activity_logs').limit(250).get().then(snap => {
                        const list = [];
                        snap.forEach(doc => {
                            const d = doc.data();
                            if (d.category === 'iptv' || (d.action && d.action.includes('iptv')) || (d.page && d.page.includes('player'))) {
                                list.push({ id: doc.id, ...d });
                            }
                        });
                        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                        usersIntelIptvLogsCache = list;
                        const countEl = document.getElementById('intelCountPlayer');
                        if (countEl) countEl.innerText = list.length;
                        if (usersIntelActiveTab === 'player') {
                            renderUsersIntelContent();
                        }
                    }).catch(e => console.warn(e));
                });
        } catch (e) {
            console.warn('Error subscribing to activity_logs:', e);
        }
    }
}

function renderUsersIntelContent() {
    const statsGrid = document.getElementById('usersIntelStatsGrid');
    const searchInputEl = document.getElementById('intelSearchInput');
    const query = (searchInputEl && searchInputEl.value ? searchInputEl.value : '').trim().toLowerCase();
    const roleFilterEl = document.getElementById('intelRoleFilter');
    const roleFilter = (roleFilterEl && roleFilterEl.value) ? roleFilterEl.value : 'all';
    // كان هذا السطر ناقصاً: bodyEl مستعمل خمس مرات أدناه بلا تعريف، فكانت الدالة
    // ترمي ReferenceError في سطر الفحص التالي قبل أن ترسم شيئاً. النتيجة أن
    // العدّادات تُحدَّث (تُضبط قبل استدعائها) ويبقى الجدول على دوّارة التحميل أبداً.
    const bodyEl = document.getElementById('usersIntelBody');

    if (!statsGrid || !bodyEl) return;

    if (usersIntelActiveTab === 'customers') {
        // حساب إحصائيات العملاء
        const totalCustomers = usersIntelCustomersCache.length;
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        let countToday = 0;
        let countStaff = 0;
        let countAdmins = 0;
        let countBlocked = 0;

        usersIntelCustomersCache.forEach(c => {
            if (c.role === 'staff') countStaff++;
            else if (c.role === 'admin') countAdmins++;
            else if (c.role === 'blocked') countBlocked++;

            const regTime = c.registeredAt ? (c.registeredAt.seconds ? c.registeredAt.seconds * 1000 : (c.registeredAt.toMillis ? c.registeredAt.toMillis() : new Date(c.registeredAt).getTime())) : 0;
            if (regTime && (now - regTime) < oneDayMs) {
                countToday++;
            }
        });

        statsGrid.innerHTML = `
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-purple"><i class="fas fa-users"></i></div>
                <div class="intel-stat-info">
                    <h5>إجمالي العملاء المسجلين</h5>
                    <div class="intel-stat-value">${totalCustomers}</div>
                </div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-green"><i class="fas fa-user-shield"></i></div>
                <div class="intel-stat-info">
                    <h5>المناديب والمدراء</h5>
                    <div class="intel-stat-value">${countStaff + countAdmins} <span style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">(${countStaff} مندوب / ${countAdmins} مدير)</span></div>
                </div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-blue"><i class="fas fa-user-plus"></i></div>
                <div class="intel-stat-info">
                    <h5>المسجلون الجدد اليوم</h5>
                    <div class="intel-stat-value">${countToday}</div>
                </div>
            </div>
        `;

        // فلترة العملاء
        let filtered = usersIntelCustomersCache.filter(c => {
            if (roleFilter !== 'all') {
                const r = c.role || 'customer';
                if (r !== roleFilter) return false;
            }
            if (query) {
                const fullName = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                const city = String(c.city || '').toLowerCase();
                const id = String(c.id || '').toLowerCase();
                return fullName.includes(query) || phone.includes(query) || city.includes(query) || id.includes(query);
            }
            return true;
        });

        if (filtered.length === 0) {
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
                    <i class="fas fa-search" style="font-size:32px; color:#64748b; margin-bottom:12px;"></i>
                    <p>لا توجد نتائج مطابقة لبحثك في قاعدة بيانات العملاء</p>
                </div>
            `;
            return;
        }

        let tableHtml = `
            <div class="intel-table-responsive">
            <table class="intel-table">
                <thead>
                    <tr>
                        <th style="width:28px; text-align:center;">#</th>
                        <th>اسم العميل</th>
                        <th>الهاتف والتواصل</th>
                        <th>المدينة</th>
                        <th>الرتبة</th>
                        <th>التسجيل</th>
                        <th style="width:34px; text-align:center;">بطاقة</th>
                        <th style="width:34px; text-align:center;">حذف</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach((c, idx) => {
            const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'بدون اسم';
            const phone = c.phone || 'غير مسجل';
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            let waPhone = cleanPhone;
            if (waPhone.startsWith('09')) waPhone = '218' + waPhone.substring(1);
            else if (waPhone.startsWith('9') && waPhone.length === 9) waPhone = '218' + waPhone;
            const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent('السلام عليكم ' + fullName + '، معك إدارة سيرفرات الميزو ALmEz0')}` : '#';

            const role = c.role || 'customer';
            let roleBadgeClass = 'intel-role-customer';
            let roleBadgeText = 'عميل';
            if (role === 'staff') { roleBadgeClass = 'intel-role-staff'; roleBadgeText = 'مندوب'; }
            else if (role === 'admin') { roleBadgeClass = 'intel-role-admin'; roleBadgeText = 'مدير'; }
            else if (role === 'blocked') { roleBadgeClass = 'intel-role-blocked'; roleBadgeText = 'محظور'; }

            let regDateText = 'غير محدد';
            if (c.registeredAt) {
                const d = c.registeredAt.seconds ? new Date(c.registeredAt.seconds * 1000) : (c.registeredAt.toMillis ? new Date(c.registeredAt.toMillis()) : new Date(c.registeredAt));
                if (!isNaN(d.getTime())) {
                    regDateText = d.toLocaleDateString('ar-LY', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
            }

            tableHtml += `
                <tr>
                    <td style="color:#64748b; font-weight:700; text-align:center; padding:6px 4px;">${idx + 1}</td>
                    <td style="padding:6px 6px;">
                        <div style="font-weight:700; color:#fff; white-space:nowrap; font-size:0.8rem; margin:0;">${safeIntelEsc(fullName)}</div>
                        <div style="font-size:0.65rem; color:#64748b; font-family:monospace; margin:0; line-height:1;">${safeIntelEsc(c.id.substring(0, 10))}...</div>
                    </td>
                    <td style="padding:6px 6px;">
                        <div style="display:inline-flex; align-items:center; gap:4px; flex-wrap:nowrap;">
                            <span style="font-weight:700; color:#cbd5e1; direction:ltr; text-align:right; font-size:0.75rem;">${safeIntelEsc(phone)}</span>
                            <button type="button" class="intel-btn-copy" onclick="copyIntelText(${intelJsArg(phone)}, this)" title="نسخ الرقم">
                                <i class="fas fa-copy"></i>
                            </button>
                            ${waPhone ? `
                                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="intel-btn-wa" title="محادثة واتساب">
                                    <i class="fab fa-whatsapp"></i> واتساب
                                </a>
                            ` : ''}
                        </div>
                    </td>
                    <td style="padding:6px 6px;"><span style="color:#94a3b8; font-size:0.74rem; white-space:nowrap;">${safeIntelEsc(c.city || 'ليبيا')}</span></td>
                    <td style="padding:6px 6px;">
                        <select onchange="changeIntelCustomerRole(${intelJsArg(c.id)}, ${intelJsArg(fullName)}, this.value)" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color:#fff; border-radius:6px; padding:3px 5px; font-family:inherit; font-size:0.72rem; outline:none; cursor:pointer;">
                            <option value="customer" ${role === 'customer' ? 'selected' : ''}>عميل</option>
                            <option value="staff" ${role === 'staff' ? 'selected' : ''}>مندوب</option>
                            <option value="admin" ${role === 'admin' ? 'selected' : ''}>مدير</option>
                            <option value="blocked" ${role === 'blocked' ? 'selected' : ''}>محظور</option>
                        </select>
                    </td>
                    <td style="padding:6px 6px;"><span style="color:#94a3b8; font-size:0.72rem; white-space:nowrap;">${regDateText}</span></td>
                    <td style="padding:6px 4px; text-align:center;">
                        <button type="button" class="intel-btn-copy" onclick="openCustomerDetailNotes(${intelJsArg(c.id)}, ${intelJsArg(fullName)}, ${intelJsArg(phone)})" title="عرض البطاقة">
                            <i class="fas fa-id-card"></i>
                        </button>
                    </td>
                    <td style="padding:6px 4px; text-align:center;">
                        <button type="button" class="intel-btn-delete" onclick="deleteCustomerAccount(${intelJsArg(c.id)}, ${intelJsArg(fullName)}, ${intelJsArg(phone)})" title="حذف الحساب نهائياً">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
            </div>
        `;
        bodyEl.innerHTML = tableHtml;

    } else {
        // تبويب المشغل وسيرفرات IPTV
        const totalLogs = usersIntelIptvLogsCache.length;
        const uniqueUsernames = new Set();
        const uniqueServers = new Set();

        usersIntelIptvLogsCache.forEach(log => {
            if (log.details && log.details.username) uniqueUsernames.add(log.details.username.toLowerCase());
            if (log.details && log.details.server) uniqueServers.add(log.details.server);
        });

        statsGrid.innerHTML = `
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-purple"><i class="fas fa-play-circle"></i></div>
                <div class="intel-stat-info">
                    <h5>إجمالي جلسات المشغل</h5>
                    <div class="intel-stat-value">${totalLogs}</div>
                </div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-green"><i class="fas fa-id-badge"></i></div>
                <div class="intel-stat-info">
                    <h5>اشتراكات IPTV فريدة مسجلة</h5>
                    <div class="intel-stat-value">${uniqueUsernames.size}</div>
                </div>
            </div>
            <div class="intel-stat-card">
                <div class="intel-stat-icon intel-stat-blue"><i class="fas fa-server"></i></div>
                <div class="intel-stat-info">
                    <h5>سيرفرات متصلة حالياً</h5>
                    <div class="intel-stat-value">${uniqueServers.size}</div>
                </div>
            </div>
        `;

        // فلترة سجلات المشغل
        let filtered = usersIntelIptvLogsCache.filter(log => {
            if (query) {
                const u = (log.details && log.details.username || '').toLowerCase();
                const s = (log.details && log.details.server || '').toLowerCase();
                const title = (log.title || '').toLowerCase();
                const ip = (log.publicIp || '').toLowerCase();
                const dev = (log.device && (log.device.os + ' ' + (log.device.model || '')) || '').toLowerCase();
                return u.includes(query) || s.includes(query) || title.includes(query) || ip.includes(query) || dev.includes(query);
            }
            return true;
        });

        if (filtered.length === 0) {
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
                    <i class="fas fa-tv" style="font-size:32px; color:#64748b; margin-bottom:12px;"></i>
                    <p>لا توجد سجلات مسجلة للمشغل مطابقة للبحث</p>
                </div>
            `;
            return;
        }

        let tableHtml = `
            <div class="intel-table-responsive">
            <table class="intel-table">
                <thead>
                    <tr>
                        <th style="width:28px; text-align:center;">#</th>
                        <th>التوقيت</th>
                        <th>اسم المستخدم بالسيرفر</th>
                        <th>اسم السيرفر</th>
                        <th>الحالة / الإجراء</th>
                        <th>انتهاء الاشتراك</th>
                        <th>الجهاز والمنصة</th>
                        <th>عنوان IP</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach((log, idx) => {
            let timeText = 'غير محدد';
            if (log.timestamp && log.timestamp.seconds) {
                timeText = new Date(log.timestamp.seconds * 1000).toLocaleDateString('ar-LY', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } else if (log.createdAt) {
                timeText = new Date(log.createdAt).toLocaleDateString('ar-LY', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } else if (log.clientTime) {
                timeText = new Date(log.clientTime).toLocaleDateString('ar-LY', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            const username = (log.details && log.details.username) || (log.user && log.user.name) || 'غير محدد';
            const server = (log.details && log.details.server) || 'سيرفر IPTV';
            const expDate = (log.details && log.details.expDate) || 'غير متوفر';
            const device = (log.device && (log.device.os + ' (' + (log.device.model || log.device.appPlatform || '') + ')')) || 'متصفح / غير معروف';
            const ip = log.publicIp || 'غير معروف';

            let statusBadge = '<span class="intel-role-badge intel-role-customer"><i class="fas fa-circle-info"></i> نشاط</span>';
            if (log.action === 'iptv_login_success') {
                statusBadge = '<span class="intel-role-badge" style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3);"><i class="fas fa-check-circle"></i> دخول ناجح</span>';
            } else if (log.action === 'iptv_login_failed') {
                statusBadge = '<span class="intel-role-badge intel-role-blocked"><i class="fas fa-times-circle"></i> خطأ دخول</span>';
            } else if (log.action === 'iptv_player_session') {
                statusBadge = '<span class="intel-role-badge intel-role-admin"><i class="fas fa-broadcast-tower"></i> جلسة نشطة</span>';
            }

            tableHtml += `
                <tr>
                    <td style="color:#64748b; font-weight:700; text-align:center; padding:6px 4px;">${idx + 1}</td>
                    <td style="padding:6px 6px;"><span style="color:#94a3b8; font-size:0.72rem; white-space:nowrap;">${timeText}</span></td>
                    <td style="padding:6px 6px;">
                        <div style="display:inline-flex; align-items:center; gap:4px; flex-wrap:nowrap;">
                            <span style="font-weight:700; color:#fff; font-family:monospace; font-size:0.78rem;">${safeIntelEsc(username)}</span>
                            <button type="button" class="intel-btn-copy" onclick="copyIntelText(${intelJsArg(username)}, this)" title="نسخ اسم المستخدم">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </td>
                    <td style="padding:6px 6px;"><span style="font-weight:700; color:#c084fc; font-size:0.76rem; white-space:nowrap;">${safeIntelEsc(server)}</span></td>
                    <td style="padding:6px 6px;">${statusBadge}</td>
                    <td style="padding:6px 6px;"><span style="color:#fbbf24; font-size:0.72rem; font-weight:600; white-space:nowrap;">${safeIntelEsc(expDate)}</span></td>
                    <td style="padding:6px 6px;"><span style="color:#cbd5e1; font-size:0.72rem; white-space:nowrap;">${safeIntelEsc(device)}</span></td>
                    <td style="padding:6px 6px;"><span style="color:#64748b; font-family:monospace; font-size:0.7rem; white-space:nowrap;">${safeIntelEsc(ip)}</span></td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
            </div>
        `;
        bodyEl.innerHTML = tableHtml;
    }
}

window.copyIntelText = function (text, btn) {
    if (!text) return;
    try {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check" style="color:#4ade80;"></i>';
                setTimeout(() => { btn.innerHTML = orig; }, 1500);
            }
        });
    } catch (e) {
        // مسار احتياطي
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check" style="color:#4ade80;"></i>';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
    }
};

window.changeIntelCustomerRole = async function (customerId, customerName, newRole) {
    const roleNames = { customer: 'عميل عادي', staff: 'مندوب مبيعات', blocked: 'محظور', admin: 'مدير نظام' };
    const firestore = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
    if (!firestore) return;

    if (typeof Swal !== 'undefined') {
        const res = await Swal.fire({
            title: 'تغيير رتبة المستخدم',
            html: `هل أنت متأكد من تغيير رتبة <strong>${customerName}</strong> إلى <strong>${roleNames[newRole] || newRole}</strong>؟`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'نعم، حفظ التغيير',
            cancelButtonText: 'إلغاء',
            background: '#0d121d',
            color: '#fff',
            customClass: { popup: 'almezo-swal-popup', confirmButton: 'almezo-swal-btn' }
        });
        if (!res.isConfirmed) {
            renderUsersIntelContent();
            return;
        }
    }

    try {
        await firestore.collection('customers').doc(customerId).update({ role: newRole });
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'customer_role_updated',
                category: 'admin',
                severity: 'warning',
                title: `تعديل رتبة العميل: ${customerName}`,
                details: { customerId, newRole }
            });
        }
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'تم التحديث بنجاح',
                text: `تم تعيين رتبة ${customerName} بنجاح إلى: ${roleNames[newRole] || newRole}`,
                icon: 'success',
                timer: 1800,
                showConfirmButton: false,
                background: '#0d121d',
                color: '#fff',
                customClass: { popup: 'almezo-swal-popup' }
            });
        }
    } catch (err) {
        console.error('Error updating role:', err);
        showAlert('تعذر تحديث الرتبة: ' + err.message, 'error');
        renderUsersIntelContent();
    }
};

window.openCustomerDetailNotes = function (customerId, name, phone) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: `بطاقة العميل: ${name}`,
            html: `
                <div style="text-align:right; font-size:0.9rem; line-height:1.7; padding:10px;">
                    <p><strong>المعرف (UID):</strong> <code>${customerId}</code></p>
                    <p><strong>رقم الهاتف:</strong> ${phone}</p>
                    <p><strong>حالة الحساب:</strong> نشط ومسجل في السحابة</p>
                </div>
            `,
            confirmButtonText: 'إغلاق',
            background: '#0d121d',
            color: '#fff',
            customClass: { popup: 'almezo-swal-popup', confirmButton: 'almezo-swal-btn' }
        });
    }
};

function exportUsersIntelData() {
    let csvContent = '\uFEFF'; // UTF-8 BOM لضمان فتح اللغة العربية بسلاسة في Excel
    if (usersIntelActiveTab === 'customers') {
        csvContent += 'الرقم,الاسم الكامل,رقم الهاتف,المدينة,الرتبة,تاريخ التسجيل,معرف الحساب\n';
        usersIntelCustomersCache.forEach((c, idx) => {
            const name = `"${((c.firstName || '') + ' ' + (c.lastName || '')).trim()}"`;
            const phone = `"${c.phone || ''}"`;
            const city = `"${c.city || ''}"`;
            const role = `"${c.role || 'customer'}"`;
            let date = 'غير محدد';
            if (c.registeredAt) {
                const d = c.registeredAt.seconds ? new Date(c.registeredAt.seconds * 1000) : (c.registeredAt.toMillis ? new Date(c.registeredAt.toMillis()) : new Date(c.registeredAt));
                if (!isNaN(d.getTime())) date = d.toLocaleString('ar-LY');
            }
            csvContent += `${idx + 1},${name},${phone},${city},${role},"${date}","${c.id}"\n`;
        });
        downloadIntelCsv(csvContent, `almezo_customers_${Date.now()}.csv`);
    } else {
        csvContent += 'التوقيت,اسم المستخدم بالسيرفر,اسم السيرفر,الحالة,انتهاء الصلاحية,الجهاز والمنصة,عنوان IP\n';
        usersIntelIptvLogsCache.forEach((log, idx) => {
            let time = '';
            if (log.timestamp && log.timestamp.seconds) time = new Date(log.timestamp.seconds * 1000).toLocaleString('ar-LY');
            else if (log.createdAt) time = new Date(log.createdAt).toLocaleString('ar-LY');
            const u = `"${(log.details && log.details.username) || ''}"`;
            const s = `"${(log.details && log.details.server) || ''}"`;
            const status = `"${log.title || log.action || ''}"`;
            const exp = `"${(log.details && log.details.expDate) || ''}"`;
            const dev = `"${(log.device && (log.device.os + ' ' + (log.device.model || ''))) || ''}"`;
            const ip = `"${log.publicIp || ''}"`;
            csvContent += `"${time}",${u},${s},${status},${exp},${dev},${ip}\n`;
        });
        downloadIntelCsv(csvContent, `almezo_iptv_sessions_${Date.now()}.csv`);
    }
}

function downloadIntelCsv(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// نظام استقبال وبث الإشعارات لجميع زوار وعملاء الموقع والتطبيقات
// =========================================================
window.showGlobalBroadcastBanner = function (notif) {
    if (!notif || !notif.title) return;

    // الإشعارات محجوبة تماماً عن الزوار غير المسجلين دخولهم
    try {
        if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) return;
        if (window.firebase && firebase.auth && !firebase.auth().currentUser) return;
    } catch (e) { }

    function safeEsc(s) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
        return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // تشغيل نغمة تنبيه صوتية لطيفة
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        }
    } catch (e) { }

    if (navigator.vibrate) {
        try { navigator.vibrate([120, 60, 120]); } catch (e) { }
    }

    // إرسال إشعار لشريط إشعارات أندرويد (العتاد الأصلي)
    try {
        if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.showNotification === 'function') {
            window.AndroidNativeBridge.showNotification(notif.title, notif.message, notif.actionUrl || '');
        }
    } catch (e) { }

    // إرسال إشعار لنظام ويندوز (Action Center)
    try {
        if (window.electronAPI && typeof window.electronAPI.showNotification === 'function') {
            window.electronAPI.showNotification(notif.title, notif.message);
        }
    } catch (e) { }

    // إشعار المتصفح
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
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
        }
    } catch (e) { }

    // عرض البانر الفخم داخل واجهة الموقع
    const existing = document.getElementById('almezo-broadcast-banner');
    if (existing) existing.remove();

    const typeBadges = {
        'update': { label: '🚀 تحديث جديد', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
        'promo': { label: '🔥 عرض خاص', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
        'product': { label: '✨ منتج جديد', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.4)' },
        'general': { label: '📢 إشعار عام', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' }
    };
    const config = typeBadges[notif.type] || typeBadges['general'];

    const banner = document.createElement('div');
    banner.id = 'almezo-broadcast-banner';
    banner.className = 'almezo-push-banner';
    banner.setAttribute('dir', 'rtl');

    banner.innerHTML = `
        <div class="push-banner-inner" style="border-top: 3px solid ${config.color}; box-shadow: 0 16px 36px rgba(0,0,0,0.7), 0 0 24px ${config.glow};">
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
            ${notif.image ? `<div class="push-banner-image"><img src="${safeEsc(notif.image)}" alt=""></div>` : ''}
            <div class="push-banner-content">
                <h4 class="push-notif-title">${safeEsc(notif.title)}</h4>
                <p class="push-notif-body">${safeEsc(notif.message)}</p>
            </div>
            ${notif.actionUrl ? `
            <div class="push-banner-actions">
                <a href="${safeEsc(notif.actionUrl)}" class="push-action-btn" id="btnPushAction" onclick="if(window.mzMarkBroadcastClicked)window.mzMarkBroadcastClicked('${safeEsc(notif.id || '')}')">
                    <i class="fas fa-external-link-alt"></i> فتح الرابط / التفاصيل
                </a>
            </div>
            ` : ''}
        </div>
    `;

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
                font-family: 'Cairo', 'Tajawal', sans-serif;
            }
            .almezo-push-banner.visible {
                transform: translateX(-50%) translateY(0);
            }
            .push-banner-image {
                margin: 0 0 10px;
                border-radius: 12px;
                overflow: hidden;
            }
            .push-banner-image img {
                display: block;
                width: 100%;
                max-height: 190px;
                object-fit: cover;
            }
            .push-banner-inner {
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(9, 13, 20, 0.98));
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1.5px solid rgba(255, 255, 255, 0.14);
                border-radius: 16px;
                padding: 14px 18px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                box-sizing: border-box;
                text-align: right;
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
                font-size: 22px;
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
                line-height: 1.35;
            }
            .push-notif-body {
                color: #cbd5e1;
                font-size: 13px;
                margin: 0;
                line-height: 1.5;
            }
            .push-banner-actions {
                margin-top: 4px;
            }
            .push-action-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                color: #fff;
                text-decoration: none;
                border-radius: 10px;
                padding: 7px 16px;
                font-size: 12.5px;
                font-weight: 700;
                border: none;
                box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
                transition: all 0.2s;
            }
            .push-action-btn:hover {
                background: linear-gradient(135deg, #16a34a, #15803d);
                transform: translateY(-1px);
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(banner);
    requestAnimationFrame(() => {
        banner.classList.add('visible');
    });

    // 5 ثوانٍ، زر الإغلاق، والسحب يميناً أو يساراً (firebase-config.js)
    if (typeof window.mzBannerLifecycle === 'function') window.mzBannerLifecycle(banner, 5000);
    else setTimeout(() => { if (banner.parentElement) banner.remove(); }, 5000);
};

window.initBroadcastNotificationListener = function () {
    if (window._almezoBroadcastListenerActive) return;
    window._almezoBroadcastListenerActive = true;

    function getFirestore() {
        try {
            if (window.db) return window.db;
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.firestore === 'function') {
                return firebase.firestore();
            }
        } catch (e) { }
        return null;
    }

    // الطابور والتأجيل أثناء المشاهدة وتسجيل من رآه: في firebase-config.js (مشترك مع المشغل)
    window.mzSubscribeBroadcasts(function (notif) {
        window.showGlobalBroadcastBanner(notif);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.initBroadcastNotificationListener();
    });
} else {
    window.initBroadcastNotificationListener();
}

// Firestore Realtime Listener
if (typeof db !== 'undefined') {
    db.collection('products').orderBy('sortOrder', 'asc').onSnapshot((snapshot) => {


        siteData = { iptv: [], smartApps: [], vip: [] };
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!siteData[data.category]) siteData[data.category] = [];
            siteData[data.category].push({ id: doc.id, ...data });
        });
        isDataLoadedFromFirestore = true;
        renderCurrentPage();
    });
}

// =============================================
// كروت الصفحة الرئيسية (قابلة للتعديل من لوحة المدير)
// يتم تخزينها في وثيقة واحدة: siteConfig/homeCards
// =============================================

// القيم الافتراضية (تُستخدم عند عدم وجود الوثيقة بعد، أو لو حقل معين ناقص)
// imageSize: حجم شعار البطاقة بالبكسل، يتحكم فيه المدير من وضع التعديل لكل بطاقة على حدة
const DEFAULT_CARD_IMAGE_SIZE = 70;
const DEFAULT_HOME_CARDS = {
    iptv: { name: 'اشتراكات IPTV', image: 'photo/iptv-badge.webp', enabled: true, imageSize: 78 },
    smart: { name: 'تطبيقات شاشات السمارت', image: 'photo/smart-badge.webp', enabled: true, imageSize: 78 },
    vip: { name: 'باقات VIP (Mango)', image: 'photo/vip-badge.webp', enabled: true, imageSize: 76 },
    devices: { name: 'الأجهزة الإلكترونية', image: 'photo/devices-badge.webp', enabled: true, imageSize: 96 },
    player: { name: 'مشغل الميزو - ALmEz0', image: '', enabled: true, imageSize: 86 }
};

/** حجم شعار بطاقة بالبكسل ضمن حدود آمنة (40 إلى 160). */
function cardImageSize(card) {
    var n = parseInt(card && card.imageSize, 10);
    if (!n || isNaN(n)) n = DEFAULT_CARD_IMAGE_SIZE;
    return Math.max(40, Math.min(160, n));
}

/** نمط الحجم المطبّق على صورة البطاقة. */
function cardImageStyle(card) {
    var px = cardImageSize(card);
    return 'width:' + px + 'px; height:' + px + 'px;';
}

// الروابط ثابتة دائماً (مش قابلة للتعديل من لوحة الإدارة، فقط الاسم/الصورة/التفعيل)
const HOME_CARD_LINKS = {
    iptv: 'iptv.html',
    smart: 'smart.html',
    vip: 'vip.html',
    devices: 'devices.html',
    player: 'player.html'
};

let homeCardsData = Object.assign({}, DEFAULT_HOME_CARDS); // عرض فوري بالقيم الافتراضية قبل وصول بيانات فايربيز

// ترتيب البطاقات الذي يختاره المدير (حقل _order في siteConfig/homeCards، مقروء للجميع)،
// مع نسخة محلية حتى لا تظهر البطاقات بالترتيب الافتراضي لحظة ثم تتبدّل.
let homeCardsOrder = null;
try { homeCardsOrder = JSON.parse(localStorage.getItem('almezo_home_cards_order') || 'null'); } catch (e) { homeCardsOrder = null; }

function orderedHomeKeys() {
    const all = Object.keys(HOME_CARD_LINKS);
    const saved = Array.isArray(homeCardsOrder) ? homeCardsOrder.filter(function (k, i, arr) {
        return all.indexOf(k) !== -1 && arr.indexOf(k) === i;
    }) : [];
    return saved.concat(all.filter(function (k) { return saved.indexOf(k) === -1; }));
}

/** تقديم (-1) أو تأخير (+1) بطاقة في الصفحة الرئيسية، ويُحفظ للجميع فوراً. */
window.moveHomeCard = async function (key, dir) {
    const order = orderedHomeKeys();
    const i = order.indexOf(key), j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return;
    const previous = order.slice();
    order[i] = order[j];
    order[j] = key;
    homeCardsOrder = order;
    try { localStorage.setItem('almezo_home_cards_order', JSON.stringify(order)); } catch (e) { }
    lastHomeCardsHtml = '';
    renderHomeCards();
    try {
        await db.collection('siteConfig').doc('homeCards').set({ _order: order }, { merge: true });
    } catch (e) {
        console.error('تعذر حفظ ترتيب البطاقات:', e);
        homeCardsOrder = previous;
        try { localStorage.setItem('almezo_home_cards_order', JSON.stringify(previous)); } catch (err) { }
        lastHomeCardsHtml = '';
        renderHomeCards();
        if (typeof showToast === 'function') showToast('تعذر حفظ ترتيب البطاقات - تأكد أنك مسجل دخول كمدير', 'error');
    }
};

if (typeof db !== 'undefined') {
    db.collection('siteConfig').doc('homeCards').onSnapshot((doc) => {
        const saved = doc.exists ? (doc.data() || {}) : {};
        const merged = {};
        Object.keys(DEFAULT_HOME_CARDS).forEach((key) => {
            merged[key] = Object.assign({}, DEFAULT_HOME_CARDS[key], saved[key] || {});
        });
        homeCardsData = merged;
        if (Array.isArray(saved._order)) {
            homeCardsOrder = saved._order;
            try { localStorage.setItem('almezo_home_cards_order', JSON.stringify(saved._order)); } catch (e) { }
        }
        renderHomeCards();
    }, (err) => {
        console.warn('تعذر تحميل إعدادات كروت الصفحة الرئيسية، سيتم استخدام الإعدادات الافتراضية:', err);
    });
}

// آخر شكل مرسوم للبطاقات. الدالة تُستدعى أربع مرات عند فتح الصفحة (رسم فوري + مستمعا
// فايربيز + renderCurrentPage)، وكل استدعاء كان يستبدل محتوى الحاوية فتُعاد حركة الدخول
// ويبدو للمستخدم أن الصفحة تحدّثت من جديد بعد أجزاء من الثانية.
var lastHomeCardsHtml = '';

/**
 * عرض كروت الصفحة الرئيسية (وضع عادي / وضع تعديل المدير)
 */
function renderHomeCards() {
    var container = document.getElementById('homeCategoriesGrid');
    if (!container) return;

    var data = homeCardsData || DEFAULT_HOME_CARDS;
    var html = '';

    var orderedKeys = orderedHomeKeys();
    orderedKeys.forEach(function (key, orderIndex) {
        var card = Object.assign({}, DEFAULT_HOME_CARDS[key], data[key] || {});
        var link = HOME_CARD_LINKS[key];
        var isPlayer = (key === 'player');
        var isEnabled = (card.enabled !== false);

        if (isEditMode) {
            // === وضع تعديل المدير: اسم + صورة + مفتاح تفعيل/إيقاف ===
            html += '\
            <div class="main-category-card ' + key + ' home-card-edit-wrapper" data-edit-id="home:' + key + '" data-edit-kind="home" style="cursor:default; display:flex; flex-direction:column; gap:8px; padding:15px;">\
                <div class="home-card-order-row">\
                    <button type="button" onclick="moveHomeCard(\'' + key + '\', -1)" title="تقديم البطاقة"' + (orderIndex === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-right"></i> تقديم</button>\
                    <span class="home-card-order-pos">' + (orderIndex + 1) + ' / ' + orderedKeys.length + '</span>\
                    <button type="button" onclick="moveHomeCard(\'' + key + '\', 1)" title="تأخير البطاقة"' + (orderIndex === orderedKeys.length - 1 ? ' disabled' : '') + '>تأخير <i class="fas fa-arrow-left"></i></button>\
                </div>\
                <input type="text" id="edit-home-name-' + key + '" value="' + escEdit(card.name || '') + '" class="edit-input" placeholder="اسم القسم">\
                <input type="text" id="edit-home-image-' + key + '" value="' + escEdit(card.image || '') + '" class="edit-input" placeholder="رابط الصورة (اختياري للمشغل)">\
                <div class="logo-size-row">\
                    <div class="logo-size-preview"><img id="edit-home-preview-' + key + '" src="' + escEdit(card.image || 'photo/mizo-cube.webp') + '" alt="" style="' + cardImageStyle(card) + '"></div>\
                    <div class="logo-size-controls">\
                        <label for="edit-home-size-' + key + '">حجم الشعار: <b id="edit-home-size-val-' + key + '">' + cardImageSize(card) + '</b> بكسل</label>\
                        <input type="range" id="edit-home-size-' + key + '" min="40" max="160" step="2" value="' + cardImageSize(card) + '" oninput="previewHomeCardSize(\'' + key + '\')">\
                        <button type="button" class="logo-size-reset" onclick="resetHomeCardSize(\'' + key + '\')">إرجاع الحجم الافتراضي</button>\
                    </div>\
                </div>\
                <label style="display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-size:13px; cursor:pointer;">\
                    <input type="checkbox" id="edit-home-enabled-' + key + '" ' + (isEnabled ? 'checked' : '') + ' onchange="toggleHomeReasonBox(\'' + key + '\')"> القسم مفعّل وظاهر للزوار\
                </label>\
                <div id="edit-home-reason-wrapper-' + key + '" style="display:' + (isEnabled ? 'none' : 'block') + ';">\
                    <input type="text" id="edit-home-reason-' + key + '" value="' + escEdit(card.reason || '') + '" class="edit-input" placeholder="سبب الإيقاف (مثال: قريباً)">\
                </div>\
                <button class="admin-action-btn admin-save-btn" onclick="saveHomeCard(\'' + key + '\')"><i class="fas fa-save"></i> حفظ تعديلات القسم</button>\
            </div>';
        } else if (!isEnabled) {
            // === القسم متوقف: يبان بس معطل مع رسالة "غير متوفر حالياً"، مع الحفاظ على نفس كلاس التصميم/التوسيط الأصلي ===
            var disabledMedia = card.image
                ? '<img src="' + card.image + '" alt="' + card.name + '" class="category-card-img" style="' + cardImageStyle(card) + ' filter:grayscale(1); opacity:0.5;">'
                : (isPlayer ? '<div class="web-player-icon-wrapper mizo-cube-wrap" style="' + cardImageStyle(card) + ' opacity:0.5;"><img src="photo/mizo-cube.webp" alt="مشغل الميزو" class="mizo-cube-img"></div>' : '');
            var disabledClassKey = isPlayer ? 'web-player' : key; // يحافظ على كلاس web-player عشان قاعدة التوسيط في style.css تفضل شغالة
            html += '\
            <div class="main-category-card ' + disabledClassKey + ' disabled-card" title="هذا القسم متوقف حالياً" style="cursor:not-allowed; pointer-events:none; opacity:0.75;">\
                ' + disabledMedia + '\
                <h3 style="opacity:0.6;">' + card.name + '</h3>\
                <span class="coming-soon" style="display:block; margin-top:8px;">' + (card.reason ? card.reason : 'غير متوفر حالياً') + '</span>\
            </div>';
        } else if (isPlayer) {
            // === كارت مشغل الميزو: يحتفظ بمنطق التحقق من تسجيل الدخول الخاص به ===
            var playerMedia = card.image
                ? '<img src="' + card.image + '" alt="' + card.name + '" class="category-card-img" style="' + cardImageStyle(card) + '">'
                : '<div class="web-player-icon-wrapper mizo-cube-wrap" style="' + cardImageStyle(card) + '"><img src="photo/mizo-cube.webp" alt="مشغل الميزو" class="mizo-cube-img"></div>';
            html += '\
            <a href="' + link + '" class="main-category-card web-player" id="mainWebPlayerCard" onclick="return handlePlayerCardClick(event)">\
                ' + playerMedia + '\
                <h3 dir="rtl">' + card.name + '</h3>\
            </a>';
        } else {
            // === الوضع العادي لباقي الكروت ===
            html += '\
            <a href="' + link + '" class="main-category-card ' + key + '">\
                <img src="' + card.image + '" alt="' + card.name + '" class="category-card-img" style="' + cardImageStyle(card) + '" onerror="this.src=\'https://via.placeholder.com/300x180/141820/4caf50?text=AlMeZ0\'">\
                <h3>' + card.name + '</h3>\
            </a>';
        }
    });

    if (html === lastHomeCardsHtml) return; // لا تغيير فعلي: نترك البطاقات كما هي
    var isRepeatRender = lastHomeCardsHtml !== '';
    lastHomeCardsHtml = html;
    renderKeepingEdits(container, html);
    if (isRepeatRender) container.classList.add('cards-no-entrance');
}

// تشغيل فوري لكروت الصفحة الرئيسية لضمان ظهورها حتى لو تأخر فايربيز أو في بيئات TV Box الضعيفة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHomeCards);
} else {
    renderHomeCards();
}


/**
 * حفظ تعديلات كارت الصفحة الرئيسية (الاسم/الصورة/التفعيل) في Firestore
 * متاحة فقط للمدير (uid == ADMIN_UID) حسب قواعد الأمان في firestore.rules
 */
window.toggleHomeReasonBox = function (key) {
    var checkbox = document.getElementById('edit-home-enabled-' + key);
    var wrapper = document.getElementById('edit-home-reason-wrapper-' + key);
    if (checkbox && wrapper) {
        wrapper.style.display = checkbox.checked ? 'none' : 'block';
    }
};

/** معاينة حية لحجم الشعار أثناء تحريك المنزلق في وضع التعديل. */
window.previewHomeCardSize = function (key) {
    var slider = document.getElementById('edit-home-size-' + key);
    var img = document.getElementById('edit-home-preview-' + key);
    var val = document.getElementById('edit-home-size-val-' + key);
    if (!slider) return;
    var px = Math.max(40, Math.min(160, parseInt(slider.value, 10) || DEFAULT_CARD_IMAGE_SIZE));
    if (img) { img.style.width = px + 'px'; img.style.height = px + 'px'; }
    if (val) val.textContent = px;
    if (typeof markEditDirty === 'function') markEditDirty('home:' + key);
};

window.resetHomeCardSize = function (key) {
    var slider = document.getElementById('edit-home-size-' + key);
    if (!slider) return;
    slider.value = (DEFAULT_HOME_CARDS[key] && DEFAULT_HOME_CARDS[key].imageSize) || DEFAULT_CARD_IMAGE_SIZE;
    previewHomeCardSize(key);
};

window.saveHomeCard = async function (key, opts) {
    opts = opts || {};
    var nameInput = document.getElementById('edit-home-name-' + key);
    var imageInput = document.getElementById('edit-home-image-' + key);
    var enabledInput = document.getElementById('edit-home-enabled-' + key);
    var reasonInput = document.getElementById('edit-home-reason-' + key);
    var sizeInput = document.getElementById('edit-home-size-' + key);

    var name = nameInput ? nameInput.value.trim() : '';
    var image = imageInput ? imageInput.value.trim() : '';
    var enabled = enabledInput ? enabledInput.checked : true;
    var reason = reasonInput ? reasonInput.value.trim() : '';
    var imageSize = sizeInput ? Math.max(40, Math.min(160, parseInt(sizeInput.value, 10) || DEFAULT_CARD_IMAGE_SIZE))
        : cardImageSize(homeCardsData[key] || DEFAULT_HOME_CARDS[key] || {});

    if (!name) {
        showToast('الرجاء إدخال اسم القسم', 'error');
        return false;
    }

    try {
        await db.collection('siteConfig').doc('homeCards').set({
            [key]: { name: name, image: image, enabled: enabled, reason: reason, imageSize: imageSize }
        }, { merge: true });

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_edit_home_card',
                category: 'admin',
                severity: 'warning',
                title: 'تعديل كارت الصفحة الرئيسية: ' + name,
                details: { cardKey: key, name: name, image: image, enabled: enabled, reason: reason, imageSize: imageSize }
            });
        }

        clearEditDirty('home:' + key);
        if (!opts.silent) showToast('تم حفظ تعديلات القسم بنجاح', 'success');
        return true;
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ - تأكد أنك مسجل دخول كمدير', 'error');
        return false;
    }
};

// Temporary migration script
window.migrateDataToFirestore = async function () {
    const batch = db.batch();
    let count = 0;

    if (isDataLoadedFromFirestore) {
        console.warn("البيانات قادمة من فايربيز، يرجى الترحيل من data.js الأصلية فقط");
        showToast("تنبيه: يجب تعطيل onSnapshot مؤقتاً للترحيل أو الترحيل عند أول تحميل", "error");
        return;
    }

    for (const [category, items] of Object.entries(siteData)) {
        for (const item of items) {
            const docRef = db.collection('products').doc(item.id);
            const { id, ...rest } = item;
            batch.set(docRef, { ...rest, category: category });
            count++;
        }
    }

    await batch.commit();
    showToast("تم ترحيل البيانات بنجاح", "success");
};

// Admin Crud Functions
window.saveProduct = async function (id, opts) {
    opts = opts || {};
    const name = document.getElementById(`edit-name-${id}`).value.trim();
    const logo = document.getElementById(`edit-logo-${id}`).value.trim();
    if (!name) {
        showToast('اسم المنتج لا يكون فارغاً', 'error');
        return false;
    }

    // المبيعات محفوظة باسم المنتج، فتغيير الاسم يقسم المنتج في تقارير المبيعات إلى سطرين
    const current = findProductById(id);
    if (current && current.name && current.name !== name) {
        const ok = await showConfirm('ستغيّر اسم "' + current.name + '" إلى "' + name + '".\n\n'
            + 'المبيعات السابقة مسجلة بالاسم القديم، فسيظهر المنتج في تقارير المبيعات بسطرين: القديم والجديد.',
            { title: 'تغيير اسم منتج' });
        if (!ok) return false;
    }

    try {
        await db.collection('products').doc(id).update({
            name: name,
            logo: logo
        });
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_edit_product',
                category: 'admin',
                severity: 'warning',
                title: 'تعديل بيانات منتج: ' + name,
                details: { productId: id, name: name, oldName: current ? current.name : '' }
            });
        }
        clearEditDirty(id);
        if (!opts.silent) showToast('تم حفظ التعديلات بنجاح', 'success');
        return true;
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
        return false;
    }
};

function findProductById(id) {
    for (const key of Object.keys(siteData)) {
        const found = (siteData[key] || []).find(p => p.id === id);
        if (found) return found;
    }
    return null;
}

window.deleteProduct = async function (id) {
    const current = findProductById(id);
    const label = current && current.name ? '"' + current.name + '"' : 'هذا المنتج';
    const isConfirmed = await showConfirm('هل أنت متأكد من حذف ' + label + '؟\nيمكنك استرجاعه لاحقاً من "منتجات محذوفة" أسفل القائمة.', { title: 'حذف المنتج' });
    if (!isConfirmed) return;
    try {
        const ref = db.collection('products').doc(id);
        const snap = await ref.get();
        const data = snap.exists ? snap.data() : null;
        await ref.delete();
        if (data) {
            writeDeletedProducts([{ id: id, data: data, deletedAt: Date.now() }]
                .concat(readDeletedProducts().filter(d => d.id !== id)));
        }
        clearEditDirty(id);
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_delete_product',
                category: 'admin',
                severity: 'danger',
                title: 'حذف منتج: ' + (data && data.name ? data.name : id),
                // نسخة كاملة من المنتج للرجوع إليها حتى من جهاز آخر
                details: { productId: id, product: data }
            });
        }
        showToast('تم حذف المنتج — يمكن استرجاعه من أسفل القائمة', 'info');
        renderCurrentPage();
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحذف', 'error');
    }
};

/**
 * عدد البطاقات في الصف الواحد كما يظهر فعلاً (كان ثابتاً 2، فعلى الكمبيوتر حيث يظهر 3 أو 4 في
 * الصف كان "أعلى" ينقل المنتج لمكان غير متوقع).
 */
function productGridColumns(categoryKey) {
    const containerId = { iptv: 'iptv-container', smartApps: 'smart-container', vip: 'vip-container' }[categoryKey];
    const container = containerId && document.getElementById(containerId);
    const cards = container ? container.querySelectorAll('[data-edit-id]') : [];
    if (cards.length < 2) return 1;
    const firstTop = cards[0].getBoundingClientRect().top;
    let cols = 0;
    for (const card of cards) {
        if (Math.abs(card.getBoundingClientRect().top - firstTop) < 5) cols++;
        else break;
    }
    return Math.max(1, cols);
}

window.moveProduct = async function (id, direction, categoryKey) {
    const list = siteData[categoryKey];
    if (!list) return;

    const currentIndex = list.findIndex(p => p.id === id);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    // For Arabic RTL grid layout:
    if (direction === 'right') targetIndex = currentIndex - 1;
    else if (direction === 'left') targetIndex = currentIndex + 1;
    else if (direction === 'up') targetIndex = currentIndex - productGridColumns(categoryKey);
    else if (direction === 'down') targetIndex = currentIndex + productGridColumns(categoryKey);

    if (targetIndex >= 0 && targetIndex < list.length) {
        const currentDoc = list[currentIndex];
        const targetDoc = list[targetIndex];

        let currentSort = currentDoc.sortOrder || (currentIndex + 1) * 10;
        let targetSort = targetDoc.sortOrder || (targetIndex + 1) * 10;

        if (currentSort === targetSort) {
            currentSort = (currentIndex + 1) * 10;
            targetSort = (targetIndex + 1) * 10;
        }

        try {
            const batch = db.batch();
            batch.update(db.collection('products').doc(currentDoc.id), { sortOrder: targetSort });
            batch.update(db.collection('products').doc(targetDoc.id), { sortOrder: currentSort });
            await batch.commit();

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'admin_move_product',
                    category: 'admin',
                    severity: 'info',
                    title: 'تغيير ترتيب المنتجات',
                    details: { currentId: currentDoc.id, targetId: targetDoc.id, direction: direction }
                });
            }

            // Data will reload automatically via onSnapshot
            showToast('تم تحديث الترتيب بنجاح', 'success');
        } catch (e) {
            console.error(e);
            showToast('حدث خطأ أثناء تحديث الترتيب', 'error');
        }
    } else {
        showToast('لا يمكن النقل في هذا الاتجاه', 'info');
    }
};

window.addNewProduct = async function (categoryKey) {
    const nameRaw = await showPrompt('أدخل اسم المنتج:', '', 'منتج جديد');
    const name = (nameRaw || '').trim();
    if (!name) return;

    // المعرّف يُولَّد تلقائياً: كان يُكتب يدوياً، ومعرّف مكرر كان يكتب المنتج الجديد فوق
    // منتج موجود ويمسح أسعاره ووصفه بلا تنبيه
    let id = '';
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
        const candidate = categoryKey + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const existing = await db.collection('products').doc(candidate).get();
        if (!existing.exists) id = candidate;
    }
    if (!id) {
        showToast('تعذّر إنشاء معرّف للمنتج، حاول مجدداً', 'error');
        return;
    }

    let maxSort = 0;
    if (siteData[categoryKey] && siteData[categoryKey].length > 0) {
        maxSort = Math.max(...siteData[categoryKey].map(p => p.sortOrder || 0));
    }
    const newSortOrder = maxSort + 10;

    try {
        await db.collection('products').doc(id).set({
            category: categoryKey,
            name: name,
            logo: 'photo/placeholder.png',
            plans: [{ duration: "سنة واحدة", price: "50 د.ل" }],
            sortOrder: newSortOrder
        });

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_add_product',
                category: 'admin',
                severity: 'success',
                title: 'إضافة منتج جديد: ' + name,
                details: { productId: id, name: name, category: categoryKey }
            });
        }

        showToast('تم إضافة المنتج بنجاح', 'success');
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الإضافة', 'error');
    }
};

window.saveProductDetails = async function (id, categoryKey, opts) {
    opts = opts || {};
    let updates = {};

    // تجميع خطط الأسعار
    const plansContainer = document.getElementById(`edit-plans-container-${id}`);
    if (plansContainer) {
        const planRows = plansContainer.querySelectorAll('.edit-plan-row');
        const plans = [];
        planRows.forEach(row => {
            const duration = normalizeDigits(row.querySelector('.plan-duration-input').value).trim();
            const price = normalizePrice(row.querySelector('.plan-price-input').value);
            if (duration || price) {
                plans.push({ duration: duration, price: price });
            }
        });
        if (plans.length > 0) {
            updates.plans = plans;
        } else {
            showToast('يجب إدخال خطة واحدة على الأقل', 'error');
            return false;
        }
    }

    const descEl = document.getElementById(`edit-desc-${id}`);
    if (descEl) {
        // تحويل أسطر Newlines إلى <br> قبل الحفظ في الفايربيز
        updates.description = descEl.value.replace(/\n/g, '<br>');
    }

    const appsAndroidContainer = document.getElementById(`edit-app-android-container-${id}`);
    const appsIosContainer = document.getElementById(`edit-app-ios-container-${id}`);
    const appsWindowsContainer = document.getElementById(`edit-app-windows-container-${id}`);
    const appsSmartContainer = document.getElementById(`edit-app-smart-codes-${id}`);
    const smartLinkEl = document.getElementById(`edit-app-smart-link-${id}`);

    // Fallback for older interface if somehow used
    const oldAndroidEl = document.getElementById(`edit-app-android-${id}`);

    if (appsAndroidContainer || appsIosContainer || appsWindowsContainer || appsSmartContainer || oldAndroidEl) {
        if (appsAndroidContainer) {
            const newApps = {};

            const extractApps = (container) => {
                const apps = [];
                if (!container) return apps;
                const rows = container.querySelectorAll('.edit-app-row');
                rows.forEach(row => {
                    const name = row.querySelector('.app-name-input').value.trim();
                    const link = row.querySelector('.app-link-input').value.trim();
                    if (name || link) apps.push({ name, link });
                });
                return apps;
            };

            newApps.android = extractApps(appsAndroidContainer);
            newApps.ios = extractApps(appsIosContainer);
            newApps.windows = extractApps(appsWindowsContainer);

            const smartCodes = [];
            if (appsSmartContainer) {
                const rows = appsSmartContainer.querySelectorAll('.edit-app-row');
                rows.forEach(row => {
                    const name = row.querySelector('.app-name-input').value.trim();
                    const code = row.querySelector('.app-code-input').value.trim();
                    if (name || code) smartCodes.push({ name, code });
                });
            }

            newApps.smart = {
                link: smartLinkEl ? smartLinkEl.value.trim() : '',
                codes: smartCodes
            };

            updates.apps = newApps;
        } else {
            const androidEl = document.getElementById(`edit-app-android-${id}`);
            const iosEl = document.getElementById(`edit-app-ios-${id}`);
            const downloaderEl = document.getElementById(`edit-app-downloader-${id}`);
            if (androidEl || iosEl || downloaderEl) {
                updates.apps = {
                    android: androidEl ? androidEl.value.trim() : '',
                    ios: iosEl ? iosEl.value.trim() : '',
                    downloader: downloaderEl ? downloaderEl.value.trim() : ''
                };
            }
        }
    }

    try {
        await db.collection('products').doc(id).update(updates);

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'admin_save_product_details',
                category: 'admin',
                severity: 'info',
                title: 'تعديل تفاصيل وأسعار منتج',
                details: { productId: id, category: categoryKey, updates: updates }
            });
        }

        clearEditDirty(id);
        if (!opts.silent) showToast('تم حفظ التحديثات بنجاح', 'success');
        return true;
    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء الحفظ', 'error');
        return false;
    }
};

window.addPlanRow = function (id) {
    const container = document.getElementById(`edit-plans-container-${id}`);
    if (container) {
        markEditDirty(id);
        const row = document.createElement('div');
        row.className = 'edit-plan-row';
        row.innerHTML = `
            <input type="text" class="edit-input plan-duration-input" placeholder="المدة (مثال: 3 أشهر)">
            <input type="text" class="edit-input plan-price-input" placeholder="السعر (مثال: 50 د.ل)">
            <button class="admin-delete-plan-btn" onclick="removeEditRow(this)" title="حذف الخطة"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(row);
    }
};

window.addAppRow = function (id, os) {
    const container = document.getElementById(`edit-app-${os}-container-${id}`);
    if (container) {
        markEditDirty(id);
        const row = document.createElement('div');
        row.className = 'edit-app-row';
        row.innerHTML = `
            <input type="text" class="edit-input app-name-input" placeholder="اسم التطبيق (مثلاً: تطبيق الميزو)">
            <input type="text" class="edit-input app-link-input" placeholder="رابط التحميل">
            <button class="admin-delete-app-btn" onclick="removeEditRow(this)" title="حذف التطبيق"><i class="fas fa-trash"></i></button>
        `;
        const addBtn = container.querySelector('.admin-add-app-btn');
        container.insertBefore(row, addBtn);
    }
};

window.addSmartCodeRow = function (id) {
    const container = document.getElementById(`edit-app-smart-codes-${id}`);
    if (container) {
        markEditDirty(id);
        const row = document.createElement('div');
        row.className = 'edit-app-row';
        row.innerHTML = `
            <input type="text" class="edit-input app-name-input" placeholder="اسم التطبيق">
            <input type="text" class="edit-input app-code-input" placeholder="كود Downloader">
            <button class="admin-delete-app-btn" onclick="removeEditRow(this)" title="حذف الكود"><i class="fas fa-trash"></i></button>
        `;
        const addBtn = container.querySelector('.admin-add-app-btn');
        container.insertBefore(row, addBtn);
    }
};


let currentProduct = '';    // اسم المنتج الحالي في نافذة الشراء
let currentDuration = '';   // المدة/السعر المختار
let pendingPurchase = null; // عملية شراء معلقة (إذا لم يكن المستخدم مسجلاً)
let pendingTrial = null;    // طلب حساب تجريبي معلق (إذا لم يكن المستخدم مسجلاً)

// =============================================
// حقن النوافذ المنبثقة (Modals) ديناميكياً
// يستخدم DOMParser بدلاً من insertAdjacentHTML
// لإنشاء عناصر DOM حقيقية من HTML آمن وثابت
// =============================================

/**
 * إنشاء عناصر DOM من نص HTML ثابت باستخدام DOMParser
 * أكثر أماناً ونظافة من insertAdjacentHTML مع string literals
 */
function injectModals() {
    var parser = new DOMParser();

    // === 1. نافذة إتمام الطلب (Checkout Modal) ===
    var checkoutHTML = [
        '<div id="checkoutModal" class="modal">',
        '  <div class="modal-content">',
        '    <span class="close-btn" id="closeCheckoutBtn" tabindex="0" role="button" aria-label="إغلاق">&times;</span>',
        '    <h2><i class="fas fa-shopping-cart"></i> إتمام الطلب</h2>',
        '    <div class="order-summary">',
        '      <p>📦 المنتج: <strong id="modalProductName"></strong></p>',
        '      <p>⏳ المدة / السعر: <strong id="modalProductDuration"></strong></p>',
        '    </div>',
        '    <div id="loggedInUserInfo" class="order-summary" style="display:none;">',
        '      <p>👤 الاسم: <strong id="checkoutUserName"></strong></p>',
        '      <p>📱 الهاتف: <strong id="checkoutUserPhone"></strong></p>',
        '    </div>',
        '    <div class="input-group">',
        '      <label>💰 اختر طريقة الدفع:</label>',
        '      <div class="custom-select-wrapper" id="paymentMethodWrapper"></div>',
        '      <input type="hidden" id="paymentMethod" value="تحويل رصيد / كروت">',
        '    </div>',
        '    <button class="confirm-btn" id="confirmOrderBtn">',
        '      <i class="fab fa-whatsapp"></i> تأكيد وانتقال للواتساب',
        '    </button>',
        '  </div>',
        '</div>'
    ].join('\n');

    // === 2. نافذة تسجيل الدخول / حساب جديد (Auth Modal) ===
    var authHTML = [
        '<div id="loginModal" class="modal">',
        '  <div class="modal-content">',
        '    <span class="close-btn" id="closeLoginBtn" tabindex="0" role="button" aria-label="إغلاق">&times;</span>',
        '    <div class="auth-tabs">',
        '      <button type="button" class="auth-tab-btn active" id="tabLoginBtn">',
        '        <i class="fas fa-sign-in-alt"></i> تسجيل الدخول',
        '      </button>',
        '      <button type="button" class="auth-tab-btn" id="tabRegisterBtn">',
        '        <i class="fas fa-user-plus"></i> حساب جديد',
        '      </button>',
        '    </div>',
        '    <div id="loginView" class="auth-view">',
        '      <h2><i class="fas fa-user-check"></i> تسجيل الدخول</h2>',
        '      <p class="modal-subtitle">أدخل رقم هاتفك ورقمك السري للدخول إلى حسابك</p>',
        '      <div class="input-group">',
        '        <label for="loginPhone">رقم الهاتف (ليبيانا / المدار):</label>',
        '        <input type="tel" id="loginPhone" placeholder="مثال: 0912345678" maxlength="10" dir="ltr" inputmode="numeric" autocomplete="tel">',
        '        <p id="loginPhoneError" class="error-msg"></p>',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="loginPassword">الرقم السري (PIN / كلمة المرور):</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="loginPassword" placeholder="أدخل كلمة المرور لحسابك" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleLoginPass" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="loginPasswordError" class="error-msg"></p>',
        '      </div>',
        '      <p id="loginGeneralError" class="error-msg"></p>',
        '      <div id="loginLockoutBanner" style="display:none; margin: 12px 0;"></div>',
        '      <button class="confirm-btn" id="confirmLoginBtn">',
        '        <i class="fas fa-sign-in-alt"></i> دخول للحساب',
        '      </button>',
        '      <div class="auth-switch-prompt">',
        '        <span>عميل جديد لأول مرة؟</span>',
        '        <button type="button" class="auth-switch-link" id="switchToRegister">إنشاء حساب جديد</button>',
        '      </div>',
        '    </div>',
        '    <div id="registerView" class="auth-view" style="display:none;">',
        '      <h2><i class="fas fa-user-plus"></i> تسجيل حساب جديد</h2>',
        '      <p class="modal-subtitle">سجّل بياناتك وحدد رقمك السري لمرة واحدة لتتمكن من الشراء بسهولة</p>',
        '      <div class="form-row">',
        '        <div class="input-group">',
        '          <label for="regFirstName">الاسم الأول:</label>',
        '          <input type="text" id="regFirstName" placeholder="مثال: أحمد" maxlength="50" autocomplete="given-name">',
        '          <p id="regFirstNameError" class="error-msg"></p>',
        '        </div>',
        '        <div class="input-group">',
        '          <label for="regLastName">اللقب:</label>',
        '          <input type="text" id="regLastName" placeholder="مثال: محمد" maxlength="50" autocomplete="family-name">',
        '          <p id="regLastNameError" class="error-msg"></p>',
        '        </div>',
        '      </div>',
        '      <div class="form-row">',
        '        <div class="input-group">',
        '          <label for="regAge">العمر:</label>',
        '          <select id="regAge" class="auth-select"><option value="">اختر عمرك</option></select>',
        '          <p id="regAgeError" class="error-msg"></p>',
        '        </div>',
        '        <div class="input-group city-picker">',
        '          <label for="regCityBtn">المدينة:</label>',
        '          <input type="hidden" id="regCity">',
        '          <button type="button" id="regCityBtn" class="auth-select city-picker-btn" aria-haspopup="listbox"><span id="regCityLabel">اختر مدينتك</span><i class="fas fa-chevron-down"></i></button>',
        '          <p id="regCityError" class="error-msg"></p>',
        '        </div>',
        '      </div>',
        '      <div class="city-picker-panel" id="regCityPanel" role="listbox" aria-label="مدن ليبيا">',
        '        <input type="text" id="regCitySearch" class="city-search" placeholder="🔍 ابحث عن مدينتك..." autocomplete="off">',
        '        <div class="city-list" id="regCityList"></div>',
        '      </div>',
        '      <div class="input-group" id="regCityOtherWrap" style="display:none;">',
        '        <label for="regCityOther">اكتب اسم مدينتك:</label>',
        '        <input type="text" id="regCityOther" placeholder="اسم المدينة" maxlength="40">',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="regPhone">رقم الهاتف (ليبيانا / المدار):</label>',
        '        <input type="tel" id="regPhone" placeholder="مثال: 0912345678" maxlength="10" dir="ltr" inputmode="numeric" autocomplete="tel">',
        '        <small class="note-text">⚠️ تأكد أن الرقم مرتبط بواتساب لسهولة التواصل</small>',
        '        <p id="regPhoneError" class="error-msg"></p>',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="regPassword">كلمة المرور:</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="regPassword" placeholder="أكتب كلمة المرور هنا" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleRegPass" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="regPasswordError" class="error-msg"></p>',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="regPasswordConfirm">تأكيد كلمة المرور:</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="regPasswordConfirm" placeholder="أعد كتابة كلمة المرور هنا" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleRegPassConfirm" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="regPasswordConfirmError" class="error-msg"></p>',
        '      </div>',
        '      <p id="regGeneralError" class="error-msg"></p>',
        '      <button class="confirm-btn" id="confirmRegBtn">',
        '        <i class="fas fa-check-circle"></i> تسجيل الحساب',
        '      </button>',
        '      <div class="auth-switch-prompt">',
        '        <span>لديك حساب بالفعل؟</span>',
        '        <button type="button" class="auth-switch-link" id="switchToLogin">تسجيل الدخول</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
    ].join('\n');

    // === 3. نافذة إدارة الحساب وتغيير كلمة المرور وتأكيد الخروج (Account & Security Modal) ===
    var logoutHTML = [
        '<div id="logoutModal" class="modal">',
        '  <div class="modal-content logout-modal-content">',
        '    <!-- 1. واجهة إدارة الحساب الرئيسية -->',
        '    <div id="accountMainView" class="account-view">',
        '      <span class="close-btn" id="closeLogoutBtn" tabindex="0" role="button" aria-label="إغلاق">&times;</span>',
        '      <div class="account-avatar-box">',
        '        <i class="fas fa-user-shield"></i>',
        '      </div>',
        '      <h2>إدارة الحساب</h2>',
        '      <p class="account-welcome-msg">مرحباً <strong id="logoutUserName" class="accent-green"></strong> 👋</p>',
        '      <div class="account-phone-pill" id="accountUserPhoneWrap" style="display:none;">',
        '        <i class="fas fa-phone-alt"></i> <span id="accountUserPhone"></span>',
        '      </div>',
        '      <div class="account-options-list">',
        '        <button type="button" class="account-btn change-pass-btn" id="openChangePassBtn">',
        '          <div class="account-btn-content">',
        '            <div class="btn-icon"><i class="fas fa-key"></i></div>',
        '            <div class="account-btn-text">',
        '              <span class="btn-title">تغيير كلمة المرور</span>',
        '              <span class="btn-desc">تحديث الرقم السري لحسابك</span>',
        '            </div>',
        '          </div>',
        '          <i class="fas fa-chevron-left arrow-icon"></i>',
        '        </button>',
        '        <button type="button" class="account-btn logout-btn" id="logoutConfirmBtn">',
        '          <div class="account-btn-content">',
        '            <div class="btn-icon"><i class="fas fa-sign-out-alt"></i></div>',
        '            <div class="account-btn-text">',
        '              <span class="btn-title">تسجيل الخروج</span>',
        '              <span class="btn-desc">الخروج من الحساب الحالي</span>',
        '            </div>',
        '          </div>',
        '          <i class="fas fa-chevron-left arrow-icon"></i>',
        '        </button>',
        '      </div>',
        '    </div>',
        '    <!-- 2. واجهة نموذج تغيير كلمة المرور -->',
        '    <div id="accountChangePassView" class="account-view" style="display:none;">',
        '      <button type="button" class="account-back-btn" id="backToAccountMainBtn" title="رجوع للخيارات">',
        '        <i class="fas fa-arrow-right"></i>',
        '      </button>',
        '      <span class="close-btn" id="closeChangePassBtn" tabindex="0" role="button" aria-label="إغلاق">&times;</span>',
        '      <div class="account-key-icon-box">',
        '        <i class="fas fa-lock"></i>',
        '      </div>',
        '      <h2>تغيير كلمة المرور</h2>',
        '      <p class="modal-subtitle">أدخل كلمة المرور الحالية والجديدة لتحديث بياناتك</p>',
        '      <div class="input-group">',
        '        <label for="currentPasswordInput">كلمة المرور الحالية:</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="currentPasswordInput" placeholder="أدخل كلمة المرور الحالية" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleCurrentPass" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="currentPassError" class="error-msg"></p>',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="newPasswordInput">كلمة المرور الجديدة:</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="newPasswordInput" placeholder="كلمة المرور الجديدة (6 خانات فأكثر)" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleNewPass" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="newPassError" class="error-msg"></p>',
        '      </div>',
        '      <div class="input-group">',
        '        <label for="confirmNewPasswordInput">تأكيد كلمة المرور الجديدة:</label>',
        '        <div class="password-input-wrapper">',
        '          <input type="password" id="confirmNewPasswordInput" placeholder="أعد إدخال كلمة المرور الجديدة" dir="ltr" style="text-align: center;">',
        '          <button type="button" class="toggle-password-btn" id="toggleConfirmNewPass" title="إظهار/إخفاء الرقم السري">',
        '            <i class="fas fa-eye"></i>',
        '          </button>',
        '        </div>',
        '        <p id="confirmNewPassError" class="error-msg"></p>',
        '      </div>',
        '      <p id="changePassGeneralError" class="error-msg"></p>',
        '      <div class="change-pass-actions-row">',
        '        <button type="button" class="confirm-btn" id="saveNewPasswordBtn">',
        '          <i class="fas fa-save"></i> حفظ كلمة المرور',
        '        </button>',
        '        <button type="button" class="logout-cancel-btn" id="cancelChangePassBtn">',
        '          <i class="fas fa-times"></i> إلغاء',
        '        </button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
    ].join('\n');

    // === 4. حاوية إشعارات Toast ===
    var toastHTML = '<div id="toastContainer" class="toast-container"></div>';

    // تجميع كل الأجزاء وتحويلها لعناصر DOM حقيقية عبر DOMParser
    var fullHTML = checkoutHTML + authHTML + logoutHTML + toastHTML;
    var doc = parser.parseFromString(fullHTML, 'text/html');

    // نقل كل عنصر من الـ parsed document إلى body الفعلي
    // نستخدم Array.from لتجنب مشاكل live NodeList
    var elements = Array.from(doc.body.children);
    elements.forEach(function (el) {
        document.body.appendChild(document.adoptNode(el));
    });

    // === ربط أحداث الإغلاق عبر addEventListener (بدلاً من onclick inline) ===
    document.getElementById('closeCheckoutBtn').addEventListener('click', closeModal);
    document.getElementById('closeLoginBtn').addEventListener('click', closeLoginModal);
    document.getElementById('closeLogoutBtn').addEventListener('click', closeLogoutModal);
    if (document.getElementById('closeChangePassBtn')) {
        document.getElementById('closeChangePassBtn').addEventListener('click', closeLogoutModal);
    }
    document.getElementById('logoutConfirmBtn').addEventListener('click', confirmLogout);
    var logoutCancelBtn = document.getElementById('logoutCancelBtn');
    if (logoutCancelBtn) {
        logoutCancelBtn.addEventListener('click', closeLogoutModal);
    }

    // ربط التنقل بين واجهات الحساب وتغيير كلمة السر
    if (document.getElementById('openChangePassBtn')) {
        document.getElementById('openChangePassBtn').addEventListener('click', function () {
            switchAccountView('changePass');
        });
    }
    if (document.getElementById('backToAccountMainBtn')) {
        document.getElementById('backToAccountMainBtn').addEventListener('click', function () {
            switchAccountView('main');
        });
    }
    if (document.getElementById('cancelChangePassBtn')) {
        document.getElementById('cancelChangePassBtn').addEventListener('click', function () {
            switchAccountView('main');
        });
    }
    if (document.getElementById('saveNewPasswordBtn')) {
        document.getElementById('saveNewPasswordBtn').addEventListener('click', handleChangePassword);
    }

    // أزرار إظهار وإخفاء كلمات المرور في نافذة تغيير كلمة المرور
    if (document.getElementById('toggleCurrentPass')) {
        document.getElementById('toggleCurrentPass').addEventListener('click', function () {
            togglePasswordVisibility('currentPasswordInput', this);
        });
    }
    if (document.getElementById('toggleNewPass')) {
        document.getElementById('toggleNewPass').addEventListener('click', function () {
            togglePasswordVisibility('newPasswordInput', this);
        });
    }
    if (document.getElementById('toggleConfirmNewPass')) {
        document.getElementById('toggleConfirmNewPass').addEventListener('click', function () {
            togglePasswordVisibility('confirmNewPasswordInput', this);
        });
    }

    // ربط ضغط زر Enter ومسح الأخطاء في حقول تغيير كلمة السر
    ['currentPasswordInput', 'newPasswordInput', 'confirmNewPasswordInput'].forEach(function (inputId) {
        var inputEl = document.getElementById(inputId);
        if (inputEl) {
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleChangePassword();
                }
            });
            inputEl.addEventListener('input', function () {
                var errEl = document.getElementById('changePassGeneralError');
                if (errEl) { errEl.innerText = ''; errEl.style.display = 'none'; }
                if (inputId === 'currentPasswordInput') {
                    var cErr = document.getElementById('currentPassError');
                    if (cErr) { cErr.innerText = ''; cErr.style.display = 'none'; }
                } else if (inputId === 'newPasswordInput') {
                    var nErr = document.getElementById('newPassError');
                    if (nErr) { nErr.innerText = ''; nErr.style.display = 'none'; }
                } else if (inputId === 'confirmNewPasswordInput') {
                    var cfErr = document.getElementById('confirmNewPassError');
                    if (cfErr) { cfErr.innerText = ''; cfErr.style.display = 'none'; }
                }
            });
        }
    });

    // ربط أزرار التبديل بين تسجيل الدخول وحساب جديد
    document.getElementById('tabLoginBtn').addEventListener('click', function () { switchAuthTab('login'); });
    document.getElementById('tabRegisterBtn').addEventListener('click', function () { switchAuthTab('register'); });
    document.getElementById('switchToRegister').addEventListener('click', function () { switchAuthTab('register'); });
    document.getElementById('switchToLogin').addEventListener('click', function () { switchAuthTab('login'); });
    setupRegistrationPickers();

    // ربط أزرار إظهار/إخفاء الرقم السري
    document.getElementById('toggleLoginPass').addEventListener('click', function () {
        togglePasswordVisibility('loginPassword', this);
    });
    document.getElementById('toggleRegPass').addEventListener('click', function () {
        togglePasswordVisibility('regPassword', this);
    });
    document.getElementById('toggleRegPassConfirm').addEventListener('click', function () {
        togglePasswordVisibility('regPasswordConfirm', this);
    });
}

// === تنفيذ الحقن فوراً عند تحميل السكربت ===
injectModals();

// =============================================
// دوال نافذة إدارة الحساب وتغيير كلمة المرور
// =============================================

function switchAccountView(view) {
    var mainView = document.getElementById('accountMainView');
    var changePassView = document.getElementById('accountChangePassView');
    if (!mainView || !changePassView) return;

    clearChangePassErrorsAndInputs();

    if (view === 'changePass') {
        mainView.style.display = 'none';
        changePassView.style.display = 'block';
        var currInput = document.getElementById('currentPasswordInput');
        if (currInput) {
            setTimeout(function () {
                var oldTv = document.querySelectorAll('.tv-focused');
                oldTv.forEach(function (el) { el.classList.remove('tv-focused'); });
                currInput.focus();
                currInput.classList.add('tv-focused');
            }, 50);
        }
    } else {
        changePassView.style.display = 'none';
        mainView.style.display = 'block';
        var passBtn = document.getElementById('openChangePassBtn');
        if (passBtn) {
            setTimeout(function () {
                var oldTv = document.querySelectorAll('.tv-focused');
                oldTv.forEach(function (el) { el.classList.remove('tv-focused'); });
                passBtn.focus();
                passBtn.classList.add('tv-focused');
            }, 50);
        }
    }
}

function clearChangePassErrorsAndInputs() {
    ['currentPasswordInput', 'newPasswordInput', 'confirmNewPasswordInput'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.value = '';
            if (el.type === 'text') el.type = 'password';
        }
    });
    // إعادة تعيين أيقونات إظهار/إخفاء كلمة المرور إلى العين العادية
    ['toggleCurrentPass', 'toggleNewPass', 'toggleConfirmNewPass'].forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        if (btn) {
            var icon = btn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    });
    ['currentPassError', 'newPassError', 'confirmNewPassError', 'changePassGeneralError'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.innerText = '';
            el.style.display = 'none';
        }
    });
}

function openLogoutModal() {
    // currentAuthUser يأتي من firebase-config.js عبر مستمع onAuthStateChanged
    var user = getCurrentUser();
    var nameEl = document.getElementById('logoutUserName');
    if (nameEl && user) {
        nameEl.innerText = user.firstName ? (user.firstName + ' ' + (user.lastName || '')).trim() : (user.name || 'المستخدم');
    }
    var phoneEl = document.getElementById('accountUserPhone');
    var phoneWrap = document.getElementById('accountUserPhoneWrap');
    if (phoneEl && phoneWrap && user && user.phone) {
        phoneEl.innerText = user.phone;
        phoneWrap.style.display = 'inline-flex';
    } else if (phoneWrap) {
        phoneWrap.style.display = 'none';
    }

    switchAccountView('main');

    var modal = document.getElementById('logoutModal');
    if (modal) {
        modal.style.display = 'flex';
        var openPassBtn = document.getElementById('openChangePassBtn');
        if (openPassBtn) {
            setTimeout(function () {
                var oldTv = document.querySelectorAll('.tv-focused');
                oldTv.forEach(function (el) { el.classList.remove('tv-focused'); });
                openPassBtn.focus();
                openPassBtn.classList.add('tv-focused');
            }, 50);
        }
    }
}

function closeLogoutModal() {
    var modal = document.getElementById('logoutModal');
    if (modal) modal.style.display = 'none';
    clearChangePassErrorsAndInputs();
}

async function confirmLogout() {
    let isConfirmed = true;
    if (typeof showConfirm === 'function') {
        isConfirmed = await showConfirm('هل أنت متأكد من تسجيل الخروج من حسابك؟');
    } else {
        isConfirmed = await showConfirm('هل أنت متأكد من تسجيل الخروج من حسابك؟');
    }

    if (!isConfirmed) return;

    // يجب جلب بيانات المستخدم قبل تفعيل علامة تسجيل الخروج
    const user = getCurrentUser();

    window.__almezo_explicit_logout = true;
    try {
        localStorage.removeItem('almezo_cached_user');
        sessionStorage.removeItem('almezo_cached_user');
    } catch (e) { }

    if (typeof logActivity === 'function') {
        logActivity({
            action: 'logout',
            category: 'auth',
            severity: 'info',
            title: 'تسجيل خروج من الحساب',
            details: { name: user ? (user.firstName || user.name || user.phone) : 'مستخدم' },
            userOverride: user // نمرر المستخدم صراحة لتسجيل حركته كصاحب الحساب وليس كزائر
        });
    }
    // تسجيل الخروج عبر Firebase Auth (يُطلق onAuthStateChanged تلقائياً)
    logoutUser().then(function () {
        closeLogoutModal();
        showToast('رافقتك السلامة 👋، نراك قريباً', 'success', 4000);
    }).catch(function (err) {
        console.error('خطأ في تسجيل الخروج:', err);
    });
}

async function handleChangePassword() {
    var currentPassEl = document.getElementById('currentPasswordInput');
    var newPassEl = document.getElementById('newPasswordInput');
    var confirmPassEl = document.getElementById('confirmNewPasswordInput');

    var currErrEl = document.getElementById('currentPassError');
    var newErrEl = document.getElementById('newPassError');
    var confirmErrEl = document.getElementById('confirmNewPassError');
    var generalErrEl = document.getElementById('changePassGeneralError');

    // مسح رسائل الخطأ
    [currErrEl, newErrEl, confirmErrEl, generalErrEl].forEach(function (el) {
        if (el) { el.innerText = ''; el.style.display = 'none'; }
    });

    var currentPassword = currentPassEl ? currentPassEl.value.trim() : '';
    var newPassword = newPassEl ? newPassEl.value.trim() : '';
    var confirmPassword = confirmPassEl ? confirmPassEl.value.trim() : '';

    if (!currentPassword) {
        if (currErrEl) {
            currErrEl.innerText = '❌ الرجاء إدخال كلمة المرور الحالية';
            currErrEl.style.display = 'block';
        }
        if (currentPassEl) currentPassEl.focus();
        return;
    }

    var passResult = validatePassword(newPassword);
    if (!passResult.valid) {
        if (newErrEl) {
            newErrEl.innerText = passResult.error;
            newErrEl.style.display = 'block';
        }
        if (newPassEl) newPassEl.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        if (confirmErrEl) {
            confirmErrEl.innerText = '❌ كلمتا المرور غير متطابقتين';
            confirmErrEl.style.display = 'block';
        }
        if (confirmPassEl) confirmPassEl.focus();
        return;
    }

    if (currentPassword === newPassword) {
        if (newErrEl) {
            newErrEl.innerText = '⚠️ كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية';
            newErrEl.style.display = 'block';
        }
        if (newPassEl) newPassEl.focus();
        return;
    }

    var saveBtn = document.getElementById('saveNewPasswordBtn');
    var originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        saveBtn.disabled = true;
    }

    try {
        await changeUserPassword(currentPassword, newPassword);
        if (typeof logActivity === 'function') {
            logActivity({
                action: 'password_changed',
                category: 'security',
                severity: 'warning',
                title: 'تغيير كلمة المرور للحساب',
                details: { message: 'تم تغيير كلمة المرور بنجاح من جهاز المستخدم' }
            });
        }
        closeLogoutModal();
        showToast('تم تغيير كلمة المرور بنجاح 🔒', 'success');
    } catch (error) {
        console.error('خطأ تغيير كلمة المرور:', error);
        var errorMsg = '❌ حدث خطأ أثناء تغيير كلمة المرور. يرجى المحاولة لاحقاً.';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMsg = '❌ كلمة المرور الحالية غير صحيحة. يرجى التأكد وإعادة المحاولة.';
            if (currErrEl) {
                currErrEl.innerText = errorMsg;
                currErrEl.style.display = 'block';
                return;
            }
        } else if (error.code === 'auth/weak-password') {
            errorMsg = '❌ كلمة المرور الجديدة ضعيفة (6 خانات على الأقل).';
            if (newErrEl) {
                newErrEl.innerText = errorMsg;
                newErrEl.style.display = 'block';
                return;
            }
        } else if (error.code === 'auth/requires-recent-login') {
            errorMsg = '⚠️ انتهت صلاحية الجلسة، يرجى تسجيل الخروج والدخول مجدداً.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = '⚠️ تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMsg = '❌ تعذر الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت.';
        }

        if (generalErrEl) {
            generalErrEl.innerText = errorMsg;
            generalErrEl.style.display = 'block';
        } else {
            showToast(errorMsg, 'error');
        }
    } finally {
        if (saveBtn) {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }
}

// =============================================
// نظام الإشعارات المنبثقة (Toast Notifications)
// =============================================

/**
 * عرض إشعار منبثق في أسفل الشاشة
 * @param {string} message - نص الرسالة
 * @param {'success'|'error'|'info'} type - نوع الإشعار
 * @param {number} duration - مدة العرض بالمللي ثانية
 */
// =============================================
// Custom Confirm Modal
// =============================================
window.showConfirm = function (message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';

        const box = document.createElement('div');
        box.className = 'custom-confirm-box';

        const icon = document.createElement('i');
        icon.className = 'fas fa-exclamation-triangle confirm-icon';

        const msg = document.createElement('p');
        msg.className = 'confirm-message';
        msg.textContent = message;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'confirm-buttons';

        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-confirm-yes';
        btnConfirm.innerHTML = '<i class="fas fa-check"></i> ';
        btnConfirm.appendChild(document.createTextNode(opts.okText || 'نعم، متأكد'));

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-confirm-no';
        btnCancel.innerHTML = '<i class="fas fa-times"></i> إلغاء';

        btnContainer.appendChild(btnConfirm);
        btnContainer.appendChild(btnCancel);

        box.appendChild(icon);
        if (opts.title) {
            const titleEl = document.createElement('h3');
            titleEl.className = 'confirm-title';
            titleEl.textContent = opts.title;
            box.appendChild(titleEl);
        }
        box.appendChild(msg);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Animations & initial TV focus
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            box.classList.add('visible');
            setTimeout(() => {
                var oldTv = document.querySelectorAll('.tv-focused');
                oldTv.forEach(function (el) { el.classList.remove('tv-focused'); });
                btnConfirm.focus();
                btnConfirm.classList.add('tv-focused');
            }, 50);
        });

        let closed = false;
        function close(result) {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('visible');
            box.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                resolve(result);
            }, 300);
        }

        // Escape يلغي، وEnter يؤكّد ما لم يكن التركيز على زر الإلغاء
        function onKey(e) {
            if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); e.stopPropagation(); close(false); }
            else if ((e.key === 'Enter' || e.keyCode === 13) && document.activeElement !== btnCancel) {
                e.preventDefault(); e.stopPropagation(); close(true);
            }
        }
        document.addEventListener('keydown', onKey, true);

        btnConfirm.addEventListener('click', () => close(true));
        btnCancel.addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
};

// =============================================
// Custom Alert Modal (تصميم نافذة التنبيه الخاصة بنفس طابع وسحر الموقع)
// =============================================
window.showAlert = function (message, type, title) {
    return new Promise((resolve) => {
        // تحديد النوع تلقائياً إذا لم يُحدد بناءً على طبيعة الرسالة
        if (!type) {
            const str = String(message || '');
            if (str.includes('✅') || str.includes('بنجاح') || str.includes('تم ')) {
                type = 'success';
            } else if (str.includes('❌') || str.includes('خطأ') || str.includes('فشل') || str.includes('تعذر')) {
                type = 'error';
            } else if (str.includes('⚠️') || str.includes('تنبيه') || str.includes('يرجى') || str.includes('الرجاء') || str.includes('يجب')) {
                type = 'warning';
            } else {
                type = 'info';
            }
        }

        // تحديد العنوان الافتراضي حسب النوع
        if (!title) {
            title = type === 'success' ? 'عملية ناجحة' :
                type === 'error' ? 'تنبيه خطأ' :
                    type === 'warning' ? 'تنبيه هام' : 'معلومات';
        }

        // تحديد أيقونة التنبيه
        const iconClass = type === 'success' ? 'fas fa-circle-check alert-icon alert-icon-success' :
            type === 'error' ? 'fas fa-circle-xmark alert-icon alert-icon-error' :
                type === 'warning' ? 'fas fa-triangle-exclamation alert-icon alert-icon-warning' :
                    'fas fa-circle-info alert-icon alert-icon-info';

        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';

        const box = document.createElement('div');
        box.className = `custom-alert-box alert-${type}`;

        const icon = document.createElement('i');
        icon.className = iconClass;

        const titleEl = document.createElement('h4');
        titleEl.className = 'alert-title';
        titleEl.textContent = title;

        const msg = document.createElement('p');
        msg.className = 'alert-message';
        msg.textContent = message;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'alert-buttons';

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = `btn-alert-ok btn-alert-${type}`;
        btnOk.innerHTML = '<i class="fas fa-check"></i> حسناً';

        btnContainer.appendChild(btnOk);
        box.appendChild(icon);
        box.appendChild(titleEl);
        box.appendChild(msg);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // تفعيل الظهور والتركيز على الزر
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            box.classList.add('visible');
            setTimeout(() => {
                var oldTv = document.querySelectorAll('.tv-focused');
                oldTv.forEach(function (el) { el.classList.remove('tv-focused'); });
                btnOk.focus();
                btnOk.classList.add('tv-focused');
            }, 50);
        });

        let isClosed = false;
        function closeAlert() {
            if (isClosed) return;
            isClosed = true;
            document.removeEventListener('keydown', handleKey);
            overlay.classList.remove('visible');
            box.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                resolve(true);
            }, 250);
        }

        function handleKey(e) {
            if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
                e.preventDefault();
                closeAlert();
            }
        }

        btnOk.addEventListener('click', closeAlert);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAlert();
        });
        document.addEventListener('keydown', handleKey);
    });
};

// =============================================
// Custom Prompt Modal (بديل صندوق الإدخال prompt بنفس طابع الموقع)
// =============================================
window.showPrompt = function (message, defaultValue = '', title = 'إدخال بيانات') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';

        const box = document.createElement('div');
        box.className = 'custom-alert-box custom-prompt-box';

        const icon = document.createElement('i');
        icon.className = 'fas fa-pen-to-square alert-icon alert-icon-info';

        const titleEl = document.createElement('h4');
        titleEl.className = 'alert-title';
        titleEl.textContent = title;

        const msg = document.createElement('p');
        msg.className = 'alert-message';
        msg.textContent = message;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'custom-prompt-input';
        input.value = defaultValue || '';

        const btnContainer = document.createElement('div');
        btnContainer.className = 'confirm-buttons';

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'btn-confirm-yes';
        btnOk.innerHTML = '<i class="fas fa-check"></i> تأكيد';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn-confirm-no';
        btnCancel.innerHTML = '<i class="fas fa-times"></i> إلغاء';

        btnContainer.appendChild(btnOk);
        btnContainer.appendChild(btnCancel);

        box.appendChild(icon);
        box.appendChild(titleEl);
        box.appendChild(msg);
        box.appendChild(input);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            box.classList.add('visible');
            input.focus();
            input.select();
        });

        let isClosed = false;
        function closePrompt(value) {
            if (isClosed) return;
            isClosed = true;
            document.removeEventListener('keydown', handleKey);
            overlay.classList.remove('visible');
            box.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                resolve(value);
            }, 250);
        }

        function handleKey(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                closePrompt(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePrompt(null);
            }
        }

        btnOk.addEventListener('click', () => closePrompt(input.value));
        btnCancel.addEventListener('click', () => closePrompt(null));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePrompt(null);
        });
        document.addEventListener('keydown', handleKey);
    });
};

// استبدال دالتي alert و prompt الافتراضيتين للمتصفح بالنوافذ الحديثة المطابقة للموقع
window.alert = function (message) {
    return window.showAlert(message);
};

window.prompt = function (message, defaultValue) {
    return window.showPrompt(message, defaultValue);
};

function showToast(message, type, duration) {
    type = type || 'success';
    duration = duration || 3500;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    // اختيار الأيقونة حسب نوع الإشعار
    const icon = type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';

    toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
    container.appendChild(toast);

    // تفعيل أنيميشن الظهور
    requestAnimationFrame(function () {
        toast.classList.add('show');
    });

    // إخفاء وإزالة الإشعار بعد المدة المحددة
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 350);
    }, duration);
}

// =============================================
// تحديث حالة زر تسجيل الدخول في الهيدر
// =============================================
// تُستدعى هذه الدالة من مستمع onAuthStateChanged في firebase-config.js
function updateHeaderLoginState() {
    var btn = document.querySelector('.header-login-btn');
    if (!btn) return;

    btn.classList.remove('auth-loading');

    // 1. إذا كان المستخدم مسجلاً ومؤكداً من فايربيز
    if (isUserLoggedIn()) {
        var user = getCurrentUser();
        var displayName = user.firstName ? (user.firstName + ' ' + (user.lastName || '')).trim() : (user.name || 'حسابي');
        btn.innerHTML = '<i class="fas fa-user-check"></i> ' + displayName;
        btn.classList.add('logged-in');
        btn.onclick = function () { openLogoutModal(); };

        try {
            var cacheData = JSON.stringify({ name: displayName, uid: user.uid, role: user.role, firstName: user.firstName });
            localStorage.setItem('almezo_cached_user', cacheData);
            sessionStorage.setItem('almezo_cached_user', cacheData);
        } catch (e) { }

    } else {
        // 2. فحص الكاش اللحظي قبل تفريغ الزر لمنع الوميض عند التحديث
        var cachedStr = null;
        try {
            cachedStr = sessionStorage.getItem('almezo_cached_user') || localStorage.getItem('almezo_cached_user');
        } catch (e) { }

        // إذا كان فايربيز ما زال في مرحلة الفحص الأولي (auth is validating)
        if (cachedStr && (typeof auth !== 'undefined' && auth.currentUser === null && !window.__almezo_explicit_logout)) {
            // إضافة حماية إضافية للـ Cache:
            // إذا كان الكاش موجوداً ولكن تم حذف authVersion بسبب طرد سابق، لا تستخدم الكاش!
            var localAuthVersion = null;
            try { localAuthVersion = localStorage.getItem('almezo_auth_version'); } catch (e) { }

            if (localAuthVersion) {
                try {
                    var cachedUser = JSON.parse(cachedStr);
                    if (cachedUser && cachedUser.name) {
                        btn.innerHTML = '<i class="fas fa-user-check"></i> ' + cachedUser.name;
                        btn.classList.add('logged-in');
                        btn.onclick = function () { openLogoutModal(); };
                        checkFABMode();
                        return;
                    }
                } catch (e) { }
            }
        }

        btn.innerHTML = 'تسجيل الدخول';
        btn.classList.remove('logged-in');
        btn.onclick = function () { openLoginModal(); };

        try {
            localStorage.removeItem('almezo_cached_user');
            sessionStorage.removeItem('almezo_cached_user');
        } catch (e) { }
    }
    checkFABMode();
}

// تشغيل فوري لحظي عند تحميل السكربت والـ DOM
try { updateHeaderLoginState(); } catch (e) { }
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
        try { updateHeaderLoginState(); } catch (e) { }
    });
    window.addEventListener('load', function () {
        try { updateHeaderLoginState(); } catch (e) { }
    });
}

// =============================================
// دوال عرض المنتجات (Rendering Functions)
// =============================================

/**
 * عرض بطاقات المنتجات مع قائمة اختيار المدة (للاستخدام العام)
 */
function renderProducts(categoryKey, containerId, categoryLabel) {
    var container = document.getElementById(containerId);
    if (!container || !siteData[categoryKey]) return;

    var products = siteData[categoryKey];
    var html = '';

    products.forEach(function (prod) {
        var optionsHtml = '';
        // دعم كلا الصيغتين: durations/prices أو plans
        var durations = prod.durations || prod.plans.map(function (p) { return p.duration; });
        var prices = prod.prices || prod.plans.map(function (p) { return p.price; });

        durations.forEach(function (dur, idx) {
            var priceText = prices && prices[idx] ? ' - ' + prices[idx] : '';
            optionsHtml += '<option value="' + dur + priceText + '">' + dur + priceText + '</option>';
        });

        var extraClass = (categoryKey === 'vip') ? 'vip-card' : '';
        html += '\
        <div class="product-card ' + extraClass + '">\
            <h3>' + prod.name + '</h3>\
            <select class="duration-select">' + optionsHtml + '</select>\
            <button class="buy-btn" onclick="openModal(\'' + categoryLabel + ': ' + prod.name + '\', this, \'' + categoryKey + '\')">\
                <i class="fas fa-shopping-cart"></i> شراء الآن\
            </button>\
        </div>';
    });

    container.innerHTML = html;
}

/** بطاقة تعديل منتج في القوائم: الاسم والشعار والحفظ والحذف والترتيب. */
function editProductCardHtml(item, categoryKey, detailPageName, namePlaceholder) {
    var id = escEdit(item.id);
    return '\
            <div class="product-card iptv-logo-card" data-edit-id="' + id + '" data-edit-kind="basic">\
                <input type="text" id="edit-name-' + id + '" value="' + escEdit(item.name) + '" class="edit-input" placeholder="' + namePlaceholder + '">\
                <input type="text" id="edit-logo-' + id + '" value="' + escEdit(item.logo) + '" class="edit-input" placeholder="رابط الشعار">\
                <button class="admin-action-btn admin-save-btn" onclick="saveProduct(\'' + id + '\')"><i class="fas fa-save"></i> حفظ</button>\
                <button class="admin-action-btn admin-delete-btn" onclick="deleteProduct(\'' + id + '\')"><i class="fas fa-trash"></i> حذف</button>\
                <div class="sort-arrows" style="display:flex; justify-content:space-between; margin-top:10px; gap:5px; width:100%;">\
                    <button class="admin-action-btn" style="flex:1;" onclick="moveProduct(\'' + id + '\', \'up\', \'' + categoryKey + '\')" title="أعلى">⬆️</button>\
                    <button class="admin-action-btn" style="flex:1;" onclick="moveProduct(\'' + id + '\', \'down\', \'' + categoryKey + '\')" title="أسفل">⬇️</button>\
                    <button class="admin-action-btn" style="flex:1;" onclick="moveProduct(\'' + id + '\', \'right\', \'' + categoryKey + '\')" title="يمين">➡️</button>\
                    <button class="admin-action-btn" style="flex:1;" onclick="moveProduct(\'' + id + '\', \'left\', \'' + categoryKey + '\')" title="يسار">⬅️</button>\
                </div>\
                <a href="' + detailPageName + '?id=' + encodeURIComponent(item.id) + '" style="margin-top:10px; font-size:12px; color:var(--text-secondary);">تعديل التفاصيل والأسعار &rarr;</a>\
            </div>';
}

/**
 * عرض قائمة سيرفرات IPTV كبطاقات لوجو قابلة للنقر
 */
function renderIptvList(containerId) {
    var container = document.getElementById(containerId);
    if (!container || !siteData.iptv) return;

    var html = '';
    siteData.iptv.forEach(function (server) {
        if (isEditMode) {
            html += editProductCardHtml(server, 'iptv', 'server-details.html', 'اسم السيرفر');
        } else {
            html += '\
            <a href="server-details.html?id=' + server.id + '" class="product-card iptv-logo-card">\
                <img src="' + server.logo + '" alt="' + server.name + '" class="server-logo"\
                    onerror="this.src=\'https://via.placeholder.com/100x100/141820/4caf50?text=TV\'">\
                <h3>' + server.name + '</h3>\
            </a>';
        }
    });

    if (isEditMode) {
        html += '<div class="admin-add-btn" onclick="addNewProduct(\'iptv\')"><i class="fas fa-plus-circle"></i>إضافة سيرفر جديد</div>';
        html += deletedProductsHtml('iptv');
    }
    renderKeepingEdits(container, html);
}

/**
 * عرض قائمة لوجوهات عامة (Smart Apps / VIP) كبطاقات قابلة للنقر
 */
function renderLogoList(categoryKey, containerId, detailPageName) {
    var container = document.getElementById(containerId);
    if (!container || !siteData[categoryKey]) return;

    var html = '';
    siteData[categoryKey].forEach(function (item) {
        if (isEditMode) {
            html += editProductCardHtml(item, categoryKey, detailPageName, 'الاسم');
        } else {
            html += '\
            <a href="' + detailPageName + '?id=' + item.id + '" class="product-card iptv-logo-card">\
                <img src="' + item.logo + '" alt="' + item.name + '" class="server-logo"\
                    onerror="this.src=\'https://via.placeholder.com/100x100/141820/4caf50?text=App\'">\
                <h3>' + item.name + '</h3>\
            </a>';
        }
    });

    if (isEditMode) {
        html += '<div class="admin-add-btn" onclick="addNewProduct(\'' + categoryKey + '\')"><i class="fas fa-plus-circle"></i>إضافة عنصر جديد</div>';
        html += deletedProductsHtml(categoryKey);
    }
    renderKeepingEdits(container, html);
}

/**
 * عرض تفاصيل سيرفر أو تطبيق (خطط الأسعار + روابط التحميل)
 * إصلاح: تضمين السعر في قيمة الحقل المخفي
 * إصلاح: عرض وصف باقات VIP
 */
function renderDetails(categoryKey) {
    var urlParams = new URLSearchParams(window.location.search);
    var itemId = urlParams.get('id');
    if (!itemId) return;

    var item = siteData[categoryKey].find(function (i) { return i.id === itemId; });
    if (!item) return;

    // تحديد العنوان حسب نوع التصنيف
    var titlePrefix = (categoryKey === 'iptv') ? 'تفاصيل ' :
        (categoryKey === 'vip') ? 'تفاصيل  ' : 'تفعيل تطبيق ';

    var titleEl = document.getElementById('detail-title-text') || document.getElementById('server-title-text');
    var logoEl = document.getElementById('detail-logo') || document.getElementById('detail-server-logo');

    if (titleEl) titleEl.innerText = titlePrefix + item.name;
    if (logoEl) {
        logoEl.src = item.logo;
        logoEl.alt = item.name;
    }

    // بناء بطاقات خطط الأسعار
    var plansHtml = '';

    if (isEditMode) {
        plansHtml += '<div style="grid-column: 1 / -1; margin-bottom: 20px; text-align:right;" data-edit-id="' + escEdit(item.id) + '" data-edit-kind="details" data-edit-category="' + categoryKey + '">';

        // --- 1. تعديل خطط الأسعار ---
        plansHtml += '<h4 style="margin-bottom:8px; color:var(--warning);">تعديل خطط الأسعار</h4>';
        plansHtml += `<div id="edit-plans-container-${item.id}">`;
        if (item.plans && item.plans.length > 0) {
            item.plans.forEach((plan) => {
                plansHtml += `
                <div class="edit-plan-row">
                    <input type="text" class="edit-input plan-duration-input" value="${escEdit(plan.duration)}" placeholder="المدة (مثال: 3 أشهر)">
                    <input type="text" class="edit-input plan-price-input" value="${escEdit(plan.price)}" placeholder="السعر (مثال: 50 د.ل)">
                    <button class="admin-delete-plan-btn" onclick="removeEditRow(this)" title="حذف الخطة"><i class="fas fa-trash"></i></button>
                </div>`;
            });
        }
        plansHtml += `</div>`;
        plansHtml += `<button class="admin-add-plan-btn" onclick="addPlanRow('${item.id}')"><i class="fas fa-plus"></i> إضافة خطة جديدة</button>`;

        // --- 2. تعديل الوصف ---
        let desc = item.description !== undefined ? item.description : '';
        // تحويل <br> إلى أسطر جديدة لتكون مقروءة في textarea
        let readableDesc = desc.replace(/<br\s*[\/]?>/gi, '\n');
        plansHtml += '<h4 style="margin-bottom:8px; margin-top:15px; color:var(--warning);">تعديل الوصف</h4>';
        plansHtml += '<textarea id="edit-desc-' + item.id + '" class="edit-textarea" placeholder="اكتب الوصف هنا... يدعم الأسطر الجديدة">' + escEdit(readableDesc) + '</textarea>';

        // --- 3. تعديل روابط التطبيقات ---
        let appsObj = item.apps !== undefined ? item.apps : {};
        plansHtml += '<h4 style="margin-bottom:8px; margin-top:15px; color:var(--warning);">تعديل روابط التطبيقات</h4>';

        // تحويل البيانات القديمة إلى مصفوفة لسهولة العرض
        const getAppList = (os) => {
            if (!appsObj[os]) return [];
            if (typeof appsObj[os] === 'string') return [{ name: "تحميل التطبيق", link: appsObj[os] }];
            return Array.isArray(appsObj[os]) ? appsObj[os] : [];
        };

        const androidApps = getAppList('android');
        const iosApps = getAppList('ios');
        const windowsApps = getAppList('windows');

        let smartLink = '';
        let smartCodes = [];
        if (appsObj.smart) {
            smartLink = appsObj.smart.link || '';
            smartCodes = appsObj.smart.codes || [];
        } else if (appsObj.downloader) {
            smartCodes = [{ name: "تحميل مباشر", code: appsObj.downloader }];
        }

        const renderAppRows = (appsList) => {
            let html = '';
            appsList.forEach(app => {
                html += `
                <div class="edit-app-row">
                    <input type="text" class="edit-input app-name-input" value="${escEdit(app.name || '')}" placeholder="اسم التطبيق (مثلاً: تطبيق الميزو)">
                    <input type="text" class="edit-input app-link-input" value="${escEdit(app.link || '')}" placeholder="رابط التحميل">
                    <button class="admin-delete-app-btn" onclick="removeEditRow(this)" title="حذف التطبيق"><i class="fas fa-trash"></i></button>
                </div>`;
            });
            return html;
        };

        plansHtml += `
            <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;">
                <!-- Android -->
                <div class="edit-app-container" id="edit-app-android-container-${item.id}">
                    <h5><i class="fab fa-android" style="color: #a4c639;"></i> تطبيقات Android</h5>
                    ${renderAppRows(androidApps)}
                    <button type="button" class="admin-add-app-btn" onclick="addAppRow('${item.id}', 'android')"><i class="fas fa-plus"></i> إضافة تطبيق</button>
                </div>
                
                <!-- iOS -->
                <div class="edit-app-container" id="edit-app-ios-container-${item.id}">
                    <h5><i class="fab fa-apple" style="color: #fff;"></i> تطبيقات iOS</h5>
                    ${renderAppRows(iosApps)}
                    <button type="button" class="admin-add-app-btn" onclick="addAppRow('${item.id}', 'ios')"><i class="fas fa-plus"></i> إضافة تطبيق</button>
                </div>
                
                <!-- Windows -->
                <div class="edit-app-container" id="edit-app-windows-container-${item.id}">
                    <h5><i class="fab fa-windows" style="color: #00a4ef;"></i> تطبيقات Windows</h5>
                    ${renderAppRows(windowsApps)}
                    <button type="button" class="admin-add-app-btn" onclick="addAppRow('${item.id}', 'windows')"><i class="fas fa-plus"></i> إضافة تطبيق</button>
                </div>
                
                <!-- Smart (Downloader) -->
                <div class="edit-app-container" id="edit-app-smart-codes-${item.id}">
                    <h5><i class="fas fa-tv" style="color: #ff9800;"></i> تطبيقات الشاشات (Smart)</h5>
                    <div style="margin-bottom: 15px;">
                        <label style="color:var(--text-secondary); font-size:12px; margin-bottom: 5px; display: block;">رابط تطبيق Downloader الأساسي:</label>
                        <input type="text" id="edit-app-smart-link-${item.id}" class="edit-input" value="${escEdit(smartLink)}" placeholder="رابط Downloader">
                    </div>
                    <h6 style="color:var(--text-secondary); font-size:0.85rem; margin-bottom: 8px;">أكواد التحميل:</h6>
                    `;

        smartCodes.forEach(codeObj => {
            plansHtml += `
                <div class="edit-app-row">
                    <input type="text" class="edit-input app-name-input" value="${escEdit(codeObj.name || '')}" placeholder="اسم التطبيق">
                    <input type="text" class="edit-input app-code-input" value="${escEdit(codeObj.code || '')}" placeholder="كود Downloader">
                    <button class="admin-delete-app-btn" onclick="removeEditRow(this)" title="حذف الكود"><i class="fas fa-trash"></i></button>
                </div>`;
        });

        plansHtml += `
                    <button type="button" class="admin-add-app-btn" onclick="addSmartCodeRow('${item.id}')"><i class="fas fa-plus"></i> إضافة كود</button>
                </div>
            </div>`;

        plansHtml += '<button class="admin-action-btn admin-save-btn" style="width:100%; padding:12px; font-size: 16px;" onclick="saveProductDetails(\'' + item.id + '\', \'' + categoryKey + '\')"><i class="fas fa-save"></i> حفظ جميع التحديثات</button>';
        plansHtml += '</div>';
    } else {
        item.plans.forEach(function (plan) {
            let badgeHtml = '';
            // تمت إزالة شارة الأكثر طلباً بناءً على طلب العميل

            plansHtml += `
            <div class="product-card plan-card" style="position: relative;">
                ${badgeHtml}
                <h3 class="plan-duration">${plan.duration}</h3>
                <p class="plan-price">${plan.price}</p>
                <input type="hidden" value="${plan.duration} - ${plan.price}">
                <button class="buy-btn" onclick="openModal('${item.name}', this, '${categoryKey}')">
                    <i class="fas fa-shopping-cart"></i> شراء الآن
                </button>
            </div>`;
        });
    }

    var plansContainer = document.getElementById('plans-container');
    if (plansContainer) renderKeepingEdits(plansContainer, plansHtml);

    // روابط تحميل التطبيقات (لسيرفرات IPTV فقط)
    if (!isEditMode && categoryKey === 'iptv' && item.apps) {
        var appsContainer = document.getElementById('apps-grid-container');
        if (appsContainer) {
            let appsHtml = '';

            const getAppList = (os) => {
                if (!item.apps[os]) return [];
                if (typeof item.apps[os] === 'string') return [{ name: "تحميل التطبيق", link: item.apps[os] }];
                return Array.isArray(item.apps[os]) ? item.apps[os] : [];
            };

            const androidApps = getAppList('android');
            if (androidApps.length > 0) {
                let btnsHtml = '';
                androidApps.forEach(app => {
                    if (app.link) {
                        btnsHtml += `<a href="${app.link}" target="_blank" rel="noopener" class="app-link-btn" style="margin-bottom: 8px;">${app.name || 'تحميل التطبيق'}</a>`;
                    }
                });
                if (btnsHtml) {
                    appsHtml += `
                    <div class="app-card">
                        <h4><i class="fab fa-android" style="color: #3DDC84; margin-left: 8px;"></i> تطبيقات Android</h4>
                        ${btnsHtml}
                    </div>`;
                }
            }

            const iosApps = getAppList('ios');
            if (iosApps.length > 0) {
                let btnsHtml = '';
                iosApps.forEach(app => {
                    if (app.link) {
                        btnsHtml += `<a href="${app.link}" target="_blank" rel="noopener" class="app-link-btn" style="margin-bottom: 8px;">${app.name || 'تحميل التطبيق'}</a>`;
                    }
                });
                if (btnsHtml) {
                    appsHtml += `
                    <div class="app-card">
                        <h4><i class="fab fa-apple" style="margin-left: 8px;"></i> تطبيقات iOS / Apple</h4>
                        ${btnsHtml}
                    </div>`;
                }
            }

            const windowsApps = getAppList('windows');
            if (windowsApps.length > 0) {
                let btnsHtml = '';
                windowsApps.forEach(app => {
                    if (app.link) {
                        btnsHtml += `<a href="${app.link}" target="_blank" rel="noopener" class="app-link-btn" style="margin-bottom: 8px;">${app.name || 'تحميل التطبيق'}</a>`;
                    }
                });
                if (btnsHtml) {
                    appsHtml += `
                    <div class="app-card">
                        <h4><i class="fab fa-windows" style="color: #00a8e8; margin-left: 8px;"></i> تطبيقات Windows</h4>
                        ${btnsHtml}
                    </div>`;
                }
            }

            let smartCodes = [];
            let smartLinkHtml = '';
            if (item.apps.smart) {
                smartCodes = item.apps.smart.codes || [];
                if (item.apps.smart.link) {
                    smartLinkHtml = `<a href="${item.apps.smart.link}" target="_blank" rel="noopener" class="app-link-btn" style="margin-bottom: 12px; background: #ff9800; color: #fff;">تحميل تطبيق Downloader</a>`;
                }
            } else if (item.apps.downloader) {
                smartCodes = [{ name: "التحميل المباشر", code: item.apps.downloader }];
            }

            if (smartCodes.length > 0 || smartLinkHtml !== '') {
                let codesHtml = '';
                smartCodes.forEach(codeObj => {
                    if (codeObj.code) {
                        codesHtml += `
                        <div style="margin-bottom: 8px;">
                            <p style="margin-bottom: 4px; font-size: 0.9rem;">${codeObj.name || 'كود التحميل'}:</p>
                            <span class="dl-code-box">${codeObj.code}</span>
                        </div>`;
                    }
                });

                appsHtml += `
                <div class="app-card">
                    <h4><i class="fas fa-tv" style="color: #ff9800; margin-left: 8px;"></i> تطبيقات شاشات السمارت</h4>
                    ${smartLinkHtml}
                    ${codesHtml}
                </div>`;
            }

            // إخفاء قسم التطبيقات بالكامل إذا لم تكن هناك أي بطاقات
            const appsSection = appsContainer.closest('.apps-section');
            if (appsHtml) {
                appsContainer.innerHTML = appsHtml;
                if (appsSection) appsSection.style.display = 'block';
            } else {
                if (appsSection) appsSection.style.display = 'none';
            }
        }
    }

    if (!isEditMode && item.description) {
        // فلترة وصف المنتج لمنع ثغرات XSS مع السماح بـ <br> و <b>
        var tempDiv = document.createElement('div');
        tempDiv.textContent = item.description;
        var safeHtml = tempDiv.innerHTML
            .replace(/&lt;br\s*[\/]?&gt;/gi, '<br>')
            .replace(/&lt;b&gt;/gi, '<b>')
            .replace(/&lt;\/b&gt;/gi, '</b>');

        var descEl = document.getElementById('detail-description');
        if (descEl) descEl.innerHTML = safeHtml;

        var serverDescBox = document.getElementById('server-description-box');
        var serverDescText = document.getElementById('server-description-text');
        if (serverDescBox && serverDescText) {
            serverDescText.innerHTML = safeHtml;
            serverDescBox.style.display = 'block';
        }
    }

    // زر طلب التجربة
    var trialBtn = document.getElementById('trial-btn');
    if (trialBtn) {
        trialBtn.onclick = function () {
            requestTrial(item.name, categoryKey);
        };
    }
}

// =============================================
// نافذة الشراء - مع اعتراض المستخدم غير المسجّل
// =============================================

/**
 * تحديث قائمة خيارات طرق الدفع في نافذة الشراء
 * لباقات VIP: يتم استثناء خيار الدفع بالرصيد والكروت
 * لباقي المنتجات: تتوفر جميع طرق الدفع
 * @param {boolean} isVip - هل المنتج المختار من باقات VIP
 */
function updatePaymentMethodsOptions(isVip) {
    var wrapper = document.getElementById('paymentMethodWrapper');
    var hiddenInput = document.getElementById('paymentMethod');
    if (!wrapper || !hiddenInput) return;

    var options = [];
    if (isVip) {
        options = [
            { value: "سداد", text: "خدمة سداد", icon: "photo/sadad-icon.png" },
            { value: "وان باي (OnePay)", text: "وان باي (OnePay)", icon: "photo/onepay-icon.png" },
            { value: "لي باي (LYPay)", text: "لي باي (LYPay)", icon: "photo/lypay-icon.png" },
            { value: "USDT", text: "الدفع بواسطة USDT", icon: "photo/usdt-icon.png" }
        ];
    } else {
        options = [
            { value: "تحويل رصيد / كروت", text: "تحويل رصيد أو كروت (ليبيانا / المدار)", icon: "photo/lib_mad-icon.png" },
            { value: "سداد", text: "خدمة سداد", icon: "photo/sadad-icon.png" },
            { value: "وان باي (OnePay)", text: "وان باي (OnePay)", icon: "photo/onepay-icon.png" },
            { value: "لي باي (LYPay)", text: "لي باي (LYPay)", icon: "photo/lypay-icon.png" },
            { value: "USDT", text: "الدفع بواسطة USDT", icon: "photo/usdt-icon.png" }
        ];
    }

    hiddenInput.value = "";

    var html = '<div class="custom-select-trigger" onclick="toggleCustomSelect(event)">';
    html += '<div style="display:flex; align-items:center; flex:1;"><span>اختر طريقة الدفع من القائمة...</span></div>';
    html += '<i class="fas fa-chevron-down" style="font-size: 0.8rem; opacity: 0.7;"></i></div>';
    html += '<div class="custom-select-options" id="customSelectOptions" style="display:none;">';

    options.forEach(function (opt) {
        html += '<div class="custom-select-option" onclick="selectPaymentMethod(\'' + opt.value + '\', \'' + opt.text + '\', \'' + opt.icon + '\')">';
        html += '<img src="' + opt.icon + '" class="payment-icon"> ' + opt.text;
        html += '</div>';
    });
    html += '</div>';

    wrapper.innerHTML = html;
}

window.toggleCustomSelect = function (e) {
    e.stopPropagation();
    var opts = document.getElementById('customSelectOptions');
    if (opts) {
        opts.style.display = opts.style.display === 'none' ? 'block' : 'none';
    }
};

window.selectPaymentMethod = function (val, text, icon) {
    var hiddenInput = document.getElementById('paymentMethod');
    if (hiddenInput) hiddenInput.value = val;
    var trigger = document.querySelector('.custom-select-trigger');
    if (trigger) {
        trigger.innerHTML = '<div style="display:flex; align-items:center; flex:1;"><img src="' + icon + '" class="payment-icon"> <span>' + text + '</span></div><i class="fas fa-chevron-down" style="font-size: 0.8rem; opacity: 0.7;"></i>';
    }
    var opts = document.getElementById('customSelectOptions');
    if (opts) {
        opts.style.display = 'none';
    }
};

/**
 * فتح نافذة الشراء
 * إذا لم يكن المستخدم مسجلاً، يتم اعتراض العملية وفتح نافذة التسجيل أولاً
 * @param {string} productName - اسم المنتج
 * @param {HTMLElement} btnElement - زر الشراء
 * @param {string} categoryKey - نوع التصنيف (اختياري: vip, iptv, smartApps)
 */
function openModal(productName, btnElement, categoryKey) {
    currentProduct = productName;

    // جلب المدة/السعر من العنصر السابق (select أو input hidden)
    var prev = btnElement ? btnElement.previousElementSibling : null;
    currentDuration = prev ? prev.value : '';

    // تحديد ما إذا كان المنتج من باقات VIP
    var isVip = (categoryKey === 'vip') ||
        (window.location.pathname.indexOf('vip') !== -1) ||
        (productName && (productName.toLowerCase().indexOf('vip') !== -1 || productName.indexOf('مانجو') !== -1 || productName.toLowerCase().indexOf('mango') !== -1));

    // تحديث خيارات طرق الدفع (استثناء الرصيد والكروت لـ VIP)
    updatePaymentMethodsOptions(isVip);

    // تغيير لون حواف صندوق إتمام الطلب بناءً على القسم
    var checkoutModalContent = document.querySelector('#checkoutModal .modal-content');
    if (checkoutModalContent) {
        checkoutModalContent.classList.remove('modal-smart', 'modal-vip');
        if (categoryKey === 'smartApps' || window.location.pathname.indexOf('smart') !== -1) {
            checkoutModalContent.classList.add('modal-smart');
        } else if (isVip) {
            checkoutModalContent.classList.add('modal-vip');
        }
    }

    // === اعتراض: التحقق من تسجيل الدخول عبر Firebase Auth ===
    if (!isUserLoggedIn()) {
        // حفظ عملية الشراء المعلقة لاستكمالها بعد التسجيل
        pendingPurchase = { product: currentProduct, duration: currentDuration, isVip: isVip };
        showToast('يجب تسجيل حسابك أولاً للمتابعة بالشراء', 'info');
        openLoginModal();
        return;
    }

    // المستخدم مسجّل - نقرأ بياناته من currentAuthUser (firebase-config.js)
    var user = getCurrentUser();
    document.getElementById('modalProductName').innerText = currentProduct;
    document.getElementById('modalProductDuration').innerText = currentDuration;
    document.getElementById('checkoutUserName').innerText = (user.firstName || '') + ' ' + (user.lastName || '');
    document.getElementById('checkoutUserPhone').innerText = user.phone || '';
    document.getElementById('loggedInUserInfo').style.display = 'block';

    if (typeof logActivity === 'function') {
        logActivity({
            action: 'checkout_opened',
            category: 'order',
            severity: 'info',
            title: 'بدء طلب شراء: ' + currentProduct,
            details: { product: currentProduct, duration: currentDuration, isVip: isVip }
        });
    }

    document.getElementById('checkoutModal').style.display = 'flex';
}

/**
 * إغلاق نافذة الشراء
 */
function closeModal() {
    document.getElementById('checkoutModal').style.display = 'none';
}

// =============================================
// نظام المصادقة: تسجيل الدخول وإنشاء حساب جديد
// =============================================

/**
 * إظهار أو إخفاء الرقم السري عند الضغط على أيقونة العين
 * @param {string} inputId 
 * @param {HTMLElement} btnElement 
 */
function togglePasswordVisibility(inputId, btnElement) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var icon = btnElement.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

/**
 * التبديل بين واجهتي تسجيل الدخول وحساب جديد داخل النافذة المنبثقة
 * @param {'login'|'register'} tab 
 */
function switchAuthTab(tab) {
    var tabLogin = document.getElementById('tabLoginBtn');
    var tabReg = document.getElementById('tabRegisterBtn');
    var viewLogin = document.getElementById('loginView');
    var viewReg = document.getElementById('registerView');
    var lockoutBanner = document.getElementById('loginLockoutBanner');

    // مسح رسائل الخطأ عند التبديل
    if (typeof clearRegFieldErrors === 'function') clearRegFieldErrors();
    if (typeof closeCityPicker === 'function') closeCityPicker(false);
    var errors = ['loginPhoneError', 'loginPasswordError', 'loginGeneralError', 'regPhoneError', 'regPasswordError', 'regPasswordConfirmError', 'regGeneralError'];
    errors.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.innerText = ''; }
    });

    if (tab === 'login') {
        if (tabLogin) tabLogin.classList.add('active');
        if (tabReg) tabReg.classList.remove('active');
        if (viewLogin) viewLogin.style.display = 'block';
        if (viewReg) viewReg.style.display = 'none';

        if (typeof checkDeviceLockout === 'function') {
            var lockStatus = checkDeviceLockout();
            if (lockStatus.isLocked && lockStatus.remainingSeconds > 0) {
                var btn = document.getElementById('confirmLoginBtn');
                startLockoutCountdown(lockStatus.remainingSeconds, null, btn, lockStatus.formattedDuration, lockStatus.tierIndex);
            }
        }

        setTimeout(function () {
            var input = document.getElementById('loginPhone');
            if (input && !input.disabled) input.focus();
        }, 50);
    } else {
        if (tabReg) tabReg.classList.add('active');
        if (tabLogin) tabLogin.classList.remove('active');
        if (viewReg) viewReg.style.display = 'block';
        if (viewLogin) viewLogin.style.display = 'none';
        if (lockoutBanner) lockoutBanner.style.display = 'none';

        setTimeout(function () {
            var input = document.getElementById('regFirstName');
            if (input) input.focus();
        }, 50);
    }
}
function openLoginModal(defaultTab) {
    var tab = defaultTab || 'login';

    // مسح جميع حقول الإدخال
    var fields = ['loginPhone', 'loginPassword', 'regFirstName', 'regLastName', 'regAge', 'regCity', 'regCityOther', 'regPhone', 'regPassword', 'regPasswordConfirm'];
    fields.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    setupRegistrationPickers();
    var cityLabel = document.getElementById('regCityLabel');
    if (cityLabel) cityLabel.textContent = 'اختر مدينتك';
    var cityBtn = document.getElementById('regCityBtn');
    if (cityBtn) cityBtn.classList.remove('has-value');
    var cityOtherWrap = document.getElementById('regCityOtherWrap');
    if (cityOtherWrap) cityOtherWrap.style.display = 'none';
    closeCityPicker(false);
    clearRegFieldErrors();

    // مسح رسائل الخطأ
    var errors = ['loginPhoneError', 'loginPasswordError', 'loginGeneralError', 'regPhoneError', 'regPasswordError', 'regPasswordConfirmError', 'regGeneralError'];
    errors.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.innerText = ''; }
    });

    var lockoutBanner = document.getElementById('loginLockoutBanner');
    if (lockoutBanner) lockoutBanner.style.display = 'none';

    switchAuthTab(tab);
    document.getElementById('loginModal').style.display = 'flex';

    // الفحص الفوري للحظر المؤقت عند فتح النافذة ومزامنته سحابياً
    if (tab === 'login') {
        if (typeof syncLockoutFromCloud === 'function') {
            syncLockoutFromCloud();
        }
        if (typeof checkDeviceLockout === 'function') {
            var lockStatus = checkDeviceLockout();
            if (lockStatus.isLocked && lockStatus.remainingSeconds > 0) {
                var btn = document.getElementById('confirmLoginBtn');
                startLockoutCountdown(lockStatus.remainingSeconds, null, btn, lockStatus.formattedDuration, lockStatus.tierIndex);
            }
        }
    }
}

/**
 * إغلاق نافذة المصادقة
 */
function closeLoginModal() {
    var modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
    try {
        sessionStorage.removeItem('almezo_redirect_to_player');
        if (window.location.search && window.location.search.includes('auth_required')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (e) { }
}

// إغلاق أي نافذة منبثقة عند النقر خارج المحتوى
window.addEventListener('click', function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        try {
            sessionStorage.removeItem('almezo_redirect_to_player');
            if (window.location.search && window.location.search.includes('auth_required')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) { }
    }
    if (!event.target.closest('.custom-select-wrapper')) {
        var opts = document.getElementById('customSelectOptions');
        if (opts && opts.style.display === 'block') {
            opts.style.display = 'none';
        }
    }
});

// =============================================
// نظام المؤقت التنازلي للحظر المؤقت (Lockout Countdown)
// =============================================
var lockoutCountdownInterval = null;

function formatLockoutSeconds(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if (m >= 60) {
        var h = Math.floor(m / 60);
        var remM = m % 60;
        return h + ' ساعة و ' + remM + ' دقيقة';
    }
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function startLockoutCountdown(remainingSeconds, errEl, btn, formattedDuration, tierIndex) {
    if (lockoutCountdownInterval) {
        clearInterval(lockoutCountdownInterval);
    }

    if (typeof listenToDeviceLockoutUpdates === 'function') {
        listenToDeviceLockoutUpdates();
    }

    var timeLeft = remainingSeconds;
    var durationLabel = formattedDuration || 'دقيقة واحدة';
    var tierNumber = (tierIndex !== undefined ? tierIndex + 1 : 1);

    var phoneInput = document.getElementById('loginPhone');
    var passInput = document.getElementById('loginPassword');
    var bannerEl = document.getElementById('loginLockoutBanner');
    var genErrEl = document.getElementById('loginGeneralError');

    if (genErrEl) { genErrEl.style.display = 'none'; genErrEl.innerText = ''; }
    if (phoneInput) phoneInput.disabled = true;
    if (passInput) passInput.disabled = true;
    if (btn) btn.disabled = true;

    function tick() {
        var currentLock = (typeof checkDeviceLockout === 'function') ? checkDeviceLockout() : { isLocked: true };
        if (!currentLock.isLocked || timeLeft <= 0) {
            clearInterval(lockoutCountdownInterval);
            lockoutCountdownInterval = null;
            if (phoneInput) phoneInput.disabled = false;
            if (passInput) passInput.disabled = false;
            if (bannerEl) {
                bannerEl.style.display = 'block';
                bannerEl.innerHTML = '<div style="background: rgba(76, 175, 80, 0.18); border: 1.5px solid #4caf50; border-radius: 10px; padding: 12px; text-align: center; color: #fff;"><i class="fas fa-unlock-alt" style="color: #69f0ae; font-size: 1.4rem; margin-bottom: 4px; display:block;"></i><div style="font-weight: 800; color: #81c784; font-size: 0.98rem;">انتهت فترة الحظر المؤقت بنجاح</div><div style="font-size: 0.84rem; color: #c8e6c9; margin-top: 3px;">يمكنك الآن إعادة إدخال بياناتك بشكل صحيح لتسجيل الدخول.</div></div>';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> دخول للحساب';
            }
            return;
        }

        var timeStr = formatLockoutSeconds(timeLeft);
        if (bannerEl) {
            bannerEl.style.display = 'block';
            bannerEl.innerHTML = '<div style="background: linear-gradient(135deg, rgba(244, 67, 54, 0.25), rgba(183, 28, 28, 0.45)); border: 1.8px solid #ff1744; box-shadow: 0 0 20px rgba(255, 23, 68, 0.35); border-radius: 10px; padding: 14px 12px; text-align: center; color: #fff;"><div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;"><i class="fas fa-shield-alt fa-shake" style="color:#ff5252; font-size:1.35rem;"></i><strong style="font-size:1.05rem; color:#ff8a80;">حظر أمني مؤقت (المستوى ' + tierNumber + ')</strong></div><div style="font-size:0.86rem; color:#cfd8dc; margin-bottom:8px; line-height:1.4;">تم حظر هذا الجهاز لمدة <strong style="color:#ffd54f;">(' + durationLabel + ')</strong> بسبب تكرار إدخال بيانات خاطئة.</div><div style="display:inline-flex; align-items:center; justify-content:center; gap:8px; background:rgba(0,0,0,0.65); border:1px solid rgba(255,82,82,0.45); padding:6px 18px; border-radius:8px; margin-top:2px;"><i class="fas fa-hourglass-half fa-spin" style="color:#ffb74d; font-size:1.1rem;"></i><span style="font-size:1.35rem; font-family:monospace; font-weight:800; color:#fff; letter-spacing:1.5px;">' + timeStr + '</span></div><div style="font-size:0.75rem; color:#b0bec5; margin-top:6px;">⌛ يفتح النظام وتلغى القيود تلقائياً فور انتهاء العداد.</div></div>';
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-lock"></i> محظور مؤقتاً (' + timeStr + ')';
        }
        timeLeft--;
    }

    tick();
    lockoutCountdownInterval = setInterval(tick, 1000);
}

// =============================================
// معالجة تسجيل الدخول عبر Firebase Authentication
// =============================================

/**
 * يحوّل كود خطأ Firebase Auth إلى رسالة خطأ بالعربية
 * @param {string} code - كود الخطأ من Firebase (مثل 'auth/user-not-found')
 * @returns {string} رسالة خطأ بالعربية
 */
function getAuthErrorMessage(code) {
    switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return '❌ هناك خطأ في رقم الهاتف أو الرقم السري.';
        case 'auth/too-many-requests':
            return '⏳ محاولات كثيرة متتالية. انتظر بضع دقائق ثم حاول مجدداً.';
        case 'auth/weak-password':
            return '❌ الرقم السري ضعيف، استعمل 6 خانات على الأقل.';
        case 'auth/invalid-email':
            return '❌ صيغة رقم الهاتف غير صالحة.';
        case 'auth/user-disabled':
            return '⚠️ تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة.';
        case 'auth/network-request-failed':
            return '❌ تعذر الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت.';
        default:
            return '❌ هناك خطأ في رقم الهاتف أو الرقم السري.';
    }
}

/**
 * معالج زر تسجيل الدخول
 */
async function handleLogin() {
    var phone = toLatinDigits(document.getElementById('loginPhone').value).trim().replace(/\s+/g, '');
    var password = document.getElementById('loginPassword').value.trim();
    var errEl = document.getElementById('loginGeneralError');
    var phoneErrEl = document.getElementById('loginPhoneError');
    var passErrEl = document.getElementById('loginPasswordError');
    var btn = document.getElementById('confirmLoginBtn');
    var bannerEl = document.getElementById('loginLockoutBanner');

    if (errEl) { errEl.style.display = 'none'; errEl.innerText = ''; }
    if (phoneErrEl) { phoneErrEl.style.display = 'none'; phoneErrEl.innerText = ''; }
    if (passErrEl) { passErrEl.style.display = 'none'; passErrEl.innerText = ''; }

    // 1. الفحص الاستباقي للحظر: السيرفر هو المرجع (يشمل الجهاز والـIP والرقم)
    if (typeof serverLoginGuard === 'function') {
        var serverState = await serverLoginGuard('check', phone);
        if (serverState && serverState.locked && serverState.remainingSeconds > 0) {
            startLockoutCountdown(serverState.remainingSeconds, errEl, btn, serverState.formattedDuration, serverState.tierIndex || 0);
            showToast('⛔ الجهاز محظور مؤقتاً من تسجيل الدخول متبقي: ' + formatLockoutSeconds(serverState.remainingSeconds), 'error', 4000);
            return;
        }
    }
    if (typeof checkDeviceLockout === 'function') {
        var lockStatus = checkDeviceLockout();
        if (lockStatus.isLocked && lockStatus.remainingSeconds > 0) {
            startLockoutCountdown(lockStatus.remainingSeconds, errEl, btn, lockStatus.formattedDuration, lockStatus.tierIndex);
            showToast('⛔ الجهاز محظور مؤقتاً من تسجيل الدخول متبقي: ' + formatLockoutSeconds(lockStatus.remainingSeconds), 'error', 4000);

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'lockout_attempt',
                    category: 'security',
                    severity: 'danger',
                    title: '⛔ محاولة دخول أثناء سريان الحظر المؤقت',
                    details: {
                        attemptedPhone: phone || 'غير مدخل',
                        remainingSeconds: lockStatus.remainingSeconds,
                        formattedDuration: lockStatus.formattedDuration,
                        tier: (lockStatus.tierIndex || 0) + 1
                    },
                    userOverride: { phone: phone || '', name: 'محاولة أثناء الحظر' }
                });
            }
            return;
        } else {
            if (bannerEl) {
                bannerEl.style.display = 'none';
                bannerEl.innerHTML = '';
            }
        }
    }

    // التحقق من صحة صيغة الرقم الليبي
    var phoneResult = validateLibyanNumber(phone);
    if (!phoneResult.valid) {
        phoneErrEl.innerText = phoneResult.error;
        phoneErrEl.style.display = 'block';

        // تسجيل المحاولة الخاطئة واحتسابها ضمن سلم الحظر
        var lockResult = { lockedNow: false, attempts: 1, remainingAttempts: 2, tierIndex: 0, formattedDuration: 'دقيقة واحدة', remainingSeconds: 60 };
        if (typeof recordFailedAttemptAndLockout === 'function') {
            lockResult = recordFailedAttemptAndLockout(phone);
        }
        if (typeof serverLoginGuard === 'function') {
            var srv = await serverLoginGuard('fail', phone);
            if (srv) lockResult = Object.assign(lockResult, srv, { lockedNow: !!srv.lockedNow });
        }

        if (lockResult.lockedNow) {
            startLockoutCountdown(lockResult.remainingSeconds, errEl, btn, lockResult.formattedDuration, lockResult.tierIndex);
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'client_locked_out',
                    category: 'security',
                    severity: 'danger',
                    title: '🚨 حظر أمني مؤقت (' + lockResult.formattedDuration + ') بسبب إدخال هاتف خاطئ',
                    details: {
                        attemptedPhone: phone,
                        attempts: 3,
                        tier: lockResult.tierIndex + 1,
                        formattedDuration: lockResult.formattedDuration,
                        reason: phoneResult.error
                    },
                    userOverride: { phone: phone, name: 'جهاز محظور لـ ' + phone }
                });
            }
            showToast('🚨 تم حظر تسجيل الدخول مؤقتاً لمدة ' + lockResult.formattedDuration + '', 'error', 5000);
        } else {
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'login_failed',
                    category: 'security',
                    severity: 'danger',
                    title: '⚠️ محاولة دخول برقم هاتف غير صالح (المحاولة ' + lockResult.attempts + ' من 3)',
                    details: {
                        attemptedPhone: phone,
                        attempts: lockResult.attempts,
                        remainingAttempts: lockResult.remainingAttempts,
                        reason: phoneResult.error
                    },
                    userOverride: { phone: phone, name: 'محاولة دخول لـ ' + phone }
                });
            }
        }
        return;
    }

    // التحقق من إدخال الرقم السري
    var passResult = validatePassword(password);
    if (!passResult.valid) {
        passErrEl.innerText = passResult.error;
        passErrEl.style.display = 'block';

        var lockResultPass = { lockedNow: false, attempts: 1, remainingAttempts: 2, tierIndex: 0, formattedDuration: 'دقيقة واحدة', remainingSeconds: 60 };
        if (typeof recordFailedAttemptAndLockout === 'function') {
            lockResultPass = recordFailedAttemptAndLockout(phone);
        }
        if (typeof serverLoginGuard === 'function') {
            var srvPass = await serverLoginGuard('fail', phone);
            if (srvPass) lockResultPass = Object.assign(lockResultPass, srvPass, { lockedNow: !!srvPass.lockedNow });
        }

        if (lockResultPass.lockedNow) {
            startLockoutCountdown(lockResultPass.remainingSeconds, errEl, btn, lockResultPass.formattedDuration, lockResultPass.tierIndex);
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'client_locked_out',
                    category: 'security',
                    severity: 'danger',
                    title: '🚨 حظر أمني مؤقت (' + lockResultPass.formattedDuration + ') بسبب كلمة سر غير صالحة',
                    details: {
                        attemptedPhone: phone,
                        attempts: 3,
                        tier: lockResultPass.tierIndex + 1,
                        formattedDuration: lockResultPass.formattedDuration,
                        reason: passResult.error
                    },
                    userOverride: { phone: phone, name: 'جهاز محظور لـ ' + phone }
                });
            }
            showToast('🚨 تم حظر تسجيل الدخول مؤقتاً لمدة ' + lockResultPass.formattedDuration + '', 'error', 5000);
        } else {
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'login_failed',
                    category: 'security',
                    severity: 'danger',
                    title: '⚠️ محاولة دخول بكلمة سر قصيرة (المحاولة ' + lockResultPass.attempts + ' من 3)',
                    details: {
                        attemptedPhone: phone,
                        attempts: lockResultPass.attempts,
                        remainingAttempts: lockResultPass.remainingAttempts,
                        reason: passResult.error
                    },
                    userOverride: { phone: phone, name: 'محاولة دخول لـ ' + phone }
                });
            }
        }
        return;
    }

    var originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
    btn.disabled = true;

    try {
        // === تسجيل الدخول عبر Firebase Auth ===
        // يستخدم رقم الهاتف كبريد اصطناعي داخلياً (phoneToSyntheticEmail في firebase-config.js)
        var firebaseUser = await loginWithFirebaseAuth(phone, password);

        // جلب الملف الشخصي من Firestore مباشرةً لتحديث الواجهة فوراً
        var profile = await fetchUserProfile(firebaseUser.uid);
        if (profile) {
            currentAuthUser = profile;
        } else {
            currentAuthUser = { uid: firebaseUser.uid, phone: phone };
        }

        // تصفير الحظر والمحاولات الفاشلة عند النجاح (محلياً وفي السيرفر)
        if (typeof resetDeviceLockout === 'function') {
            resetDeviceLockout();
        }
        if (typeof serverLoginGuard === 'function') serverLoginGuard('success', phone);
        if (lockoutCountdownInterval) {
            clearInterval(lockoutCountdownInterval);
            lockoutCountdownInterval = null;
        }
        try { sessionStorage.removeItem('almezo_failed_login_' + phone); } catch (e) { }

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'login_success',
                category: 'auth',
                severity: 'success',
                title: 'تسجيل دخول ناجح: ' + (currentAuthUser.firstName || phone),
                details: { phone: phone, role: currentAuthUser.role || (currentAuthUser.uid === ADMIN_UID ? 'admin' : 'customer') }
            });
        }

        // تحديث الهيدر وإغلاق النافذة
        updateHeaderLoginState();
        closeLoginModal();

        var firstName = (currentAuthUser && currentAuthUser.firstName) ? currentAuthUser.firstName : 'بك';
        showToast('مرحباً بعودتك ' + firstName + '! 👋 تم تسجيل الدخول بنجاح', 'success');

        // التوجيه التلقائي إلى مشغل الميزو إذا كان الطلب قادماً منه
        if (sessionStorage.getItem('almezo_redirect_to_player') === '1') {
            sessionStorage.removeItem('almezo_redirect_to_player');
            setTimeout(function () {
                window.location.href = 'player.html';
            }, 600);
            return;
        }
        if (pendingPurchase) {
            setTimeout(function () {
                currentProduct = pendingPurchase.product;
                currentDuration = pendingPurchase.duration;
                var isVip = pendingPurchase.isVip;
                pendingPurchase = null;

                updatePaymentMethodsOptions(isVip);

                var user = getCurrentUser();
                document.getElementById('modalProductName').innerText = currentProduct;
                document.getElementById('modalProductDuration').innerText = currentDuration;
                document.getElementById('checkoutUserName').innerText = (user.firstName || '') + ' ' + (user.lastName || '');
                document.getElementById('checkoutUserPhone').innerText = user.phone || '';
                document.getElementById('loggedInUserInfo').style.display = 'block';
                document.getElementById('checkoutModal').style.display = 'flex';
            }, 1000);
        }

        // === استكمال طلب الحساب التجريبي المعلق إن وجد ===
        if (pendingTrial) {
            setTimeout(function () {
                var trial = pendingTrial;
                pendingTrial = null;
                if (typeof requestTrial === 'function') {
                    requestTrial(trial.serverName, trial.categoryKey);
                }
            }, 800);
        }

    } catch (error) {
        btn.innerHTML = originalText;
        btn.disabled = false;

        var errorCode = error ? error.code : '';
        console.warn('⚠️ خطأ تسجيل الدخول (Firebase Auth):', errorCode, error.message);

        // 1. إذا كان الخطأ انقطاع اتصال أو شبكة
        if (errorCode === 'auth/network-request-failed') {
            errEl.innerHTML = '<span style="color:#ff5252; font-size:0.92rem; font-weight:bold; display:inline-block; margin-top:4px;"><i class="fas fa-wifi"></i> تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.</span>';
            errEl.style.display = 'block';
            return;
        }

        // 2. إذا كان الحساب غير مسجل أصلاً في النظام
        if (errorCode === 'auth/user-not-found') {
            errEl.innerHTML = '<span style="color:#ff5252; font-size:0.92rem; font-weight:bold; display:inline-block; margin-top:4px;"><i class="fas fa-user-times"></i> هذا الرقم غير مسجل لدينا. يمكنك إنشاء حساب جديد أولاً.</span>';
            errEl.style.display = 'block';
            return;
        }

        // 3. في حالة كلمة المرور الخاطئة أو البيانات غير المطابقة (Wrong Password / Invalid Credential)
        var lockResult = { lockedNow: false, attempts: 1, remainingAttempts: 2, tierIndex: 0, formattedDuration: 'دقيقة واحدة', durationSeconds: 60, remainingSeconds: 60 };
        if (typeof recordFailedAttemptAndLockout === 'function') {
            lockResult = recordFailedAttemptAndLockout(phone);
        }
        if (typeof serverLoginGuard === 'function') {
            var srv = await serverLoginGuard('fail', phone);
            if (srv) lockResult = Object.assign(lockResult, srv, { lockedNow: !!srv.lockedNow });
        }

        if (lockResult.lockedNow) {
            // تفعيل الحظر المؤقت مع العداد التنازلي الحي
            startLockoutCountdown(lockResult.remainingSeconds, errEl, btn, lockResult.formattedDuration, lockResult.tierIndex);

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'client_locked_out',
                    category: 'security',
                    severity: 'danger',
                    title: '🚨 حظر أمني مؤقت (' + lockResult.formattedDuration + ') لـ ' + phone,
                    details: {
                        attemptedPhone: phone,
                        attempts: 3,
                        tier: lockResult.tierIndex + 1,
                        durationSeconds: lockResult.durationSeconds,
                        formattedDuration: lockResult.formattedDuration,
                        reason: 'تخمين كلمة مرور (Brute-Force)'
                    },
                    userOverride: { phone: phone, name: 'جهاز محظور لـ ' + phone }
                });
            }
            showToast('🚨 تم حظر تسجيل الدخول مؤقتاً لمدة ' + lockResult.formattedDuration + '', 'error', 5000);
        } else {
            // إظهار رسالة الخطأ والمحاولات المتبقية
            errEl.innerHTML = '<span style="color:#ff5252; font-size:0.92rem; font-weight:bold;"><i class="fas fa-times-circle"></i> هناك خطأ في رقم الهاتف أو الرقم السري.</span><br><span style="color:#ffb74d; font-size:0.88rem; font-weight:bold; display:inline-block; margin-top:5px;"><i class="fas fa-exclamation-triangle"></i> متبقي لديك (' + lockResult.remainingAttempts + ') محاولة قبل الحظر المؤقت.</span>';
            errEl.style.display = 'block';

            var lockoutBanner = document.getElementById('loginLockoutBanner');
            if (lockoutBanner) {
                lockoutBanner.style.display = 'none';
                lockoutBanner.innerHTML = '';
            }

            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'login_failed',
                    category: 'security',
                    severity: 'danger',
                    title: '⚠️ محاولة دخول بكلمة سر خاطئة (المحاولة ' + lockResult.attempts + ' من 3)',
                    details: {
                        attemptedPhone: phone,
                        attempts: lockResult.attempts,
                        remainingAttempts: lockResult.remainingAttempts,
                        errorCode: errorCode,
                        reason: 'كلمة سر غير صحيحة'
                    },
                    userOverride: { phone: phone, name: 'محاولة دخول لـ ' + phone }
                });
            }
        }
    }
}

// =============================================
// معالجة تسجيل حساب جديد عبر Firebase Authentication
// =============================================


// =============================================
// نموذج التسجيل: قائمة العمر وقائمة مدن ليبيا
// =============================================
// مدن ليبيا مرتبة من الأشهر (حسب عدد السكان والشهرة) إلى الأقل، ثم "مدينة أخرى" لمن لم يجد مدينته.
var LIBYA_CITIES = [
    'طرابلس', 'بنغازي', 'مصراتة', 'الزاوية', 'البيضاء', 'زليتن', 'الخمس', 'سبها', 'طبرق', 'غريان',
    'ترهونة', 'صبراتة', 'درنة', 'سرت', 'أجدابيا', 'زوارة', 'المرج', 'بني وليد', 'تاجوراء', 'جنزور',
    'الزنتان', 'صرمان', 'العجيلات', 'مسلاتة', 'يفرن', 'نالوت', 'الجميل', 'رقدالين', 'القره بوللي', 'قصر الأخيار',
    'العزيزية', 'السواني', 'قصر بن غشير', 'ورشفانة', 'الماية', 'جادو', 'الرجبان', 'كاباو', 'الأصابعة', 'مزدة',
    'تيجي', 'بدر', 'غدامس', 'درج', 'القلعة', 'ككلة', 'الرياينة', 'الرحيبات', 'بئر الغنم', 'الحرابة',
    'أبوكماش', 'زلطن', 'رأس اجدير', 'تاورغاء', 'الشويرف', 'القريات', 'هون', 'ودان', 'سوكنة', 'زلة',
    'الفقهاء', 'مرادة', 'أوباري', 'مرزق', 'غات', 'براك الشاطئ', 'إدري', 'القرضة', 'تمنهنت', 'سمنو',
    'الزيغن', 'تراغن', 'أم الأرانب', 'القطرون', 'مجدول', 'زويلة', 'تمسة', 'الغريفة', 'جرمة', 'تساوة',
    'الكفرة', 'تازربو', 'ربيانة', 'جالو', 'أوجلة', 'جخرة', 'مرادة', 'البريقة', 'راس لانوف', 'بن جواد',
    'النوفلية', 'الجغبوب', 'القبة', 'شحات', 'سوسة', 'الأبرق', 'مسة', 'قندولة', 'توكرة', 'العقورية',
    'قمينس', 'سلوق', 'الأبيار', 'الرجمة', 'سيدي خليفة', 'بطة', 'عين مارة', 'مرتوبة', 'أم الرزم', 'التميمي',
    'امساعد', 'البردي', 'كمبوت', 'الجبل الأخضر', 'الجفرة', 'الشاطئ', 'وادي الحياة', 'وادي عتبة', 'البوانيس'
].filter(function (c, i, a) { return a.indexOf(c) === i; });
var OTHER_CITY = 'مدينة أخرى';

function toLatinDigits(s) {
    return String(s == null ? '' : s)
        .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}

function normalizeCityText(s) {
    return String(s || '').trim().toLowerCase()
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
}

/** قائمة العمر: "30 سنة - 1996" مع حساب سنة الميلاد من السنة الحالية. */
function fillRegAgeSelect() {
    var sel = document.getElementById('regAge');
    if (!sel || sel.options.length > 1) return;
    var year = new Date().getFullYear();
    var html = '<option value="">اختر عمرك</option>';
    for (var age = 12; age <= 80; age++) {
        html += '<option value="' + age + '">' + age + ' سنة - ' + (year - age) + '</option>';
    }
    sel.innerHTML = html;
}

function renderCityList(filter) {
    var list = document.getElementById('regCityList');
    if (!list) return;
    var q = normalizeCityText(filter);
    var cities = LIBYA_CITIES.filter(function (c) { return !q || normalizeCityText(c).indexOf(q) !== -1; });
    var html = cities.map(function (c) {
        return '<button type="button" class="city-option" data-city="' + c + '">' + c + '</button>';
    }).join('');
    html += '<button type="button" class="city-option city-option-other" data-city="' + OTHER_CITY + '"><i class="fas fa-pen"></i> ' + OTHER_CITY + '</button>';
    if (!cities.length) html = '<div class="city-empty">لا توجد مدينة بهذا الاسم</div>' + html;
    list.innerHTML = html;
}

function openCityPicker() {
    var panel = document.getElementById('regCityPanel');
    if (!panel) return;
    var search = document.getElementById('regCitySearch');
    if (search) search.value = '';
    renderCityList('');
    panel.classList.add('open');
    var first = panel.querySelector('.city-option');
    // التركيز على أول مدينة (لا على البحث) حتى لا يفتح الكيبورد تلقائياً على الهاتف والتلفاز
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { } }, 30);
}

function closeCityPicker(focusBack) {
    var panel = document.getElementById('regCityPanel');
    if (panel) panel.classList.remove('open');
    if (focusBack) {
        var btn = document.getElementById('regCityBtn');
        if (btn) try { btn.focus(); } catch (e) { }
    }
}

function selectCity(city) {
    var hidden = document.getElementById('regCity');
    var label = document.getElementById('regCityLabel');
    var otherWrap = document.getElementById('regCityOtherWrap');
    var btn = document.getElementById('regCityBtn');
    if (!hidden) return;
    hidden.value = city;
    if (label) label.textContent = city;
    if (btn) btn.classList.add('has-value');
    if (otherWrap) otherWrap.style.display = city === OTHER_CITY ? 'block' : 'none';
    var err = document.getElementById('regCityError');
    if (err) { err.style.display = 'none'; err.innerText = ''; }
    closeCityPicker(city !== OTHER_CITY);
    if (city === OTHER_CITY) {
        var other = document.getElementById('regCityOther');
        if (other) setTimeout(function () { try { other.focus(); } catch (e) { } }, 30);
    }
}

/** المدينة المختارة، أو المكتوبة يدوياً عند اختيار "مدينة أخرى". */
function getSelectedCity() {
    var v = (document.getElementById('regCity') || {}).value || '';
    if (v === OTHER_CITY) return ((document.getElementById('regCityOther') || {}).value || '').trim();
    return v;
}

function setupRegistrationPickers() {
    fillRegAgeSelect();
    var btn = document.getElementById('regCityBtn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
        var panel = document.getElementById('regCityPanel');
        if (panel && panel.classList.contains('open')) closeCityPicker(false); else openCityPicker();
    });
    var list = document.getElementById('regCityList');
    if (list) list.addEventListener('click', function (e) {
        var opt = e.target.closest ? e.target.closest('.city-option') : null;
        if (opt) selectCity(opt.getAttribute('data-city'));
    });
    var search = document.getElementById('regCitySearch');
    if (search) search.addEventListener('input', function () { renderCityList(search.value); });
    var panel = document.getElementById('regCityPanel');
    if (panel) panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 4) {
            e.preventDefault();
            e.stopPropagation();
            closeCityPicker(true);
        }
    });
    // الأرقام العربية تظهر إنجليزية فوراً أثناء كتابة رقم الهاتف
    ['regPhone', 'loginPhone'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
            var v = toLatinDigits(el.value);
            if (v !== el.value) el.value = v;
        });
    });
    var age = document.getElementById('regAge');
    if (age) age.addEventListener('change', function () {
        var err = document.getElementById('regAgeError');
        if (err) { err.style.display = 'none'; err.innerText = ''; }
    });
}

function showFieldError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerText = msg;
    el.style.display = 'block';
}

function clearRegFieldErrors() {
    ['regFirstNameError', 'regLastNameError', 'regAgeError', 'regCityError'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.innerText = ''; }
    });
}

/**
 * حساب أُنشئ في Firebase Auth دون ملف شخصي (انقطع الاتصال بعد إنشائه): يُسجَّل الدخول بنفس الرقم
 * السري ويُحفظ الملف. الرقم السري يثبت أنه صاحب الحساب. يعيد true إن اكتمل التسجيل.
 */
async function completeOrphanRegistration(phone, password, userData) {
    var user = await loginWithFirebaseAuth(phone, password);
    var profile = await fetchUserProfile(user.uid);
    if (profile) {
        await logoutUser().catch(function () { });
        return false;
    }
    await saveUserToFirestore(userData, user.uid);
    currentAuthUser = Object.assign({ uid: user.uid }, userData);
    if (typeof sendRegistrationNotification === 'function') sendRegistrationNotification(userData);
    updateHeaderLoginState();
    closeLoginModal();
    showToast('مرحباً ' + userData.firstName + '! تم إكمال تسجيل حسابك بنجاح ✅', 'success');
    if (sessionStorage.getItem('almezo_redirect_to_player') === '1') {
        sessionStorage.removeItem('almezo_redirect_to_player');
        setTimeout(function () { window.location.href = 'player.html'; }, 600);
    }
    return true;
}

/**
 * معالج زر إنشاء حساب جديد
 * يتحقق من صحة البيانات، يُنشئ حساب Firebase Auth،
 * يحفظ الملف الشخصي في Firestore، ثم يُرسل إشعاراً للمدير
 */
async function handleRegistration() {
    var firstName = document.getElementById('regFirstName').value.trim();
    var lastName = document.getElementById('regLastName').value.trim();
    var age = document.getElementById('regAge').value.trim();
    var city = getSelectedCity();
    var phone = toLatinDigits(document.getElementById('regPhone').value).trim().replace(/\s+/g, '');
    var password = document.getElementById('regPassword').value.trim();
    var passwordConfirm = document.getElementById('regPasswordConfirm').value.trim();
    var errEl = document.getElementById('regGeneralError');
    var phoneErrEl = document.getElementById('regPhoneError');
    var passErrEl = document.getElementById('regPasswordError');
    var passConfirmErrEl = document.getElementById('regPasswordConfirmError');

    // مسح رسائل الخطأ السابقة
    errEl.style.display = 'none';
    phoneErrEl.style.display = 'none';
    if (passErrEl) passErrEl.style.display = 'none';
    if (passConfirmErrEl) passConfirmErrEl.style.display = 'none';
    clearRegFieldErrors();

    // === التحقق من جميع الحقول (كل خطأ يظهر تحت خانته) ===
    var nameResult = validateName(firstName);
    if (!nameResult.valid) {
        showFieldError('regFirstNameError', nameResult.error);
        return;
    }

    nameResult = validateName(lastName);
    if (!nameResult.valid) {
        showFieldError('regLastNameError', nameResult.error);
        return;
    }

    var ageResult = validateAge(age);
    if (!ageResult.valid) {
        showFieldError('regAgeError', ageResult.error);
        return;
    }

    var cityResult = validateCity(city);
    if (!cityResult.valid) {
        showFieldError('regCityError', document.getElementById('regCity').value === OTHER_CITY
            ? '❌ اكتب اسم مدينتك (حرفين على الأقل)' : '❌ اختر مدينتك من القائمة');
        return;
    }

    var phoneResult = validateLibyanNumber(phone);
    if (!phoneResult.valid) {
        phoneErrEl.innerText = phoneResult.error;
        phoneErrEl.style.display = 'block';
        return;
    }

    // التحقق من الرقم السري
    var passResult = validatePassword(password);
    if (!passResult.valid) {
        if (passErrEl) {
            passErrEl.innerText = passResult.error;
            passErrEl.style.display = 'block';
        } else {
            errEl.innerText = passResult.error;
            errEl.style.display = 'block';
        }
        return;
    }

    if (password !== passwordConfirm) {
        if (passConfirmErrEl) {
            passConfirmErrEl.innerText = 'كلمتا المرور غير متطابقتين.';
            passConfirmErrEl.style.display = 'block';
        } else {
            errEl.innerText = 'كلمتا المرور غير متطابقتين.';
            errEl.style.display = 'block';
        }
        return;
    }

    var btn = document.getElementById('confirmRegBtn');
    var originalText = btn.innerHTML;
    var userData = null;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
    btn.disabled = true;

    try {
        userData = { firstName, lastName, age, city, phone };

        // === 1. إنشاء حساب Firebase Auth وحفظ الملف الشخصي في Firestore ===
        // registerWithFirebaseAuth في firebase-config.js:
        //   → يحوّل رقم الهاتف إلى بريد اصطناعي
        //   → يستدعي createUserWithEmailAndPassword
        //   → يحفظ الملف في customers/{uid} (بدون كلمة المرور)
        var uid = await registerWithFirebaseAuth(phone, password, userData);

        // === 2. تحديث currentAuthUser فوراً (قبل أن يُطلق onAuthStateChanged) ===
        currentAuthUser = { uid, ...userData };

        // === 3. إرسال إشعار للمدير في الخلفية عبر Cloud Function (بدون كلمة المرور) ===
        if (typeof sendRegistrationNotification === 'function') {
            sendRegistrationNotification(userData);
        }

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'registration',
                category: 'auth',
                severity: 'success',
                title: 'تسجيل حساب عميل جديد: ' + firstName + ' ' + lastName,
                details: { name: firstName + ' ' + lastName, phone: phone, city: city, age: age }
            });
        }

        // === 4. تحديث الهيدر وإغلاق النافذة ===
        updateHeaderLoginState();
        closeLoginModal();

        showToast('مرحباً ' + firstName + '! تم إنشاء حسابك بنجاح ✅', 'success');

        // التوجيه التلقائي إلى مشغل الميزو إذا كان الطلب قادماً منه
        if (sessionStorage.getItem('almezo_redirect_to_player') === '1') {
            sessionStorage.removeItem('almezo_redirect_to_player');
            setTimeout(function () {
                window.location.href = 'player.html';
            }, 600);
            return;
        }
        if (pendingPurchase) {
            setTimeout(function () {
                currentProduct = pendingPurchase.product;
                currentDuration = pendingPurchase.duration;
                var isVip = pendingPurchase.isVip;
                pendingPurchase = null;

                updatePaymentMethodsOptions(isVip);

                var user = getCurrentUser();
                document.getElementById('modalProductName').innerText = currentProduct;
                document.getElementById('modalProductDuration').innerText = currentDuration;
                document.getElementById('checkoutUserName').innerText = (user.firstName || '') + ' ' + (user.lastName || '');
                document.getElementById('checkoutUserPhone').innerText = user.phone || '';
                document.getElementById('loggedInUserInfo').style.display = 'block';
                document.getElementById('checkoutModal').style.display = 'flex';
            }, 1200);
        }

        // === استكمال طلب الحساب التجريبي المعلق إن وجد ===
        if (pendingTrial) {
            setTimeout(function () {
                var trial = pendingTrial;
                pendingTrial = null;
                if (typeof requestTrial === 'function') {
                    requestTrial(trial.serverName, trial.categoryKey);
                }
            }, 1000);
        }

    } catch (error) {
        // تحويل أكواد خطأ Firebase إلى رسائل عربية
        if (error.code === 'auth/email-already-in-use') {
            // الحساب موجود: قد يكون تسجيلاً سابقاً انقطع قبل حفظ البيانات. بنفس الرقم السري نكمله.
            var completed = false;
            try { completed = await completeOrphanRegistration(phone, password, userData); } catch (e2) { }
            if (completed) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
            phoneErrEl.innerText = '⚠️ هذا الرقم مسجل مسبقاً يرجى التبديل لتسجيل الدخول.';
            phoneErrEl.style.display = 'block';
        } else {
            errEl.innerText = getAuthErrorMessage(error.code);
            errEl.style.display = 'block';
        }
        console.error('خطأ التسجيل (Firebase Auth):', error.code, error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// =============================================
// ربط الأحداث بعد تحميل الصفحة
// =============================================
document.addEventListener('DOMContentLoaded', function () {

    // ملاحظة: لا نستدعي updateHeaderLoginState() هنا يدوياً.
    // مستمع onAuthStateChanged في firebase-config.js يتولى ذلك تلقائياً
    // عند كل تحميل للصفحة (سواء كان المستخدم مسجلاً أم لا).

    // ربط زر تسجيل الدخول
    var loginBtn = document.getElementById('confirmLoginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // ربط زر إنشاء الحساب
    var regBtn = document.getElementById('confirmRegBtn');
    if (regBtn) {
        regBtn.addEventListener('click', handleRegistration);
    }

    // دعم الضغط على Enter في حقل هاتف تسجيل الدخول وحقل الرقم السري
    var loginPhoneInput = document.getElementById('loginPhone');
    if (loginPhoneInput) {
        loginPhoneInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var passInput = document.getElementById('loginPassword');
                if (passInput && !passInput.value) {
                    passInput.focus();
                } else {
                    handleLogin();
                }
            }
        });
        loginPhoneInput.addEventListener('input', function () {
            var errEl = document.getElementById('loginPhoneError');
            if (errEl) errEl.style.display = 'none';
        });
    }

    var loginPassInput = document.getElementById('loginPassword');
    if (loginPassInput) {
        loginPassInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
        loginPassInput.addEventListener('input', function () {
            var errEl = document.getElementById('loginPasswordError');
            if (errEl) errEl.style.display = 'none';
        });
    }

    // التحقق الفوري من رقم الهاتف أثناء كتابة تسجيل الحساب
    var regPhoneInput = document.getElementById('regPhone');
    if (regPhoneInput) {
        regPhoneInput.addEventListener('input', function () {
            var result = validateLibyanNumber(this.value);
            var errEl = document.getElementById('regPhoneError');

            if (this.value.length > 0 && !result.valid) {
                errEl.innerText = result.error;
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
            }
        });
    }

    var regPassInput = document.getElementById('regPassword');
    if (regPassInput) {
        regPassInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegistration();
            }
        });
        regPassInput.addEventListener('input', function () {
            var errEl = document.getElementById('regPasswordError');
            if (errEl) errEl.style.display = 'none';
        });
    }
});

// =============================================
// حالة التحميل (Loading Spinner)
// =============================================
window.showLoadingState = function () {
    if (isDataLoadedFromFirestore) return;
    const spinnerHtml = '<div class="spinner-container" style="text-align:center; padding: 50px 0; grid-column: 1/-1; width: 100%;"><i class="fas fa-spinner fa-spin fa-3x" style="color: var(--green-accent);"></i><p style="margin-top:15px; color:var(--text-secondary); font-weight: bold;">جاري جلب البيانات بأقصى سرعة...</p></div>';

    const containers = ['vip-container', 'smart-container', 'iptv-container', 'plans-container'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.innerHTML.trim() === '') {
            el.innerHTML = spinnerHtml;
        }
    });
};
document.addEventListener("DOMContentLoaded", showLoadingState);

// =============================================
// إدارة الموظفين للمدير
// =============================================

window.openStaffManagementModal = function () {
    // إزالة النافذة إذا كانت موجودة مسبقاً
    const existingModal = document.getElementById('staffManagementModal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
        <div id="staffManagementModal" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 400px; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 25px;">
                <span class="close-btn" onclick="document.getElementById('staffManagementModal').remove()" style="cursor: pointer; float: left; font-size: 24px; color: var(--text-secondary);">&times;</span>
                <h3 style="color: var(--text-primary); margin-bottom: 20px;"><i class="fas fa-users" style="color: var(--blue-accent);"></i> إدارة الموظفين</h3>
                
                <div class="form-group" style="margin-bottom: 20px; text-align: right;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-secondary);">رقم هاتف المستخدم</label>
                    <input type="text" id="staffPhoneInput" placeholder="أدخل رقم الهاتف..." style="width: 100%; padding: 10px; border-radius: 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary);">
                </div>

                <div style="display: flex; gap: 10px;">
                    <button id="btnPromoteStaff" class="btn-primary" style="flex: 1; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; transition: 0.3s; font-weight: bold;">ترقية إلى مندوب</button>
                    <button id="btnDemoteStaff" class="btn-primary" style="flex: 1; padding: 10px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; transition: 0.3s; font-weight: bold;">إلغاء الصلاحية</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('btnPromoteStaff').addEventListener('click', () => handleStaffRoleChange('staff'));
    document.getElementById('btnDemoteStaff').addEventListener('click', () => handleStaffRoleChange('user'));
}

async function handleStaffRoleChange(newRole) {
    const phoneInput = document.getElementById('staffPhoneInput').value.trim();
    if (!phoneInput) {
        if (typeof showToast === 'function') showToast('يرجى إدخال رقم الهاتف', 'error');
        return;
    }

    try {
        const querySnapshot = await db.collection('customers').where('phone', '==', phoneInput).get();
        if (querySnapshot.empty) {
            if (typeof showToast === 'function') showToast('لم يتم العثور على مستخدم بهذا الرقم', 'error');
            return;
        }

        // بما أن رقم الهاتف يجب أن يكون فريداً، نأخذ أول نتيجة
        const userDoc = querySnapshot.docs[0];

        await db.collection('customers').doc(userDoc.id).update({
            role: newRole
        });

        if (typeof logActivity === 'function') {
            const userName = userDoc.data().name || userDoc.data().firstName || phoneInput;
            const roleTitle = newRole === 'staff' ? 'ترقية إلى مندوب (Staff)' : 'إلغاء صلاحية مندوب';
            logActivity({
                action: 'admin_change_staff_role',
                category: 'admin',
                severity: newRole === 'staff' ? 'success' : 'warning',
                title: 'تغيير صلاحيات الحساب: ' + userName + ' ➔ ' + roleTitle,
                details: { targetUid: userDoc.id, targetPhone: phoneInput, newRole: newRole, targetName: userName }
            });
        }

        const successMessage = newRole === 'staff' ? 'تمت ترقية المستخدم إلى مندوب بنجاح' : 'تم إلغاء صلاحية المندوب بنجاح';
        if (typeof showToast === 'function') showToast(successMessage, 'success');
        document.getElementById('staffPhoneInput').value = '';

    } catch (err) {
        console.error('Error updating role:', err);
        if (typeof showToast === 'function') showToast('حدث خطأ أثناء التحديث', 'error');
    }
}

// =========================================================================
// نظام التثبيت الذكي متعدد المنصات (Smart Multi-Platform Install System)
// يكتشف نوع جهاز الزائر: Android -> APK | Windows -> EXE | iOS -> Safari Guide
// =========================================================================
(function initSmartInstallBanner() {
    const installContainer = document.getElementById('pwa-install-container');
    const installBtn = document.getElementById('pwa-install-btn');
    const closeBtn = document.getElementById('pwa-close-btn');

    // 1. فحص هل المستخدم داخل تطبيق مثبت بالفعل (أندرويد / كمبيوتر / ملف محلي)
    const isNativeApp = (window.AlMeZ0App && window.AlMeZ0App.isNative) ||
        !!(window.electronAPI && window.electronAPI.isElectron) ||
        !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.location.protocol === 'file:' ||
        window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;

    // ملاحظة: تسجيل الـ Service Worker يتم بالفعل في index.html — لا داعي لتكراره هنا

    if (!installContainer || !installBtn) return;

    if (isNativeApp) {
        installContainer.style.setProperty('display', 'none', 'important');
        if (installContainer.parentNode) {
            installContainer.parentNode.removeChild(installContainer);
        }
        return;
    }

    // 2. (تمت إزالة التحقق من sessionStorage — الصندوق يظهر دائماً عند تحميل/ريفرش الصفحة)

    // 3. دالة فحص منصة ونظام تشغيل جهاز الزائر بدقة
    function detectVisitorPlatform() {
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        const platform = navigator.platform || '';

        // أجهزة أندرويد (هواتف، تابلت، أجهزة تلفزيون ذكية)
        if (/android/i.test(ua)) return 'android';

        // أجهزة آبل (iPhone, iPad, iPod)
        if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';

        // أجهزة الكمبيوتر (Windows)
        if (/Win(dows|32|64|NT)/i.test(ua) || /Win/i.test(platform)) return 'windows';

        // أجهزة ماك
        if (/Mac|Macintosh/i.test(ua)) return 'mac';

        return 'other';
    }

    const currentPlatform = detectVisitorPlatform();
    const titleEl = installContainer.querySelector('.pwa-install-title');
    const descEl = installContainer.querySelector('.pwa-install-desc');

    // روابط التحميل المباشرة للتطبيقات من مستودع التنزيلات العام الآمن
    const DOWNLOAD_URLS = {
        android: 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.apk',
        windows: 'https://github.com/almezo/ALmEz0-Downloads/releases/latest/download/ALmEz0.exe'
    };

    // 4. تخصيص محتوى وأزرار الصندوق فورياً حسب جهاز الزائر
    if (currentPlatform === 'android') {
        if (titleEl) titleEl.innerText = 'تطبيق سيرفرات الميزو للأندرويد';
        if (descEl) descEl.innerText = 'قم بتنزيل ملف (ALmEz0.apk) للوصول المباشر ومشاهدة القنوات';
        installBtn.innerHTML = '<i class="fab fa-android"></i> تثبيت التطبيق (APK)';
    } else if (currentPlatform === 'windows') {
        if (titleEl) titleEl.innerText = 'برنامج سيرفرات الميزو للكمبيوتر';
        if (descEl) descEl.innerText = 'قم بتنزيل مثبت الويندوز (ALmEz0.exe) لتشغيل سلس ومباشر';
        installBtn.innerHTML = '<i class="fab fa-windows"></i> تثبيت البرنامج (EXE)';
    } else if (currentPlatform === 'ios') {
        if (titleEl) titleEl.innerText = 'تطبيق سيرفرات الميزو للايفون';
        if (descEl) descEl.innerText = 'أضف التطبيق للشاشة الرئيسية على أجهزة آبل بنقرة واحدة';
        installBtn.innerHTML = '<i class="fab fa-apple"></i> تثبيت التطبيق (iOS)';
    } else {
        if (titleEl) titleEl.innerText = 'تطبيق سيرفرات الميزو - ALmEz0';
        if (descEl) descEl.innerText = 'قم بتنزيل التطبيق للوصول السريع والمباشر';
        installBtn.innerHTML = '<i class="fas fa-download"></i> تثبيت التطبيق';
    }

    // دالة بدء تنزيل الملف مع إشعار للمستخدم
    function triggerDownload(url, filename, message) {
        if (typeof showToast === 'function') {
            showToast(message, 'success', 6000);
        } else if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'bottom-end',
                icon: 'success',
                title: message,
                showConfirmButton: false,
                timer: 5000
            });
        }

        // تنزيل مباشر متوافق مع كافة المتصفحات وبرنامج Downloader على أجهزة TV Box
        try {
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                if (link.parentNode) link.parentNode.removeChild(link);
            }, 5000);
        } catch (e) { }

        // توجيه فوري للملف لضمان التقاط برنامج Downloader أو متصفحات TV Box للرابط وبدء التنزيل تلقائياً
        setTimeout(() => {
            try {
                window.location.href = url;
            } catch (err) { }
        }, 200);

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'app_download',
                category: 'visitor',
                severity: 'success',
                title: `تنزيل تطبيق: ${filename}`,
                details: { filename: filename, url: url }
            });
        }
    }

    // دالة عرض النافذة المنبثقة الإرشادية لأجهزة آبل أو المتصفحات غير الداعمة
    function showPlatformModal(type) {
        let overlay = document.getElementById('pwa-fallback-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pwa-fallback-overlay';
            overlay.className = 'pwa-fallback-overlay';
            document.body.appendChild(overlay);
        }

        if (type === 'ios') {
            overlay.innerHTML = `
                <div class="pwa-fallback-modal" dir="rtl">
                    <div class="pwa-fallback-icon" style="color: #ffffff;"><i class="fab fa-apple"></i></div>
                    <h3 class="pwa-fallback-title">تثبيت التطبيق على آيفون وآيباد</h3>
                    <div class="pwa-fallback-desc" style="text-align: right; line-height: 2; margin: 15px 0 25px; font-size: 0.95rem;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                            <span style="background: #4caf50; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; flex-shrink: 0;">1</span>
                            <span>اضغط على زر المشاركة <i class="fas fa-share-square" style="color: #38bdf8;"></i> في شريط Safari بالأسفل.</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                            <span style="background: #4caf50; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; flex-shrink: 0;">2</span>
                            <span>مرر للأسفل واختر <b>إضافة إلى الشاشة الرئيسية</b> <i class="far fa-plus-square" style="color: #4caf50;"></i></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="background: #4caf50; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; flex-shrink: 0;">3</span>
                            <span>اضغط على <b>إضافة (Add)</b> في أعلى الشاشة للتشغيل كبرنامج.</span>
                        </div>
                    </div>
                    <button class="pwa-fallback-close-btn" id="pwa-fallback-close">حسناً، فهمت</button>
                </div>
            `;
        } else {
            overlay.innerHTML = `
                <div class="pwa-fallback-modal" dir="rtl">
                    <div class="pwa-fallback-icon"><i class="fas fa-info-circle"></i></div>
                    <h3 class="pwa-fallback-title">تثبيت التطبيق</h3>
                    <p class="pwa-fallback-desc">متصفحك لا يدعم التنزيل التلقائي، أرجو فتح الموقع عبر متصفح Chrome واختيار "إضافة إلى الشاشة الرئيسية" (Add to Home Screen) من قائمة المتصفح.</p>
                    <button class="pwa-fallback-close-btn" id="pwa-fallback-close">حسناً، فهمت</button>
                </div>
            `;
        }

        const modalClose = document.getElementById('pwa-fallback-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 300);
            });
        }

        setTimeout(() => overlay.classList.add('active'), 10);
    }

    // 5. حدث الضغط على زر التثبيت الذكي
    installBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (currentPlatform === 'android') {
            triggerDownload(
                DOWNLOAD_URLS.android,
                'ALmEz0.apk',
                '📥 جاري تنزيل تطبيق أندرويد (ALmEz0.apk)... إذا ظهر لك تنبيه اضغط "تنزيل على أي حال".'
            );
        } else if (currentPlatform === 'windows') {
            triggerDownload(
                DOWNLOAD_URLS.windows,
                'ALmEz0.exe',
                '📥 جاري بدء تنزيل برنامج الكمبيوتر (ALmEz0.exe)...'
            );
        } else if (currentPlatform === 'ios') {
            showPlatformModal('ios');
        } else {
            // باقي الأنظمة: تجربة PWA أولاً إذا كانت مدعومة
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installContainer.style.setProperty('display', 'none', 'important');
                }
                window.deferredPrompt = null;
            } else {
                showPlatformModal('general');
            }
        }
    });

    // 6. حدث زر إغلاق الصندوق (X)
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // إخفاء الصندوق فقط في هذه الصفحة — عند الريفرش سيعود تلقائياً
            installContainer.style.setProperty('display', 'none', 'important');
        });
    }
})();

// =========================================================
// تنبيه انقطاع الإنترنت اللحظي (Live Offline / Online Toast Banner)
// =========================================================
(function initLiveNetworkStatusNotifier() {
    let offlineBanner = null;

    function createBanner() {
        if (offlineBanner) return offlineBanner;
        offlineBanner = document.createElement('div');
        offlineBanner.id = 'almezo-offline-toast';
        offlineBanner.className = 'almezo-network-toast';
        offlineBanner.style.cssText = `
            position: fixed;
            top: 18px;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            z-index: 9999999;
            background: linear-gradient(135deg, rgba(20, 25, 34, 0.96), rgba(12, 15, 22, 0.96));
            border: 1px solid rgba(239, 68, 68, 0.45);
            border-radius: 18px;
            padding: 12px 22px;
            display: flex;
            align-items: center;
            gap: 14px;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 18px rgba(239, 68, 68, 0.25);
            -webkit-backdrop-filter: blur(12px);
            backdrop-filter: blur(12px);
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
            opacity: 0;
            pointer-events: auto;
            direction: rtl;
        `;
        document.body.appendChild(offlineBanner);
        return offlineBanner;
    }

    function showOfflineNotification() {
        const b = createBanner();
        b.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        b.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 18px rgba(239, 68, 68, 0.25)';
        b.innerHTML = `
            <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(239, 68, 68, 0.18); display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 16px; flex-shrink: 0;">
                <i class="fas fa-wifi" style="opacity:0.5"></i>
            </div>
            <div style="display: flex; flex-direction: column; text-align: right;">
                <span style="font-size: 14px; font-weight: 700; color: #ffffff;">لا يوجد اتصال بالإنترنت</span>
                <span style="font-size: 12px; color: #9da0a6; font-weight: 400;">يرجى التحقق من الشبكة للمتابعة</span>
            </div>
            <button onclick="window.location.reload()" style="margin-right: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-redo-alt" style="font-size: 11px;"></i> إعادة المحاولة
            </button>
        `;
        b.style.opacity = '1';
        b.style.transform = 'translateX(-50%) translateY(0)';
    }

    function showOnlineNotification() {
        if (!offlineBanner) return;
        offlineBanner.style.borderColor = 'rgba(34, 197, 94, 0.5)';
        offlineBanner.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 18px rgba(34, 197, 94, 0.25)';
        offlineBanner.innerHTML = `
            <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(34, 197, 94, 0.18); display: flex; align-items: center; justify-content: center; color: #22c55e; font-size: 16px; flex-shrink: 0;">
                <i class="fas fa-wifi"></i>
            </div>
            <div style="display: flex; flex-direction: column; text-align: right;">
                <span style="font-size: 14px; font-weight: 700; color: #ffffff;">تم استعادة الاتصال بالإنترنت</span>
                <span style="font-size: 12px; color: #86efac; font-weight: 400;">أنت متصل بالإنترنت الآن بنجاح</span>
            </div>
        `;
        setTimeout(() => {
            if (offlineBanner) {
                offlineBanner.style.opacity = '0';
                offlineBanner.style.transform = 'translateX(-50%) translateY(-100px)';
            }
        }, 3200);
    }

    window.addEventListener('offline', showOfflineNotification);
    window.addEventListener('online', showOnlineNotification);

    if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showOfflineNotification);
        } else {
            showOfflineNotification();
        }
    }
})();

// شبكة أمان: أي alert متبقٍّ في صفحات الموقع يظهر بنافذة الموقع المصمّمة لا بتصميم المتصفح
// أو ويندوز أو أندرويد. لا انتقال بعد أي alert في الموقع، فعدم توقّف التنفيذ لا يضر.
window.alert = function (message) { window.showAlert(message); };
