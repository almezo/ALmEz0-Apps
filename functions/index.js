const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.sendWhatsAppNotification = onCall(async (request) => {
    if (!request.auth) {
        throw new Error("يجب أن تكون مسجلاً للدخول لاستخدام هذه الخدمة.");
    }

    const message = String((request.data && request.data.message) || "").slice(0, 1000);
    if (!message.trim()) throw new HttpsError("invalid-argument", "الرسالة فارغة.");
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
// النماذج المسموحة للمساعد (السريعة الرخيصة فقط) والحد اليومي لكل حساب.
// كل سؤال للمساعد = طلبان تقريباً، فالحد 80 طلباً ≈ 40 سؤالاً يومياً. المدير بلا حد.
const AI_ALLOWED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]);
const AI_DAILY_LIMIT = 80;
const AI_ADMIN_UID = "7Rfvdr6GpwPcY9uDQwX0fIuWeRv1";

async function enforceAiDailyLimit(uid, kind) {
    if (uid === AI_ADMIN_UID) return AI_DAILY_LIMIT;
    // فهم السؤال (نموذج خفيف) وتحويل الصوت لنص لهما عدّاد منفصل أوسع، حتى لا يُحسب السؤال الواحد مرتين
    const field = kind === "aux" ? "aux" : "count";
    const limit = kind === "aux" ? AI_DAILY_LIMIT * 2 : AI_DAILY_LIMIT;
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const day = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // يوم ليبيا
    const ref = fs().collection("ai_usage").doc(uid + "_" + day);
    const count = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const n = (snap.exists ? snap.data()[field] : 0) || 0;
        if (n >= limit) return n;
        tx.set(ref, { uid: uid, day: day, [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return n;
    });
    if (count >= limit) {
        throw new HttpsError("resource-exhausted", "وصلت للحد اليومي لأسئلة المساعد. يمكنك المتابعة غداً.");
    }
    return limit - count - 1;
}

// =============================================
// عقل المساعد المشترك (أندرويد والكمبيوتر)
// =============================================
// التعليمات وفهم السؤال وإعدادات النموذج هنا في السيرفر، فيرد البرنامجان بنفس المستوى، ويمكن
// تحسين الردود دون إصدار نسخة جديدة. بيانات سيرفر العميل (Xtream) يجمعها جهازه ويرسلها كسياق،
// لأن السيرفر لا يتصل بلوحات Xtream أبداً (حدود الاتصال وحظر الـIP).
function aiNowLibya() {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return days[d.getUTCDay()] + " " + d.toISOString().slice(0, 16).replace("T", " ");
}

function aiSystemPrompt() {
    return [
        "أنت \"مساعد الميزو\"، المساعد الذكي داخل مشغل سيرفرات الميزو (ALmEz0) للأفلام والمسلسلات والقنوات المباشرة والرياضة.",
        "شخصيتك: خبير ترفيه ورياضة ودود وواثق، يتكلم عربية سهلة قريبة من العميل، ويفهم كل اللهجات (الليبية أولاً، والمصرية والخليجية والشامية والمغاربية). رد بلهجة قريبة من لهجة العميل دون مبالغة.",
        "",
        "مصادر معلوماتك وترتيب الثقة:",
        "1) [بيانات سيرفر العميل] المرفقة مع الرسالة: المصدر الوحيد لما هو متوفر عنده، ولكل عمل أو قناة وسم خاص.",
        "2) بحث Google (عندما يكون متاحاً): للمعلومات الحية فقط، مثل مواعيد المباريات ونتائجها والقنوات الناقلة والأخبار.",
        "3) معرفتك العامة: لقصص الأفلام والمسلسلات والممثلين المشهورين، بشرط أن تكون متأكداً.",
        "",
        "القواعد:",
        "- لا تقل إن عملاً أو قناة متوفرة إلا إذا وردت في بيانات سيرفر العميل. إن لم ترد فقل بوضوح إنها غير متوفرة حالياً في سيرفره، واقترح بديلاً متوفراً من البيانات إن وُجد.",
        "- بعد اسم كل عمل أو قناة تذكرها من البيانات ضع وسمها كما هو تماماً، مثل [[movie:123]] أو [[series:45]] أو [[channel:678]]. التطبيق يحوّل الوسم إلى بطاقة تشغيل ويخفيه من النص. لا تخترع وسماً، ولا تضع وسماً لعمل غير موجود في البيانات.",
        "- الترشيحات: اختر 3 إلى 5 أعمال تطابق الطلب فعلاً (النوع، اللغة، البلد، المزاج)، ونوّع ولا تكرر ما اقترحته سابقاً في المحادثة. لكل عمل: الاسم ثم الوسم ثم سطر واحد مشوق (السنة والنوع وفكرة القصة بلا حرق). لا تكتب سنة أو قصة لست متأكداً منها؛ اكتفِ بالنوع والتقييم.",
        "- المباريات: اعتمد على نتائج البحث فقط. اذكر لكل مباراة: الفريقين، البطولة، الموعد بتوقيت ليبيا، والقناة الناقلة. إذا كانت القناة الناقلة أو قناة من نفس الشبكة ضمن قنوات سيرفر العميل فضع وسمها. إن لم تجد معلومة مؤكدة فقل ذلك بصراحة، ولا تخمّن مواعيد أو نتائج أبداً.",
        "- إن كان الطلب غامضاً اسأل سؤالاً قصيراً واحداً، أو قدّم أفضل تخمين مع خيارين.",
        "- مواضيع خارج الترفيه والرياضة: أجب باختصار ولطف ثم أعد الحديث لما يمكنك مساعدته فيه. لا تتحدث عن الأسعار أو الاشتراكات أو مشاكل الحساب؛ وجّه العميل للتواصل مع الدعم أو مندوبه.",
        "- الشكل: ابدأ بالإجابة مباشرة بلا مقدمات. فقرات قصيرة أو نقاط تبدأ بـ \"- \"، و**خط عريض** للأسماء المهمة فقط، وإيموجي قليلة مناسبة. لا جداول ولا عناوين طويلة. الرد المعتاد أقل من 150 كلمة.",
        "",
        "الوقت الآن بتوقيت ليبيا: " + aiNowLibya() + "."
    ].join("\n");
}

const AI_INTENT_SCHEMA = {
    type: "OBJECT",
    properties: {
        intent: { type: "STRING", enum: ["sports", "availability", "recommend", "channel", "info", "chat"] },
        type: { type: "STRING", enum: ["movie", "series", "channel", "any"] },
        titles: { type: "ARRAY", items: { type: "STRING" } },
        genres: { type: "ARRAY", items: { type: "STRING" } },
        language: { type: "STRING" },
        country: { type: "STRING" },
        keywords: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["intent", "type"]
};

function aiUnderstandPrompt(question, prev) {
    return "You classify one message sent to the AI assistant inside an Arabic IPTV player app "
        + "(movies, series, live TV channels, sports). Return only JSON.\n"
        + "- intent: sports (matches, fixtures, results, which channel shows a game), availability (is a specific title or channel on the server), "
        + "recommend (suggest something to watch), channel (find/play a TV channel), info (facts about a title, actor or story), chat (anything else).\n"
        + "- type: movie, series, channel or any.\n"
        + "- titles: specific titles or channel names the user means, each in its official original form (usually English) AND in Arabic when different. "
        + "Example: \"فيلم انسبشن\" -> [\"Inception\",\"انسبشن\"]; \"قناة الجزيرة\" -> [\"Al Jazeera\",\"الجزيرة\"].\n"
        + "- genres: subset of [action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, music, mystery, romance, scifi, thriller, war, western, biography, sport, kids].\n"
        + "- language: arabic, english, turkish, indian, korean, japanese, spanish, french, or empty. (مصري/خليجي/سوري/ليبي -> arabic, أجنبي/أمريكي -> english)\n"
        + "- country: production country code if requested (us, uk, eg, sa, sy, tr, in, kr, jp, fr, es ...) else empty.\n"
        + "- keywords: other useful search words in English and Arabic (team, league, actor), may be empty.\n"
        + "Use the previous conversation to resolve follow-ups like \"والمسلسلات؟\" or \"غيره\" or \"شغلها\".\n\n"
        + (prev ? "Previous conversation:\n" + prev + "\n\n" : "")
        + "Message: " + question;
}

async function aiCallGemini(apiKey, models, body) {
    let lastError = null;
    for (const m of Array.from(new Set(models))) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                lastError = new Error(errJson.error ? errJson.error.message : `HTTP ${res.status}`);
                // 404 نموذج غير موجود، 5xx ضغط مؤقت: جرّب النموذج التالي
                if (res.status === 404 || res.status >= 500) continue;
                throw lastError;
            }
            const data = await res.json();
            const candidate = data.candidates && data.candidates[0];
            const text = candidate && candidate.content && candidate.content.parts
                ? candidate.content.parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim() : "";
            if (!text) { lastError = new Error("empty reply"); continue; }
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
            return { text, sources };
        } catch (err) {
            lastError = err;
            if (/quota|rate limit|resource[_ ]?exhausted|\b429\b/i.test(String(err && err.message))) break;
        }
    }
    throw lastError || new Error("no model");
}

function aiThrowFriendly(err) {
    if (err instanceof HttpsError) throw err;
    logger.error("خطأ في توليد رد مساعد الميزو الذكي:", err);
    const msg = String((err && err.message) || "");
    if (/quota|rate limit|resource[_ ]?exhausted|too many requests|\b429\b/i.test(msg)) {
        throw new HttpsError("resource-exhausted", "وصل المساعد للحد المسموح من الطلبات حالياً. أعد المحاولة بعد قليل.");
    }
    throw new HttpsError("internal", "عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.");
}

function aiCleanHistory(history) {
    if (!Array.isArray(history)) return [];
    const out = [];
    for (const h of history.slice(-10)) {
        const role = h && h.role === "model" ? "model" : "user";
        const text = String((h && h.text) || "").slice(0, 2500);
        if (!text.trim()) continue;
        // Gemini يرفض دورين متتاليين لنفس الطرف: ندمجهما
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts[0].text += "\n" + text;
        else out.push({ role, parts: [{ text }] });
    }
    while (out.length && out[0].role !== "user") out.shift();
    return out;
}

async function aiHandleMode(request, apiKey) {
    const d = request.data || {};
    const uid = request.auth.uid;
    if (d.mode === "understand") {
        const question = String(d.question || "").slice(0, 1500);
        const prev = String(d.prev || "").slice(0, 2500);
        if (!question.trim()) throw new HttpsError("invalid-argument", "السؤال فارغ.");
        await enforceAiDailyLimit(uid, "aux");
        const r = await aiCallGemini(apiKey, ["gemini-2.5-flash-lite", "gemini-2.5-flash"], {
            contents: [{ role: "user", parts: [{ text: aiUnderstandPrompt(question, prev) }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 600, responseMimeType: "application/json", responseSchema: AI_INTENT_SCHEMA, thinkingConfig: { thinkingBudget: 0 } }
        });
        let intent = {};
        try { const a = r.text.indexOf("{"), b = r.text.lastIndexOf("}"); intent = JSON.parse(r.text.slice(a, b + 1)); } catch (e) { }
        return { intent };
    }
    if (d.mode === "transcribe") {
        const audio = String(d.audio || "");
        if (!audio || audio.length > 2500000) throw new HttpsError("invalid-argument", "التسجيل الصوتي طويل جداً. سجّل رسالة أقصر.");
        const mime = /^audio\/[a-z0-9.+-]+/i.test(String(d.mimeType || "")) ? String(d.mimeType).split(";")[0] : "audio/webm";
        await enforceAiDailyLimit(uid, "aux");
        let text = "";
        try {
            const r = await aiCallGemini(apiKey, ["gemini-2.5-flash", "gemini-2.0-flash"], {
                contents: [{ role: "user", parts: [
                    { text: "اكتب نص هذا التسجيل الصوتي حرفياً كما قاله المتحدث (غالباً بلهجة عربية ليبية أو غيرها)، دون أي إضافة أو شرح. أسماء الأفلام والقنوات الأجنبية اكتبها بحروفها الإنجليزية الأصلية. إن كان التسجيل صامتاً أو غير مفهوم فأعد نصاً فارغاً." },
                    { inlineData: { mimeType: mime, data: audio } }
                ] }],
                generationConfig: { temperature: 0, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } }
            });
            text = r.text;
        } catch (e) {
            if (!/empty reply/.test(String(e && e.message))) throw e;
        }
        return { text };
    }
    // mode === "answer"
    const question = String(d.question || "").slice(0, 1500);
    const context = String(d.context || "").slice(0, 30000);
    if (!question.trim()) throw new HttpsError("invalid-argument", "السؤال فارغ.");
    const remaining = await enforceAiDailyLimit(uid, "main");
    const contents = aiCleanHistory(d.history);
    const userText = (context ? context + "\n\n" : "") + "سؤال العميل: " + question;
    if (contents.length && contents[contents.length - 1].role === "user") contents.push({ role: "model", parts: [{ text: "..." }] });
    contents.push({ role: "user", parts: [{ text: userText }] });
    const body = {
        systemInstruction: { parts: [{ text: aiSystemPrompt() }] },
        contents,
        // نموذج تفكير: ميزانية التفكير تُحسب من الحد، فنتركه واسعاً ونضبط التفكير
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 1024 } }
    };
    // بحث جوجل حصته اليومية صغيرة: فقط لما يحتاج معلومة حية
    if (d.useSearch === true) body.tools = [{ googleSearch: {} }];
    const r = await aiCallGemini(apiKey, ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"], body);
    return { text: r.text, sources: r.sources, remaining };
}

exports.generateAiReply = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "يجب أن تكون مسجلاً للدخول لاستخدام هذه الخدمة.");
    }

    const mode = request.data && request.data.mode;
    if (mode === "understand" || mode === "transcribe" || mode === "answer") {
        try {
            return await aiHandleMode(request, GEMINI_API_KEY.value());
        } catch (err) {
            aiThrowFriendly(err);
        }
    }

    // المسار القديم: نسخ التطبيق المثبتة قبل العقل المشترك ترسل الطلب كاملاً
    const { model, contents, systemInstruction, tools, generationConfig } = request.data || {};
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new HttpsError("invalid-argument", "بيانات الطلب غير صالحة.");
    }
    // حماية حصة Gemini: كان أي عميل مسجّل يستطيع طلب أي نموذج (ومنها الغالية) بأي حجم وبلا حد
    if (contents.length > 60 || JSON.stringify(contents).length > 120000 ||
        JSON.stringify(systemInstruction || "").length > 40000) {
        throw new HttpsError("invalid-argument", "الطلب أكبر من المسموح.");
    }
    await enforceAiDailyLimit(request.auth.uid, "main");

    const apiKey = GEMINI_API_KEY.value();
    // النموذج الاحتياطي القديم gemini-1.5-flash أُوقف من جوجل ولم يعد موجوداً في v1beta،
    // فكان يرجع الخطأ "models/gemini-1.5-flash is not found" ويظهر نصه الخام للمستخدم.
    // سلسلة احتياطية حديثة ومدعومة، مع إزالة التكرار إن كان النموذج المطلوب ضمنها.
    const safeModel = AI_ALLOWED_MODELS.has(model) ? model : "gemini-2.5-flash";
    const modelsToTry = Array.from(new Set([
        safeModel,
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

// =============================================
// ترحيل أرباح الأسبوع للمستحقات من السيرفر (المنطق في rollover.js)
// =============================================
// كان الترحيل يعمل فقط حين يفتح المدير لوحة الإدارة: المندوب لا يملك صلاحية تعديل حسابه
// (firestore.rules)، فمحاولة صفحته تفشل بصمت. يعمل هنا كل ليلة 00:01 بتوقيت ليبيا، ولا يرحّل
// إلا حين يبدأ أسبوع جديد (حسب يوم البداية في القوانين). الترحيل في الصفحة يبقى احتياطاً،
// والاثنان لا يرحّلان مرتين (lastWeekStart).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");
const { runWeeklyRollover } = require("./rollover");

exports.weeklyProfitRollover = onSchedule({ schedule: "1 0 * * *", timeZone: "Africa/Tripoli" }, async () => {
    const results = await runWeeklyRollover(getFirestore(), Date.now());
    logger.info("weekly rollover", { rolled: results.length, results: results });
});

// =============================================
// سجل حذف العمليات (من السيرفر)
// =============================================
// المندوب يستطيع حذف عملياته، والتسجيل كان من جهازه فقط، فيمكن تجاوزه. هنا يُسجَّل كل حذف
// تلقائياً مع نسخة كاملة من العملية ومن حذفها، في سجل النشاط الذي تعرضه صفحة الأمان.
const { onDocumentDeletedWithAuthContext } = require("firebase-functions/v2/firestore");

exports.logTransactionDeleted = onDocumentDeletedWithAuthContext("transactions/{transactionId}", async (event) => {
    const data = event.data ? event.data.data() : null;
    if (!data) return;
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const byUid = event.authId || "";
    let byName = byUid;
    try {
        if (byUid) {
            const u = await fs().collection("customers").doc(byUid).get();
            if (u.exists) byName = [u.data().firstName, u.data().lastName].filter(Boolean).join(" ") || byUid;
        }
    } catch (e) { }
    const what = [data.product, data.duration].filter(Boolean).join(" - ") || data.reason || data.type || "";
    const amount = data.price || data.amount || "";
    await fs().collection("activity_logs").add({
        action: "transaction_deleted",
        category: "security",
        severity: "warning",
        title: "حذف عملية: " + String(what).slice(0, 120) + (amount ? " (" + amount + " د.ل)" : ""),
        details: {
            transactionId: event.params.transactionId,
            deletedBy: byName,
            deletedByUid: byUid,
            authType: event.authType || "",
            transaction: data
        },
        user: { uid: byUid, name: byName, phone: "", role: byUid === AI_ADMIN_UID ? "admin" : "staff" },
        page: "server",
        createdAt: Date.now(),
        timestamp: FieldValue.serverTimestamp()
    });
});
