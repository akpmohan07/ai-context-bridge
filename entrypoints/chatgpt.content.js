import { ChatGPTPlatform } from '../src/ai-platforms/chatgpt.js';
import { ClaudePlatform } from '../src/ai-platforms/claude.js';
import { FloatingButton } from '../src/ui/floating-button.js';
import { Defaults } from '../src/core/defaults.js';
import { MessageTimer } from '../src/time/message-timer.js';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[ACB] loaded at', new Date().toISOString());

    const chatgpt = new ChatGPTPlatform();
    const claude = new ClaudePlatform();
    let floatingButton = null;

    function maybeInit() {
      if (!/^\/c\//.test(window.location.pathname)) return;
      if (floatingButton) return;
      chrome.storage.sync.get({ chatgptEnabled: Defaults.chatgptEnabled }, (result) => {
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

    // Time-context prefix on send — same feature as claude.ai, ChatGPT adapter.
    chrome.storage.sync.get({ timerEnabled: Defaults.timerEnabled }, (result) => {
      MessageTimer.setEnabled(result.timerEnabled);
      MessageTimer.init();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.timerEnabled !== undefined) MessageTimer.setEnabled(changes.timerEnabled.newValue);
    });
  }
});
