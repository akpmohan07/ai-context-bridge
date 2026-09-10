import { AIPlatform } from './base.js';

// The handoff payload travels through chrome.storage.local, never the URL.
const PENDING_KEY = 'pendingGeminiPrompt';

export class GeminiPlatform extends AIPlatform {
    constructor() {
        super({ name: 'Gemini', baseUrl: 'https://gemini.google.com' });
    }

    // Open the tab FIRST (synchronously, in the click gesture — an await before
    // window.open, e.g. a large storage write, can get the popup blocked), then
    // stash the context. We don't use Gemini's ?prompt= param: it 400s on large
    // content and never auto-sends. injectUI() polls for the stash on arrival.
    async openWithContext(text) {
        window.open(`${this.baseUrl}/app`, '_blank');
        await chrome.storage.local.set({ [PENDING_KEY]: text });
    }

    // Injected on gemini.google.com. If a handoff is pending, insert it into the
    // Quill composer and click send. Mirrors ClaudePlatform.injectUI(), but
    // Gemini needs us to type the text in (Claude.ai fills its own composer from
    // ?q=; Gemini has nothing in the URL).
    async injectUI() {
        const text = await this._awaitPendingHandoff();
        if (!text) return;
        console.log('[ACB] Gemini injectUI: pending handoff,', text.length, 'chars');
        this._insertAndSend(text);
    }

    // openWithContext opens this tab, then writes the key — so it may not be
    // there on the first look. Poll ~3s, then conclude no handoff is pending.
    async _awaitPendingHandoff() {
        for (let i = 0; i < 15; i++) {
            const stored = await chrome.storage.local.get(PENDING_KEY);
            if (stored[PENDING_KEY]) {
                await chrome.storage.local.remove(PENDING_KEY); // consume once
                return stored[PENDING_KEY];
            }
            await new Promise((r) => setTimeout(r, 200));
        }
        return null;
    }

    _insertAndSend(text) {
        const EDITOR = '.ql-editor[contenteditable="true"]';
        const SEND = '.send-button-container button, button.send-button, button[aria-label="Send message"]';

        let attempts = 0;
        let inserted = false;
        const interval = setInterval(() => {
            const editor = document.querySelector(EDITOR);

            // Insert once, while the composer is still empty.
            if (editor && !inserted && !editor.textContent.trim()) {
                editor.focus();
                const range = document.createRange();
                range.setStart(editor, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                const ok = document.execCommand('insertText', false, text);
                // execCommand can no-op when the document isn't focused; fall
                // back to a paste event, which Quill also handles.
                if (!editor.textContent.trim()) {
                    const dt = new DataTransfer();
                    dt.setData('text/plain', text);
                    editor.dispatchEvent(
                        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
                    );
                }
                inserted = !!editor.textContent.trim();
                console.log(`[ACB] Gemini injectUI: insert (execCommand=${ok}) → filled=${inserted}`);
            }

            const sendButton = document.querySelector(SEND);
            const filled = editor && editor.textContent.trim().length > 0;
            if (filled && sendButton && !sendButton.disabled) {
                sendButton.click();
                console.log('[ACB] Gemini injectUI: sent');
                clearInterval(interval);
            } else if (++attempts > 40) { // ~8s — Gemini's SPA can be slow to hydrate
                console.warn(
                    `[ACB] Gemini injectUI: gave up (editor=${!!editor}, filled=${filled}, sendButton=${!!sendButton})`
                );
                clearInterval(interval);
            }
        }, 200);
    }
}
