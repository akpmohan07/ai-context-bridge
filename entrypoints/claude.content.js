import { ClaudePlatform } from '../src/ai-platforms/claude.js';
import { PresenceLayer } from '../src/presence/presence.js';
import { MessageTimer } from '../src/time/message-timer.js';
import { Defaults } from '../src/core/defaults.js';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  runAt: 'document_idle',
  main() {
    // The model catalog only changes when a model ships or is retired, so a day's
    // staleness costs nothing.
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
    // what this account can actually use, including availability. Read-only — see
    // docs/platforms/claude/model-preference.md. Never blocks the page on failure.
    async function refreshModelCatalog() {
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
        await chrome.storage.local.set({
          availableClaudeModels: models,
          modelCatalogFetchedAt: Date.now()
        });
        console.log('[ACB] refreshModelCatalog: cached', models.length, 'models');
      } catch (e) {
        console.warn('[ACB] refreshModelCatalog: request errored', e);
      }
    }
  }
});
