# User Stories

User-facing features, planned or proposed. Structural work lives in
[tech-backlog.md](tech-backlog.md); what's already built per provider is in
[provider-features.md](provider-features.md).

---

## Send selected text to AI, from any page

> As someone reading anything on the web, I want to select text, right-click,
> and send it to my AI of choice — so I'm not limited to the handful of sites
> the extension has explicit support for.

**Status:** proposed · **Size:** small · **Value:** high

Today every source needs its own implementation — `reddit.js` is 297 lines,
`medium.js` is 331, each carrying selectors that break when the site redesigns.
A selection-based context menu works everywhere with no per-site code, which
turns the supported-sites list from "Reddit and Medium" into "anywhere".

### Behaviour

Right-click with text selected → **Send to AI** → submenu:

```
Send to AI  ▸  Claude
               ChatGPT
               Gemini
               ─────────
               Copy for AI
```

Later: prompt templates alongside the destinations (send as-is, summarize,
explain), configurable by the user.

### Design constraints

**Use `activeTab`, not `<all_urls>`.** "Works on any page" instinctively
suggests requesting host permissions for every site — which changes the install
prompt to the "read all your data on all websites" warning and slows Web Store
review. `activeTab` grants the same access but only on user gesture, and a
context-menu click qualifies. Design for this from the start; retrofitting it is
painful.

**Don't use `info.selectionText`.** Chrome truncates it. The exact limit needs
verifying, but it's short enough to matter for the multi-paragraph selections
this feature exists to serve. Read `window.getSelection()` from the page
instead — which also leaves open the option of preserving structure rather than
flattening to text.

**Reuse the existing pipeline.** Selected text should still flow through
`ContentDocument` → budget → formatter, so trimming and prompt-wrapping behave
the same as a Reddit thread does.

### Requires

`contextMenus` permission, menu registration in `background.js`, and the
destination registry from [tech-backlog.md](tech-backlog.md) — otherwise the
submenu hardcodes destinations for a third time.

---

## Gemini as a destination

> As a Gemini user, I want to send content there like I can to Claude and
> ChatGPT.

**Status:** proposed · **Size:** ~half a day · **Value:** medium

Gemini has no native URL prefill, so this needs a content script that injects
into the composer. The technique is known — see the Gemini notes in
[provider-features.md](provider-features.md) for the Quill editor structure,
the `input`/`change` events required, and which selectors are the fragile ones.

Payload should go via `chrome.storage.local` rather than the URL, avoiding
length limits on long threads. That's worth adopting for Claude and ChatGPT too.

---

## Continue with a specific topic

> As someone with a long ChatGPT conversation, I want to pick one thread of it
> to continue elsewhere, rather than sending a summary of everything.

**Status:** proposed · **Size:** medium · **Value:** medium

Previously listed as "Coming Soon" in the ChatGPT floating button and removed to
keep that menu to two actions. Re-add to the dropdown when built.

---

## Bookmark this context

> As someone mid-conversation, I want to save the current context for later
> instead of immediately opening another AI.

**Status:** proposed · **Size:** medium · **Value:** unclear

Also pulled from the floating button's "Coming Soon". Needs a storage model and
somewhere to browse saved contexts — likely a popup section — so it's larger
than it first appears. Worth confirming the need before building.

---

## Send local documents to AI

> As someone with a PDF, Word doc or spreadsheet, I want to send its contents to
> an AI without copy-pasting.

**Status:** proposed · **Size:** large · **Value:** high · **Blocked**

Extends "bridge any content to AI" beyond web pages. Would use
[MarkItDown](https://github.com/microsoft/markitdown) to convert PDF, DOCX,
XLSX, PPTX, images (OCR), audio (transcription), CSV, EPUB and more to Markdown,
then hand off through the existing `openWithContext()` flow.

**Blocker:** MarkItDown is a Python library and cannot run in a Chrome
extension. Two options were considered — a local companion server the extension
calls over `localhost`, or a Native Messaging host. The companion server was
preferred for simpler UX and easier debugging, with the popup showing upload UI
only when the server is detected.

Either way it requires the user to install and run something outside the
browser, which is a significant adoption cost. Decide whether that's acceptable
before starting.
