# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-09-17

## Product Overview
**One-liner:** A free, open-source browser extension that sends content from Reddit, Medium, or ChatGPT straight into Claude, ChatGPT, or Gemini, no copy-paste.
**What it does:** AI Context Bridge adds a menu/button to Reddit threads, Medium articles, and ChatGPT conversations. One click hands the content off to Claude, ChatGPT, or Gemini (or the clipboard), formatted and ready to discuss in a new tab. It also adds small on-platform extras once you're in a chat: Time Awareness (tells the AI the real elapsed time since your last message; works on Claude, ChatGPT, and Gemini), Ambient Sounds (subtle audio presence, Claude.ai only), and a Default Model preference (Claude.ai only).
**Product category:** Browser extension / AI productivity utility.
**Product type:** Free, open-source software (Apache 2.0). Not a SaaS.
**Business model:** None. No pricing tiers, no signup, no accounts, no monetization. Fully local, no server.

## Target Audience
**Target companies:** Not applicable, this is a consumer/individual tool, not sold to companies.
**Decision-makers:** Not applicable (single-user install decision, no procurement).
**Primary use case:** Moving content from a source you're reading (Reddit, Medium, ChatGPT) into an AI chat, without manually copying and pasting and losing formatting along the way.
**Jobs to be done:**
- Get an AI's take on something you're reading, without breaking your reading flow to copy-paste it.
- Continue a ChatGPT conversation in Claude (or get a second opinion) without retyping everything.
- Have an AI chat behave sensibly across real time gaps in a conversation.
**Use cases:**
- Reading a Reddit thread and wanting to discuss it with an AI.
- Reading a Medium article and wanting an AI's summary or opinion.
- Wanting to compare Claude's and ChatGPT's takes on the same conversation.

## Personas
Not applicable — single-user consumer tool, no B2B buying committee.

## Problems & Pain Points
**Core problem:** Moving content from a web page into an AI chat normally means manually selecting, copying, switching tabs, pasting, and often losing formatting or missing context along the way.
**Why alternatives fall short:**
- Manual copy-paste is slow and loses structure (comment threads, article formatting).
- Closed-source extensions that read page content raise a legitimate "what else is this reading, and where does it go?" concern.
- AI chats themselves have no built-in sense of elapsed real-world time between messages.
**What it costs them:** Time and friction on every single handoff; broken reading flow; occasional data loss (garbled paste formatting).
**Emotional tension:** A background wariness about what a content-reading browser extension actually does with your data, absent any hosting/reporter.

## Competitive Landscape
No named direct competitors have been identified or researched yet — this section is intentionally left open rather than inventing names. The real alternative most users compare against is **manual copy-paste** (the status quo, not a product), and, more loosely, other browser extensions that claim to summarize or bridge web content into AI tools without disclosing what they read or where data goes.
**How the status quo falls short:** Copy-paste is slow, breaks formatting, and doesn't scale to long threads. Closed-source "AI helper" extensions can't be verified for what they actually access or transmit.

## Differentiation
**Key differentiators:**
- Fully local: no server operated by the developer, so there's nowhere for data to go except the user's own browser and the AI tab they open.
- Open source (Apache 2.0): every claim in the privacy policy is independently verifiable in the code.
- Multi-destination: one extension covers Claude, ChatGPT, and Gemini, not just one AI vendor.
- Time Awareness: a genuinely uncommon feature (AI chats don't track elapsed wall-clock time on their own).
**How we do it differently:** Reads page content only on explicit user click, never automatically or in the background; no analytics, no tracking, no broad host permissions.
**Why that's better:** Removes the "what is this extension actually doing" trust question that closed-source alternatives can't answer.
**Why customers choose us:** No cost, no account, no data-collection tradeoff, verifiable via source.

## Objections
| Objection | Response |
|-----------|----------|
| "Why should I trust a free extension with page content?" | It's open source and architecturally can't send data anywhere; there's no server to send it to. Read the code yourself. |
| "Does it work with the AI I already use?" | Claude, ChatGPT, and Gemini are all supported as destinations. |
| "Is this going to slow down my browsing?" | It only acts when you click its own button; it never runs automatically or reads pages in the background. |

**Anti-persona:** Someone who wants a fully automated, no-click AI research assistant that acts on their behalf without explicit triggers, this tool is deliberately click-triggered, not autonomous.

## Switching Dynamics
**Push:** Repeated frustration with copy-paste losing formatting or being slow across multiple sources and destinations.
**Pull:** Zero cost, one-click setup, verifiable privacy stance, works across all three major AI chats.
**Habit:** Existing muscle memory for manual copy-paste; not knowing the extension exists yet.
**Anxiety:** General wariness of browser extensions that read page content, addressed directly by the open-source/local-only architecture.

## Customer Language
No verbatim customer language has been collected yet (no interviews, reviews, or support tickets exist at this stage). This section should be filled in once real user feedback (store reviews, GitHub issues, etc.) accumulates, rather than invented now.
**Words to use:** "one click," "no copy-paste," "fully local," "open source," "no server," "no tracking."
**Words to avoid:** Anything implying automation/background access ("smart," "auto-detects," "always watching") — the product is deliberately click-triggered, and language implying otherwise would misrepresent it.
**Glossary:**
| Term | Meaning |
|------|---------|
| Handoff | The act of sending content from a source page to an AI destination tab |
| Time Awareness | The feature that tells an AI chat how much real time passed since the last message |
| Source | A page type the extension can read from: Reddit, Medium, ChatGPT |
| Destination | An AI chat the extension can send content to: Claude, ChatGPT, Gemini (plus clipboard as a non-AI destination) |

## Brand Voice
**Tone:** Direct, plain-spoken, quietly confident. Names the actual friction/problem before describing the fix, rather than opening with feature lists.
**Style:** Short sentences, concrete specifics over vague marketing language ("3 hours or 3 days" rather than "a while"), no exclamation points, no fabricated stats or social proof.
**Personality:** Honest, technical-but-accessible, privacy-conscious, unhyped.

## Proof Points
**Metrics:** None exist yet (no install counts, ratings, or usage data have been gathered or published). Do not cite invented numbers.
**Customers:** None named (individual consumer tool, no case studies).
**Testimonials:** None collected yet.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Fully local / private | Architecture has no server; documented line-by-line in PRIVACY.md and verifiable in the open-source code |
| Multi-platform | Same handoff works across Claude, ChatGPT, and Gemini |
| Free, no catch | Apache 2.0 license, no accounts, no paid tiers exist in the codebase |

## Goals
**Primary business goal:** Not commercial, this is an open-source personal/portfolio project. The goal is adoption and usefulness, not revenue.
**Key conversion action:** Installing the extension from the Chrome Web Store, Edge Add-ons, or Firefox Add-ons.
**Current metrics:** Unknown/not tracked (no analytics by design).

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-09-17) — Initial context, auto-drafted from README.md, PRIVACY.md, docs/features.md, and the newly-shipped marketing site's copy.
