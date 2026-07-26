import { AIPlatform } from './base.js';

export class GeminiPlatform extends AIPlatform {
    constructor() {
        super({ name: 'Gemini', baseUrl: 'https://gemini.google.com' });
    }

    // Opens a new Gemini chat pre-filled with the given text.
    // Unlike Claude/ChatGPT this uses ?prompt= (Gemini's native prefill param).
    openWithContext(text) {
        window.open(`${this.baseUrl}/app?prompt=${encodeURIComponent(text)}`, '_blank');
    }
}
