// The model catalog only changes when a model ships or is retired, so a day's
// staleness costs nothing. Declared before the call below — the function reads
// it, and const declarations aren't hoisted.
const MODEL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const claude = new ClaudePlatform();
claude.injectUI();
refreshModelCatalog();

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

// Caches Claude's live model catalog so the popup's model dropdown reflects
// what this account can actually use, including availability.
//
// This reads the same bootstrap call the page makes for itself. Content
// scripts run in an isolated JS world — only the DOM is shared, not the page's
// JS memory — so we can't observe its response and have to issue our own.
//
// Read-only: it never sets the account's default model. See
// docs/model-preference.md for the write path, which was tried and dropped.
// Never blocks anything else on the page if any step fails.
async function refreshModelCatalog() {
    // Refetch when the catalog is missing OR stale. Checking the catalog and
    // not just the timestamp matters: if one is cleared without the other,
    // a fresh timestamp would otherwise suppress the refetch for a whole day.
    const { availableClaudeModels, modelCatalogFetchedAt } = await chrome.storage.local.get({
        availableClaudeModels: Defaults.availableClaudeModels,
        modelCatalogFetchedAt: Defaults.modelCatalogFetchedAt
    });
    const fresh = Date.now() - modelCatalogFetchedAt < MODEL_CATALOG_TTL_MS;
    if (availableClaudeModels?.length && fresh) return;

    const orgId = document.cookie.match(/(?:^|; )lastActiveOrg=([^;]+)/)?.[1];
    if (!orgId) {
        console.warn('[ACB] refreshModelCatalog: could not resolve org id, skipping');
        return;
    }

    try {
        const res = await fetch(
            `https://claude.ai/edge-api/bootstrap/${orgId}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false`,
            { credentials: 'include' }
        );
        if (!res.ok) {
            console.warn('[ACB] refreshModelCatalog: bootstrap read failed', res.status);
            return;
        }
        const bootstrap = await res.json();
        const models = bootstrap?.model_selector_config?.find(c => c.id === 'chat')?.models;
        if (!models?.length) {
            console.warn('[ACB] refreshModelCatalog: no models in bootstrap response');
            return;
        }

        // Stamped together so a failed fetch retries on the next page load
        // rather than being throttled out for a day.
        await chrome.storage.local.set({
            availableClaudeModels: models,
            modelCatalogFetchedAt: Date.now()
        });
        console.log('[ACB] refreshModelCatalog: cached', models.length, 'models');
    } catch (e) {
        console.warn('[ACB] refreshModelCatalog: request errored', e);
    }
}
