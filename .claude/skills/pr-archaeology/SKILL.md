---
name: pr-archaeology
description: Extract structured data from a GitHub pull request — title, body, all comments, all review threads, all linked issues, all linked commits, inline code-review comments, and diff statistics. Uses GitHub GraphQL where efficient and REST where necessary. Handles ETag caching and rate-limit backoff. Use whenever a specific PR's full archaeological record needs to be pulled for downstream classification and extraction.
license: MIT
---

# PR Archaeology

This skill extracts the complete archaeological record of a GitHub pull request. The output is a structured JSON object with every artifact that could possibly contain decision rationale — PR body, all comments, all review threads, inline code-review comments, linked issues, linked commits, diff stats, and timestamps.

This skill is invoked by sub-agents during ingestion. It is not user-facing.

## Inputs

- `repo` — `owner/name` string
- `pr_number` — integer
- `github_token` — personal access token (read access sufficient)

## Output structure

```json
{
  "repo": "owner/name",
  "pr_number": 4512,
  "title": "...",
  "body": "...",
  "author": "github_username",
  "state": "MERGED | CLOSED | OPEN",
  "merged_at": "ISO 8601 or null",
  "created_at": "ISO 8601",
  "url": "https://github.com/owner/name/pull/4512",
  "base_ref": "main",
  "head_ref": "...",
  "diff_stats": {
    "files_changed": 12,
    "additions": 340,
    "deletions": 128
  },
  "labels": ["..."],
  "reviewers_requested": ["..."],
  "reviews": [
    {
      "id": "...",
      "author": "...",
      "state": "APPROVED | CHANGES_REQUESTED | COMMENTED",
      "body": "...",
      "submitted_at": "ISO 8601",
      "url": "..."
    }
  ],
  "conversation_comments": [
    {
      "id": "...",
      "author": "...",
      "body": "...",
      "created_at": "...",
      "url": "...",
      "in_reply_to": null
    }
  ],
  "inline_review_comments": [
    {
      "id": "...",
      "author": "...",
      "body": "...",
      "path": "src/store.ts",
      "diff_hunk": "...",
      "position": 45,
      "original_position": 45,
      "created_at": "...",
      "url": "...",
      "in_reply_to": null,
      "thread_id": "..."
    }
  ],
  "linked_issues": [
    {
      "number": 4201,
      "title": "...",
      "body": "...",
      "state": "CLOSED | OPEN",
      "url": "...",
      "comments": [ /* comment objects */ ]
    }
  ],
  "commits": [
    {
      "sha": "...",
      "message": "...",
      "author": "...",
      "committed_at": "..."
    }
  ],
  "timeline_events": [
    {
      "type": "review_requested | labeled | head_ref_force_pushed | ...",
      "actor": "...",
      "created_at": "..."
    }
  ]
}
```

## Implementation

Use GraphQL for the bulk fetch, REST only where GraphQL doesn't expose a field we need.

### The primary GraphQL query

```graphql
query PRArchaeology($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      body
      state
      mergedAt
      createdAt
      url
      author { login }
      baseRefName
      headRefName
      additions
      deletions
      changedFiles
      labels(first: 20) { nodes { name } }
      reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
      reviews(first: 100) {
        nodes {
          id
          author { login }
          state
          body
          submittedAt
          url
        }
      }
      comments(first: 100) {
        nodes {
          id
          author { login }
          body
          createdAt
          url
        }
      }
      reviewThreads(first: 100) {
        nodes {
          id
          path
          line
          comments(first: 50) {
            nodes {
              id
              author { login }
              body
              diffHunk
              originalPosition
              createdAt
              url
              replyTo { id }
            }
          }
        }
      }
      closingIssuesReferences(first: 10) {
        nodes {
          number
          title
          body
          state
          url
          comments(first: 50) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
      commits(first: 100) {
        nodes {
          commit {
            oid
            message
            author { name email }
            committedDate
          }
        }
      }
      timelineItems(first: 50, itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT, REVIEW_REQUESTED_EVENT, LABELED_EVENT, CROSS_REFERENCED_EVENT]) {
        nodes {
          __typename
          ... on HeadRefForcePushedEvent { actor { login } createdAt }
          ... on ReviewRequestedEvent { actor { login } createdAt }
          ... on LabeledEvent { actor { login } createdAt label { name } }
          ... on CrossReferencedEvent { actor { login } createdAt source { ... on PullRequest { number url } ... on Issue { number url } } }
        }
      }
    }
  }
}
```

### Rate-limit discipline

- Always inspect `X-RateLimit-Remaining` / `x-ratelimit-remaining-graphql` headers
- Use ETag caching via `If-None-Match` on repeat requests to the same PR
- On 403 or 429, implement exponential backoff with jitter — start at 2s, double on each retry, max 60s, give up after 5 retries
- When `rateLimit { remaining cost resetAt }` is returned in GraphQL, check it proactively

### Pagination

Most fields above fetch the first 50–100 items. For PRs with more than 100 comments (rare but they exist in big repos), extend with cursor pagination. For the hackathon, cap at 100 per collection — if a PR has more than 100 review comments, note it in the output but do not paginate further. (Exceeds budget for marginal benefit.)

### Caching

Cache every PR archaeology result to disk as `cache/{repo}/pr-{number}.json`. Re-ingestion should check the cache first and skip PRs whose ETag has not changed.

## Example call (Python, using `gql`)

```python
from gql import gql, Client
from gql.transport.aiohttp import AIOHTTPTransport

async def fetch_pr_archaeology(repo: str, pr_number: int, token: str) -> dict:
    owner, name = repo.split("/")
    transport = AIOHTTPTransport(
        url="https://api.github.com/graphql",
        headers={"Authorization": f"bearer {token}"},
    )
    async with Client(transport=transport, fetch_schema_from_transport=False) as session:
        result = await session.execute(
            gql(PR_ARCHAEOLOGY_QUERY),
            variable_values={"owner": owner, "repo": name, "pr": pr_number},
        )
    return normalize_to_output_schema(result)
```

## Critical rules

1. **Never invent fields.** If the GraphQL response doesn't contain a piece of data (e.g., `mergedAt` is null for an unmerged PR), the output field is null. Do not fabricate.
2. **Preserve exact body/comment text.** No markdown normalization, no whitespace cleanup — downstream extractors need byte-accurate text for citations.
3. **Timestamps are ISO 8601.** Always. Convert from whatever GitHub returns.
4. **Handle deleted users.** `author` can be null if the user deleted their account. Represent as `"author": null`, not a fake username.
5. **Don't fetch the diff itself.** The diff is large, rarely the decision's actual content, and blows our context budget. We fetch diff *statistics* only. The sub-agents can ask for specific file diffs if needed.

## Dependencies

- `gql` (Python) — or `graphql-request` (TS) for async GraphQL
- `httpx` (Python) — for REST fallbacks
- `PyGithub` (Python) — for convenience wrappers; optional
