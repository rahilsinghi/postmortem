---
name: commit-rationale
description: Given a git commit SHA, extract the commit message, linked PR (if any), linked issues, and adjacent commits from `git blame` that may contain the real rationale. Commits often say "see PR #X" or "follow-up to abc123" — this skill walks that provenance so downstream extractors get the full narrative, not just the commit-message blurb. Use whenever a decision's rationale is thin in the PR itself but likely lives in a merge commit or a linked issue.
license: MIT
---

# Commit Rationale

Commit messages are an under-used rationale source. This skill walks the cross-reference graph around a single commit:

1. Full commit message (including body, sign-offs, co-authors).
2. Any linked PR (via GitHub's commit-to-PR lookup or "#1234" syntax in the body).
3. Any linked issues (via "fixes #", "closes #", "see #" references).
4. **Adjacent commits on the same files** — git blame surfaces the commits that preceded the touched lines. Those often contain the original rationale the current commit responds to.

## Inputs

- `repo` — `owner/name`
- `commit_sha` — 40-char hex SHA
- `github_token` — PAT with public-repo:read

## Output structure

```json
{
  "repo": "owner/name",
  "sha": "abc123...",
  "message": "full commit message including body",
  "author": "name <email>",
  "committed_at": "ISO 8601",
  "files_changed": ["path/to/file.ts"],
  "linked_pr": {
    "number": 4512,
    "url": "https://github.com/owner/name/pull/4512",
    "title": "..."
  },
  "linked_issues": [
    { "number": 4201, "url": "...", "title": "..." }
  ],
  "adjacent_commits": [
    {
      "sha": "...",
      "message": "one-line + body",
      "author": "...",
      "committed_at": "...",
      "files_overlap": ["path/to/file.ts"],
      "relation": "previously_touched | same_pr_chain"
    }
  ]
}
```

## Implementation notes

- Prefer `git` CLI for local speed; fall back to GitHub API when the commit isn't available locally.
- PR lookup: GraphQL `repository.object(oid:).associatedPullRequests` is the authoritative path.
- Issue linking: parse commit body for `(?i)(fixes|closes|resolves|see) #(\d+)` AND inspect linked-issues on the associated PR.
- `git blame -L <range>` on the most-changed file returns a set of prior commits; dedupe by SHA, cap at 10.

## Critical rules

1. **Never invent links.** If no PR/issue reference exists, return empty arrays.
2. **Preserve commit message byte-for-byte.** Downstream extractors cite by quote.
3. **Cap adjacent commits at 10** to keep downstream context budgets predictable.

## Status

Day 2 scaffold: schema + SKILL.md locked; Python runtime to be implemented Day 3 when the orchestrator needs commit-walking inside the Managed Agents session.
