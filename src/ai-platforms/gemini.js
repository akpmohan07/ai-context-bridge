import { AIPlatform } from './base.js';

export class GeminiPlatform extends AIPlatform {
    constructor() {
        super({
            name: 'Gemini',
            baseUrl: 'https://gemini.google.com',
            newChatPath: '/app',
            // Gemini's composer is a Quill editor, not a textarea.
            composerSelector: '.ql-editor[contenteditable="true"]',
            sendButtonSelector:
                '.send-button-container button, button.send-button, button[aria-label="Send message"]',
        });
    }
}
