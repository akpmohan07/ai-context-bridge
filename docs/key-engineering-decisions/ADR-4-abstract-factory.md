# 4. Abstract-factory architecture — adding a platform is configuration, not code

**Source:** [`src/ai-platforms/`](../../src/ai-platforms/) ·
[`src/content-sources/`](../../src/content-sources/) · [`src/ui/`](../../src/ui/)

---

## Context

Five integrations: three AI destinations (Claude, ChatGPT, Gemini) and two
content sources (Reddit, Medium). Each destination has its own composer
selector, send-button selector, and new-chat URL; each source has its own
extraction logic and its own place to inject a button. Written naively, that's
five self-contained modules, each reimplementing "open a tab, stash context,
poll for the composer, insert, click send" — five copies of the same 40 lines,
five places to fix the same bug.

## The fix

Three abstract base classes, each owning the behaviour that's actually shared,
with a subclass supplying only the genuine differences:

| Base class | Owns | A subclass supplies |
|---|---|---|
| `AIPlatform` | the entire handoff — stash, open, receive, poll, insert, send | `composerSelector`, `sendButtonSelector`, `newChatPath` |
| `ContentSource` | `getFormattedContent()` = fetch → budget-trim → format | `isMatch()`, `fetchContent()`, `injectUI()` |
| `UIInjector` | MutationObserver lifecycle for SPA-safe DOM injection | `isTargetNode()`, `buildItems()` |

A full destination is this much code:

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

Claude needs one small override — everything else is inherited:

```js
export class ClaudePlatform extends AIPlatform {
  constructor() { super({ name: 'Claude', baseUrl: 'https://claude.ai', newChatPath: '/new', ... }); }

  // ?model= is short and safe to keep in the URL — the context itself never
  // rides the URL (see decision 1).
  async newChatUrl() {
    const { preferredClaudeModel } = await chrome.storage.sync.get(...);
    const model = preferredClaudeModel !== 'none' ? `?model=${preferredClaudeModel}` : '';
    return `${this.baseUrl}${this._newChatPath}${model}`;
  }
}
```

## Result

The handoff exists once, is tested once (`test/platforms.test.js`), and is fixed
once. That's not theoretical: the `HTTP 414` fix (decision 1) is a change to
`base.js` alone, and it fixed Reddit→Claude, Reddit→ChatGPT, Reddit→Gemini, and
both Medium equivalents in the same commit. Adding Gemini as a full destination,
including Time Awareness parity, was scoped and shipped inside one working
session — most of the actual effort went into Gemini's *timing* adapter
(decision 2), where it genuinely differs, not into re-deriving the handoff.

The cost is the usual one for this pattern: `base.js` accretes the conditionals
for real platform differences (textarea vs. contenteditable in `_typeInto`), and
`new.target` guards against direct instantiation are a bit of ceremony that a
language with real abstract classes wouldn't need.

## Note

This is the case for the pattern paying rent immediately rather than being
architecture-for-its-own-sake: Gemini parity was a *scope decision* made mid-
project ("all basic features across all three platforms"), not planned from day
one. The fact that it landed as a config object plus one adapter — instead of a
fourth bespoke module — is the actual argument for having built it this way.
