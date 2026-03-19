class ClaudePlatform extends AIPlatform {
    constructor() {
        super({ name: 'Claude', baseUrl: 'https://claude.ai' });
    }

    // Opens a new Claude chat pre-filled with context
    openWithContext(text) {
        const message = `I'm sharing a summary of my conversation with ChatGPT. Please review it and provide your perspective, suggestions, or corrections as another AI assistant.\n\nSummary:\n${text}`;
        setTimeout(() => {
            window.open(`${this.baseUrl}/new?q=${encodeURIComponent(message)}`, '_blank');
        }, 2000);
    }

    // Injected on claude.ai — auto-sends the pre-filled ?q= message
    injectUI() {
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
