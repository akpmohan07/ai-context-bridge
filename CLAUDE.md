# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Context Bridge** is a Chrome Extension (Manifest V3) that enables context transfer between AI platforms and content sources. Current supported flows:
- ChatGPT → Claude (summarize & continue, second opinion)
- Reddit thread → Claude (formatted discussion context)
- Reddit thread → Clipboard

## Development Setup

No build process. This is pure JavaScript loaded directly by Chrome.

**To install/reload:**
1. Open `chrome://extensions/`
2. Enable Developer mode
3. "Load unpacked" → select this directory
4. After code changes, click the refresh icon on the extension card

**To test changes:** Reload the extension and navigate to ChatGPT, Claude, or Reddit.

## Architecture

The codebase follows an abstract factory pattern with three main extension points:

### Content Sources (`src/content-sources/`)
Extracts content from a web page and injects UI buttons/menus.
- Base class: `ContentSource` (base.js) — implement `isMatch()`, `fetchContent()`, `injectUI(actions)`
- `fetchContent()` must return a `ContentDocument` (schema defined in `src/core/schema.js`)
- `getFormattedContent()` is provided: fetches → trims budget → formats to text

### AI Platforms (`src/ai-platforms/`)
Destinations that receive context.
- Base class: `AIPlatform` (base.js) — implement `openWithContext(text)`
- `extractConversation()` and `injectUI()` are optional overrides
- **ClaudePlatform**: opens `claude.ai/new?q=<encoded>`, then auto-sends via DOM polling
- **ChatGPTPlatform**: triggers summarization by editing last message, waits for API response

### UI Components (`src/ui/`)
DOM injection with MutationObserver-based targeting.
- Base class: `UIInjector` — implement `isTargetNode()`, `buildItems(actions)`
- `FloatingButton`: ChatGPT floating button (bottom-right, shadow DOM, dropdown)
- `MenuInjector`: base for platform-native menu injection (used by Reddit)

### Core Utilities (`src/core/`)
- **schema.js** — `ContentDocument` and `Item` types used by all content sources
- **budget.js** — Trims content to 4000-word budget, prioritizing by score (upvotes)
- **formatter.js** — Formats `ContentDocument` to plain text for AI consumption

### Cross-Script Communication
- **background.js** (service worker): One-shot listener for ChatGPT API completion (`/backend-api/f/conversation`). Sends `{ event: 'conversation_completed' }` to content script.
- **content-script.js** (ChatGPT): Listens for that event, then calls `chatgpt.handleConversationCompleted(claude)` to open Claude with the response.
- **reddit-content-script.js**: Initializes `RedditSource` + `ClaudePlatform`, injects menu.
- **claude-content-script.js**: Calls `claude.injectUI()` to auto-send URL-pre-filled messages.

## Adding New Platforms

**New content source** (e.g., HackerNews):
1. Create `src/content-sources/hackernews.js`, extend `ContentSource`
2. Implement `isMatch()`, `fetchContent()` (return `ContentDocument`), `injectUI(actions)`
3. Register in `manifest.json` as a new content script

**New AI destination** (e.g., Gemini):
1. Create `src/ai-platforms/gemini.js`, extend `AIPlatform`
2. Implement `openWithContext(text)` at minimum
3. Import and use in the relevant content scripts

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions, content script registration |
| `background.js` | Service worker, ChatGPT API response listener |
| `src/core/schema.js` | Universal `ContentDocument`/`Item` schema |
| `src/core/budget.js` | Word budget trimming (default 4000 words) |
| `src/content-sources/reddit.js` | Reddit fetch + UI injection |
| `src/ai-platforms/claude.js` | Claude URL opener + auto-send |
| `src/ui/floating-button.js` | ChatGPT floating button component |
