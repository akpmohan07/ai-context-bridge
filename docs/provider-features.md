# Provider Feature Matrix

**Legend** — ✅ built · ⚠️ partial · ❌ not built

| Feature | Claude | ChatGPT | Gemini |
|---|:--:|:--:|:--:|
| **Destination — receiving context** | | | |
| Open with pre-filled context | ✅ | ✅ | ✅ |
| Auto-send on arrival | ✅ | ✅ | ✅ |
| Model selection per handoff | ✅ `?model=` | ❌ | ❌ |
| Live model catalog | ✅ 24h cache | ❌ | ❌ |
| **Source — sending context out** | | | |
| Injected UI on the platform | ✅ auto-send only | ✅ floating button | ❌ |
| Extract conversation | ❌ | ⚠️ via self-summarize | ❌ |
| Summarize & continue elsewhere | ❌ | ✅ | ❌ |
| Second opinion → another provider | ❌ | ✅ | ❌ |
| **On-platform enhancements** | | | |
| Ambient sounds | ✅ | ❌ | ❌ |
| Time awareness on send | ✅ DOM timestamps | ✅ self-seeded | ✅ record-only |

---

## Notes

**ChatGPT's extraction is ⚠️, not ✅.** It doesn't implement the base class's
`extractConversation()`. Instead `summarizeAndContinue()` edits the last user
message with a summarize prompt, `background.js` watches the
`/backend-api/f/conversation` request via `webRequest`, and
`handleConversationCompleted()` forwards the reply. ChatGPT summarizes itself
rather than us scraping its DOM — which is why the hook is still unimplemented.

**All three destinations use one handoff mechanism** (`AIPlatform` in
`src/ai-platforms/base.js`): `openWithContext()` stashes the text in
`chrome.storage.local` and opens a bare new-chat tab; the destination's own
content script runs `receiveHandoff()`, which polls for the stash, types it into
the composer (`execCommand('insertText')`, or `.value` + `input` for ChatGPT's
logged-out `<textarea>`) and clicks send. Nothing rides the URL — a 4000-word
thread is a 40k-char `?q=` and the server 414s / 400s it. A subclass supplies
only selectors + its new-chat path; Claude adds `?model=` to that path.

**Ambient sounds are claude.ai-only by construction** — built against
Claude-specific DOM and audio state; no cross-platform abstraction.

**Time awareness now runs on all three platforms**, via a per-platform adapter
in `MessageTimer` (`src/time/message-timer.js`). The shared core (formatting,
threshold, send interception) is one implementation; each platform only answers
"when was the last message?" differently. Claude reads the per-message
timestamps it renders in the DOM. ChatGPT renders none, so it **seeds** the
authoritative time from its conversation-history API on load, then updates on
each send ([platforms/chatgpt/time-context.md](platforms/chatgpt/time-context.md)).
Gemini renders none *and* has no clean history API (only the obfuscated
`batchexecute` RPC), so it's **record-only** — stamped on each send, no seed.
The one cost: the first send in a chat created on another device shows a bare
timestamp instead of the gap, then self-heals
([platforms/gemini/time-context.md](platforms/gemini/time-context.md)).

Handoff mechanism + decision log:
[platforms/gemini/context-handoff.md](platforms/gemini/context-handoff.md)
(named for Gemini, where the URL limit forced the design; it now applies to all
three).

Grok, Copilot and DeepSeek would each need a content script matching their host
so `receiveHandoff()` can run there — plus their composer + send selectors.

**Adding a URL-prefill provider is now one registry entry + one manifest line.**
The destination list used to be hardcoded in five places with a fixed
`openInClaude`/`openInChatGPT`/`copyForAI` vocabulary; that's been replaced by
`src/ai-platforms/registry.js`, which content sources iterate. Gemini was the
third provider and the trigger for that refactor — it landed with Gemini, as
planned. Non-prefill providers still cost more (they need the content script).
