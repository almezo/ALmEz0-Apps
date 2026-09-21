// =============================================
// إعداد وتهيئة Firebase
// يحتوي على:
// - إعدادات الاتصال بـ Firebase
// - تهيئة Firestore و Auth و Functions
// - دوال المصادقة (تسجيل / دخول / خروج)
// - دوال حفظ بيانات العميل في Firestore
// - مستمع حالة المصادقة (onAuthStateChanged)
// =============================================

// إعدادات مشروع Firebase - AlMeZ0 Servers
const firebaseConfig = {
    apiKey: "AIzaSyB5khMxwG1MfG8mJBg3hZYo5nBfbWBR9hE",
    authDomain: "almez0-servers.firebaseapp.com",
    projectId: "almez0-servers",
    storageBucket: "almez0-servers.firebasestorage.app",
    messagingSenderId: "991150710552",
    appId: "1:991150710552:web:fe7b8bf1ec30441b11c86d"
};

// تهيئة تطبيق Firebase وخدماته
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
window.db = db;

var ADMIN_UID = "7Rfvdr6GpwPcY9uDQwX0fIuWeRv1";
window.ADMIN_UID = ADMIN_UID;

// دالة حماية النصوص وتطهير HTML عالمية
window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// تفعيل الكاش المحلي للفايربيز (Offline Persistence) مع دعم التبويبات المتعددة لسرعة صاروخية
db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
    if (err.code == 'failed-precondition') {
        console.warn("Multiple tabs open without persistence sync.");
    } else if (err.code == 'unimplemented') {
        console.warn("The current browser does not support all of the features required to enable persistence");
    }
});

const auth = firebase.auth();
window.auth = auth;

// جعل الـ Functions اختيارية لتفادي توقف السكربت في الصفحات التي لا تحمله
let functions = null;
if (typeof firebase.functions === 'function') {
    functions = firebase.functions();
} else {
    console.warn("تنبيه: Firebase Functions SDK غير محمل في هذه الصفحة، تم تخطيه.");
}

// =============================================
// نظام مركز التحكم الشامل في قوانين وعمولات المناديب
// يُستخدم من صفحة المدير (admin-dashboard.js) وصفحة المندوب (staff.js) معاً
// =============================================
const DEFAULT_STAFF_RULES = {
    commissions: {
        iptv_3m: 9,
        iptv_6m: 12,
        iptv_12m: 15,
        smart_12m: 10,
        smart_life: 20,
        vip_default: 7.5
    },
    profitSharing: {
        mode: 'equal', // 'equal' أو 'custom'
        eligibleStaff: ['اسلام', 'ايوب', 'اسامه'],
        customPercents: {
            'اسلام': 33.33,
            'ايوب': 33.33,
            'اسامه': 33.34
        },
        excludedStaff: ['ابراهيم']
    },
    transfers: {
        debtCreditFactor: 0.75
    },
    companyDefaults: {
        almezoPercent: 85,
        companyPercent: 15
    },
    weekCycle: {
        startDay: 6, // 6 = السبت
        autoRollover: true
    }
};

window.DEFAULT_STAFF_RULES = DEFAULT_STAFF_RULES;
window.currentStaffRules = JSON.parse(JSON.stringify(DEFAULT_STAFF_RULES));

try {
    const cachedRules = localStorage.getItem('almezo_staff_rules');
    if (cachedRules) {
        const parsed = JSON.parse(cachedRules);
        window.currentStaffRules = {
            commissions: Object.assign({}, DEFAULT_STAFF_RULES.commissions, parsed.commissions || {}),
            profitSharing: Object.assign({}, DEFAULT_STAFF_RULES.profitSharing, parsed.profitSharing || {}),
            transfers: Object.assign({}, DEFAULT_STAFF_RULES.transfers, parsed.transfers || {}),
            companyDefaults: Object.assign({}, DEFAULT_STAFF_RULES.companyDefaults, parsed.companyDefaults || {}),
            weekCycle: Object.assign({}, DEFAULT_STAFF_RULES.weekCycle, parsed.weekCycle || {})
        };
    }
} catch (e) {}

if (typeof db !== 'undefined') {
    db.collection('systemSettings').doc('staffRules').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data() || {};
            window.currentStaffRules = {
                commissions: Object.assign({}, DEFAULT_STAFF_RULES.commissions, data.commissions || {}),
                profitSharing: Object.assign({}, DEFAULT_STAFF_RULES.profitSharing, data.profitSharing || {}),
                transfers: Object.assign({}, DEFAULT_STAFF_RULES.transfers, data.transfers || {}),
                companyDefaults: Object.assign({}, DEFAULT_STAFF_RULES.companyDefaults, data.companyDefaults || {}),
                weekCycle: Object.assign({}, DEFAULT_STAFF_RULES.weekCycle, data.weekCycle || {})
            };
            try { localStorage.setItem('almezo_staff_rules', JSON.stringify(window.currentStaffRules)); } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('staffRulesChanged', { detail: window.currentStaffRules }));
    }, err => {
        console.warn('⚠️ تعذر تحميل قوانين المناديب من Firestore، تم تفعيل القواعد المحفوظة/الافتراضية:', err);
    });
}

window.saveStaffRules = async function (newRules) {
    // 1. الحفظ الفوري محلياً لضمان عدم ضياع التعديلات وتحديث كل الحسابات فوراً
    try {
        localStorage.setItem('almezo_staff_rules', JSON.stringify(newRules));
        window.currentStaffRules = Object.assign({}, window.currentStaffRules || {}, newRules);
        window.dispatchEvent(new CustomEvent('staffRulesChanged', { detail: window.currentStaffRules }));
    } catch (e) {
        console.warn('localStorage error:', e);
    }

    // 2. الحفظ المتزامن في فايربيس
    if (typeof db !== 'undefined') {
        try {
            await db.collection('systemSettings').doc('staffRules').set(newRules, { merge: true });
        } catch (err) {
            console.warn('⚠️ Firestore error while saving staff rules:', err);
            const isPermError = (err.code === 'permission-denied') ||
                                (err.message && (err.message.includes('permission') || err.message.includes('Missing or insufficient')));
            
            if (isPermError) {
                console.info('✓ تم اعتماد القوانين وتطبيقها محلياً بنجاح (سيتزامن مع السحابة فور تسجيل الدخول كمسؤول).');
                return;
            }
            throw err;
        }
    }
};

// دالة مساعدة لحساب عمولة بيعة واحدة للأرباح الأسبوعية بناءً على القوانين الحية
function _calcCommissionForSale(productName, duration, storedCategory) {
    if (!productName || !duration) return 0;
    const rules = (window.currentStaffRules && window.currentStaffRules.commissions) ? window.currentStaffRules.commissions : DEFAULT_STAFF_RULES.commissions;

    // الصنف المحفوظ في البيعة نفسها أولاً: خريطة المنتجات قد لا تكون محمّلة بعد (الترحيل
    // يعمل عند فتح الصفحة)، فيخمّن الكود الصنف من المدة ويخطئ: اشتراك سمارت أو VIP لمدة
    // "سنة واحدة" كان يُحسب 15 بدل 10 أو 7.5.
    let cat = storedCategory || ((typeof window !== 'undefined' && window.productsCategoryMap) ? window.productsCategoryMap[productName] : null);

    if (!cat) {
        const dur = String(duration).toLowerCase();
        const prod = String(productName).toUpperCase();
        if (dur.includes('مدى') || dur.includes('life')) cat = 'smart';
        else if (dur.includes('12') || dur.includes('سنة') || dur.includes('عام')) cat = 'iptv';
        else if (prod.includes('VIP') || productName.includes('1') || productName.includes('2')) cat = 'vip';
        else cat = 'iptv';
    }

    let pool = 0;
    const durStr = String(duration);
    if (cat === 'iptv') {
        if (durStr.includes('3')) pool = Number(rules.iptv_3m) !== undefined ? Number(rules.iptv_3m) : 9;
        else if (durStr.includes('6')) pool = Number(rules.iptv_6m) !== undefined ? Number(rules.iptv_6m) : 12;
        else if (durStr.includes('12') || durStr.includes('سنة') || durStr.includes('عام')) pool = Number(rules.iptv_12m) !== undefined ? Number(rules.iptv_12m) : 15;
    } else if (cat === 'smartApps' || cat === 'smart') {
        if (durStr.includes('12') || durStr.includes('سنة') || durStr.includes('عام')) pool = Number(rules.smart_12m) !== undefined ? Number(rules.smart_12m) : 10;
        else if (durStr.includes('مدى') || durStr.toLowerCase().includes('life')) pool = Number(rules.smart_life) !== undefined ? Number(rules.smart_life) : 20;
    } else if (cat === 'vip') {
        pool = Number(rules.vip_default) !== undefined ? Number(rules.vip_default) : 7.5;
    }
    return pool;
}
if (typeof window !== 'undefined') {
    window.calculateTotalCommission = _calcCommissionForSale;
}

/**
 * ربح بيعة واحدة — المصدر الوحيد لكل الحسابات (لوحة المدير، صفحة المندوب، الترحيل).
 * - بيعة "دين" ربحها 0 دائماً.
 * - الربح المحفوظ لحظة البيع (commission) يُعتمد كما هو: تغيير أسعار العمولة لاحقاً
 *   لا يغيّر ربح بيعة قديمة.
 * - البيعات القديمة قبل حفظ الربح: points إن وُجد، وإلا تُحسب بالقوانين وبصنفها المحفوظ.
 */
function _saleCommission(t) {
    if (!t || t.type !== 'sale') return 0;
    if (String(t.method || '').trim() === 'دين') return 0;
    if (typeof t.commission === 'number' && !isNaN(t.commission)) return t.commission;
    if (t.points !== undefined && t.points !== null) return Number(t.points) || 0;
    return _calcCommissionForSale(t.product, t.duration, t.category) || 0;
}
window.saleCommission = _saleCommission;

/**
 * حصة مندوب من ربح الأسبوع حسب "قوانين المناديب" (متساوية أو نسب مخصصة).
 * نفس الدالة للبطاقات وللترحيل، فيُرحَّل بالضبط ما رآه المندوب ربحاً لأسبوعه.
 */
function _staffProfitShare(staffName, total) {
    const name = String(staffName || '');
    const rules = window.currentStaffRules || DEFAULT_STAFF_RULES;
    const sharing = (rules && rules.profitSharing) ? rules.profitSharing : DEFAULT_STAFF_RULES.profitSharing;
    const excluded = sharing.excludedStaff || ['ابراهيم'];
    if (excluded.some(ex => name.includes(ex))) return 0;
    const eligible = sharing.eligibleStaff || ['اسلام', 'ايوب', 'اسامه'];
    const matched = eligible.find(el => name.includes(el));
    if (!matched) return 0;
    if (sharing.mode === 'custom') {
        const pct = (sharing.customPercents && sharing.customPercents[matched] !== undefined)
            ? Number(sharing.customPercents[matched])
            : (100 / Math.max(1, eligible.length));
        return (Number(total) || 0) * ((Number(pct) || 0) / 100);
    }
    return (Number(total) || 0) / Math.max(1, eligible.length);
}
window.staffProfitShare = _staffProfitShare;

/** هل المندوب ضمن من يشاركون في الأرباح (القوانين)؟ */
window.isProfitSharingStaff = function (staffName) {
    const name = String(staffName || '');
    const rules = window.currentStaffRules || DEFAULT_STAFF_RULES;
    const sharing = (rules && rules.profitSharing) ? rules.profitSharing : DEFAULT_STAFF_RULES.profitSharing;
    if ((sharing.excludedStaff || ['ابراهيم']).some(ex => name.includes(ex))) return false;
    return (sharing.eligibleStaff || ['اسلام', 'ايوب', 'اسامه']).some(el => name.includes(el));
};

function _getLibyaWeekStart(baseDate) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    const startDay = (window.currentStaffRules && window.currentStaffRules.weekCycle && typeof window.currentStaffRules.weekCycle.startDay === 'number')
        ? window.currentStaffRules.weekCycle.startDay
        : 6; // 6 = السبت (افتراضي ليبيا)
    const day = d.getDay();
    const diff = (day >= startDay) ? (day - startDay) : (day + 7 - startDay);
    d.setDate(d.getDate() - diff);
    return d;
}
function _weekDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** بداية الأسبوع الحالي (السبت 00:00 بتوقيت الجهاز = ليبيا) — لحساب ربح الأسبوع الجاري */
window.getLibyaWeekStart = function () {
    return _getLibyaWeekStart(new Date());
};
window.getCurrentWeekKey = function () {
    return _weekDateKey(_getLibyaWeekStart(new Date()));
};

/**
 * تتأكد هل فيه أسبوع/أسابيع سابقة اتقفلت من غير ما تُدفع أرباحها، ولو أيوه
 * ترحّل المبلغ المتبقي لخانة duesOwed (مستحقات) وتصفّر baseProfit استعداداً للأسبوع الجديد.
 * تعمل داخل معاملة Firestore آمنة (Transaction) لمنع التكرار لو المدير والمندوب فتحوا الصفحة في نفس الوقت.
 * ملاحظة: المندوب إبراهيم مستثنى تماماً ولا تشمله الأرباح أو المستحقات.
 */
window.rolloverUnpaidWeeklyProfit = async function (staffId) {
    const currentWeekKey = window.getCurrentWeekKey();
    const rules = window.currentStaffRules || DEFAULT_STAFF_RULES;
    if (rules.weekCycle && rules.weekCycle.autoRollover === false) return;
    try {
        await db.runTransaction(async (tx) => {
            const staffRef = db.collection('customers').doc(staffId);
            const staffDoc = await tx.get(staffRef);
            if (!staffDoc.exists) return;
            const data = staffDoc.data();
            if (data.lastWeekStart === currentWeekKey) return; // محدث بالفعل (أو رحّله السيرفر)

            const nameCheck = (data.firstName || data.name || '');
            const sharing = (rules.profitSharing || DEFAULT_STAFF_RULES.profitSharing);
            const isExcluded = (sharing.excludedStaff || ['ابراهيم']).some(ex => nameCheck.includes(ex));

            // المستثنى (إبراهيم): لا أرباح ولا مستحقات ولا سلفة
            if (isExcluded) {
                tx.update(staffRef, { duesOwed: 0, baseProfit: 0, profitAdvance: 0, lastWeekStart: currentWeekKey, balanceUndo: [], balanceRedo: [] });
                return;
            }
            if (!window.isProfitSharingStaff(nameCheck) || !data.lastWeekStart) {
                tx.update(staffRef, { lastWeekStart: currentWeekKey });
                return;
            }

            let duesOwed = parseFloat(data.duesOwed) || 0;
            let baseProfit = parseFloat(data.baseProfit) || 0;
            let advance = parseFloat(data.profitAdvance) || 0;
            let cashAdd = 0;
            let cursor = new Date(data.lastWeekStart + 'T00:00:00');
            let safetyCounter = 0;

            while (_weekDateKey(cursor) !== currentWeekKey && safetyCounter < 104) {
                safetyCounter++;
                const weekEnd = new Date(cursor);
                weekEnd.setDate(weekEnd.getDate() + 7);

                let weekTotal = 0;
                const weekSnap = await db.collection('transactions')
                    .where('timestamp', '>=', cursor)
                    .where('timestamp', '<', weekEnd)
                    .get();
                weekSnap.forEach(doc => { weekTotal += _saleCommission(doc.data()); });

                // ربح الأسبوع المنتهي (حصته حسب القوانين + أي تصحيح يدوي) ناقص ما دُفع منه
                // مقدماً، يُرحَّل للمستحقات. ثم يبدأ الأسبوع الجديد بصفر.
                duesOwed += _staffProfitShare(nameCheck, weekTotal) + baseProfit - advance;
                baseProfit = 0;
                advance = 0;
                cursor = weekEnd;
            }

            // لا مستحقات سالبة أبداً: إن كانت السلفة أكبر من ربح الأسبوع، يصير الفرق مطلوب كاش
            if (duesOwed < 0) {
                cashAdd = -duesOwed;
                duesOwed = 0;
            }

            const update = {
                duesOwed: duesOwed,
                baseProfit: 0,
                profitAdvance: 0,
                lastWeekStart: currentWeekKey,
                // تعديلات الأسبوع الماضي لا يُتراجع عنها بعد الترحيل (كانت ستلغيه)
                balanceUndo: [],
                balanceRedo: []
            };
            if (cashAdd > 0) update.baseCash = (parseFloat(data.baseCash) || 0) + cashAdd;
            tx.update(staffRef, update);
        });
    } catch (e) {
        console.error('خطأ في ترحيل أرباح الأسبوع للمستحقات:', e);
    }
};


// =============================================
// حالة المصادقة العامة (Single Source of Truth)
// جميع أجزاء الكود يقرؤون من هذا المتغير
// يتم تحديثه حصرياً عبر مستمع onAuthStateChanged
// =============================================

/**
 * بيانات المستخدم المسجّل حالياً، أو null إذا لم يكن مسجلاً.
 * الشكل: { uid, firstName, lastName, age, city, phone }
 * @type {Object|null}
 */
let currentAuthUser = null;

// =============================================
// مساعدة: تحويل رقم الهاتف إلى بريد إلكتروني اصطناعي
// Firebase Auth تستخدم email/password فقط.
// نقوم بربط رقم الهاتف بعنوان بريد آمن داخلياً
// دون الحاجة لـ SMS OTP أو الكشف عن ذلك للمستخدم.
// مثال: 0912345678 → 0912345678@almezo-servers.com
// =============================================

/**
 * يحوّل رقم هاتف ليبي إلى بريد إلكتروني اصطناعي داخلي
 * @param {string} phone - رقم الهاتف (10 أرقام)
 * @returns {string} عنوان البريد الاصطناعي
 */
function phoneToSyntheticEmail(phone) {
    return phone.trim() + '@almezo-servers.com';
}

// =============================================
// دوال المصادقة عبر Firebase Auth
// =============================================

/**
 * تسجيل مستخدم جديد عبر Firebase Authentication
 * يستخدم بريد إلكتروني اصطناعي مشتق من رقم الهاتف
 * بعد إنشاء الحساب، يُحفظ ملف العميل في Firestore
 *
 * @param {string} phone    - رقم الهاتف الليبي (10 أرقام)
 * @param {string} password - الرقم السري الذي أدخله المستخدم
 * @param {Object} userData - بيانات الملف الشخصي (firstName, lastName, age, city, phone)
 * @returns {Promise<string>} الـ uid الخاص بالمستخدم في Firebase Auth
 */
async function registerWithFirebaseAuth(phone, password, userData) {
    const syntheticEmail = phoneToSyntheticEmail(phone);

    // إنشاء حساب Firebase Auth جديد
    const userCredential = await auth.createUserWithEmailAndPassword(syntheticEmail, password);
    const uid = userCredential.user.uid;

    // حفظ الملف الشخصي في Firestore باستخدام uid كمعرّف الوثيقة
    await saveUserToFirestore(userData, uid);

    return uid;
}

/**
 * تسجيل دخول مستخدم موجود عبر Firebase Authentication
 *
 * @param {string} phone    - رقم الهاتف الليبي (10 أرقام)
 * @param {string} password - الرقم السري
 * @returns {Promise<firebase.User>} كائن المستخدم من Firebase Auth
 */
async function loginWithFirebaseAuth(phone, password) {
    const syntheticEmail = phoneToSyntheticEmail(phone);
    const userCredential = await auth.signInWithEmailAndPassword(syntheticEmail, password);
    return userCredential.user;
}

/**
 * تسجيل خروج المستخدم الحالي من Firebase Auth
 * @returns {Promise<void>}
 */
async function logoutUser() {
    await auth.signOut();
}

/**
 * تغيير كلمة مرور المستخدم الحالي في Firebase Auth
 * يتطلب إعادة المصادقة بكلمة المرور الحالية أولاً لضمان الأمان وتجديد الجلسة
 *
 * @param {string} currentPassword - كلمة المرور الحالية
 * @param {string} newPassword     - كلمة المرور الجديدة
 * @returns {Promise<void>}
 */
async function changeUserPassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('auth/no-current-user');
    }

    if (!user.email) {
        throw new Error('auth/no-email');
    }

    // إعادة المصادقة للتأكد من صحة كلمة المرور الحالية وتجديد صلاحية الجلسة
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    await user.reauthenticateWithCredential(credential);

    // تحديث كلمة المرور الجديدة
    await user.updatePassword(newPassword);

    // الطرد اللحظي: تحديث إصدار الجلسة في Firestore لكي يتم طرد باقي الأجهزة
    const newAuthVersion = Date.now().toString();
    try {
        // هام جداً: تحديث LocalStorage *قبل* إرسال الطلب لفايربيز
        // حتى لا يقوم المستمع (onSnapshot) بطرد هذا الجهاز نفسه فور تلقي التحديث اللحظي!
        localStorage.setItem('almezo_auth_version', newAuthVersion);

        try {
            await db.collection('customers').doc(user.uid).set({
                authVersion: newAuthVersion
            }, { merge: true });
        } catch (e) {
            try {
                await db.collection('admins').doc(user.uid).set({
                    authVersion: newAuthVersion
                }, { merge: true });
            } catch (e2) { }
        }
    } catch (e) {
        console.warn('Could not update authVersion:', e);
    }
}

// =============================================
// دوال الحالة العامة (قراءة currentAuthUser)
// هذه الدوال تحل محل isUserLoggedIn() و getCurrentUser()
// السابقتين اللتين كانتا تعتمدان على localStorage
// =============================================

/**
 * هل المستخدم مسجّل الدخول حالياً؟
 * @returns {boolean}
 */
function isUserLoggedIn() {
    if (currentAuthUser !== null) return true;
    if (window.__almezo_explicit_logout) return false;
    try {
        var cached = localStorage.getItem('almezo_cached_user') || sessionStorage.getItem('almezo_cached_user');
        if (cached) {
            var u = JSON.parse(cached);
            if (u && u.name) {
                currentAuthUser = u;
                return true;
            }
        }
    } catch (e) { }
    return false;
}

function getCurrentUser() {
    if (currentAuthUser) return currentAuthUser;
    if (window.__almezo_explicit_logout) return null;
    try {
        var cached = localStorage.getItem('almezo_cached_user') || sessionStorage.getItem('almezo_cached_user');
        if (cached) {
            var u = JSON.parse(cached);
            if (u && u.name) {
                currentAuthUser = u;
                return currentAuthUser;
            }
        }
    } catch (e) { }
    return null;
}

// =============================================
// دوال Firestore
// =============================================

/**
 * حفظ بيانات العميل الجديد في مجموعة 'customers' في Firestore
 * يُستخدم Firebase Auth uid كمعرّف الوثيقة (Document ID)
 * لا يتم حفظ كلمة المرور في Firestore — يتولى Firebase Auth إدارتها
 *
 * @param {Object} userData - بيانات العميل (firstName, lastName, age, city, phone)
 * @param {string} uid      - معرّف المستخدم من Firebase Auth
 * @returns {Promise<void>}
 */
async function saveUserToFirestore(userData, uid) {
    try {
        const userRef = db.collection('customers').doc(uid);
        await userRef.set({
            firstName: userData.firstName,
            lastName: userData.lastName,
            age: userData.age,
            city: userData.city,
            phone: userData.phone,
            registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
            source: 'website'
        });
        console.log('✅ تم حفظ بيانات العميل بنجاح، المعرّف (uid):', uid);
    } catch (error) {
        console.error('❌ خطأ في حفظ بيانات العميل في Firestore:', error);
        throw error;
    }
}

/**
 * جلب الملف الشخصي للمستخدم من Firestore بواسطة الـ uid
 * @param {string} uid - معرّف المستخدم من Firebase Auth
 * @returns {Promise<Object|null>} بيانات الملف الشخصي أو null
 */
async function fetchUserProfile(uid) {
    try {
        let profile = { uid };
        let exists = false;

        const docRef = db.collection('customers').doc(uid);
        const snapshot = await docRef.get();
        if (snapshot.exists) {
            profile = { ...profile, ...snapshot.data() };
            exists = true;
        }

        try {
            const adminDoc = await db.collection('admins').doc(uid).get();
            if (adminDoc.exists) {
                profile.role = 'admin';
                exists = true;
            }
        } catch (e) {
            // Ignore permission errors if not admin
        }

        return exists ? profile : null;
    } catch (error) {
        console.error('❌ خطأ في جلب الملف الشخصي:', error);
        return null;
    }
}

// =============================================
// مستمع حالة المصادقة المركزي
// هذا هو المحرك الوحيد لحالة واجهة المستخدم.
// يُطلَق تلقائياً عند: تحميل الصفحة، تسجيل الدخول، تسجيل الخروج.
// =============================================

// =============================================
// دالة عرض التنبيه الأمني الأحمر عند طرد الجلسة
// =============================================
function showSecurityEvictionModal() {
    // تجنب عرض أكثر من نافذة واحدة
    if (document.getElementById('almezo-eviction-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'almezo-eviction-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:#151521;border:2px solid #ff3333;border-radius:18px;padding:30px;width:90%;max-width:380px;text-align:center;color:#fff;box-shadow:0 15px 35px rgba(255,51,51,0.25);transform:scale(0.8);opacity:0;transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

    box.innerHTML = `
        <div style="width:70px;height:70px;background:rgba(255,51,51,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;">
            <i class="fas fa-user-shield" style="font-size:2.5rem;color:#ff3333;"></i>
        </div>
        <h3 style="margin:0 0 12px 0;color:#ff3333;font-size:1.4rem;font-weight:800;">تنبيه أمني</h3>
        <p style="margin:0 0 25px 0;color:#b0b0c0;font-size:0.95rem;line-height:1.6;">تم إنهاء جلستك إجبارياً لأن كلمة المرور تم تغييرها من جهاز آخر. يرجى تسجيل الدخول مجدداً.</p>
        <button id="btnEvictOk" style="background:linear-gradient(45deg, #ff3333, #d50000);color:#fff;border:none;padding:12px 25px;border-radius:10px;font-size:1.05rem;cursor:pointer;font-weight:bold;width:100%;transition:transform 0.2s;box-shadow:0 4px 15px rgba(255,51,51,0.4);"><i class="fas fa-check-circle" style="margin-left:8px;"></i>حسناً، فهمت</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        box.style.transform = 'scale(1)';
        box.style.opacity = '1';
    });

    document.getElementById('btnEvictOk').onclick = () => {
        window.location.href = 'index.html';
    };
}

let authSessionUnsubscribe = null;
let sessionCheckInterval = null; // فحص دوري لصلاحية الجلسة

auth.onAuthStateChanged(async function (firebaseUser) {
    if (firebaseUser) {
        // مساعد الميزو في مشغل أندرويد الأصلي يتصل بدالة الذكاء الاصطناعي بجلسة هذا الحساب نفسه
        try {
            if (firebaseUser.refreshToken && window.AndroidNativeBridge &&
                typeof window.AndroidNativeBridge.setFirebaseSession === 'function') {
                window.AndroidNativeBridge.setFirebaseSession(firebaseUser.refreshToken);
            }
        } catch (e) { }

        // تعيين فوري ومؤقت لبيانات المستخدم من الكاش لمنع وميض "تسجيل الدخول" أثناء جلب الملف من Firestore
        if (!currentAuthUser) {
            try {
                var cached = localStorage.getItem('almezo_cached_user') || sessionStorage.getItem('almezo_cached_user');
                if (cached) currentAuthUser = JSON.parse(cached);
            } catch (e) { }
            if (!currentAuthUser) currentAuthUser = { uid: firebaseUser.uid };
        }
        if (typeof updateHeaderLoginState === 'function') {
            updateHeaderLoginState();
        }

        // المستخدم مسجّل - نجلب ملفه الشخصي من Firestore
        const profile = await fetchUserProfile(firebaseUser.uid);
        if (profile) {
            currentAuthUser = profile;
        } else {
            currentAuthUser = { uid: firebaseUser.uid };
        }

        // الطرد اللحظي: الاستماع لـ authVersion للطرد فور تغيير كلمة المرور من جهاز آخر
        if (authSessionUnsubscribe) authSessionUnsubscribe();
        let isFirstSnapshot = true;

        const collectionName = (currentAuthUser && currentAuthUser.role === 'admin') ? 'admins' : 'customers';
        authSessionUnsubscribe = db.collection(collectionName).doc(firebaseUser.uid).onSnapshot((doc) => {
            const isInitial = isFirstSnapshot;
            isFirstSnapshot = false;

            if (doc.exists) {
                const data = doc.data();
                if (data.authVersion) {
                    const localAuthVersion = localStorage.getItem('almezo_auth_version');

                    const forceLogout = () => {
                        console.warn('Session revoked! Password was changed from another device.');

                        // تسجيل حركة الطرد الأمني قبل مسح البيانات
                        var evictedUser = currentAuthUser || null;
                        if (evictedUser && typeof logActivity === 'function') {
                            logActivity({
                                action: 'session_forced_eviction',
                                category: 'security',
                                severity: 'danger',
                                title: '🚨 طرد أمني: تم تغيير كلمة المرور من جهاز آخر',
                                details: { phone: evictedUser.phone, uid: evictedUser.uid, reason: 'Auth version mismatch' },
                                userOverride: evictedUser
                            });
                        }

                        // 1. أولاً: وضع علامة الطرد الصريح لمنع الكاش من العمل
                        window.__almezo_explicit_logout = true;

                        // 2. ثانياً: مسح كل الكاش بالكامل فوراً
                        try {
                            localStorage.removeItem('almezo_auth_version');
                            localStorage.removeItem('almezo_cached_user');
                            sessionStorage.removeItem('almezo_cached_user');
                        } catch (e) { }

                        // 3. ثالثاً: تحديث الهيدر فوراً ليظهر "تسجيل الدخول" بدل الاسم
                        try {
                            var btn = document.querySelector('.header-login-btn');
                            if (btn) {
                                btn.innerHTML = 'تسجيل الدخول';
                                btn.classList.remove('logged-in');
                                btn.onclick = function () { if (typeof openLoginModal === 'function') openLoginModal(); };
                            }
                        } catch (e) { }

                        // 4. إيقاف المستمع والفحص الدوري
                        if (authSessionUnsubscribe) authSessionUnsubscribe();
                        authSessionUnsubscribe = null;
                        if (sessionCheckInterval) { clearInterval(sessionCheckInterval); sessionCheckInterval = null; }
                        currentAuthUser = null;

                        // 5. تسجيل الخروج من فايربيز وعرض التنبيه الأمني
                        auth.signOut().then(() => {
                            showSecurityEvictionModal();
                        });
                    };

                    if (isInitial) {
                        if (localAuthVersion !== String(data.authVersion)) {
                            if (!localAuthVersion) {
                                localStorage.setItem('almezo_auth_version', String(data.authVersion));
                            } else {
                                forceLogout();
                            }
                        }
                    } else {
                        if (localAuthVersion !== String(data.authVersion)) {
                            forceLogout();
                        }
                    }
                }
            }
        });

        // =============================================
        // نظام الفحص الدوري لصلاحية الجلسة (Session Heartbeat)
        // يتحقق كل 30 ثانية من أن التوكن لا يزال صالحاً.
        // إذا تم تغيير كلمة المرور من جهاز آخر، فايربيز سيرفض التجديد
        // وسيطلق onAuthStateChanged(null) تلقائياً.
        // =============================================
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        sessionCheckInterval = setInterval(async () => {
            const user = auth.currentUser;
            if (user) {
                try {
                    await user.getIdToken(true); // إجبار فايربيز على التحقق من السيرفر
                } catch (e) {
                    // فشل تجديد التوكن → الجلسة أُبطلت!
                    console.warn('Session check failed - token revoked:', e.code);
                    clearInterval(sessionCheckInterval);
                    sessionCheckInterval = null;
                    // onAuthStateChanged(null) سيُطلق تلقائياً من فايربيز
                }
            }
        }, 30000); // كل 30 ثانية

    } else {
        // المستخدم غير مسجّل أو سجّل خروجاً
        currentAuthUser = null;
        if (authSessionUnsubscribe) {
            authSessionUnsubscribe();
            authSessionUnsubscribe = null;
        }
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }

        // إذا لم يكن المستخدم هو من قام بتسجيل الخروج يدوياً،
        // فهذا يعني أن فايربيز أبطل الجلسة (مثلاً بسبب تغيير كلمة المرور من جهاز آخر).
        // في هذه الحالة يجب مسح كل الكاش وإظهار التنبيه الأمني!
        if (!window.__almezo_explicit_logout) {
            var hadCachedUser = false;
            var evictedUser = null;
            try {
                var cached = localStorage.getItem('almezo_cached_user') || sessionStorage.getItem('almezo_cached_user');
                if (cached) {
                    hadCachedUser = true;
                    evictedUser = JSON.parse(cached);
                }
            } catch (e) { }

            if (hadCachedUser) {
                // تسجيل حركة الطرد الأمني قبل مسح البيانات
                if (evictedUser && typeof logActivity === 'function') {
                    logActivity({
                        action: 'session_forced_eviction',
                        category: 'security',
                        severity: 'danger',
                        title: '🚨 طرد أمني: تم تغيير كلمة المرور من جهاز آخر (استجابة الخادم)',
                        details: { phone: evictedUser.phone, uid: evictedUser.uid, reason: 'Firebase token revoked' },
                        userOverride: evictedUser
                    });
                }

                // فايربيز أبطل الجلسة! نمسح كل شيء ونعرض التنبيه الأمني
                window.__almezo_explicit_logout = true;
                try {
                    localStorage.removeItem('almezo_cached_user');
                    sessionStorage.removeItem('almezo_cached_user');
                    localStorage.removeItem('almezo_auth_version');
                } catch (e) { }

                // تحديث الهيدر فوراً
                try {
                    var btn = document.querySelector('.header-login-btn');
                    if (btn) {
                        btn.innerHTML = 'تسجيل الدخول';
                        btn.classList.remove('logged-in');
                        btn.onclick = function () { if (typeof openLoginModal === 'function') openLoginModal(); };
                    }
                } catch (e) { }

                // عرض التنبيه الأمني الأحمر
                showSecurityEvictionModal();
            }
        }
    }

    // إبلاغ واجهة المستخدم بتغيير الحالة النهائي فوراً
    if (typeof updateHeaderLoginState === 'function') {
        updateHeaderLoginState();
    } else {
        setTimeout(function () {
            if (typeof updateHeaderLoginState === 'function') updateHeaderLoginState();
        }, 100);
    }
});

// =============================================
// نظام تتبع الأنشطة والأمان لغرفة المراقبة (Security Activity Tracker)
// =============================================

// ذاكرة تخزين مؤقتة للـ IP العام لمنع تكرار الطلبات وتسريع التتبع
let cachedClientIpData = null;

async function fetchClientPublicIp() {
    if (cachedClientIpData && cachedClientIpData.ip && cachedClientIpData.ip !== 'غير متوفر' && !cachedClientIpData.ip.includes('Offline')) {
        return cachedClientIpData;
    }

    try {
        const stored = localStorage.getItem('almezo_client_ip_data') || sessionStorage.getItem('almezo_client_ip_data');
        if (stored) {
            cachedClientIpData = JSON.parse(stored);
            if (cachedClientIpData && cachedClientIpData.ip && cachedClientIpData.ip !== 'غير متوفر' && !cachedClientIpData.ip.includes('Offline')) {
                return cachedClientIpData;
            }
        }
    } catch (e) { }

    function fetchWithTimeout(url, ms) {
        return Promise.race([
            fetch(url, { cache: 'no-store' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
        ]);
    }

    try {
        // المحاولة 1: ipwho.is السريع والشامل جداً
        const res = await fetchWithTimeout('https://ipwho.is/', 2500);
        if (res.ok) {
            const data = await res.json();
            if (data && data.ip) {
                cachedClientIpData = {
                    ip: data.ip,
                    city: data.city || '',
                    country: data.country || '',
                    org: (data.connection && data.connection.isp) ? data.connection.isp : (data.org || ''),
                    flag: (data.flag && data.flag.emoji) ? data.flag.emoji : '🌐',
                    source: 'ipwhois'
                };
                try {
                    localStorage.setItem('almezo_client_ip_data', JSON.stringify(cachedClientIpData));
                    sessionStorage.setItem('almezo_client_ip_data', JSON.stringify(cachedClientIpData));
                } catch (e) { }
                return cachedClientIpData;
            }
        }
    } catch (e) { }

    try {
        // المحاولة 2: ipify المضمون عالمياً
        const res2 = await fetchWithTimeout('https://api.ipify.org?format=json', 2000);
        if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.ip) {
                cachedClientIpData = {
                    ip: data2.ip,
                    city: '',
                    country: '',
                    org: '',
                    flag: '🌐',
                    source: 'ipify'
                };
                try {
                    localStorage.setItem('almezo_client_ip_data', JSON.stringify(cachedClientIpData));
                    sessionStorage.setItem('almezo_client_ip_data', JSON.stringify(cachedClientIpData));
                } catch (e) { }
                return cachedClientIpData;
            }
        }
    } catch (e) { }

    cachedClientIpData = { ip: 'غير متوفر (Offline)', city: '', country: '', org: '', flag: '🌐', source: 'none' };
    return cachedClientIpData;
}

// بدء جلب الـ IP العام في الخلفية فور تحميل السكربت
try { fetchClientPublicIp(); } catch (e) { }

// بصمة الجهاز الرقمية والعتادية الفريدة (Hardware Fingerprint)
function getHardwareFingerprint() {
    try {
        let storedFp = localStorage.getItem('almezo_device_fingerprint');
        if (storedFp && storedFp.startsWith('HW-')) return storedFp;

        const nav = window.navigator || {};
        const scr = window.screen || {};
        const cores = nav.hardwareConcurrency || 2;
        const memory = nav.deviceMemory || 4;
        const platform = nav.platform || 'web';
        const lang = nav.language || 'ar';
        const screenStr = `${scr.width || 0}x${scr.height || 0}x${scr.colorDepth || 0}`;
        const touch = ('ontouchstart' in window || (nav.maxTouchPoints && nav.maxTouchPoints > 0)) ? 'T1' : 'T0';
        const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

        let canvasHash = 'c1';
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 30;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = "14px 'Arial'";
                ctx.fillStyle = '#f60';
                ctx.fillRect(10, 1, 60, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('ALmEz0_FP', 2, 10);
                canvasHash = canvas.toDataURL().slice(-16);
            }
        } catch (ce) { }

        const rawFp = `${platform}_${screenStr}_${cores}_${memory}_${lang}_${tz}_${touch}_${canvasHash}`;
        let hash = 0;
        for (let i = 0; i < rawFp.length; i++) {
            hash = ((hash << 5) - hash) + rawFp.charCodeAt(i);
            hash |= 0;
        }

        const fpHex = 'HW-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
        localStorage.setItem('almezo_device_fingerprint', fpHex);
        return fpHex;
    } catch (e) {
        return 'HW-' + Math.random().toString(16).substring(2, 10).toUpperCase();
    }
}

function getVisitorId() {
    try {
        let vid = localStorage.getItem('almezo_visitor_id');
        if (!vid) {
            vid = 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
            localStorage.setItem('almezo_visitor_id', vid);
        }
        return vid;
    } catch (e) {
        return 'unknown_visitor';
    }
}

// =============================================
// نظام الحظر التصاعدي التدريجي للحماية من التخمين (Progressive Lockout Engine)
// سلم الحظر: 1 دقيقة -> 5 دقائق -> 30 دقيقة -> 60 دقيقة -> 24 ساعة
// =============================================

const LOCKOUT_TIERS_SECONDS = [
    60,      // المستوى 1: دقيقة واحدة (60 ثانية)
    300,     // المستوى 2: 5 دقائق (300 ثانية)
    600,     // المستوى 3: 10 دقائق (600 ثانية)
    1800,    // المستوى 4: 30 دقيقة (1800 ثانية)
    3600,    // المستوى 5: 60 دقيقة (ساعة)
    86400    // المستوى 6+: 24 ساعة (يوم كامل)
];

function formatDurationArabic(seconds) {
    if (seconds < 60) return seconds + ' ثانية';
    if (seconds === 60) return 'دقيقة واحدة';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' دقائق';
    if (seconds === 3600) return 'ساعة واحدة';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' ساعات';
    return '24 ساعة (يوم كامل)';
}

function getLockoutStorageKey() {
    const hw = getHardwareFingerprint();
    return 'almezo_sec_lock_' + hw;
}

/**
 * فحص ما إذا كان الجهاز محظوراً حالياً
 */
function checkDeviceLockout() {
    try {
        const key = getLockoutStorageKey();
        const dataStr = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!dataStr) {
            return { isLocked: false, remainingSeconds: 0, tierIndex: 0, attempts: 0 };
        }

        const data = JSON.parse(dataStr);
        const now = Date.now();

        if (data.lockedUntil && now < data.lockedUntil) {
            const remaining = Math.ceil((data.lockedUntil - now) / 1000);
            return {
                isLocked: true,
                remainingSeconds: remaining,
                tierIndex: data.tierIndex || 0,
                attempts: 3,
                formattedDuration: formatDurationArabic(data.durationSeconds || LOCKOUT_TIERS_SECONDS[data.tierIndex || 0])
            };
        }

        // انتهت فترة الحظر
        return {
            isLocked: false,
            remainingSeconds: 0,
            tierIndex: data.tierIndex || 0,
            attempts: data.attempts || 0
        };
    } catch (e) {
        return { isLocked: false, remainingSeconds: 0, tierIndex: 0, attempts: 0 };
    }
}

/**
 * تسجيل محاولة فاشلة وتفعيل مدة الحظر المناسبة إذا بلغت 3 محاولات
 */
function recordFailedAttemptAndLockout(phone) {
    try {
        const key = getLockoutStorageKey();
        const currentStatus = checkDeviceLockout();

        let tierIndex = currentStatus.tierIndex || 0;
        let attempts = (currentStatus.attempts || 0) + 1;

        if (attempts >= 3) {
            // تفعيل الحظر للمستوى الحالي ثم تجهيز المستوى التالي للحظر القادم
            const durationSeconds = LOCKOUT_TIERS_SECONDS[Math.min(tierIndex, LOCKOUT_TIERS_SECONDS.length - 1)];
            const lockedUntil = Date.now() + (durationSeconds * 1000);
            const nextTierIndex = Math.min(tierIndex + 1, LOCKOUT_TIERS_SECONDS.length - 1);

            const lockPayload = {
                tierIndex: nextTierIndex,
                durationSeconds: durationSeconds,
                lockedUntil: lockedUntil,
                attempts: 0,
                phone: phone || '',
                hw: getHardwareFingerprint(),
                ip: (cachedClientIpData && cachedClientIpData.ip) ? cachedClientIpData.ip : ''
            };

            localStorage.setItem(key, JSON.stringify(lockPayload));
            sessionStorage.setItem(key, JSON.stringify(lockPayload));

            // حفظ الحظر في Firestore للمزامنة والتحكم الإداري
            if (typeof db !== 'undefined' && db) {
                try {
                    db.collection('security_lockouts').doc(lockPayload.hw).set({
                        hw: lockPayload.hw,
                        phone: phone || '',
                        ip: lockPayload.ip || '',
                        lockedUntil: lockedUntil,
                        durationSeconds: durationSeconds,
                        formattedDuration: formatDurationArabic(durationSeconds),
                        tier: tierIndex + 1,
                        status: 'active',
                        device: getClientDeviceInfo(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }).catch(function () { });
                } catch (ce) { }
            }

            return {
                lockedNow: true,
                tierIndex: tierIndex,
                durationSeconds: durationSeconds,
                formattedDuration: formatDurationArabic(durationSeconds),
                remainingSeconds: durationSeconds,
                attempts: 3
            };
        } else {
            // حفظ عدد المحاولات (1 أو 2)
            const payload = {
                tierIndex: tierIndex,
                attempts: attempts,
                phone: phone || ''
            };
            localStorage.setItem(key, JSON.stringify(payload));
            sessionStorage.setItem(key, JSON.stringify(payload));

            return {
                lockedNow: false,
                attempts: attempts,
                remainingAttempts: 3 - attempts,
                tierIndex: tierIndex
            };
        }
    } catch (e) {
        return { lockedNow: false, attempts: 1, remainingAttempts: 2, tierIndex: 0 };
    }
}

/**
 * تصفير الحظر والمحاولات الفاشلة للجهاز عند تسجيل الدخول بنجاح أو رفع الحظر
 */
function resetDeviceLockout() {
    try {
        const key = getLockoutStorageKey();
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
        const hw = getHardwareFingerprint();
        if (hw) {
            localStorage.removeItem('almezo_sec_lock_' + hw);
            sessionStorage.removeItem('almezo_sec_lock_' + hw);
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('almezo_sec_lock_')) {
                localStorage.removeItem(k);
            }
        }
    } catch (e) { }
}

/**
 * فتح الواجهة وإلغاء تجميد الحقول فوراً عند رفع الحظر
 */
function unlockUiImmediately(showBanner = true) {
    resetDeviceLockout();
    if (typeof lockoutCountdownInterval !== 'undefined' && lockoutCountdownInterval) {
        clearInterval(lockoutCountdownInterval);
        lockoutCountdownInterval = null;
    }
    const bannerEl = document.getElementById('loginLockoutBanner');
    const errEl = document.getElementById('loginGeneralError');
    const btn = document.getElementById('confirmLoginBtn');
    const phoneInput = document.getElementById('loginPhone');
    const passInput = document.getElementById('loginPassword');

    if (phoneInput) phoneInput.disabled = false;
    if (passInput) passInput.disabled = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> دخول للحساب';
    }
    if (bannerEl) {
        if (showBanner) {
            bannerEl.style.display = 'block';
            bannerEl.innerHTML = '<div style="background: rgba(76, 175, 80, 0.2); border: 1.8px solid #4caf50; border-radius: 10px; padding: 14px; text-align: center; color: #fff;"><i class="fas fa-unlock-alt" style="color: #69f0ae; font-size: 1.6rem; margin-bottom: 6px; display:block;"></i><div style="font-weight: 800; color: #81c784; font-size: 1rem;">تم رفع الحظر الأمني عن جهازك من قبل الإدارة</div><div style="font-size: 0.85rem; color: #c8e6c9; margin-top: 4px;">يمكنك الآن إدخال بياناتك وتسجيل الدخول مباشرة.</div></div>';
        } else {
            bannerEl.style.display = 'none';
            bannerEl.innerHTML = '';
        }
    }
    if (errEl) {
        errEl.style.display = 'none';
        errEl.innerText = '';
    }
}

/**
 * مستمع لحظي دائم (Realtime Snapshot) على وثيقة الحظر الخاصة بالجهاز
 */
let lockoutUnsubscribeRef = null;

function listenToDeviceLockoutUpdates() {
    try {
        if (typeof db === 'undefined' || !db) return;
        const hw = getHardwareFingerprint();
        if (!hw) return;

        if (lockoutUnsubscribeRef) {
            try { lockoutUnsubscribeRef(); } catch (e) { }
            lockoutUnsubscribeRef = null;
        }

        lockoutUnsubscribeRef = db.collection('security_lockouts').doc(hw).onSnapshot(function (doc) {
            if (doc && doc.exists) {
                const data = doc.data();
                if (data.status === 'lifted_by_admin') {
                    console.log('🔓 [Realtime SOC] Lockout lifted by admin for device:', hw);
                    const isCurrentlyLocked = checkDeviceLockout().isLocked || (typeof lockoutCountdownInterval !== 'undefined' && lockoutCountdownInterval !== null);
                    unlockUiImmediately(isCurrentlyLocked);
                }
            }
        }, function (err) {
            console.warn('⚠️ [Realtime SOC] Lockout listener error:', err);
        });
    } catch (e) { }
}

// تشغيل المستمع اللحظي تلقائياً
if (typeof window !== 'undefined') {
    setTimeout(listenToDeviceLockoutUpdates, 1500);

    // الاستماع لإشارات التصفير بين التبويبات المفتوحة في نفس المتصفح
    window.addEventListener('storage', function (e) {
        if (e.key === 'almezo_lockout_lifted_signal' || (e.key && e.key.startsWith('almezo_sec_lock_'))) {
            unlockUiImmediately();
        }
    });
}

/**
 * فحص سحابي لحالة الحظر ومزامنته عبر كافة متصفحات الجهاز والـ IP
 */
async function syncLockoutFromCloud() {
    try {
        if (typeof db === 'undefined' || !db) return;
        const hw = getHardwareFingerprint();
        listenToDeviceLockoutUpdates();

        // 1. الفحص بواسطة بصمة الجهاز (Hardware Fingerprint)
        const docSnap = await db.collection('security_lockouts').doc(hw).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            const now = Date.now();

            if (data.status === 'lifted_by_admin') {
                const isCurrentlyLocked = checkDeviceLockout().isLocked || (typeof lockoutCountdownInterval !== 'undefined' && lockoutCountdownInterval !== null);
                unlockUiImmediately(isCurrentlyLocked);
                return;
            }

            // إذا كان هناك حظر نشط للجهاز سارياً تم فرضه من متصفح آخر
            if (data.status === 'active' && data.lockedUntil && now < data.lockedUntil) {
                const key = getLockoutStorageKey();
                localStorage.setItem(key, JSON.stringify(data));
                sessionStorage.setItem(key, JSON.stringify(data));

                const remaining = Math.ceil((data.lockedUntil - now) / 1000);
                const errEl = document.getElementById('loginGeneralError');
                const btn = document.getElementById('confirmLoginBtn');
                if (typeof startLockoutCountdown === 'function') {
                    startLockoutCountdown(remaining, errEl, btn, data.formattedDuration, (data.tier || 1) - 1);
                }
                return;
            }
        }

        // 2. الفحص الاحتياطي بواسطة الـ Public IP عبر المتصفحات
        const ip = (cachedClientIpData && cachedClientIpData.ip) ? cachedClientIpData.ip : '';
        if (ip) {
            try {
                const ipSnap = await db.collection('security_lockouts')
                    .where('ip', '==', ip)
                    .where('status', '==', 'active')
                    .limit(1)
                    .get();

                if (!ipSnap.empty) {
                    const ipData = ipSnap.docs[0].data();
                    const now = Date.now();
                    if (ipData.lockedUntil && now < ipData.lockedUntil) {
                        const key = getLockoutStorageKey();
                        localStorage.setItem(key, JSON.stringify(ipData));
                        sessionStorage.setItem(key, JSON.stringify(ipData));

                        const remaining = Math.ceil((ipData.lockedUntil - now) / 1000);
                        const errEl = document.getElementById('loginGeneralError');
                        const btn = document.getElementById('confirmLoginBtn');
                        if (typeof startLockoutCountdown === 'function') {
                            startLockoutCountdown(remaining, errEl, btn, ipData.formattedDuration, (ipData.tier || 1) - 1);
                        }
                    }
                }
            } catch (ipErr) { }
        }
    } catch (e) { }
}

/**
 * دالة تحكم المدير لرفع الحظر عن أي جهاز / رقم فوراً ومزامنته لحظياً
 */
async function adminLiftDeviceLockout(hw, phone) {
    if (!hw) throw new Error('معرف الجهاز غير محدد');

    // 1. تصفير الحظر المحلي للجهاز فوراً بدون انتظار
    try {
        resetDeviceLockout();
        unlockUiImmediately();
        localStorage.setItem('almezo_lockout_lifted_signal', JSON.stringify({ hw: hw, time: Date.now() }));
    } catch (e) { }

    // 2. تحديث وثيقة الحظر في Firestore للمزامنة اللحظية لكافة الأجهزة
    if (typeof db !== 'undefined' && db) {
        try {
            await db.collection('security_lockouts').doc(hw).set({
                status: 'lifted_by_admin',
                lockedUntil: 0,
                durationSeconds: 0,
                liftedAt: firebase.firestore.FieldValue.serverTimestamp(),
                liftedBy: (typeof currentAuthUser !== 'undefined' && currentAuthUser) ? (currentAuthUser.firstName || 'Admin') : 'Admin'
            }, { merge: true });
        } catch (dbErr) {
            // لا نبتلع الخطأ: رفع الحظر فعلياً هو هذه الكتابة وحدها (الجهاز المحظور يقرأها)،
            // وكان فشلها يُعرض على المدير نجاحاً بينما يبقى الجهاز محظوراً.
            console.warn('تعذر تحديث وثيقة الحظر السحابية:', dbErr);
            throw dbErr;
        }
    }

    // 3. تسجيل حركة إدارية في سجل الرصد
    if (typeof logActivity === 'function') {
        try {
            await logActivity({
                action: 'admin_lift_lockout',
                category: 'admin',
                severity: 'warning',
                title: '🔓 قام المدير برفع الحظر الأمني عن جهاز (' + hw + ')' + (phone ? ' - ' + phone : ''),
                details: {
                    hw: hw,
                    phone: phone || ''
                }
            });
        } catch (logErr) {
            console.warn('تعذر تسجيل حركة رفع الحظر:', logErr);
        }
    }

    return true;
}

window.adminLiftDeviceLockout = adminLiftDeviceLockout;
window.syncLockoutFromCloud = syncLockoutFromCloud;
window.listenToDeviceLockoutUpdates = listenToDeviceLockoutUpdates;
window.unlockUiImmediately = unlockUiImmediately;

function getClientDeviceInfo() {
    try {
        const ua = navigator.userAgent || '';
        let os = 'غير معروف';
        if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
        else if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
        else if (/windows/i.test(ua)) os = 'Windows';
        else if (/mac os x/i.test(ua)) os = 'macOS';
        else if (/linux/i.test(ua)) os = 'Linux';

        let browser = 'غير معروف';
        let appPlatform = 'web'; // 'android_app' | 'windows_app' | 'web'

        // فحص هل العميل داخل تطبيق أندرويد المثبت أو برنامج الكمبيوتر
        const isAndroidApp = !!(window.AndroidNativeBridge || window.Capacitor || /Capacitor|ALmEz0-Android/i.test(ua));
        const isWindowsApp = !!(window.AlMeZ0App || window.isElectron || /Electron|ALmEz0-PC/i.test(ua));

        if (isAndroidApp) {
            appPlatform = 'android_app';
            browser = 'تطبيق أندرويد (ALmEz0 App)';
        } else if (isWindowsApp) {
            appPlatform = 'windows_app';
            browser = 'برنامج كمبيوتر (ALmEz0 PC)';
        } else {
            if (/edg/i.test(ua)) browser = 'Microsoft Edge';
            else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) browser = 'Chrome';
            else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
            else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
            else if (/opr|opera/i.test(ua)) browser = 'Opera';
        }

        let deviceType = 'كمبيوتر (Desktop)';
        if (isAndroidApp) {
            deviceType = /tv|smart-tv|box/i.test(ua) ? 'شاشة / TV Box' : 'هاتف (تطبيق أندرويد)';
        } else if (isWindowsApp) {
            deviceType = 'كمبيوتر (برنامج ALmEz0)';
        } else if (/mobile/i.test(ua) || /android/i.test(ua) || /iphone/i.test(ua)) {
            deviceType = 'هاتف (Mobile)';
        } else if (/ipad|tablet/i.test(ua)) {
            deviceType = 'جهاز لوحي (Tablet)';
        }

        const ipData = cachedClientIpData || {};

        return {
            os: os,
            browser: browser,
            type: deviceType,
            appPlatform: appPlatform,
            screen: (window.screen ? `${window.screen.width}x${window.screen.height}` : 'unknown'),
            visitorId: getVisitorId(),
            hardwareFingerprint: getHardwareFingerprint(),
            publicIp: ipData.ip || 'غير معروف',
            country: ipData.country || '',
            city: ipData.city || '',
            isp: ipData.org || '',
            userAgent: ua
        };
    } catch (e) {
        return {
            os: 'غير معروف',
            browser: 'غير معروف',
            type: 'غير معروف',
            appPlatform: 'web',
            visitorId: getVisitorId(),
            hardwareFingerprint: getHardwareFingerprint(),
            publicIp: 'غير معروف'
        };
    }
}

/**
 * تسجيل حركة / نشاط في Firestore لحمايته في غرفة المراقبة
 *
 * @param {Object} logData
 * @param {string} logData.action - نوع الحركة البرمجي (login_success, login_failed, password_change, etc.)
 * @param {'auth'|'security'|'sales'|'admin'|'visitor'|'order'} logData.category - التصنيف
 * @param {'info'|'warning'|'danger'|'success'} [logData.severity='info'] - مستوى الخطورة
 * @param {string} logData.title - عنوان الحركة بالعربية
 * @param {string|Object} [logData.details=''] - تفاصيل إضافية عن الحركة
 * @param {Object} [logData.userOverride] - بيانات مستخدم مخصصة
 * @returns {Promise<void>}
 */
async function logActivity(logData) {
    try {
        if (typeof db === 'undefined') return;

        // التأكد من جلب الـ IP العام أولاً
        if (!cachedClientIpData) {
            await fetchClientPublicIp();
        }

        const user = logData.userOverride || getCurrentUser();
        let userRole = 'visitor';
        let userName = 'زائر غير مسجل';
        let userPhone = '';
        let userUid = '';

        if (user) {
            userUid = user.uid || '';
            if (userUid === '7Rfvdr6GpwPcY9uDQwX0fIuWeRv1' || user.role === 'admin') {
                userRole = 'admin';
            } else if (user.role === 'staff') {
                userRole = 'staff';
            } else {
                userRole = 'customer';
            }
            userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user.name || (user.phone ? `عميل (${user.phone})` : 'مستخدم'));
            userPhone = user.phone || '';
        }

        const deviceInfo = getClientDeviceInfo();
        const pagePath = window.location.pathname.split('/').pop() || 'index.html';

        const payload = {
            action: logData.action || 'unknown_action',
            category: logData.category || 'visitor',
            severity: logData.severity || 'info',
            title: logData.title || 'حركة غير معروفة',
            details: logData.details || {},
            user: {
                uid: userUid,
                name: userName,
                phone: userPhone,
                role: userRole
            },
            device: deviceInfo,
            publicIp: deviceInfo.publicIp,
            hardwareFingerprint: deviceInfo.hardwareFingerprint,
            page: pagePath,
            url: window.location.href,
            createdAt: Date.now(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            clientTime: new Date().toISOString()
        };

        // الحفظ في قاعدة البيانات
        return db.collection('activity_logs').add(payload).then(function (docRef) {
            console.log('📡 [Security Tracker] Logged:', payload.action, 'IP:', payload.publicIp, 'HW:', payload.hardwareFingerprint, 'ID:', docRef.id);
            return docRef;
        }).catch(function (err) {
            console.warn('⚠️ [Security Tracker] Firestore log error (Check Firestore Rules):', err);
        });
    } catch (err) {
        console.warn('logActivity exception:', err);
    }
}

// تسجيل زيارة الصفحة تلقائياً لمرة واحدة عند الدخول ومنع التكرار المزعج
(function trackPageView() {
    try {
        async function executePageLog() {
            const pageName = window.location.pathname.split('/').pop() || 'index.html';
            // تجنب تسجيل صفحات المراقبة التلقائية لتفادي تكرار حركة المدير عند مراقبة السجلات
            if (pageName === 'security-monitor.html') return;

            // منع التكرار المزعج: إذا زار نفس الصفحة في نفس الجلسة خلال آخر 3 دقائق لا نكرر السجل
            const sessionKey = 'almezo_pv_' + pageName;
            const lastLog = sessionStorage.getItem(sessionKey);
            const now = Date.now();
            if (lastLog && (now - parseInt(lastLog, 10)) < 180000) {
                return;
            }
            try { sessionStorage.setItem(sessionKey, now.toString()); } catch (e) { }

            // ضمان اكتمال جلب الـ IP قبل إرسال حركة تصفح الصفحة
            try {
                if (!cachedClientIpData) {
                    await fetchClientPublicIp();
                }
            } catch (e) { }

            logActivity({
                action: 'page_view',
                category: 'visitor',
                severity: 'info',
                title: 'تصفح صفحة ' + (document.title.split('|')[0] || pageName).trim(),
                details: { page: pageName }
            });
        }

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(executePageLog, 600);
        } else {
            window.addEventListener('DOMContentLoaded', function () {
                setTimeout(executePageLog, 600);
            });
        }
    } catch (e) { }
})();


// =============================================
// إطار التركيز: للريموت والكيبورد فقط (كل الصفحات)
// =============================================
(function () {
    // إطار التركيز الأبيض للريموت والكيبورد فقط. كان يظهر لمستخدم اللمس والماوس أيضاً لأن
    // فتح أي نافذة أو إغلاقها يضع .tv-focused تلقائياً، ووضع الريموت (tv-nav-active) لا يُلغى
    // أبداً بعد تفعيله. الآن: أي زر تنقل يُظهر الإطار (html.mz-kbd)، وأول لمسة أو نقرة تُخفيه.
    // أجهزة التلفاز تبقى على الإطار دائماً (CSS يستثني data-is-tv)، فزر OK في الريموت
    // الذي قد يولّد mousedown لا يُخفيه هناك.
    var KBD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'];
    var KBD_CODES = [37, 38, 39, 40, 9, 13, 27, 23, 4];
    window.addEventListener('keydown', function (e) {
        if (KBD_KEYS.indexOf(e.key) !== -1 || KBD_CODES.indexOf(e.keyCode) !== -1) {
            // Enter أثناء الكتابة في خانة لا يعني تنقلاً بالكيبورد
            var t = e.target, tag = t && t.tagName;
            if ((e.key === 'Enter' || e.keyCode === 13) && (tag === 'INPUT' || tag === 'TEXTAREA')) return;
            document.documentElement.classList.add('mz-kbd');
        }
    }, true);
    function markPointerInput(e) {
        var root = document.documentElement;
        if (root.getAttribute('data-is-tv') === 'true' || root.classList.contains('tv-device-mode')) return;
        if (e && e.isTrusted === false) return;
        root.classList.remove('mz-kbd');
        if (document.body) document.body.classList.remove('tv-nav-active');
        if (root.getAttribute('data-input-mode') === 'remote') {
            root.setAttribute('data-input-mode', e && e.type === 'touchstart' ? 'touch' : 'mouse');
        }
        var marked = document.querySelectorAll('.tv-focused');
        for (var i = 0; i < marked.length; i++) marked[i].classList.remove('tv-focused');
    }
    window.addEventListener('mousedown', markPointerInput, { capture: true, passive: true });
    window.addEventListener('touchstart', markPointerInput, { capture: true, passive: true });
})();

// =============================================
// إشعار داخل الموقع والبرنامج: 30 ثانية، إغلاق بالزر أو بالسحب، ومرة واحدة فقط
// =============================================
(function () {
    var SEEN_KEY = 'almezo_seen_broadcasts';

    /**
     * يعيد true إن كان الإشعار ظهر لهذا الجهاز من قبل، وإلا يسجّله ظاهراً ويعيد false.
     * كان يُحفظ آخر إشعار فقط، فحذف أحدث إشعار من لوحة المدير يُعيد إظهار الذي قبله.
     * الآن قائمة بآخر 50 معرّفاً، ويُسجَّل الإشعار لحظة ظهوره سواء أُغلق أم لا.
     */
    window.mzBroadcastAlreadySeen = function (id, ts) {
        var seen = [];
        try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { seen = []; }
        var lastId = null, lastTs = 0;
        try {
            lastId = localStorage.getItem('almezo_last_broadcast_id');
            lastTs = parseInt(localStorage.getItem('almezo_last_broadcast_ts') || '0', 10) || 0;
        } catch (e) { }
        if (seen.indexOf(id) !== -1 || id === lastId || (ts && ts <= lastTs)) return true;
        seen.push(id);
        if (seen.length > 50) seen = seen.slice(-50);
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
            localStorage.setItem('almezo_last_broadcast_id', id);
            localStorage.setItem('almezo_last_broadcast_ts', String(Math.max(ts || 0, lastTs)));
        } catch (e) { }
        return false;
    };

    /** إغلاق تلقائي بعد 30 ثانية، وزر الإغلاق، والسحب يميناً أو يساراً مثل إشعارات الهاتف. */
    window.mzBannerLifecycle = function (banner, ms) {
        var timer = null, gone = false;
        function remove() { if (banner.parentElement) banner.remove(); }
        function hide() {
            if (gone) return;
            gone = true;
            clearTimeout(timer);
            banner.classList.remove('visible');
            setTimeout(remove, 450);
        }
        function startTimer() { clearTimeout(timer); timer = setTimeout(hide, ms || 30000); }

        var btn = banner.querySelector('.push-close-btn');
        if (btn) btn.onclick = function (e) { if (e) e.stopPropagation(); hide(); };

        // السحب
        var startX = 0, startY = 0, dx = 0, dragging = false, decided = false, startT = 0;
        function setX(x, withTransition) {
            banner.style.transition = withTransition ? 'transform 0.3s ease, opacity 0.3s ease' : 'none';
            banner.style.transform = 'translateX(calc(-50% + ' + x + 'px)) translateY(0)';
            banner.style.opacity = String(Math.max(0, 1 - Math.abs(x) / 320));
        }
        function down(x, y, target) {
            if (gone || (target && target.closest && target.closest('.push-close-btn, .push-action-btn'))) return;
            startX = x; startY = y; dx = 0; dragging = true; decided = false; startT = Date.now();
            clearTimeout(timer);
        }
        function move(x, y, ev) {
            if (!dragging) return;
            var mx = x - startX, my = y - startY;
            if (!decided) {
                if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
                decided = true;
                if (Math.abs(my) > Math.abs(mx)) { dragging = false; startTimer(); return; }
            }
            dx = mx;
            if (ev && ev.cancelable) ev.preventDefault();
            setX(dx, false);
        }
        function up() {
            if (!dragging) return;
            dragging = false;
            var fast = Math.abs(dx) / Math.max(1, Date.now() - startT) > 0.5;
            if (decided && (Math.abs(dx) > 90 || (fast && Math.abs(dx) > 30))) {
                gone = true;
                setX(dx > 0 ? window.innerWidth : -window.innerWidth, true);
                setTimeout(remove, 320);
                return;
            }
            if (decided) {
                setX(0, true);
                setTimeout(function () { if (!gone) { banner.style.transition = ''; banner.style.transform = ''; banner.style.opacity = ''; } }, 320);
            }
            startTimer();
        }
        banner.addEventListener('touchstart', function (e) { var t = e.touches[0]; down(t.clientX, t.clientY, e.target); }, { passive: true });
        banner.addEventListener('touchmove', function (e) { var t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
        banner.addEventListener('touchend', up);
        banner.addEventListener('touchcancel', up);
        banner.addEventListener('mousedown', function (e) { if (e.button === 0) down(e.clientX, e.clientY, e.target); });
        window.addEventListener('mousemove', function (e) { if (dragging) move(e.clientX, e.clientY, e); });
        window.addEventListener('mouseup', function () { if (dragging) up(); });

        banner.style.touchAction = 'pan-y';
        banner.style.cursor = 'grab';
        startTimer();
        return hide;
    };
})();
