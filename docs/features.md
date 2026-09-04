# Features

Full feature catalog. See [CLAUDE.md](../CLAUDE.md) for architecture,
[README.md](../README.md) for the user-facing summary.

## Shipped

| Feature | Source | AI Platform | Type |
|---|---|---|---|
| Reddit thread → Claude | Reddit | Claude | Feature |
| Reddit thread → ChatGPT | Reddit | ChatGPT | Feature |
| Reddit thread → Gemini | Reddit | Gemini | Feature |
| Reddit thread → Clipboard | Reddit | N/A | Feature |
| Medium article → Claude | Medium | Claude | Feature |
| Medium article → ChatGPT | Medium | ChatGPT | Feature |
| Medium article → Gemini | Medium | Gemini | Feature |
| Medium article → Clipboard | Medium | N/A | Feature |
| ChatGPT: Summarize and Continue | ChatGPT | ChatGPT | Feature |
| ChatGPT: Get Claude's Opinion | ChatGPT | Claude | Feature |
| ChatGPT: Time Awareness | ChatGPT | N/A | Feature |
| Claude: auto-send from URL prefill | N/A | Claude | Feature |
| Claude: Time Awareness | N/A | Claude | Feature |
| Claude: Presence (ambient sound) | N/A | Claude | Feature |
| Claude: Default Model preference | N/A | Claude | Feature |
| Popup: feature toggles | Core | N/A | Feature |
| Core content pipeline (schema/budget/formatter) | Core | N/A | Feature |

## Test infrastructure (shipped)

| Item | Source | AI Platform | Type |
|---|---|---|---|
| Vitest unit suite (L1, 50 tests) | Testing | N/A | Test |
| Playwright E2E scaffold | Testing | N/A | Test |
| Medium E2E (3 destinations) | Testing | N/A | Test |
| ChatGPT E2E (guest mode) | Testing | N/A | Test |
| CI wiring | Testing | N/A | Test |
| Claude E2E: auto-send + Time Awareness | N/A | Claude | Test |
| Claude E2E: Presence state machine | N/A | Claude | Test |
| Claude E2E: settings toggles | N/A | Claude | Test |

## Planned / open

Tracked as [GitHub Issues](https://github.com/akpmohan07/ai-context-bridge/issues)
on the [Project board](https://github.com/users/akpmohan07/projects/5) —
not duplicated here to avoid two sources of truth for in-flight work.
