/**
 * مساعد الميزو الذكي (AlMeZ0 AI Assistant)
 * دعم كامل للصوت والكتابة (Speech-to-Text & Text-to-Speech)
 * فحص ديناميكي مباشر لمحتوى سيرفر العميل النشط
 * بحث الويب لمواعيد المباريات الحية وتفاصيل الأعمال السينمائية
 * تحكم وتشغيل فوري في مشغل الميزو
 */

(function () {
    let aiModal = null;
    let isAiMuted = localStorage.getItem('almezo_ai_muted') === 'true';
    let isListening = false;
    let speechRecognition = null;
    let conversationHistory = [];

    // =========================================================================
    // 1. تهيئة المحرك الصوتي (Speech Recognition & Speech Synthesis)
    // =========================================================================
    function initSpeechEngine() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            try {
                speechRecognition = new SpeechRec();
                speechRecognition.continuous = false;
                speechRecognition.interimResults = false;
                // ضبط اللغة للعربية بلهجة ليبية مع دعم اللهجات العربية
                speechRecognition.lang = 'ar-LY';

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
                    // إذا تعذر التعرف بـ ar-LY نجرب بـ ar
                    if (speechRecognition.lang === 'ar-LY') {
                        speechRecognition.lang = 'ar';
                    }
                    showAiStatus('جاهز للمساعدة ✨');
                };

                speechRecognition.onend = () => {
                    isListening = false;
                    updateMicButtonState(false);
                    showAiStatus('جاهز للمساعدة ✨');
                };
            } catch (e) {
                console.warn('[AlMeZ0 AI] Failed to init SpeechRec', e);
            }
        }
    }

    function toggleSpeechListening() {
        if (!speechRecognition) {
            alert('التعرف الصوتي غير مدعوم في هذا المتصفح، يمكنك الكتابة في الحقل أدناه.');
            return;
        }
        if (isListening) {
            speechRecognition.stop();
        } else {
            try {
                speechRecognition.start();
            } catch (e) {
                try {
                    speechRecognition.stop();
                    setTimeout(() => speechRecognition.start(), 200);
                } catch (err) { }
            }
        }
    }

    function updateMicButtonState(listening) {
        const micBtn = document.getElementById('aiBtnMic');
        if (micBtn) {
            micBtn.classList.toggle('is-recording', listening);
            micBtn.title = listening ? 'جاري الاستماع... اضغط للإيقاف' : 'اضغط للتحدث بالصوت';
        }
    }

    function speakReply(text) {
        if (isAiMuted || !window.speechSynthesis) return;
        try {
            window.speechSynthesis.cancel();
            // تنظيف النص من الرموز والروابط لتوفير نطق طبيعي
            let clean = text.replace(/[*#_`~]/g, '')
                .replace(/https?:\/\/\S+/g, '')
                .replace(/\[.*?\]/g, '')
                .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // Emojis
                .trim();

            if (!clean) return;

            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.lang = 'ar';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            const voices = window.speechSynthesis.getVoices();
            const arVoice = voices.find(v => v.lang.startsWith('ar') || v.lang.includes('Arabic'));
            if (arVoice) utterance.voice = arVoice;

            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('[AlMeZ0 AI] TTS error', e);
        }
    }

    // =========================================================================
    // 2. محرك البحث المحلي الديناميكي في سيرفر العميل النشط فقط
    // =========================================================================
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

    async function searchActiveClientServer(query) {
        const normQuery = normalizeArabic(query);
        const words = normQuery.split(' ').filter(w => w.length > 1);

        const results = {
            movies: [],
            series: [],
            channels: []
        };

        try {
            // 1. فحص الأفلام
            if (window.getAllStreamsForType) {
                const movies = await window.getAllStreamsForType('vod', 'get_vod_streams').catch(() => []);
                if (Array.isArray(movies)) {
                    results.movies = movies.filter(m => {
                        const mName = normalizeArabic(m.name || '');
                        return words.some(w => mName.includes(w));
                    }).slice(0, 4);
                }
            }

            // 2. فحص المسلسلات
            if (window.getAllStreamsForType) {
                const series = await window.getAllStreamsForType('series', 'get_series').catch(() => []);
                if (Array.isArray(series)) {
                    results.series = series.filter(s => {
                        const sName = normalizeArabic(s.name || '');
                        return words.some(w => sName.includes(w));
                    }).slice(0, 4);
                }
            }

            // 3. فحص قنوات البث المباشر
            if (window.getAllStreamsForType) {
                const live = await window.getAllStreamsForType('live', 'get_live_streams').catch(() => []);
                if (Array.isArray(live)) {
                    // البحث عن القنوات ومطابقة الأسماء مع تجميع الجودات
                    const matched = live.filter(c => {
                        const cName = normalizeArabic(c.name || '');
                        return words.some(w => cName.includes(w));
                    });

                    // تجميع القنوات حسب الاسم الأساسي والجودات
                    const grouped = {};
                    matched.forEach(ch => {
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

                    results.channels = Object.values(grouped).slice(0, 3);
                }
            }
        } catch (e) {
            console.warn('[AlMeZ0 AI] Error searching client server data', e);
        }

        return results;
    }

    // =========================================================================
    // 3. استدعاء Google Gemini 2.0 / 1.5 Flash مع بحث الويب (Google Search)
    // =========================================================================
    async function requestGeminiAi(userMessage, serverContext) {
        const apiKey = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.apiKey) || "";
        const model = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.model) || "gemini-2.0-flash";
        const systemPrompt = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.systemInstruction) || "";

        if (!apiKey) {
            throw new Error('يرجى التأكد من ضبط مفتاح Gemini API Key في ai-config.js');
        }

        // صياغة السياق المستخرج من سيرفر العميل الحالي
        let contextText = `[سياق محتويات سيرفر العميل الحالي]:\n`;
        if (serverContext.movies && serverContext.movies.length > 0) {
            contextText += `- أفلام متوفرة في سيرفر العميل مطابقة: ${serverContext.movies.map(m => `"${m.name}" (ID: ${m.stream_id})`).join('، ')}\n`;
        } else {
            contextText += `- لم نجد أفلاماً مطابقة مباشرة في السيرفر.\n`;
        }
        if (serverContext.series && serverContext.series.length > 0) {
            contextText += `- مسلسلات متوفرة في سيرفر العميل مطابقة: ${serverContext.series.map(s => `"${s.name}" (ID: ${s.series_id})`).join('، ')}\n`;
        }
        if (serverContext.channels && serverContext.channels.length > 0) {
            contextText += `- قنوات بث مباشر متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}" (جودات: ${c.qualities.map(q => q.quality).join('/')})`).join('، ')}\n`;
        }

        const promptWithContext = `${contextText}\nسؤال العميل: ${userMessage}`;

        const payload = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                ...conversationHistory.slice(-6),
                { role: "user", parts: [{ text: promptWithContext }] }
            ],
            tools: [
                { googleSearch: {} } // تمكين بحث جوجل المباشر للمباريات والأفلام
            ],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 650
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error ? errJson.error.message : `HTTP ${res.status}`);
        }

        const data = await res.json();
        const candidate = data.candidates && data.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
            throw new Error('لم يتم استلام رد من النموذج');
        }

        const replyText = candidate.content.parts.map(p => p.text || '').join('').trim();
        return replyText;
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
                        <button class="ai-btn-icon ${isAiMuted ? 'muted' : ''}" id="aiBtnMute" title="${isAiMuted ? 'تشغيل الصوت' : 'كتم الصوت'}" onclick="window.AlMeZ0AI.toggleMute()">
                            <i class="fas ${isAiMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i>
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
                    <button class="ai-chip-btn" onclick="window.AlMeZ0AI.sendQuickPrompt('شغلي قناة beIN Sports 1')">
                        📺 beIN Sports 1
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

    function appendMessage(sender, text, actionCardsHtml = '') {
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
                        <img src="${cover}" class="ai-card-poster" onerror="this.src='photo/logo.ico'">
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
                        <img src="${cover}" class="ai-card-poster" onerror="this.src='photo/logo.ico'">
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

        // قنوات البث المباشر مع أزرار الجودات
        if (serverContext.channels && serverContext.channels.length > 0) {
            serverContext.channels.forEach(ch => {
                cards += `
                    <div class="ai-channel-block">
                        <div class="ai-channel-header">
                            <img src="${ch.icon}" class="ai-channel-icon" onerror="this.src='photo/logo.ico'">
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
        appendMessage('user', text);
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

            // 6. إظهار رد الذكاء الاصطناعي مع الكروت
            appendMessage('model', aiReply, actionCardsHtml);
            conversationHistory.push({ role: "model", parts: [{ text: aiReply }] });

            // 7. نطق الرد صوتياً
            speakReply(aiReply);
            showAiStatus('جاهز لمساعدتك ✨');
        } catch (err) {
            console.error('[AlMeZ0 AI] Error handling message:', err);
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            appendMessage('model', `عذراً، حدث خطأ أثناء معالجة الطلب: ${err.message || 'يرجى المحاولة مجدداً'}.`);
            showAiStatus('جاهز لمساعدتك ✨');
        }
    }

    function submitMessage() {
        const input = document.getElementById('aiChatInput');
        if (input && input.value) {
            handleSendMessage(input.value);
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
        const modal = document.getElementById('almezoAiModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    function toggleMute() {
        isAiMuted = !isAiMuted;
        localStorage.setItem('almezo_ai_muted', String(isAiMuted));
        const btn = document.getElementById('aiBtnMute');
        if (btn) {
            btn.classList.toggle('muted', isAiMuted);
            btn.title = isAiMuted ? 'تشغيل الصوت' : 'كتم الصوت';
            btn.innerHTML = `<i class="fas ${isAiMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i>`;
        }
        if (isAiMuted && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    function clearChat() {
        conversationHistory = [];
        const container = document.getElementById('aiChatMessages');
        if (container) {
            container.innerHTML = `
                <div class="ai-message ai-bot-message">
                    <div class="ai-msg-avatar"><i class="fas fa-sparkles"></i></div>
                    <div class="ai-msg-content">
                        <div class="ai-msg-text">
                            تم مسح المحادثة السابقة. كيف يمكنني مساعدتك الآن؟ 🎬⚽
                        </div>
                    </div>
                </div>
            `;
        }
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
        toggleMute,
        clearChat,
        submitMessage,
        sendQuickPrompt,
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
