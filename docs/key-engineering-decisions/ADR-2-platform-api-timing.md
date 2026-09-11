# 2. Reverse-engineering each platform's private API for message timing

**Source:** [`src/time/message-timer.js`](../../src/time/message-timer.js) ·
[`src/time/time-logic.js`](../../src/time/time-logic.js)

---

## Context

"Time Awareness" prepends a line like

```
[TimeContext: Thursday, June 4, 2026 at 01:23 AM | 5 days 1h since last message]
```

when it's the first message of a chat or there's been a 30+ minute gap — so the
model knows how long you've been away. That needs the wall-clock time of your
*last* message in this conversation, and the rendered DOM doesn't give that up
reliably: Claude's visible timestamps are ambiguous across days ("01:08" reads as
today; "29 May" loses the time entirely), and ChatGPT and Gemini render no
per-message timestamp at all.

Each platform also exposes a different, undocumented way to get the real value:

- **Claude** — a same-origin, cookie-authenticated conversation endpoint.
- **ChatGPT** — a `backend-api` endpoint that needs a bearer token, obtainable
  from `/api/auth/session`.
- **Gemini** — nothing clean. The only history mechanism is the obfuscated
  `batchexecute` RPC Google's own web client uses internally — undocumented,
  brittle to call from a content script, and likely to break on any of Google's
  frequent deploys.

## The fix

One shared, storage-backed store — seed the authoritative time from the API on
navigating into a chat, record "now" on every send, cache per-conversation:

```js
function seededTimeStore({ storageKey, convId, fetchLastTime }) {
  let cache = {};       // convId → epoch ms
  let pendingSend = null;

  return {
    async onNavigate() {
      const id = convId();
      if (!id) return;
      if (pendingSend && !cache[id]) set(id, pendingSend);
      pendingSend = null;
      const ms = await fetchLastTime(id);
      if (ms) set(id, ms);
    },
    recordSend() {
      const id = convId();
      if (id) set(id, Date.now());
      else pendingSend = Date.now();  // new chat — no id yet
    },
    getLastMessageTime() { /* … */ },
  };
}
```

A thin per-platform adapter supplies only `convId()` (regex on the URL) and
`fetchLastTime(id)`:

```js
// Claude — cookie-authed, same-origin.
async function fetchClaudeLastTime(uuid) {
  const orgId = document.cookie.match(/(?:^|; )lastActiveOrg=([^;]+)/)?.[1];
  const res = await fetch(`/api/organizations/${orgId}/chat_conversations/${uuid}?...`,
    { credentials: 'include' });
  return res.ok ? parseClaudeLastTime(await res.json()) : null;
}

// ChatGPT — needs a bearer token, fetched once and cached.
async function fetchChatgptLastTime(id) {
  _chatgptToken ??= (await (await fetch('/api/auth/session')).json()).accessToken;
  const res = await fetch(`/backend-api/conversation/${id}`,
    { headers: { Authorization: 'Bearer ' + _chatgptToken } });
  return res.ok ? parseChatgptLastTime(await res.json()) : null;
}

// Gemini — no reliable seed source. Record-only, by design.
async function fetchGeminiLastTime() { return null; }
```

Gemini's adapter deliberately returns `null` instead of reaching for
`batchexecute`. The store still works — it's stamped on every send — it just has
no seed to backfill from on arrival.

## Result

One feature, three platforms, one shared correctness surface
(`buildPrefix`/`formatElapsed` in `time-logic.js` are pure functions, unit-tested
without touching a network or a DOM). The cost is isolated to Gemini: the first
message sent in a chat that was *started on another device* shows a bare
`[TimeContext: <now>]` instead of the real gap, because there's nothing to seed
from. It self-heals on the very next send in that chat, since `recordSend()`
doesn't need the API at all.

## Note — the new-chat bug

A send from `claude.ai/new` has no conversation id yet — the platform assigns one
only *after* the first message lands (`/new` → `/chat/<id>`). Early on,
`recordSend()` had nowhere to file that timestamp, so it was dropped — and the
*second* message in a brand-new chat misread as "no prior message," showing
`[TimeContext: <now>]` again instead of "1 min since last message." Fixed with
the `pendingSend` slot above: the send time is held in memory and filed against
the real id the moment `onNavigate()` fires for the freshly created chat.
