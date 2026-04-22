"""Day 1 smoke test: confirm Managed Agents beta access.

The script does two things:

  1. Pre-flight: probe the Managed Agents endpoint with the required beta header
     (`managed-agents-2026-04-01`). If access is denied, prints an actionable
     enrollment message and exits non-zero.

  2. Runs a minimal Managed Agents session: creates an agent + environment,
     invokes a toy task that executes `echo hello from the sandbox` via the
     agent_toolset, and prints the result.

Usage (from repo root):
    uv run --project backend python scripts/smoke-managed-agents.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env.local")
load_dotenv(REPO_ROOT / ".env")

API_BASE = "https://api.anthropic.com"
BETA_HEADER = "managed-agents-2026-04-01"
MODEL = "claude-opus-4-7"
POLL_TIMEOUT_S = 120
POLL_INTERVAL_S = 2


def headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": BETA_HEADER,
        "content-type": "application/json",
    }


def preflight(api_key: str) -> bool:
    """Probe the Managed Agents endpoint. Returns True if the beta is enabled."""
    print(f"[preflight] probing Managed Agents beta ({BETA_HEADER})...")
    try:
        resp = httpx.get(
            f"{API_BASE}/v1/agents",
            headers=headers(api_key),
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        print(f"[preflight] network error: {exc}", file=sys.stderr)
        return False

    if resp.status_code == 200:
        print("[preflight] ✅ Managed Agents beta enabled.")
        return True

    print(f"[preflight] status={resp.status_code} body={resp.text[:500]}", file=sys.stderr)
    if resp.status_code in (401, 403):
        print(
            "[preflight] ❌ NOT enrolled in Managed Agents beta.\n"
            "  Request access at https://console.anthropic.com/settings/limits "
            "(look for 'Beta features' / 'Managed Agents').\n"
            "  If no self-serve toggle exists, email the Anthropic hackathon "
            "contact with subject: 'Managed Agents beta — Built with Opus 4.7 hackathon'.",
            file=sys.stderr,
        )
    elif resp.status_code == 404:
        print(
            "[preflight] ❌ /v1/agents endpoint not available for this account.\n"
            "  This usually means the beta header is not recognized — "
            "check that `anthropic-beta: managed-agents-2026-04-01` is correct and enrolled.",
            file=sys.stderr,
        )
    return False


def run_toy_session(api_key: str) -> int:
    """Create a minimal agent + env, run `echo hello from the sandbox`, print the result."""
    h = headers(api_key)

    print("[session] creating agent...")
    agent_resp = httpx.post(
        f"{API_BASE}/v1/agents",
        headers=h,
        json={
            "name": "postmortem-smoke-agent",
            "model": MODEL,
            "system": "You are a smoke-test agent. Execute the requested shell command and report its output.",
            "tools": [{"type": "bash_2026_04_01"}],
        },
        timeout=30.0,
    )
    if agent_resp.status_code >= 400:
        print(f"[session] agent create failed: {agent_resp.status_code} {agent_resp.text}", file=sys.stderr)
        return 1
    agent_id = agent_resp.json()["id"]
    print(f"[session] agent_id={agent_id}")

    print("[session] creating environment...")
    env_resp = httpx.post(
        f"{API_BASE}/v1/environments",
        headers=h,
        json={"agent_id": agent_id, "type": "sandbox"},
        timeout=30.0,
    )
    if env_resp.status_code >= 400:
        print(f"[session] env create failed: {env_resp.status_code} {env_resp.text}", file=sys.stderr)
        return 1
    environment_id = env_resp.json()["id"]
    print(f"[session] environment_id={environment_id}")

    print("[session] starting session...")
    session_resp = httpx.post(
        f"{API_BASE}/v1/sessions",
        headers=h,
        json={
            "agent_id": agent_id,
            "environment_id": environment_id,
            "input": "Run the shell command: echo hello from the sandbox. Report the exact stdout.",
        },
        timeout=30.0,
    )
    if session_resp.status_code >= 400:
        print(f"[session] session create failed: {session_resp.status_code} {session_resp.text}", file=sys.stderr)
        return 1
    session_id = session_resp.json()["id"]
    print(f"[session] session_id={session_id}")

    print("[session] polling for completion...")
    deadline = time.time() + POLL_TIMEOUT_S
    while time.time() < deadline:
        poll = httpx.get(f"{API_BASE}/v1/sessions/{session_id}", headers=h, timeout=15.0)
        if poll.status_code >= 400:
            print(f"[session] poll error: {poll.status_code} {poll.text}", file=sys.stderr)
            return 1
        data = poll.json()
        status = data.get("status")
        if status in ("succeeded", "failed", "cancelled"):
            print(f"[session] terminal status={status}")
            print(json.dumps(data, indent=2)[:2000])
            if status == "succeeded":
                output = json.dumps(data).lower()
                if "hello from the sandbox" in output:
                    print("[session] ✅ hello from the sandbox")
                    return 0
                print("[session] ⚠️  session succeeded but expected string not found in output.", file=sys.stderr)
                return 1
            return 1
        time.sleep(POLL_INTERVAL_S)

    print(f"[session] timed out after {POLL_TIMEOUT_S}s.", file=sys.stderr)
    return 1


def main() -> int:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        return 2

    if not preflight(api_key):
        return 1

    return run_toy_session(api_key)


if __name__ == "__main__":
    sys.exit(main())
