// How context reaches a destination AI:
//   SENDING side  (openWithContext, on the source page) — stash the text in
//     chrome.storage.local and open a bare new-chat tab. Never the URL: a
//     4000-word thread is a 40k-char ?q= URL and the server 414s / 400s it.
//   ARRIVAL side  (receiveHandoff, in the destination tab's own content script)
//     — poll for the stash, type it into the composer, click send.
// Both halves live here; a subclass only supplies selectors + its new-chat URL.

const HANDOFF_TTL_MS = 60_000; // a real handoff is consumed in ~1s; older = orphaned

export class AIPlatform {
    constructor(config) {
        if (new.target === AIPlatform) {
            throw new Error('AIPlatform is abstract and cannot be instantiated directly');
        }
        this.name = config.name;
        this.baseUrl = config.baseUrl;
        this.pendingKey = config.pendingKey;            // chrome.storage.local key
        this.composerSelector = config.composerSelector;
        this.sendButtonSelector = config.sendButtonSelector;
        this._newChatPath = config.newChatPath;         // e.g. '/new', '/app', '/'
    }

    // Bare new-chat URL. Claude overrides to append ?model=.
    async newChatUrl() {
        return this.baseUrl + this._newChatPath;
    }

    // MUST stay: opens a new conversation pre-filled with `text`.
    async openWithContext(text) {
        // window.open first, synchronously in the click gesture — an await
        // before it (a large storage write) can get the popup blocked.
        window.open(await this.newChatUrl(), '_blank');
        await chrome.storage.local.set({ [this.pendingKey]: { text, ts: Date.now() } });
    }

    // Runs on arrival in the destination tab. If a handoff is pending for this
    // platform, type it into the composer and send.
    async receiveHandoff() {
        const text = await this._takePendingHandoff();
        if (!text) return;
        console.log(`[ACB] ${this.name}: handoff received, ${text.length} chars`);
        this._fillComposerAndSend(text);
    }

    // openWithContext opens the tab, THEN writes the key — so it may not be
    // there on the first look. Poll ~3s, drop a stale payload, consume once.
    async _takePendingHandoff() {
        for (let i = 0; i < 15; i++) {
            const stored = await chrome.storage.local.get(this.pendingKey);
            const pending = stored[this.pendingKey];
            if (pending) {
                await chrome.storage.local.remove(this.pendingKey);
                return Date.now() - pending.ts < HANDOFF_TTL_MS ? pending.text : null;
            }
            await new Promise((r) => setTimeout(r, 200));
        }
        return null;
    }

    // A composer is either a <textarea> (ChatGPT's logged-out one, React-
    // controlled) or a contenteditable (everything else).
    static _composerValue(el) {
        return el.tagName === 'TEXTAREA' ? el.value.trim() : el.textContent.trim();
    }

    static _typeInto(el, text) {
        el.focus();
        if (el.tagName === 'TEXTAREA') {
            // React tracks its own value — go through the native setter so the
            // change is seen, then fire input.
            const setter = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(el),
                'value'
            )?.set;
            setter ? setter.call(el, text) : (el.value = text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        const range = document.createRange();
        range.setStart(el, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, text);
        if (!el.textContent.trim()) {
            // execCommand no-ops without document focus — paste event fallback.
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            el.dispatchEvent(
                new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
            );
        }
    }

    _fillComposerAndSend(text) {
        let attempts = 0;
        let inserted = false;
        const interval = setInterval(() => {
            attempts++;
            const composer = document.querySelector(this.composerSelector);

            if (composer && !inserted && !AIPlatform._composerValue(composer)) {
                AIPlatform._typeInto(composer, text);
                inserted = !!AIPlatform._composerValue(composer);
            }

            const sendButton = document.querySelector(this.sendButtonSelector);
            if (inserted && sendButton && !sendButton.disabled) {
                sendButton.click();
                console.log(`[ACB] ${this.name}: handoff sent`);
                clearInterval(interval);
            } else if (attempts > 75) { // ~15s — slow SPA hydrate + a backgrounded tab
                console.warn(
                    `[ACB] ${this.name}: handoff gave up (composer=${!!composer}, inserted=${inserted}, send=${!!sendButton})`
                );
                clearInterval(interval);
            }
        }, 200);
    }

    // OPTIONAL — extracts the current conversation from this platform's page.
    extractConversation() {
        return null;
    }
}
