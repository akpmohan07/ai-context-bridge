# 1. Backend-less handoff — content in storage, a one-time token in the URL fragment

**Source:** [`src/ai-platforms/base.js`](../../src/ai-platforms/base.js) ·
[`src/ai-platforms/claude.js`](../../src/ai-platforms/claude.js)

---

## Context

The extension's core job: take a Reddit thread — post plus top comments, up to a
4,000-word budget — and open a new Claude chat with that text already sent. No
server in the middle.

The first version did the obvious thing:

```
https://claude.ai/new?q=<the entire thread, URL-encoded>
```

A 4,000-word thread URL-encodes to ~40,000 characters. Result:

```
HTTP ERROR 414 — URI Too Long
```

Cloudflare (in front of claude.ai) caps the request line around 8 KB; ChatGPT's
edge returns `400` for the same reason. Shortening the content defeats the
feature.

A second bug came from the fix's first draft: content was parked in
`chrome.storage.local` under one fixed key while the tab opened. Any open Claude
tab reading that key would consume it — users saw a stale test prompt
(*"What is 4 + 4?"*) pasted into a real chat.

## The fix: fragment for routing, storage for payload

The **URL fragment** (`#...`) is never sent to the server — the browser strips it
before the request goes out. So it can carry a routing token for free, while the
actual payload sits in extension storage with no size limit.

**Sending side**, in the click handler:

```js
async openWithContext(text) {
  const id = crypto.randomUUID();
  // window.open first, synchronously in the gesture — an await before it
  // (the storage write) can get the popup blocked.
  window.open(`${await this.newChatUrl()}#acb=${id}`, '_blank');
  await chrome.storage.local.set({
    [HANDOFF_PREFIX + id]: { text, ts: Date.now() },
  });
}
```

**Arrival side**, in the destination tab's own content script:

```js
async receiveHandoff() {
  const id = new URLSearchParams(location.hash.slice(1)).get('acb');
  if (!id) return;
  const text = await this._takeHandoff(HANDOFF_PREFIX + id);
  if (!text) return;
  this._fillComposerAndSend(text);
}

async _takeHandoff(key) {
  for (let i = 0; i < 15; i++) {                // ~3s: tab opens before the write lands
    const stored = await chrome.storage.local.get(key);
    const pending = stored[key];
    if (pending) {
      await chrome.storage.local.remove(key);   // consume once
      return Date.now() - pending.ts < HANDOFF_TTL_MS ? pending.text : null;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
```

Three guards, one bug each:
- **Per-handoff id** (`handoff:<uuid>` ↔ `#acb=<uuid>`) — a tab reads only its
  own handoff. Fixes the wrong-prompt bug.
- **Consume once** — a reload doesn't re-fire it.
- **60s TTL** — a tab closed mid-handoff leaves an orphaned key that's ignored
  rather than fired hours later.

Short, bounded metadata can still ride the URL — `ClaudePlatform.newChatUrl()`
appends `?model=<id>`. Only the unbounded content moves to storage.

## Result

Payload size is now bounded by `chrome.storage.local`'s ~5 MB quota, not a
request-line limit — three orders of magnitude past the 4,000-word budget. The
wrong-tab bug is gone by construction, not by luck. Still zero backend.

Trade-off: `_takeHandoff`'s poll is a race workaround (the tab opens before the
write lands), and `_fillComposerAndSend` depends on the destination's content
script actually running — if the DOM has changed or the user isn't logged in, it
gives up silently after ~15s with only a console warning.

## Note

The wrong-prompt symptom looked like a caching bug in the composer code. It
wasn't — both halves (write a key, read the key) were individually correct. The
bug was that neither side knew *whose* key it was. The fix isn't more code; it's
giving the payload an address.
