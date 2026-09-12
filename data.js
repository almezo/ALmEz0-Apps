// ==========================================
// ملف بيانات الموقع الشامل (يغذي الصفحات الديناميكية)
// يتم منه سحب المنتجات والباقات وروابط التحميل
// ==========================================

let siteData = {
    iptv: [
        {
            id: "x",
            name: "سيرفر اكس (X)",
            logo: "photo/x.jpeg",
            plans: [
                { duration: "3 أشهر", price: "50 د.ل" },
                { duration: "6 أشهر", price: "80 د.ل" },
                { duration: "12 شهر (سنة)", price: "140 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/nl0myeb9rfb2iqm/XTV_PRO.apk/file?dkey=cw736b42201&r=1545",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "3479835"
            },
            description: "يحتوي علي مكتبة ضخمة من الافلام والمسلسلات بجودات عالية و تحديثات يوميا على مدار السنة.<br><b>محتوياته:</b><br>• أكثر من 12000 قناة عالمية<br>• أكثر من 19000 فيلم<br>• أكثر من 8000 مسلسل"
        },
        {
            id: "nova",
            name: "سيرفر نوفا (Nova)",
            logo: "photo/nova.jpeg",
            plans: [
                { duration: "3 أشهر", price: "40 د.ل" },
                { duration: "6 أشهر", price: "70 د.ل" },
                { duration: "12 شهر (سنة)", price: "120 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/zi1f179sr5wz3hc/NOVA+V2+Ai.apk/file?dkey=rqqgytn2ejz&r=817",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "6397234"
            },
            description: "يحتوي علي باقات رياضية بمختلف الجودات ويشتغل بكفاءة مع الانترنت الضعيف.<br><b>محتوياته:</b><br>• أكثر من 1500 قناة عالمية<br>• أكثر من 18000 فيلم<br>• أكثر من 7500 مسلسل"
        },
        {
            id: "marvel",
            name: "سيرفر مارفل (Marvel)",
            logo: "photo/marvel.jpeg",
            plans: [
                { duration: "3 أشهر", price: "45 د.ل" },
                { duration: "6 أشهر", price: "75 د.ل" },
                { duration: "12 شهر (سنة)", price: "130 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/cmc85kgt7ayq898/Tayaara+Tv.apk/file?dkey=uw543uqpmga&r=144",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "8603530"
            },
            description: "يحتوي علي باقات رياضية بمختلف الجودات ويشتغل بكفاءة مع الانترنت الضعيف سيرفر ضخم جدا من حيث الافلام والمسلسلات المترجمة والمدبلجة.<br><b>محتوياته:</b><br>• أكثر من 6000 قناة عالمية<br>• أكثر من 41000 فيلم<br>• أكثر من 9000 مسلسل"
        },
        {
            id: "maven",
            name: "سيرفر مافين (Maven)",
            logo: "photo/maven.jpeg",
            plans: [
                { duration: "3 أشهر", price: "35 د.ل" },
                { duration: "6 أشهر", price: "60 د.ل" },
                { duration: "12 شهر (سنة)", price: "100 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/4o8oup5i6yipe2j/Maven_Player_Tv.apk/file?dkey=ya64dfbf629&r=1195",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "6044608"
            },
            description: "سيرفر يقدم أقوى الباقات العربية والعالمية لإرضاء جميع الأذواق.<br><b>محتوياته:</b><br>• أكثر من 9000 قناة عالمية<br>• أكثر من 40000 فيلم<br>• أكثر من 6000 مسلسل"
        },
        {
            id: "mega",
            name: "سيرفر ميجا (Mega)",
            logo: "photo/mega.jpeg",
            plans: [
                { duration: "3 أشهر", price: "35 د.ل" },
                { duration: "6 أشهر", price: "65 د.ل" },
                { duration: "12 شهر (سنة)", price: "115 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/dfs7exnel5a9bcp/MEGA+GOLD.apk/file?dkey=rsy01112aus&r=1347",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "8312472"
            },
            description: "يحتوي علي مكتبة ضخمة من الافلام والمسلسلات بجودات عالية و متوسطة و دعم فني ممتاز.<br><b>محتوياته:</b><br>• أكثر من 11000 قناة عالمية<br>• أكثر من 24000 فيلم<br>• أكثر من 8500 مسلسل"
        },
        {
            id: "ninja",
            name: "سيرفر نينجا (Ninja)",
            logo: "photo/ninja.jpeg",
            plans: [
                { duration: "3 أشهر", price: "35 د.ل" },
                { duration: "6 أشهر", price: "55 د.ل" },
                { duration: "12 شهر (سنة)", price: "95 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/7uhrilblhe72a4z/NINJA.apk/file?dkey=p7y39psl45u&r=1818",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "9528908"
            },
            description: "يحتوى على أضخم محتوى ترفيهي من أفلام ومسلسلات حديثة مع جودة صوت صورة خرافية.<br><b>محتوياته:</b><br>• أكثر من 11000 قناة عالمية<br>• أكثر من 52000 فيلم<br>• أكثر من 10000 مسلسل"
        },
        {
            id: "mh",
            name: "سيرفر ام اتش (MH)",
            logo: "photo/mh.png",
            plans: [
                { duration: "3 أشهر", price: "45 د.ل" },
                { duration: "6 أشهر", price: "75 د.ل" },
                { duration: "12 شهر (سنة)", price: "130 د.ل" }
            ],
            apps: {
                android: "https://www.mediafire.com/file/mzci7auxyn4asza/MH+IPTV+PRO.apk/file?dkey=jgzu4wo6ch7&r=1295",
                ios: "https://apps.apple.com/eg/app/code-play/id1661811116?l=ar",
                downloader: "8010566"
            },
            description: "يحتوي علي مكتبة افلام ومسلسلات محدثة يشتغل في جميع بلدان العالم بدون vpn.<br><b>محتوياته:</b><br>• أكثر من 5000 قناة عالمية<br>• أكثر من 18000 فيلم<br>• أكثر من 5500 مسلسل"
        }
    ],
    smartApps: [
        { id: "iboplayer", name: "IBOPLAYER", logo: "photo/iboplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "55 د.ل" }, { duration: "مدى الحياة", price: "100 د.ل" }] },
        { id: "bobplayer", name: "BOBPLAYER", logo: "photo/bobplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "55 د.ل" }, { duration: "مدى الحياة", price: "100 د.ل" }] },
        { id: "iboone", name: "IBO ONE", logo: "photo/iboone.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "iboplayer3", name: "IBOPLAYER3", logo: "photo/iboplayer3.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "duplex", name: "DUPLEX", logo: "photo/duplex.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "iboxxplayer", name: "IBOXXPLAYER", logo: "photo/iboxxplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "abeplayertv", name: "ABEPlayerTV", logo: "photo/abeplayertv.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "macplayer", name: "MACPLAYER", logo: "photo/macplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "virginia", name: "VIRGINIA", logo: "photo/virginia.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "allplayer", name: "AllPlayer", logo: "photo/allplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "ktnplayer", name: "KTNPLAYER", logo: "photo/ktnplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "familyplayer", name: "FAMILYPLAYER", logo: "photo/familyplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "ibossplayer", name: "IBOSSPLAYER", logo: "photo/ibossplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "king4kplayer", name: "KING4KPLAYER", logo: "photo/king4kplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "ibostb", name: "IBOSTB", logo: "photo/ibostb.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "bobpro", name: "BOBPRO", logo: "photo/bobpro.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "bobpremium", name: "BOBPREMIUM", logo: "photo/bobpremium.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "ibosolplayer", name: "IBOSOLPlayer", logo: "photo/ibosolplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "flixnet", name: "FLIXNET", logo: "photo/flixnet.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "smartonepro", name: "SMARTONEPRO", logo: "photo/smartonepro.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "duplexpro", name: "Duplex Pro", logo: "photo/duplexpro.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "smartplayer", name: "Smart Player", logo: "photo/smartplayer.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] },
        { id: "kemet", name: "Kemet TV", logo: "photo/kemet.jpeg", plans: [{ duration: "سنة واحدة", price: "45 د.ل" }, { duration: "مدى الحياة", price: "90 د.ل" }] }
    ],
    vip: [
        {
            id: "vip1",
            name: "باقة VIP 1",
            logo: "photo/vip1.jpeg",
            plans: [
                { duration: "3 أشهر", price: "124 د.ل" },
                { duration: "6 أشهر", price: "224 د.ل" },
                { duration: "12 شهر", price: "379 د.ل" }
            ],
            description: "تركز على فتح القنوات الرياضية الأساسية على الأقمار المتاحة (مثل نايل سات وأقمار الشيرنج العالمية) لتغطية الدوريات الكبرى عبر القنوات العادية و توفر حلاً مناسباً للمستخدمين الذين يكتفون بمتابعة المباريات عبر القنوات الرئيسية دون الحاجة لقنوات البث الإضافية أو الماكس، وتأتي بتكلفة اشتراك أقل."
        },
        {
            id: "vip2",
            name: "باقة VIP 2",
            logo: "photo/vip2.jpeg",
            plans: [
                { duration: "3 أشهر", price: "149 د.ل" },
                { duration: "12 شهر", price: "429 د.ل" }
            ],
            description: "تفتح جميع قنوات VIP1 مضافاً إليها قنوات beIN Sports MAX بشكل كامل ودون تقطيع، مما يتيح متابعة تغطيات الأحداث الرياضية الكبرى والبطولات القارية والمحلية الحصرية و عند تجديد الاشتراك بباقة VIP2، يتم دمج وتمديد الأيام المتبقية من اشتراكاتك القديمة تلقائياً دون ضياع أي يوم و تُعد الخيار الأفضل لتفادي مشاكل توقف السيرفرات وضمان أعلى توافقية مع التحديثات الجديدة لأنظمة الحماية والأجهزة."
        }
    ]
};
