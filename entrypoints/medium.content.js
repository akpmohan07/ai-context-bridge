import { MediumSource } from '../src/content-sources/medium.js';
import { Destinations } from '../src/ai-platforms/registry.js';
import { Clipboard } from '../src/utils/clipboard.js';
import { Defaults } from '../src/core/defaults.js';

export default defineContentScript({
  matches: ['https://medium.com/*/*', 'https://*.medium.com/*'],
  runAt: 'document_idle',
  main() {
    const medium = new MediumSource();

    // One prompt wrapper, shared by every destination and by copy.
    const message = (text) =>
      `Here's a Medium article I'd like to discuss. Please start with a brief summary of the key points, then I'll have some questions and thoughts to explore with you.\n\n${text}`;

    chrome.storage.sync.get({ mediumEnabled: Defaults.mediumEnabled }, (result) => {
      if (!result.mediumEnabled || !medium.isMatch()) return;
      medium.injectUI({
        destinations: Destinations,
        openIn: async (platform) => platform.openWithContext(message(await medium.getFormattedContent())),
        copyForAI: async () => Clipboard.copy(message(await medium.getFormattedContent())),
      });
    });
  }
});
