# Engineering Decisions

AI Context Bridge is a Chrome MV3 extension that moves context between web pages
and AI chats — a Reddit thread or Medium article into Claude / ChatGPT / Gemini,
or a ChatGPT conversation into Claude — with **no backend**. All processing is
local; the extension only reads a page when you click.

That constraint (no server, three third-party SPAs as targets, a browser
sandbox) forced a handful of decisions worth writing down. Each page below is a
lightweight [ADR](https://adr.github.io/) — self-contained: context, the fix,
the result, and what it cost.

---

## Architecture in 60 seconds

Three extension points, each an abstract base class that carries the real logic.
A concrete integration supplies only what's specific to it.

| Base class | Owns | A subclass supplies |
|---|---|---|
| `AIPlatform` (`src/ai-platforms/base.js`) | the entire handoff — stash, open, receive, poll, insert, send | `composerSelector`, `sendButtonSelector`, `newChatPath` |
| `ContentSource` (`src/content-sources/base.js`) | `getFormattedContent()` = fetch → budget-trim → format | `isMatch()`, `fetchContent()`, `injectUI()` |
| `UIInjector` (`src/ui/`) | MutationObserver lifecycle for SPA-safe DOM injection | `isTargetNode()`, `buildItems()` |

Adding Gemini as a destination was this much code:

```js
export class GeminiPlatform extends AIPlatform {
  constructor() {
    super({
      name: 'Gemini',
      baseUrl: 'https://gemini.google.com',
      newChatPath: '/app',
      composerSelector: '.ql-editor[contenteditable="true"]',
      sendButtonSelector:
        '.send-button-container button, button.send-button, button[aria-label="Send message"]',
    });
  }
}
```

A fix in the base class fixes every platform at once — which is exactly how the
`HTTP 414` fix (below) landed for all three destinations in one change.

---

## The decisions

### [1. Backend-less handoff — content in storage, a one-time token in the URL fragment](./ADR-1-handoff-transport.md)

Sending a 4,000-word thread as `claude.ai/new?q=<content>` produced **HTTP 414** —
the URL hit ~40k characters. And an early design used one shared storage key, so
any open Claude tab would pick up any pending handoff and paste the wrong prompt.
The fix: the payload goes into `chrome.storage.local` under a `handoff:<uuid>`
key; the URL carries only `#acb=<uuid>` in the fragment (fragments are never sent
to the server, so there's no size limit). The destination tab reads exactly its
own key, consumes it once, and a 60-second TTL discards anything abandoned
mid-flight. Result: unbounded payload size, deterministic routing, zero backend.

### [2. Reverse-engineering each platform's private API for message timing](./ADR-2-platform-api-timing.md)

"Time since your last message" needs per-message timestamps the rendered DOM
doesn't reliably expose — and Claude, ChatGPT and Gemini each expose different
internals. Claude's history endpoint is cookie-authed and same-origin; ChatGPT's
`backend-api` needs a bearer token lifted from `/api/auth/session`; Gemini
exposes neither cleanly, only the obfuscated `batchexecute` RPC. The decision:
one shared store seeded per-platform by a small adapter, and Gemini deliberately
made **record-only with self-healing** rather than shipping a fragile scrape.
Includes the new-chat bug — a send from `claude.ai/new` has no conversation id
yet, so the timestamp had nowhere to go and the second message misread as "no
prior message."

### [3. Testing a hostile target](./ADR-3-testing-strategy.md)

The extension runs against live third-party sites behind bot detection.
Playwright-launched browsers set `navigator.webdriver`, which Cloudflare and
Google login block outright — so the authenticated flows can't be tested the
normal way. The strategy: a functional core / imperative shell split so all the
timing, parsing and budgeting logic is unit-tested with no browser (77 tests,
~0.5s), plus a two-tier E2E setup — a CI tier that launches its own browser with
no login, and a "connected" tier that attaches over CDP to a real Chrome you
launch signed into a dummy account, skipping cleanly when that browser isn't up.

### [4. Abstract-factory architecture — adding a platform is configuration, not code](./ADR-4-abstract-factory.md)

Five integrations (three AI destinations, two content sources), each with its own
selectors and DOM quirks. The naive shape is one bespoke module per integration
with the handoff logic copy-pasted five times. Instead: three base classes hold
all the behaviour, subclasses hold only the differences. The payoff is
concentration of risk — the handoff exists once, is tested once, and fixed once.

### [5. One composer-injection path across three incompatible editors](./ADR-5-composer-injection.md)

The same "type this and hit send" code drives a `contenteditable` div (Claude), a
Quill editor (Gemini) and a **React-controlled `<textarea>`** (logged-out
ChatGPT) — and React ignores direct `.value` writes. The fix:
`execCommand('insertText')` with a `ClipboardEvent('paste')` fallback for
contenteditable; for the React textarea, write through the native value setter
(`Object.getOwnPropertyDescriptor(proto, 'value').set`) then dispatch a synthetic
`input` event so React's change tracking sees it — all wrapped in a
poll-retry-give-up loop because SPA composers mount late.

---

## What I'd do differently

- **Firefox config from day one.** The code is portable (observational
  `webRequest` only, no blocking APIs), but `browser_specific_settings.gecko.id`
  and a `zip:firefox` script should have been in place before the first release,
  not bolted on.
- **The 60-second handoff TTL is a magic number.** It works, but it should be a
  named constant with a comment explaining the failure it guards (a tab closed
  between `openWithContext` and the destination loading), which it now has — but
  it took a production bug to get there.
- **Connected-tier E2E isn't in CI.** It's a documented pre-release spot check.
  A hosted browser profile with a maintained dummy login would make it a real
  gate.

---

See also [`CLAUDE.md`](../../CLAUDE.md) for the full architecture reference and
contribution guide.
