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
    // 1. تهيئة المحرك الصوتي (Speech Recognition & MediaRecorder & TTS)
    // =========================================================================
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecordingMedia = false;

    function initSpeechEngine() {
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
                    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                        startMediaRecorderVoice();
                    } else {
                        showAiStatus('جاهز لمساعدتك ✨');
                    }
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
    // 2. محرك البحث المحلي الذكي في سيرفر العميل النشط
    // =========================================================================
    const STOP_WORDS = new Set([
        'في', 'من', 'عن', 'على', 'الي', 'إلى', 'مع', 'هذا', 'هذه', 'تم', 'ما', 'شن', 'شنو', 'شنهو', 'ايش', 'شو', 'ماهي',
        'اليوم', 'الليلة', 'اليلة', 'الان', 'الآن', 'امس', 'أمس', 'غدا', 'بكرة', 'هل', 'اريد', 'أريد', 'بدي', 'ابي', 'ابغى',
        'عايز', 'افضل', 'أفضل', 'احسن', 'أحسن', 'اقترح', 'متوفر', 'سيرفر', 'مشاهدة', 'تشغيل', 'مهمة', 'مهمه', 'كبيرة',
        'جديد', 'جديدة', 'قديم', 'حلو', 'جميل', 'فيلم', 'افلام', 'أفلام', 'مسلسل', 'مسلسلات', 'حلقة', 'حلقات',
        'قناة', 'قنوات', 'بث', 'مباشر', 'مباراة', 'مباريات', 'سهرة', 'سهره'
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

    async function searchActiveClientServer(query) {
        const normQuery = normalizeArabic(query);
        const allWords = normQuery.split(' ').filter(w => w.length > 1);
        const meaningfulWords = allWords.filter(w => !STOP_WORDS.has(w));
        const isSports = isSportsQuery(query);

        const results = {
            isSports,
            movies: [],
            series: [],
            channels: []
        };

        try {
            // 1. إذا كان السؤال عن رياضة أو مباريات: نمنع البحث في الأفلام والمسلسلات نهائياً
            if (isSports) {
                if (window.getAllStreamsForType) {
                    const live = await window.getAllStreamsForType('live', 'get_live_streams').catch(() => []);
                    if (Array.isArray(live)) {
                        const sportsKeywords = ['bein', 'ssc', 'ad sport', 'alkass', 'on time', 'sport', 'رياضية', 'كورة', 'starz'];
                        const matched = live.filter(c => {
                            const cName = normalizeArabic(c.name || '');
                            return sportsKeywords.some(sk => cName.includes(sk));
                        });
                        results.channels = groupAndFormatChannels(matched).slice(0, 4);
                    }
                }
                return results;
            }

            // 2. للأفلام والمسلسلات: نعتمد فقط على الكلمات الفعلية بعد استبعاد الكلمات الشائعة
            const searchWords = meaningfulWords.length > 0 ? meaningfulWords : allWords;

            if (window.getAllStreamsForType) {
                const movies = await window.getAllStreamsForType('vod', 'get_vod_streams').catch(() => []);
                if (Array.isArray(movies) && movies.length > 0) {
                    if (searchWords.length > 0) {
                        results.movies = movies.filter(m => {
                            const mName = normalizeArabic(m.name || '');
                            return searchWords.some(w => mName.includes(w));
                        }).slice(0, 4);
                    }
                    // إذا كان السؤال عن تصنيف مثل أكشن أو فيلم سهرة ولم نجد تطابقاً حرفياً، نجلب أفلاماً ممتازة
                    if (results.movies.length === 0 && (normQuery.includes('اكشن') || normQuery.includes('سهرة') || normQuery.includes('افضل'))) {
                        results.movies = movies.slice(0, 4);
                    }
                }
            }

            // 3. فحص المسلسلات إذا لم تكن هناك أفلام مطابقة
            if (window.getAllStreamsForType && results.movies.length === 0) {
                const series = await window.getAllStreamsForType('series', 'get_series').catch(() => []);
                if (Array.isArray(series) && series.length > 0) {
                    if (searchWords.length > 0) {
                        results.series = series.filter(s => {
                            const sName = normalizeArabic(s.name || '');
                            return searchWords.some(w => sName.includes(w));
                        }).slice(0, 4);
                    }
                }
            }

            // 4. فحص قنوات البث المباشر العامة إذا طُلبت صراحة
            if (window.getAllStreamsForType && (normQuery.includes('قناة') || normQuery.includes('شغل'))) {
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

    function getApiKey() {
        return ((window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.apiKey) || localStorage.getItem('almezo_gemini_key') || "").trim();
    }

    function promptApiKey() {
        const current = getApiKey();
        const input = prompt("أدخل مفتاح Google Gemini API Key الخاص بك (مجاني من aistudio.google.com):", current);
        if (input !== null) {
            const clean = input.trim();
            if (clean) {
                localStorage.setItem('almezo_gemini_key', clean);
                if (window.ALMEZ0_AI_CONFIG) window.ALMEZ0_AI_CONFIG.apiKey = clean;
                alert("تم حفظ مفتاح API بنجاح! يمكنك الآن استخدام المساعد بحرية.");
            } else {
                localStorage.removeItem('almezo_gemini_key');
                alert("تمت إزالة المفتاح المحفوظ.");
            }
        }
    }

    // =========================================================================
    // 3. استدعاء Google Gemini 2.5 / 1.5 Flash مع بحث الويب (Google Search)
    // =========================================================================
    async function requestGeminiAi(userMessage, serverContext) {
        const apiKey = getApiKey();
        const configuredModel = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.model) || "gemini-2.5-flash";
        const systemPrompt = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.systemInstruction) || "";

        if (!apiKey) {
            throw new Error('يرجى الضغط على أيقونة المفتاح 🔑 في الأعلى وإدخال مفتاح Gemini API المجاني الخاص بك.');
        }

        // صياغة السياق المستخرج من سيرفر العميل الحالي بدقة تامة
        let contextText = '';
        if (serverContext.isSports) {
            contextText += `[سياق رياضي ومباريات اليوم]:\n`;
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات رياضية متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}"`).join('، ')}\n`;
            }
            contextText += `[توجيه حاسم ومطلوب]: العميل يسأل عن مباريات كرة قدم أو رياضة. استخدم Google Search لمعرفة مباريات اليوم وتوقيتها بدقة بتوقيت ليبيا/مصر (GMT+2) ومكة (GMT+3) والقنوات الناقلة الرسمية. يمنع منعاً باتاً التحدث عن أي أفلام أو مسلسلات!\n`;
        } else {
            contextText += `[سياق محتويات سيرفر العميل الحالي]:\n`;
            if (serverContext.movies && serverContext.movies.length > 0) {
                contextText += `- أفلام متوفرة في سيرفر العميل مطابقة: ${serverContext.movies.map(m => `"${m.name}" (ID: ${m.stream_id})`).join('، ')}\n`;
            }
            if (serverContext.series && serverContext.series.length > 0) {
                contextText += `- مسلسلات متوفرة في سيرفر العميل مطابقة: ${serverContext.series.map(s => `"${s.name}" (ID: ${s.series_id})`).join('، ')}\n`;
            }
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات بث مباشر متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}" (جودات: ${c.qualities.map(q => q.quality).join('/')})`).join('، ')}\n`;
            }
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

        const modelsToTry = [configuredModel, "gemini-1.5-flash"];
        let lastError = null;

        for (const m of modelsToTry) {
            try {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson.error ? errJson.error.message : `HTTP ${res.status}`;
                    if (res.status === 403 || errMsg.includes('leaked') || errMsg.includes('API key')) {
                        throw new Error('مفتاح Gemini API الحالي معطل من جوجل (Leaked Key). يرجى الضغط على زر المفتاح 🔑 في أعلى النافذة وإدخال مفتاح جديد مجاني من aistudio.google.com');
                    }
                    if (res.status === 404) {
                        lastError = new Error(errMsg);
                        continue;
                    }
                    throw new Error(errMsg);
                }

                const data = await res.json();
                const candidate = data.candidates && data.candidates[0];
                if (!candidate || !candidate.content || !candidate.content.parts) {
                    throw new Error('لم يتم استلام رد من النموذج');
                }

                const replyText = candidate.content.parts.map(p => p.text || '').join('').trim();
                return replyText;
            } catch (err) {
                lastError = err;
                if (err.message.includes('Leaked Key') || err.message.includes('🔑')) throw err;
            }
        }

        throw lastError || new Error('فشل الاتصال بنموذج الذكاء الاصطناعي');
    }

    async function requestGeminiAiAudio(base64Audio, mimeType, serverContext) {
        const apiKey = getApiKey();
        const configuredModel = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.model) || "gemini-2.5-flash";
        const systemPrompt = (window.ALMEZ0_AI_CONFIG && window.ALMEZ0_AI_CONFIG.systemInstruction) || "";

        if (!apiKey) {
            throw new Error('يرجى الضغط على زر المفتاح 🔑 أعلى النافذة وإدخال مفتاح Gemini API مجاني خاص بك.');
        }

        let contextText = '';
        if (serverContext.isSports) {
            contextText += `[سياق رياضي ومباريات اليوم]:\n`;
            if (serverContext.channels && serverContext.channels.length > 0) {
                contextText += `- قنوات رياضية متوفرة في سيرفر العميل: ${serverContext.channels.map(c => `"${c.baseName}"`).join('، ')}\n`;
            }
            contextText += `[توجيه حاسم ومطلوب]: إذا كان صوت العميل عن مباريات كرة قدم أو رياضة، اذكر مباريات اليوم وتوقيتها بدقة بتوقيت ليبيا/مصر (GMT+2) ومكة (GMT+3) والقنوات الناقلة. يمنع منعاً باتاً ذكر أي أفلام أو مسلسلات إذا كان السؤال رياضياً!\n`;
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
        }

        const audioPrompt = `استمع إلى هذا التسجيل الصوتي للعميل، وافهم سؤاله (سواء باللهجة الليبية أو العربية الفصحى أو أي لهجة عربية) وأجب عليه بدقة وود وفق إرشادات النظام، مع الاستفادة من سياق السيرفر إذا كان سؤاله يتعلق بفيلم أو مسلسل أو مباراة أو قناة:\n${contextText}`;

        const payload = {
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
            tools: [
                { googleSearch: {} }
            ],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 650
            }
        };

        const modelsToTry = [configuredModel, "gemini-1.5-flash"];
        let lastError = null;

        for (const m of modelsToTry) {
            try {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson.error ? errJson.error.message : `HTTP ${res.status}`;
                    if (res.status === 403 || errMsg.includes('leaked') || errMsg.includes('API key')) {
                        throw new Error('مفتاح Gemini API الحالي معطل من جوجل (Leaked Key). يرجى الضغط على زر المفتاح 🔑 في أعلى النافذة وإدخال مفتاح جديد مجاني من aistudio.google.com');
                    }
                    if (res.status === 404) {
                        lastError = new Error(errMsg);
                        continue;
                    }
                    throw new Error(errMsg);
                }

                const data = await res.json();
                const candidate = data.candidates && data.candidates[0];
                if (!candidate || !candidate.content || !candidate.content.parts) {
                    throw new Error('لم يتم استلام رد من النموذج');
                }

                return candidate.content.parts.map(p => p.text || '').join('').trim();
            } catch (err) {
                lastError = err;
                if (err.message.includes('Leaked Key') || err.message.includes('🔑')) throw err;
            }
        }

        throw lastError || new Error('فشل معالجة المقطع الصوتي');
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

    async function handleSendAudioMessage(base64Data, mimeType) {
        if (!base64Data) return;

        // 1. إظهار رسالة العميل كرسالة صوتية
        appendMessage('user', '🎙️ رسالة صوتية مسجلة...');

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
            // سياق السيرفر
            const serverContext = await searchActiveClientServer('');

            // إرسال الصوت للنموذج
            const aiReply = await requestGeminiAiAudio(base64Data, mimeType, serverContext);

            // إزالة مؤشر التحليل
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            // إذا كان الرد عن الرياضة والمباريات، لا نعرض كروت أفلام
            if (isSportsQuery(aiReply)) {
                serverContext.movies = [];
                serverContext.series = [];
            }

            // تجهيز كروت التشغيل وعرض الرد
            const actionCardsHtml = buildInteractiveCardsHtml(serverContext);
            appendMessage('model', aiReply, actionCardsHtml);
            conversationHistory.push({ role: "model", parts: [{ text: aiReply }] });

            // نطق الرد
            speakReply(aiReply);
            showAiStatus('جاهز لمساعدتك ✨');
        } catch (err) {
            console.error('[AlMeZ0 AI] Error handling audio message:', err);
            const typingEl = document.getElementById('aiTypingIndicator');
            if (typingEl) typingEl.remove();

            let errMsg = err.message || 'يرجى المحاولة مجدداً';
            appendMessage('model', `عذراً، حدث خطأ أثناء معالجة الرسالة الصوتية: ${errMsg}`);
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
        promptApiKey,
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
