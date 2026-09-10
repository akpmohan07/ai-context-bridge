import { GeminiPlatform } from '../src/ai-platforms/gemini.js';
import { Defaults } from '../src/core/defaults.js';
import { MessageTimer } from '../src/time/message-timer.js';

// Two jobs on gemini.google.com:
//   1. Reddit/Medium → Gemini handoff: pick up the pending context from
//      chrome.storage.local, insert it into the composer, send (injectUI).
//   2. Time Awareness on send — the same [TimeContext: ...] prefix as claude.ai
//      and chatgpt.com.
export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  runAt: 'document_idle',
  main() {
    new GeminiPlatform().injectUI();

    chrome.storage.sync.get({ timerEnabled: Defaults.timerEnabled }, (result) => {
      MessageTimer.setEnabled(result.timerEnabled);
      MessageTimer.init();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.timerEnabled !== undefined) MessageTimer.setEnabled(changes.timerEnabled.newValue);
    });
  }
});
