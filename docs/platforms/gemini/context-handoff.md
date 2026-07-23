# Gemini — Context Handoff

How content reaches Gemini, why the simple path isn't enough on its own, and
the adaptive design that covers large content. Decision log + deferred work.

## What ships today

`GeminiPlatform.openWithContext()` opens `gemini.google.com/app?prompt=<text>`.
Gemini *does* have a native prefill param (`?prompt=`) — unlike our earlier
assumption that it had none — so short content works with zero injection, the
same ~10-line shape as Claude/ChatGPT.

**Known gap:** large content breaks it. A Medium article or a big Reddit thread
formatted to ~4000 words becomes a 20,000+ character URL, and Google's server
rejects it:

```
400. That's an error.
Your client has issued a malformed or illegal request.
```

It errors rather than truncating — at least it fails loudly instead of silently
dropping content. Reddit worked in early testing only because that thread was
short enough to stay under the URL limit.

## The adaptive design (agreed, not yet built)

Don't throw away the working short path — pick the mechanism by size:

| Content size | Path | Injection |
|---|---|---|
| Short (≤ ~6k chars) | `?prompt=` URL | none — already works |
| Large | file attachment via content script | yes |

`openWithContext()` measures the text and routes: short content keeps the
dead-simple URL, only large content pays for the content script.

## The large path: attach as a text file, don't type

For big content, **attach it as a `.txt` file** rather than typing it into the
composer. Rationale:

- A 4000-word document reads better to Gemini as an attachment than as a wall of
  pasted text.
- Avoids Quill's finicky input handling — the composer is a Quill editor
  (`div.ql-editor`) that ignores a plain `.textContent =` and only updates its
  model when you set text *and* dispatch `input`/`change`.
- No length limit on file contents.

Mechanism:

```
gemini.js:   chrome.storage.local.set({ pendingGeminiPrompt: text });  open /app
             (no ?prompt= — nothing in the URL)

gemini-content-script.js  (new, matches https://gemini.google.com/*):
   read + clear pendingGeminiPrompt
   → build a File:  new File([text], 'context.txt', { type: 'text/plain' })
   → assign it to Gemini's <input type="file"> via a DataTransfer
   → dispatch 'change'
   → type a short instruction in the composer ("Here's a Reddit thread, see
     attached — summarize then let's discuss")
   → poll the send button, click
```

The handoff goes through `chrome.storage.local`, not the URL — that's the whole
point, no length limit. Payload is consumed once (cleared on read) so a later
manual Gemini visit doesn't re-inject stale content. This mirrors
`ClaudePlatform.injectUI()`, which polls the composer to auto-send on arrival.

## Fallback if file attach doesn't work

If Gemini rejects a programmatically-attached file, fall back to **composer
typing** on the large path: set `.ql-editor` text + dispatch `input`/`change`,
then send. Less pleasant for large content but a known technique.

## What must be verified live before building

The large path is unbuilt because two things need confirming on the live site,
and getting either wrong is a silent no-op:

1. **File input accepts programmatic files.** Setting `input.files` via
   `DataTransfer` + firing `change` works on many sites, but some apps intercept
   uploads their own way and ignore a programmatically-set input. Unconfirmed for
   Gemini — this is the make-or-break for the file-attachment path.
2. **Selectors:** the file `<input>`, the composer (`div.ql-editor` believed),
   and the **send button** (unknown). All fragile, all break when Gemini's UI
   shifts.

Step 1 of building this is a browser probe to nail those down.

## Permissions / manifest

No new permissions — `storage` is already granted, and a statically-declared
content script can touch its own page's DOM without `host_permissions`. Building
the large path adds one `content_scripts` entry to `manifest.json` matching
`https://gemini.google.com/*`.

## Related

- `docs/provider-features.md` — the Gemini rows there predate the `?prompt=`
  discovery and the 400; they're stale and need updating.
- `docs/user-stories.md` "Gemini as a destination" — says "no native URL
  prefill", which is now wrong (it has `?prompt=`, just length-limited).
- `docs/platforms/claude/model-preference.md` — same doc style: a mechanism
  worked through, with the reasoning kept so it isn't re-derived.
