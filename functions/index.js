const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

exports.sendWhatsAppNotification = onCall(async (request) => {
    if (!request.auth) {
        throw new Error("يجب أن تكون مسجلاً للدخول لاستخدام هذه الخدمة.");
    }

    const message = request.data.message;
    const API_KEY = "6716065";
    const ADMIN_PHONE = "218945772649";
    const url = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_PHONE}&text=${encodeURIComponent(message)}&apikey=${API_KEY}`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            return { success: true };
        } else {
            throw new Error("فشل الاتصال بـ CallMeBot");
        }
    } catch (error) {
        logger.error("خطأ في إرسال واتساب:", error);
        throw new Error("فشل إرسال الإشعار.");
    }
});
