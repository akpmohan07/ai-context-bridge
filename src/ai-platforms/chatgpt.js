class ChatGPTPlatform extends AIPlatform {
    constructor() {
        super({ name: 'ChatGPT', baseUrl: 'https://chatgpt.com' });
        this._pendingAction = null; // 'continue' | 'claude'
    }

    // Opens a new ChatGPT chat pre-filled with context
    openWithContext(text) {
        window.open(`${this.baseUrl}/?q=${encodeURIComponent(text)}`, '_blank');
    }

    // Edits the last user message with a summarize-and-continue prompt
    async summarizeAndContinue() {
        this._pendingAction = 'continue';
        await this._editLastMessageWithPrompt(this._continuePrompt());
    }

    // Types a Claude opinion request into the input and sends it
    async getClaudeOpinion() {
        const inputP = document.querySelector('#prompt-textarea > p');
        if (!inputP) { alert('❌ Could not find ChatGPT input box.'); return; }
        inputP.innerText = this._claudePrompt();
        inputP.dispatchEvent(new Event('input', { bubbles: true }));
        this._pendingAction = 'claude';
        await this._clickSendButton();
    }

    // Called when background.js signals the conversation response is complete
    handleConversationCompleted(claudePlatform) {
        if (!this._pendingAction) return;
        // Small delay to let ChatGPT finish rendering the reply into the DOM
        setTimeout(() => {
            const replyText = this._extractLastReply();
            if (!replyText) return;

            if (this._pendingAction === 'claude') {
                claudePlatform.openWithContext(replyText);
            } else {
                this.openWithContext(replyText);
            }
            this._pendingAction = null;
        }, 500);
    }

    // --- private ---

    async _editLastMessageWithPrompt(prompt) {
        const userMessages = [...document.querySelectorAll('[data-message-author-role="user"]')];
        const last = userMessages[userMessages.length - 1];
        if (!last) { alert('❌ No user message found'); return; }

        // Edit buttons are siblings of the message, not children — get the last one
        const editButtons = [...document.querySelectorAll('button[aria-label="Edit message"]')];
        const editBtn = editButtons[editButtons.length - 1];
        if (!editBtn) { alert('❌ Edit button not found'); return; }
        editBtn.click();

        await new Promise(r => setTimeout(r, 500));

        // Textarea appears near the edit button, not inside the message element
        const textarea = document.querySelector('textarea');
        if (!textarea) { alert('❌ Editable textarea not found'); return; }
        textarea.value = prompt;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));
        this._enableBackgroundListener();
        document.querySelector('button.btn.btn-primary')?.click();
    }

    async _clickSendButton() {
        let attempts = 0;
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const btn = document.querySelector('#composer-submit-button') ||
                            document.querySelector('button[aria-label="Send prompt"]') ||
                            document.querySelector('button[data-testid="send-button"]');
                if (btn && !btn.disabled) {
                    this._enableBackgroundListener();
                    btn.click();
                    clearInterval(interval);
                    resolve();
                } else if (++attempts > 30) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    _enableBackgroundListener() {
        chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
            if (response?.tabId) {
                chrome.runtime.sendMessage({ action: 'enableListener', tabId: response.tabId });
            }
        });
    }

    _extractLastReply() {
        const replies = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
        const last = replies[replies.length - 1];

        if (!last) {
            console.error('[ACB] _extractLastReply: no assistant message found');
            alert('❌ No ChatGPT reply found');
            return null;
        }

        const text = last.innerText?.trim();

        if (!text) {
            console.error('[ACB] _extractLastReply: assistant message found but text is empty', last);
            alert('❌ Reply text is empty');
            return null;
        }

        return text;
    }

    _continuePrompt() {
        return `You will receive this summary as the first message in a new conversation to continue seamlessly. Please condense this conversation into a focused, context-rich summary of no more than 100 words.\n\nInclude ONLY the essential information needed to continue productively:\n• Current topic/objective and your role\n• Key decisions made and problems solved\n• Current state/progress and immediate next steps\n• Any specific requirements, constraints, or preferences established\n\nFormat as a single, well-structured paragraph optimized for immediate context understanding.`;
    }

    _claudePrompt() {
        return `\nPlease create a comprehensive summary of our entire conversation that I can share with Claude AI to get a second opinion. Include:\n\n- The main topic and goals we discussed\n- Key questions I asked and your responses\n- Important recommendations and solutions you provided\n- Current status and any next steps we identified\n- Full context that would help another AI understand our discussion\n\nBe thorough but clear - this summary will be shared with Claude to get their perspective on our conversation and approach.\n\nFormat as a single, well-structured paragraph optimized for immediate context understanding.`;
    }
}
