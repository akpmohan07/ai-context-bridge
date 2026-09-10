import { AIPlatform } from './base.js';

// The handoff payload travels through chrome.storage.local, never the URL.
const PENDING_KEY = 'pendingGeminiPrompt';

export class GeminiPlatform extends AIPlatform {
    constructor() {
        super({ name: 'Gemini', baseUrl: 'https://gemini.google.com' });
    }

    // Stash the context and open a bare /app tab. We deliberately DON'T use
    // Gemini's ?prompt= param: it 400s on large content (a ~4000-word article
    // is a 20k+ char URL) and doesn't auto-send anyway. injectUI() picks the
    // text up on arrival and sends it — same model as ClaudePlatform.
    async openWithContext(text) {
        await chrome.storage.local.set({ [PENDING_KEY]: text });
        window.open(`${this.baseUrl}/app`, '_blank');
    }

    // Injected on gemini.google.com. If a handoff is pending, insert it into the
    // Quill composer and click send. Mirrors ClaudePlatform.injectUI(), but
    // Gemini needs us to type the text in (Claude.ai fills its own composer from
    // ?q=; Gemini has nothing in the URL).
    async injectUI() {
        const stored = await chrome.storage.local.get(PENDING_KEY);
        const text = stored[PENDING_KEY];
        if (!text) return;
        await chrome.storage.local.remove(PENDING_KEY); // consume once — a later
                                                        // manual visit must not
                                                        // re-inject stale content
        console.log('[ACB] Gemini injectUI: pending handoff,', text.length, 'chars');

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
