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
                conversationHistory.push({
                    role: m.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: m.text }]
                });
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
                        <span class="ai-history-item-title" title="${safeTitle}">${s.title || 'محادثة'}</span>
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
            alert('التعرف الصوتي غير مدعوم في هذا الجهاز، يمكنك الكتابة في الحقل أدناه.');
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
            }, 8000);
        } catch (err) {
            console.error('[AlMeZ0 AI] getUserMedia error', err);
            isRecordingMedia = false;
            updateMicButtonState(false);
            showAiStatus('جاهز لمساعدتك ✨');
            alert('يرجى السماح بصلاحية الميكروفون للتحدث صوتياً.');
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
        action: ['اكشن', 'قتال', 'معارك', 'حروب', 'حرب', 'مطاردة', 'اثاره', 'إثاره', 'action'],
        comedy: ['كوميد', 'ضحك', 'مضحك', 'فرفش', 'طاش', 'comedy'],
        horror: ['رعب', 'مخيف', 'ارواح', 'اشباح', 'جن', 'زومبي', 'horror'],
        drama: ['درام', 'حزين', 'مؤثر', 'اجتماعي', 'drama'],
        scifi: ['خيال', 'علمي', 'فضاء', 'كائنات', 'مستقبل', 'sci fi', 'scifi', 'fiction'],
        animation: ['كرتون', 'انمي', 'اطفال', 'أنمي', 'anime', 'animation', 'cartoon'],
        arabic: ['عربي', 'مصر', 'سوري', 'لبنان', 'خليج', 'تونسي', 'مغرب'],
        turkish: ['تركي', 'تركيه', 'turk'],
        foreign: ['اجنبي', 'امريكي', 'هوليوود', 'foreign', 'english'],
        indian: ['هندي', 'بوليوود', 'indian', 'hindi']
    };

    function detectGenres(normText) {
        const detected = [];
        for (const [genre, keywords] of Object.entries(GENRE_KEYWORD_MAP)) {
            if (keywords.some(kw => normText.includes(kw))) {
                detected.push(genre);
            }
        }
        return detected;
    }

    async function searchActiveClientServer(query) {
        const normQuery = normalizeArabic(query);
        const allWords = normQuery.split(' ').filter(w => w.length > 1);
        const meaningfulWords = allWords.filter(w => !STOP_WORDS.has(w) && w.length >= 2);
        const isSports = isSportsQuery(query);

        const results = {
            isSports,
            movies: [],
            series: [],
            channels: []
        };

        try {
            // 1. إذا كان السؤال عن رياضة أو مباريات: نركز كلياً على القنوات الرياضية دون فحص الأفلام
            if (isSports) {
                if (window.getAllStreamsForType) {
                    const live = await window.getAllStreamsForType('live', 'get_live_streams').catch(() => []);
                    if (Array.isArray(live)) {
                        const sportsKeywords = ['bein', 'ssc', 'ad sport', 'alkass', 'on time', 'sport', 'رياضية', 'كورة', 'starz'];
                        let matched = [];
                        // إذا سأل العميل عن قناة معينة برقمها أو اسمها
                        const channelWords = meaningfulWords.filter(w => sportsKeywords.some(sk => sk.includes(w) || w.includes(sk)) || /\d+/.test(w));
                        if (channelWords.length > 0) {
                            matched = live.filter(c => {
                                const cName = normalizeArabic(c.name || '');
                                return channelWords.every(cw => cName.includes(cw));
                            });
                        }
                        if (matched.length === 0) {
                            matched = live.filter(c => {
                                const cName = normalizeArabic(c.name || '');
                                return sportsKeywords.some(sk => cName.includes(sk));
                            });
                        }
                        results.channels = groupAndFormatChannels(matched).slice(0, 4);
                    }
                }
                return results;
            }

            // 2. فحص التصنيف وكلمات البحث في الأفلام والمسلسلات
            const searchWords = meaningfulWords.length > 0 ? meaningfulWords : allWords.filter(w => w.length >= 2);
            const detectedGenres = detectGenres(normQuery);
            const isNightMovie = normQuery.includes('سهرة') || normQuery.includes('سهره') || normQuery.includes('الليلة') || normQuery.includes('افضل') || normQuery.includes('أفضل');

            let vodCategories = [];
            if (typeof window.getAllCategoriesForType === 'function') {
                vodCategories = await window.getAllCategoriesForType('vod').catch(() => []);
            }

            if (window.getAllStreamsForType) {
                const movies = await window.getAllStreamsForType('vod', 'get_vod_streams').catch(() => []);
                if (Array.isArray(movies) && movies.length > 0) {
                    // أ. إذا طلب المستخدم تصنيفاً معيناً (مثل أكشن، كوميدي، رعب)
                    if (detectedGenres.length > 0) {
                        const matchingCatIds = new Set();
                        if (Array.isArray(vodCategories)) {
                            vodCategories.forEach(cat => {
                                const catNameNorm = normalizeArabic(cat.category_name || '');
                                for (const g of detectedGenres) {
                                    const kws = GENRE_KEYWORD_MAP[g] || [];
                                    if (kws.some(kw => catNameNorm.includes(kw))) {
                                        matchingCatIds.add(String(cat.category_id));
                                    }
                                }
                            });
                        }

                        const genreMatches = movies.filter(m => {
                            if (m.category_id && matchingCatIds.has(String(m.category_id))) return true;
                            if (m.category_ids && Array.isArray(m.category_ids) && m.category_ids.some(cid => matchingCatIds.has(String(cid)))) return true;
                            const mName = normalizeArabic(m.name || '');
                            return detectedGenres.some(g => (GENRE_KEYWORD_MAP[g] || []).some(kw => mName.includes(kw)));
                        });

                        if (genreMatches.length > 0) {
                            genreMatches.sort((a, b) => {
                                const rA = parseFloat(a.rating || a.rating_5based || 0);
                                const rB = parseFloat(b.rating || b.rating_5based || 0);
                                if (rB !== rA) return rB - rA;
                                return (b.stream_id || 0) - (a.stream_id || 0);
                            });
                            results.movies = genreMatches.slice(0, 4);
                        }
                    }

                    // ب. إذا كان البحث عن اسم عمل/فيلم محدد (مطابقة محكمة لمنع الهلوسة)
                    if (results.movies.length === 0 && searchWords.length > 0) {
                        const titleMatches = movies.filter(m => {
                            const mName = normalizeArabic(m.name || '');
                            return searchWords.every(w => mName.includes(w));
                        });
                        if (titleMatches.length > 0) {
                            results.movies = titleMatches.slice(0, 4);
                        } else if (searchWords.length >= 2) {
                            // إذا كان العنوان مركباً، نشترط تطابق 70% على الأقل لتفادي التطابق العشوائي
                            const strongMatches = movies.filter(m => {
                                const mName = normalizeArabic(m.name || '');
                                const count = searchWords.filter(w => mName.includes(w)).length;
                                return (count / searchWords.length) >= 0.7;
                            });
                            if (strongMatches.length > 0) {
                                results.movies = strongMatches.slice(0, 4);
                            }
                        }
                    }

                    // ج. إذا كان السؤال عام عن فيلم سهرة أو أفضل فيلم
                    if (results.movies.length === 0 && isNightMovie) {
                        const topRatedMovies = [...movies].sort((a, b) => {
                            const rA = parseFloat(a.rating || a.rating_5based || 0);
                            const rB = parseFloat(b.rating || b.rating_5based || 0);
                            if (rB !== rA) return rB - rA;
                            return (b.stream_id || 0) - (a.stream_id || 0);
                        });
                        results.movies = topRatedMovies.slice(0, 4);
                    }
                }
            }

            // 3. فحص المسلسلات إذا لم تكن هناك أفلام مطابقة
            if (window.getAllStreamsForType && results.movies.length === 0) {
                const series = await window.getAllStreamsForType('series', 'get_series').catch(() => []);
                if (Array.isArray(series) && series.length > 0) {
                    if (searchWords.length > 0) {
                        const seriesMatches = series.filter(s => {
                            const sName = normalizeArabic(s.name || '');
                            return searchWords.every(w => sName.includes(w));
                        });
                        if (seriesMatches.length > 0) {
                            results.series = seriesMatches.slice(0, 4);
                        } else if (searchWords.length >= 2) {
                            const strongMatches = series.filter(s => {
                                const sName = normalizeArabic(s.name || '');
                                const count = searchWords.filter(w => sName.includes(w)).length;
                                return (count / searchWords.length) >= 0.7;
                            });
                            if (strongMatches.length > 0) {
                                results.series = strongMatches.slice(0, 4);
                            }
                        }
                    }
                }
            }

            // 4. فحص قنوات البث المباشر العامة إذا طُلبت صراحة
            if (window.getAllStreamsForType && (normQuery.includes('قناة') || normQuery.includes('شغل') || normQuery.includes('بث'))) {
                const live = await window.getAllStreamsForType('live', 'get_live_streams').catch(() => []);
                if (Array.isArray(live)) {
                    const matched = live.filter(c => {
                        const cName = normalizeArabic(c.name || '');
                        return searchWords.some(w => cName.includes(w));
                    });
                    results.channels = groupAndFormatChannels(matched).slice(0, 3);
                }
            }
        } catch (e) {
            console.warn('[AlMeZ0 AI] Error searching client server data', e);
        }

        return results;
    }

    // ملاحظة أمنية: لم يعد المساعد يستخدم مفتاح Gemini API من المتصفح مطلقاً.
    // الطلبات تمر عبر Cloud Function آمنة (generateAiReply) يبقى فيها المفتاح
    // على الخادم فقط، بنفس أسلوب دالة إشعارات واتساب.
    function getAiCallable() {
        if (typeof functions === 'undefined' || !functions) {
            throw new Error('خدمة المساعد الذكي غير متاحة حالياً في هذه الصفحة.');
        }
        return functions.httpsCallable('generateAiReply');
    }

    // مهلة زمنية واضحة بدل انتظار مفتوح بلا نهاية إن تأخر السيرفر أو انقطع الاتصال،
    // فكان المستخدم يرى المؤشر يدور طويلاً دون أي رسالة مفهومة
    const AI_REQUEST_TIMEOUT_MS = 35000;

    async function callAiWithTimeout(payload) {
        const aiCallable = getAiCallable();
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('انتهت المهلة أثناء انتظار رد المساعد. تحقق من اتصال الإنترنت وحاول مجدداً.'));
            }, AI_REQUEST_TIMEOUT_MS);
        });

        try {
            const result = await Promise.race([aiCallable(payload), timeoutPromise]);
            const replyText = (result && result.data && result.data.text) || '';
            if (!replyText) throw new Error('لم يتم استلام رد من النموذج');
            return replyText;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    // =========================================================================
    // 3. استدعاء Google Gemini 2.5 / 1.5 Flash عبر Cloud Function آمنة
    // =========================================================================
    async function requestGeminiAi(userMessage, serverContext) {
        const configuredModel = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.model) || "gemini-2.5-flash";
        const systemPrompt = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.systemInstruction) || "";

        // صياغة السياق المستخرج من سيرفر العميل الحالي بدقة تامة وبدون أي هلوسة
        let contextText = '';
        if (serverContext.isSports) {
            contextText += `[سياق رياضي ومباريات اليوم]:\n`;
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات رياضية متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}"`).join('، ')}\n`;
            }
            contextText += `[توجيه حاسم لمباريات اليوم والرياضة]: العميل يسأل عن مباريات كرة قدم أو بطولة أو فريق. استخدم بحث جوجل المباشر (Google Search) للوصول إلى تفاصيل المباراة الحقيقية اليوم: الموعد الدقيق بتوقيت ليبيا/مصر (GMT+2) ومكة (GMT+3)، البطولة، والمعلق، و**الأهم القناة الناقلة المحددة لهذه المباراة خصيصاً** (مثل beIN Sports 1 أو beIN Sports 2 أو SSC 1). اذكر القناة الناقلة المخصصة بدقة واختصار، وممنوع منعاً باتاً ذكر أي أفلام أو مسلسلات!\n`;
        } else {
            contextText += `[سياق محتويات سيرفر العميل الحالي]:\n`;
            if (serverContext.movies && serverContext.movies.length > 0) {
                contextText += `- أفلام متوفرة في سيرفر العميل مطابقة للطلب:\n${serverContext.movies.map((m, idx) => `  ${idx + 1}. "${m.name}" (التقييم: ${m.rating || 'ممتاز'}, المعرف: ${m.stream_id})`).join('\n')}\n`;
                contextText += `[توجيه صارم لمنع الهلوسة]: رشّح للعميل حصرياً من قائمة الأفلام المذكورة أعلاه المتوفرة في سيرفره، واذكر له نبذة عنها، ولا ترشح أي فيلم آخر غير موجود في هذه القائمة حتى يتطابق كلامك تماماً مع كروت التشغيل المعروضة أمامه بالأسفل!\n`;
            } else if (serverContext.series && serverContext.series.length > 0) {
                contextText += `- مسلسلات متوفرة في سيرفر العميل مطابقة للطلب:\n${serverContext.series.map((s, idx) => `  ${idx + 1}. "${s.name}" (التقييم: ${s.rating || 'ممتاز'}, المعرف: ${s.series_id})`).join('\n')}\n`;
                contextText += `[توجيه صارم لمنع الهلوسة]: رشّح للعميل حصرياً من قائمة المسلسلات المذكورة أعلاه المتوفرة في سيرفره، ولا ترشح أي مسلسل خارج هذه القائمة!\n`;
            } else if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات بث مباشر متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}" (جودات: ${c.qualities.map(q => q.quality).join('/')})`).join('، ')}\n`;
            } else {
                contextText += `- هذا العمل المحدد غير متوفر حالياً داخل سيرفر العميل.\n`;
                contextText += `[توجيه صارم لمنع الهلوسة]: العميل سأل عن عمل محدد غير موجود في السيرفر. استخدم معلوماتك أو بحث الويب (Google Search) لتقديم نبذة حقيقية وموجزة جداً وصحيحة عنه (سنة الإنتاج، القصة المختصرة)، وأبلغه بصراحة ولباقة أنه غير متوفر حالياً في السيرفر. يمنع تماماً ترشيح أي أفلام أخرى عشوائية أو الادعاء بأنه موجود!\n`;
            }
        }

        const promptWithContext = `${contextText}\nسؤال العميل: ${userMessage}`;

        // مكافحة الهلوسة: نمنع أداة بحث جوجل تماماً عندما يكون لدينا قائمة مطابقة مؤكدة من سيرفر
        // العميل نفسه (أفلام أو مسلسلات فعلية)، حتى لا يمزج النموذج معلومات من الإنترنت مع قائمة
        // يُفترض أن يلتزم بها حرفياً 100%. نُبقي البحث مفعّلاً فقط للرياضة أو حين لا توجد قائمة
        // محلية أصلاً (كالسؤال عن عمل غير متوفر أو قنوات عامة)، حيث يكون البحث الخارجي مطلوباً فعلاً.
        const hasStrictCatalogMatch = !serverContext.isSports &&
            ((serverContext.movies && serverContext.movies.length > 0) ||
             (serverContext.series && serverContext.series.length > 0));

        const payload = {
            model: configuredModel,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                ...conversationHistory.slice(-6),
                { role: "user", parts: [{ text: promptWithContext }] }
            ],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 650
            }
        };

        if (!hasStrictCatalogMatch) {
            payload.tools = [{ googleSearch: {} }];
        }

        try {
            return await callAiWithTimeout(payload);
        } catch (err) {
            const msg = (err && err.message) || 'فشل الاتصال بنموذج الذكاء الاصطناعي';
            throw new Error(msg);
        }
    }

    async function requestGeminiAiAudio(base64Audio, mimeType, serverContext) {
        const configuredModel = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.model) || "gemini-2.5-flash";
        const systemPrompt = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.systemInstruction) || "";

        let contextText = '';
        if (serverContext.isSports) {
            contextText += `[سياق رياضي ومباريات اليوم]:\n`;
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات رياضية متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}"`).join('، ')}\n`;
            }
            contextText += `[توجيه حاسم لمباريات اليوم والرياضة]: إذا كان صوت العميل عن مباريات كرة قدم أو رياضة، اذكر تفاصيل المباراة المقامة اليوم بدقة: التوقيت (ليبيا/مصر GMT+2 ومكة GMT+3) والقناة الناقلة المحددة لهذه المباراة خصيصاً. يمنع منعاً باتاً ذكر أي أفلام أو مسلسلات!\n`;
        } else {
            contextText += `[سياق محتويات سيرفر العميل الحالي]:\n`;
            if (serverContext.movies && serverContext.movies.length > 0) {
                contextText += `- أفلام متوفرة: ${serverContext.movies.map(m => `"${m.name}" (ID: ${m.stream_id})`).join('، ')}\n`;
            }
            if (serverContext.series && serverContext.series.length > 0) {
                contextText += `- مسلسلات متوفرة: ${serverContext.series.map(s => `"${s.name}" (ID: ${s.series_id})`).join('، ')}\n`;
            }
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات بث مباشر: ${serverContext.channels.map(c => `"${c.baseName}" (جودات: ${c.qualities.map(q => q.quality).join('/')})`).join('، ')}\n`;
            }
            if (!serverContext.movies.length && !serverContext.series.length && !serverContext.channels.length) {
                contextText += `- هذا العمل غير متوفر حالياً داخل سيرفر العميل. استخدم بحث الويب لإعطائه نبذة حقيقية مختصرة ووضّح له بلباقة عدم توفره بالسيرفر.\n`;
            }
        }

        const audioPrompt = `استمع إلى هذا التسجيل الصوتي للعميل، وافهم سؤاله (سواء باللهجة الليبية أو العربية الفصحى أو أي لهجة عربية) وأجب عليه بدقة وود وفق إرشادات النظام، مع الاستفادة من سياق السيرفر إذا كان سؤاله يتعلق بفيلم أو مسلسل أو مباراة أو قناة:\n${contextText}`;

        const payload = {
            model: configuredModel,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                ...conversationHistory.slice(-4),
                {
                    role: "user",
                    parts: [
                        { text: audioPrompt },
                        {
                            inlineData: {
                                mimeType: mimeType || 'audio/webm',
                                data: base64Audio
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 650
            }
        };

        // نفس منطق مكافحة الهلوسة في المسار النصي: لا بحث جوجل عند وجود مطابقة مؤكدة من كتالوج السيرفر
        const hasStrictCatalogMatch = !serverContext.isSports &&
            ((serverContext.movies && serverContext.movies.length > 0) ||
             (serverContext.series && serverContext.series.length > 0));
        if (!hasStrictCatalogMatch) {
            payload.tools = [{ googleSearch: {} }];
        }

        try {
            return await callAiWithTimeout(payload);
        } catch (err) {
            const msg = (err && err.message) || 'فشل معالجة المقطع الصوتي';
            throw new Error(msg);
        }
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

        // تحويل أسطر النص إلى <br>
        const formattedText = text.replace(/\n/g, '<br>');

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

        // تحديث محرك الريموت لتسجيل الأزرار الجديدة
        if (typeof initTvNavigationEngine === 'function') {
            try { initTvNavigationEngine(); } catch (e) { }
        }
    }

    // =========================================================================
    // 5. توليد كروت التشغيل التفاعلية (Movies, Series, Channel Qualities)
    // =========================================================================
    function buildInteractiveCardsHtml(serverContext) {
        let cards = '';

        // كروت الأفلام المطابقة
        if (serverContext.movies && serverContext.movies.length > 0) {
            serverContext.movies.forEach(m => {
                const cover = m.stream_icon || 'photo/logo.ico';
                const name = (m.name || '').replace(/'/g, "\\'");
                const ext = m.container_extension || 'mp4';
                cards += `
                    <div class="ai-card-item movie">
                        <img src="${cover}" class="ai-card-poster" onerror="this.src='photo/logo.ico'" style="width:48px;height:68px;min-width:48px;max-width:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                        <div class="ai-card-info">
                            <div class="ai-card-name" title="${name}">${m.name}</div>
                            <span class="ai-card-badge">فيلم متوفر</span>
                        </div>
                        <button class="ai-card-btn-play" onclick="window.AlMeZ0AI.playMovie('${m.stream_id}', '${name}', '${cover}', '${ext}')">
                            <i class="fas fa-play"></i> تشغيل الآن
                        </button>
                    </div>
                `;
            });
        }

        // كروت المسلسلات المطابقة
        if (serverContext.series && serverContext.series.length > 0) {
            serverContext.series.forEach(s => {
                const cover = s.cover || s.stream_icon || 'photo/logo.ico';
                const name = (s.name || '').replace(/'/g, "\\'");
                cards += `
                    <div class="ai-card-item series">
                        <img src="${cover}" class="ai-card-poster" onerror="this.src='photo/logo.ico'" style="width:48px;height:68px;min-width:48px;max-width:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                        <div class="ai-card-info">
                            <div class="ai-card-name" title="${name}">${s.name}</div>
                            <span class="ai-card-badge">مسلسل متوفر</span>
                        </div>
                        <button class="ai-card-btn-play" onclick="window.AlMeZ0AI.playSeries('${s.series_id}', '${name}', '${cover}')">
                            <i class="fas fa-list"></i> عرض الحلقات
                        </button>
                    </div>
                `;
            });
        }

        // قنوات البث المباشر مع أزرار الجودات (أيقونات مصغرة وأنيقة جداً)
        if (serverContext.channels && serverContext.channels.length > 0) {
            serverContext.channels.forEach(ch => {
                cards += `
                    <div class="ai-channel-block">
                        <div class="ai-channel-header">
                            <img src="${ch.icon}" class="ai-channel-icon" onerror="this.src='photo/logo.ico'" style="width:40px;height:40px;min-width:40px;max-width:40px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.06);padding:3px;flex-shrink:0;">
                            <span class="ai-channel-name">${ch.baseName}</span>
                        </div>
                        <div class="ai-qualities-row">
                            <span class="ai-q-title">اختر الجودة للتشغيل:</span>
                            <div class="ai-q-btns">
                                ${ch.qualities.map(q => `
                                    <button class="ai-btn-quality" onclick="window.AlMeZ0AI.playChannel('${q.id}', '${q.name.replace(/'/g, "\\'")}', '${ch.icon}')">
                                        ${q.quality}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        return cards;
    }

    // =========================================================================
    // 6. معالجة إرسال الرسالة وجلب الرد
    // =========================================================================
    async function handleSendMessage(msgText) {
        if (!msgText || !msgText.trim()) return;
        const text = msgText.trim();

        const inputEl = document.getElementById('aiChatInput');
        if (inputEl) inputEl.value = '';

        // 1. إظهار رسالة العميل
        appendMessage('user', text, '', true);
        conversationHistory.push({ role: "user", parts: [{ text }] });

        // 2. إظهار مؤشر الكتابة
        showAiStatus('جاري البحث والتحليل ⚡...');
        const typingIndicatorHtml = `
            <div class="ai-message ai-bot-message ai-typing-msg" id="aiTypingIndicator">
                <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                <div class="ai-msg-content">
                    <div class="ai-typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('aiChatMessages');
        if (container) {
            container.insertAdjacentHTML('beforeend', typingIndicatorHtml);
            container.scrollTop = container.scrollHeight;
        }

        try {
            // 3. فحص سيرفر العميل الحالي لحظياً
            const serverContext = await searchActiveClientServer(text);

            // 4. استدعاء نموذج الذكاء الاصطناعي مع بحث الويب
            const aiReply = await requestGeminiAi(text, serverContext);

            // إزالة مؤشر الكتابة
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            // 5. تجهيز الكروت التفاعلية للتشغيل
            const actionCardsHtml = buildInteractiveCardsHtml(serverContext);

            // 6. إظهار رد الذكاء الاصطناعي مع الكروت وحفظه
            appendMessage('model', aiReply, actionCardsHtml, true);
            conversationHistory.push({ role: "model", parts: [{ text: aiReply }] });

            showAiStatus('جاهز لمساعدتك ✨');
        } catch (err) {
            console.error('[AlMeZ0 AI] Error handling message:', err);
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            appendMessage('model', `عذراً، حدث خطأ أثناء معالجة الطلب: ${err.message || 'يرجى المحاولة مجدداً'}.`, '', true);
            showAiStatus('جاهز لمساعدتك ✨');
        }
    }

    function submitMessage() {
        const input = document.getElementById('aiChatInput');
        if (input && input.value) {
            handleSendMessage(input.value);
        }
    }

    async function handleSendAudioMessage(base64Data, mimeType) {
        if (!base64Data) return;

        // 1. إظهار رسالة العميل كرسالة صوتية
        appendMessage('user', '🎙️ رسالة صوتية مسجلة...', '', true);

        // 2. إظهار مؤشر التحليل
        showAiStatus('جاري الاستماع للصوت وتحليله ⚡...');
        const typingIndicatorHtml = `
            <div class="ai-message ai-bot-message ai-typing-msg" id="aiTypingIndicator">
                <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                <div class="ai-msg-content">
                    <div class="ai-typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('aiChatMessages');
        if (container) {
            container.insertAdjacentHTML('beforeend', typingIndicatorHtml);
            container.scrollTop = container.scrollHeight;
        }

        try {
            // إصلاح: كان يُجرى بحث في السيرفر بنص فارغ ('') قبل معرفة محتوى الرسالة الصوتية أصلاً،
            // فينتج سياق فارغ بلا معنى يُرسل للنموذج (سبب رئيسي لردود غير منطقية على الصوت).
            // الآن: نرسل الصوت أولاً بسياق فارغ صراحةً، ثم نبني كروت التشغيل من نص الرد نفسه.
            const emptyContext = { isSports: false, movies: [], series: [], channels: [] };

            // إرسال الصوت للنموذج
            const aiReply = await requestGeminiAiAudio(base64Data, mimeType, emptyContext);

            // إزالة مؤشر التحليل
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            // البحث في سيرفر العميل بناءً على ما فهمه المساعد فعلياً من الصوت
            let serverContext = emptyContext;
            try {
                serverContext = await searchActiveClientServer(aiReply);
            } catch (e) { }

            // إذا كان الرد عن الرياضة والمباريات، لا نعرض كروت أفلام
            if (isSportsQuery(aiReply)) {
                serverContext.movies = [];
                serverContext.series = [];
            }

            // تجهيز كروت التشغيل وعرض الرد
            const actionCardsHtml = buildInteractiveCardsHtml(serverContext);
            appendMessage('model', aiReply, actionCardsHtml, true);
            conversationHistory.push({ role: "model", parts: [{ text: aiReply }] });

            showAiStatus('جاهز لمساعدتك ✨');
        } catch (err) {
            console.error('[AlMeZ0 AI] Error handling audio message:', err);
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            let errMsg = err.message || 'يرجى المحاولة مجدداً';
            appendMessage('model', `عذراً، حدث خطأ أثناء معالجة الرسالة الصوتية: ${errMsg}`, '', true);
            showAiStatus('جاهز لمساعدتك ✨');
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
            setTimeout(() => {
                const input = document.getElementById('aiChatInput');
                if (input) input.focus();
            }, 100);
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
