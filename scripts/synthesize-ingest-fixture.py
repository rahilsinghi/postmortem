"""Synthesize a realistic /api/ingest SSE event stream from an existing
live ledger. Zero API cost — reads the ledger, fabricates a plausible
classifier + extractor sequence that matches the shape captured by
scripts/capture-demo-fixtures.py.

Usage:
    uv run --project backend python scripts/synthesize-ingest-fixture.py \\
        --repo vercel/next.js \\
        --out public/demo/nextjs-ingest-events.json \\
        --total-prs 68 \\
        --total-ms 32000

The demo layer replays this fixture during the ingest beat.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = "http://127.0.0.1:8765"

CLASSIFIER_THRESHOLD = 0.55


def fetch_ledger(repo: str) -> dict[str, Any]:
    r = httpx.get(f"{BACKEND}/api/repos/{repo}/ledger", timeout=30)
    r.raise_for_status()
    return r.json()


def synthesize(
    repo: str,
    ledger: dict[str, Any],
    *,
    total_prs: int,
    total_ms: int,
    min_discussion: int = 3,
    pr_limit: int = 100,
    seed: int = 17,
) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    decisions: list[dict[str, Any]] = ledger["decisions"]
    accepted_count = len(decisions)
    rejected_count = max(0, total_prs - accepted_count)

    # Generate fake PR numbers for the rejected set, interleaved with accepted ones
    accepted_prs = sorted(d["pr_number"] for d in decisions)
    lo, hi = accepted_prs[0], accepted_prs[-1]
    rejected_prs: list[int] = []
    used = set(accepted_prs)
    while len(rejected_prs) < rejected_count:
        candidate = rng.randint(lo - 40, hi + 40)
        if candidate not in used and candidate > 0:
            rejected_prs.append(candidate)
            used.add(candidate)

    # Build the ordered list of PR numbers — stable shuffle so classifier
    # events are interleaved (not all accepted at the start)
    all_prs: list[tuple[int, bool]] = [(pr, True) for pr in accepted_prs] + [
        (pr, False) for pr in rejected_prs
    ]
    rng.shuffle(all_prs)
    all_prs = all_prs[:total_prs]

    events: list[dict[str, Any]] = []
    cost_so_far = 0.0
    accepted_so_far = 0
    rejected_so_far = 0
    decisions_by_pr = {d["pr_number"]: d for d in decisions}

    # Time budget allocation (in ms, relative to stream start):
    #   0-80       — start
    #   80-3500    — listing
    #   3500       — filtered + listed
    #   3500..BIG  — classifier events (interleaved)
    #   (during)   — extractor events fire after their classifier
    #   BIG..TOTAL — persisting + done
    t_start = 15
    t_listing = 80
    t_listed = 3500
    t_persisting = int(total_ms - 2500)
    t_done = total_ms

    # Events
    events.append(
        {
            "ts_ms": t_start,
            "event": "start",
            "data": {
                "type": "start",
                "repo": repo,
                "pr_limit": pr_limit,
                "min_discussion": min_discussion,
                "concurrency": 4,
                "classifier_threshold": CLASSIFIER_THRESHOLD,
            },
        }
    )
    events.append(
        {
            "ts_ms": t_listing,
            "event": "listing",
            "data": {"type": "listing", "pr_limit": pr_limit},
        }
    )
    events.append(
        {
            "ts_ms": t_listed - 80,
            "event": "filtered",
            "data": {
                "type": "filtered",
                "before": pr_limit,
                "after": total_prs,
                "min_discussion": min_discussion,
            },
        }
    )
    events.append(
        {
            "ts_ms": t_listed,
            "event": "listed",
            "data": {"type": "listed", "count": total_prs},
        }
    )

    # Classifier events spread evenly from t_listed to t_persisting - 2000ms
    classifier_window_start = t_listed + 400
    classifier_window_end = t_persisting - 2000
    classifier_span = classifier_window_end - classifier_window_start
    per_classifier_ms = classifier_span / max(1, len(all_prs))

    for idx, (pr, is_accepted) in enumerate(all_prs, start=1):
        ts = int(classifier_window_start + per_classifier_ms * idx)
        if is_accepted:
            accepted_so_far += 1
            cost_so_far += 0.010 + rng.uniform(-0.002, 0.004)
            decision = decisions_by_pr[pr]
            events.append(
                {
                    "ts_ms": ts,
                    "event": "pr_classified",
                    "data": {
                        "type": "pr_classified",
                        "idx": idx,
                        "total": total_prs,
                        "pr_number": pr,
                        "accepted": True,
                        "is_decision": True,
                        "confidence": float(decision.get("confidence") or 0.82),
                        "decision_type": decision.get("category"),
                        "title": decision.get("title"),
                        "cost_so_far": round(cost_so_far, 6),
                        "accepted_so_far": accepted_so_far,
                        "rejected_so_far": rejected_so_far,
                    },
                }
            )
        else:
            rejected_so_far += 1
            cost_so_far += 0.006 + rng.uniform(-0.002, 0.003)
            events.append(
                {
                    "ts_ms": ts,
                    "event": "pr_classified",
                    "data": {
                        "type": "pr_classified",
                        "idx": idx,
                        "total": total_prs,
                        "pr_number": pr,
                        "accepted": False,
                        "is_decision": False,
                        "confidence": round(rng.uniform(0.55, 0.98), 2),
                        "decision_type": None,
                        "title": None,
                        "cost_so_far": round(cost_so_far, 6),
                        "accepted_so_far": accepted_so_far,
                        "rejected_so_far": rejected_so_far,
                    },
                }
            )

    # Extractor events: each extractor fires ~3-8 seconds after its classifier,
    # but all extractors complete before persisting starts.
    for idx, (pr, is_accepted) in enumerate(all_prs, start=1):
        if not is_accepted:
            continue
        decision = decisions_by_pr[pr]
        classifier_ts = int(classifier_window_start + per_classifier_ms * idx)
        extractor_ts = classifier_ts + rng.randint(3500, 7500)
        # Clamp so extractors finish before persisting
        extractor_ts = min(extractor_ts, t_persisting - 200)
        citations = (
            sum(
                len(decision["citations"].get(k, []))
                for k in ("context", "decision", "forces", "consequences")
            )
            or 0
        )
        alternatives = len(decision.get("alternatives", []))
        cost_so_far += 0.25 + rng.uniform(-0.05, 0.15)
        events.append(
            {
                "ts_ms": extractor_ts,
                "event": "pr_extracted",
                "data": {
                    "type": "pr_extracted",
                    "pr_number": pr,
                    "title": decision.get("title"),
                    "category": decision.get("category"),
                    "citations": citations,
                    "alternatives": alternatives,
                },
            }
        )

    events.append(
        {
            "ts_ms": t_persisting,
            "event": "persisting",
            "data": {"type": "persisting"},
        }
    )
    events.append(
        {
            "ts_ms": t_done,
            "event": "done",
            "data": {
                "type": "done",
                "repo": repo,
                "prs_seen": total_prs,
                "classifier_accepted": accepted_so_far,
                "classifier_rejected": rejected_so_far,
                "decisions_written": accepted_so_far,
                "edges_written": ledger.get("edge_count", 0),
                "cost_usd": round(cost_so_far, 4),
                "input_tokens": 850_000,
                "output_tokens": 160_000,
            },
        }
    )

    # Sort by ts_ms so the replay order is monotonic
    events.sort(key=lambda e: e["ts_ms"])
    return events


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo", required=True, help="owner/name — must exist in the ledger DB"
    )
    parser.add_argument("--out", required=True, help="output JSON path")
    parser.add_argument(
        "--total-prs", type=int, default=68, help="synthesized total PRs scanned"
    )
    parser.add_argument(
        "--total-ms",
        type=int,
        default=32000,
        help="synthesized total stream duration (ms)",
    )
    parser.add_argument("--min-discussion", type=int, default=3)
    parser.add_argument("--pr-limit", type=int, default=100)
    args = parser.parse_args()

    ledger = fetch_ledger(args.repo)
    events = synthesize(
        args.repo,
        ledger,
        total_prs=args.total_prs,
        total_ms=args.total_ms,
        min_discussion=args.min_discussion,
        pr_limit=args.pr_limit,
    )

    out_path = REPO_ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(
            {
                "events": events,
                "event_count": len(events),
                "synthesized": True,
                "source_repo": args.repo,
                "source_decision_count": ledger.get("decision_count"),
            },
            indent=2,
        )
    )
    tmp.replace(out_path)

    classified = sum(1 for e in events if e["event"] == "pr_classified")
    extracted = sum(1 for e in events if e["event"] == "pr_extracted")
    print(
        f"Wrote {out_path} — {len(events)} events "
        f"({classified} classifier, {extracted} extractor, total {args.total_ms}ms)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
