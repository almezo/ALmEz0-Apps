const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

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

// =============================================
// مساعد الميزو الذكي - وسيط Gemini الآمن
// مفتاح Google Gemini API يبقى حصراً على الخادم (Secret Manager)
// ولا يُشحن أبداً داخل كود الموقع/التطبيق من جهة العميل
// =============================================
exports.generateAiReply = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "يجب أن تكون مسجلاً للدخول لاستخدام هذه الخدمة.");
    }

    const { model, contents, systemInstruction, tools, generationConfig } = request.data || {};
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new HttpsError("invalid-argument", "بيانات الطلب غير صالحة.");
    }

    const apiKey = GEMINI_API_KEY.value();
    // النموذج الاحتياطي القديم gemini-1.5-flash أُوقف من جوجل ولم يعد موجوداً في v1beta،
    // فكان يرجع الخطأ "models/gemini-1.5-flash is not found" ويظهر نصه الخام للمستخدم.
    // سلسلة احتياطية حديثة ومدعومة، مع إزالة التكرار إن كان النموذج المطلوب ضمنها.
    const modelsToTry = Array.from(new Set([
        model || "gemini-2.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
    ]));
    let lastError = null;

    for (const m of modelsToTry) {
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
            const res = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ systemInstruction, contents, tools, generationConfig }),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                const errMsg = errJson.error ? errJson.error.message : `HTTP ${res.status}`;
                if (res.status === 404) {
                    lastError = new Error(errMsg);
                    continue;
                }
                throw new Error(errMsg);
            }

            const data = await res.json();
            const candidate = data.candidates && data.candidates[0];
            if (!candidate || !candidate.content || !candidate.content.parts) {
                throw new Error("لم يتم استلام رد من النموذج");
            }

            const replyText = candidate.content.parts.map((p) => p.text || "").join("").trim();
            return { text: replyText };
        } catch (err) {
            lastError = err;
        }
    }

    // التفاصيل التقنية تُسجَّل في سجلات الخادم فقط، ولا تُرسل للمستخدم أبداً
    logger.error("خطأ في توليد رد مساعد الميزو الذكي:", lastError);
    throw new HttpsError("internal", "عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.");
});
