# Provider Feature Matrix

**Legend** — ✅ built · ⚠️ partial · ❌ not built

| Feature | Claude | ChatGPT | Gemini |
|---|:--:|:--:|:--:|
| **Destination — receiving context** | | | |
| Open with pre-filled context | ✅ `claude.ai/new?q=` | ✅ `chatgpt.com/?q=` | ❌ no prefill param |
| Auto-send on arrival | ✅ | ❌ | ❌ |
| Model selection per handoff | ✅ `&model=` | ❌ | ❌ |
| Live model catalog | ✅ 24h cache | ❌ | ❌ |
| **Source — sending context out** | | | |
| Injected UI on the platform | ✅ auto-send only | ✅ floating button | ❌ |
| Extract conversation | ❌ | ⚠️ via self-summarize | ❌ |
| Summarize & continue elsewhere | ❌ | ✅ | ❌ |
| Second opinion → another provider | ❌ | ✅ | ❌ |
| **On-platform enhancements** | | | |
| Ambient sounds | ✅ | ❌ | ❌ |
| Time awareness on send | ✅ | ❌ | ❌ |

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

**The enhancements are claude.ai-only by construction.** Both were built against
Claude-specific DOM: `button[aria-label="Send message"]`,
`div[contenteditable="true"][data-testid="chat-input"]`, and timestamps read from
the React fiber. Porting either means redoing that selector work per platform;
there's no shared abstraction for it.

**Gemini is blocked on URL prefill.** Claude, ChatGPT and (believed) Perplexity
accept a `?q=` style param, making them ~30 lines each. Gemini, Grok, Copilot and
DeepSeek have no documented equivalent, so each needs the
`ClaudePlatform.injectUI()` treatment — content script, handoff, poll for the
composer, synthetic send — which breaks whenever their UI shifts.

Two things to verify before committing to Gemini:

1. Whether a prefill mechanism exists at all. This is assumed from general
   knowledge, not tested — worth ten minutes with a hand-built URL first.
2. Whether long URLs survive. A 4000-word Reddit thread makes a very long `?q=`.
   Claude tolerates it; nothing confirms the others don't truncate silently,
   which would lose content with no error.

**Adding a provider costs 8 touch points today** — the destination list is
hardcoded in five places and the action interface (`openInClaude`,
`openInChatGPT`, `copyForAI`) is a fixed vocabulary. See the destination registry
entry in [tech-backlog.md](tech-backlog.md); that refactor should land before the
third provider, not after.
