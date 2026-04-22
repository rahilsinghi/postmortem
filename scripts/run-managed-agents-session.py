"""Run a single-PR decision-archaeology pass through a Managed Agents session.

This is the Day 2 proof-of-life for the MA integration: one cached PR
archaeology → MA session with combined classifier+extractor prompts → streamed
events → extracted JSON printed to stdout.

Usage (from repo root, after fetch-pr.py has cached the target PR):
    uv run --project backend python scripts/run-managed-agents-session.py \\
        pmndrs/zustand 3336

The bulk ingestion (~41 decisions) was done via the local orchestrator in
scripts/ingest.py — this script exists to exercise the Managed Agents beta
against the same archaeology to demonstrate the MA path works end-to-end.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from anthropic import Anthropic  # noqa: E402

from app.config import resolve_secret  # noqa: E402
from app.managed_agents.session import run_single_archaeology_session  # noqa: E402

CACHE_DIR = REPO_ROOT / ".cache" / "pr-archaeology"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("pr_number", type=int)
    args = parser.parse_args()

    owner, name = args.repo.split("/")
    archaeology_path = CACHE_DIR / f"{owner}-{name}" / f"pr-{args.pr_number}.json"
    if not archaeology_path.exists():
        print(
            f"ERROR: archaeology not cached at {archaeology_path}. "
            f"Run `scripts/fetch-pr.py {args.repo} {args.pr_number}` first.",
            file=sys.stderr,
        )
        return 2

    with archaeology_path.open() as fh:
        pr = json.load(fh)

    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not available.", file=sys.stderr)
        return 2

    client = Anthropic(api_key=api_key)
    print(f"[ma] launching single-PR session for {args.repo}#{args.pr_number}...")
    result = run_single_archaeology_session(client, pr)

    print(f"[ma] session={result.session_id}")
    print(f"[ma] agent={result.agent_id}  env={result.environment_id}")
    print(f"[ma] tool_uses={len(result.tool_uses)}  saw_idle={result.saw_idle}")
    for tu in result.tool_uses:
        print(f"  tool_use: {tu['name']}")
    print("\n[ma] agent response:\n---")
    print(result.agent_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
