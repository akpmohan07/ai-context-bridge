console.log('AI Context Bridge loaded at', new Date().toISOString());

const chatgpt = new ChatGPTPlatform();
const claude = new ClaudePlatform();
let floatingButton = null;

function maybeInit() {
    if (!/^\/c\//.test(window.location.pathname)) return;
    if (floatingButton) return;
    chrome.storage.sync.get({ chatgptEnabled: true }, (result) => {
        if (!result.chatgptEnabled) return;
        floatingButton = new FloatingButton();
        floatingButton.observe({
            summarizeAndContinue: () => chatgpt.summarizeAndContinue(),
            getClaudeOpinion:     () => chatgpt.getClaudeOpinion()
        });
    });
}

function destroyButton() {
    document.getElementById('ai-context-bridge')?.remove();
    floatingButton.disconnect();
    floatingButton = null;
}

function onNavigate() {
    if (floatingButton && !/^\/c\//.test(window.location.pathname)) {
        destroyButton();
    }
    setTimeout(maybeInit, 500);
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes.chatgptEnabled === undefined) return;
    if (!changes.chatgptEnabled.newValue && floatingButton) {
        destroyButton();
    } else if (changes.chatgptEnabled.newValue && !floatingButton) {
        maybeInit();
    }
});

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
