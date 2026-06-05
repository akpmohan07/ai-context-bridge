console.log('AI Context Bridge loaded at', new Date().toISOString());

const chatgpt = new ChatGPTPlatform();
const claude = new ClaudePlatform();
let floatingButton = null;

function maybeInit() {
    if (!/^\/c\//.test(window.location.pathname)) return;
    if (floatingButton) return;
    floatingButton = new FloatingButton();
    floatingButton.observe({
        summarizeAndContinue: () => chatgpt.summarizeAndContinue(),
        getClaudeOpinion:     () => chatgpt.getClaudeOpinion()
    });
}

function onNavigate() {
    if (floatingButton && !/^\/c\//.test(window.location.pathname)) {
        document.getElementById('ai-context-bridge')?.remove();
        floatingButton.disconnect();
        floatingButton = null;
    }
    setTimeout(maybeInit, 500);
}

maybeInit();

// Listen for SPA navigation (ChatGPT uses React Router / History API)
if (window.navigation) {
    window.navigation.addEventListener('navigatesuccess', onNavigate);
} else {
    const orig = history.pushState.bind(history);
    history.pushState = (...args) => { orig(...args); onNavigate(); };
    window.addEventListener('popstate', onNavigate);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.event === 'conversation_completed') {
        chatgpt.handleConversationCompleted(claude);
    }
});
