"""Managed Agents wrapper around decision archaeology.

Day 2 scope: prove the end-to-end MA pipeline by running a single-PR
archaeology inside a hosted agent session. The agent:

1. Receives a PR URL and the archaeology JSON as user-message context.
2. Classifies (via the decision-classifier system prompt) and, if accepted,
   extracts rationale + alternatives (via the rationale-extractor system prompt).
3. Streams events back to the caller.

Why this shape instead of a fully-autonomous ingester: the $20 bulk ingestion
already proved the local orchestrator (`app.ingest`) is correct. Putting the
same logic inside a long-lived Managed Agents session is an architectural
optimization for Day 3 (resumability, streaming UX). For Day 2, we use MA as
the execution vehicle for a single reproducible run so the beta integration
is demonstrated live — not just smoke-tested.

All MA calls go through the Anthropic SDK per the feedback memory
(`feedback_managed_agents_sdk.md`). Raw HTTP is never used for session/events.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic

from app.agents.loader import load_agent

MA_BETA = "managed-agents-2026-04-01"


@dataclass
class SingleSessionResult:
    session_id: str
    agent_id: str
    environment_id: str
    tool_uses: list[dict[str, Any]]
    agent_text: str
    saw_idle: bool


def run_single_archaeology_session(
    client: Anthropic,
    pr: dict[str, Any],
    *,
    timeout_s: int = 180,
) -> SingleSessionResult:
    """Run one pr-archaeology pass through a Managed Agents session.

    `pr` is the normalized archaeology dict produced by
    `app.github.archaeology.fetch_pr_archaeology`. The function:

    * creates a scratch agent whose system prompt composes the classifier and
      extractor instructions, and whose tool is the bash agent_toolset,
    * creates a sandbox environment (cloud),
    * sends a single user message: "here's a PR, produce a decision-ledger
      record",
    * streams events until session.status_idle or timeout.
    """
    classifier = load_agent("decision-classifier")
    extractor = load_agent("rationale-extractor")

    combined_system = (
        "You are the Postmortem Ingestion agent. When given a PR archaeology, first apply "
        "the CLASSIFIER rubric below to decide if the PR is an architectural decision. If "
        "it is, apply the EXTRACTOR rubric. Return ONE JSON object with {classification, "
        "extraction}.\n\n"
        "=== CLASSIFIER RUBRIC ===\n"
        f"{classifier.system}\n\n"
        "=== EXTRACTOR RUBRIC ===\n"
        f"{extractor.system}\n"
    )

    agent = client.beta.agents.create(
        name="postmortem-ingest-single",
        model="claude-opus-4-7",
        system=combined_system,
        tools=[{"type": "agent_toolset_20260401"}],
    )

    environment = client.beta.environments.create(
        name="postmortem-ingest-env",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )

    session = client.beta.sessions.create(
        agent=agent.id,
        environment_id=environment.id,
        title=f"postmortem ingest {pr.get('repo')}#{pr.get('pr_number')}",
    )

    tool_uses: list[dict[str, Any]] = []
    agent_text_parts: list[str] = []
    saw_idle = False
    deadline = time.time() + timeout_s

    user_payload = (
        "PR archaeology JSON follows. Classify it; if it's a decision, extract. "
        'Return ONE JSON object: {"classification": {...}, "extraction": {...|null}}.\n\n'
        + _compact_archaeology(pr)
    )

    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": user_payload}],
                }
            ],
        )

        for event in stream:
            if time.time() > deadline:
                break
            etype = getattr(event, "type", None)
            if etype == "agent.message":
                for block in getattr(event, "content", []) or []:
                    text = getattr(block, "text", None)
                    if text:
                        agent_text_parts.append(text)
            elif etype == "agent.tool_use":
                tool_uses.append(
                    {
                        "name": getattr(event, "name", None),
                        "input": getattr(event, "input", None),
                    }
                )
            elif etype == "session.status_idle":
                saw_idle = True
                break

    return SingleSessionResult(
        session_id=session.id,
        agent_id=agent.id,
        environment_id=environment.id,
        tool_uses=tool_uses,
        agent_text="".join(agent_text_parts),
        saw_idle=saw_idle,
    )


def _compact_archaeology(pr: dict[str, Any]) -> str:
    """Trim the archaeology to fields an MA agent actually needs to classify+extract."""
    import json

    slim = {
        "repo": pr.get("repo"),
        "pr_number": pr.get("pr_number"),
        "url": pr.get("url"),
        "title": pr.get("title"),
        "author": pr.get("author"),
        "state": pr.get("state"),
        "merged_at": pr.get("merged_at"),
        "body": pr.get("body", ""),
        "diff_stats": pr.get("diff_stats", {}),
        "reviews": pr.get("reviews", []),
        "conversation_comments": pr.get("conversation_comments", []),
        "inline_review_comments": pr.get("inline_review_comments", []),
        "linked_issues": pr.get("linked_issues", []),
    }
    return json.dumps(slim, indent=2, default=str)
