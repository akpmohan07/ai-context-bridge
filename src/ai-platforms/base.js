class AIPlatform {
    constructor(config) {
        if (new.target === AIPlatform) {
            throw new Error('AIPlatform is abstract and cannot be instantiated directly');
        }
        this.name = config.name;
        this.baseUrl = config.baseUrl;
    }

    // MUST implement — opens a new conversation on this platform pre-filled with text
    openWithContext(text) {
        throw new Error(`${this.name}: openWithContext() must be implemented`);
    }

    // OPTIONAL — extracts the current conversation from this platform's page
    // Returns a ContentDocument or null if not supported
    extractConversation() {
        return null;
    }

    // OPTIONAL — injects UI elements into this platform's own page
    injectUI() {}
}
