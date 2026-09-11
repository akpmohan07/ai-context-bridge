# Platform Deep-Dives

One folder per AI destination platform. Each holds the detailed, feature-level
notes for that platform — the things too specific for the cross-platform
[`../provider-features.md`](../provider-features.md) matrix or the root
`ARCHITECTURE.md`.

```
platforms/
  claude/
    model-preference.md      how model selection works on the handoff
  gemini/
    context-handoff.md       how content gets into Gemini (URL vs file upload)
```

## The convention

- **Folder = platform** (`claude/`, `gemini/`, later `chatgpt/`).
- **File = a specific feature or mechanism**, named for the feature — not the
  platform (the folder already says that). So `context-handoff.md`, not
  `gemini.md`. This leaves room for a platform to grow several docs
  (`gemini/extraction.md`, `claude/presence.md`) without renaming.
- Same spirit as the rest of [`../`](../Manifest.md): decision logs, undocumented
  endpoints with a last-verified date, and deferred work with its trigger.

## Adding a platform

Create `platforms/<name>/`, drop in a feature doc, and add a row to
[`../Manifest.md`](../Manifest.md). Keep the cross-platform status in
[`../provider-features.md`](../provider-features.md) in sync.
