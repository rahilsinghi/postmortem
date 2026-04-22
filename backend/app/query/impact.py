"""Impact Ripple query — traverse decision edges from an anchor, reason on the subgraph.

Pattern:
1. Caller identifies an anchor decision (by PR number or by name-match against
   the user's question).
2. BFS outward across `decision_edges` up to `max_depth` hops.
3. Pass the anchor + subgraph + question to Opus 4.7 with a specialized prompt
   that asks "what breaks if we change this?".

The subgraph is much smaller than the full ledger, so the query is cheaper
per call (~$0.40 vs ~$2 for a whole-ledger query). Useful for focused
"if I swap Redis for Memcached, what breaks?" style questions.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any

from app.ledger.load import LedgerSnapshot


@dataclass
class ImpactSubgraph:
    anchor_pr: int
    anchor_title: str
    anchor_category: str
    included_prs: list[int]
    decisions: list[dict[str, Any]]
    edges: list[dict[str, Any]]


def find_anchor(
    snapshot: LedgerSnapshot,
    anchor_pr: int | None,
    anchor_query: str | None,
) -> dict[str, Any] | None:
    """Resolve an anchor decision either by exact PR number or by fuzzy title match."""
    if anchor_pr is not None:
        for d in snapshot.decisions:
            if d["pr_number"] == anchor_pr:
                return d
        return None

    if not anchor_query:
        return None

    needle = anchor_query.lower()
    best: dict[str, Any] | None = None
    best_score = 0
    for d in snapshot.decisions:
        title = (d.get("title") or "").lower()
        summary = (d.get("summary") or "").lower()
        score = 0
        for token in needle.split():
            if len(token) < 3:
                continue
            if token in title:
                score += 3
            elif token in summary:
                score += 1
        if score > best_score:
            best_score = score
            best = d
    return best if best_score >= 3 else None


def build_impact_subgraph(
    snapshot: LedgerSnapshot,
    anchor: dict[str, Any],
    *,
    max_depth: int = 2,
    max_nodes: int = 20,
) -> ImpactSubgraph:
    """BFS across decision_edges in both directions from `anchor`."""
    by_id = {d["id"]: d for d in snapshot.decisions}
    edges_by_endpoint: dict[str, list[dict[str, Any]]] = {}
    for e in snapshot.edges:
        edges_by_endpoint.setdefault(e["from_id"], []).append(e)
        edges_by_endpoint.setdefault(e["to_id"], []).append(e)

    visited: set[str] = {anchor["id"]}
    queue: deque[tuple[str, int]] = deque([(anchor["id"], 0)])
    included_edges: list[dict[str, Any]] = []

    while queue and len(visited) < max_nodes:
        current, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for edge in edges_by_endpoint.get(current, []):
            neighbor = edge["to_id"] if edge["from_id"] == current else edge["from_id"]
            if edge not in included_edges:
                included_edges.append(edge)
            if neighbor not in visited and neighbor in by_id:
                visited.add(neighbor)
                queue.append((neighbor, depth + 1))
                if len(visited) >= max_nodes:
                    break

    subgraph_decisions = [by_id[i] for i in visited if i in by_id]

    return ImpactSubgraph(
        anchor_pr=anchor["pr_number"],
        anchor_title=anchor["title"],
        anchor_category=anchor["category"],
        included_prs=[d["pr_number"] for d in subgraph_decisions],
        decisions=subgraph_decisions,
        edges=included_edges,
    )


IMPACT_SYSTEM_PROMPT = """\
You are Postmortem in Impact-Ripple mode. You are given:

  1. An ANCHOR decision — the specific architectural choice the user is
     considering changing or reverting.
  2. A SUBGRAPH of the decision ledger — every decision connected to the
     anchor within 2 hops (supersedes, depends_on, related_to), plus the
     edges linking them.
  3. The user's question, typically "what breaks if I change X?" or
     "what would have to move if I reverted Y?".

# YOUR JOB

Trace what would fracture if the anchor decision were reversed. Follow the
`depends_on` edges outward — every decision that depends on the anchor is a
direct casualty; anything the casualties depend on becomes a second-order
effect; and so on.

# YOUR RULES

1. **Only reason from the subgraph provided.** Do not invent dependencies.
2. **Cite every claim** using the same inline format as the main query mode:
     [PR #N, @author, YYYY-MM-DD]
   Citations must correspond to entries in the subgraph's decisions or their
   nested `citations[]`.
3. **If the subgraph is thin**, say so. Suggest what the user should check
   directly on GitHub.
4. **Name the casualties, don't just describe them.** Each affected decision
   should be referenced by its PR number and title.

# STRUCTURE

## Direct impact
Decisions that depend directly on the anchor. For each:
- **PR #N — {title}**: what breaks specifically. [citation]

## Second-order impact
Decisions that depend on the direct-impact decisions. Usually 0-3 items.

## Safe to unwind
Decisions that *appear* related but whose dependency is `related_to` (not
structural) — these are probably unaffected. List them to reassure the user.

## What's NOT in the subgraph
Things you'd expect to be affected but which aren't in the ledger. One or two
sentences. The ledger is incomplete by definition; call out blind spots.

## Suggested follow-ups
1-3 GitHub pointers the user should read before acting.
"""


def build_impact_user_prompt(subgraph: ImpactSubgraph, question: str) -> str:
    import json as _json

    payload = {
        "anchor": {
            "pr_number": subgraph.anchor_pr,
            "title": subgraph.anchor_title,
            "category": subgraph.anchor_category,
        },
        "subgraph_decisions": subgraph.decisions,
        "subgraph_edges": subgraph.edges,
    }
    return (
        f"Anchor: PR #{subgraph.anchor_pr} — {subgraph.anchor_title}\n"
        f"Subgraph size: {len(subgraph.decisions)} decisions, "
        f"{len(subgraph.edges)} edges.\n\n"
        "SUBGRAPH (JSON):\n"
        f"{_json.dumps(payload, indent=2, default=str)}\n\n"
        "---\n"
        f"Question: {question}\n\n"
        "Answer in the structured format specified by your system prompt. "
        "Cite every claim inline."
    )
