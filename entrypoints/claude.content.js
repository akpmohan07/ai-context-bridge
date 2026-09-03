import { ClaudePlatform } from '../src/ai-platforms/claude.js';
import { PresenceLayer } from '../src/presence/presence.js';
import { MessageTimer } from '../src/time/message-timer.js';
import { Defaults } from '../src/core/defaults.js';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  runAt: 'document_idle',
  main() {
    const claude = new ClaudePlatform();
    claude.injectUI();

    const presence = new PresenceLayer();
    presence.init();

    chrome.storage.sync.get({
      soundsEnabled: Defaults.soundsEnabled,
      timerEnabled:  Defaults.timerEnabled
    }, (result) => {
      presence.setEnabled(result.soundsEnabled);
      MessageTimer.setEnabled(result.timerEnabled);
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.soundsEnabled !== undefined) presence.setEnabled(changes.soundsEnabled.newValue);
      if (changes.timerEnabled !== undefined) MessageTimer.setEnabled(changes.timerEnabled.newValue);
    });

    MessageTimer.init();
  }
});
