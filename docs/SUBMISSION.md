# Postmortem — Built with Opus 4.7 Hackathon Submission

## 100-word pitch

Every codebase has a graveyard of architectural decisions nobody can explain anymore. Static analysis reads *what the code is*; **Postmortem reads the history of thought behind it.** Opus 4.7 ingests a repo's PRs, reviews, and issues, and extracts a structured decision ledger — rationales, rejected alternatives, and the edges between them. You ask *why* and get a cited reasoning chain. Four modes ship: **Ask** (cited answers), **Impact Ripple** (blast-radius across supersedes chains), **👁 Ghost Interview** (Opus speaks in a maintainer's own verbatim quotes), and **⚠ Conflict Finder** (pairs of decisions that quietly contradict). Opus 4.7's 1M context holds the full ledger; adaptive thinking streams live into a Reasoning X-Ray; self-check verifies every citation.

## 200-word pitch

Every codebase has a graveyard of architectural decisions nobody can explain anymore. Static analysis reads *what the code is*; **Postmortem reads the history of thought behind it.**

Opus 4.7 ingests a repo's PRs, reviews, and issue threads, and extracts a structured **decision ledger** — rationales, rejected alternatives, deciders, and the supersedes/depends/related edges between them. Across 6 hero repos the ledger holds **155 architectural decisions**, **751 cited quotes on honojs/hono alone**, **190 rejected alternatives**, and **27 supersedes edges**.

Four modes ship, all citation-grounded:

1. **Ask** — one Opus call with the full ledger in 1M context produces a TL;DR plus numbered reasoning cards, each with a pulled verbatim quote and a self-check pass that flags any citation that doesn't trace back.
2. **Impact Ripple** — BFS across the decision graph to show what breaks if assumption X changes.
3. **Ghost Interview** — pick a maintainer, Opus speaks in their register using their own quoted words wrapped in double quotes with `[PR #N, @handle, date]` tokens, with a paraphrase-disclosure tag on any bridge sentence.
4. **Conflict Finder** — scans the whole ledger for pairs of decisions that contradict across supersedes chains, with severity rubric and resolution hints.

**Opus 4.7 leverage:** 1M context, adaptive thinking streamed live into a Reasoning X-Ray, self-checking on every answer, and Managed Agents for batch rationale extraction during ingestion.

Live: [postmortem-mauve.vercel.app](https://postmortem-mauve.vercel.app) · MCP server: `postmortem_{list_repos,list_decisions,query,impact,open_decision}` exposes the ledger to Claude Code.
