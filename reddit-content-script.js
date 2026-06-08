const reddit = new RedditSource();
const claude = new ClaudePlatform();
const chatgpt = new ChatGPTPlatform();

chrome.storage.sync.get({ redditEnabled: true }, (result) => {
    if (!result.redditEnabled || !reddit.isMatch()) return;
    reddit.injectUI({
        openInClaude: async () => {
            const text = await reddit.getFormattedContent();
            const message = `Here's a Reddit thread I'd like to discuss. Please start with a brief summary of the main discussion, then I'll have some questions and thoughts to explore with you.\n\n${text}`;
            claude.openWithContext(message);
        },
        openInChatGPT: async () => {
            const text = await reddit.getFormattedContent();
            const message = `Here's a Reddit thread I'd like to discuss. Please start with a brief summary of the main discussion, then I'll have some questions and thoughts to explore with you.\n\n${text}`;
            chatgpt.openWithContext(message);
        },
        copyForAI: async () => {
            const text = await reddit.getFormattedContent();
            const message = `Here's a Reddit thread I'd like to discuss. Please start with a brief summary of the main discussion, then I'll have some questions and thoughts to explore with you.\n\n${text}`;
            await Clipboard.copy(message);
        }
    });
});
