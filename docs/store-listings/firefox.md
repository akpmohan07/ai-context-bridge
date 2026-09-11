# Firefox Add-ons (AMO) listing

## Name
AI Context Bridge

## Summary (250 char limit)
One click carries full context into your AI chat, no copy-paste, and adds what it's missing, like a sense of time, and more.

## Description

AMO's description field supports Markdown, but in practice the same
plain-text/emoji copy used for Chrome and Edge (see
[`chrome-edge.txt`](./chrome-edge.txt)) was submitted here as-is, for
consistency across all three listings rather than maintaining two versions
of the same content. A Markdown version is a reasonable future improvement
here specifically, but isn't what's actually live right now.

★ Sources

🧵 Reddit
A small button appears on every thread. Click it, pick Claude, ChatGPT, or Gemini, and the full discussion lands in your AI ready to go. Post, comments, context, all of it.

📝 Medium
Reading something interesting? One click sends the whole article to Claude, ChatGPT, or Gemini. No selecting, no copying, no tab juggling.

★ Time Awareness

⏱ Works on Claude, ChatGPT, and Gemini
Your AI has no idea how long it's been since your last message. Now it does. Conversations feel continuous, not cold restarts, whichever AI you're talking to.

★ ChatGPT Assistant

🚀 Summarize and Continue in New Chat
One click condenses your entire conversation into a focused summary and opens a fresh chat, so you never lose momentum.

🤔 Get Claude's Opinion
Still on ChatGPT but want a second perspective? One click sends your conversation to Claude and asks for its take.

★ Claude.ai

🎵 Ambient Sounds
The silence while Claude thinks feels oddly empty. A soft sound when you send, a quiet hum while it thinks, a gentle chime when it responds.

Every feature above is its own toggle in the popup. Turn on only what you actually want, per platform.

🔒 Privacy
Nothing leaves your browser. No account. No servers. No tracking. Open source.

github.com/akpmohan07/ai-context-bridge

💡 If something's broken or you want a feature, open an issue. I read them.

## Categories (up to 3; Firefox's category list has no "Productivity" option)
Social & Communication, Feeds/News & Blogging

## Tags
ai, chatgpt, claude, gemini, reddit, medium, ai-assistant, context

## License
Apache License 2.0 (matches the repo's actual LICENSE file)

## Support email / website
akpmohan07@gmail.com / https://github.com/akpmohan07/ai-context-bridge

## Privacy Policy
Check "This add-on has a Privacy Policy": yes
URL: https://github.com/akpmohan07/ai-context-bridge/blob/main/PRIVACY.md

## Compatibility
Firefox: yes. Firefox for Android: **no** — untested on mobile; this
codebase's DOM selectors (`shreddit-post-overflow-menu`, `.ql-editor`,
`#prompt-textarea`, etc.) were built against desktop site layouts, which
often differ from mobile-responsive ones. Don't check Android compatibility
until it's actually been tested there.

## "Do you use code generators, minifiers, bundlers...?"
**Yes** — WXT's build uses Vite, which bundles and minifies. This is always
Yes for this project; it triggers the sources-zip requirement below.

## Notes to Reviewer
This extension is built with WXT (wxt.dev) from the source available at
https://github.com/akpmohan07/ai-context-bridge (tag v<VERSION>). To
reproduce this exact build from the attached source zip: run `npm install`,
then `npm run build -- -b firefox` (or `npx wxt build -b firefox`). The
output in `.output/firefox-mv2/` matches this submitted package exactly. No
proprietary or private dependencies; `package.json` lists only public npm
packages, and build/test tooling (Vitest, Playwright) is dev-only, not part
of the runtime bundle.

## Files to upload
- Extension zip: `.output/ai-context-bridge-<version>-firefox.zip`
- Sources zip (required alongside, since the answer above is Yes):
  `.output/ai-context-bridge-<version>-sources.zip`
- Both come from one command: `npm run zip:firefox`
