import { AIPlatform } from './base.js';
import { Defaults } from '../core/defaults.js';

export class ClaudePlatform extends AIPlatform {
    constructor() {
        super({
            name: 'Claude',
            baseUrl: 'https://claude.ai',
            newChatPath: '/new',
            pendingKey: 'pendingClaudePrompt',
            composerSelector: 'div[contenteditable="true"]',
            sendButtonSelector: 'button[aria-label="Send message"]',
        });
    }

    // ?model= is short and safe to keep in the URL ('none' = leave Claude's own
    // default alone). The context itself never rides the URL — see base.js.
    async newChatUrl() {
        const { preferredClaudeModel } = await chrome.storage.sync.get({
            preferredClaudeModel: Defaults.preferredClaudeModel,
        });
        const model =
            preferredClaudeModel && preferredClaudeModel !== 'none'
                ? `?model=${encodeURIComponent(preferredClaudeModel)}`
                : '';
        return `${this.baseUrl}${this._newChatPath}${model}`;
    }
}
