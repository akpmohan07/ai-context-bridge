# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the project overview, dev setup, architecture, and contribution guide — that file is the source of truth; this one just points to it so Claude Code loads it automatically each session.

For cutting a release, this repo has a `release-extension` skill under `.claude/skills/` — the full pipeline (readiness gate → version/merge → docs → changelog → tag → build+submit → post-release), not something to improvise from scratch each time.
