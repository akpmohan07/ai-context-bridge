import { RedditSource } from '../src/content-sources/reddit.js';
import { Destinations } from '../src/ai-platforms/registry.js';
import { Clipboard } from '../src/utils/clipboard.js';
import { Defaults } from '../src/core/defaults.js';

export default defineContentScript({
  matches: ['https://www.reddit.com/r/*/comments/*'],
  runAt: 'document_idle',
  main() {
    const reddit = new RedditSource();

    // One prompt wrapper, shared by every destination and by copy.
    const message = (text) =>
      `Here's a Reddit thread I'd like to discuss. Please start with a brief summary of the main discussion, then I'll have some questions and thoughts to explore with you.\n\n${text}`;

    chrome.storage.sync.get({ redditEnabled: Defaults.redditEnabled }, (result) => {
      if (!result.redditEnabled || !reddit.isMatch()) return;
      reddit.injectUI({
        destinations: Destinations,
        openIn: async (platform) => platform.openWithContext(message(await reddit.getFormattedContent())),
        copyForAI: async () => Clipboard.copy(message(await reddit.getFormattedContent())),
      });
    });
  }
});
