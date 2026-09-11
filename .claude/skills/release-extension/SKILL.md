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

### v2.0.0's actual submission: automation status + what to reuse

**v2.0.0 was submitted manually to all three stores, not via `release.yml`.**
That's not a shortcut taken, it's what WXT's own docs say is required for a
*first* listing on any store (`wxt submit` can only push new versions to a
listing that already exists — see Phase 6's main text). Confirmed in
practice this cycle: all three needed a full manual dashboard pass (account
creation, category, description, screenshots, license, privacy answers).

**Explicit decision, don't relitigate:** once all three v2.0.0 listings are
approved and live, set up the GitHub Actions secrets (Phase 6, step 3) so
v2.1+ goes through `release.yml` automatically. Don't wire the secrets
speculatively before that point, and don't keep doing manual dashboard
passes once the listings exist, that defeats the reason the automation was
built.

**A permission audit belongs in Phase 1, every release, from now on.** v2.0.0
shipped with `scripting` and `activeTab` declared but never called by any
code, old and new, discovered only when Edge's justification form forced the
question. Don't wait for a store form to prompt this again:

```sh
grep -rn "chrome\.<api>\." src/ entrypoints/          # per declared permission
grep -rn "<api>\." .output/chrome-mv3/*.js .output/chrome-mv3/**/*.js  # compiled output too
```
Remove anything declared in `wxt.config.ts`'s `permissions`/`host_permissions`
that has zero real call sites in both source and the compiled build. Fewer
permissions review faster and scare users less at install, with zero
functional cost if verified unused.

**Chrome & Edge — identical MV3 review flow, real lessons:**
- The **Data usage / Privacy practices** form's checkbox list should reflect
  only what's actually read: for this codebase, check **"Website content"**
  only (that's literally the core feature) and none of the others (no PII,
  health, financial, auth, "personal communications" as a messaging system,
  location, web-history log, or user-activity monitoring). Certify all three
  "I do not..." disclosures, they're true here.
- Checking any data-usage box makes a **Privacy policy URL mandatory**.
  `PRIVACY.md` exists at the repo root for exactly this
  (`https://github.com/akpmohan07/ai-context-bridge/blob/main/PRIVACY.md`) —
  update it if what's read/stored ever changes, don't let it drift stale.
- **Permission-justification fields are generated from whatever manifest is
  in the *currently uploaded* package**, not edited directly. To make a
  justification field for a removed permission disappear, upload the
  corrected zip first (Packages/Package tab), then the form regenerates.
- Justification text that names the **exact URL/API** (e.g. the literal
  `webRequest` filter string) reviews better than vague claims, it's
  verifiable against the source in the same package.
- Edge Partner Center: **Publisher display name** = your own legal name
  absent a registered company. **Country/region** on the registration form
  can be locked to your Microsoft account's own region setting, not freely
  editable per-registration, check the account level if it needs to change.
- Chrome/Edge's detailed-description field is **plain text, no Markdown
  rendering** — `**bold**` shows as literal asterisks. Use emoji/star markers
  for visual hierarchy instead (see `docs/store-listings/chrome-edge.txt`).
  The manifest `description` field also has a **hard 132-character limit**.

**Firefox (AMO) — a structurally different flow, real lessons:**
- "Do you use code generators, minifiers, or bundlers (e.g. webpack)?" is
  **always Yes** for this project (WXT's build uses Vite, which bundles and
  minifies). Answering Yes requires the sources zip + real build instructions
  in "Notes to Reviewer" — `npm run zip:firefox` produces both the extension
  zip and the sources zip in one command.
- **Categories are a different list** than Chrome/Edge (no "Productivity").
  Used "Social & Communication" + "Feeds, News & Blogging" instead.
- **`browser_specific_settings.gecko.id`**: set a stable, self-chosen one
  proactively (this repo uses `ai-context-bridge@akpmohan07.github.io`)
  rather than leaving it for AMO to assign. Its absence causes
  `storage.sync` to misbehave, but **only under temporary local loading**
  (`about:debugging` → "Load Temporary Add-on"), per Mozilla's own validator
  warning text ("can cause issues when loaded temporarily"). A real
  AMO-signed install gets a permanent identity from Mozilla regardless, so
  don't chase this as a production bug if it's only reproducible locally,
  but do set it before submitting so local testing isn't confusing next time.
- **Compatibility checkbox**: leave "Firefox for Android" unchecked unless
  actually tested on mobile. This codebase's DOM selectors
  (`shreddit-post-overflow-menu`, `.ql-editor`, `#prompt-textarea`, etc.) are
  built against desktop layouts, which often differ from mobile-responsive
  ones.
- AMO's description field *does* support real Markdown, unlike Chrome/Edge,
  but check `docs/store-listings/firefox.md` for what's actually live before
  assuming which format was used.

**Testing a temp-loaded Firefox build:** `about:debugging#/runtime/this-firefox`
→ "Load Temporary Add-on..." → select `.output/firefox-mv2/manifest.json`
directly (the file, not the folder or a zip). **Firefox does not auto-reload
from disk** when files change, click "Reload" in `about:debugging` after
every rebuild, or you'll be testing stale code and chasing a bug that no
longer exists, confirmed happening this cycle.

**Listing content lives outside git entirely, on purpose.** `wxt submit`
never touches a store's name/description/category/screenshots, only the code
package. `docs/store-listings/` keeps a durable record of what's actually
submitted, so it doesn't only exist in an ephemeral scratchpad file. Update
those files whenever a listing changes, they're documentation of reality, not
a draft.

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

## Per-release checklist — what actually needs touching each time

Split by whether it's a one-time setup cost or a recurring one, so it's
never re-derived from scratch. This is deliberately more concrete than the
phases above; use it as the checklist once secrets exist and `release.yml`
is doing the code submission.

**One-time only (done for v2.0.0, do not repeat):**
- Create each store's developer account (Chrome, Edge, AMO)
- Bootstrap each store's *first* listing by hand: category, license,
  support links, description, screenshots (`release.yml` cannot do this,
  see Phase 6's main text)
- Set `browser_specific_settings.gecko.id` and `data_collection_permissions`
  in `wxt.config.ts` — stable once set, no reason to touch again

**Every release:**
- [ ] Version bump (`package.json`) → rebuild all packages: `npm run zip`
      (Chrome/Edge) + `npm run zip:firefox` (Firefox, also produces the
      sources zip)
- [ ] **Re-run the permission audit** (see Phase 6 above) — don't assume a
      past audit still holds if any code changed since; a new feature can
      make a previously-unused permission newly-necessary, or vice versa
- [ ] If the feature set changed: update the listing description in each
      store's dashboard by hand (three separate manual edits, `wxt submit`
      never touches this) — then update `docs/store-listings/*` to match
      what's actually live, so the repo stays a real record
- [ ] If what's read/stored changed: update `PRIVACY.md`, and re-check the
      Chrome/Edge Data usage declaration still matches
- [ ] CHANGELOG + GitHub release (Phases 4-5, unchanged)
- [ ] Once secrets are configured: `gh workflow run release.yml -f
      dry_run=true` first, then the real run, instead of manual dashboard
      uploads for the *code* package (listing content is still always
      manual, per above)

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
