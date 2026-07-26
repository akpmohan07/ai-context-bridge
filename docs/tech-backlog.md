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

## Destination registry (multi-provider) — SHIPPED

Built alongside Gemini (the third provider, which was the trigger). Lives in
`src/ai-platforms/registry.js`: a `Destinations` array that the Reddit and Medium
dropdowns iterate instead of enumerating `openInClaude`/`openInChatGPT`/
`copyForAI` by hand. The per-source prompt is now a single `message()` wrapper
instead of one copy per destination. Adding a URL-prefill provider is one
registry entry + one manifest line.

**Tier that remains:** URL prefill isn't universal. Claude and ChatGPT accept a
`?q=` param; Gemini's `?prompt=` works for short content but 400s on long (see
[platforms/gemini/context-handoff.md](platforms/gemini/context-handoff.md)); Grok,
Copilot and DeepSeek have no confirmed equivalent and would need per-platform DOM
injection with auto-send polling, like `ClaudePlatform.injectUI()`. So a
non-prefill provider still costs more than a registry line — that part didn't go
away, it just isn't the common case.

The multi-provider expansion this enables is still the trigger for the storage
entry above.

---

## Build system: WXT — ADOPTED

The extension was "no build — pure JS loaded via `manifest.json`" until testing
became a goal and the plugin grew. That model made logic untestable (global
IIFEs, no imports) and the per-content-script `js: [...]` arrays a recurring
edit. Migrated to **WXT** (wxt.dev): `entrypoints/` + `src/**` ES modules;
`manifest.json` is generated from `wxt.config.ts` + each entrypoint. `chrome.*`
kept as-is (Chrome-only) to minimise the diff. Unit tests (Vitest) were written
*first* as the migration's safety net. Deferred parts of the testing plan:
finish jsdom/import-gated unit targets (`reddit._mapComment`, Medium markdown),
then Playwright E2E (L2). See [[../CLAUDE.md]] Development Setup.
