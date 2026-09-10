# Provider Feature Matrix

**Legend** — ✅ built · ⚠️ partial · ❌ not built

| Feature | Claude | ChatGPT | Gemini |
|---|:--:|:--:|:--:|
| **Destination — receiving context** | | | |
| Open with pre-filled context | ✅ `claude.ai/new?q=` | ✅ `chatgpt.com/?q=` | ✅ `storage.local` + composer insert |
| Auto-send on arrival | ✅ | ❌ | ✅ |
| Model selection per handoff | ✅ `&model=` | ❌ | ❌ |
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

**Claude's injected UI is destination-side**, not extraction — it polls for the
composer on arrival to auto-send a pre-filled `?q=`.

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

**Gemini handoff goes through `chrome.storage.local` + the composer, not the
URL.** Gemini's native `?prompt=` param 400s on large content (a ~4000-word
article is a 20k+ char URL) and never auto-sends. So `openWithContext()` stashes
the text in `storage.local` and opens a bare `/app`; `gemini.content.js` →
`GeminiPlatform.injectUI()` inserts it into the `.ql-editor` via
`execCommand('insertText')` and clicks send — one path for any size, auto-sends,
mirroring `ClaudePlatform.injectUI()`. See
[platforms/gemini/context-handoff.md](platforms/gemini/context-handoff.md).

Grok, Copilot and DeepSeek still have no confirmed prefill param and would each
need the `ClaudePlatform.injectUI()` treatment — content script, handoff, poll
for the composer, synthetic send — which breaks whenever their UI shifts.

**Adding a URL-prefill provider is now one registry entry + one manifest line.**
The destination list used to be hardcoded in five places with a fixed
`openInClaude`/`openInChatGPT`/`copyForAI` vocabulary; that's been replaced by
`src/ai-platforms/registry.js`, which content sources iterate. Gemini was the
third provider and the trigger for that refactor — it landed with Gemini, as
planned. Non-prefill providers still cost more (they need the content script).
