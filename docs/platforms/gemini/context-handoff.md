# Gemini — Context Handoff

How Reddit/Medium content reaches Gemini, and why it goes through
`chrome.storage.local` + the composer rather than the URL.

## What ships

`GeminiPlatform.openWithContext(text)`:

```
chrome.storage.local.set({ pendingGeminiPrompt: text })
window.open('https://gemini.google.com/app')      // nothing in the URL
```

`gemini.content.js` → `GeminiPlatform.injectUI()` on arrival:

```
read + clear pendingGeminiPrompt          (consume once)
poll for .ql-editor[contenteditable]
  → focus, collapse a range at its start
  → document.execCommand('insertText', false, text)
poll the send button (.send-button-container button / button.send-button)
  → click when enabled
```

Mirrors `ClaudePlatform.injectUI()` — the only difference is Claude.ai fills its
own composer from `?q=`, so Claude's injectUI just clicks send; Gemini has
nothing in the URL, so we type the text in first.

## Why not `?prompt=`

Gemini *has* a native prefill param (`gemini.google.com/app?prompt=<text>`), and
an earlier version used it. Two problems killed it:

1. **It 400s on large content.** A Medium article or big Reddit thread trimmed to
   the ~4000-word budget is a 20,000+ character URL:
   `400. That's an error. Your client has issued a malformed or illegal request.`
   It errors rather than truncating — loud, but still broken.
2. **It doesn't auto-send.** `?prompt=` only prefills the box; Google won't
   auto-submit from a URL. So even short content wasn't at parity with
   Claude/ChatGPT (which land as a *sent* message).

The `storage.local` + composer path fixes both at once, in one code path (no
size threshold), and the payload has no length limit.

## Why composer insert, not file attachment

An earlier design proposed attaching the context as a `.txt` file via a
programmatic `DataTransfer` on Gemini's `<input type="file">`. Rejected:

- **Unproven** — the file `<input>` isn't in the page until an upload is
  initiated (not in a saved-page DOM), and many apps ignore a
  programmatically-set `input.files`. Make-or-break, and untested.
- **`execCommand('insertText')` into `.ql-editor` is proven** — the Time
  Awareness feature (`src/time/message-timer.js`) does exactly this on every
  send, validated live on gemini.google.com 2026-09-09.
- Result matches Claude/ChatGPT: context in the composer, sent as a message.

File attach stays a possible future refinement (a 4000-word doc arguably reads
better to Gemini as an attachment), not a v3 blocker.

## Consume-once

`pendingGeminiPrompt` is removed from storage the moment `injectUI()` reads it,
before the poll loop runs — so a later manual Gemini visit never re-injects
stale content. Worst case if the tab is closed mid-handoff: one orphaned key,
consumed (harmlessly, into an already-used chat) on the next visit.

## Permissions / manifest

No new permissions — `storage` is already granted, and `gemini.content.js` is a
statically-declared content script matching `https://gemini.google.com/*`
(added for Time Awareness; it now also carries the handoff).

## Selectors (verified 2026-09-09 against a saved conversation)

| | Selector |
|---|---|
| Composer | `.ql-editor[contenteditable="true"]` (Quill) |
| Send button | `.send-button-container button, button.send-button, button[aria-label="Send message"]` |
| Sent user turn | `<user-query>` |

Send button `aria-label` unconfirmed (absent from the DOM when the composer is
empty) — the selector list covers the likely names.

## Tests

- **Unit** (`test/platforms.test.js`): `openWithContext` stashes the full text
  (tested with 50k chars) and opens a bare `/app` — nothing with `prompt=` in
  the URL; `injectUI` no-ops with no pending key and consumes the key once
  before touching the DOM.
- **E2E — dropdown** (`e2e/medium.spec.ts`, `e2e/reddit.spec.ts` via
  `helpers.ts`): "Open in Gemini" opens `gemini.google.com/app` and the context
  is in `chrome.storage.local`, not the URL (read back through the service
  worker).
- **E2E — round trip** (`e2e/gemini-handoff.spec.ts`, connected-fixtures /
  manual-local tier): an ~11k-char payload is inserted into the real composer
  and sent as a `<user-query>` turn; the pending key is cleared.

## Decision log

1. **`?prompt=` URL — rejected.** 400s past ~6k chars, never auto-sends.
2. **File attachment via `DataTransfer` — rejected.** Unproven on Gemini, fragile
   `<input type=file>` targeting, silent-no-op risk.
3. **Adaptive (URL for short, content script for large) — rejected.** Two code
   paths and a guessed size threshold, for no gain once the content-script path
   exists anyway.
4. **Chosen: always `storage.local` + `execCommand` composer insert + click
   send.** One path, no length limit, auto-sends, reuses a mechanism proven live.
