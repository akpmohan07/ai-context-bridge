import { ClaudePlatform } from './claude.js';
import { ChatGPTPlatform } from './chatgpt.js';
import { GeminiPlatform } from './gemini.js';

// Registry of AI destinations a content source can hand off to. This is data,
// not logic: adding a provider is one entry here (plus its class file in the
// manifest, and a content script only if it needs on-page DOM injection).
//
// Sources iterate this instead of enumerating destinations by name, so the
// dropdown items and the handoff wiring stay in sync automatically — no more
// editing five places per provider.
//
// Scope: content-source → destination handoff (Reddit, Medium). The ChatGPT
// floating button is intentionally NOT driven by this — its actions
// (summarize-and-continue, second-opinion) aren't "open in X", so forcing them
// through this registry would be the wrong abstraction.
//
// `theme` keys into Theme[...] for the menu item's accent/background.
export const Destinations = [
    { id: 'claude',  label: 'Open in Claude',  theme: 'claude',  platform: new ClaudePlatform() },
    { id: 'chatgpt', label: 'Open in ChatGPT', theme: 'chatgpt', platform: new ChatGPTPlatform() },
    { id: 'gemini',  label: 'Open in Gemini',  theme: 'gemini',  platform: new GeminiPlatform() },
];
