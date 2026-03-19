console.log('AI Context Bridge loaded at', new Date().toISOString());

const chatgpt = new ChatGPTPlatform();
const claude = new ClaudePlatform();

const floatingButton = new FloatingButton();
floatingButton.observe({
    summarizeAndContinue: () => chatgpt.summarizeAndContinue(),
    getClaudeOpinion:     () => chatgpt.getClaudeOpinion()
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.event === 'conversation_completed') {
        chatgpt.handleConversationCompleted(claude);
    }
});
