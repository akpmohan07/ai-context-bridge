// Default values for everything this extension persists.
// Property names are identical to their chrome.storage keys — no mapping to
// remember. Call sites keep using chrome.storage directly and take only the
// default from here, so a default is never written down twice.
export const Defaults = {

    // ---- Feature toggles (claude.ai) ---------------------------------------

    // Ambient sounds during conversations: breath on send, hum while
    // generating, chime on reply. Off by default — audio should never start
    // unprompted on a fresh install.
    soundsEnabled: false,

    // Prefixes sent messages with time context, so Claude knows how long it
    // has been since your last message.
    timerEnabled: true,

    // ---- Content source toggles --------------------------------------------

    // Floating button on chatgpt.com — summarize and continue in Claude.
    chatgptEnabled: true,

    // "Open in AI" entry injected into Reddit's native post overflow menu.
    redditEnabled: true,

    // Same, on Medium articles.
    mediumEnabled: true,

    // ---- Claude platform config --------------------------------------------

    // Model sent with handoffs, as &model= on the claude.ai/new URL.
    // 'none' means don't manage it — leave Claude.ai's own default alone.
    preferredClaudeModel: 'none',

    // ---- Claude model catalog cache ----------------------------------------
    // chrome.storage.local, not sync: derived data, availability is account-
    // and device-specific. Nothing populates this anymore — the catalog-read
    // that used to (refreshModelCatalog(), claude.content.js) was removed
    // 2026-09-03 as redundant with claude.ai's own native per-chat model
    // selection; see docs/platforms/claude/model-preference.md. These keys
    // stay at their defaults permanently now. preferredClaudeModel above and
    // the &model= handoff param are unaffected — only this cache is dead.

    // The model list from Claude's bootstrap endpoint, used to build the
    // popup dropdown. null until the first claude.ai visit — the popup shows
    // a placeholder until then rather than a hardcoded list that would go
    // stale and couldn't know what this account has access to.
    availableClaudeModels: null,

    // When that catalog was last fetched, driving the 24h TTL. 0 means never,
    // which reads as infinitely stale and triggers a fetch.
    modelCatalogFetchedAt: 0,

    // ---- Last-message times (per conversation) -----------------------------
    // chrome.storage.local: { convId → epoch ms of the most recent message }.
    // Seeded from each platform's conversation API on load (authoritative
    // timestamps), then stamped to "now" as messages are sent, so the
    // time-context prefix can show the real gap since your last message.
    // Keyed per conversation and shared across tabs — see message-timer.js.
    chatgptLastMessageAt: {},
    claudeLastMessageAt: {},
};
