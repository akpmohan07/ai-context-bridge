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
*first* as the migration's safety net — now 66 tests, ~93% coverage on the pure
modules (`reddit-parse`, `medium-markdown`, budget, formatter, schema, time,
presence). Playwright E2E (L2) followed — see below. [[../CLAUDE.md]] Development Setup.

---

## Playwright E2E (L2) — every surface covered (see Status below)

`e2e/` scaffolded: `fixtures.ts` loads the built extension via
`launchPersistentContext` (classic headless doesn't load MV3 extensions at
all — must run headed). CI wiring is done: `.github/workflows/ci.yml` runs
`unit` + `e2e` jobs together (headed Chromium under `xvfb`), on every
push/PR/dispatch, `continue-on-error: true` so a live-site failure never
blocks a merge. `e2e/write-summary.mjs` renders the JSON reporter output as a
markdown table on the GitHub Actions run summary page (readable pass/fail/
duration without downloading the HTML report artifact).

`smoke.spec.ts` and `medium.spec.ts` pass reliably — the latter discovers a
live article via Medium's public tag RSS feed (no hardcoded URL to rot) and,
via `e2e/helpers.ts`'s `DESTINATIONS` record, has one named test per
destination (`Medium → Claude opens a correct handoff`, etc.) plus a menu-
visibility test. Each destination's own host is intercepted with
`route.fulfill()` (empty response) so the assertion checks what our
`openWithContext()` built, not the third-party app's behavior — navigating for
real raced Claude.ai's client-side URL cleanup.

### ChatGPT: works as a guest, no auth needed

Unlike Claude.ai (see below), `chatgpt.com` serves a genuinely working chat to
logged-out visitors — confirmed live: `chatgpt.com/?q=...` auto-sends the
prefill with no login wall. `e2e/chatgpt.spec.ts` exploits this for real
(unmocked) coverage: the prefill actually lands as a sent message, and the
floating "AI Context Bridge" button (`entrypoints/chatgpt.content.js`) is
confirmed to correctly stay hidden outside `/c/...` conversation pages.
Deliberately does NOT wait for the assistant's reply — that depends on
chatgpt.com's live generation latency and a DOM that shifts between streaming
and final states, which is flakiness in chatgpt.com's behavior, not this
extension's. Also found: chatgpt.com's post-send redirect target isn't
consistent (`/uc/<id>` some runs, staying on `/?model=auto` others) — the spec
asserts the one thing that's actually invariant (path never becomes `/c/...`),
not a specific destination URL.

### Claude.ai: guest doesn't work, real auth still required

Checked live: `claude.ai/new?q=...` logged-out redirects straight to
`/login`, and that login page itself sits behind a Cloudflare "Performing
security verification" interstitial. No guest-mode shortcut here.

**`storageState.json` (cookie replay) does not work for Claude — proven, not
theoretical.** Anthropic's Cloudflare bot-management checks `navigator.webdriver`
live, on every request, regardless of what cookies are presented. This was
tested exhaustively before landing on a working technique:

| Attempt | Chrome launched by | `navigator.webdriver` | Result |
|---|---|---|---|
| Scripted login (Playwright `launch()`, Chromium) | Playwright | `true` | ❌ Google blocks at email step |
| Same, real Chrome via `channel: 'chrome'` | Playwright | `true` | ❌ Same block |
| Manual human-typed login inside that same window | Playwright | `true` | ❌ Same block — the flag doesn't care who types |
| Plain Chrome launched by hand, but with `--remote-debugging-port` on from the start | You | `false`, but debug port itself is a signal | ❌ Google blocks at sign-in |
| **Login on a debug-port-free Chrome → quit → relaunch same profile with `--remote-debugging-port` → Playwright `connectOverCDP()` after** | You | `false`, throughout | ✅ **Works** — no challenge, session intact |
| Cookies captured from that clean session, replayed via `launchPersistentContext({storageState})` | Playwright | `true` | ❌ Still blocked — confirms it's the *live* browser's flag, not cookie/session history |

**Why the working row works:** `--enable-automation` (which sets
`navigator.webdriver = true`) is added automatically by Playwright's own
`launch()`/`launchPersistentContext()` — there's no opt-out via those APIs.
`connectOverCDP()` is fundamentally different: it attaches to a browser
someone else already started, so if that browser was never launched by
Playwright, the flag was simply never set. Nothing here spoofs or lies about
automation — it's a genuinely normal, human-driven browser at the one moment
(login) that's checked, with a script only attaching afterward.

**Practical setup**, using a profile persisted in-repo (gitignored, `e2e/.auth/`
— never committed, contains live session data):
```bash
npm run e2e:login    # opens plain Chrome on the persisted profile — sign in by hand
npm run e2e:connect  # relaunches same profile with --remote-debugging-port, ready to attach
```
Since all three providers can use the same dummy Google account, one profile
covers Claude, ChatGPT, and Gemini — sign into Google once, "Continue with
Google" on each site should auto-authenticate.

**Ceiling of this technique:** inherently manual and local — there's no
human to do the plain-Chrome login step in GitHub Actions. This is the L2
tier as originally scoped (manual/on-demand, pre-release validation), not
something that becomes part of the automated push/PR suite.

**One more wrinkle, solved: `--load-extension` on the command line is itself
blocked on a Google-identity-linked profile — but the identical unpacked
build loads fine through the UI.** Adding `--load-extension`/
`--disable-extensions-except` to the same working `connectOverCDP` setup
above broke it again: the extension silently failed to load (no service
worker, absent from `chrome://extensions`, repeated
`"Requested load of chrome://newtab/ for incorrect profile type"` in the
Chrome log) — narrowed down empirically, not guessed:
- Ruled out: prior profile pollution (reset the profile from scratch, same failure)
- Ruled out: Chrome Sync specifically (declined every sync prompt, still failed)
- Ruled out: launch sequencing (plain-then-relaunch works fine *without* any
  Google auth involved — isolated with a disposable profile, no login)
- **Isolated cause: any Google identity ever authenticated in the browser**
  (sync-declined or not) **rejects unpacked extensions loaded via the
  `--load-extension` flag specifically.** Manually clicking chrome://extensions
  → Developer mode → **Load unpacked** → `.output/chrome-mv3` loads the exact
  same build without issue, on the exact same signed-in profile, and doesn't
  disturb the session.

**Updated practical setup:**
```bash
npm run e2e:login    # opens plain Chrome on the persisted profile — sign in by hand
npm run e2e:connect  # relaunches same profile with --remote-debugging-port (no --load-extension)
```
Then, once per profile (not once per run — Chrome remembers it after):
`chrome://extensions` → Developer mode on → **Load unpacked** → select
`.output/chrome-mv3`.

**Built and verified working, live, against the real site:**
`e2e/connected-fixtures.ts` (connect-based, distinct from the
`launchPersistentContext`-based `e2e/fixtures.ts` used for the unauthenticated
specs) and `e2e/claude-authenticated.spec.ts` — confirms `ClaudePlatform.injectUI()`'s
real auto-send (not just URL construction) and, as a side effect of the
programmatic `sendButton.click()` genuinely dispatching a real DOM event,
confirms `MessageTimer`'s Time Awareness prefix fires correctly on the first
message too. 3/3 stable runs.

### Reddit spec — RESOLVED: connected-fixtures / manual-local tier

`reddit.com/*.json` and plain subreddit listings return a `403` bot-detection
wall for anonymous requests from a datacenter IP (dev sandbox, and CI runners
too). The wall clears for an **authenticated session in a real, human-launched
browser on a residential IP** — exactly what `connected-fixtures.ts` already
provides for the Claude/Gemini specs.

So `reddit.spec.ts` moved from `fixtures.ts` (launchPersistentContext,
anonymous) to `connected-fixtures.ts`, un-skipped. Setup adds one step to the
existing connected-spec flow: sign into `reddit.com` in the `npm run e2e:login`
Chrome ("Continue with Google" reuses the dummy account). Discovery uses the
browser context's own cookies (`page.request`), no fake User-Agent.

This is manual-local, not CI-gating — same tier as Claude/Gemini. The rejected
alternative was a static local HTML fixture (deterministic, CI-runnable, but
blind to Reddit DOM changes — and a live spec catches those, which is the whole
point for a scraper).

### Status

All surfaces now have E2E coverage:

| Surface | Spec | Tier |
|---|---|---|
| Medium → 3 destinations | `medium.spec.ts` | CI (launchPersistentContext) |
| ChatGPT guest auto-send | `chatgpt.spec.ts` | CI |
| Reddit → 3 destinations | `reddit.spec.ts` | connected / manual-local |
| Claude auto-send + Time Awareness | `claude-authenticated.spec.ts` | connected / manual-local |
| Claude Presence + settings toggles | `claude-*.spec.ts` | connected / manual-local |
| Gemini Time Awareness (3 branches) | `gemini-timing.spec.ts` | connected / manual-local |
| Gemini large-content handoff | `gemini-handoff.spec.ts` | connected / manual-local |

The connected tier attaches to a human-launched Chrome (`npm run e2e:connect`)
signed into a shared dummy Google account — Playwright-launched browsers set
`navigator.webdriver`, which Cloudflare/Google block. `e2e/helpers.ts`'s
`extensionEval()` reaches `chrome.storage` via the background SW, or a transient
popup page when the MV3 worker has idled out.
