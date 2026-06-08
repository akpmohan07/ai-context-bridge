class ClaudePlatform extends AIPlatform {
    constructor() {
        super({ name: 'Claude', baseUrl: 'https://claude.ai' });
    }

    // Opens a new Claude chat pre-filled with the given text
    openWithContext(text) {
        window.open(`${this.baseUrl}/new?q=${encodeURIComponent(text)}`, '_blank');
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
