# Docs Manifest

Design notes and feature history for AI Context Bridge. Architecture and setup
live in the root [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) —
these are the longer-form notes that don't belong in either.

| Doc | What it is | Status |
|---|---|---|
| [user-stories.md](user-stories.md) | User-facing features proposed but not built — context-menu selection, Gemini, local documents | Open |
| [provider-features.md](provider-features.md) | What each AI provider supports — destination, source, and on-platform features across Claude, ChatGPT and Gemini | Living |
| [tech-backlog.md](tech-backlog.md) | Structural work discussed and deliberately deferred — storage key naming/migration (open), and the multi-provider destination registry (shipped with Gemini) | Storage open, registry done |
| [platforms/](platforms/README.md) | Per-platform deep-dives — one folder per AI destination, feature-level notes and decision logs | Living |
| ↳ [gemini/context-handoff.md](platforms/gemini/context-handoff.md) | Gemini handoff — the `?prompt=` short path, the 400 on large content, and the adaptive file-attachment design for big threads/articles | Short path shipped, large path designed (not built) |
| ↳ [claude/model-preference.md](platforms/claude/model-preference.md) | Claude model selection — `&model=` on handoff, the model catalog cache, and the account-default PATCH that was built then removed | Read path shipped, write path removed (archived here) |
| [reddit-requirements-prompt.md](reddit-requirements-prompt.md) | Original requirements brief for the Reddit → AI feature, written before implementation | Shipped |

## What belongs here

- **Removed code worth keeping.** If working code is deleted rather than
  committed, it gets archived in a doc with the reasoning.
  `platforms/claude/model-preference.md` is the only copy of the PATCH
  implementation.
- **Undocumented endpoints and their response shapes**, with the date last
  verified. These break silently and are expensive to re-derive.
- **Decision logs** — especially reversals, so an approach that was evaluated
  and rejected isn't re-proposed later.
- **Deferred work with its trigger condition** — what to do, why it's not done
  yet, and what should cause it to be picked up.

Not here: how to install, load, or reload the extension (root `README.md`), or
the module/extension-point structure (`CLAUDE.md`).
