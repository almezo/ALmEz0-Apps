// =============================================
// ملف التحقق من صحة البيانات المدخلة
// يحتوي على دوال التحقق من الأرقام الليبية
// والحقول الأخرى في نموذج التسجيل
// =============================================

/**
 * التحقق من صحة رقم الهاتف الليبي
 * الشروط:
 * - يجب أن يبدأ بـ 091 أو 092 أو 093 أو 094
 * - يجب أن يتكون من 10 أرقام بالضبط
 * - يجب أن يحتوي على أرقام فقط (بدون أحرف أو رموز)
 *
 * @param {string} num - الرقم المدخل من المستخدم
 * @returns {{ valid: boolean, error: string }}
 */
function validateLibyanNumber(num) {
    // إزالة المسافات الزائدة
    const cleaned = num.replace(/\s/g, '');

    // التحقق من أن الحقل ليس فارغاً
    if (cleaned.length === 0) {
        return { valid: false, error: '❌ الرجاء إدخال رقم الهاتف' };
    }

    // التحقق من أن الرقم يحتوي على أرقام فقط (بدون أحرف أو رموز خاصة)
    if (!/^\d+$/.test(cleaned)) {
        return { valid: false, error: '❌ الرقم يجب أن يحتوي على أرقام فقط بدون أحرف أو رموز' };
    }

    // التحقق من الطول - يجب أن يكون 10 أرقام بالضبط
    if (cleaned.length !== 10) {
        return {
            valid: false,
            error: '❌ الرقم يجب أن يتكون من 10 أرقام بالضبط (أدخلت ' + cleaned.length + ' أرقام)'
        };
    }

    // التحقق من البادئة - يجب أن يبدأ بـ 091 أو 092 أو 093 أو 094
    const validPrefixes = ['091', '092', '093', '094'];
    const prefix = cleaned.substring(0, 3);

    if (!validPrefixes.includes(prefix)) {
        return {
            valid: false,
            error: '❌ الرقم يجب أن يبدأ بـ 091 أو 092 أو 093 أو 094 (أرقام ليبيانا أو المدار فقط)'
        };
    }

    // الرقم صحيح ✅
    return { valid: true, error: '' };
}

/**
 * التحقق من صحة الاسم (الأول أو اللقب)
 * @param {string} name - الاسم المدخل
 * @returns {{ valid: boolean, error: string }}
 */
function validateName(name) {
    if (!name || name.trim().length < 2) {
        return { valid: false, error: '❌ الرجاء إدخال اسم صحيح (حرفين على الأقل)' };
    }
    if (name.trim().length > 50) {
        return { valid: false, error: '❌ الاسم طويل جداً (50 حرف كحد أقصى)' };
    }
    return { valid: true, error: '' };
}

/**
 * التحقق من صحة العمر
 * @param {string|number} age - العمر المدخل
 * @returns {{ valid: boolean, error: string }}
 */
function validateAge(age) {
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 10 || ageNum > 100) {
        return { valid: false, error: '❌ الرجاء إدخال عمر صحيح (بين 10 و 100 سنة)' };
    }
    return { valid: true, error: '' };
}

/**
 * التحقق من صحة اسم المدينة
 * @param {string} city - اسم المدينة المدخل
 * @returns {{ valid: boolean, error: string }}
 */
function validateCity(city) {
    if (!city || city.trim().length < 2) {
        return { valid: false, error: '❌ الرجاء إدخال اسم المدينة (حرفين على الأقل)' };
    }
    return { valid: true, error: '' };
}

/**
 * التحقق من صحة الرقم السري / كلمة المرور
 * @param {string} password - الرقم السري المدخل
 * @returns {{ valid: boolean, error: string }}
 */
function validatePassword(password) {
    if (!password || password.trim().length < 6) {
        return { valid: false, error: '❌ الرقم السري يجب أن يتكون من 6 خانات/أرقام على الأقل' };
    }
    if (password.length > 30) {
        return { valid: false, error: '❌ الرقم السري طويل جداً (30 خانة كحد أقصى)' };
    }
    return { valid: true, error: '' };
}