# Tech Backlog

Structural work that's been discussed and deliberately deferred. Each entry
records what to do, why it isn't done, and the condition that should trigger it
— so the decision doesn't get re-litigated from scratch every time it surfaces.

---

## Organise the cache with proper intention

**What:** give every `chrome.storage` key a namespaced physical name, and route
all access through one accessor so the naming lives in a single place.

```
platform:claude:preferredModel     (sync)   was preferredClaudeModel
cache:claude:models                (local)  was availableClaudeModels
cache:claude:modelsFetchedAt       (local)  was modelCatalogFetchedAt
feature:sounds:enabled             (sync)   was soundsEnabled
source:reddit:enabled              (sync)   was redditEnabled
```

Right now keys are flat and ad-hoc, and three different *kinds* look identical:
`soundsEnabled` is a claude.ai feature, `redditEnabled` is a source toggle,
`preferredClaudeModel` is platform config. Nothing in the name distinguishes
them, and `chrome.storage` shows one undifferentiated list.

### Why it isn't done

Prefixed keys and direct `chrome.storage` calls don't compose in plain JS. The
key string ends up written twice per call, quoted, with bracket-notation access:

```js
const { 'cache:claude:models': models } = await chrome.storage.local.get({
    'cache:claude:models': Defaults['cache:claude:models']
});
```

Avoiding that noise requires an accessor layer — which was built once
(`Store.get/set/onChange`, ~100 lines) and removed as disproportionate for
**8 keys across 6 call sites**. The three viable shapes:

| | Call sites | Storage inspector | Cost |
|---|---|---|---|
| **(a)** flat names, no wrapper — *current* | clean | undifferentiated | none |
| **(b)** prefixed keys + accessor | clean | organised | ~100 lines, callbacks → promises everywhere |
| **(c)** prefixed keys, no wrapper | noisy | organised | worst of both — avoid |

### Trigger

Do **(b)** when key count grows past roughly 15, which the multi-provider
expansion causes directly: five destinations each carrying a model preference
and a catalog cache is 15+ keys on its own. Better to build the accessor once at
that point than to rename keys twice.

### Constraint: not all keys are free to rename

| Keys | Renameable |
|---|---|
| `preferredClaudeModel`, `availableClaudeModels`, `modelCatalogFetchedAt` | **Free** — never committed, so they exist in no published build |
| `soundsEnabled`, `timerEnabled`, `chatgptEnabled`, `redditEnabled`, `mediumEnabled` | **Not free** — shipped in v1.1. Renaming silently resets every existing user's settings |

So (b) can't land without a migration for the second group.

### Prerequisite: schema version + migration runner

Sketched but not built. Shape that was agreed:

- `schemaVersion` stored in **sync**, not local — it must travel with the data
  it describes, or a second device thinks it has already migrated.
- Migrations keyed by target version, forward-only, idempotent.
- Bump the version **per step**, so a failure midway through a multi-version
  jump doesn't replay migrations that already succeeded.
- Run from `chrome.runtime.onInstalled` with a `reason === 'update'` check;
  on `'install'` just stamp the current version and run nothing.
- **Caches are invalidated, not migrated** — if a cached shape changes, delete
  it and let it refetch. Only durable sync data needs real migration.
- MV3 race: content scripts in already-open tabs run old code until reload, so
  readers must tolerate absent keys. The `get({ key: default })` form already
  does this — keep that discipline.

Deliberately not built yet: a migration framework with zero migrations tends not
to work when the first real one arrives. Build it alongside the first actual
rename.

### Related

Partially solved already by `src/core/defaults.js`, which fixed the concrete bug
(every default was declared twice and had already drifted — `preferredClaudeModel`
was `'claude-sonnet-4-6'` in `claude.js` and `'none'` in `popup.js`). What
remains is naming and access, not duplication.

---

## Destination registry (multi-provider)

Adding an AI destination currently costs 8 touch points, because the destination
list is hardcoded in five places and the named-action interface
(`openInClaude`, `openInChatGPT`, `copyForAI`) is a fixed vocabulary — so every
new provider means editing every content source. The per-source prompt string is
already duplicated once per destination.

Replace with a registry that destinations are read from, so sources iterate
rather than enumerate. Adding a provider drops to one file, one registry entry,
one manifest line.

**Caveat that shapes the work:** URL prefill isn't universal. Claude, ChatGPT and
Perplexity accept a `?q=` style param; Gemini, Grok, Copilot and DeepSeek have no
documented equivalent and would need per-platform DOM injection with auto-send
polling, like `ClaudePlatform.injectUI()` does. That's two tiers of work, not one
uniform standard. Also unverified: whether those providers tolerate the very long
URLs a 4000-word Reddit thread produces, or truncate silently.

This is also the trigger for the storage entry above.
