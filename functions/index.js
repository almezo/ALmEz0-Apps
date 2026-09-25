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
const AI_ALLOWED_MODELS = new Set([
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest"
]);
const AI_DAILY_LIMIT = 80;
const AI_ADMIN_UID = "7Rfvdr6GpwPcY9uDQwX0fIuWeRv1";

function getRotatedGeminiKeys(rawVal) {
    const keys = String(rawVal || "").split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);
    if (!keys.length) return [];
    if (keys.length === 1) return keys;
    // تدوير عشوائي لتوزيع الأحمال وتفادي حظر الدقيقة مجاناً
    const startIdx = Math.floor(Math.random() * keys.length);
    return keys.slice(startIdx).concat(keys.slice(0, startIdx));
}

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

async function aiCallGemini(apiKeyRaw, models, body) {
    const keys = getRotatedGeminiKeys(apiKeyRaw);
    if (!keys.length) throw new Error("لم يتم ضبط مفتاح Gemini API في السيرفر.");
    const modelList = Array.from(new Set(models));
    let lastError = null;

    for (const m of modelList) {
        for (const key of keys) {
            try {
                let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                // إذا كان سبب 429 هو نفاد كوتة أداة بحث جوجل (Google Search Grounding)، نحذف الأداة ونعيد المحاولة فوراً بدون بحث!
                if (res.status === 429 && body && body.tools) {
                    logger.warn(`Google Search quota exceeded on model ${m}. Retrying without search tool...`);
                    delete body.tools;
                    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    });
                }

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson.error ? errJson.error.message : `HTTP ${res.status}`;
                    lastError = new Error(errMsg);
                    // 404 (موديل غير متوفر)، 429 (تجاوز كوتة الدقيقة)، 503/5xx (ضغط سيرفر مؤقت):
                    // ننتقل للمفتاح التالي أو الموديل التالي تلقائياً!
                    if (res.status === 404 || res.status === 429 || res.status >= 500) {
                        logger.warn(`Gemini fallback [model: ${m}, status: ${res.status}]: ${errMsg}`);
                        continue;
                    }
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
                logger.warn(`Gemini call error on model ${m}: ${err && err.message}`);
            }
        }
    }
    throw lastError || new Error("تعذر استلام رد من أي نموذج ذكاء اصطناعي.");
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
        try {
            const r = await aiCallGemini(apiKey, [
                "gemini-flash-lite-latest",
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-2.5-flash"
            ], {
                contents: [{ role: "user", parts: [{ text: aiUnderstandPrompt(question, prev) }] }],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 600,
                    responseMimeType: "application/json",
                    responseSchema: AI_INTENT_SCHEMA,
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });
            let intent = {};
            try { const a = r.text.indexOf("{"), b = r.text.lastIndexOf("}"); intent = JSON.parse(r.text.slice(a, b + 1)); } catch (e) { }
            return { intent };
        } catch (e) {
            // لا نوقف العميل إذا تعذر الفهم بالذكاء الاصطناعي بسبب ضغط الحصة، بل نرجع كائن فارغ ليعتمد على التخمين المحلي السريع
            logger.warn("فهم السؤال بالذكاء الاصطناعي تعذر، الاعتماد على التخمين المحلي:", e && e.message);
            return { intent: {} };
        }
    }
    if (d.mode === "transcribe") {
        const audio = String(d.audio || "");
        if (!audio || audio.length > 2500000) throw new HttpsError("invalid-argument", "التسجيل الصوتي طويل جداً. سجّل رسالة أقصر.");
        const mime = /^audio\/[a-z0-9.+-]+/i.test(String(d.mimeType || "")) ? String(d.mimeType).split(";")[0] : "audio/webm";
        await enforceAiDailyLimit(uid, "aux");
        let text = "";
        try {
            const r = await aiCallGemini(apiKey, [
                "gemini-flash-lite-latest",
                "gemini-3.5-flash-lite",
                "gemini-2.5-flash"
            ], {
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
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: d.useSearch ? 512 : 0 }
        }
    };
    if (d.useSearch === true) body.tools = [{ googleSearch: {} }];
    const r = await aiCallGemini(apiKey, [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-flash-latest"
    ], body);
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
    const safeModel = AI_ALLOWED_MODELS.has(model) ? model : "gemini-flash-lite-latest";
    const modelsToTry = Array.from(new Set([
        safeModel,
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-flash-latest",
    ]));

    try {
        const r = await aiCallGemini(apiKey, modelsToTry, { systemInstruction, contents, tools, generationConfig });
        return { text: r.text, sources: r.sources };
    } catch (err) {
        aiThrowFriendly(err);
    }
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
 * تنظيف فوري لجميع التنبيهات الأمنية القديمة المكشوفة في broadcast_notifications
 * وحذف أي وثيقة تحتوي على نوع security_alert أو موجهة للمدير targetUid === AI_ADMIN_UID
 */
async function purgeLegacySecurityAlerts(db) {
    let deletedCount = 0;
    try {
        const [snapKind, snapAdmin] = await Promise.all([
            db.collection("broadcast_notifications").where("kind", "==", "security_alert").get(),
            db.collection("broadcast_notifications").where("targetUid", "==", AI_ADMIN_UID).get()
        ]);
        const toDelete = new Map();
        snapKind.docs.forEach((d) => toDelete.set(d.id, d.ref));
        snapAdmin.docs.forEach((d) => toDelete.set(d.id, d.ref));

        if (toDelete.size > 0) {
            const batch = db.batch();
            toDelete.forEach((ref) => batch.delete(ref));
            await batch.commit();
            deletedCount = toDelete.size;
            logger.info("Purged exposed legacy security alerts from broadcast_notifications", { count: deletedCount });
        }
    } catch (err) {
        logger.error("Failed to purge legacy security alerts", { error: err.message });
    }
    return deletedCount;
}

let legacyAlertsCleaned = false;

// ذاكرة مؤقتة لمنع تكرار نفس التنبيه الأمني خلال 8 ثوانٍ إن استُدعي من السيرفر والعميل معاً
const recentAdminAlerts = new Map();

/**
 * تنبيه المدير بحدث أمني خطير:
 * يُحفظ في مجموعة خاصة ومستقلة حصرياً بالمدير (admin_security_alerts) مفصولة تماماً عن إعلانات العملاء
 * ويصل لهاتفه عبر FCM مع الصوت والاهتزاز وشريط الإشعارات حتى والتطبيق مغلق.
 */
async function logAlertAdmin(payload) {
    try {
        const now = Date.now();
        const dedupeKey = String(payload.publicIp || "") + "_" + String((payload.user && payload.user.phone) || "") + "_" + String(payload.action || "");
        if (dedupeKey.length > 5) {
            const lastTime = recentAdminAlerts.get(dedupeKey);
            if (lastTime && now - lastTime < 8000) return;
            recentAdminAlerts.set(dedupeKey, now);
            if (recentAdminAlerts.size > 200) {
                const oldestCutoff = now - 60000;
                for (const [k, v] of recentAdminAlerts.entries()) {
                    if (v < oldestCutoff) recentAdminAlerts.delete(k);
                }
            }
        }

        const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
        const body = (payload.user ? payload.user.name + (payload.user.phone ? " (" + payload.user.phone + ")" : "") : "مستخدم") +
            " • " + ((payload.device && payload.device.type) || "جهاز غير معروف") +
            (payload.publicIp ? " • " + payload.publicIp : "") +
            (payload.page ? " • " + payload.page : "");
        const alertTitle = "🚨 " + String(payload.title || "حدث أمني").slice(0, 120);
        const alertBody = body.slice(0, 240);

        const doc = await fs().collection("admin_security_alerts").add({
            type: "security",
            title: alertTitle,
            message: alertBody,
            actionUrl: "security-monitor.html",
            image: "",
            timestamp: now,
            createdAt: FieldValue.serverTimestamp(),
            senderUid: "system",
            active: true,
            targetUid: AI_ADMIN_UID,
            kind: "security_alert",
            logAction: payload.action,
            details: payload.details || {}
        });

        try {
            await getMessaging().send({
                topic: "u_" + AI_ADMIN_UID,
                notification: {
                    title: alertTitle,
                    body: alertBody
                },
                data: {
                    id: doc.id,
                    title: alertTitle,
                    message: alertBody,
                    actionUrl: "security-monitor.html",
                    ts: String(now)
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "almezo_broadcast_channel",
                        sound: "default",
                        defaultVibrateTimings: true,
                        priority: "high"
                    },
                    ttl: 24 * 60 * 60 * 1000
                }
            });
            logger.info("Admin security alert dispatched via FCM", { id: doc.id, title: alertTitle });
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

    // تنظيف تلقائي أولي للإشعارات الأمنية العالقة إن وُجدت
    if (!legacyAlertsCleaned) {
        legacyAlertsCleaned = true;
        purgeLegacySecurityAlerts(fs()).catch(() => { });
    }

    const ref = await fs().collection("activity_logs").add(payload);

    // تنبيه فوري للمدير على واتساب للأحداث الخطيرة فقط
    if (severity === "danger" && payload.category === "security") {
        await logAlertAdmin(payload);
    }
    return { ok: true, id: ref.id };
});

exports.cleanLegacySecurityAlerts = onCall(async (request) => {
    const uid = request.auth ? request.auth.uid : "";
    const { getFirestore: fs } = require("firebase-admin/firestore");
    const db = fs();
    const isAdmin = uid === AI_ADMIN_UID || (await db.collection("admins").doc(uid).get()).exists;
    if (!isAdmin) throw new HttpsError("permission-denied", "هذه العملية للمدير فقط.");
    const purged = await purgeLegacySecurityAlerts(db);
    return { ok: true, purged: purged };
});

// =============================================
// تنظيف سجل الحركات من السيرفر (احتفاظ 60 يوماً)
// =============================================
// كان التنظيف يعمل من متصفح المدير فقط ويحذف ما هو أقدم من 7 أيام، فتضيع الأدلة بسرعة،
// ولا يعمل أصلاً إن لم يفتح المدير الصفحة. الآن يعمل كل ليلة من السيرفر.
exports.cleanupActivityLogs = onSchedule({ schedule: "30 2 * * *", timeZone: "Africa/Tripoli" }, async () => {
    const { getFirestore: fs, Timestamp } = require("firebase-admin/firestore");
    const db = fs();
    await purgeLegacySecurityAlerts(db);
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
    let lockouts = 0;
    try { lockouts = await guardCleanup(db); } catch (e) { logger.warn("lockout cleanup failed", { error: e.message }); }
    logger.info("activity logs cleanup", { removed: removed, lockouts: lockouts });
});

// =============================================
// الحظر التصاعدي من السيرفر (حماية تسجيل الدخول)
// =============================================
// كان العدّ والحظر في متصفح العميل: من يمسح بيانات الموقع أو يفتح نافذة خفية أو يبدّل المتصفح
// يتجاوزه فوراً، وكتابة الحظر في قاعدة البيانات كانت تفشل أصلاً (القواعد تسمح للمدير وحده)،
// فلم تكن تظهر لك أي أجهزة محظورة. الآن السيرفر هو من يعدّ ويحظر، بثلاثة مفاتيح معاً:
// بصمة الجهاز، وعنوان IP، ورقم الهاتف المستهدف. والسلّم كما هو: 3 محاولات ثم
// دقيقة ← 5 ← 10 ← 30 ← 60 دقيقة ← 24 ساعة.
const GUARD_TIERS_SECONDS = [60, 300, 600, 1800, 3600, 86400];
const GUARD_MAX_ATTEMPTS = 3;

function guardFormatDuration(seconds) {
    if (seconds < 60) return seconds + " ثانية";
    if (seconds === 60) return "دقيقة واحدة";
    if (seconds < 3600) return Math.floor(seconds / 60) + " دقائق";
    if (seconds === 3600) return "ساعة واحدة";
    if (seconds < 86400) return Math.floor(seconds / 3600) + " ساعات";
    return "24 ساعة (يوم كامل)";
}

function guardKeys(d, ip) {
    const clean = (v, n) => String(v == null ? "" : v).replace(/[^\w.:@-]/g, "").slice(0, n);
    // المفاتيح: بصمة الجهاز وعنوان IP فقط. لا نحظر برقم الهاتف وحده، وإلا استطاع شخص أن
    // يحظر رقم عميل آخر عمداً بمحاولات فاشلة باسمه. الرقم يُحفظ للعرض في اللوحة فقط.
    const keys = [];
    const hw = clean(d.hw, 40);
    if (hw) keys.push("hw_" + hw);
    if (ip) keys.push("ip_" + clean(ip, 45).replace(/[.:]/g, "_"));
    return keys;
}

async function guardRead(db, keys) {
    if (!keys.length) return [];
    const snaps = await db.getAll(...keys.map((k) => db.collection("security_lockouts").doc(k)));
    return snaps.map((s, i) => ({ key: keys[i], ref: s.ref, data: s.exists ? s.data() : null }));
}

/**
 * حالة الحظر لهذا الطلب: أقوى حظر ساري بين مفاتيحه (جهاز، IP، رقم).
 * lift = رفع المدير للحظر يُلغي السريان.
 */
function guardActive(rows, now) {
    let best = null;
    for (const r of rows) {
        const d = r.data;
        if (!d || d.status === "lifted_by_admin") continue;
        const until = Number(d.lockedUntil) || 0;
        if (until > now && (!best || until > best.until)) {
            best = { until: until, tier: Number(d.tier) || 1, durationSeconds: Number(d.durationSeconds) || 60, key: r.key };
        }
    }
    return best;
}

exports.loginGuard = onCall(async (request) => {
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const db = fs();
    const d = request.data || {};
    const ip = logClientIp(request);
    const now = Date.now();
    const action = d.action === "fail" ? "fail" : (d.action === "success" ? "success" : "check");
    const keys = guardKeys(d, ip);
    if (!keys.length) return { locked: false, remainingSeconds: 0, attempts: 0, remainingAttempts: GUARD_MAX_ATTEMPTS };

    const rows = await guardRead(db, keys);

    // نجاح الدخول: تصفير العدّ لهذه المفاتيح (السلّم يعود للبداية) - يتطلب تسجيل دخول موثّق لمنع التلاعب
    if (action === "success") {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "لا يمكن تصفير الحظر دون تسجيل دخول موثّق.");
        }
        const batch = db.batch();
        rows.forEach((r) => {
            if (r.data) batch.set(r.ref, { attempts: 0, lockedUntil: 0, status: "cleared", tier: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch.commit();
        return { locked: false, remainingSeconds: 0, attempts: 0, remainingAttempts: GUARD_MAX_ATTEMPTS };
    }

    const active = guardActive(rows, now);
    if (active) {
        return {
            locked: true,
            remainingSeconds: Math.ceil((active.until - now) / 1000),
            durationSeconds: active.durationSeconds,
            formattedDuration: guardFormatDuration(active.durationSeconds),
            tierIndex: Math.max(0, active.tier - 1),
            attempts: GUARD_MAX_ATTEMPTS,
            remainingAttempts: 0
        };
    }

    if (action === "check") {
        const attempts = Math.max(0, ...rows.map((r) => (r.data && Number(r.data.attempts)) || 0));
        return { locked: false, remainingSeconds: 0, attempts: attempts, remainingAttempts: Math.max(0, GUARD_MAX_ATTEMPTS - attempts) };
    }

    // محاولة فاشلة: زيادة العدّاد على كل المفاتيح، والحظر عند بلوغ الحد
    const attempts = Math.max(0, ...rows.map((r) => (r.data && Number(r.data.attempts)) || 0)) + 1;
    const tierIndex = Math.max(0, ...rows.map((r) => (r.data && Number(r.data.tierIndex)) || 0));
    const device = logSanitizeDevice(d.device, ip);
    const batch = db.batch();

    if (attempts >= GUARD_MAX_ATTEMPTS) {
        const durationSeconds = GUARD_TIERS_SECONDS[Math.min(tierIndex, GUARD_TIERS_SECONDS.length - 1)];
        const lockedUntil = now + durationSeconds * 1000;
        rows.forEach((r) => {
            batch.set(r.ref, {
                key: r.key,
                hw: String(d.hw || "").slice(0, 40),
                phone: String(d.phone || "").slice(0, 20),
                ip: ip,
                device: device,
                attempts: 0,
                tierIndex: Math.min(tierIndex + 1, GUARD_TIERS_SECONDS.length - 1),
                tier: tierIndex + 1,
                durationSeconds: durationSeconds,
                formattedDuration: guardFormatDuration(durationSeconds),
                lockedUntil: lockedUntil,
                status: "active",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();

        // إشعار أمني فوري للمدير من السيرفر فور تفعيل الحظر لضمان وصوله حتى والتطبيق مغلق
        try {
            const alertPayload = {
                title: "حظر أمني مؤقت (" + guardFormatDuration(durationSeconds) + ") لـ " + (d.phone || "جهاز غير معروف"),
                action: "client_locked_out",
                category: "security",
                severity: "danger",
                user: {
                    uid: request.auth ? request.auth.uid : "",
                    name: d.phone ? "عميل (" + d.phone + ")" : "زائر غير مسجل",
                    phone: String(d.phone || "").slice(0, 20),
                    role: "visitor"
                },
                device: device,
                publicIp: ip,
                page: "login",
                details: {
                    attemptedPhone: String(d.phone || ""),
                    tier: tierIndex + 1,
                    durationSeconds: durationSeconds,
                    formattedDuration: guardFormatDuration(durationSeconds),
                    reason: "تكرار إدخال بيانات خاطئة (Brute-Force)"
                }
            };
            logAlertAdmin(alertPayload).catch((e) => logger.warn("loginGuard alert failed", { error: e.message }));
        } catch (e) { }

        return {
            locked: true,
            lockedNow: true,
            remainingSeconds: durationSeconds,
            durationSeconds: durationSeconds,
            formattedDuration: guardFormatDuration(durationSeconds),
            tierIndex: tierIndex,
            attempts: GUARD_MAX_ATTEMPTS,
            remainingAttempts: 0
        };
    }

    rows.forEach((r) => {
        batch.set(r.ref, {
            key: r.key,
            hw: String(d.hw || "").slice(0, 40),
            phone: String(d.phone || "").slice(0, 20),
            ip: ip,
            device: device,
            attempts: attempts,
            tierIndex: tierIndex,
            status: "counting",
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    });
    await batch.commit();
    return { locked: false, attempts: attempts, remainingAttempts: GUARD_MAX_ATTEMPTS - attempts, tierIndex: tierIndex };
});

/** رفع الحظر من لوحة المدير: يرفع كل مفاتيح الجهاز (بصمة، IP، رقم) دفعة واحدة. */
exports.liftLockout = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "غير مصرح.");
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const db = fs();
    const uid = request.auth.uid;
    const isAdmin = uid === AI_ADMIN_UID || (await db.collection("admins").doc(uid).get()).exists;
    if (!isAdmin) throw new HttpsError("permission-denied", "هذه العملية للمدير فقط.");

    const d = request.data || {};
    const hw = String(d.hw || "").slice(0, 40);
    const phone = String(d.phone || "").slice(0, 20);
    const ip = String(d.ip || "").slice(0, 45);
    const refs = [];
    if (hw) refs.push("hw_" + hw.replace(/[^\w-]/g, ""));
    if (ip) refs.push("ip_" + ip.replace(/[.:]/g, "_"));

    if (!refs.length) throw new HttpsError("invalid-argument", "لا يوجد جهاز محدد.");

    const batch = db.batch();
    refs.forEach((k) => {
        batch.set(db.collection("security_lockouts").doc(k), {
            status: "lifted_by_admin",
            lockedUntil: 0,
            attempts: 0,
            tierIndex: 0,
            liftedAt: FieldValue.serverTimestamp(),
            liftedBy: uid
        }, { merge: true });
    });
    await batch.commit();
    return { ok: true, lifted: refs.length };
});

/** تنظيف سجلات الحظر المنتهية (أقدم من 30 يوماً) مع تنظيف السجلات اليومي. */
async function guardCleanup(db) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const snap = await db.collection("security_lockouts").where("lockedUntil", "<", cutoff).limit(300).get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return snap.size;
}

// =============================================
// إشعار تلقائي عند صدور نسخة جديدة من البرنامج
// =============================================
// يفحص version.json كل ساعة. عند تغيّر رقم النسخة يُنشئ إشعاراً عاماً واحداً، فيصل تلقائياً
// إلى شريط إشعارات أندرويد (عبر pushBroadcastNotification)، ويظهر داخل الموقع وبرنامج
// الكمبيوتر وفي سجل الإشعارات. آخر نسخة أُعلن عنها محفوظة حتى لا يتكرر الإشعار.
/** يقارن رقمي نسخة: 1 إن كان a أحدث، -1 إن كان أقدم، 0 إن تساويا. */
function versionCompare(a, b) {
    const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
}

const VERSION_SOURCES = [
    "https://almezo.store/version.json",
    "https://raw.githubusercontent.com/almezo/ALmEz0-Downloads/main/version.json"
];

exports.announceNewVersion = onSchedule({ schedule: "15 * * * *", timeZone: "Africa/Tripoli" }, async () => {
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const db = fs();

    let info = null;
    for (const url of VERSION_SOURCES) {
        try {
            const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
            if (!res.ok) continue;
            info = await res.json();
            if (info && info.version) break;
        } catch (e) { }
    }
    if (!info || !info.version) {
        logger.warn("version check failed: no source reachable");
        return;
    }

    const version = String(info.version).slice(0, 20);
    const stateRef = db.collection("systemSettings").doc("versionAnnounce");
    const state = await stateRef.get();
    const last = state.exists ? String(state.data().version || "") : "";
    // أحدث فقط: لو تعذّر الوصول للموقع وقرأنا مصدراً احتياطياً قديماً، لا نعلن نسخة أقدم
    if (last && versionCompare(version, last) <= 0) return;

    const mandatory = String(info.minSupportedVersion || "") === version;
    const now = Date.now();
    const notes = String(info.notes || "").slice(0, 240);
    await db.collection("broadcast_notifications").add({
        type: "update",
        title: "🚀 تحديث جديد: نسخة " + version + (mandatory ? " (إلزامي)" : ""),
        message: notes || "صدرت نسخة جديدة من تطبيق وبرنامج سيرفرات الميزو. حدّث الآن لتحصل على آخر المزايا.",
        actionUrl: "https://almezo.store",
        image: "",
        timestamp: now,
        createdAt: FieldValue.serverTimestamp(),
        senderUid: "system",
        active: true,
        pending: false,
        scheduledFor: 0,
        targetUid: "",
        kind: "app_update",
        appVersion: version
    });
    await stateRef.set({ version: version, announcedAt: now, mandatory: mandatory }, { merge: true });
    logger.info("new version announced", { version: version, mandatory: mandatory });
});

// =============================================
// حذف حساب عميل نهائياً (من لوحة المدير)
// =============================================
// الحذف من قاعدة البيانات وحده لا يكفي: يبقى حساب الدخول في Firebase Auth فيستطيع صاحبه
// تسجيل الدخول بحساب بلا بيانات، ولا يستطيع أحد التسجيل برقمه من جديد. هذه الدالة تحذف
// الاثنين معاً، وتمنع حذف حساب المدير أو حذف المدير لنفسه، وتسجّل العملية في سجل الحركات.
exports.deleteCustomer = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "غير مصرح.");
    const { getFirestore: fs, FieldValue } = require("firebase-admin/firestore");
    const { getAuth } = require("firebase-admin/auth");
    const db = fs();
    const uid = request.auth.uid;
    const isAdmin = uid === AI_ADMIN_UID || (await db.collection("admins").doc(uid).get()).exists;
    if (!isAdmin) throw new HttpsError("permission-denied", "هذه العملية للمدير فقط.");

    const target = String((request.data && request.data.uid) || "").slice(0, 64);
    if (!target) throw new HttpsError("invalid-argument", "لم يُحدَّد الحساب.");
    if (target === AI_ADMIN_UID) throw new HttpsError("permission-denied", "لا يمكن حذف حساب المدير الرئيسي.");
    if (target === uid) throw new HttpsError("permission-denied", "لا يمكنك حذف حسابك أنت.");
    if ((await db.collection("admins").doc(target).get()).exists) {
        throw new HttpsError("permission-denied", "هذا حساب مدير. أزل صلاحيته أولاً ثم احذفه.");
    }

    const snap = await db.collection("customers").doc(target).get();
    const data = snap.exists ? snap.data() : {};
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || "بدون اسم";
    const phone = String(data.phone || "");

    // 1) حساب الدخول
    let authDeleted = false;
    try {
        await getAuth().deleteUser(target);
        authDeleted = true;
    } catch (err) {
        if (err && err.code !== "auth/user-not-found") {
            logger.error("delete auth user failed", { target: target, error: err.message });
            throw new HttpsError("internal", "تعذر حذف حساب الدخول: " + err.message);
        }
    }

    // 2) بيانات العميل وما يتعلق به
    await db.collection("customers").doc(target).delete();
    try {
        const subs = await db.collection("user_subscriptions").where("uid", "==", target).limit(50).get();
        if (!subs.empty) {
            const b = db.batch();
            subs.docs.forEach((d) => b.delete(d.ref));
            await b.commit();
        }
    } catch (e) { }

    // 3) سجل الحركة
    await db.collection("activity_logs").add({
        action: "admin_delete_customer",
        category: "admin",
        severity: "danger",
        title: "حذف حساب عميل نهائياً: " + name + (phone ? " (" + phone + ")" : ""),
        details: { targetUid: target, name: name, phone: phone, city: String(data.city || ""), authDeleted: authDeleted },
        user: { uid: uid, name: "المدير", phone: "", role: "admin" },
        device: {},
        publicIp: logClientIp(request),
        hardwareFingerprint: "",
        page: "admin",
        url: "",
        createdAt: Date.now(),
        timestamp: FieldValue.serverTimestamp(),
        clientTime: ""
    });

    return { ok: true, name: name, authDeleted: authDeleted };
});
