// Prepends a time-context line to the message you're about to send, so the AI
// knows the wall-clock time and how long it's been since your last message.
//
//   [TimeContext: Thursday, June 4, 2026 at 01:23 AM]
//   [TimeContext: Thursday, June 4, 2026 at 01:23 AM | 5 days 1h since last message]
//
// Only injects when there's a real gap (>= THRESHOLD) or no prior message;
// an active back-and-forth gets nothing.
//
// Platform-specific bits live in per-host adapters below; the core (formatting,
// threshold, send interception) is shared. Each adapter answers one question
// differently — "when was the last message?":
//   • Claude  — reads the per-message timestamps Claude renders in the DOM.
//   • ChatGPT — has no per-message DOM timestamp, so it seeds the authoritative
//     create_time from the conversation history API on load, then keeps it
//     fresh (see the ChatGPT adapter + background.js).
const MessageTimer = (() => {
    const THRESHOLD_MS = 30 * 60 * 1000;

    // ---- shared formatting -------------------------------------------------

    function formatElapsed(ms) {
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        if (d > 0) return h > 0 ? `${d} day${d>1?'s':''} ${h}h` : `${d} day${d>1?'s':''}`;
        if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
        return `${m} min`;
    }

    function formatNow() {
        return new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long',
            day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

    // Parses Claude's visible timestamp spans ("01:08" → today at that time,
    // "29 May" → that date at midnight). Claude-only helper.
    function parseSpanText(text) {
        const t = text.trim();
        const timeMatch = t.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const d = new Date();
            d.setHours(+timeMatch[1], +timeMatch[2], 0, 0);
            return d;
        }
        const dateMatch = t.match(/^(\d{1,2})\s+(\w{3})$/);
        if (dateMatch) {
            const month = MONTHS[dateMatch[2]];
            if (month === undefined) return null;
            const d = new Date();
            d.setMonth(month, +dateMatch[1]);
            d.setHours(0, 0, 0, 0);
            if (d > new Date()) d.setFullYear(d.getFullYear() - 1);
            return d;
        }
        return null;
    }

    // ---- platform adapters -------------------------------------------------

    const claudeAdapter = {
        host: 'claude.ai',
        sendButtonSelector: 'button[aria-label="Send message"]',
        chatInputSelector: '[data-testid="chat-input"]',
        inputSelector: 'div[contenteditable="true"]',

        // Claude renders per-message timestamps; read the last one from the DOM.
        getLastMessageTime() {
            const spans = document.querySelectorAll('span.text-text-500.text-xs');
            if (!spans.length) return null;
            return parseSpanText(spans[spans.length - 1].textContent);
        },

        recordSend() {} // nothing to store — the DOM is the source of truth
    };

    const chatgptAdapter = {
        host: 'chatgpt.com',
        sendButtonSelector: '#composer-submit-button, button[aria-label="Send prompt"], button[data-testid="send-button"]',
        chatInputSelector: '#prompt-textarea',
        inputSelector: '#prompt-textarea',

        _cache: {},        // convId → epoch ms, mirrors chrome.storage.local
        _token: null,      // cached bearer token for backend-api

        // Load the persisted map and keep it in sync across tabs. The
        // background worker and other tabs also write this key.
        init() {
            chrome.storage.local.get({ chatgptLastMessageAt: Defaults.chatgptLastMessageAt }, (r) => {
                this._cache = r.chatgptLastMessageAt || {};
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.chatgptLastMessageAt) {
                    this._cache = changes.chatgptLastMessageAt.newValue || {};
                }
            });
        },

        // On entering a conversation, seed the authoritative last-message time
        // from the history API — covers "open an old chat and start chatting",
        // which live monitoring alone can't know about. Best-effort: any failure
        // just leaves the cached value (or none) in place.
        async onNavigate() {
            const id = this._convId();
            if (!id) return;
            try {
                const token = await this._getToken();
                if (!token) return;
                const res = await fetch(`/backend-api/conversation/${id}`, {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (!res.ok) return;
                const last = this._lastCreateTime(await res.json());
                if (last) this._set(id, last);
            } catch (e) {
                console.warn('[ACB] MessageTimer(chatgpt): seed failed', e);
            }
        },

        getLastMessageTime() {
            const id = this._convId();
            const ms = id ? this._cache[id] : null;
            return ms ? new Date(ms) : null;
        },

        // Our own send just happened — stamp now. (Background does the same for
        // sends we don't intercept, e.g. regenerate/edit.)
        recordSend() {
            const id = this._convId();
            if (id) this._set(id, Date.now());
        },

        _convId() {
            return location.pathname.match(/\/c\/([^/]+)/)?.[1] || null;
        },

        _set(id, ms) {
            this._cache[id] = ms;
            chrome.storage.local.set({ chatgptLastMessageAt: this._cache });
        },

        async _getToken() {
            if (this._token) return this._token;
            try {
                const s = await (await fetch('/api/auth/session')).json();
                this._token = s.accessToken || null;
            } catch { this._token = null; }
            return this._token;
        },

        // Largest create_time across all messages in the history payload (seconds
        // → ms). ChatGPT's shape: { mapping: { <id>: { message: { create_time } } } }.
        _lastCreateTime(data) {
            const mapping = data?.mapping;
            if (!mapping) return null;
            let max = 0;
            for (const k in mapping) {
                const t = mapping[k]?.message?.create_time;
                if (typeof t === 'number' && t > max) max = t;
            }
            return max ? max * 1000 : null;
        }
    };

    const ADAPTERS = [claudeAdapter, chatgptAdapter];

    function pickAdapter() {
        return ADAPTERS.find(a => location.hostname.includes(a.host)) || null;
    }

    // ---- shared behaviour --------------------------------------------------

    function buildPrefix(adapter) {
        const now = new Date();
        const lastTime = adapter.getLastMessageTime();
        const elapsed = lastTime ? now - lastTime : null;
        const timeStr = formatNow();
        if (elapsed && elapsed >= THRESHOLD_MS) {
            return `[TimeContext: ${timeStr} | ${formatElapsed(elapsed)} since last message]\n`;
        }
        if (!lastTime) {
            return `[TimeContext: ${timeStr}]\n`;
        }
        return null;
    }

    function hasInputText(adapter) {
        const box = document.querySelector(adapter.inputSelector);
        return !!(box && box.innerText.trim());
    }

    function prependToInput(adapter, text) {
        const inputBox = document.querySelector(adapter.inputSelector);
        if (!inputBox) return;
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(inputBox, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, text);
    }

    function watchNavigation(cb) {
        if (window.navigation) {
            window.navigation.addEventListener('navigatesuccess', cb);
        } else {
            const orig = history.pushState.bind(history);
            history.pushState = (...a) => { orig(...a); cb(); };
            window.addEventListener('popstate', cb);
        }
    }

    let _enabled = true;
    function setEnabled(val) { _enabled = val; }

    function init() {
        const adapter = pickAdapter();
        if (!adapter) return;
        adapter.init?.();
        adapter.onNavigate?.();
        watchNavigation(() => adapter.onNavigate?.());
        console.log('[ACB] MessageTimer: init on', adapter.host);

        let injecting = false;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest(adapter.sendButtonSelector);
            if (!btn || injecting || !_enabled) return;
            if (!hasInputText(adapter)) return;
            const prefix = buildPrefix(adapter);
            adapter.recordSend();
            if (!prefix) return;
            e.preventDefault();
            e.stopPropagation();
            prependToInput(adapter, prefix);
            injecting = true;
            setTimeout(() => { btn.click(); injecting = false; }, 0);
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey || injecting || !_enabled) return;
            if (!e.target.closest(adapter.chatInputSelector)) return;
            if (!hasInputText(adapter)) return;
            const prefix = buildPrefix(adapter);
            adapter.recordSend();
            if (!prefix) return;
            e.preventDefault();
            e.stopPropagation();
            prependToInput(adapter, prefix);
            injecting = true;
            setTimeout(() => {
                const btn = document.querySelector(adapter.sendButtonSelector);
                if (btn) btn.click();
                injecting = false;
            }, 0);
        }, true);
    }

    return { init, setEnabled };
})();
