// Prepends a time-context line to the message you're about to send, so the AI
// knows the wall-clock time and how long it's been since your last message.
//
//   [TimeContext: Thursday, June 4, 2026 at 01:23 AM]
//   [TimeContext: Thursday, June 4, 2026 at 01:23 AM | 5 days 1h since last message]
//
// Only injects when there's a real gap (>= THRESHOLD) or no prior message;
// an active back-and-forth gets nothing.
//
// Both platforms use the same approach: SEED the authoritative last-message
// time from the platform's conversation API on load, RECORD "now" on each send,
// and cache per-conversation in chrome.storage.local. This replaced Claude's
// old DOM-timestamp scraping, which mis-read cross-day gaps (the visible text
// is ambiguous — "01:08" looks like today, "29 May" loses the time).
//
// Platform differences are three things only: selectors, the conversation-id in
// the URL, and how fetchLastTime() reads the API. Everything else is shared.
import { Defaults } from '../core/defaults.js';
import { buildPrefix, parseClaudeLastTime, parseChatgptLastTime } from './time-logic.js';

export const MessageTimer = (() => {
    // ---- per-conversation last-message store (shared) ----------------------
    // Storage-backed, seeded from an API and recorded on send. Methods use only
    // closure state (never `this`), so they can be Object.assign'd onto an
    // adapter without binding surprises.
    function seededTimeStore({ storageKey, convId, fetchLastTime }) {
        let cache = {}; // convId → epoch ms, mirrors chrome.storage.local[storageKey]
        // A send from a brand-new chat has no convId yet — the platform assigns
        // one only *after* the first message (claude.ai/new → /chat/<id>,
        // gemini /app → /app/<id>). Hold that send's time here until onNavigate
        // can file it, so the second message isn't misread as "no prior message".
        let pendingSend = null;

        function set(id, ms) {
            cache[id] = ms;
            chrome.storage.local.set({ [storageKey]: cache });
        }

        return {
            init() {
                chrome.storage.local.get({ [storageKey]: Defaults[storageKey] }, (r) => {
                    cache = r[storageKey] || {};
                });
                // Keep in sync across tabs.
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area === 'local' && changes[storageKey]) {
                        cache = changes[storageKey].newValue || {};
                    }
                });
            },

            // Seed the authoritative last-message time on entering a chat —
            // covers "open an old chat and send" (correct gap on the first
            // message). Best-effort: any failure leaves the cached value in place.
            async onNavigate() {
                const id = convId();
                if (!id) return;
                // Just landed on the chat our new-chat send created — file that
                // send's time under the fresh id (don't clobber a real value).
                if (pendingSend && !cache[id]) {
                    set(id, pendingSend);
                }
                pendingSend = null;
                try {
                    const ms = await fetchLastTime(id);
                    if (ms) set(id, ms);
                } catch (e) {
                    console.warn('[ACB] MessageTimer: seed failed', e);
                }
            },

            getLastMessageTime() {
                const id = convId();
                const ms = (id && cache[id]) || pendingSend;
                return ms ? new Date(ms) : null;
            },

            // Our own send just happened — stamp now (wall-clock is within
            // seconds of the server time, irrelevant against a 30-min threshold).
            recordSend() {
                const id = convId();
                if (id) set(id, Date.now());
                else pendingSend = Date.now(); // new chat — no id until navigation
            }
        };
    }

    // ---- platform seed fetchers --------------------------------------------

    function claudeConvId() {
        return location.pathname.match(/\/chat\/([^/?]+)/)?.[1] || null;
    }

    // Claude: cookie-authenticated, same-origin — no bearer token needed.
    // Takes the latest message created_at, falling back to the conversation
    // updated_at. Timestamps are ISO strings (unambiguous across days).
    async function fetchClaudeLastTime(uuid) {
        const orgId = document.cookie.match(/(?:^|; )lastActiveOrg=([^;]+)/)?.[1];
        if (!orgId) return null;
        const res = await fetch(
            `/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`,
            { credentials: 'include' }
        );
        if (!res.ok) return null;
        return parseClaudeLastTime(await res.json());
    }

    function chatgptConvId() {
        return location.pathname.match(/\/c\/([^/]+)/)?.[1] || null;
    }

    function geminiConvId() {
        return location.pathname.match(/\/app\/([a-f0-9]+)/)?.[1] || null;
    }

    // ChatGPT: backend-api needs a bearer token from /api/auth/session (cached).
    // create_time is in seconds → ms.
    let _chatgptToken = null;
    async function fetchChatgptLastTime(id) {
        if (!_chatgptToken) {
            try {
                _chatgptToken = (await (await fetch('/api/auth/session')).json()).accessToken || null;
            } catch { _chatgptToken = null; }
        }
        if (!_chatgptToken) return null;
        const res = await fetch(`/backend-api/conversation/${id}`, {
            headers: { Authorization: 'Bearer ' + _chatgptToken }
        });
        if (!res.ok) return null;
        return parseChatgptLastTime(await res.json());
    }

    // Gemini: RECORD-ONLY, no seed. Gemini renders no per-message timestamp
    // (nothing to scrape) and its only history API is the obfuscated
    // `batchexecute` RPC — brittle to call from a content script and prone to
    // break on Google's frequent deploys. So we skip the seed: the store is
    // stamped on every send and that's it. The single cost is that the *first*
    // send in a chat this device has never sent in (e.g. created on another
    // device) shows a bare `[TimeContext: <now>]` instead of the real gap; it
    // self-heals on the next send. See docs/platforms/gemini/time-context.md.
    async function fetchGeminiLastTime() {
        return null;
    }

    // ---- adapters: shared store + platform-specific selectors --------------

    const claudeAdapter = Object.assign(
        seededTimeStore({ storageKey: 'claudeLastMessageAt', convId: claudeConvId, fetchLastTime: fetchClaudeLastTime }),
        {
            host: 'claude.ai',
            sendButtonSelector: 'button[aria-label="Send message"]',
            chatInputSelector: '[data-testid="chat-input"]',
            inputSelector: 'div[contenteditable="true"]',
        }
    );

    const chatgptAdapter = Object.assign(
        seededTimeStore({ storageKey: 'chatgptLastMessageAt', convId: chatgptConvId, fetchLastTime: fetchChatgptLastTime }),
        {
            host: 'chatgpt.com',
            // Time Awareness is a logged-in feature — the contenteditable
            // composer, not the logged-out <textarea> welcome mat.
            sendButtonSelector: 'button[aria-label="Send message"], #composer-submit-button, button[data-testid="send-button"], button[aria-label="Send prompt"]',
            chatInputSelector: '#prompt-textarea',
            inputSelector: '#prompt-textarea',
        }
    );

    // Gemini uses a Quill editor (`.ql-editor`), not a plain textarea. The send
    // button lives in `.send-button-container` — its exact `aria-label` isn't
    // confirmed (the saved-page DOM omits the button while the composer is
    // empty), so the selector covers the likely names. See
    // docs/platforms/gemini/time-context.md.
    const geminiAdapter = Object.assign(
        seededTimeStore({ storageKey: 'geminiLastMessageAt', convId: geminiConvId, fetchLastTime: fetchGeminiLastTime }),
        {
            host: 'gemini.google.com',
            sendButtonSelector: '.send-button-container button, button.send-button, button[aria-label="Send message"]',
            chatInputSelector: '.ql-editor[contenteditable="true"]',
            inputSelector: '.ql-editor[contenteditable="true"]',
        }
    );

    const ADAPTERS = [claudeAdapter, chatgptAdapter, geminiAdapter];

    function pickAdapter(hostname = location.hostname) {
        return ADAPTERS.find(a => hostname.includes(a.host)) || null;
    }

    // ---- shared behaviour --------------------------------------------------

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
        adapter.init();
        adapter.onNavigate();
        watchNavigation(() => adapter.onNavigate());
        console.log('[ACB] MessageTimer: init on', adapter.host);

        let injecting = false;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest(adapter.sendButtonSelector);
            if (!btn || injecting || !_enabled) return;
            if (!hasInputText(adapter)) return;
            const prefix = buildPrefix(adapter.getLastMessageTime());
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
            const prefix = buildPrefix(adapter.getLastMessageTime());
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

    return {
        init, setEnabled,
        _test: { pickAdapter, ADAPTERS, claudeConvId, chatgptConvId, geminiConvId },
    };
})();
