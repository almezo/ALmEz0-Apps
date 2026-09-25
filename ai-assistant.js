/**
 * مساعد الميزو الذكي (AlMeZ0 AI Assistant)
 * دعم كامل للصوت والكتابة (Speech-to-Text & Text-to-Speech)
 * فحص ديناميكي مباشر لمحتوى سيرفر العميل النشط
 * بحث الويب لمواعيد المباريات الحية وتفاصيل الأعمال السينمائية
 * تحكم وتشغيل فوري في مشغل الميزو
 */

(function () {
    let aiModal = null;
    let isListening = false;
    let speechRecognition = null;
    let conversationHistory = [];

    // =========================================================================
    // 1. إدارة سجل المحادثات السابقة (Chat History Management)
    // =========================================================================
    let currentSessionId = null;

    function getSavedSessions() {
        try {
            return JSON.parse(localStorage.getItem('almezo_ai_chat_sessions') || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveSessions(sessions) {
        try {
            localStorage.setItem('almezo_ai_chat_sessions', JSON.stringify(sessions));
        } catch (e) { }
    }

    function getOrCreateCurrentSession(initialTitle) {
        let sessions = getSavedSessions();
        if (!currentSessionId) {
            currentSessionId = 'session_' + Date.now();
            const newSession = {
                id: currentSessionId,
                title: initialTitle ? (initialTitle.length > 30 ? initialTitle.slice(0, 30) + '...' : initialTitle) : 'محادثة جديدة',
                createdAt: Date.now(),
                messages: []
            };
            sessions.unshift(newSession);
            saveSessions(sessions);
            renderHistoryDrawer();
            return newSession;
        }
        let session = sessions.find(s => s.id === currentSessionId);
        if (!session) {
            session = {
                id: currentSessionId,
                title: initialTitle ? (initialTitle.length > 30 ? initialTitle.slice(0, 30) + '...' : initialTitle) : 'محادثة جديدة',
                createdAt: Date.now(),
                messages: []
            };
            sessions.unshift(session);
            saveSessions(sessions);
            renderHistoryDrawer();
        }
        return session;
    }

    function saveMessageToCurrentSession(sender, text, actionCardsHtml) {
        try {
            const session = getOrCreateCurrentSession(sender === 'user' ? text : null);
            session.messages.push({ sender, text, actionCardsHtml: actionCardsHtml || '', time: Date.now() });
            const sessions = getSavedSessions().map(s => s.id === session.id ? session : s);
            saveSessions(sessions);
            renderHistoryDrawer();
        } catch (e) { }
    }

    function startNewChat() {
        currentSessionId = null;
        conversationHistory = [];
        const container = document.getElementById('aiChatMessages');
        if (container) {
            container.innerHTML = `
                <div class="ai-message ai-bot-message">
                    <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                    <div class="ai-msg-content">
                        <div class="ai-msg-text">
                            مرحباً بك في <strong>سيرفرات الميزو</strong>! 🎬⚽<br>
                            بدأنا محادثة جديدة، تفضل بسؤالي عن أي فيلم، مسلسل، مباراة اليوم أو تشغيل أي قناة.
                        </div>
                    </div>
                </div>
            `;
        }
        closeHistoryDrawer();
        renderHistoryDrawer();
        showAiStatus('جاهز لمساعدتك ✨');
    }

    function loadSession(sessionId) {
        const sessions = getSavedSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        currentSessionId = session.id;
        conversationHistory = [];
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        container.innerHTML = '';
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach(m => {
                appendMessage(m.sender, m.text, m.actionCardsHtml || '', false);
                conversationHistory.push({ role: m.sender === 'user' ? 'user' : 'model', text: String(m.text || '').replace(/^🎙️ /, '') });
            });
        } else {
            appendMessage('model', 'محادثة سابقة فارغة. كيف يمكنني مساعدتك؟', '', false);
        }
        closeHistoryDrawer();
        renderHistoryDrawer();
        showAiStatus('تم استرجاع المحادثة ✨');
    }

    function deleteSession(sessionId, event) {
        if (event) event.stopPropagation();
        let sessions = getSavedSessions();
        sessions = sessions.filter(s => s.id !== sessionId);
        saveSessions(sessions);
        if (currentSessionId === sessionId) {
            startNewChat();
        } else {
            renderHistoryDrawer();
        }
    }

    function toggleHistoryDrawer() {
        const drawer = document.getElementById('aiHistoryDrawer');
        if (drawer) {
            drawer.classList.toggle('hidden');
            if (!drawer.classList.contains('hidden')) {
                renderHistoryDrawer();
            }
        }
    }

    function closeHistoryDrawer() {
        const drawer = document.getElementById('aiHistoryDrawer');
        if (drawer) drawer.classList.add('hidden');
    }

    function renderHistoryDrawer() {
        const listEl = document.getElementById('aiHistoryList');
        if (!listEl) return;

        const sessions = getSavedSessions();
        if (sessions.length === 0) {
            listEl.innerHTML = `<div class="ai-history-empty">لا توجد محادثات سابقة محفوظة</div>`;
            return;
        }

        listEl.innerHTML = sessions.map(s => {
            const isActive = s.id === currentSessionId ? 'active' : '';
            const d = new Date(s.createdAt);
            const dateStr = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const safeTitle = (s.title || 'محادثة').replace(/"/g, '&quot;');
            return `
                <div class="ai-history-item ${isActive}" onclick="window.AlMeZ0AI.loadSession('${s.id}')">
                    <div class="ai-history-item-info">
                        <span class="ai-history-item-title" title="${safeTitle}">${escHtml(s.title || 'محادثة')}</span>
                        <span class="ai-history-item-date">${dateStr}</span>
                    </div>
                    <button class="ai-history-btn-del" title="حذف" onclick="window.AlMeZ0AI.deleteSession('${s.id}', event)">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    // =========================================================================
    // 2. تهيئة المحرك الصوتي (إصلاح ميكروفون الكمبيوتر وإلغاء الصوت الخارج)
    // =========================================================================
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecordingMedia = false;

    function isElectronEnvironment() {
        return !!(window.electronAPI && window.electronAPI.isElectron) ||
               (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron'));
    }

    function initSpeechEngine() {
        // في بيئة تطبيق الكمبيوتر Electron: متصفح كروميوم يفتقد لمفاتيح جوجل الرسمية للتعرف الصوتي السحابي
        // لذلك نعتمد مباشرة على MediaRecorder وتسجيل الميكروفون الحقيقي
        if (isElectronEnvironment()) {
            speechRecognition = null;
            return;
        }

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            try {
                speechRecognition = new SpeechRec();
                speechRecognition.continuous = false;
                speechRecognition.interimResults = false;
                speechRecognition.lang = 'ar-SA';

                speechRecognition.onstart = () => {
                    isListening = true;
                    updateMicButtonState(true);
                    showAiStatus('جاري الاستماع لصوتك الآن 🎙️...');
                };

                speechRecognition.onresult = (event) => {
                    if (event.results && event.results[0] && event.results[0][0]) {
                        const transcript = event.results[0][0].transcript;
                        const inputEl = document.getElementById('aiChatInput');
                        if (inputEl) {
                            inputEl.value = transcript;
                        }
                        handleSendMessage(transcript);
                    }
                };

                speechRecognition.onerror = (event) => {
                    console.warn('[AlMeZ0 AI] Speech error:', event.error);
                    isListening = false;
                    updateMicButtonState(false);
                    // في حال حدوث أي خطأ في التعرف الصوتي (network, not-allowed, إلخ) نتحول فوراً للتسجيل العتادي المباشر
                    startMediaRecorderVoice();
                };

                speechRecognition.onend = () => {
                    isListening = false;
                    updateMicButtonState(false);
                    showAiStatus('جاهز لمساعدتك ✨');
                };
            } catch (e) {
                console.warn('[AlMeZ0 AI] Failed to init SpeechRec', e);
            }
        }
    }

    async function startMediaRecorderVoice() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showAlert('التعرف الصوتي غير مدعوم في هذا الجهاز، يمكنك الكتابة في الحقل أدناه.', 'info');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            isRecordingMedia = true;
            updateMicButtonState(true);
            showAiStatus('جاري تسجيل صوتك... تحدث واضغط الميكروفون مجدداً للإرسال 🎙️');

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                isRecordingMedia = false;
                updateMicButtonState(false);
                stream.getTracks().forEach(t => t.stop());
                showAiStatus('جاري تحليل وفهم الصوت ⏳...');

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (audioBlob.size < 100) {
                    showAiStatus('جاهز لمساعدتك ✨');
                    return;
                }
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Data = (reader.result || '').split(',')[1];
                    if (base64Data) {
                        handleSendAudioMessage(base64Data, 'audio/webm');
                    }
                };
            };

            mediaRecorder.start();
            setTimeout(() => {
                if (isRecordingMedia && mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 20000); // حتى 20 ثانية؛ السيرفر يقبل التسجيل ويحوّله لنص قبل الإجابة
        } catch (err) {
            console.error('[AlMeZ0 AI] getUserMedia error', err);
            isRecordingMedia = false;
            updateMicButtonState(false);
            showAiStatus('جاهز لمساعدتك ✨');
            showAlert('يرجى السماح بصلاحية الميكروفون للتحدث صوتياً.', 'warning');
        }
    }

    function toggleSpeechListening() {
        if (isRecordingMedia && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            return;
        }

        // في برنامج الكمبيوتر: الانتقال فورياً للتسجيل بالميكروفون المباشر
        if (isElectronEnvironment()) {
            startMediaRecorderVoice();
            return;
        }

        // فحص وطلب صلاحية الميكروفون في تطبيق الأندرويد فقط عند الضغط
        if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.hasRecordAudioPermission === 'function') {
            if (!window.AndroidNativeBridge.hasRecordAudioPermission()) {
                if (typeof window.AndroidNativeBridge.requestRecordAudioPermission === 'function') {
                    window.AndroidNativeBridge.requestRecordAudioPermission();
                    showAiStatus('يرجى السماح بصلاحية الميكروفون للتحدث 🎙️');
                    return;
                }
            }
        }

        if (speechRecognition) {
            if (isListening) {
                speechRecognition.stop();
            } else {
                try {
                    speechRecognition.start();
                } catch (e) {
                    startMediaRecorderVoice();
                }
            }
        } else {
            startMediaRecorderVoice();
        }
    }

    function updateMicButtonState(listening) {
        const micBtn = document.getElementById('aiBtnMic');
        if (micBtn) {
            micBtn.classList.toggle('is-recording', listening);
            micBtn.title = listening ? 'جاري الاستماع/التسجيل... اضغط للإيقاف والإرسال' : 'اضغط للتحدث بالصوت';
        }
    }

    function speakReply(text) {
        // تم إيقاف الصوت كلياً بناءً على طلب العميل رقم 1
        if (window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (e) { }
        }
    }

    // =========================================================================
    // 2. محرك البحث المحلي الذكي في سيرفر العميل النشط
    // =========================================================================
    const STOP_WORDS = new Set([
        'في', 'من', 'عن', 'على', 'الي', 'إلى', 'مع', 'هذا', 'هذه', 'تم', 'ما', 'شن', 'شنو', 'شنهو', 'ايش', 'شو', 'ماهي',
        'اليوم', 'الليلة', 'اليلة', 'الان', 'الآن', 'امس', 'أمس', 'غدا', 'بكرة', 'هل', 'اريد', 'أريد', 'بدي', 'ابي', 'ابغى',
        'عايز', 'افضل', 'أفضل', 'احسن', 'أحسن', 'اقترح', 'متوفر', 'متوفرة', 'سيرفر', 'السيرفر', 'مشاهدة', 'تشغيل', 'مهمة', 'مهمه', 'كبيرة',
        'جديد', 'جديدة', 'قديم', 'حلو', 'جميل', 'فيلم', 'افلام', 'أفلام', 'مسلسل', 'مسلسلات', 'حلقة', 'حلقات',
        'قناة', 'قنوات', 'بث', 'مباشر', 'مباراة', 'مباريات', 'سهرة', 'سهره', 'عندك', 'موجود', 'موجودة', 'لي', 'وريني',
        'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'movie', 'series', 'show'
    ]);

    function normalizeArabic(text) {
        if (!text || typeof text !== 'string') return '';
        return text.trim().toLowerCase()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[ًٌٍَُِّْ]/g, '')
            .replace(/[-_.:]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    function isSportsQuery(text) {
        const sportsKeywords = [
            'مباراة', 'مباريات', 'ماتش', 'دوري', 'كأس', 'كاس', 'ابطال', 'دوري ابطال', 'ريال', 'برشلونة', 'ليفربول',
            'الاهلي', 'الزمالك', 'الهلال', 'النصر', 'الاتحاد', 'السيتي', 'يونايتد', 'ارسنال', 'تشيلسي', 'بايرن',
            'باريس', 'يوفنتوس', 'ميلان', 'انتر', 'روما', 'كرة', 'كورة', 'رياضة', 'رياضيه', 'تنس', 'سلة', 'bein', 'ssc'
        ];
        const n = normalizeArabic(text);
        return sportsKeywords.some(kw => n.includes(kw));
    }

    function groupAndFormatChannels(channelsList) {
        const grouped = {};
        channelsList.forEach(ch => {
            const rawName = ch.name || '';
            let baseName = rawName.replace(/(4K|UHD|FHD|1080p|HD|720p|SD|Low|HEVC|H265)/gi, '').trim();
            if (!grouped[baseName]) {
                grouped[baseName] = {
                    baseName: baseName || rawName,
                    icon: ch.stream_icon || 'photo/logo.ico',
                    qualities: []
                };
            }

            let qLabel = 'HD';
            const u = rawName.toUpperCase();
            if (u.includes('4K') || u.includes('UHD')) qLabel = '4K';
            else if (u.includes('FHD') || u.includes('1080')) qLabel = 'FHD';
            else if (u.includes('SD')) qLabel = 'SD';
            else if (u.includes('LOW')) qLabel = 'Low';

            grouped[baseName].qualities.push({
                id: ch.stream_id,
                name: rawName,
                quality: qLabel
            });
        });
        return Object.values(grouped);
    }

    const GENRE_KEYWORD_MAP = {
        action: ['اكشن', 'قتال', 'معارك', 'مطاردة', 'action'],
        adventure: ['مغامر', 'adventure'],
        comedy: ['كوميد', 'ضحك', 'مضحك', 'فرفش', 'comedy'],
        horror: ['رعب', 'مخيف', 'اشباح', 'زومبي', 'horror'],
        thriller: ['اثاره', 'تشويق', 'thriller', 'suspense'],
        crime: ['جريم', 'عصابات', 'crime'],
        mystery: ['غموض', 'لغز', 'mystery'],
        drama: ['درام', 'اجتماعي', 'drama'],
        romance: ['رومانس', 'رومانسي', 'حب', 'romance', 'romantic'],
        scifi: ['خيال علمي', 'فضاء', 'sci fi', 'scifi', 'science fiction'],
        fantasy: ['فانتازيا', 'خيال', 'fantasy'],
        animation: ['كرتون', 'انمي', 'رسوم', 'anime', 'animation', 'cartoon'],
        kids: ['اطفال', 'kids', 'children'],
        family: ['عائلي', 'family'],
        war: ['حرب', 'حروب', 'war'],
        history: ['تاريخ', 'تاريخي', 'history', 'historical'],
        documentary: ['وثائقي', 'documentary'],
        sport: ['رياضي', 'sport'],
        biography: ['سيره', 'biography']
    };

    const LANGUAGE_CAT_WORDS = {
        arabic: ['عربي', 'arab', 'مصر', 'سوري', 'خليج', 'لبنان', 'رمضان'],
        english: ['اجنبي', 'english', 'foreign', 'امريكي', 'hollywood', 'netflix'],
        turkish: ['تركي', 'turk'],
        indian: ['هندي', 'indian', 'hindi', 'bollywood'],
        korean: ['كوري', 'korea', 'asian', 'اسيوي'],
        japanese: ['ياباني', 'japan', 'anime', 'انمي'],
        spanish: ['اسباني', 'spanish', 'latino', 'مكسيكي'],
        french: ['فرنسي', 'french']
    };

    function detectGenres(normText) {
        const detected = [];
        for (const [genre, keywords] of Object.entries(GENRE_KEYWORD_MAP)) {
            if (keywords.some(kw => normText.includes(normalizeArabic(kw)))) detected.push(genre);
        }
        return detected;
    }

    function shuffle(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // تنسيق آمن لرد المساعد: النص يُهرَّب أولاً (لا HTML من النموذج أو من بحث الويب يصل للصفحة)،
    // ثم يُدعم **الخط العريض** والنقاط "- " والأسطر فقط.
    function renderRichText(text) {
        const lines = escHtml(text).split('\n');
        let html = '', inList = false;
        lines.forEach(line => {
            const t = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)\*(?!\s)([^*]+?)\*(?=\s|$)/g, '$1<em>$2</em>');
            const m = t.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
            if (m) {
                if (!inList) { html += '<ul class="ai-msg-list">'; inList = true; }
                html += '<li>' + m[1] + '</li>';
            } else {
                if (inList) { html += '</ul>'; inList = false; }
                html += t.trim() ? '<div>' + t.replace(/^#+\s*/, '') + '</div>' : '<div class="ai-msg-gap"></div>';
            }
        });
        if (inList) html += '</ul>';
        return html;
    }

    // =========================================================================
    // 2. فهم السؤال وجمع بيانات سيرفر العميل (نفس منهج مشغل أندرويد)
    // =========================================================================
    // النموذج يفهم السؤال أولاً (اللهجة، الاسم الأصلي للعمل، التصنيف، المتابعة على سؤال سابق)، ثم
    // نبحث في قوائم السيرفر النشط ونرسل النتائج مع وسم لكل عمل. النموذج يضع الوسم بعد كل عمل يذكره
    // فتُبنى بطاقات التشغيل من الوسوم نفسها، فلا تظهر بطاقة لعمل لم يذكره ولا لعمل غير موجود.

    function guessIntent(question) {
        const n = normalizeArabic(question);
        let intent = 'chat', type = 'any';
        if (isSportsQuery(question)) { intent = 'sports'; type = 'channel'; }
        else if (/قناه|قنوات|channel/.test(n)) { intent = 'channel'; type = 'channel'; }
        else if (/مسلسل|حلقه|series/.test(n)) { intent = 'recommend'; type = 'series'; }
        else if (/فيلم|افلام|سهره|movie/.test(n)) { intent = 'recommend'; type = 'movie'; }

        // استخراج العناوين المحتملة مباشرة محلياً عند ذكر اسم عمل أو قناة
        const titles = [];
        const m = question.match(/(?:فيلم|مسلسل|قناة|قناه|عرض|شغل)\s+([a-zA-Z0-9\u0621-\u064A\s:]{2,30})/i);
        if (m && m[1]) titles.push(m[1].trim());

        return { intent, type, titles, genres: detectGenres(n), language: '', country: '', keywords: [] };
    }

    async function understandQuestion(question) {
        const local = guessIntent(question);
        const hasHistory = conversationHistory.length > 0;

        // للأسئلة المباشرة الواضحة (مثل طلب فيلم سهرة، أفلام أكشن، مسلسلات، مباريات):
        // نوفر طلب الذكاء الاصطناعي لفهم السؤال ونعتمد على التخمين المحلي فائق السرعة!
        if (!hasHistory && (local.intent === 'recommend' || local.intent === 'sports' || local.intent === 'channel')) {
            return local;
        }

        try {
            const prev = conversationHistory.slice(-2)
                .map(h => h.role + ': ' + String(h.text || '').slice(0, 600)).join('\n');
            const data = await callAi({ mode: 'understand', question, prev }, 10000);
            if (data && data.intent && data.intent.intent) return data.intent;
        } catch (e) {
            // لا نوقف السؤال إطلاقاً؛ التخمين المحلي جاهز دائماً للرد بأعلى جودة
            console.warn('تخطي فهم السؤال بالذكاء الاصطناعي واستخدام التخمين المحلي:', e && e.message);
        }
        return local;
    }

    function cleanName(s) {
        return normalizeArabic(s)
            .replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|1080p|720p|cam|vip)\b/g, ' ')
            .replace(/[^\p{L}\p{N} ]/gu, ' ')
            .replace(/^(فيلم|مسلسل|قناه|افلام)\s+/, '')
            .replace(/\s+/g, ' ').trim();
    }

    // مطابقة الاسم: كاملاً، أو 75% من كلماته على الأقل
    function searchByName(list, term, limit) {
        const q = cleanName(term);
        const words = q.split(' ').filter(w => w.length >= 2 || /\d/.test(w));
        if (!words.length) return [];
        const exact = [], strong = [];
        list.forEach(it => {
            const n = ' ' + cleanName(it.name || '') + ' ';
            if (n.trim() === '') return;
            if (n.includes(' ' + q + ' ')) { exact.push(it); return; }
            const hit = words.filter(w => n.includes(' ' + w + ' ')).length;
            if (words.length >= 2 && hit * 4 >= words.length * 3) strong.push(it);
        });
        exact.sort((a, b) => (a.name || '').length - (b.name || '').length);
        return exact.concat(strong.filter(x => !exact.includes(x))).slice(0, limit);
    }

    const catalogCache = {};
    async function catalog(type) {
        if (catalogCache[type]) return catalogCache[type];
        const action = type === 'vod' ? 'get_vod_streams' : type === 'series' ? 'get_series' : 'get_live_streams';
        let items = [], cats = [];
        try { if (window.getAllStreamsForType) items = await window.getAllStreamsForType(type, action); } catch (e) { }
        try { if (window.getAllCategoriesForType) cats = await window.getAllCategoriesForType(type); } catch (e) { }
        const catMap = {};
        (Array.isArray(cats) ? cats : []).forEach(c => { catMap[String(c.category_id)] = c.category_name || ''; });
        const out = { items: Array.isArray(items) ? items : [], cats: catMap };
        if (out.items.length) catalogCache[type] = out;
        return out;
    }

    function itemId(type, it) { return String(type === 'series' ? it.series_id : it.stream_id); }
    function tagOf(type) { return type === 'vod' ? 'movie' : type === 'series' ? 'series' : 'channel'; }

    function describeItem(type, it, cats) {
        const label = type === 'vod' ? 'فيلم' : type === 'series' ? 'مسلسل' : 'قناة';
        let line = `- ${label}: "${String(it.name || '').trim()}"`;
        const year = it.year || (it.releaseDate || it.release_date || '').slice(0, 4);
        if (year && /^\d{4}$/.test(year)) line += ` | السنة ${year}`;
        const r = parseFloat(it.rating);
        if (r > 0) line += ` | التقييم ${r.toFixed(1)}/10`;
        const cn = cats[String(it.category_id)];
        if (cn) line += ` | القسم: ${cn}`;
        if (it.genre) line += ` | النوع: ${String(it.genre).slice(0, 60)}`;
        if (it.plot) line += ` | القصة: ${String(it.plot).replace(/\s+/g, ' ').slice(0, 160)}`;
        return line + ` | الوسم: [[${tagOf(type)}:${itemId(type, it)}]]`;
    }

    function matchesLanguage(it, cats, language) {
        if (!language) return true;
        const words = LANGUAGE_CAT_WORDS[language];
        if (!words) return true;
        const cn = normalizeArabic(cats[String(it.category_id)] || '');
        return words.some(w => cn.includes(normalizeArabic(w)));
    }

    function matchesGenre(it, cats, genres) {
        if (!genres.length) return true;
        const hay = normalizeArabic((cats[String(it.category_id)] || '') + ' ' + (it.genre || ''));
        return genres.some(g => (GENRE_KEYWORD_MAP[g] || [g]).some(kw => hay.includes(normalizeArabic(kw))));
    }

    function pickCandidates(type, data, genres, language) {
        let pool = data.items.filter(it => matchesLanguage(it, data.cats, language));
        if (!pool.length) pool = data.items;
        const byGenre = pool.filter(it => matchesGenre(it, data.cats, genres));
        const base = genres.length && byGenre.length ? byGenre : pool;
        // الأحدث إضافةً ثم الأعلى تقييماً، مع خلط حتى تتنوع الاقتراحات بين الطلبات
        const recent = base.slice().sort((a, b) => (Number(b.added || b.last_modified) || 0) - (Number(a.added || a.last_modified) || 0)).slice(0, 400);
        recent.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
        return shuffle(recent.slice(0, 90)).slice(0, 25);
    }

    const SPORT_CHANNEL_WORDS = ['bein', 'ssc', 'alkass', 'al kass', 'ad sport', 'abu dhabi sport', 'ابوظبي الرياض', 'on time', 'ontime',
        'sport', 'رياض', 'كوره', 'dazn', 'sky sport', 'espn', 'arryadia', 'الرياضيه', 'libya sport', 'ليبيا الرياض'];

    async function buildServerContext(question, intent) {
        const kind = intent.intent || 'chat';
        const type = intent.type || 'any';
        const titles = Array.isArray(intent.titles) ? intent.titles.filter(Boolean) : [];
        const keywords = Array.isArray(intent.keywords) ? intent.keywords.filter(Boolean) : [];
        const genres = (Array.isArray(intent.genres) ? intent.genres : []).filter(g => GENRE_KEYWORD_MAP[g]);
        const language = String(intent.language || '').toLowerCase();
        const known = {};
        const remember = (t, list) => list.forEach(it => { known[tagOf(t) + ':' + itemId(t, it)] = { type: t, item: it }; });

        const wantMovies = type === 'movie' || type === 'any';
        const wantSeries = type === 'series' || type === 'any';
        const wantLive = type === 'channel' || kind === 'sports' || kind === 'channel';

        const [vod, series, live] = await Promise.all([catalog('vod'), catalog('series'), catalog('live')]);
        const byType = { vod, series, live };
        let sb = `[بيانات سيرفر العميل]\n- المحتوى الكلي: ${vod.items.length} فيلم، ${series.items.length} مسلسل، ${live.items.length} قناة مباشرة.\n`;

        // 1) أعمال أو قنوات محددة بالاسم
        const terms = titles.slice();
        if (!terms.length && (kind === 'availability' || kind === 'info')) terms.push(question);
        if (terms.length) {
            sb += '\n[نتائج البحث بالاسم في السيرفر]\n';
            const types = wantLive && type !== 'any' ? ['live'] : type === 'any' ? ['vod', 'series', 'live'] : [type === 'movie' ? 'vod' : 'series'];
            let any = false;
            types.forEach(t => {
                const found = [];
                terms.forEach(term => searchByName(byType[t].items, term, 5).forEach(it => { if (!found.includes(it)) found.push(it); }));
                if (!found.length) return;
                any = true;
                const list = found.slice(0, 8);
                remember(t, list);
                sb += list.map(it => describeItem(t, it, byType[t].cats)).join('\n') + '\n';
            });
            if (!any) sb += `- لا يوجد في السيرفر أي عمل أو قناة بهذا الاسم: ${terms.join('، ')}.\n`;
        }

        // 2) المباريات: القنوات الرياضية لربط القناة الناقلة بقناة عند العميل
        if (kind === 'sports') {
            const extra = keywords.map(k => normalizeArabic(k));
            let sports = live.items.filter(c => {
                const n = normalizeArabic(c.name || '') + ' ' + normalizeArabic(live.cats[String(c.category_id)] || '');
                return SPORT_CHANNEL_WORDS.some(w => n.includes(w)) || extra.some(w => w.length > 2 && n.includes(w));
            });
            sports = sports.slice(0, 60);
            sb += '\n[القنوات الرياضية المتوفرة في السيرفر]\n';
            if (!sports.length) sb += '- لا توجد قنوات رياضية في هذا السيرفر.\n';
            else { remember('live', sports); sb += sports.map(it => describeItem('live', it, live.cats)).join('\n') + '\n'; }
        } else if (kind === 'channel' && !titles.length) {
            const found = [];
            keywords.forEach(k => searchByName(live.items, k, 10).forEach(it => { if (!found.includes(it)) found.push(it); }));
            const nk = keywords.map(k => normalizeArabic(k)).filter(k => k.length > 2);
            live.items.forEach(it => {
                if (found.length >= 25) return;
                const cn = normalizeArabic(live.cats[String(it.category_id)] || '');
                if (nk.some(k => cn.includes(k)) && !found.includes(it)) found.push(it);
            });
            if (found.length) {
                const list = found.slice(0, 25);
                remember('live', list);
                sb += '\n[قنوات مطابقة في السيرفر]\n' + list.map(it => describeItem('live', it, live.cats)).join('\n') + '\n';
            }
        }

        // 3) ترشيحات حسب النوع والتصنيف واللغة
        if (kind === 'recommend' || ((kind === 'chat' || kind === 'info') && genres.length)) {
            const desc = (genres.length ? ' | التصنيف: ' + genres.join('، ') : '') + (language ? ' | اللغة: ' + language : '');
            if (wantMovies || !wantSeries) {
                const list = pickCandidates('vod', vod, genres, language);
                remember('vod', list);
                sb += `\n[أفلام مرشحة من السيرفر تناسب الطلب${desc}]\n` + (list.length ? list.map(it => describeItem('vod', it, vod.cats)).join('\n') : '- لا يوجد ما يطابق.') + '\n';
            }
            if (wantSeries) {
                const list = pickCandidates('series', series, genres, language);
                remember('series', list);
                sb += `\n[مسلسلات مرشحة من السيرفر تناسب الطلب${desc}]\n` + (list.length ? list.map(it => describeItem('series', it, series.cats)).join('\n') : '- لا يوجد ما يطابق.') + '\n';
            }
        }

        // أسماء الأقسام تساعد في الأسئلة العامة ("هل عندكم أفلام تركية؟")
        const catType = type === 'movie' ? 'vod' : type === 'series' ? 'series' : wantLive ? 'live' : 'vod';
        const catNames = Object.values(byType[catType].cats).filter(Boolean).slice(0, 40);
        if (catNames.length) sb += `\n- أقسام ${catType === 'vod' ? 'الأفلام' : catType === 'series' ? 'المسلسلات' : 'القنوات'} في السيرفر: ${catNames.join('، ')}.\n`;
        return { context: sb, known, byType };
    }

    const TAG_RE = /\[\[\s*(movie|series|channel)\s*:\s*([^\]\s]+)\s*\]\]/gi;

    function cardsFromReply(raw, known, byType) {
        const movies = [], series = [], channels = [];
        const seen = new Set();
        let m;
        TAG_RE.lastIndex = 0;
        while ((m = TAG_RE.exec(raw)) && seen.size < 8) {
            const tag = m[1].toLowerCase(), id = m[2].trim(), key = tag + ':' + id;
            if (seen.has(key)) continue;
            let hit = known[key];
            if (!hit) {
                // متابعة على رد سابق ("شغلها"): الوسم لعمل ذُكر من قبل
                const t = tag === 'movie' ? 'vod' : tag === 'series' ? 'series' : 'live';
                const it = byType[t].items.find(x => itemId(t, x) === id);
                if (it) hit = { type: t, item: it };
            }
            if (!hit) continue;
            seen.add(key);
            if (hit.type === 'vod') movies.push(hit.item);
            else if (hit.type === 'series') series.push(hit.item);
            else channels.push(hit.item);
        }
        return { movies, series, channels: groupAndFormatChannels(channels) };
    }

    function stripTags(raw) {
        return raw.replace(TAG_RE, '').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    // ملاحظة أمنية: مفتاح Gemini على الخادم فقط، والطلبات تمر عبر Cloud Function (generateAiReply)،
    // وفيها أيضاً تعليمات المساعد وإعدادات النموذج (العقل المشترك مع مشغل أندرويد).
    function getAiCallable() {
        if (typeof functions === 'undefined' || !functions) {
            throw new Error('خدمة المساعد الذكي غير متاحة حالياً في هذه الصفحة.');
        }
        return functions.httpsCallable('generateAiReply', { timeout: 70000 });
    }

    // مهلة واضحة بدل انتظار مفتوح إن تأخر السيرفر أو انقطع الاتصال
    async function callAi(payload, timeoutMs) {
        const aiCallable = getAiCallable();
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('انتهت المهلة أثناء انتظار رد المساعد.')), timeoutMs || 60000);
        });
        try {
            const result = await Promise.race([aiCallable(payload), timeoutPromise]);
            return (result && result.data) || {};
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async function askAssistant(question) {
        const intent = await understandQuestion(question);
        const { context, known, byType } = await buildServerContext(question, intent);
        const data = await callAi({
            mode: 'answer',
            question,
            context,
            history: conversationHistory.slice(-12),
            useSearch: intent.intent === 'sports' || intent.intent === 'info'
        }, 60000);
        const raw = String(data.text || '').trim();
        if (!raw) throw new Error('لم يتم استلام رد من النموذج');
        let text = stripTags(raw);
        const remaining = typeof data.remaining === 'number' ? data.remaining : 99;
        if (remaining <= 5) {
            text += '\n\n' + (remaining === 0 ? 'ℹ️ هذا آخر سؤال متاح لك اليوم، ويتجدد الحد غداً.' : `ℹ️ متبقٍ لك اليوم ${remaining} أسئلة.`);
        }
        return { raw, text, cards: cardsFromReply(raw, known, byType), sources: Array.isArray(data.sources) ? data.sources : [] };
    }

    function sourcesHtml(sources) {
        if (!sources.length) return '';
        return '<div class="ai-msg-sources"><span class="ai-src-title"><i class="fas fa-globe"></i> المصادر:</span>' +
            sources.map(s => {
                let host = '';
                try { host = new URL(s.uri).hostname.replace(/^www\./, ''); } catch (e) { }
                const label = s.title || host || 'مصدر';
                const safeUri = /^https?:\/\//i.test(s.uri) ? s.uri : '#';
                return `<a class="ai-src-chip" href="${escHtml(safeUri)}" target="_blank" rel="noopener noreferrer">${escHtml(label).slice(0, 40)}</a>`;
            }).join('') + '</div>';
    }

    // تحويل أي خطأ تقني إلى رسالة ودية بالعربية. الرسائل الخام (مثل
    // "models/gemini-1.5-flash is not found for API version v1beta") لا تُعرض للمستخدم أبداً،
    // وتبقى في وحدة التحكم للمطورين فقط.
    function toFriendlyAiError(err) {
        const raw = String((err && err.message) || '');
        if (/مهلة|timeout|deadline/i.test(raw)) {
            return 'عذراً، استغرق الرد وقتاً أطول من المعتاد. تحقق من اتصال الإنترنت وحاول مجدداً.';
        }
        if (/unauthenticated|مسجلاً للدخول/i.test(raw)) {
            return 'يرجى تسجيل الدخول أولاً لاستخدام مساعد الميزو.';
        }
        if (/resource-exhausted/i.test(String(err && err.code)) || /الحد اليومي|الحد المسموح/.test(raw)) {
            return /[\u0600-\u06FF]/.test(raw) ? raw + ' 🙏' : 'مساعد الميزو وصل للحد المسموح من الطلبات حالياً. أعد المحاولة بعد قليل. 🙏';
        }
        if (/طويل جداً/.test(raw)) return raw;
        if (/غير متاحة/.test(raw)) {
            return 'مساعد الميزو غير متاح في هذه الصفحة حالياً.';
        }
        return 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.';
    }

    // =========================================================================
    // 4. بناء واجهة المساعد والأزرار التفاعلية
    // =========================================================================
    function createAiModalDom() {
        if (document.getElementById('almezoAiModal')) return;

        const modal = document.createElement('div');
        modal.id = 'almezoAiModal';
        modal.className = 'ai-modal-overlay hidden';
        modal.dir = 'rtl';

        modal.innerHTML = `
            <div class="ai-modal-card" role="dialog" aria-modal="true">
                <!-- درج وسجل المحادثات الجانبي -->
                <div class="ai-history-drawer hidden" id="aiHistoryDrawer">
                    <div class="ai-history-header">
                        <div class="ai-history-title-wrap">
                            <i class="fas fa-history"></i>
                            <span>سجل المحادثات</span>
                        </div>
                        <button class="ai-btn-new-chat" onclick="window.AlMeZ0AI.startNewChat()">
                            <i class="fas fa-plus"></i> جديدة
                        </button>
                    </div>
                    <div class="ai-history-list" id="aiHistoryList"></div>
                </div>

                <!-- الترويسة -->
                <div class="ai-modal-header">
                    <div class="ai-header-profile">
                        <div class="ai-avatar-wrap">
                            <i class="fas fa-sparkles ai-avatar-icon"></i>
                            <span class="ai-status-pulse"></span>
                        </div>
                        <div class="ai-header-text">
                            <h3 class="ai-title">مساعد الميزو الذكي ✨</h3>
                            <span class="ai-subtitle" id="aiHeaderStatus">جاهز لمساعدتك في الترفيه والرياضة</span>
                        </div>
                    </div>
                    <div class="ai-header-actions">
                        <button class="ai-btn-icon" id="aiBtnToggleHistory" title="سجل المحادثات السابقة" onclick="window.AlMeZ0AI.toggleHistory()">
                            <i class="fas fa-history"></i>
                        </button>
                        <button class="ai-btn-icon" id="aiBtnClear" title="مسح المحادثة" onclick="window.AlMeZ0AI.clearChat()">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                        <button class="ai-btn-close" id="aiBtnClose" title="إغلاق (Esc)" onclick="window.AlMeZ0AI.closeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- صندوق الرسائل -->
                <div class="ai-chat-messages" id="aiChatMessages">
                    <div class="ai-message ai-bot-message">
                        <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                        <div class="ai-msg-content">
                            <div class="ai-msg-text">
                                مرحباً بك في <strong>سيرفرات الميزو</strong>! 🎬⚽<br>
                                أنا مساعدك الترفيهي والرياضي الذكي. يمكنك سؤالي صوتياً أو كتابياً عن:
                                <ul style="margin: 6px 0 0 16px; padding: 0;">
                                    <li>مواعيد مباريات اليوم والقنوات الناقلة ومعلقيها.</li>
                                    <li>هل فيلم أو مسلسل معين متوفر في سيرفرك وتشغيله لك فوراً.</li>
                                    <li>طلب تشغيل أي قناة بالجودة التي تختارها (4K / FHD / SD).</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- أزرار الاقتراحات السريعة (Quick Chips للريموت واللمس) -->
                <div class="ai-quick-chips" id="aiQuickChips">
                    <button class="ai-chip-btn" onclick="window.AlMeZ0AI.sendQuickPrompt('ما هي أهم مباريات اليوم ومواعيدها والقنوات الناقلة؟')">
                        ⚽ مباريات الليلة
                    </button>
                    <button class="ai-chip-btn" onclick="window.AlMeZ0AI.sendQuickPrompt('اقترح لي أفضل فيلم سهرة أكشن متوفر في سيرفري')">
                        🎬 فيلم سهرة
                    </button>
                    <button class="ai-chip-btn" onclick="window.AlMeZ0AI.sendQuickPrompt('ما هي أحدث المسلسلات المتوفرة في السيرفر؟')">
                        📺 أحدث المسلسلات
                    </button>
                    <button class="ai-chip-btn" onclick="window.AlMeZ0AI.sendQuickPrompt('ما هي القنوات الرياضية المتوفرة في السيرفر؟')">
                        🏆 القنوات الرياضية
                    </button>
                </div>

                <!-- شريط الإدخال المزدوج (صوت + كتابة) -->
                <div class="ai-input-bar">
                    <button class="ai-btn-mic" id="aiBtnMic" title="تحدث بالصوت" onclick="window.AlMeZ0AI.toggleMic()">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <input type="text" class="ai-chat-input" id="aiChatInput" placeholder="اكتب سؤالك أو اضغط على الميكروفون للتحدث..." autocomplete="off">
                    <button class="ai-btn-send" id="aiBtnSend" title="إرسال" onclick="window.AlMeZ0AI.submitMessage()">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // ربط مفتاح Enter
        const input = document.getElementById('aiChatInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitMessage();
                }
            });
        }
    }

    function showAiStatus(text) {
        const el = document.getElementById('aiHeaderStatus');
        if (el) el.innerText = text;
    }

    function appendMessage(sender, text, actionCardsHtml = '', saveToSession = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        const isUser = sender === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${isUser ? 'ai-user-message' : 'ai-bot-message'}`;

        const avatarHtml = isUser
            ? `<div class="ai-msg-avatar user"><i class="fas fa-user"></i></div>`
            : `<div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>`;

        const formattedText = isUser ? escHtml(text).replace(/\n/g, '<br>') : renderRichText(text);

        msgDiv.innerHTML = `
            ${avatarHtml}
            <div class="ai-msg-content">
                <div class="ai-msg-text">${formattedText}</div>
                ${actionCardsHtml ? `<div class="ai-msg-actions">${actionCardsHtml}</div>` : ''}
            </div>
        `;

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (saveToSession) {
            saveMessageToCurrentSession(sender, text, actionCardsHtml);
        }
        // ملاحظة: لا نعيد تهيئة محرك الريموت هنا؛ فهو يقرأ الأزرار الجديدة تلقائياً عند كل ضغطة
    }

    // =========================================================================
    // 5. كروت التشغيل التفاعلية (مبنية من وسوم الرد فقط)
    // =========================================================================
    // كل قيمة من السيرفر تُهرَّب: أسماء الأعمال تأتي من لوحة Xtream وقد تحتوي أي رموز
    function jsArg(v) {
        return escHtml(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' '));
    }

    function buildInteractiveCardsHtml(ctx) {
        let cards = '';
        (ctx.movies || []).forEach(m => {
            const cover = m.stream_icon || 'photo/logo.ico';
            const ext = m.container_extension || 'mp4';
            cards += `
                <div class="ai-card-item movie">
                    <img src="${escHtml(cover)}" class="ai-card-poster" onerror="this.src='photo/logo.ico'" style="width:48px;height:68px;min-width:48px;max-width:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                    <div class="ai-card-info">
                        <div class="ai-card-name" title="${escHtml(m.name)}">${escHtml(m.name)}</div>
                        <span class="ai-card-badge">فيلم متوفر</span>
                    </div>
                    <button class="ai-card-btn-play" onclick="window.AlMeZ0AI.playMovie('${jsArg(m.stream_id)}', '${jsArg(m.name)}', '${jsArg(cover)}', '${jsArg(ext)}')">
                        <i class="fas fa-play"></i> تشغيل الآن
                    </button>
                </div>`;
        });
        (ctx.series || []).forEach(s => {
            const cover = s.cover || s.stream_icon || 'photo/logo.ico';
            cards += `
                <div class="ai-card-item series">
                    <img src="${escHtml(cover)}" class="ai-card-poster" onerror="this.src='photo/logo.ico'" style="width:48px;height:68px;min-width:48px;max-width:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                    <div class="ai-card-info">
                        <div class="ai-card-name" title="${escHtml(s.name)}">${escHtml(s.name)}</div>
                        <span class="ai-card-badge">مسلسل متوفر</span>
                    </div>
                    <button class="ai-card-btn-play" onclick="window.AlMeZ0AI.playSeries('${jsArg(s.series_id)}', '${jsArg(s.name)}', '${jsArg(cover)}')">
                        <i class="fas fa-list"></i> عرض الحلقات
                    </button>
                </div>`;
        });
        (ctx.channels || []).forEach(ch => {
            cards += `
                <div class="ai-channel-block">
                    <div class="ai-channel-header">
                        <img src="${escHtml(ch.icon)}" class="ai-channel-icon" onerror="this.src='photo/logo.ico'" style="width:40px;height:40px;min-width:40px;max-width:40px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.06);padding:3px;flex-shrink:0;">
                        <span class="ai-channel-name">${escHtml(ch.baseName)}</span>
                    </div>
                    <div class="ai-qualities-row">
                        <span class="ai-q-title">اختر الجودة للتشغيل:</span>
                        <div class="ai-q-btns">
                            ${ch.qualities.map(q => `
                                <button class="ai-btn-quality" onclick="window.AlMeZ0AI.playChannel('${jsArg(q.id)}', '${jsArg(q.name)}', '${jsArg(ch.icon)}')">${escHtml(q.quality)}</button>
                            `).join('')}
                        </div>
                    </div>
                </div>`;
        });
        return cards;
    }

    // =========================================================================
    // 6. إرسال الرسالة وجلب الرد
    // =========================================================================
    let busy = false;

    function showTyping(statusText) {
        showAiStatus(statusText);
        const container = document.getElementById('aiChatMessages');
        if (!container || document.getElementById('aiTypingIndicator')) return;
        container.insertAdjacentHTML('beforeend', `
            <div class="ai-message ai-bot-message ai-typing-msg" id="aiTypingIndicator">
                <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                <div class="ai-msg-content"><div class="ai-typing-dots"><span></span><span></span><span></span></div></div>
            </div>`);
        container.scrollTop = container.scrollHeight;
    }

    function hideTyping() {
        const el = document.getElementById('aiTypingIndicator');
        if (el) el.remove();
    }

    async function answerQuestion(text) {
        showTyping('جاري البحث في سيرفرك وتحليل طلبك ⚡...');
        try {
            const reply = await askAssistant(text);
            hideTyping();
            const extras = buildInteractiveCardsHtml(reply.cards) + sourcesHtml(reply.sources);
            appendMessage('model', reply.text, extras, true);
            // السجل يحفظ السؤال والرد معاً بعد النجاح فقط (مع الوسوم ليعرف النموذج ما اقترحه)
            conversationHistory.push({ role: 'user', text }, { role: 'model', text: reply.raw });
            if (conversationHistory.length > 12) conversationHistory = conversationHistory.slice(-12);
            showAiStatus('جاهز لمساعدتك ✨');
        } catch (err) {
            console.error('[AlMeZ0 AI] Error handling message:', err);
            hideTyping();
            appendMessage('model', toFriendlyAiError(err), '', false);
            showAiStatus('جاهز لمساعدتك ✨');
        }
    }

    async function handleSendMessage(msgText) {
        if (!msgText || !msgText.trim() || busy) return;
        const text = msgText.trim().slice(0, 1500);
        const inputEl = document.getElementById('aiChatInput');
        if (inputEl) inputEl.value = '';
        busy = true;
        try {
            appendMessage('user', text, '', true);
            await answerQuestion(text);
        } finally {
            busy = false;
        }
    }

    function submitMessage() {
        const input = document.getElementById('aiChatInput');
        if (input && input.value) {
            handleSendMessage(input.value);
        }
    }

    // الرسالة الصوتية: تُحوَّل لنص أولاً في السيرفر (يظهر للعميل ما فهمه المساعد)، ثم تُعامل كسؤال مكتوب
    async function handleSendAudioMessage(base64Data, mimeType) {
        if (!base64Data || busy) return;
        busy = true;
        try {
            showTyping('جاري الاستماع للرسالة الصوتية 🎙️...');
            let text = '';
            try {
                const data = await callAi({ mode: 'transcribe', audio: base64Data, mimeType: mimeType || 'audio/webm' }, 45000);
                text = String((data && data.text) || '').trim();
            } catch (err) {
                hideTyping();
                console.error('[AlMeZ0 AI] transcribe error:', err);
                appendMessage('model', toFriendlyAiError(err), '', false);
                showAiStatus('جاهز لمساعدتك ✨');
                return;
            }
            if (!text) {
                hideTyping();
                appendMessage('model', 'لم أسمع كلاماً واضحاً في التسجيل 🎙️ حاول مرة أخرى وتكلم بالقرب من الميكروفون.', '', false);
                showAiStatus('جاهز لمساعدتك ✨');
                return;
            }
            hideTyping();
            appendMessage('user', '🎙️ ' + text, '', true);
            await answerQuestion(text.slice(0, 1500));
        } finally {
            busy = false;
        }
    }

    // =========================================================================
    // 7. دوال التحكم والتشغيل المباشر في مشغل الميزو
    // =========================================================================
    function playMovie(id, name, cover, ext) {
        closeModal();
        if (typeof showMovieDetails === 'function') {
            showMovieDetails(id, name, cover, ext || 'mp4');
        } else if (typeof playStream === 'function') {
            playStream(id, 'vod', ext || 'mp4', name, cover);
        }
    }

    function playSeries(id, name, cover) {
        closeModal();
        if (typeof showSeriesDetails === 'function') {
            showSeriesDetails(id, name, cover);
        }
    }

    function playChannel(id, name, icon) {
        closeModal();
        if (typeof playStream === 'function') {
            playStream(id, 'live', 'm3u8', name, icon);
        }
    }

    // =========================================================================
    // 8. التحكم في فتح وإغلاق النافذة
    // =========================================================================
    function openModal() {
        createAiModalDom();
        const modal = document.getElementById('almezoAiModal');
        if (modal) {
            modal.classList.remove('hidden');

            // لا نضع التركيز تلقائياً على حقل الكتابة على الأجهزة اللمسية وشاشات التلفاز،
            // لأن ذلك يفتح لوحة المفاتيح فوراً دون طلب المستخدم ويغطي نصف الشاشة.
            // التركيز التلقائي يبقى فقط على الكمبيوتر حيث توجد لوحة مفاتيح حقيقية.
            const hasPhysicalKeyboard = (function () {
                try {
                    if (isElectronEnvironment()) return true;
                    if (document.body.classList.contains('desktop-device-mode')) return true;
                    if (document.body.classList.contains('touch-device-mode')) return false;
                    if (document.body.classList.contains('tv-device-mode')) return false;
                    if (window.AndroidNativeBridge || (window.AlMeZ0App && window.AlMeZ0App.isAndroid)) return false;
                    return !(('ontouchstart' in window) || navigator.maxTouchPoints > 0);
                } catch (e) {
                    return false;
                }
            })();

            if (hasPhysicalKeyboard) {
                setTimeout(() => {
                    const input = document.getElementById('aiChatInput');
                    if (input) input.focus();
                }, 100);
            }
        }
    }

    function closeModal() {
        if (isListening && speechRecognition) {
            try { speechRecognition.stop(); } catch (e) { }
        }
        if (window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (e) { }
        }
        closeHistoryDrawer();
        const modal = document.getElementById('almezoAiModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    function clearChat() {
        startNewChat();
    }

    function sendQuickPrompt(promptText) {
        const input = document.getElementById('aiChatInput');
        if (input) input.value = promptText;
        handleSendMessage(promptText);
    }

    // =========================================================================
    // إتاحة الواجهة البرمجية الشاملة على النطاق العام
    // =========================================================================
    window.AlMeZ0AI = {
        openModal,
        closeModal,
        toggleMic: toggleSpeechListening,
        toggleHistory: toggleHistoryDrawer,
        startNewChat,
        loadSession,
        deleteSession,
        clearChat,
        submitMessage,
        sendQuickPrompt,
        handleSendAudioMessage,
        playMovie,
        playSeries,
        playChannel
    };

    // إغلاق النافذة بمفتاح ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            const modal = document.getElementById('almezoAiModal');
            if (modal && !modal.classList.contains('hidden')) {
                e.preventDefault();
                closeModal();
            }
        }
    });

    // التهيئة التلقائية للمحرك الصوتي وواجهة المودال
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSpeechEngine();
            createAiModalDom();
        });
    } else {
        initSpeechEngine();
        createAiModalDom();
    }
})();
