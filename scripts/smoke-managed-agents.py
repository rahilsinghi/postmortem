"""Day 1 smoke test: confirm Managed Agents beta access.

The script does two things:

  1. Pre-flight: probe the Managed Agents endpoint with the required beta header
     (`managed-agents-2026-04-01`). If access is denied, prints an actionable
     enrollment message and exits non-zero.

  2. Runs a minimal Managed Agents session via the Anthropic SDK: creates an
     agent + environment + session, opens an SSE stream, sends a user message
     asking the agent to `echo hello from the sandbox`, and verifies the
     expected string appears in the agent's response before `session.status_idle`.

Usage (from repo root):
    uv run --project backend python scripts/smoke-managed-agents.py
"""

from __future__ import annotations

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
STREAM_TIMEOUT_S = 240
EXPECTED_PHRASE = "hello from the sandbox"


def preflight(api_key: str) -> bool:
    """Probe the Managed Agents endpoint. Returns True if the beta is enabled."""
    print(f"[preflight] probing Managed Agents beta ({BETA_HEADER})...")
    try:
        resp = httpx.get(
            f"{API_BASE}/v1/agents",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": BETA_HEADER,
            },
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
    """Create agent + env + session via the SDK, ask for an echo, verify output."""
    try:
        from anthropic import Anthropic
    except ImportError:
        print("ERROR: anthropic SDK not installed. Run `cd backend && uv sync`.", file=sys.stderr)
        return 3

    client = Anthropic(api_key=api_key)

    print("[session] creating agent...")
    agent = client.beta.agents.create(
        name="postmortem-smoke-agent",
        model=MODEL,
        system=(
            "You are a smoke-test agent. Execute the requested shell command "
            "using the bash tool and report the exact stdout verbatim."
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )
    print(f"[session] agent_id={agent.id}")

    print("[session] creating environment...")
    environment = client.beta.environments.create(
        name="postmortem-smoke-env",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    print(f"[session] environment_id={environment.id}")

    print("[session] creating session...")
    session = client.beta.sessions.create(
        agent=agent.id,
        environment_id=environment.id,
        title="postmortem smoke session",
    )
    print(f"[session] session_id={session.id}")

    collected_text: list[str] = []
    saw_idle = False
    deadline = time.time() + STREAM_TIMEOUT_S

    print("[session] opening stream + sending user message...")
    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Run this shell command: echo {EXPECTED_PHRASE}. "
                                "Then reply with the exact stdout, nothing else."
                            ),
                        }
                    ],
                }
            ],
        )

        for event in stream:
            if time.time() > deadline:
                print("[session] stream timeout", file=sys.stderr)
                break
            etype = getattr(event, "type", None)
            if etype == "agent.message":
                for block in getattr(event, "content", []) or []:
                    text = getattr(block, "text", None)
                    if text:
                        collected_text.append(text)
            elif etype == "agent.tool_use":
                name = getattr(event, "name", "?")
                print(f"[session] tool_use: {name}")
            elif etype == "session.status_idle":
                saw_idle = True
                break
            elif etype == "session.error":
                print(f"[session] session.error: {event}", file=sys.stderr)
                break

    full_text = "".join(collected_text)
    print("[session] agent text:", full_text[:800] if full_text else "(empty)")

    if not saw_idle:
        print("[session] ⚠️  stream ended without session.status_idle", file=sys.stderr)
        return 1
    if EXPECTED_PHRASE.lower() in full_text.lower():
        print(f"[session] ✅ {EXPECTED_PHRASE}")
        return 0
    print(
        f"[session] ⚠️  idle reached but '{EXPECTED_PHRASE}' not found in agent text.",
        file=sys.stderr,
    )
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
