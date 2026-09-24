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
    // حد يومي لكل حساب: كان أي عميل مسجّل يستطيع إغراق رقم المدير برسائل بلا حد
    if (request.auth.uid !== "7Rfvdr6GpwPcY9uDQwX0fIuWeRv1") {
        const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
        const day = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
        const ref = fs().collection("wa_usage").doc(request.auth.uid + "_" + day);
        const n = await fs().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const c = (snap.exists ? snap.data().count : 0) || 0;
            if (c < 25) tx.set(ref, { uid: request.auth.uid, day: day, count: FieldValue.increment(1) }, { merge: true });
            return c;
        });
        if (n >= 25) throw new HttpsError("resource-exhausted", "تم تجاوز الحد اليومي للإشعارات.");
    }
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
    // المجدول يُرسَل في وقته من sendScheduledNotifications، والشخصي يُرسَل لموضوع صاحبه وحده
    if (doc.pending === true || doc.targetUid) return;

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

// =============================================
// الإشعارات المجدولة
// =============================================
// إشعار يُكتب بـ pending=true وscheduledFor لا يظهر للعملاء. هذه الدالة تعمل كل خمس دقائق،
// فتفتح كل إشعار حان وقته (pending=false) فيصل فوراً لكل الأجهزة، ويُرسل Push لأندرويد.
exports.sendScheduledNotifications = onSchedule({ schedule: "*/5 * * * *", timeZone: "Africa/Tripoli" }, async () => {
    const { getFirestore: fs } = require("firebase-admin/firestore");
    const now = Date.now();
    const snap = await fs().collection("broadcast_notifications")
        .where("pending", "==", true)
        .where("scheduledFor", "<=", now)
        .limit(20)
        .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
        const d = doc.data() || {};
        // وقت الظهور = وقت الإرسال الفعلي، حتى تبدأ نافذة الـ48 ساعة من الآن
        await doc.ref.update({ pending: false, timestamp: now, sentAt: now });
        try {
            await getMessaging().send({
                topic: "broadcast",
                data: {
                    id: doc.id,
                    title: String(d.title || "سيرفرات الميزو"),
                    message: String(d.message || ""),
                    actionUrl: String(d.actionUrl || ""),
                    ts: String(now)
                },
                android: { priority: "high", ttl: 48 * 60 * 60 * 1000 }
            });
        } catch (err) {
            logger.error("scheduled push failed", { id: doc.id, error: err.message });
        }
        logger.info("scheduled notification sent", { id: doc.id, title: d.title });
    }
});

// =============================================
// تنبيهات قرب انتهاء اشتراك العميل
// =============================================
// المشغل يحفظ لكل سيرفر عند العميل سطراً في user_subscriptions (تاريخ الانتهاء واسم السيرفر).
// هذه الدالة تعمل يومياً 10 صباحاً بتوقيت ليبيا وترسل: قبل أسبوع، وقبل 3 أيام، وقبل يوم، وعند
// الانتهاء. كل مرحلة ترسل مرة واحدة فقط (notified)، والتجريبي لا يُحفظ أصلاً (المشغل يتجاهل
// المدد الأقصر من أسبوع). الاشتراك المهجور 60 يوماً أو المنتهي منذ 30 يوماً يُحذف.
const EXPIRY_STAGES = [
    { key: "d7", days: 7, title: "اشتراكك ينتهي بعد أسبوع ⏳", body: (s) => `اشتراك ${s} ينتهي بعد 7 أيام. جدّد الآن حتى لا تنقطع المشاهدة.` },
    { key: "d3", days: 3, title: "اشتراكك ينتهي بعد 3 أيام ⏳", body: (s) => `اشتراك ${s} ينتهي بعد 3 أيام. تواصل معنا للتجديد.` },
    { key: "d1", days: 1, title: "اشتراكك ينتهي غداً ⚠️", body: (s) => `اشتراك ${s} ينتهي غداً. جدّده اليوم لتستمر المشاهدة بلا انقطاع.` },
    { key: "d0", days: 0, title: "انتهى اشتراكك ❌", body: (s) => `انتهى اشتراك ${s}. تواصل معنا الآن للتجديد واستعادة القنوات والأفلام.` }
];

exports.subscriptionExpiryReminders = onSchedule({ schedule: "0 10 * * *", timeZone: "Africa/Tripoli" }, async () => {
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const db = fs();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // كل الاشتراكات التي انتهت أو تنتهي خلال 8 أيام
    const snap = await db.collection("user_subscriptions")
        .where("expiresAt", "<=", now + 8 * DAY)
        .limit(2000)
        .get();

    let sent = 0, removed = 0;
    for (const doc of snap.docs) {
        const d = doc.data() || {};
        const expiresAt = Number(d.expiresAt) || 0;
        const updatedAt = Number(d.updatedAt) || 0;

        // اشتراك منتهٍ منذ 30 يوماً، أو لم يُفتح في المشغل منذ 60 يوماً: يُحذف
        if (expiresAt < now - 30 * DAY || updatedAt < now - 60 * DAY) {
            await doc.ref.delete();
            removed++;
            continue;
        }
        if (!d.uid || !expiresAt) continue;

        const daysLeft = Math.ceil((expiresAt - now) / DAY);
        const stage = EXPIRY_STAGES.find((st) => (st.days === 0 ? daysLeft <= 0 : daysLeft === st.days));
        if (!stage) continue;
        const notified = d.notified || {};
        if (notified[stage.key]) continue;

        const serverName = String(d.serverName || "الميزو").slice(0, 60);
        await db.collection("broadcast_notifications").add({
            type: "general",
            title: stage.title,
            message: stage.body(serverName),
            actionUrl: "",
            image: "",
            timestamp: now,
            createdAt: FieldValue.serverTimestamp(),
            senderUid: "system",
            active: true,
            pending: false,
            scheduledFor: 0,
            // إشعار شخصي: لا يظهر إلا لصاحبه
            targetUid: d.uid,
            kind: "subscription_expiry"
        });
        try {
            await getMessaging().send({
                topic: "u_" + d.uid,
                data: { id: "exp_" + doc.id + "_" + stage.key, title: stage.title, message: stage.body(serverName), actionUrl: "", ts: String(now) },
                android: { priority: "high", ttl: 48 * 60 * 60 * 1000 }
            });
        } catch (err) {
            logger.error("expiry push failed", { sub: doc.id, error: err.message });
        }
        await doc.ref.update({ ["notified." + stage.key]: true });
        sent++;
    }
    logger.info("subscription expiry reminders", { checked: snap.size, sent: sent, removed: removed });
});

// =============================================
// تسجيل الحركات من السيرفر (غرفة المراقبة)
// =============================================
// كان كل جهاز يكتب السجل بنفسه مباشرة في activity_logs، فكان بالإمكان تزوير سجلات بأي اسم،
// أو إغراق السجل، أو تخطّي التسجيل كلياً بتعديل نسخة الموقع. الآن الكتابة من السيرفر وحده:
// - الاسم والرقم والدور تُقرأ من حساب المرسل في قاعدة البيانات، لا مما أرسله الجهاز.
// - عنوان IP يؤخذ من الاتصال نفسه فلا يُزوَّر.
// - حد يومي لكل حساب وجهاز يمنع الإغراق.
// - الأحداث الخطيرة تُرسل تنبيهاً فورياً للمدير على واتساب.
const LOG_DAILY_LIMIT_USER = 400;      // لكل حساب مسجّل
const LOG_DAILY_LIMIT_ANON = 120;      // لكل جهاز زائر غير مسجّل
const LOG_ALERT_DAILY_LIMIT = 12;      // أقصى عدد تنبيهات واتساب في اليوم

function logClientIp(request) {
    try {
        const req = request.rawRequest || {};
        const fwd = String((req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "");
        const ip = fwd.split(",")[0].trim() || req.ip || "";
        return ip.replace(/^::ffff:/, "").slice(0, 45);
    } catch (e) {
        return "";
    }
}

async function logEnforceQuota(key, limit) {
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const day = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const ref = fs().collection("log_usage").doc(key + "_" + day);
    const n = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const c = (snap.exists ? snap.data().count : 0) || 0;
        if (c < limit) tx.set(ref, { key: key, day: day, count: FieldValue.increment(1) }, { merge: true });
        return c;
    });
    return n < limit;
}

/** بيانات صاحب الحركة من قاعدة البيانات نفسها، لا من الجهاز. */
async function logResolveUser(uid) {
    if (!uid) return { uid: "", name: "زائر غير مسجل", phone: "", role: "visitor" };
    const { getFirestore: fs } = require("firebase-admin/firestore");
    if (uid === AI_ADMIN_UID) return { uid: uid, name: "المدير", phone: "", role: "admin" };
    try {
        const [cust, adm] = await Promise.all([
            fs().collection("customers").doc(uid).get(),
            fs().collection("admins").doc(uid).get()
        ]);
        const d = cust.exists ? cust.data() : {};
        const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || d.name || (d.phone ? "عميل (" + d.phone + ")" : "مستخدم");
        const role = adm.exists ? "admin" : (d.role === "staff" ? "staff" : "customer");
        return { uid: uid, name: String(name).slice(0, 80), phone: String(d.phone || "").slice(0, 20), role: role };
    } catch (e) {
        return { uid: uid, name: "مستخدم", phone: "", role: "customer" };
    }
}

/** تفاصيل الحركة بحدود آمنة: 40 مفتاحاً، ونصوص قصيرة، وعمق ثلاث طبقات. */
function logTrimDetails(value, depth) {
    const d = depth || 0;
    if (value === null || value === undefined) return "";
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return value.slice(0, 500);
    if (Array.isArray(value)) return d >= 3 ? [] : value.slice(0, 20).map((v) => logTrimDetails(v, d + 1));
    if (typeof value === "object") {
        if (d >= 3) return {};
        const out = {};
        Object.keys(value).slice(0, 40).forEach((k) => { out[String(k).slice(0, 60)] = logTrimDetails(value[k], d + 1); });
        return out;
    }
    return "";
}

function logSanitizeDevice(device, ip) {
    const d = device && typeof device === "object" ? device : {};
    const pick = (v, n) => String(v == null ? "" : v).slice(0, n);
    return {
        os: pick(d.os, 40),
        browser: pick(d.browser, 60),
        type: pick(d.type, 60),
        appPlatform: pick(d.appPlatform, 20),
        screen: pick(d.screen, 20),
        visitorId: pick(d.visitorId, 40),
        hardwareFingerprint: pick(d.hardwareFingerprint, 40),
        publicIp: ip,
        country: pick(d.country, 40),
        city: pick(d.city, 40),
        isp: pick(d.isp, 80),
        userAgent: pick(d.userAgent, 300)
    };
}

/**
 * تنبيه المدير بحدث أمني خطير عبر نظام إشعارات الميزو نفسه:
 * إشعار شخصي موجّه له وحده يظهر داخل الموقع والبرنامج، ويصل لهاتفه عبر FCM حتى والتطبيق مغلق.
 */
async function logAlertAdmin(payload) {
    try {
        if (!(await logEnforceQuota("alerts", LOG_ALERT_DAILY_LIMIT))) return;
        const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
        const now = Date.now();
        const body = payload.user.name + (payload.user.phone ? " (" + payload.user.phone + ")" : "") +
            " • " + (payload.device.type || "جهاز غير معروف") +
            (payload.publicIp ? " • " + payload.publicIp : "") +
            (payload.page ? " • " + payload.page : "");
        const doc = await fs().collection("broadcast_notifications").add({
            type: "general",
            title: "🚨 " + String(payload.title || "حدث أمني").slice(0, 120),
            message: body.slice(0, 240),
            actionUrl: "",
            image: "",
            timestamp: now,
            createdAt: FieldValue.serverTimestamp(),
            senderUid: "system",
            active: true,
            pending: false,
            scheduledFor: 0,
            targetUid: AI_ADMIN_UID,
            kind: "security_alert",
            logAction: payload.action
        });
        try {
            await getMessaging().send({
                topic: "u_" + AI_ADMIN_UID,
                data: { id: doc.id, title: "🚨 تنبيه أمني", message: body.slice(0, 240), actionUrl: "security-monitor.html", ts: String(now) },
                android: { priority: "high", ttl: 24 * 60 * 60 * 1000 }
            });
        } catch (err) {
            logger.warn("security alert push failed", { error: err.message });
        }
    } catch (err) {
        logger.warn("security alert failed", { error: err.message });
    }
}

exports.logEvent = onCall(async (request) => {
    const d = request.data || {};
    const uid = request.auth ? request.auth.uid : "";
    const ip = logClientIp(request);
    const device = logSanitizeDevice(d.device, ip);

    // حد يومي: للحساب إن كان مسجّلاً، وإلا لبصمة جهازه
    const quotaKey = uid ? "u_" + uid : "d_" + (device.hardwareFingerprint || device.visitorId || ip || "anon");
    if (!(await logEnforceQuota(quotaKey, uid ? LOG_DAILY_LIMIT_USER : LOG_DAILY_LIMIT_ANON))) {
        return { ok: false, reason: "quota" };
    }

    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const user = await logResolveUser(uid);
    const severity = ["info", "warning", "danger", "success"].includes(d.severity) ? d.severity : "info";
    const details = (d.details && typeof d.details === "object" && !Array.isArray(d.details)) ? d.details : {};
    const payload = {
        action: String(d.action || "unknown_action").slice(0, 80),
        category: String(d.category || "visitor").slice(0, 30),
        severity: severity,
        title: String(d.title || "حركة غير معروفة").slice(0, 400),
        details: logTrimDetails(details),
        user: user,
        device: device,
        publicIp: ip,
        hardwareFingerprint: device.hardwareFingerprint,
        page: String(d.page || "").slice(0, 60),
        url: String(d.url || "").slice(0, 300),
        createdAt: Date.now(),
        timestamp: FieldValue.serverTimestamp(),
        clientTime: String(d.clientTime || "").slice(0, 40)
    };

    const ref = await fs().collection("activity_logs").add(payload);

    // تنبيه فوري للمدير على واتساب للأحداث الخطيرة فقط
    if (severity === "danger" && payload.category === "security") {
        await logAlertAdmin(payload);
    }
    return { ok: true, id: ref.id };
});

// =============================================
// تنظيف سجل الحركات من السيرفر (احتفاظ 60 يوماً)
// =============================================
// كان التنظيف يعمل من متصفح المدير فقط ويحذف ما هو أقدم من 7 أيام، فتضيع الأدلة بسرعة،
// ولا يعمل أصلاً إن لم يفتح المدير الصفحة. الآن يعمل كل ليلة من السيرفر.
exports.cleanupActivityLogs = onSchedule({ schedule: "30 2 * * *", timeZone: "Africa/Tripoli" }, async () => {
    const { getFirestore: fs, Timestamp } = require("firebase-admin/firestore");
    const db = fs();
    const cutoff = Timestamp.fromMillis(Date.now() - 60 * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (let round = 0; round < 40; round++) {
        const snap = await db.collection("activity_logs").where("timestamp", "<", cutoff).limit(450).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        removed += snap.size;
        if (snap.size < 450) break;
    }
    // عدّادات الحدّ اليومي القديمة
    const oldUsage = await db.collection("log_usage")
        .where("day", "<", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10))
        .limit(400).get();
    if (!oldUsage.empty) {
        const b = db.batch();
        oldUsage.docs.forEach((doc) => b.delete(doc.ref));
        await b.commit();
    }
    logger.info("activity logs cleanup", { removed: removed });
});
