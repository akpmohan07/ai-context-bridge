# Docs Manifest

Design notes and feature history for AI Context Bridge. Architecture and setup
live in the root [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) —
these are the longer-form notes that don't belong in either.

| Doc | What it is | Status |
|---|---|---|
| [model-preference.md](model-preference.md) | Claude model selection — `&model=` on handoff, the model catalog cache, and the account-default PATCH that was built then removed | Read path shipped, write path removed (archived here) |
| [reddit-requirements-prompt.md](reddit-requirements-prompt.md) | Original requirements brief for the Reddit → AI feature, written before implementation | Shipped |

## What belongs here

- **Removed code worth keeping.** If working code is deleted rather than
  committed, it gets archived in a doc with the reasoning. `model-preference.md`
  is the only copy of the PATCH implementation.
- **Undocumented endpoints and their response shapes**, with the date last
  verified. These break silently and are expensive to re-derive.
- **Decision logs** — especially reversals, so an approach that was evaluated
  and rejected isn't re-proposed later.

Not here: how to install, load, or reload the extension (root `README.md`), or
the module/extension-point structure (`CLAUDE.md`).
