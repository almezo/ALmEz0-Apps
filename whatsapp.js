// =============================================
// ملف تكامل واتساب - (Phase 4 - Secure)
// يحتوي على:
// 1. استدعاء Cloud Function آمن لإرسال إشعار للمدير عبر واتساب
//    (بدلاً من استدعاء CallMeBot مباشرةً من المتصفح - يُخفي مفاتيح API)
// 2. تحويل المستخدم لواتساب مع رسالة جاهزة
//
// === تغيير أمني مهم ===
// في النسخة السابقة: كانت CALLMEBOT_API_KEY مكشوفة في ملف JS على المتصفح
// في هذه النسخة: المفتاح موجود حصراً داخل بيئة Cloud Function (الخادم)
// والمتصفح يستدعي فقط دالة آمنة عبر Firebase Functions SDK
// =============================================

// === رقم واتساب المدير (Admin) - مرئي للعميل بشكل مقصود (ليس سراً) ===
const ADMIN = "218945772649";

// =============================================
// تهيئة مرجع Cloud Function القابل للاستدعاء
// المفاتيح والمنطق الحساس موجودان على الخادم فقط
// =============================================

// 'functions' معرَّف في firebase-config.js عبر firebase.functions()
const sendWhatsAppCallable = functions.httpsCallable('sendWhatsAppNotification');

// =============================================
// دالة مشتركة: إرسال رسالة واتساب للمدير عبر Cloud Function
// =============================================

/**
 * إرسال رسالة واتساب للمدير عبر Firebase Cloud Function
 * الكود يرسل نص الرسالة فقط إلى الخادم؛ مفتاح API وبيانات CallMeBot
 * محفوظة بأمان داخل بيئة Cloud Functions بعيداً عن المتصفح.
 *
 * @param {string} message - نص الرسالة المراد إرسالها
 * @returns {Promise<void>}
 */
async function fireCallMeBotRequest(message) {
    try {
        await sendWhatsAppCallable({ message: message });
        console.log('✅ Cloud Function: تم إرسال إشعار واتساب بنجاح');
    } catch (err) {
        // خطأ في Cloud Function (مثلاً: غير مسجّل الدخول، أو خطأ شبكة)
        // هذا الخطأ لا يمنع تجربة المستخدم - يُسجَّل فقط في وحدة التحكم
        console.warn('⚠️ Cloud Function: فشل إرسال الإشعار:', err.code, err.message);
    }
}

function getFormattedCurrentDateTime() {
    var now = new Date();
    var day = String(now.getDate()).padStart(2, '0');
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var year = now.getFullYear();
    var time = now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
    return day + '/' + month + '/' + year + ' - ' + time;
}

// =============================================
// العملية الخفية: إرسال إشعار للمدير عند تسجيل مستخدم جديد
// =============================================

/**
 * إرسال إشعار فوري للمدير عند إنشاء حساب جديد
 * يعمل في الخلفية دون أن يشعر العميل (fire-and-forget)
 * لا يحتوي على الرقم السري - Firebase Auth يتولى إدارته
 *
 * @param {Object} userData - بيانات المستخدم (firstName, lastName, age, city, phone)
 */
function sendRegistrationNotification(userData) {
    try {
        // تحويل الرقم الليبي (10 أرقام تبدأ بـ 0) إلى الصيغة الدولية لرابط واتساب
        var rawPhone = (userData.phone || '').toString().trim();
        var formattedPhone = rawPhone.startsWith('0') ? '218' + rawPhone.slice(1) : rawPhone;
        var waLink = 'https://wa.me/' + formattedPhone;

        var fullName = ((userData.firstName || '') + ' ' + (userData.lastName || '')).trim();

        var adminMsg = '👤 تسجيل مستخدم جديد في الموقع 👋\n\n' +
            '🏷️ الاسم: ' + fullName + '\n' +
            '🎂 العمر: ' + (userData.age || '') + ' سنة\n' +
            '🏙️ المدينة: ' + (userData.city || '') + '\n' +
            '💬 التواصل مع الزبون:\n' +
            waLink + '\n' +
            '📅 تاريخ التسجيل: ' + getFormattedCurrentDateTime();

        // إطلاق الإرسال في الخلفية (fire-and-forget) - لا ننتظر الرد
        fireCallMeBotRequest(adminMsg);

    } catch (error) {
        console.warn('⚠️ فشل إرسال إشعار التسجيل للمدير (لن يؤثر على تجربة المستخدم):', error);
    }
}

/**
 * إرسال بيانات الطلب للمدير عبر Cloud Function (خلفياً)
 * @param {Object} orderData - بيانات الطلب (customerName, phone, city, product, duration, paymentMethod)
 */
async function sendAdminNotification(orderData) {
    var rawPhone = (orderData.phone || '').toString().trim();
    var formattedPhone = rawPhone.startsWith('0') ? '218' + rawPhone.slice(1) : rawPhone;
    var waLink = 'https://wa.me/' + formattedPhone;

    var adminMsg = '🛒 طلب شراء منتج من الموقع 😁\n\n' +
        '👤 الاسم: ' + orderData.customerName + '\n' +
        '🏙️ المدينة: ' + (orderData.city || '') + '\n' +
        '📦 المنتج: ' + orderData.product + '\n' +
        '⏳ المدة/السعر: ' + orderData.duration + '\n' +
        '💰 طريقة الدفع: ' + orderData.paymentMethod + '\n' +
        '📱 الهاتف:\n' +
        waLink + '\n' +
        '📅 التاريخ الطلب: ' + getFormattedCurrentDateTime();

    try {
        await fireCallMeBotRequest(adminMsg);
        console.log('✅ تم إرسال إشعار الطلب للمدير بنجاح (Cloud Function)');
    } catch (error) {
        console.warn('⚠️ فشل إرسال الإشعار للمدير (لن يؤثر على عملية الشراء):', error.message);
    }
}

// =============================================
// العملية المرئية: تأكيد الطلب والتحويل للواتساب
// =============================================
document.addEventListener('DOMContentLoaded', function () {

    var confirmBtn = document.getElementById('confirmOrderBtn');
    if (!confirmBtn) return;

    confirmBtn.addEventListener('click', async function () {
        // التأكد من أن المستخدم مسجّل عبر Firebase Auth
        // getCurrentUser() يقرأ من currentAuthUser (firebase-config.js)
        var user = getCurrentUser();
        if (!user) {
            showToast('يجب تسجيل الدخول أولاً', 'error');
            return;
        }

        // جلب طريقة الدفع المختارة
        var paymentMethod = document.getElementById('paymentMethod').value;
        if (!paymentMethod || paymentMethod === "") {
            if (typeof showToast === 'function') {
                showToast('يرجى اختيار طريقة الدفع أولاً', 'error');
            } else {
                showAlert('يرجى اختيار طريقة الدفع أولاً');
            }
            return;
        }

        // تغيير حالة الزر لتوضيح عملية التحويل
        var btn = this;
        var originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحويل...';
        btn.disabled = true;

        // === العملية 1 (خفية): إرسال إشعار للمدير في الخلفية عبر Cloud Function ===
        var orderData = {
            customerName: ((user.firstName || '') + ' ' + (user.lastName || '')).trim(),
            phone: user.phone || '',
            city: user.city || '',
            product: currentProduct,
            duration: currentDuration,
            paymentMethod: paymentMethod
        };

        // إطلاق الإرسال في الخلفية بدون انتظار الرد (fire-and-forget)
        sendAdminNotification(orderData).catch(function (e) {
            console.warn('خطأ في إشعار المدير:', e);
        });

        if (typeof logActivity === 'function') {
            logActivity({
                action: 'order_confirmed_whatsapp',
                category: 'order',
                severity: 'success',
                title: 'تأكيد طلب شراء: ' + currentProduct,
                details: orderData
            });
        }

        // === العملية 2 (مرئية): تحويل المستخدم لواتساب المدير مع رسالة كاملة التفاصيل ===
        var fullName = ((user.firstName || '') + ' ' + (user.lastName || '')).trim();

        var customerMsg = 'السلام عليكم و رحمة الله و بركاته،\n\n أريد شراء:\n' +
            '● المنتج: ' + currentProduct + '\n' +
            '● المدة/السعر: ' + currentDuration + '\n' +
            '● طريقة الدفع: ' + paymentMethod + '\n' +
            '● الاسم: ' + fullName + '\n' +
            '● رقم الهاتف: ' + (user.phone || '') + '\n\n' +
            '● كيف طريقة إتمام الدفع و الحصول على المنتج؟';

        // فتح رابط واتساب مع الرسالة الجاهزة
        window.location.href = 'https://wa.me/' + ADMIN + '?text=' + encodeURIComponent(customerMsg);

        // إعادة حالة الزر بعد التحويل
        setTimeout(function () {
            closeModal();
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 2500);
    });
});

// =============================================
// طلب حساب تجريبي (Trial Request) - يتطلب تسجيل الدخول
// =============================================

/**
 * إرسال طلب حساب تجريبي عبر واتساب مع إشعار المدير عبر Cloud Function
 * يتحقق من تسجيل الدخول عبر Firebase Auth (getCurrentUser / isUserLoggedIn)
 * @param {string} serverName  - اسم السيرفر أو التطبيق
 * @param {string} categoryKey - نوع التصنيف (iptv, smartApps, etc.)
 */
function requestTrial(serverName, categoryKey) {
    // 1. التحقق من تسجيل الدخول - isUserLoggedIn() يقرأ من currentAuthUser
    if (!isUserLoggedIn()) {
        pendingTrial = { serverName: serverName, categoryKey: categoryKey };
        showToast('يجب تسجيل الدخول أو إنشاء حساب أولاً لطلب حساب تجريبي 🔒', 'info');
        openLoginModal();
        return;
    }

    // getCurrentUser() يقرأ من currentAuthUser (firebase-config.js)
    var user = getCurrentUser();
    var fullName = ((user.firstName || '') + ' ' + (user.lastName || '')).trim();
    var typeLabel = (categoryKey === 'iptv') ? 'سيرفر' : 'تطبيق';

    // 2. إرسال إشعار فوري في الخلفية للمدير عبر Cloud Function
    try {
        var rawPhone = (user.phone || '').toString().trim();
        var formattedPhone = rawPhone.startsWith('0') ? '218' + rawPhone.slice(1) : rawPhone;
        var waLink = 'https://wa.me/' + formattedPhone;

        var adminTrialMsg = '🧪 طلب حساب تجريبي من الموقع 🙂\n\n' +
            '👤 الاسم: ' + fullName + '\n' +
            '📦 الخدمة: ' + serverName + '\n' +
            '📱 الهاتف:\n' +
            waLink + '\n' +
            '📅 التاريخ: ' + getFormattedCurrentDateTime();

        // إطلاق الإرسال عبر Cloud Function (fire-and-forget)
        fireCallMeBotRequest(adminTrialMsg);
        console.log('✅ تم إرسال إشعار طلب التجربة للمدير (Cloud Function)');
    } catch (e) {
        console.warn('خطأ في إشعار المدير للتجربة:', e);
    }

    // 3. رسالة العميل المحولة لواتساب المدير
    var customerMsg = 'السلام عليكم ورحمة الله و بركاته،\n\n' +
        'أريد الحصول على (حساب تجريبي) لمنتج ' + serverName + ' لاختبار الجودة:\n\n' +
        '● الاسم: ' + fullName + '\n' +
        '● رقم الهاتف: ' + (user.phone || '');

    if (typeof logActivity === 'function') {
        logActivity({
            action: 'demo_account_request',
            category: 'order',
            severity: 'info',
            title: 'طلب حساب تجريبي: ' + serverName,
            details: { product: serverName, category: categoryKey }
        });
    }

    window.location.href = 'https://wa.me/' + ADMIN + '?text=' + encodeURIComponent(customerMsg);
}