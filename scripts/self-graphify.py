"""Ingest Postmortem's own git history into the decision ledger.

The signature "self-graphify" moment from the SPEC's meta-move: we've been
writing our own commit messages like PR descriptions on purpose, knowing this
day would come. This script walks `git log`, shapes each substantive commit
into a pseudo-PR-archaeology record, and runs the same classifier + extractor
pipeline we use for external repos. The resulting decisions land in the
ledger under `repo = "rahilsinghi/postmortem"` so the gallery surfaces them
alongside zustand / shadcn-ui / hono.

Why not the real PR pipeline: this repo has been committed direct-to-main
(the commits-as-PRs pattern SPEC §Git hygiene invited). There are no actual
PRs to fetch, but the commit bodies carry the same narrative.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from anthropic import AsyncAnthropic  # noqa: E402

from app.agents.cost import CostTracker  # noqa: E402
from app.agents.pipeline import classify_and_extract  # noqa: E402
from app.agents.runner import run_stitcher  # noqa: E402
from app.config import resolve_secret  # noqa: E402
from app.ledger.models import DecisionEdge, DecisionEdgeKind  # noqa: E402
from app.ledger.store import LedgerStore  # noqa: E402

SELF_REPO = "rahilsinghi/postmortem"
DEFAULT_DB = REPO_ROOT / ".cache" / "ledger.duckdb"


def git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def fetch_commits() -> list[dict[str, str]]:
    """Return commits newest-first with SHA, author, date, and full body."""
    # Use a marker that almost certainly won't appear in commit messages.
    sep = "<<<POSTMORTEM-COMMIT>>>"
    fmt = f"%H%n%an%n%ae%n%cI%n%s%n%b%n{sep}"
    raw = git(["log", f"--format={fmt}", "--no-merges"])
    commits = []
    for block in raw.split(sep):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        if len(lines) < 5:
            continue
        sha, author_name, author_email, iso_date, subject, *body_lines = lines
        commits.append(
            {
                "sha": sha.strip(),
                "author": author_name.strip(),
                "email": author_email.strip(),
                "date": iso_date.strip(),
                "subject": subject.strip(),
                "body": "\n".join(body_lines).strip(),
            }
        )
    return commits


def commit_diff_stats(sha: str) -> dict[str, int]:
    """Call `git show --stat` and scrape files-changed / additions / deletions."""
    try:
        out = git(["show", "--stat", "--format=", sha])
    except subprocess.CalledProcessError:
        return {"files_changed": 0, "additions": 0, "deletions": 0}
    last_line = out.strip().split("\n")[-1] if out.strip() else ""
    # Format: "N files changed, X insertions(+), Y deletions(-)"
    import re

    files = int(re.search(r"(\d+) files? changed", last_line).group(1)) if "changed" in last_line else 0
    adds = int(re.search(r"(\d+) insertions?", last_line).group(1)) if "insertions" in last_line else 0
    dels = int(re.search(r"(\d+) deletions?", last_line).group(1)) if "deletions" in last_line else 0
    return {"files_changed": files, "additions": adds, "deletions": dels}


def commit_to_pseudo_archaeology(commit: dict[str, str], pr_number: int) -> dict:
    """Shape a commit into a record the existing classifier/extractor will accept."""
    body = (
        f"{commit['subject']}\n\n{commit['body']}" if commit["body"] else commit["subject"]
    )
    diff = commit_diff_stats(commit["sha"])
    url = f"https://github.com/{SELF_REPO}/commit/{commit['sha']}"
    handle = commit["author"].replace(" ", "-").lower()

    return {
        "repo": SELF_REPO,
        "pr_number": pr_number,
        "title": commit["subject"],
        "body": body,
        "author": handle,
        "state": "MERGED",
        "merged_at": commit["date"],
        "created_at": commit["date"],
        "updated_at": commit["date"],
        "url": url,
        "diff_stats": diff,
        "labels": [],
        "reviewers_requested": [],
        "reviews": [],
        "conversation_comments": [],
        "inline_review_comments": [],
        "linked_issues": [],
        "commits": [
            {
                "sha": commit["sha"],
                "message": body,
                "author": commit["author"],
                "committed_at": commit["date"],
            }
        ],
        "timeline_events": [],
    }


async def main() -> int:
    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        return 2

    commits = fetch_commits()
    print(f"[self-graphify] found {len(commits)} commits in {SELF_REPO}")

    # Sequential pr_number from 1 (oldest) up — stable across reruns as long as
    # history isn't rewritten. Makes ordering in the gallery sensible.
    commits.reverse()  # oldest first
    records = [commit_to_pseudo_archaeology(c, idx + 1) for idx, c in enumerate(commits)]

    client = AsyncAnthropic(api_key=api_key)
    tracker = CostTracker()

    pipeline_results = []
    for pr in records:
        print(
            f"[self-graphify] #{pr['pr_number']:2d}  {pr['title'][:80]}  "
            f"(+{pr['diff_stats']['additions']}/-{pr['diff_stats']['deletions']} in {pr['diff_stats']['files_changed']} files)"
        )
        result = await classify_and_extract(client, pr, tracker=tracker, threshold=0.50)
        pipeline_results.append((pr, result))
        cls = result.classification
        status = "ACCEPTED" if cls.is_decision and cls.confidence >= 0.50 else "rejected"
        print(
            f"  classifier: {status:8s}  conf={cls.confidence:.2f}  type={cls.decision_type}"
        )

    new_decision_summaries = []
    pr_to_decision_id: dict[int, object] = {}

    with LedgerStore(DEFAULT_DB) as store:
        run_stats = store.start_ingestion_run(SELF_REPO)
        run_stats.prs_seen = len(records)

        for _pr, result in pipeline_results:
            if result.record is None:
                continue
            decision_id = store.upsert_decision(result.record)
            pr_to_decision_id[result.record.pr_number] = decision_id
            new_decision_summaries.append(
                {
                    "pr_number": result.record.pr_number,
                    "title": result.record.title,
                    "category": result.record.category.value,
                    "summary": result.record.summary[:200],
                }
            )
            print(f"  ↳ wrote decision #{result.record.pr_number}: {result.record.title[:80]}")

        if len(new_decision_summaries) >= 2:
            print(
                f"\n[self-graphify] stitching edges across {len(new_decision_summaries)} decisions..."
            )
            try:
                edges = await run_stitcher(
                    client, new_decision_summaries, [], tracker=tracker
                )
            except Exception as exc:
                print(f"  stitcher error (non-fatal): {exc!r}")
                edges = []
            for edge in edges:
                from_pr = edge.get("from_pr_number")
                to_pr = edge.get("to_pr_number")
                kind_raw = edge.get("kind", "related_to")
                try:
                    kind = DecisionEdgeKind(kind_raw)
                except ValueError:
                    kind = DecisionEdgeKind.RELATED_TO
                if from_pr in pr_to_decision_id and to_pr in pr_to_decision_id:
                    store.upsert_edge(
                        DecisionEdge(
                            from_id=pr_to_decision_id[from_pr],  # type: ignore[arg-type]
                            to_id=pr_to_decision_id[to_pr],  # type: ignore[arg-type]
                            kind=kind,
                            reason=edge.get("reason"),
                        )
                    )
                    print(f"  edge {from_pr} --[{kind.value}]--> {to_pr}")

        totals = tracker.totals()
        run_stats.input_tokens = totals.input_tokens
        run_stats.output_tokens = totals.output_tokens
        run_stats.cost_usd = totals.cost_usd
        run_stats.decisions_written = len(new_decision_summaries)
        store.finalize_ingestion_run(run_stats, notes="day-5 self-graphify")

    print("\n" + tracker.pretty())
    print(f"\n[self-graphify] wrote {len(new_decision_summaries)} decisions to {DEFAULT_DB}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
