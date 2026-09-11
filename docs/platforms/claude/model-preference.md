# Claude Model Preference — Feature Notes

The split here is **reads vs writes**, not features.

| | Status | Where |
|---|---|---|
| Read the model catalog | **Shipped** | `refreshModelCatalog()` in `claude-content-script.js` |
| Send a model with a handoff | **Shipped** | `ClaudePlatform.openWithContext()` |
| Write the account's default model | **Removed** | archived in this doc only |

The write path was built, tested and working before removal. It exists nowhere
in the tree — the code below is the only copy.

---

## Why this exists

claude.ai persists the last-used model per account. Pick Opus for one hard
task and every trivial chat afterwards is also Opus, burning tokens until you
manually switch back. There is no native "always start new chats on model X"
setting.

The shipped half solves the narrower, honest version of that: when *this
extension* hands content to Claude, it picks the model, because it knows the
task is a summarise/discuss job that doesn't need Opus.

---

## What shipped

### Model on handoff

Reddit / Medium / ChatGPT → Claude all funnel through one method,
`ClaudePlatform.openWithContext()` in `src/ai-platforms/claude.js`. It reads
`preferredClaudeModel` from `chrome.storage.sync` and appends `?model=<id>` to
the bare `claude.ai/new` URL (the context goes through `chrome.storage.local`, see base.js). No API call, no reload, no account mutation.

**Verified risk:** `await`-ing storage before `window.open()` theoretically
breaks the "must be a direct user gesture" rule for popups. Tested live —
Chrome did **not** block it (transient activation survives the short storage
read). Re-verify if this ever regresses.

### Catalog refresh

`refreshModelCatalog()` in `claude-content-script.js` runs on any claude.ai
load, throttled to once per 24h via `modelCatalogFetchedAt` in
`chrome.storage.local`. It caches `availableClaudeModels` so the popup dropdown
lists what the account can actually use, with unavailable models greyed out.

The timestamp is written *with* the catalog, not before the fetch, so a failed
request retries on the next page load instead of being throttled out for a day.

Gating it to `/new` (as the removed write path did) would have been wrong here
— that excludes our storage-based handoffs, which is the primary flow, so
a user who only ever arrives via handoff would never refresh their catalog.

### The "Default" (don't-manage) option

Sentinel value `'none'`, labeled **"Default"** — not "None", which reads wrong
inside a row already labeled "Default Model". When selected, `openWithContext()`
omits `?model=` entirely.

**Wiring gotcha:** the sentinel must exist in *two* places — `popup.html` **and**
the rebuild loop in `popup.js`, which does `innerHTML = ''` and repopulates
purely from the cached catalog. The catalog has no "Default" entry of its own
since it isn't a real model. Miss either one and the option silently vanishes
once the cache populates.

**`popup.html` deliberately does not hardcode a model list.** It carries only
the sentinel plus a disabled `Visit claude.ai to load models` placeholder. A
static list was tried and removed: it goes stale as models ship and retire, it
can't know which models this account actually has access to (the live catalog
carries `disabled_reason`), and a stale ID fails silently — `?model=` with an
unknown value is simply ignored by Claude, so the user gets a different model
than the one they picked with no error.

**`'none'` must also be the unset default in both `popup.js` and
`claude.js`.** They disagreed at one point (`'claude-sonnet-4-6'` vs `'none'`),
which meant a fresh install silently forced Sonnet on every handoff while the
popup displayed a selection the user had never made.

---

## The endpoints

Both are claude.ai's internal API. Neither is public or stable. Last confirmed
**2026-07-02** — re-verify before trusting.

`orgId` comes from the `lastActiveOrg` cookie.

### Read — bootstrap / model catalog (in use)

```
GET https://claude.ai/edge-api/bootstrap/{orgId}/app_start
    ?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false
```

Returns `model_selector_config`, an array. The `{id: "chat"}` entry has:

| Field | Meaning |
|---|---|
| `model` | account's current default — **same ID namespace as the URL param** (confirmed, e.g. `claude-sonnet-4-6`) |
| `thinking`, `thinking_by_model`, `selection_source` | current thinking/effort config |
| `models[]` | full catalog: `{id, name, short_name, description, disabled_reason, capabilities, thinking, hard_limit, badge, tooltip}` |

`disabled_reason` is present when a model is unavailable to the account —
mirrored into the popup as a native `disabled` attribute on the `<option>`.

Only `models[]` is used now. `model` was what the removed write path compared
against.

### Write — set default model (removed)

```
PATCH https://claude.ai/api/organizations/{orgId}/model_selector_state/chat
body: { model, thinking: { type: "effort_and_mode", effort, mode } }
```

**Why a duplicate fetch, not interception:** the page makes the bootstrap call
itself, but content scripts run in an isolated JS world — only the DOM is
shared, not the page's JS memory. Reading it requires our own request.
MAIN-world script injection to intercept the page's call was considered and
rejected as unnecessary complexity for a small JSON payload.

---

## Removed: the write path

Lived in `claude-content-script.js` as `syncPreferredModel()`, called on load.
Verbatim, as it last worked:

```js
// Applies the user's preferred model as the default for the next new chat.
// Only runs on a bare /new visit (handoffs already carry ?model= in the URL
// and are skipped here). Reads the current default + full model catalog first
// via the same bootstrap call the page itself makes, caches the catalog for
// the popup, and only PATCHes + reloads when the default is actually
// different — the picker's displayed model is hydrated from the bootstrap
// call before our PATCH can complete, so a reload is the only way to reflect
// a change within the same page load.
// Never blocks anything else on the page if any step fails.
async function syncPreferredModel() {
    if (window.location.pathname !== '/new') return;
    if (new URLSearchParams(window.location.search).has('q')) return;

    const orgId = document.cookie.match(/(?:^|; )lastActiveOrg=([^;]+)/)?.[1];
    if (!orgId) {
        console.warn('[ACB] syncPreferredModel: could not resolve org id, skipping');
        return;
    }

    try {
        const bootstrapRes = await fetch(
            `https://claude.ai/edge-api/bootstrap/${orgId}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false`,
            { credentials: 'include' }
        );
        if (!bootstrapRes.ok) {
            console.warn('[ACB] syncPreferredModel: bootstrap read failed', bootstrapRes.status);
            return;
        }
        const bootstrap = await bootstrapRes.json();
        const chatConfig = bootstrap?.model_selector_config?.find(c => c.id === 'chat');

        // Cache the full model catalog for the popup, regardless of whether
        // a preference is set yet — keeps the popup's dropdown current.
        if (chatConfig?.models) {
            chrome.storage.local.set({ availableClaudeModels: chatConfig.models });
        }

        const { preferredClaudeModel } = await chrome.storage.sync.get({ preferredClaudeModel: null });
        if (!preferredClaudeModel || preferredClaudeModel === 'none') return;

        const currentModel = chatConfig?.model;
        if (currentModel && currentModel.startsWith(preferredClaudeModel)) {
            console.log('[ACB] syncPreferredModel: already on preferred model', currentModel);
            return;
        }

        const patchRes = await fetch(`https://claude.ai/api/organizations/${orgId}/model_selector_state/chat`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                model: preferredClaudeModel,
                thinking: { type: 'effort_and_mode', effort: 'medium', mode: 'auto' }
            })
        });
        if (!patchRes.ok) {
            console.warn('[ACB] syncPreferredModel: patch failed', patchRes.status);
            return;
        }
        console.log('[ACB] syncPreferredModel: applied', preferredClaudeModel);

        const reloadKey = `acb-model-synced-${preferredClaudeModel}`;
        if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, '1');
            window.location.reload();
        }
    } catch (e) {
        console.warn('[ACB] syncPreferredModel: request errored', e);
    }
}
```

### Two details worth keeping

**The `.startsWith()` compare is deliberate** — it handles alias vs dated
snapshot IDs, e.g. stored `claude-haiku-4-5` against the API's
`claude-haiku-4-5-20251001`.

**The reload was deliberate, not a workaround.** The model picker's displayed
value is hydrated from the bootstrap call very early in the page's own load. A
content script running after page load can never win that race, so a same-load
UI update is impossible. Reload-once (guarded by a per-model `sessionStorage`
key to prevent loops) was the only way to reflect the change.

That reload was also the single biggest UX cost, and the main reason this went.

### Why it was dropped

- **Narrow value.** claude.ai already remembers your last-used model. This only
  helped the "snap back after a deliberate Opus session" case.
- **Visible reload** on every bare `/new` visit where the model differed.
- **Depends on an undocumented write endpoint** that can change silently.
- **Mutates account state** that outlives the extension.
- **Off-mission.** This extension bridges *context* between platforms. A general
  model-preference setting drifts the popup toward a grab-bag of unrelated
  Claude.ai tweaks.
- Anthropic could ship this natively at any time and make it redundant.

---

## Decision log

1. **Dynamic model detection via DOM scraping — rejected.** Required opening or
   reusing a claude.ai tab (visible flicker) and only yielded display labels,
   not verified URL-param IDs, so switching would still need fragile
   click-by-label. Went with a hardcoded list instead.
2. **Reversed (1) once the bootstrap endpoint was found.** The objections no
   longer applied — it returns proper `{id, name}` pairs directly. The popup now
   rebuilds from the live catalog, falling back to the hardcoded list in
   `popup.html` when the cache is empty (fresh install, no claude.ai visit yet).
3. **Dropping the write path was considered early** — the handoff param alone
   covers the primary use case with zero API code. Kept at the time, removed
   later for the reasons above.
4. **PATCH namespace was initially assumed** to match the URL param, accepting
   the risk to ship. Later confirmed via the bootstrap response.
5. **All console logs standardised to `[ACB]`** for filtering (previously mixed:
   unprefixed, `[MessageTimer]`, `[AI Presence]`). Convention going forward:
   `[ACB] <Module>: <message>`.

---

## If reviving the write path

- Re-verify both endpoint shapes first.
- The catalog refresh already gives you `chatConfig.model` (current default) for
  free — the compare step needs no extra request, just stop discarding it.
- Watch for **default drift**: the PATCH only fired when the *model* differed,
  not effort/thinking, so a manually-set effort/thinking should survive as long
  as the model matches. If drift is observed, suspect Claude.ai's own behaviour
  before this code.
- Consider whether the reload is still necessary, or whether the picker can be
  updated some other way — that was the feature's worst trait.
