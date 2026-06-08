# AI Context Bridge — Requirements Prompt for Claude Code

## Context
You are working on an existing Chrome Extension called **AI Context Bridge**.
Before writing any code, you must:
1. Read and understand the existing codebase structure
2. Propose a solution and architecture
3. Wait for approval before implementing anything

---

## Existing Codebase — Understand This First

The extension currently has these files:
- `manifest.json` — extension config, permissions, content script registrations
- `background.js` — service worker, listens for web requests, routes messages between tabs
- `content-script.js` — injected on ChatGPT, adds floating button UI, extracts conversation, sends to Claude
- `claude-content-script.js` — injected on Claude, auto-sends pre-filled messages from URL `?q=`
- `README.md` — product documentation and roadmap

### Current flow:
User on ChatGPT → clicks floating button → ChatGPT summarizes conversation → summary sent to Claude via `claude.ai/new?q=...`

---

## New Feature: Reddit Thread → AI

### What the user wants:
When reading a Reddit thread, the user wants to:
1. Collect the thread content (title + post + smart comment selection)
2. Either **open it directly in Claude** (new tab) or **copy it to clipboard** (paste anywhere)

### How it should appear on Reddit:
- Inject **two new menu items** into Reddit's native **"..." (more options) menu** on thread/post pages
- Items to inject:
  - "Open in Claude" → fetches thread via JSON API → opens `claude.ai/new?q=...` in a new tab
  - "Copy for AI" → fetches thread via JSON API → copies formatted content to clipboard
- Should feel native to Reddit, not like a third party tool
- Use `MutationObserver` to detect when the "..." menu appears in the DOM (it is dynamically rendered)
- Find stable selectors (prefer `aria-label`, `role`, or `data-*` attributes over obfuscated class names)

---

## Content Fetching Strategy — Reddit JSON API

### How to fetch:
Every public Reddit thread exposes a clean JSON endpoint. Simply append `.json` to the current page URL:
```
https://www.reddit.com/r/programming/comments/abc123/title/
→ https://www.reddit.com/r/programming/comments/abc123/title/.json
```

The content script reads `window.location.href`, appends `.json`, and fetches it directly:
```javascript
const response = await fetch(window.location.href.split('?')[0] + '.json');
const data = await response.json();
```

**Why this approach:**
- No DOM dependency — immune to Reddit UI changes
- Gets ALL comments, not just what is currently rendered on screen
- Clean structured data — upvotes, usernames, nested replies all included
- No API key or authentication needed for public threads
- Simple and reliable

### JSON response structure to be aware of:
- `data[0]` → thread metadata (title, post body, author, upvotes)
- `data[1]` → comments tree (nested, with upvotes per comment)
- Each comment has: `body`, `score`, `author`, `replies`
- Deleted/removed comments have `body: "[deleted]"` or `body: "[removed]"` — skip these

---

## Smart Content Collection Logic

### What to collect from the JSON:
- Thread title → `data[0].data.children[0].data.title`
- Original post body → `data[0].data.children[0].data.selftext`
- Comments selected by this logic:

```
if total_comments <= budget:
    collect all comments
else:
    sort by upvotes descending → fill budget from top
    append a few most recent comments if budget still allows
    stop when word budget is reached
```

### Token budget:
- Default: ~4000 words
- User configurable in future: Small / Medium / Large
- Budget is word/character based, NOT comment count based
- Prioritize top upvoted comments first, fill remaining budget with recent ones
- Preserve meaningful nested replies where they add context to parent comment
- Skip deleted, removed, or empty comments

### Format — optimized for Claude (token efficient):
```
Thread: [title]
Post: [original post body]
---
[upvotes] [username]: [comment text]
  > [upvotes] [username]: [nested reply if meaningful]
---
```
- Plain text, minimal punctuation
- No HTML, no markdown decorations
- Easy for Claude to parse and correlate human inputs

---

## Architecture Requirements — Most Important

### The solution MUST be built with extensibility as the core principle:

**Today:** Reddit → Claude
**Tomorrow:** Any platform → Any AI

### Proposed structure to evaluate and improve:

```
src/
  platforms/
    reddit.js          ← extracts content from Reddit
    [future].js        ← any new platform added here
  destinations/
    claude.js          ← opens claude.ai/new?q=...
    clipboard.js       ← copies to clipboard (works for any AI)
    [future].js        ← chatgpt, gemini, etc added here
  core/
    extractor.js       ← common content extraction interface
    formatter.js       ← formats content for AI consumption
    budget.js          ← token/word budget management logic
  ui/
    menu-injector.js   ← injects items into platform native menus
```

### Key principles:
- Adding a new **platform** (e.g. Hacker News, Twitter) = only add a new file in `platforms/`
- Adding a new **AI destination** (e.g. ChatGPT, Gemini) = only add a new file in `destinations/`
- Core extraction and formatting logic never changes when adding new platforms or destinations
- Each platform defines its own:
  - How to fetch content (JSON API, DOM, or other)
  - How to detect and inject into native menus via MutationObserver
  - How to map raw data to the common content schema
- Each destination defines its own URL pattern or action
- `formatter.js` and `budget.js` in core are completely platform and destination agnostic

---

## Scope — What is IN and OUT

### In scope:
- New Reddit only (not old.reddit.com) for now
- "Open in Claude" destination
- "Copy for AI" destination
- Extensible architecture as described above
- Update `manifest.json` with Reddit permissions

### Out of scope for now:
- Old Reddit support
- Auto-inject into existing AI chat tabs
- ChatGPT as a destination (covered by Copy for AI)
- Any UI other than the "..." menu injection

---

## What Claude Code Must Do — Step by Step

### Step 1 — Read and analyse existing code
- Read all existing files
- Understand current architecture, message passing, content script patterns
- Identify reusable patterns (e.g. how `openLastChatGPTReply` works, how `claude-content-script.js` receives `?q=`)

### Step 2 — Propose solution BEFORE coding
- Propose the full file structure
- Explain how new files integrate with existing ones
- Explain how `manifest.json` needs to change
- Explain the MutationObserver strategy for Reddit's "..." menu
- Explain how extensibility is achieved
- Flag any risks or assumptions

### Step 3 — Wait for approval
- Do NOT write any implementation code until the proposal is reviewed and approved
- Ask clarifying questions if anything is unclear

### Step 4 — Implement only after approval
- Implement exactly what was proposed
- Keep existing files working — do not break ChatGPT → Claude flow
- Follow the extensible architecture strictly

---

## Final Note
The goal is not just to ship a Reddit feature. The goal is to refactor the extension's foundation so that adding any new platform or AI destination in the future is trivial. Reddit is just the first use case of this new architecture.
