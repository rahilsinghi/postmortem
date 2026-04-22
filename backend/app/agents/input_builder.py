"""Serialize PR-archaeology records into compact inputs for each sub-agent.

The classifier only needs a condensed view (title + body + top comments + diff
stats). The extractor needs the full thread text with citation metadata so it can
emit per-claim citations.
"""

from __future__ import annotations

import json
from typing import Any


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 50] + f"... [truncated, original {len(text)} chars]"


def build_classifier_input(pr: dict[str, Any]) -> str:
    """Condense a PR into ~8KB suitable for Sonnet-4.6 classification."""
    diff = pr.get("diff_stats", {})
    convo_snippets = [
        {
            "author": c.get("author"),
            "body": _truncate(c.get("body", ""), 500),
        }
        for c in (pr.get("conversation_comments") or [])[:8]
    ]
    inline_snippets = [
        {
            "author": c.get("author"),
            "path": c.get("path"),
            "body": _truncate(c.get("body", ""), 300),
        }
        for c in (pr.get("inline_review_comments") or [])[:8]
    ]
    review_bodies = [
        {"author": r.get("author"), "state": r.get("state"), "body": _truncate(r.get("body") or "", 300)}
        for r in (pr.get("reviews") or [])
        if r.get("body")
    ][:5]

    payload = {
        "repo": pr.get("repo"),
        "pr_number": pr.get("pr_number"),
        "url": pr.get("url"),
        "title": pr.get("title"),
        "author": pr.get("author"),
        "state": pr.get("state"),
        "labels": pr.get("labels", []),
        "body": _truncate(pr.get("body", "") or "", 4000),
        "diff_stats": diff,
        "conversation_comments_preview": convo_snippets,
        "inline_review_comments_preview": inline_snippets,
        "reviews_preview": review_bodies,
        "total_conversation_comments": len(pr.get("conversation_comments") or []),
        "total_inline_review_comments": len(pr.get("inline_review_comments") or []),
        "total_linked_issues": len(pr.get("linked_issues") or []),
        "total_commits": len(pr.get("commits") or []),
    }
    return json.dumps(payload, indent=2)


def build_extractor_input(pr: dict[str, Any], *, include_diff_stats: bool = True) -> str:
    """Serialize the full archaeology for the rationale-extractor.

    Preserves every comment's id/author/url/timestamp so the extractor can emit
    valid citations. Does NOT include the diff itself (SKILL.md forbids it).
    """
    filtered = {
        "repo": pr.get("repo"),
        "pr_number": pr.get("pr_number"),
        "url": pr.get("url"),
        "title": pr.get("title"),
        "author": pr.get("author"),
        "state": pr.get("state"),
        "merged_at": pr.get("merged_at"),
        "created_at": pr.get("created_at"),
        "labels": pr.get("labels", []),
        "body": pr.get("body") or "",
        "reviews": pr.get("reviews", []),
        "conversation_comments": pr.get("conversation_comments", []),
        "inline_review_comments": pr.get("inline_review_comments", []),
        "linked_issues": pr.get("linked_issues", []),
        "commits": [
            {
                "sha": c.get("sha"),
                "message": c.get("message"),
                "author": c.get("author"),
                "committed_at": c.get("committed_at"),
            }
            for c in pr.get("commits", [])
        ],
        "timeline_events": pr.get("timeline_events", []),
    }
    if include_diff_stats:
        filtered["diff_stats"] = pr.get("diff_stats", {})
    return json.dumps(filtered, indent=2, default=str)


def build_stitcher_input(
    new_decisions: list[dict[str, Any]],
    existing_summary: list[dict[str, Any]],
) -> str:
    payload = {
        "new_decisions": new_decisions,
        "existing_decisions": existing_summary,
    }
    return json.dumps(payload, indent=2, default=str)
