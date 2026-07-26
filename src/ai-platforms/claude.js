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

    // Injected on claude.ai — auto-sends only when URL has a pre-filled ?q= param
    injectUI() {
        if (!new URLSearchParams(window.location.search).has('q')) return;
        let attempts = 0;
        const interval = setInterval(() => {
            const inputBox = document.querySelector('div[contenteditable="true"]');
            const sendButton = document.querySelector('button[aria-label="Send message"]');
            if (inputBox && sendButton && inputBox.innerText.trim().length > 0 && !sendButton.disabled) {
                sendButton.click();
                clearInterval(interval);
            } else if (++attempts > 30) {
                clearInterval(interval);
            }
        }, 200);
    }
}
