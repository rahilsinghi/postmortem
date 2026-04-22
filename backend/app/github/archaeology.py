"""Extract a full archaeological record for a single GitHub PR.

Uses GraphQL for the bulk fetch (see SKILL.md for the output schema) and writes
the result to a JSON cache under `.cache/pr-archaeology/{owner}-{repo}/pr-{N}.json`.
Re-ingestion checks the cache's ETag before hitting the network.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.github.client import GitHubClient
from app.github.queries import PR_ARCHAEOLOGY_QUERY, PR_LIST_QUERY


def _normalize(pr: dict[str, Any], repo: str) -> dict[str, Any]:
    """Normalize the GraphQL response into the pr-archaeology SKILL.md schema."""
    reviews = [
        {
            "id": r["id"],
            "author": (r.get("author") or {}).get("login"),
            "state": r["state"],
            "body": r.get("body") or "",
            "submitted_at": r.get("submittedAt"),
            "url": r["url"],
        }
        for r in pr["reviews"]["nodes"]
    ]

    conversation_comments = [
        {
            "id": c["id"],
            "database_id": c.get("databaseId"),
            "author": (c.get("author") or {}).get("login"),
            "body": c["body"],
            "created_at": c["createdAt"],
            "url": c["url"],
        }
        for c in pr["comments"]["nodes"]
    ]

    inline_review_comments: list[dict[str, Any]] = []
    for thread in pr["reviewThreads"]["nodes"]:
        for comment in thread["comments"]["nodes"]:
            inline_review_comments.append(
                {
                    "id": comment["id"],
                    "database_id": comment.get("databaseId"),
                    "author": (comment.get("author") or {}).get("login"),
                    "body": comment["body"],
                    "path": thread.get("path"),
                    "line": thread.get("line"),
                    "diff_hunk": comment.get("diffHunk"),
                    "original_position": comment.get("originalPosition"),
                    "created_at": comment["createdAt"],
                    "url": comment["url"],
                    "in_reply_to": (comment.get("replyTo") or {}).get("id"),
                    "thread_id": thread["id"],
                    "thread_resolved": thread.get("isResolved", False),
                }
            )

    linked_issues = [
        {
            "number": issue["number"],
            "title": issue["title"],
            "body": issue.get("body") or "",
            "state": issue["state"],
            "url": issue["url"],
            "comments": [
                {
                    "id": c["id"],
                    "author": (c.get("author") or {}).get("login"),
                    "body": c["body"],
                    "created_at": c["createdAt"],
                    "url": c["url"],
                }
                for c in issue["comments"]["nodes"]
            ],
        }
        for issue in pr["closingIssuesReferences"]["nodes"]
    ]

    commits = [
        {
            "sha": c["commit"]["oid"],
            "message": c["commit"]["message"],
            "author": (c["commit"].get("author") or {}).get("name"),
            "committed_at": c["commit"]["committedDate"],
        }
        for c in pr["commits"]["nodes"]
    ]

    timeline_events = []
    for ev in pr["timelineItems"]["nodes"]:
        item: dict[str, Any] = {"type": ev["__typename"]}
        actor = ev.get("actor") or {}
        item["actor"] = actor.get("login")
        item["created_at"] = ev.get("createdAt")
        if "label" in ev and ev.get("label"):
            item["label"] = ev["label"].get("name")
        if "source" in ev and ev.get("source"):
            item["source"] = {
                "type": ev["source"].get("__typename"),
                "number": ev["source"].get("number"),
                "url": ev["source"].get("url"),
                "title": ev["source"].get("title"),
            }
        timeline_events.append(item)

    labels = [lbl["name"] for lbl in pr["labels"]["nodes"]]
    reviewers_requested = [
        (req.get("requestedReviewer") or {}).get("login")
        for req in pr["reviewRequests"]["nodes"]
        if (req.get("requestedReviewer") or {}).get("login")
    ]

    return {
        "repo": repo,
        "pr_number": pr["number"],
        "title": pr["title"],
        "body": pr.get("body") or "",
        "author": (pr.get("author") or {}).get("login"),
        "state": pr["state"],
        "merged_at": pr.get("mergedAt"),
        "created_at": pr["createdAt"],
        "updated_at": pr["updatedAt"],
        "url": pr["url"],
        "base_ref": pr.get("baseRefName"),
        "head_ref": pr.get("headRefName"),
        "diff_stats": {
            "files_changed": pr.get("changedFiles", 0),
            "additions": pr.get("additions", 0),
            "deletions": pr.get("deletions", 0),
        },
        "labels": labels,
        "reviewers_requested": reviewers_requested,
        "reviews": reviews,
        "conversation_comments": conversation_comments,
        "inline_review_comments": inline_review_comments,
        "linked_issues": linked_issues,
        "commits": commits,
        "timeline_events": timeline_events,
        "fetched_at": datetime.now(UTC).isoformat(),
    }


def _cache_path(cache_dir: Path, repo: str, pr_number: int) -> Path:
    owner, name = repo.split("/")
    repo_dir = cache_dir / f"{owner}-{name}"
    repo_dir.mkdir(parents=True, exist_ok=True)
    return repo_dir / f"pr-{pr_number}.json"


async def fetch_pr_archaeology(
    client: GitHubClient,
    repo: str,
    pr_number: int,
    *,
    cache_dir: Path | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Fetch a PR's full archaeological record, caching JSON on disk."""
    owner, name = repo.split("/")
    resolved_cache_dir = cache_dir or client.cache_dir
    path = _cache_path(resolved_cache_dir, repo, pr_number)

    if path.exists() and not force_refresh:
        with path.open() as fh:
            return dict(json.load(fh))

    data = await client.graphql(
        PR_ARCHAEOLOGY_QUERY,
        variables={"owner": owner, "repo": name, "pr": pr_number},
    )
    pr = data["repository"]["pullRequest"]
    if pr is None:
        raise ValueError(f"PR not found: {repo}#{pr_number}")
    record = _normalize(pr, repo=repo)
    with path.open("w") as fh:
        json.dump(record, fh, indent=2)
    return record


async def list_recent_merged_prs(
    client: GitHubClient, repo: str, limit: int = 200
) -> list[dict[str, Any]]:
    """List recent merged PRs for a repo via GraphQL, paginated."""
    owner, name = repo.split("/")
    collected: list[dict[str, Any]] = []
    cursor: str | None = None
    while len(collected) < limit:
        data = await client.graphql(
            PR_LIST_QUERY,
            variables={"owner": owner, "repo": name, "after": cursor},
        )
        prs = data["repository"]["pullRequests"]
        for node in prs["nodes"]:
            collected.append(
                {
                    "number": node["number"],
                    "title": node["title"],
                    "author": (node.get("author") or {}).get("login"),
                    "merged_at": node["mergedAt"],
                    "additions": node["additions"],
                    "deletions": node["deletions"],
                    "comments": node["comments"]["totalCount"],
                    "review_threads": node["reviewThreads"]["totalCount"],
                }
            )
            if len(collected) >= limit:
                break
        if not prs["pageInfo"]["hasNextPage"]:
            break
        cursor = prs["pageInfo"]["endCursor"]
    return collected
