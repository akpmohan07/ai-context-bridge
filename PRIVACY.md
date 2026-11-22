# Privacy Policy

AI Context Bridge is built around one principle: everything happens locally in your browser, on your device. There is no server operated by this extension's developer, so there is nowhere for your data to go except your own browser and the AI chat tab you choose to open.

## What the extension reads, and when

- The content of the current page (a Reddit thread, a Medium article, or a ChatGPT conversation), **only when you click a button the extension has added to that page**. It never reads page content automatically or in the background.
- The currently active tab's URL, only to decide which supported site you're on and to order the settings popup so the platform you're using appears first.
- The completion of one specific ChatGPT network request (`https://chatgpt.com/backend-api/f/conversation`), for the Summarize and Continue / Get Claude's Opinion features. Only the request's completion is observed, never its contents.
- Your Claude usage numbers, for the unused-capacity view in the popup. Every 5 minutes, and when you open claude.ai or the popup, the extension asks claude.ai for the same usage percentages its own Settings → Usage page shows (`https://claude.ai/api/organizations/{id}/usage`), using your existing claude.ai login in this browser. It reads only the weekly usage percentage and when the week resets, never your chats, files or account details.

Page content is used for exactly one purpose: handing it off to an AI chat you choose (Claude, ChatGPT, or Gemini), by opening a new tab to that AI and inserting the content into its message box. Usage numbers are used only to draw the usage view in the popup.

## What is stored, and where

- **Browser sync storage**: your own feature toggles (which platforms and features are enabled). Synced by your browser across your own signed-in devices, never accessible to anyone else.
- **Browser local storage**: three things. First, a short-lived handoff payload, the content you're sending to an AI, which is deleted automatically the moment the destination tab reads it, or after 60 seconds if it's never read. Second, a small cache of per-conversation "last message" timestamps, used only to power the Time Awareness feature. Third, your Claude usage history: the weekly usage percentage per week and per day, the times it was read, and your Claude organization id (to keep separate accounts apart). It stays on your device and is removed when you uninstall the extension.

## What this extension does not do

- Operate a server, collect analytics, or use any tracking or telemetry.
- Collect, transmit, or sell personal information, browsing history, keystrokes, or account credentials.
- Access any site beyond the ones it's built for (Reddit, Medium, ChatGPT, Claude.ai, Gemini). No broad host permission is requested.
- Share data with any third party, for any purpose.

## Source code

This extension is open source. Every line of what it does is readable at [github.com/akpmohan07/ai-context-bridge](https://github.com/akpmohan07/ai-context-bridge).

## Contact

Questions about this policy: akpmohan07@gmail.com
