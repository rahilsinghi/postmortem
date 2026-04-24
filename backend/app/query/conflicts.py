"""Conflict Finder engine — scan the ledger for contradicting decisions.

One Opus 4.7 call with the full ledger in context, returning a strict-JSON
list of conflict pairs. Cache-first: `load_cached` reads the per-repo row;
`generate_and_cache` runs the model, persists, and returns the parsed body.

The cached path is demo-cheap — re-opening the Conflict Finder panel for
the same repo is a single DuckDB hit with zero Opus tokens. Pass
``force=True`` to ignore the cache (e.g. after a re-ingest).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from app.agents.json_utils import extract_json
from app.ledger.load import LedgerSnapshot
from app.ledger.schema import connect
from app.query.prompts import CONFLICT_FINDER_SYSTEM_PROMPT

CONFLICT_MODEL = "claude-opus-4-7"
CONFLICT_MAX_TOKENS = 4096


def _compact_ledger(snapshot: LedgerSnapshot) -> str:
    return json.dumps(
        {
            "repo": snapshot.repo,
            "decisions": snapshot.decisions,
            "edges": snapshot.edges,
        },
        indent=2,
        default=str,
    )


def load_cached(db_path: str | Path, repo: str) -> dict[str, Any] | None:
    conn = connect(str(db_path))
    try:
        row = conn.execute(
            """
            SELECT generated_at, model, conflicts_json, token_usage
            FROM conflicts_cache
            WHERE repo = ?
            """,
            [repo],
        ).fetchone()
        if row is None:
            return None
        return {
            "generated_at": row[0].isoformat() if hasattr(row[0], "isoformat") else row[0],
            "model": row[1],
            "conflicts": json.loads(row[2]).get("conflicts", []),
            "token_usage": json.loads(row[3]),
            "cached": True,
        }
    finally:
        conn.close()


def _persist(
    db_path: str | Path,
    *,
    repo: str,
    conflicts: list[dict[str, Any]],
    usage: dict[str, int],
) -> None:
    conn = connect(str(db_path))
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO conflicts_cache
              (repo, generated_at, model, conflicts_json, token_usage)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                repo,
                datetime.now(timezone.utc),
                CONFLICT_MODEL,
                json.dumps({"conflicts": conflicts}),
                json.dumps(usage),
            ],
        )
    finally:
        conn.close()


async def generate_and_cache(
    *,
    client: AsyncAnthropic,
    db_path: str | Path,
    snapshot: LedgerSnapshot,
) -> dict[str, Any]:
    """Run the conflict-finder model pass and persist the result."""
    user_text = (
        f"Repository: {snapshot.repo}\n"
        f"Ledger size: {snapshot.decision_count} decisions · "
        f"{snapshot.citation_count} citations · "
        f"{len(snapshot.edges)} edges\n\n"
        "Ledger (JSON):\n"
        f"{_compact_ledger(snapshot)}\n\n"
        "Return the JSON object described in your system prompt."
    )

    response = await client.messages.create(
        model=CONFLICT_MODEL,
        max_tokens=CONFLICT_MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": CONFLICT_FINDER_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_text}],
    )

    text_parts: list[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(getattr(block, "text", ""))
    body = "".join(text_parts)

    try:
        parsed = extract_json(body)
        conflicts = parsed.get("conflicts", []) if isinstance(parsed, dict) else []
    except ValueError:
        conflicts = []

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_creation_input_tokens": getattr(
            response.usage, "cache_creation_input_tokens", 0
        )
        or 0,
        "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0)
        or 0,
    }

    _persist(db_path, repo=snapshot.repo, conflicts=conflicts, usage=usage)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": CONFLICT_MODEL,
        "conflicts": conflicts,
        "token_usage": usage,
        "cached": False,
    }
