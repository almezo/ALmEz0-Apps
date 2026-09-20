/**
 * يبني فهرس شعارات القنوات المدمج في التطبيق من قاعدة iptv-org المفتوحة.
 *
 * السيرفرات التي يستعملها العملاء لا ترسل شعارات القنوات (حقل stream_icon فارغ)، فتظهر كل
 * القنوات بالشعار الافتراضي. هنا نجمع بين ملفين عامين:
 *   channels.json : أسماء القنوات وأسماؤها البديلة (بالعربية والإنجليزية) وبلدها
 *   logos.json    : روابط الشعارات لكل قناة
 * والناتج ملف واحد مضغوط الشكل (اسم مُطبَّع -> رابط الشعار) يُحزم في assets داخل التطبيق،
 * فلا يحمّل جهاز العميل شيئاً ويعمل الفهرس فوراً وبلا إنترنت.
 *
 * التشغيل: node scripts/build-channel-logos.js
 * يُعاد تشغيله يدوياً حين نريد تحديث الشعارات (مرة كل عدة أشهر تكفي).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';
const LOGOS_URL = 'https://iptv-org.github.io/api/logos.json';
const OUT = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'channel_logos.json');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(new Error(url + ' -> HTTP ' + res.statusCode));
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

/**
 * نفس تطبيع الأسماء في التطبيق (ChannelLogos.normalize): حروف صغيرة، بلا تشكيل، بلا رموز،
 * وبلا بادئات الدول ولواحق الجودة التي تضيفها لوحات Xtream مثل "AR| beIN Sports 1 FHD".
 */
const QUALITY = /\b(hd|fhd|uhd|sd|4k|8k|1080p?|720p?|h265|hevc|raw|backup|multi|vip|plus)\b/g;
function normalize(name) {
    if (!name) return '';
    let s = String(name).toLowerCase();
    s = s.replace(/^[a-z]{2,3}\s*[|:\-]\s*/i, '');      // بادئة الدولة: AR| أو EG:
    s = s.replace(/^\[[^\]]*\]\s*/, '');                  // بادئة بين أقواس مربعة
    s = s.replace(/[ـً-ْ]/g, '');          // تطويل وتشكيل عربي
    s = s.replace(/[آأإ]/g, 'ا');     // آ أ إ -> ا
    s = s.replace(/ة/g, 'ه');                   // ة -> ه
    s = s.replace(/[ىي]/g, 'ي');           // ى -> ي
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');              // رموز -> فراغ
    s = s.replace(QUALITY, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

/** الشعار الأفضل للقناة: PNG قيد الاستعمال وبأبعاد معقولة. */
function pickLogo(list) {
    let best = null, bestScore = -1;
    for (const l of list) {
        if (!l.url) continue;
        const fmt = String(l.format || '').toUpperCase();
        if (fmt === 'SVG') continue; // Glide لا يفك ترميز SVG افتراضياً
        let score = 0;
        if (l.in_use) score += 100;
        if (fmt === 'PNG') score += 50;
        const w = l.width || 0;
        if (w >= 200 && w <= 800) score += 20;
        else if (w > 0) score += 5;
        if (score > bestScore) { bestScore = score; best = l.url; }
    }
    return best;
}

/**
 * قاعدة iptv-org أسماؤها إنجليزية غالباً (499 مفتاحاً عربياً فقط من 36 ألفاً)، بينما لوحات
 * Xtream العربية تسمّي قنواتها بالعربية كثيراً. هذا الجدول يربط الاسم العربي الشائع بالاسم
 * الإنجليزي الموجود في القاعدة، فيُضاف مفتاح عربي إضافي يشير لنفس الشعار.
 */
const ARABIC_ALIASES = {
    'الجزيرة': 'al jazeera',
    'الجزيرة مباشر': 'al jazeera mubasher',
    'العربية': 'al arabiya tv',
    'الحدث': 'al hadath',
    'سكاي نيوز عربية': 'sky news arabia',
    'بي ان سبورت': 'bein sports',
    'ام بي سي': 'mbc 1',
    'ام بي سي مصر': 'mbc masr',
    'ام بي سي دراما': 'mbc drama',
    'ام بي سي اكشن': 'mbc action',
    'ام بي سي ماكس': 'mbc max',
    'ام بي سي بوليوود': 'mbc bollywood',
    'روتانا سينما': 'rotana cinema masr',
    'روتانا خليجية': 'rotana khalijiah',
    'روتانا كلاسيك': 'rotana classic',
    'دبي': 'dubai tv',
    'دبي الرياضية': 'dubai sports 1',
    'ابوظبي': 'abu dhabi tv',
    'ابوظبي الرياضية': 'abu dhabi sports 1',
    'السعودية': 'saudi tv channel 1',
    'السعودية الرياضية': 'ssc 1',
    'القاهرة والناس': 'alkahera wal nas',
    'الحياة': 'al hayah',
    'النهار': 'nahar',
    'صدى البلد': 'sada elbalad',
    'الشرق': 'asharq news',
    'الكاس': 'alkass one',
    'الاولى المغربية': 'al aoula',
    'نسمة': 'nessma tv',
    'الوطنية': 'el watania',
    'سبيستون': 'spacetoon arabic',
    'كرتون نتورك': 'cartoon network',
    'ناشيونال جيوغرافيك': 'national geographic',
    'ديسكفري': 'discovery channel',
    'تايم سينما': 'time cinema',
    'ال بي سي': 'lbc',
    'ام تي في': 'mtv lebanon',
    'الميادين': 'al mayadeen',
    'العراقية': 'al iraqiya',
    'ليبيا': 'libya tv',
};

(async function main() {
    console.log('تنزيل قاعدة القنوات والشعارات...');
    const [channels, logos] = await Promise.all([get(CHANNELS_URL), get(LOGOS_URL)]);
    console.log('  قنوات: ' + channels.length + ' | شعارات: ' + logos.length);

    const byChannel = new Map();
    for (const l of logos) {
        if (!l.channel) continue;
        if (!byChannel.has(l.channel)) byChannel.set(l.channel, []);
        byChannel.get(l.channel).push(l);
    }

    const index = {};
    let withLogo = 0;
    for (const ch of channels) {
        const list = byChannel.get(ch.id);
        if (!list) continue;
        const url = pickLogo(list);
        if (!url) continue;
        withLogo++;
        const names = [ch.name].concat(ch.alt_names || []);
        for (const n of names) {
            const key = normalize(n);
            // مفتاح قصير جداً (حرف أو حرفان) يسبب مطابقات خاطئة كثيرة
            if (key.length < 3) continue;
            if (!(key in index)) index[key] = url;
        }
    }

    // مرادفات عربية للقنوات الشائعة
    let aliasHits = 0;
    const missing = [];
    for (const [ar, en] of Object.entries(ARABIC_ALIASES)) {
        const key = normalize(ar);
        const target = index[normalize(en)];
        if (!target) { missing.push(ar + ' -> ' + en); continue; }
        if (!(key in index)) { index[key] = target; aliasHits++; }
    }
    console.log('مرادفات عربية مضافة: ' + aliasHits + (missing.length ? ' | بلا مقابل: ' + missing.join('، ') : ''));

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(index), 'utf8');
    const kb = Math.round(fs.statSync(OUT).size / 1024);
    console.log('قنوات لها شعار: ' + withLogo);
    console.log('مفاتيح الفهرس : ' + Object.keys(index).length);
    console.log('الناتج        : ' + OUT + ' (' + kb + ' كيلوبايت)');
})().catch((e) => { console.error('فشل البناء:', e.message); process.exit(1); });
