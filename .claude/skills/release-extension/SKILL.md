---
name: release-extension
description: Use when the user asks to "cut a release", "ship v<X.Y.Z>", "release the extension", "prepare a release", or asks what's left before publishing to the Chrome Web Store / Edge Add-ons. Runs the full release pipeline for this repo — readiness gate, versioning, docs/showcase, changelog, tag, build+submit, post-release — as a sequence of checkpointed phases, not a single leap to "done".
---

# Releasing AI Context Bridge

A release here is a pipeline, not a commit. Each phase below has a clear exit
condition; don't start a phase until the previous one's condition is met, and
don't silently skip a phase — if something doesn't apply, say so explicitly
and move on.

Two phases are **hard stops that need the user's explicit go-ahead**, never a
judgment call: merging into `main` (Phase 2) and the real store submission
(Phase 6, after the dry run). Everything else can proceed once its exit
condition is met, per this project's normal working style.

## Phase 0 — Scope

Figure out (or ask) what's actually shipping: skim `git log --oneline
<last-tag>..HEAD` and the closed issues since the last release. Decide the
semver bump from that — a rewrite or a breaking change to stored settings is
`major`; new platform/feature support is `minor`; fixes only are `patch`. Say
the version number out loud before touching anything, so a wrong guess gets
caught immediately.

## Phase 1 — Readiness gate

Two tiers, and they gate differently — don't conflate them:

| Tier | Command | Gates the release? |
|---|---|---|
| Unit | `npm test` | Yes — must be 100% green |
| CI-tier E2E (no login) | `npm run test:e2e` | Yes — must be 100% green |
| Connected-tier E2E (real login, `e2e:connect`) | `npm run test:e2e:local` | **No** — pre-release spot check. Run it, note the result, don't block on a flake caused by the shared browser profile or a platform's own rate limit (see `docs/key-engineering-decisions/ADR-3-testing-strategy.md`). |

Also check `gh issue list --state open` for anything that reads as a release
blocker (a known-broken user-facing flow, not a backlog idea). If one exists,
surface it before continuing — don't decide unilaterally to ship past it.

**Exit condition:** unit + CI-tier E2E green, connected-tier spot-checked and
its state noted, no unflagged blocker issues.

## Phase 2 — Version & merge — 🛑 explicit go-ahead required

1. Bump the version in `package.json` only (WXT reads it for the manifest —
   never hand-edit a manifest).
2. Update the version badge in `README.md`.
3. **Ask before merging** the release branch into `main` if `main` is stale or
   diverged — this rewrites shared history and is not something to infer
   consent for from an earlier "commit all". Name what gets orphaned (old PR
   merge commits, etc.) so the user is deciding with full information.

**Exit condition:** version bumped, `main` state explicitly decided by the
user (merged, or deliberately left for later).

## Phase 3 — Docs & showcase

This is a release goal in its own right here, not an afterthought — the
project's docs are part of what ships:

- `docs/features.md` / `docs/provider-features.md` — reflect any new
  platform/feature parity.
- `docs/key-engineering-decisions/` — if this cycle solved a hard problem
  worth showcasing (the existing 5 ADRs are the bar: a real failure, the
  mechanism, the trade-off), add one. Update `README.md`'s index if so.
- `README.md` — feature list and screenshots current with what's actually in
  the popup/UI now.
- If the user wants external-facing release notes (a LinkedIn post, a GitHub
  Discussion, etc.), draft it from the ADRs and the changelog below — don't
  regenerate the technical narrative from scratch.

**Exit condition:** docs describe what's actually shipping, not what shipped
last time.

## Phase 4 — Changelog

Add a dated section to `CHANGELOG.md` above the last release, [Keep a
Changelog](https://keepachangelog.com/en/1.1.0/) style: `Added` / `Changed` /
`Fixed` / (`Removed` if relevant), plus a short `Testing` note if the test
posture changed materially. Write it from the actual commit log and closed
issues since the last tag, not from memory of the conversation — the two
drift.

**Exit condition:** `CHANGELOG.md` has a section for this version.

## Phase 5 — Tag

```sh
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(sed -n '/## \[X.Y.Z\]/,/## \[/p' CHANGELOG.md | sed '$d')
```
(Or hand-paste the relevant CHANGELOG section into `--notes` if the sed
extraction is fiddly for this version's heading.)

**Exit condition:** tag pushed, GitHub Release published with real notes (not
the tag name alone).

## Phase 6 — Build & submit — 🛑 explicit go-ahead required before the real run

The `release` GitHub Actions workflow (`.github/workflows/release.yml`) is
`workflow_dispatch`-only by design — it never fires on push. It gates on the
full `ci.yml` suite, then runs `wxt submit` against Chrome Web Store, Edge
Add-ons, **and Firefox Add-ons (AMO)** — one command submitting to all three,
since `wxt submit` (built on `publish-browser-extension`) already *is* the
central multi-store system; there's no separate tool to reach for. Safari is
the one platform that structurally can't join this — it's a native app
wrapper, not a store API, and needs a paid ($99/yr) Apple Developer account;
not pursued unless the user explicitly decides it's worth that cost.

1. **Dry run first, always**, if store credentials haven't been exercised
   recently: `gh workflow run release.yml -f dry_run=true`. Confirm it goes
   green before anything real.
2. Get explicit go-ahead, then the real run: `gh workflow run release.yml`.
3. If store secrets aren't set as repo Actions secrets yet, that's a manual
   step only the user can do — don't attempt to obtain credentials on their
   behalf:
   - Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
     `CHROME_REFRESH_TOKEN` (`npm run submit:init` generates these
     interactively via Google Cloud Console OAuth)
   - Edge: `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` (Microsoft
     Partner Center)
   - Firefox: `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` (AMO API key,
     https://addons.mozilla.org/developers/addon/api/key/) — `FIREFOX_EXTENSION_ID`
     doesn't exist yet on a first submission; AMO assigns one, add it as a
     secret afterward for subsequent releases.
   - Firefox also requires a **source code review** — `npm run zip:firefox`
     produces both the extension zip and the sources zip WXT needs for that
     (excludes tests/config/hidden files automatically; verify no stray build
     artifacts like a local `coverage/` directory snuck in before shipping).
4. **Expect variable review time.** Chrome Web Store review typically runs
   from under an hour to a few days for an extension with narrow permissions
   (this one requests specific `host_permissions`, not `<all_urls>`), but 2026
   submission volume has pushed some reviews to weeks. If a review sits past
   ~3 weeks, that's the threshold for contacting Chrome Web Store developer
   support, not a signal something's silently broken.
5. **Found a bug after submitting, before it's approved?** Use "cancel
   review" on the pending submission and upload a fixed package — faster than
   waiting out the review and shipping a hotfix after.
6. **Staged rollout is available but not wired up yet.** The Chrome Web Store
   supports a deploy percentage (start ~5–10%, hold 24–48h watching for
   crashes/reviews, then ramp) — but it's gated behind Chrome's *API v2*
   (`chrome.deployPercentage`, a Google Cloud service-account credential),
   while this repo's `release.yml` is wired to the simpler *API v1.1* OAuth
   flow (`CHROME_CLIENT_ID`/`CHROME_CLIENT_SECRET`/`CHROME_REFRESH_TOKEN`).
   For a release with real behavioral risk, consider a manual staged rollout
   from the Web Store dashboard instead of reaching for the API — don't build
   the v2 credential flow speculatively.

**Exit condition:** workflow run succeeded, listing(s) show the new version
pending review (or live, depending on store review time).

## Phase 7 — Post-release

- Close the release tracking issue (there should be one per release, mirroring
  issue #21's shape — checklist + "pre-release checks already done" section;
  create one at the start of a release cycle if it doesn't exist yet).
- Groom the board: anything that was "blocked until this release ships" is
  now unblocked — revisit it, don't leave it stale.
- If a follow-up scope was deliberately deferred (a browser target, a feature,
  automation not built this round), open or update a tracking issue for it
  rather than letting it live only in conversation.

**Exit condition:** the board reflects reality — nothing marked open that this
release actually resolved, nothing marked closed that it didn't.

## Phase 8 — If it breaks in production

Chrome Web Store's rollback is narrower than it sounds — know the shape before
reaching for it:

- **One version back only.** Rollback restores the *immediately preceding*
  published version, republished under a new, higher version number (e.g. a
  bad `2.1.0` rolls back to `2.0.0`'s content, shipped as `2.1.1`). It cannot
  reach further back than that.
- **No review, live in ~a minute** — this is the actual advantage over a
  hotfix (which waits out a real review).
- **Storage migrations must tolerate it.** This extension has a
  `chrome.runtime.onInstalled` migration (`entrypoints/background.js`) that
  runs on every update, including a rollback's "update". A rollback to code
  that predates a migration, on a profile that already has the *new* storage
  shape, can misbehave — this is exactly the failure mode the migration
  pattern needs to stay defensive against (check-before-write, never
  assume-then-write).
- **Cancels any in-flight staged rollout.** Don't combine "rolling out
  gradually" and "rolling back" in the same incident — pick one.
- If the break is bad enough that even a ~1-minute rollback isn't fast enough,
  disabling `host_permissions` isn't an option post-publish — the fastest real
  kill switch is a store-side action (unpublish/unlist), not a code change.

## Future upgrade path (not adopted yet — a deliberate choice, not an oversight)

**Conventional Commits + semantic-release / release-please** is the current
market standard for removing Phase 0 and Phase 4's manual judgment calls
entirely — commit messages (`feat:`, `fix:`, `BREAKING CHANGE:`) drive the
version bump and changelog automatically. This repo's commit history is
*already* loosely conventional (`fix(claude): …`, `feat(popup): …`) but not
enforced (no commitlint) and not fully consistent (older `+ P4: …` style
commits). Worth adopting if release cadence increases; not worth the tooling
overhead (commitlint, a Husky hook, a semantic-release CI job) for the current
pace of maybe one release per development phase. Revisit if this becomes a
recurring source of friction — don't add it speculatively.

## Notes for future releases

- Don't re-litigate the two-tier test split, the handoff mechanism, or the
  abstract-factory architecture each release — they're documented in
  `docs/key-engineering-decisions/`. Read them if a release touches that
  territory; don't rediscover them from the diff.
- `.claude/custom_data/` and `.claude/settings.local.json` are gitignored —
  never sweep them into a release commit via a broad `git add`.
