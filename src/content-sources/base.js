class ContentSource {
    constructor(config) {
        if (new.target === ContentSource) {
            throw new Error('ContentSource is abstract and cannot be instantiated directly');
        }
        this.name = config.name;
    }

    // MUST implement — returns true if the current page belongs to this source
    isMatch() {
        throw new Error(`${this.name}: isMatch() must be implemented`);
    }

    // MUST implement — fetches page content and returns a ContentDocument
    async fetchContent() {
        throw new Error(`${this.name}: fetchContent() must be implemented`);
    }

    // MUST implement — injects UI (buttons/menu items) into the page
    // actions: { openInClaude: fn, copyForAI: fn }
    injectUI(actions) {
        throw new Error(`${this.name}: injectUI() must be implemented`);
    }

    // PROVIDED — fetches, trims to budget, and formats content ready for an AI platform
    async getFormattedContent() {
        const doc = await this.fetchContent();
        const trimmed = Budget.trim(doc);
        return Formatter.format(trimmed);
    }
}
