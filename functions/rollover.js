// =============================================
// ترحيل أرباح الأسبوع للمستحقات — بداية الأسبوع بتوقيت ليبيا
// =============================================
// كان الترحيل يعمل فقط حين يفتح المدير لوحة الإدارة: المندوب لا يملك صلاحية تعديل حسابه
// (firestore.rules)، فمحاولة صفحته تفشل بصمت، ويبقى ربح الأسبوع الماضي غير مرحَّل حتى يفتح
// المدير اللوحة. هنا يُرحَّل في وقته من السيرفر. المنطق مطابق لـ rolloverUnpaidWeeklyProfit
// في firebase-config.js (الذي يبقى احتياطاً)، والاثنان لا يرحّلان مرتين (lastWeekStart).
// يعمل كل ليلة 00:01، ولا يفعل شيئاً إلا حين يبدأ أسبوع جديد (فيتبع يوم بداية الأسبوع في القوانين).
const { Timestamp } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const LIBYA_OFFSET_MS = 2 * 60 * 60 * 1000; // ليبيا UTC+2 طوال العام
const DEFAULT_RULES = {
    commissions: { iptv_3m: 9, iptv_6m: 12, iptv_12m: 15, smart_12m: 10, smart_life: 20, vip_default: 7.5 },
    profitSharing: {
        mode: "equal",
        eligibleStaff: ["اسلام", "ايوب", "اسامه"],
        customPercents: { "اسلام": 33.33, "ايوب": 33.33, "اسامه": 33.34 },
        excludedStaff: ["ابراهيم"]
    },
    weekCycle: { startDay: 6, autoRollover: true }
};

function mergeRules(data) {
    const d = data || {};
    return {
        commissions: Object.assign({}, DEFAULT_RULES.commissions, d.commissions || {}),
        profitSharing: Object.assign({}, DEFAULT_RULES.profitSharing, d.profitSharing || {}),
        weekCycle: Object.assign({}, DEFAULT_RULES.weekCycle, d.weekCycle || {})
    };
}

function commissionFor(productName, duration, storedCategory, rules, catMap) {
    if (!productName || !duration) return 0;
    const c = rules.commissions;
    let cat = storedCategory || catMap[productName] || null;
    if (!cat) {
        const dur = String(duration).toLowerCase();
        const prod = String(productName).toUpperCase();
        if (dur.includes("مدى") || dur.includes("life")) cat = "smart";
        else if (dur.includes("12") || dur.includes("سنة") || dur.includes("عام")) cat = "iptv";
        else if (prod.includes("VIP") || productName.includes("1") || productName.includes("2")) cat = "vip";
        else cat = "iptv";
    }
    const d = String(duration);
    if (cat === "iptv") {
        if (d.includes("3")) return Number(c.iptv_3m) || 0;
        if (d.includes("6")) return Number(c.iptv_6m) || 0;
        if (d.includes("12") || d.includes("سنة") || d.includes("عام")) return Number(c.iptv_12m) || 0;
        return 0;
    }
    if (cat === "smartApps" || cat === "smart") {
        if (d.includes("12") || d.includes("سنة") || d.includes("عام")) return Number(c.smart_12m) || 0;
        if (d.includes("مدى") || d.toLowerCase().includes("life")) return Number(c.smart_life) || 0;
        return 0;
    }
    if (cat === "vip") return Number(c.vip_default) || 0;
    return 0;
}

function saleCommission(t, rules, catMap) {
    if (!t || t.type !== "sale") return 0;
    if (String(t.method || "").trim() === "دين") return 0;
    if (typeof t.commission === "number" && !isNaN(t.commission)) return t.commission;
    if (t.points !== undefined && t.points !== null) return Number(t.points) || 0;
    return commissionFor(t.product, t.duration, t.category, rules, catMap);
}

function staffShare(name, total, rules) {
    const s = rules.profitSharing;
    if ((s.excludedStaff || []).some((ex) => name.includes(ex))) return 0;
    const eligible = s.eligibleStaff || [];
    const matched = eligible.find((el) => name.includes(el));
    if (!matched) return 0;
    if (s.mode === "custom") {
        const pct = (s.customPercents && s.customPercents[matched] !== undefined)
            ? Number(s.customPercents[matched]) : (100 / Math.max(1, eligible.length));
        return total * ((Number(pct) || 0) / 100);
    }
    return total / Math.max(1, eligible.length);
}

/** مفتاح الأسبوع (تاريخ يوم بدايته YYYY-MM-DD بتوقيت ليبيا)، مطابق لـ getCurrentWeekKey. */
function libyaWeekKey(ms, startDay) {
    const local = new Date(ms + LIBYA_OFFSET_MS);
    const day = local.getUTCDay();
    const diff = day >= startDay ? day - startDay : day + 7 - startDay;
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diff));
    return start.toISOString().slice(0, 10);
}

/** لحظة بداية أسبوع (منتصف الليل بتوقيت ليبيا) من مفتاحه. */
function weekKeyToMs(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - LIBYA_OFFSET_MS;
}

/** ترحيل كل المناديب إلى الأسبوع الحالي. مُصدَّر للاختبار أيضاً. */
async function runWeeklyRollover(db, nowMs) {
    const rulesSnap = await db.collection("systemSettings").doc("staffRules").get();
    const rules = mergeRules(rulesSnap.exists ? rulesSnap.data() : null);
    if (rules.weekCycle.autoRollover === false) return [];
    const startDayRaw = Number(rules.weekCycle.startDay);
    const startDay = isNaN(startDayRaw) ? 6 : startDayRaw;
    const currentKey = libyaWeekKey(nowMs, startDay);

    const catMap = {};
    (await db.collection("products").get()).forEach((doc) => {
        const p = doc.data();
        if (p && p.name) catMap[p.name] = p.category;
    });

    const results = [];
    const staffSnap = await db.collection("customers").where("role", "==", "staff").get();
    for (const staffDoc of staffSnap.docs) {
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(staffDoc.ref);
                const data = snap.data() || {};
                if (data.lastWeekStart === currentKey) return;
                const name = String(data.firstName || data.name || "");

                if ((rules.profitSharing.excludedStaff || []).some((ex) => name.includes(ex))) {
                    tx.update(staffDoc.ref, { duesOwed: 0, baseProfit: 0, profitAdvance: 0, lastWeekStart: currentKey, balanceUndo: [], balanceRedo: [] });
                    return;
                }
                const eligible = (rules.profitSharing.eligibleStaff || []).some((el) => name.includes(el));
                if (!eligible || !data.lastWeekStart) {
                    tx.update(staffDoc.ref, { lastWeekStart: currentKey });
                    return;
                }

                let dues = parseFloat(data.duesOwed) || 0;
                let baseProfit = parseFloat(data.baseProfit) || 0;
                let advance = parseFloat(data.profitAdvance) || 0;
                let cursorKey = data.lastWeekStart;
                let guard = 0;
                while (cursorKey !== currentKey && guard < 104) {
                    guard++;
                    const startMs = weekKeyToMs(cursorKey);
                    const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
                    const weekSnap = await db.collection("transactions")
                        .where("timestamp", ">=", Timestamp.fromMillis(startMs))
                        .where("timestamp", "<", Timestamp.fromMillis(endMs))
                        .get();
                    let weekTotal = 0;
                    weekSnap.forEach((d) => { weekTotal += saleCommission(d.data(), rules, catMap); });
                    dues += staffShare(name, weekTotal, rules) + baseProfit - advance;
                    baseProfit = 0;
                    advance = 0;
                    cursorKey = libyaWeekKey(endMs, startDay);
                }

                const update = { duesOwed: dues < 0 ? 0 : dues, baseProfit: 0, profitAdvance: 0, lastWeekStart: currentKey, balanceUndo: [], balanceRedo: [] };
                if (dues < 0) update.baseCash = (parseFloat(data.baseCash) || 0) + (-dues);
                tx.update(staffDoc.ref, update);
                results.push({ staff: staffDoc.id, name: name, duesOwed: update.duesOwed });
            });
        } catch (err) {
            logger.error("rollover failed", { staff: staffDoc.id, error: err.message });
        }
    }
    return results;
}

module.exports = { libyaWeekKey, weekKeyToMs, saleCommission, staffShare, commissionFor, runWeeklyRollover };
