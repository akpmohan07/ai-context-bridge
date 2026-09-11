# Context Handoff

How Reddit/Medium content reaches a destination AI, and why it goes through
`chrome.storage.local` + the composer rather than the URL. Named for Gemini,
where the URL limit first forced this design; **it now applies to all three
destinations** — the whole mechanism lives in `AIPlatform`
(`src/ai-platforms/base.js`) and a subclass supplies only selectors.

## What ships

`AIPlatform.openWithContext(text)` — the SENDING side, on the source page:

```
id = crypto.randomUUID()
window.open('<dest>/<newChatPath>#acb=' + id)              // sync, in the click gesture
chrome.storage.local.set({ ['handoff:' + id]: { text, ts } })
```

The query string 414s / 400s on a 4000-word thread; the `#fragment` isn't sent
to the server, so it carries the id with no limit.

`<dest>.content.js` → `AIPlatform.receiveHandoff()` — the ARRIVAL side, in the
destination tab's own content script:

```
id = new URLSearchParams(location.hash.slice(1)).get('acb')   → no id, no handoff
poll ~3s for handoff:<id>  (the set above may not have landed yet)
  → drop it if ts is > 60s old (tab was closed mid-handoff)
  → remove it (consume once)
poll for the composer
  → contenteditable: execCommand('insertText'), paste-event fallback
  → <textarea> (ChatGPT logged-out): native value setter + input event
poll the send button → click when enabled
```

Each tab reads only *its own* id's key — a stale entry (tab never loaded) or a
foreign one (you typed something into storage by hand) has a different id and is
invisible. Per-platform config: `newChatPath`, `composerSelector`,
`sendButtonSelector`. Claude overrides `newChatUrl()` to append `?model=`.

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

## Why a nonce, not a fixed key

The context used to sit in one fixed slot per destination (`pendingGeminiPrompt`).
*Any* gemini.google.com tab that loaded read that slot — so a leftover from a
crashed handoff, or something a developer wrote there by hand, would be sent
into the next chat. The per-handoff `handoff:<uuid>` key + the id in the
`#fragment` means each tab reads only the payload minted for it.

Three guards, in order of what they catch:

- **Nonce** — a stale or foreign key has a different id; this tab never looks at it.
- **Consume-once** — `receiveHandoff()` `remove()`s the key the moment it reads it.
- **TTL** — if the tab is closed before `receiveHandoff` runs, nothing consumes
  the key; a payload whose `ts` is more than 60s old is dropped (and cleared) so
  it can't resurface. A real handoff is consumed in ~1–2s.

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
  the URL; `receiveHandoff` no-ops with no pending key and consumes the key once
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
