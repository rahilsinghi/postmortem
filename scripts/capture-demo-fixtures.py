"""Capture real SSE streams for the demo layer's fixtures.

Usage:
    uv run --project backend python scripts/capture-demo-fixtures.py --dry-run
    uv run --project backend python scripts/capture-demo-fixtures.py --commit

Writes under public/demo/:
    gallery-repos.json
    hono-ledger.json
    supabase-ingest-events.json
    hono-query-events.json
    hono-impact-events.json
    manifest.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
# Next.js serves static assets from frontend/public/ — fixtures must live
# there so the demo layer's fetch('/demo/*.json') round-trip resolves.
FIXTURE_DIR = REPO_ROOT / "frontend" / "public" / "demo"

BACKEND = "http://127.0.0.1:8765"


def _atomic_write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str))
    tmp.replace(path)


def capture_repos() -> list[dict[str, Any]]:
    r = httpx.get(f"{BACKEND}/api/repos", timeout=30)
    r.raise_for_status()
    return r.json()


def capture_ledger(repo: str) -> dict[str, Any]:
    r = httpx.get(f"{BACKEND}/api/repos/{repo}/ledger", timeout=30)
    r.raise_for_status()
    return r.json()


def capture_sse(url: str, out_path: Path) -> dict[str, Any]:
    """Stream an SSE endpoint and write {events: [...]} with ts_ms relative
    to the first event."""
    started_at = time.monotonic()
    events: list[dict[str, Any]] = []

    with httpx.Client(timeout=None) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            current_event: str | None = None
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("event: "):
                    current_event = line[len("event: ") :].strip()
                elif line.startswith("data: ") and current_event:
                    raw = line[len("data: ") :]
                    try:
                        data: Any = json.loads(raw)
                    except ValueError:
                        data = raw
                    ts_ms = int((time.monotonic() - started_at) * 1000)
                    events.append(
                        {"ts_ms": ts_ms, "event": current_event, "data": data}
                    )
                    if current_event == "phase" and data == "done":
                        break

    payload = {
        "events": events,
        "captured_at": time.time(),
        "event_count": len(events),
    }
    _atomic_write(out_path, payload)
    return payload


def capture_ingest() -> dict[str, Any]:
    url = (
        f"{BACKEND}/api/ingest?repo=supabase/supabase"
        "&limit=30&min_discussion=3"
    )
    return capture_sse(url, FIXTURE_DIR / "supabase-ingest-events.json")


def capture_query() -> dict[str, Any]:
    question = "Why does Hono reject node:* modules in core?"
    url = (
        f"{BACKEND}/api/query?repo=honojs/hono"
        f"&question={quote(question)}&self_check=true"
    )
    return capture_sse(url, FIXTURE_DIR / "hono-query-events.json")


def capture_impact() -> dict[str, Any]:
    question = "What breaks if node:* is allowed in core?"
    # Anchor: PR 3813 (Buffer rejection) has a rich kin network.
    url = (
        f"{BACKEND}/api/impact?repo=honojs/hono"
        f"&question={quote(question)}&anchor_pr=3813&max_depth=2&self_check=false"
    )
    return capture_sse(url, FIXTURE_DIR / "hono-impact-events.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview actions; no network calls"
    )
    parser.add_argument(
        "--commit", action="store_true", help="Run all captures in sequence"
    )
    args = parser.parse_args()

    if not args.dry_run and not args.commit:
        print("Pass --dry-run or --commit", file=sys.stderr)
        return 2

    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {"started_at": time.time()}

    plan = [
        ("gallery-repos.json", "GET /api/repos (free)"),
        ("hono-ledger.json", "GET /api/repos/honojs/hono/ledger (free)"),
        (
            "supabase-ingest-events.json",
            "SSE /api/ingest supabase/supabase limit=30 min_discussion=3 (~$8-12)",
        ),
        ("hono-query-events.json", "SSE /api/query hono self_check=true (~$4)"),
        ("hono-impact-events.json", "SSE /api/impact hono anchor=3813 (~$3)"),
    ]
    if args.dry_run:
        print("Would capture:")
        for filename, desc in plan:
            print(f"  {FIXTURE_DIR / filename} <- {desc}")
        print("\nTotal estimated spend: ~$11-13")
        return 0

    print(f"Capturing fixtures to {FIXTURE_DIR}...\n")
    print("[1/5] /api/repos")
    _atomic_write(FIXTURE_DIR / "gallery-repos.json", capture_repos())
    print("[2/5] /api/repos/honojs/hono/ledger")
    _atomic_write(FIXTURE_DIR / "hono-ledger.json", capture_ledger("honojs/hono"))
    print("[3/5] /api/ingest supabase/supabase (SSE)")
    ingest = capture_ingest()
    manifest["ingest_events"] = ingest["event_count"]
    print("[4/5] /api/query hono (SSE)")
    query = capture_query()
    manifest["query_events"] = query["event_count"]
    print("[5/5] /api/impact hono (SSE)")
    impact = capture_impact()
    manifest["impact_events"] = impact["event_count"]

    manifest["finished_at"] = time.time()
    _atomic_write(FIXTURE_DIR / "manifest.json", manifest)
    print("\nDone. Fixtures written to public/demo/. Commit and move on to Wave D3.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
