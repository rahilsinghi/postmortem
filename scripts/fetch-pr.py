"""CLI wrapper around pr-archaeology for one-off PR fetches.

Usage (from repo root):
    uv run --project backend python scripts/fetch-pr.py pmndrs/zustand 3336
    uv run --project backend python scripts/fetch-pr.py pmndrs/zustand 3336 --refresh

Writes the JSON archaeology to `.cache/pr-archaeology/{owner}-{repo}/pr-{N}.json`
and prints a short summary to stdout.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env.local")
load_dotenv(REPO_ROOT / ".env")

sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.github.archaeology import fetch_pr_archaeology  # noqa: E402
from app.github.client import GitHubClient  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", help="owner/name, e.g. pmndrs/zustand")
    parser.add_argument("pr_number", type=int)
    parser.add_argument("--refresh", action="store_true", help="bypass on-disk cache")
    args = parser.parse_args()

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        print("ERROR: GITHUB_TOKEN not set (add to .env.local)", file=sys.stderr)
        return 2

    cache_dir = REPO_ROOT / ".cache" / "pr-archaeology"
    async with GitHubClient(token=token, cache_dir=cache_dir) as client:
        record = await fetch_pr_archaeology(
            client,
            args.repo,
            args.pr_number,
            cache_dir=cache_dir,
            force_refresh=args.refresh,
        )
        rl = client.last_rate_limit

    print(f"[archaeology] {args.repo}#{args.pr_number}  {record['state']}  {record['title']}")
    print(
        f"  diff: +{record['diff_stats']['additions']}/-{record['diff_stats']['deletions']} "
        f"across {record['diff_stats']['files_changed']} files"
    )
    print(
        f"  reviews={len(record['reviews'])} "
        f"conversation={len(record['conversation_comments'])} "
        f"inline={len(record['inline_review_comments'])} "
        f"linked_issues={len(record['linked_issues'])} "
        f"commits={len(record['commits'])}"
    )
    if rl:
        print(f"  graphql remaining={rl.remaining} reset_at={rl.reset_at}")
    print(
        f"  cached at .cache/pr-archaeology/"
        f"{args.repo.replace('/', '-')}/pr-{args.pr_number}.json"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
