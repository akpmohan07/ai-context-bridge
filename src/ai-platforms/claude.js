import { AIPlatform } from './base.js';
import { Defaults } from '../core/defaults.js';

export class ClaudePlatform extends AIPlatform {
    constructor() {
        super({ name: 'Claude', baseUrl: 'https://claude.ai' });
    }

    // Opens a new Claude chat pre-filled with the given text, using the preferred model
    // ('none' means don't manage it — leave Claude.ai's own default behavior alone)
    async openWithContext(text) {
        const { preferredClaudeModel } = await chrome.storage.sync.get({
            preferredClaudeModel: Defaults.preferredClaudeModel
        });
        const modelParam = preferredClaudeModel && preferredClaudeModel !== 'none' ? `&model=${preferredClaudeModel}` : '';
        window.open(`${this.baseUrl}/new?q=${encodeURIComponent(text)}${modelParam}`, '_blank');
    }

    // Injected on claude.ai — auto-sends only when the URL has a pre-filled ?q=
    // param. Clicking Send ourselves (rather than relying on Claude's own
    // prefill send) is what lets MessageTimer's click-capture listener add the
    // [TimeContext:] prefix first.
    injectUI() {
        if (!new URLSearchParams(window.location.search).has('q')) return;
        let attempts = 0;
        let clickedAt = -Infinity;
        const interval = setInterval(() => {
            attempts++;
            // Already sent (by us or by Claude) — the prompt left the composer.
            if (document.querySelector('[data-testid="user-message"]')) {
                clearInterval(interval);
                return;
            }
            if (attempts > 75) { clearInterval(interval); return; } // ~15s: banner + a slow/backgrounded tab

            // Re-try at most once a second — the "use caution" banner can hold
            // Send inert for a beat, and a click before focus does nothing.
            if (attempts - clickedAt < 5) return;
            const inputBox = document.querySelector('div[contenteditable="true"]');
            const sendButton = document.querySelector('button[aria-label="Send message"]');
            if (inputBox && inputBox.innerText.trim().length > 0 && sendButton && !sendButton.disabled) {
                inputBox.focus();
                sendButton.click();
                clickedAt = attempts;
            }
        }, 200);
    }
}
