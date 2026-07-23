const reddit = new RedditSource();

// One prompt wrapper, shared by every destination and by copy — so the wording
// lives in a single place instead of being duplicated per provider.
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
