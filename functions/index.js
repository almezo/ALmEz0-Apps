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

            // مصادر بحث Google التي اعتمد عليها الرد (عند تفعيل أداة البحث)، ليعرضها التطبيق
            // روابط حقيقية تحت الإجابة. حقل إضافي لا يؤثر على العملاء الذين يقرؤون text فقط.
            const chunks = (candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) || [];
            const seen = new Set();
            const sources = [];
            for (const ch of chunks) {
                const web = ch && ch.web;
                if (!web || !web.uri || seen.has(web.uri)) continue;
                seen.add(web.uri);
                sources.push({ title: web.title || "", uri: web.uri });
                if (sources.length >= 6) break;
            }
            return { text: replyText, sources };
        } catch (err) {
            lastError = err;
        }
    }

    // التفاصيل التقنية تُسجَّل في سجلات الخادم فقط، ولا تُرسل للمستخدم أبداً
    logger.error("خطأ في توليد رد مساعد الميزو الذكي:", lastError);

    // نفاد حصة Gemini (429) كان يصل للعميل كخطأ عام فيظهر له "تحقق من اتصال الإنترنت" وهو متصل.
    // نميّزه بكود قياسي ليعرض التطبيق والموقع رسالة صحيحة: الخدمة وصلت حدها، أعد المحاولة لاحقاً.
    const lastMsg = String((lastError && lastError.message) || "");
    if (/quota|rate limit|resource[_ ]?exhausted|too many requests|\b429\b/i.test(lastMsg)) {
        throw new HttpsError("resource-exhausted", "وصل المساعد للحد المسموح من الطلبات حالياً. أعد المحاولة بعد قليل.");
    }
    throw new HttpsError("internal", "عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.");
});

// =============================================
// إشعارات المدير الفورية لأجهزة أندرويد (FCM)
// =============================================
// كل وثيقة جديدة في broadcast_notifications (من صفحة الإشعارات في لوحة المدير) تُرسَل
// فوراً إلى موضوع "broadcast" الذي يشترك فيه تطبيق أندرويد (nat/BroadcastNotifier).
// رسالة بيانات (data) لا رسالة عرض: التطبيق يعرضها بنفسه بنفس القناة والشكل، ويمنع
// تكرارها مع الفحص الدوري وصفحة الويب. تصل حتى والتطبيق مغلق.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
if (!getApps().length) initializeApp();

exports.pushBroadcastNotification = onDocumentCreated("broadcast_notifications/{notificationId}", async (event) => {
    const doc = event.data ? event.data.data() : null;
    if (!doc || doc.active === false) return;

    const ts = Number(doc.timestamp) || Date.now();
    const message = {
        topic: "broadcast",
        data: {
            id: String(event.params.notificationId),
            title: String(doc.title || "سيرفرات الميزو"),
            message: String(doc.message || ""),
            actionUrl: String(doc.actionUrl || ""),
            ts: String(ts)
        },
        android: {
            priority: "high",
            // نفس نافذة الـ48 ساعة في التطبيق: جهاز مطفأ لأكثر منها لا يستلم إشعاراً قديماً
            ttl: 48 * 60 * 60 * 1000
        }
    };

    try {
        const id = await getMessaging().send(message);
        logger.info("broadcast push sent", { notificationId: event.params.notificationId, fcmId: id });
    } catch (err) {
        // الفحص الدوري في التطبيق يوصل الإشعار خلال 15 دقيقة حتى لو فشل هذا الإرسال
        logger.error("broadcast push failed", { notificationId: event.params.notificationId, error: err.message });
    }
});
