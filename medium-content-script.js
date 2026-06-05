const medium = new MediumSource();
const claude = new ClaudePlatform();

chrome.storage.sync.get({ mediumEnabled: true }, (result) => {
    if (!result.mediumEnabled || !medium.isMatch()) return;
    medium.injectUI({
        openInClaude: async () => {
            const text = await medium.getFormattedContent();
            const message = `Here's a Medium article I'd like to discuss. Please start with a brief summary of the key points, then I'll have some questions and thoughts to explore with you.\n\n${text}`;
            claude.openWithContext(message);
        },
        copyForAI: async () => {
            const text = await medium.getFormattedContent();
            const message = `Here's a Medium article I'd like to discuss. Please start with a brief summary of the key points, then I'll have some questions and thoughts to explore with you.\n\n${text}`;
            await Clipboard.copy(message);
        }
    });
});
