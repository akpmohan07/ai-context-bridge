// Auto-send pre-filled message on Claude's /new?q= page
(function autoSendIfPrefilled() {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(() => {
        const inputBox = document.querySelector('div[contenteditable="true"]');
        const sendButton = document.querySelector('button[aria-label="Send message"]');
        if (inputBox && sendButton && inputBox.innerText.trim().length > 0 && !sendButton.disabled) {
            sendButton.click();
            clearInterval(interval);
        } else if (++attempts > maxAttempts) {
            clearInterval(interval);
        }
    }, 200);
})(); 