# ChatGPT — Time Context on Send

Prepends a `[TimeContext: <now> | <gap> since last message]` line to the message
you're about to send, so ChatGPT knows the wall-clock time and how long it's
been. Same feature as claude.ai; this doc covers the ChatGPT-specific half.

Shared code lives in `src/time/message-timer.js`, refactored into per-platform
adapters. The core — formatting, the 30-min threshold, the send interception,
`buildPrefix` — is one implementation. Each adapter answers only one question
differently: **"when was the last message?"**

- **Claude** reads the per-message timestamps it renders in the DOM
  (`span.text-text-500.text-xs`).
- **ChatGPT renders no per-message timestamp**, so it can't be scraped. That's
  the entire problem this doc solves.

## The design: seed on load, record on send

Two sources, each covering a different scenario:

| Scenario | Covered by |
|---|---|
| Open an old chat → send (correct gap on the **first** message) | **seed** from the history API on navigate |
| Idle on a chat → send, or a long gap after chatting | **record** on each send + the seed |
| Same chat in two tabs | shared `chrome.storage.local` + `onChanged` |
| Brand-new chat (no history) | neither → `[TimeContext: <now>]` only, no gap |

- **Seed** (`onNavigate`): on entering `/c/<id>`, fetch the conversation history,
  take the largest `create_time`, cache it. Authoritative — knows the real last
  message even for a chat we've never sent in this session.
- **Record** (`recordSend`): the Enter/click interceptor stamps `now` after each
  send. Cheap, no API. For live sends, wall-clock `now` vs the server's
  `create_time` differ by seconds — irrelevant against a 30-min threshold.

`buildPrefix` reads the cached value synchronously at send time and computes
`now − last`. Nothing tracks idle time as it passes; the gap falls out of that
subtraction the moment you send.

## Why not monitor `/backend-api/f/conversation`?

That endpoint (the send round-trip) *does* carry `create_time` in its response
body — but we can't read that body from where our code runs:

- **Content script** runs in an **isolated world**: it shares the DOM but has its
  own `window`/`fetch`, so it cannot observe the page's own fetch calls or
  responses. (Security boundary — extensions can't spy on page JS.)
- **`background.js` / `webRequest`** can see the request happened and when, but
  **MV3 removed response-body access**. So it yields wall-clock timing at best —
  no `create_time`.

Reading that body would require **MAIN-world injection** (a page-context script
patching `fetch`), which we rejected as disproportionate.

The seed avoids all of it: instead of intercepting the page's request, the
content script issues **its own** same-origin request to the history endpoint —
allowed from the isolated world, no interception needed.

## Endpoints (undocumented — last verified 2026-07-24)

Both are ChatGPT internal API. Neither is public or stable.

```
GET /api/auth/session                      → { accessToken, ... }
GET /backend-api/conversation/<id>         (Authorization: Bearer <accessToken>)
    → { mapping: { <nodeId>: { message: { create_time: <unix seconds>, ... } } } }
```

`create_time` is in **seconds** — multiply by 1000 for JS ms. We take the max
across all `mapping[*].message.create_time`. `<id>` comes from the URL
(`/c/<id>`); the token is cached in memory for the session.

**Fragility:** an obfuscated internal API + a bearer token that ChatGPT can
rotate or gate on any deploy. The adapter is best-effort — any failure (no token,
non-200, parse error) logs `[ACB] MessageTimer(chatgpt): seed failed` and leaves
the cached/absent value in place. Worst case it degrades to record-only, which
still handles idle-then-send; only the first-message gap of a never-recorded chat
is lost.

## Storage

`chatgptLastMessageAt` in `chrome.storage.local` — `{ convId → epoch ms }`.

- **Persistent:** survives reloads, browser and system restarts (it's on disk),
  and extension updates. Only uninstall or explicit clear wipes it.
- **Device-local, not synced** — a last-message time is only meaningful where the
  activity happened. (Settings like `claudeTimerEnabled` use `storage.sync` instead.)
- **No TTL, unbounded growth** — one entry per conversation, never pruned. Tiny
  (a number each), but a size cap in `_set()` (drop entries older than N days)
  is a clean follow-up if it ever matters.

The in-memory `_cache` mirrors this key and is re-hydrated from disk by `init()`
on each load; `onChanged` keeps it in sync across tabs.

## Edge cases

- **New chat** (`/`, no id, or no history) → no last time → timestamp-only line,
  same as Claude's no-prior behavior.
- **Regenerate / edit-resend** aren't caught by our send interceptor, so the
  stored time can go briefly stale — but it **self-heals**: navigating back into
  the conversation re-seeds the authoritative time from history.
- **Empty composer** → `hasInputText` guard skips injection and recording.

## Decision log

1. **Self-record only (no seed) — rejected.** Simple and dependency-free, but
   can't show the gap on the first message of a chat we've never sent in (old
   chats, other devices, pre-install). The seed exists solely to fix that row.
2. **Monitor `f/conversation` — rejected.** The authoritative `create_time` is in
   its response body, unreadable from the isolated world without MAIN-world
   injection; `webRequest` can't read bodies in MV3. Not worth the machinery.
3. **`background.js` stamping on completion — considered, dropped.** Would catch
   regenerate/edit sends, but those self-heal on re-seed, so it was complexity for
   an edge case. `background.js` stays untouched.
4. **Chosen: seed (authoritative, on load) + record (cheap, on send).** Each
   covers a scenario the other can't, with no MAIN-world injection.
