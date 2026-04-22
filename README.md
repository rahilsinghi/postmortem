# Postmortem

**A decision-archaeology agent for any codebase.**

Built during [*Built with Opus 4.7: a Claude Code Hackathon*](https://cerebralvalley.ai/events/~/e/built-with-4-7-hackathon) — April 21–26, 2026.

---

## The problem

Engineers spend 20–30% of their time trying to understand *why* existing code is the way it is. The answers are almost never in the code. They're buried in PR discussions, code review debates, issue threads, and the heads of people who've long since left. Existing tools search code; none of them reason over the historical provenance.

## What Postmortem does

Point Postmortem at any public GitHub repository. It reads the entire intent layer — every PR, every review comment, every issue — and builds a **decision ledger**: a queryable graph of the repo's architectural decisions, the rationales behind them, and the alternatives that were rejected.

Ask it:

- *"Why does this codebase use X instead of Y?"*
- *"What breaks if I change this assumption?"*
- *"What did the maintainers consider and reject when they made this choice?"*

Get back a cited reasoning chain, traced through actual engineering debates, with links to the specific comments and commits.

## What makes this possible

Claude Opus 4.7 shipped on April 16, 2026. Postmortem uses four of its new capabilities as load-bearing infrastructure:

- **1M-token context** holds a full decision ledger in memory for query-time reasoning
- **Agentic self-checking** verifies every citation before an answer is returned
- **Task budgets** expose *investigation depth* as a first-class UX control
- **High-resolution vision** (2576px) parses architecture diagrams posted in PRs

Ingestion runs on [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview), with four specialized sub-agents orchestrated via [Claude Code](https://code.claude.com/docs) and four custom [Agent Skills](https://claude.com/blog/skills).

## Status

Under active development for the hackathon. Submission targets Sunday, April 26, 2026, 8:00 PM EST.

Follow the commit history — this repo is literally the canonical test case for the Postmortem self-graphify moment (see `docs/SPEC.md` §6.3).

## License

MIT.

---

*Code lives. Intent is a ghost. Postmortem summons it.*
