"""Postmortem MCP server — expose the decision-archaeology engine as MCP tools.

Registers 5 tools that Claude Code (or any MCP host) can invoke:

  postmortem_list_repos            — what ledgers are cached on this box?
  postmortem_list_decisions        — summary list of decisions in a repo
  postmortem_query                 — ask Opus 4.7 a question with citations
  postmortem_impact                — impact-ripple query anchored at a PR
  postmortem_open_decision         — pull one decision's full rationale + alts

Run directly:
    uv run --project backend python -m app.mcp_server

Register with Claude Code:
    claude mcp add postmortem \\
        --command 'uv run --project backend python -m app.mcp_server' \\
        --transport stdio
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic
from mcp.server.fastmcp import FastMCP

from app.config import get_settings, resolve_secret
from app.ledger.load import list_repos, load_ledger
from app.query.engine import QueryOptions, stream_query
from app.query.impact import build_impact_subgraph, build_impact_user_prompt, find_anchor

REPO_ROOT = Path(__file__).resolve().parents[2]


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        path = REPO_ROOT / settings.ledger_db_path
    return path


mcp = FastMCP(
    "postmortem",
    instructions=(
        "Postmortem reads a repo's PR history, reconstructs the architectural "
        "decisions + rejected alternatives, and answers questions with "
        "citations back to the exact reviewer comment. Use the listed tools "
        "to query an existing ledger; ingestion happens out-of-band via the "
        "web UI or scripts/ingest.py."
    ),
)


@mcp.tool()
async def postmortem_list_repos() -> str:
    """List every repo with a cached ledger on this machine.

    Returns a markdown table with repo name, decision count, category spread,
    time span, and cumulative API spend. Use this first when the user
    mentions Postmortem without a specific repo.
    """
    db_path = _resolve_db_path()
    if not db_path.exists():
        return "No ledger database found. Run an ingestion first via scripts/ingest.py."
    repos = list_repos(db_path)
    if not repos:
        return "No repos ingested yet."
    lines = ["| repo | decisions | categories | range | ingested |", "|---|---:|---:|---|---:|"]
    for r in repos:
        years = f"{(r.get('earliest') or '')[:4]}-{(r.get('latest') or '')[:4]}"
        lines.append(
            f"| `{r['repo']}` | {r['decisions']} | {r.get('categories', '?')} | "
            f"{years} | ${r.get('ingestion_cost_usd', 0):.2f} |"
        )
    return "\n".join(lines)


@mcp.tool()
async def postmortem_list_decisions(repo: str, category: str | None = None) -> str:
    """Summary list of decisions extracted for `repo`.

    Args:
        repo: owner/name, e.g. `honojs/hono`
        category: optional filter (e.g. `architecture`, `performance`, `api_contract`)

    Returns a compact markdown list — one row per decision — good for
    orienting yourself before calling postmortem_query or postmortem_open_decision.
    """
    db_path = _resolve_db_path()
    if not db_path.exists():
        return "No ledger database found."
    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        return (
            f"No decisions cached for `{repo}`. Try postmortem_list_repos to see what's available."
        )
    decisions = snapshot.decisions
    if category:
        decisions = [d for d in decisions if d.get("category") == category]
    if not decisions:
        return f"No decisions in `{repo}` match category `{category}`."
    lines = [f"## {repo} — {len(decisions)} decisions"]
    for d in decisions:
        date = (d.get("decided_at") or "")[:10]
        cat = d.get("category", "?")
        title = d.get("title", "").replace("\n", " ")[:100]
        lines.append(f"- **#{d['pr_number']}** · `{cat}` · {date} — {title}")
    return "\n".join(lines)


@mcp.tool()
async def postmortem_open_decision(repo: str, pr_number: int) -> str:
    """Fetch one decision's full rationale, rejected alternatives, and citations.

    Args:
        repo: owner/name
        pr_number: the PR number of the decision

    Returns a markdown-structured digest covering: summary, rationale citations,
    rejected alternatives with reasons, adjacent decisions.
    """
    db_path = _resolve_db_path()
    if not db_path.exists():
        return "No ledger database found."
    snapshot = load_ledger(db_path, repo)
    d = next((x for x in snapshot.decisions if x["pr_number"] == pr_number), None)
    if not d:
        return f"PR #{pr_number} not in the `{repo}` ledger."

    parts: list[str] = [f"# {d['title']}", f"`{repo}` · PR #{d['pr_number']} · {d.get('category')}"]
    if d.get("summary"):
        parts.extend(["", d["summary"]])
    if d.get("pr_url"):
        parts.extend(["", f"[Open on GitHub →]({d['pr_url']})"])

    citations = d.get("citations") or {}
    for bucket_name in ("decision", "forces", "consequences", "context"):
        bucket = citations.get(bucket_name, [])
        if not bucket:
            continue
        parts.extend(["", f"## {bucket_name.title()} citations"])
        for c in bucket:
            author = c.get("author") or "unknown"
            date = (c.get("timestamp") or "")[:10]
            parts.append(
                f"- **@{author}** ({date}) — {c.get('claim', '').strip()}\n"
                f"  > {c.get('quote', '').strip()}"
            )

    alts = d.get("alternatives", []) or []
    if alts:
        parts.extend(["", f"## Rejected alternatives ({len(alts)})"])
        for a in alts:
            parts.append(
                f"- **~~{a.get('name', '').strip()}~~** — {a.get('rejection_reason', '').strip()}"
            )
            q = a.get("rejection_reason_quoted")
            if q:
                parts.append(f"  > {q.strip()}")
    return "\n".join(parts)


def _compact_sse_stream_to_answer(
    events: list[tuple[str, Any]],
) -> tuple[str, dict[str, Any]]:
    """Reduce an SSE event stream to a single answer + metadata blob."""
    text = ""
    self_check: dict[str, Any] = {}
    usage: dict[str, Any] = {}
    for name, data in events:
        if name == "delta" and isinstance(data, dict):
            text += str(data.get("text", ""))
        elif name == "self_check" and isinstance(data, dict):
            self_check = data
        elif name == "usage" and isinstance(data, dict):
            usage = data
    return text, {"self_check": self_check, "usage": usage}


async def _collect_stream(agen: Any) -> list[tuple[str, Any]]:
    """Collect SSE events from an async iterator of pre-formatted SSE chunks."""
    out: list[tuple[str, Any]] = []
    async for chunk in agen:
        current_event: str | None = None
        for line in chunk.split("\n"):
            if line.startswith("event: "):
                current_event = line[len("event: ") :].strip()
            elif line.startswith("data: ") and current_event:
                raw = line[len("data: ") :]
                try:
                    out.append((current_event, json.loads(raw)))
                except ValueError:
                    out.append((current_event, raw))
    return out


def _render_query_result(
    repo: str,
    question: str,
    answer: str,
    meta: dict[str, Any],
) -> str:
    """Format the streamed answer + self-check + usage as a single markdown blob."""
    lines = [f"# Postmortem answer — `{repo}`", f"> {question}", "", answer.strip()]
    sc = meta.get("self_check") or {}
    if sc:
        verdict = sc.get("overall_verdict", "?")
        v = sc.get("verified_count", 0)
        u = sc.get("unverified_count", 0)
        lines.extend(["", "---", f"**Self-check:** `{verdict}` — verified {v}/{v + u}"])
    usage = meta.get("usage") or {}
    if usage:
        lines.append(
            f"**Usage:** input {usage.get('input_tokens', 0):,} · "
            f"output {usage.get('output_tokens', 0):,} · "
            f"cost ${usage.get('cost_usd', 0):.4f}"
        )
    return "\n".join(lines)


@mcp.tool()
async def postmortem_query(repo: str, question: str, self_check: bool = True) -> str:
    """Ask Opus 4.7 a question about `repo`, with inline citations.

    This is the main feature. Opus holds the full ledger in its 1M context
    and answers with citation tokens like `[PR #3813, @yusukebe, 2025-01-09]`
    that trace back to the exact reviewer comment. When `self_check` is on,
    a second pass verifies every citation against the ledger.

    Args:
        repo: owner/name, e.g. `honojs/hono`
        question: a natural-language question about architectural decisions
        self_check: verify citations (default true; slower + more expensive)

    Returns a markdown-formatted answer with citations, self-check verdict,
    and token / cost usage.
    """
    db_path = _resolve_db_path()
    if not db_path.exists():
        return "No ledger database found."
    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        return f"No decisions cached for `{repo}`."
    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        return "ANTHROPIC_API_KEY not set. Export it or add to .env.local."
    client = AsyncAnthropic(api_key=api_key)
    options = QueryOptions(effort="high", self_check=self_check)
    events = await _collect_stream(stream_query(client, snapshot, question, options=options))
    answer, meta = _compact_sse_stream_to_answer(events)
    if not answer.strip():
        return "Query produced no output — check backend logs for an error."
    return _render_query_result(repo, question, answer, meta)


@mcp.tool()
async def postmortem_impact(
    repo: str,
    anchor_pr: int,
    question: str,
    max_depth: int = 2,
) -> str:
    """Impact-ripple query — BFS from `anchor_pr` across the decision edges,
    hand only that subgraph to Opus, trace cascading consequences.

    Args:
        repo: owner/name
        anchor_pr: the PR that is the blast-radius origin
        question: a natural-language question about the impact
        max_depth: BFS depth (1-3, default 2)

    Returns a markdown answer with Direct / Second-order / Safe-to-unwind
    sections, each citation linked to the underlying PR discussion.
    """
    db_path = _resolve_db_path()
    if not db_path.exists():
        return "No ledger database found."
    snapshot = load_ledger(db_path, repo)
    anchor = find_anchor(snapshot, anchor_pr, question)
    if anchor is None:
        return f"PR #{anchor_pr} not found in `{repo}`."
    subgraph = build_impact_subgraph(snapshot, anchor, max_depth=max_depth)

    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        return "ANTHROPIC_API_KEY not set."
    client = AsyncAnthropic(api_key=api_key)

    # Reuse the query engine with a hand-built prompt — keeps the MCP server
    # small and avoids duplicating the impact router's streaming harness.
    from app.query.impact import IMPACT_SYSTEM_PROMPT

    user_text = build_impact_user_prompt(subgraph, question)
    try:
        resp = await client.messages.create(
            model="claude-opus-4-7",
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": IMPACT_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_text}],
        )
    except Exception as exc:
        return f"Impact query failed: {exc}"

    text = "".join(
        getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text"
    )
    usage = resp.usage
    parts = [
        f"# Impact ripple — `{repo}` anchored at PR #{anchor_pr}",
        f"> {question}",
        f"_Subgraph: {len(subgraph.decisions)} decisions, {len(subgraph.edges)} edges._",
        "",
        text.strip(),
        "",
        "---",
        f"**Usage:** input {usage.input_tokens:,} · output {usage.output_tokens:,}",
    ]
    return "\n".join(parts)


def main() -> None:
    """Entry point — runs the stdio MCP server."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
