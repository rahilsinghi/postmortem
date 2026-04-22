---
name: citation-formatter
description: Convert a cited claim from the Postmortem ledger (one Citation row from backend/app/ledger/models.py) into the user-facing inline citation format `[PR #4512, @alice, 2024-03-17]` plus a structured hover-card payload with the full quoted text and link. Centralized so the frontend never re-implements formatting rules and every citation chip looks the same. Use whenever a claim is rendered into a reasoning trace, card, or graph node.
license: MIT
---

# Citation Formatter

Produces two outputs per citation:

1. **Inline token** — a short, dense citation that reads well in a sentence. Conventions (locked):
   - `[PR #4512, @alice, 2024-03-17]` — top-level PR body / conversation comment
   - `[PR #4512 review, @alice, 2024-03-17]` — review body
   - `[PR #4512 inline, @alice, 2024-03-17]` — inline review comment
   - `[issue #4201, @alice, 2024-03-10]` — linked issue body or comment
   - `[commit abc1234, @alice, 2024-03-15]` — commit message
   - Date is the citation's timestamp (UTC, `YYYY-MM-DD`). If missing → omit the date token.
   - Author missing → `@unknown`.
2. **Hover card payload** — full quote (untrimmed), source kind, direct URL, author, timestamp.

## Inputs

A single `Citation` object (see [backend/app/ledger/models.py](../../../backend/app/ledger/models.py)):

```python
{
  "claim": "...",
  "citation_quote": "exact quote, grep-reproducible",
  "citation_source_type": "pr_body | pr_comment | review_comment | inline_review_comment | linked_issue_body | linked_issue_comment | commit_message",
  "citation_source_id": "4512 or comment-id or SHA",
  "citation_author": "alice",
  "citation_timestamp": "2024-03-17T14:22:00Z",
  "citation_url": "https://github.com/owner/repo/pull/4512"
}
```

## Output structure

```json
{
  "inline": "[PR #4512 inline, @alice, 2024-03-17]",
  "hover": {
    "quote": "exact quote text",
    "source_label": "Inline review comment on src/store.ts:42",
    "author": "alice",
    "timestamp": "2024-03-17T14:22:00Z",
    "url": "https://github.com/owner/repo/pull/4512#discussion_r..."
  },
  "pr_number": 4512,
  "commit_sha": null
}
```

## Source-type → inline-token mapping (authoritative)

| source_type | inline form | hover source_label |
|---|---|---|
| `pr_body` | `[PR #{n}, @{a}, {d}]` | `PR body` |
| `pr_comment` | `[PR #{n}, @{a}, {d}]` | `PR conversation comment` |
| `review_comment` | `[PR #{n} review, @{a}, {d}]` | `PR review` |
| `inline_review_comment` | `[PR #{n} inline, @{a}, {d}]` | `Inline review comment` (+ path if available) |
| `linked_issue_body` | `[issue #{n}, @{a}, {d}]` | `Linked issue` |
| `linked_issue_comment` | `[issue #{n}, @{a}, {d}]` | `Linked issue comment` |
| `commit_message` | `[commit {sha[:7]}, @{a}, {d}]` | `Commit message` |

## Critical rules

1. **Never mutate the quote.** Whitespace, typos, backticks — all preserved.
2. **Stable output for identical input.** The formatter is pure; same `Citation` in → same strings out.
3. **One token per citation.** A claim backed by three citations emits three tokens rendered inline, space-separated: `[PR #4512, @alice, 2024-03-17] [PR #4512 inline, @bob, 2024-03-18] [issue #4201, @alice, 2024-03-10]`.
4. **Timestamps render as UTC date-only** in the inline token to keep it scannable; the hover has the full ISO 8601.

## Status

Day 2 scaffold: rules + mapping locked. TS implementation ships with the frontend reasoning-trace component in Day 3. A parallel Python implementation used by the backend's query formatter is also planned for Day 3.
