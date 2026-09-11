# 3. Testing a hostile target

**Source:** [`test/`](../../test/) · [`e2e/`](../../e2e/) ·
[`e2e/helpers.ts`](../../e2e/helpers.ts) ·
[`e2e/connected-fixtures.ts`](../../e2e/connected-fixtures.ts)

---

## Context

The extension only does anything against live third-party sites, several behind
bot detection. A Playwright-launched Chrome sets `navigator.webdriver = true` —
Cloudflare (in front of claude.ai) and Google's login flow both detect that flag
and block the session. So the paths that matter most — a real logged-in
Claude/Gemini/ChatGPT chat — can't be exercised by just launching a browser and
driving it, the standard E2E recipe.

Separately, the MV3 background service worker idles out after ~30s, so even
reaching `chrome.*` from test code can't assume a worker is alive.

## The fix

**Functional core / imperative shell.** Everything that's actually logic — time
math, comment-tree reconstruction, budget trimming, formatting — is written as
pure functions with no `chrome`, DOM, or `fetch`, and unit-tested directly (77
tests, sub-second). The browser-coupled remainder (click handlers, storage,
composer polling) is kept thin enough that most bugs get caught before it.

**Two-tier E2E**, split by what needs a real login:

```ts
// fixtures.ts — CI tier: launches its own browser, no login.
// Covers: smoke, parsing, Medium end-to-end, the logged-out ChatGPT composer.

// connected-fixtures.ts — attaches to a browser you already launched and
// signed into a dummy account, over CDP:
export const test = base.extend({
  connectedContext: async ({}, use, testInfo) => {
    let context;
    try {
      const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
      context = browser.contexts()[0];
    } catch {
      testInfo.skip(); // no e2e:connect browser running — skip, don't fail
      return;
    }
    await use(context);
  },
});
```

`connectOverCDP` reaches a browser that was launched normally by the OS, so it
never sets `navigator.webdriver`. Connected specs (`reddit`, `gemini-*`,
`claude-*`) skip cleanly when that browser isn't up — a missing manual step
becomes a skip in CI, not a flaky failure.

One more wrinkle: an MV3 service worker asleep mid-test has no way to `evaluate`
against. `extensionEval()` handles both cases:

```ts
async function extensionEval(context) {
  for (const w of context.serviceWorkers()) {
    if (await isThisExtension(w)) return { evaluate: (fn, arg) => w.evaluate(fn, arg) };
  }
  // worker's asleep — fall back to a transient popup page
  const probe = await context.newPage();
  const id = await scrapeExtensionIdFromChromeExtensionsPage(probe);
  await probe.goto(`chrome-extension://${id}/popup.html`);
  return { evaluate: (fn, arg) => probe.evaluate(fn, arg) };
}
```

## Result

A fast, deterministic CI gate (unit tests + the no-login E2E tier) that never
touches the bot wall, plus real coverage of the login-gated paths when a
developer runs the connected tier locally before a release. The connected tier
is intentionally **not** a CI gate — it depends on a shared browser profile and
free-tier rate limits (Gemini throttles after ~15 chats), which makes it a good
pre-release check and a bad thing to block merges on.

## Note

Not everything that matters is observable this way. `soundsEnabled` gates a Web
Audio `AudioContext` created lazily inside the content script's *isolated*
world — a page-context E2E probe (`addInitScript`) simply can't see it, no matter
how the test is written. Rather than fight the sandbox boundary, that assertion
moved to a unit test (`test/presence.test.js`) against the state machine
directly, and the E2E spec keeps only the DOM-observable half
(`claudeTimerEnabled` gating the `[TimeContext:` prefix). The lesson: pick the
test layer the effect is actually visible at, not the layer the feature lives in.
