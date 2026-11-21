/**
 * CEPOT AI - Interactive Live Avatar & Voice Chatbot
 * Sinkronisasi Video Thinking vs Speaking & Web Speech STT/TTS (Anti-Stuck & Suara Sinkron)
 */

document.addEventListener('DOMContentLoaded', function () {

    // ============================================================
    // 1. ELEMEN SELEKTOR
    // ============================================================
    const chatbotWrapper = document.getElementById('chatbot-wrapper');
    const chatbotButton = document.getElementById('chatbotButton');
    const chatPopup = document.getElementById('chatPopup');
    const chatClose = document.getElementById('chatClose');
    const launcherBadge = document.getElementById('launcherBadge');

    // Video Avatar Elements
    const videoThinking = document.getElementById('videoThinking');
    const videoSpeaking = document.getElementById('videoSpeaking');
    const avatarStatusPill = document.getElementById('avatarStatusPill');
    const avatarStatusText = document.getElementById('avatarStatusText');

    // Voice & Mode Controls
    const chatVoiceToggle = document.getElementById('chatVoiceToggle');
    const voiceToggleIcon = document.getElementById('voiceToggleIcon');
    const btnVoiceInteractive = document.getElementById('btnVoiceInteractive');
    const btnVoiceLabel = document.getElementById('btnVoiceLabel');
    const btnVoiceIcon = document.getElementById('btnVoiceIcon');
    const btnInputMic = document.getElementById('btnInputMic');
    const chatStatusText = document.getElementById('chatStatusText');

    // Chat Input & Messages
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typingIndicator');

    // Cek Login
    const isLoggedIn = chatbotWrapper ? JSON.parse(chatbotWrapper.getAttribute('data-user-logged-in')) : false;
    const loginUrl = chatbotWrapper ? chatbotWrapper.getAttribute('data-login-url') : '/auth/login';

    // State Variables
    let isVoiceActive = true;         // Suara TTS Cepot aktif secara default
    let isListening = false;           // Sedang merekam suara user via mic
    let isSpeaking = false;            // Sedang memainkan suara/animasi jawaban
    let recognition = null;            // Instance Web Speech Recognition
    let speechQueue = [];              // Antrean kalimat teks untuk dibaca
    let speechHeartbeat = null;        // Chrome SpeechSynthesis anti-freeze keepalive
    let muteFallbackTimer = null;      // Timer jika suara dimatikan manual

    // ============================================================
    // 2. VIDEO STATE CONTROLLER (DEFAULT: THINKING 100%)
    // ============================================================
    function setVideoState(state) {
        if (!videoThinking || !videoSpeaking) return;

        if (state === 'speaking') {
            // Sembunyikan thinking, tampilkan speaking (Looping terus selama menjawab)
            videoThinking.style.setProperty('display', 'none', 'important');
            try { videoThinking.pause(); } catch(e){}

            videoSpeaking.style.setProperty('display', 'block', 'important');
            videoSpeaking.loop = true; // Terus gerak sampai suara tuntas
            videoSpeaking.currentTime = 0;
            videoSpeaking.play().catch(() => {});
        } else {
            // Default mutlak: THINKING (Looping tenang)
            videoSpeaking.style.setProperty('display', 'none', 'important');
            videoSpeaking.loop = false;
            try { videoSpeaking.pause(); } catch(e){}

            videoThinking.style.setProperty('display', 'block', 'important');
            videoThinking.loop = true;
            videoThinking.play().catch(() => {});
        }
    }

    function setStatus(state) {
        if (!avatarStatusPill || !avatarStatusText) return;

        avatarStatusPill.className = 'avatar-status-pill';

        if (state === 'listening') {
            avatarStatusPill.classList.add('listening');
            avatarStatusText.innerText = 'Mendengarkan... 🎤';
        } else if (state === 'thinking') {
            avatarStatusPill.classList.add('thinking');
            avatarStatusText.innerText = 'Sedang Berpikir... ⏳';
        } else if (state === 'speaking') {
            avatarStatusPill.classList.add('speaking');
            avatarStatusText.innerText = 'Sedang Menjawab... 🗣️';
        } else {
            // Ready (Default saat tidak bicara)
            avatarStatusText.innerText = 'Siap Membantu ✨';
        }
    }

    // Pastikan video awal adalah THINKING & status READY
    setVideoState('thinking');
    setStatus('ready');

    // ============================================================
    // 3. TOGGLE MODAL BUKA / TUTUP
    // ============================================================
    if (chatbotButton) {
        chatbotButton.addEventListener('click', () => {
            chatPopup.classList.add('active');
            if (launcherBadge) launcherBadge.style.display = 'none';

            // Reset ke keadaan awal (pasti thinking)
            stopSpeaking();
            stopListening();
            setVideoState('thinking');
            setStatus('ready');

            setTimeout(() => {
                if (chatInput) chatInput.focus();
            }, 300);
        });
    }

    if (chatClose) {
        chatClose.addEventListener('click', () => {
            chatPopup.classList.remove('active');
            stopListening();
            stopSpeaking();
            setVideoState('thinking');
            setStatus('ready');
        });
    }

    // ============================================================
    // 4. AUDIO TOGGLE (MUTE / UNMUTE SUARA CEPOT)
    // ============================================================
    if (chatVoiceToggle) {
        chatVoiceToggle.addEventListener('click', () => {
            isVoiceActive = !isVoiceActive;
            if (isVoiceActive) {
                chatVoiceToggle.classList.remove('muted');
                voiceToggleIcon.className = 'fas fa-volume-high';
                chatVoiceToggle.title = 'Suara Cepot: Aktif (Klik untuk mematikan suara)';
            } else {
                chatVoiceToggle.classList.add('muted');
                voiceToggleIcon.className = 'fas fa-volume-xmark';
                chatVoiceToggle.title = 'Suara Cepot: Senyap (Klik untuk mengaktifkan)';
                stopSpeaking();
            }
        });
    }

    // ============================================================
    // 5. HELPER NOTIFIKASI SISTEM
    // ============================================================

    function addSystemMessage(htmlMsg) {
        const div = document.createElement('div');
        div.style.textAlign = 'center';
        div.style.fontSize = '0.74rem';
        div.style.color = '#D4A373';
        div.style.margin = '8px 0';
        div.style.padding = '4px 10px';
        div.style.background = 'rgba(212, 163, 115, 0.08)';
        div.style.borderRadius = '12px';
        div.innerHTML = htmlMsg;
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    // ============================================================
    // 6. SPEECH-TO-TEXT (STT) - DENGARKAN MIC USER
    // ============================================================
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'id-ID';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            isListening = true;
            stopSpeaking();
            setStatus('listening');
            setVideoState('thinking'); // Saat mendengarkan tetap pose thinking
            updateMicButtonUI(true);
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript && transcript.trim()) {
                if (chatInput) chatInput.value = transcript;
                handleSendMessage(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.warn('Speech Recognition Error:', event.error);
            stopListening();
            setStatus('ready');
            setVideoState('thinking');
        };

        recognition.onend = () => {
            stopListening();
        };
    }

    function toggleListening() {
        if (!recognition) {
            alert('Browser Anda belum mendukung input suara Web Speech. Silakan gunakan Google Chrome atau Microsoft Edge.');
            return;
        }

        if (isListening) {
            stopListening();
            setStatus('ready');
            setVideoState('thinking');
        } else {
            stopSpeaking();
            try {
                recognition.start();
            } catch (e) {
                console.error(e);
            }
        }
    }

    function stopListening() {
        if (recognition && isListening) {
            try { recognition.stop(); } catch(e){}
        }
        isListening = false;
        updateMicButtonUI(false);
    }

    function updateMicButtonUI(active) {
        if (btnVoiceInteractive) {
            if (active) {
                btnVoiceInteractive.classList.add('recording');
                if (btnVoiceLabel) btnVoiceLabel.innerText = 'Mendengarkan...';
                if (btnVoiceIcon) btnVoiceIcon.className = 'fas fa-microphone-lines';
            } else {
                btnVoiceInteractive.classList.remove('recording');
                if (btnVoiceLabel) btnVoiceLabel.innerText = 'Bicara Suara';
                if (btnVoiceIcon) btnVoiceIcon.className = 'fas fa-microphone';
            }
        }

        if (btnInputMic) {
            if (active) {
                btnInputMic.classList.add('listening');
            } else {
                btnInputMic.classList.remove('listening');
            }
        }
    }

    if (btnVoiceInteractive) {
        btnVoiceInteractive.addEventListener('click', toggleListening);
    }
    if (btnInputMic) {
        btnInputMic.addEventListener('click', toggleListening);
    }

    // ============================================================
    // 7. TEXT-TO-SPEECH (TTS) & ANIMASI BICARA CEPOT (SINKRON SUARA)
    // ============================================================
    function speakCepotResponse(rawText) {
        stopSpeaking();

        // 1. Bersihkan teks dari Markdown dan tag HTML
        let cleanText = (rawText || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[*_#`~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleanText) return;

        // 2. Mulai animasi video speak & ubah status
        isSpeaking = true;
        setVideoState('speaking');
        setStatus('speaking');

        // 3. Jika suara diaktifkan & didukung browser
        if (isVoiceActive && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();

                // Pisahkan per kalimat agar pembacaan lancar & tidak freeze di Chrome
                const rawSentences = cleanText.match(/[^.!?\n]+[.!?\n]*/g) || [cleanText];
                speechQueue = rawSentences.map(s => s.trim()).filter(s => s.length > 0);

                if (speechQueue.length === 0) {
                    stopSpeaking();
                    return;
                }

                // Keep-alive Chrome: Cegah Chrome SpeechSynthesis pause otomatis di tengah kalimat
                clearInterval(speechHeartbeat);
                speechHeartbeat = setInterval(() => {
                    if (window.speechSynthesis.speaking) {
                        window.speechSynthesis.resume();
                    } else if (!isSpeaking) {
                        clearInterval(speechHeartbeat);
                    }
                }, 3000);

                // Jalankan antrean pembacaan
                playNextSentence();

            } catch (e) {
                console.warn("TTS Error:", e);
                fallbackTimer(cleanText);
            }
        } else {
            // Jika suara dimute, mainkan animasi sesuai panjang teks
            fallbackTimer(cleanText);
        }
    }

    function playNextSentence() {
        if (!isSpeaking) return;

        if (speechQueue.length === 0) {
            // Semua kalimat selesai dibaca secara tuntas!
            stopSpeaking();
            return;
        }

        const sentence = speechQueue.shift();
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = 'id-ID';
        utterance.rate = 1.05;
        utterance.pitch = 1.15;

        // Pilih suara Bahasa Indonesia
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
        if (idVoice) utterance.voice = idVoice;

        utterance.onend = function () {
            if (speechQueue.length > 0 && isSpeaking) {
                // Masih ada kalimat berikutnya, lanjut bicara
                playNextSentence();
            } else {
                // Kalimat terakhir selesai -> Kembali ke thinking!
                stopSpeaking();
            }
        };

        utterance.onerror = function (err) {
            console.warn("Utterance error:", err);
            if (speechQueue.length > 0 && isSpeaking) {
                playNextSentence();
            } else {
                stopSpeaking();
            }
        };

        window.speechSynthesis.speak(utterance);
    }

    function fallbackTimer(text) {
        // Durasi animasi jika suara off (berdasarkan kecepatan baca manusia)
        const duration = Math.min(12000, Math.max(3500, text.length * 40));
        muteFallbackTimer = setTimeout(() => {
            stopSpeaking();
        }, duration);
    }

    // Fungsi Penghenti Suara & Pengembali ke Thinking
    function stopSpeaking() {
        isSpeaking = false;
        speechQueue = [];

        if (speechHeartbeat) {
            clearInterval(speechHeartbeat);
            speechHeartbeat = null;
        }

        if (muteFallbackTimer) {
            clearTimeout(muteFallbackTimer);
            muteFallbackTimer = null;
        }

        if ('speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch(e){}
        }

        // Tepat saat suara tuntas: Hentikan speak & kembali ke thinking!
        setVideoState('thinking');
        setStatus('ready');
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }

    // ============================================================
    // 8. RENDER PESAN USER & BOT
    // ============================================================
    function appendUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'message-row user-row';
        div.innerHTML = `
            <div class="message-bubble user-bubble">
                <p>${escapeHtml(text)}</p>
                <span class="message-time">Kamu</span>
            </div>
        `;
        insertMessage(div);
    }

    function appendBotMessage(htmlContent, rawText) {
        const div = document.createElement('div');
        div.className = 'message-row bot-row';
        div.innerHTML = `
            <div class="bot-msg-avatar">
                <img src="/static/images/cepot_head.png?v=3.0" onerror="this.src='/static/images/cepot_avatar.png'">
            </div>
            <div class="message-bubble bot-bubble">
                <p class="bot-msg-text">${htmlContent}</p>
                <span class="message-time">Cepot AI • Baru saja</span>
            </div>
        `;
        insertMessage(div);

        // Putar suara dan jalankan video speak sampai suara benar-benar selesai
        speakCepotResponse(rawText || htmlContent);
    }

    function insertMessage(divElement) {
        if (typingIndicator && typingIndicator.parentNode === chatMessages) {
            chatMessages.insertBefore(divElement, typingIndicator);
        } else {
            chatMessages.appendChild(divElement);
        }
        scrollToBottom();
    }

    function showTyping() {
        if (typingIndicator) {
            typingIndicator.style.display = 'inline-flex';
            scrollToBottom();
        }
        // Saat menunggu balasan: video tetap thinking dan status sedang berpikir
        setVideoState('thinking');
        setStatus('thinking');
    }

    function hideTyping() {
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    // ============================================================
    // 9. LOGIKA PENGIRIMAN PESAN KE BACKEND
    // ============================================================
    async function handleSendMessage(textOverride) {
        const text = textOverride || (chatInput ? chatInput.value.trim() : '');
        if (!text) return;

        if (chatInput) chatInput.value = '';
        stopListening();
        stopSpeaking(); // Hentikan jika sedang bicara sebelumnya
        appendUserMessage(text);
        showTyping();

        const currentMode = 'gemini'; // Default Gemini AI

        try {
            const response = await fetch('/api/chat-smart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    mode: currentMode
                })
            });

            const data = await response.json();

            setTimeout(() => {
                hideTyping();

                let raw = "Maaf lur, Cepot dereng saged mangsuli niku.";
                if (data.response) {
                    raw = data.response;
                }

                let formatted = raw.replace(/\n/g, '<br>');
                formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

                appendBotMessage(formatted, raw);
            }, 350);

        } catch (error) {
            console.error("Chat Error:", error);
            hideTyping();
            stopSpeaking();
            appendBotMessage("Waduh lur, jaringan lagi error euy. Coba sediluk maning ya! 🙏", "Waduh lur, jaringan lagi error. Coba sebentar lagi ya.");
        }
    }

    // ============================================================
    // 10. EVENT LISTENERS
    // ============================================================
    if (sendButton) {
        sendButton.addEventListener('click', () => handleSendMessage());
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
    }

    // Klik Quick Suggestion Chips
    document.addEventListener('click', function (e) {
        const chip = e.target.closest('.quick-chip');
        if (chip) {
            const text = chip.getAttribute('data-text');
            if (text) handleSendMessage(text);
        }
    });

});
