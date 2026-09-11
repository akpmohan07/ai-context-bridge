# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] - 2026-09-11: first release of the WXT rewrite

A full rewrite onto [WXT](https://wxt.dev), built for feature parity and stability across all three destinations rather than new features. See [`docs/key-engineering-decisions/`](docs/key-engineering-decisions/) for write-ups of the harder problems this cycle solved.

### Added
- **Gemini support** across the board: Reddit/Medium → Gemini handoff, and Gemini Time Awareness (record-only, see [ADR-2](docs/key-engineering-decisions/ADR-2-platform-api-timing.md)).
- **Per-platform, per-feature settings**: Time Awareness, Ambient Sounds, the ChatGPT Assistant Button, and each source can now be toggled independently, replacing one global switch.
- Popup redesigned: tinted per-platform section bands, Sources grouped last, and the section for whatever site you're currently on surfaces first.
- `CHANGELOG.md` and `docs/key-engineering-decisions/` (5 ADRs).
- A `release` GitHub Actions workflow wired to `wxt submit`, submitting to **Chrome Web Store, Edge Add-ons, and Firefox Add-ons (AMO)** all in one command.
- New scripts: `npm run submit`, `npm run submit:init`, `npm run zip:firefox`.

### Changed
- **Content handoff rebuilt**: content now travels through `chrome.storage.local` with a one-time id in the URL fragment instead of a `?q=`/`?prompt=` query string (see [ADR-1](docs/key-engineering-decisions/ADR-1-handoff-transport.md)).
- Fixes an `HTTP 414` on large Reddit/Medium threads and a cross-tab payload collision.
- Reddit extraction reads the rendered `<shreddit-post>`/`<shreddit-comment>` DOM instead of the `.json` API, which had become 403/throttled for anonymous requests.
- Composer injection unified across Claude (contenteditable), Gemini (Quill), and ChatGPT's logged-out React `<textarea>`: one code path, one poll/retry loop (see [ADR-5](docs/key-engineering-decisions/ADR-5-composer-injection.md)).
- Entire codebase migrated to WXT (`entrypoints/` + `src/**`); `manifest.json` is now generated, not hand-edited.

### Fixed
- Sub-minute gaps in Time Awareness no longer render `0 min since last message`.
- A brand-new chat's second message no longer misreads as "no prior message" (the send timestamp now carries over to the just-assigned conversation id).
- Claude's "use caution, this may have been AI-generated" interstitial no longer stalls a handoff: the composer poll extended to ~15s with a focus requirement.

### Testing
- 77 unit tests (up from ~50), functional-core/imperative-shell split.
- Two-tier E2E: a CI-gating tier with no login, and a "connected" tier (`connectOverCDP` into a real, signed-in Chrome) for Reddit and each platform's authenticated flows (see [ADR-3](docs/key-engineering-decisions/ADR-3-testing-strategy.md)).

[Unreleased]: https://github.com/akpmohan07/ai-context-bridge/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/akpmohan07/ai-context-bridge/releases/tag/v2.0.0
