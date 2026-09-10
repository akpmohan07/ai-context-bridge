# Gemini — Time Context on Send

Prepends a `[TimeContext: <now> | <gap> since last message]` line to the message
you're about to send, so Gemini knows the wall-clock time and how long it's been.
Same feature as claude.ai and chatgpt.com; this doc covers the Gemini-specific
half.

Shared code lives in `src/time/message-timer.js` — the core (formatting, the
30-min threshold, send interception, `buildPrefix`) is one implementation. Each
adapter answers one question differently: **"when was the last message?"**

## Gemini is record-only — no seed

Claude and ChatGPT **seed** the authoritative last-message time from a clean
history API on load, so the *first* message in a resumed old chat shows the
correct gap. Gemini has neither ingredient:

- **No per-message timestamp in the DOM.** Verified against a saved
  conversation: the only time-related class is `.async-timestamp` (for
  scheduled / async "deep research" tasks), and it appears in CSS only. Nothing
  to scrape.
- **No clean history endpoint.** Gemini's conversation history comes back only
  through `batchexecute` — an obfuscated RPC keyed by opaque function ids that
  Google rotates on deploys. Calling it from a content script is brittle and a
  standing maintenance cost. Rejected for the same reason ChatGPT's
  `f/conversation` body-reading was rejected: disproportionate machinery.

So the Gemini adapter passes `fetchLastTime: () => null`. `seededTimeStore`
already treats a null/failed fetch as "leave the cache alone", so `onNavigate`
simply no-ops and the store is driven entirely by `recordSend`.

## How it works

`geminiLastMessageAt` in `chrome.storage.local` — `{ convId → epoch ms }`.
`convId` is the `/app/<hex>` segment of the URL.

On every send (Enter in the Quill editor, or the send button), the interceptor:

1. reads `geminiLastMessageAt[convId]` — the moment you last sent *in this chat*
2. computes `now − last`
3. `buildPrefix` decides: `≥ 30 min` → prefix with elapsed; no stored value →
   bare `[TimeContext: <now>]`; `< 30 min` → nothing (active conversation)
4. stamps `geminiLastMessageAt[convId] = now`

| Scenario | Covered? |
|---|---|
| Idle on a chat → send, or a long gap after chatting | ✅ record |
| Same chat in two tabs | ✅ shared `chrome.storage.local` + `onChanged` |
| Brand-new chat (no id / no history) | ✅ → `[TimeContext: <now>]` only |
| Restart browser, reopen a chat used on this device, send | ✅ value is on disk |
| **First send in a chat created on another device** | ❌ bare `[TimeContext: <now>]` instead of the real gap — self-heals on the next send |

That last row is the entire cost of dropping the seed. Everything within one
device is correct.

## Selectors (verified 2026-09-09 against a saved conversation)

| | Selector |
|---|---|
| Conv id | `location.pathname` → `/\/app\/([a-f0-9]+)/` |
| Chat input | `.ql-editor[contenteditable="true"]` (Quill; `aria-label="Enter a prompt for Gemini"`) |
| Send button | `.send-button-container button, button.send-button, button[aria-label="Send message"]` |
| User message | `<user-query>` · Gemini reply `<model-response>` |

The send button's exact `aria-label` is the one value not confirmable from the
saved page (the button is absent from the DOM when the composer is empty) — the
selector list above covers the likely names; verify on the live site if send
interception ever stops firing.

## Storage

`geminiLastMessageAt` in `chrome.storage.local`, same shape and lifecycle as
`claudeLastMessageAt` / `chatgptLastMessageAt`: device-local (not synced),
persistent across reloads/restarts/updates, no TTL, one small entry per
conversation.

## Tests

- **Unit** (`test/message-timer.test.js`): `pickAdapter()` host routing,
  adapter shape, `geminiConvId()` against `/app/<hex>`, `/app`, off-route, and
  non-collision with Claude's `/chat/` and ChatGPT's `/c/` routes.
- **E2E** (`e2e/gemini-timing.spec.ts`, connected-fixtures / manual-local tier):
  three real sends in one new chat — bare prefix, then no prefix (active), then
  prefix-with-elapsed after a deliberately lowered `THRESHOLD_MS`.

## Decision log

1. **Seed from `batchexecute` — rejected.** Obfuscated RPC, deploy-fragile, a
   standing maintenance cost for one edge case (cross-device first send).
2. **Scrape a DOM timestamp — not possible.** Gemini renders none for normal
   messages.
3. **Chosen: record-only.** `recordSend` on every send, no seed. Degrades
   cleanly (bare timestamp) exactly where a seed would have helped.
