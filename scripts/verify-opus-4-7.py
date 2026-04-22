"""Day 1 smoke test: confirm ANTHROPIC_API_KEY works against claude-opus-4-7.

Usage (from repo root):
    uv run --project backend python scripts/verify-opus-4-7.py

Expected output: a short "Hello Postmortem" completion from the model.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env.local")
load_dotenv(REPO_ROOT / ".env")

MODEL = "claude-opus-4-7"


def main() -> int:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        print(
            "Fix: add `ANTHROPIC_API_KEY=sk-ant-...` to .env.local at the repo root, "
            "or export it in your shell.",
            file=sys.stderr,
        )
        return 2

    try:
        from anthropic import Anthropic
    except ImportError:
        print("ERROR: anthropic SDK not installed.", file=sys.stderr)
        print("Fix: `cd backend && uv sync`.", file=sys.stderr)
        return 3

    client = Anthropic(api_key=api_key)

    print(f"[verify] calling {MODEL} with a trivial hello prompt...")
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=128,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Respond with exactly the phrase 'Hello Postmortem' and "
                        "nothing else."
                    ),
                }
            ],
        )
    except Exception as exc:
        print(f"ERROR: call failed: {exc}", file=sys.stderr)
        print(
            "Diagnostics: check key is valid, account has Opus 4.7 access, "
            "and the model ID is correct (claude-opus-4-7).",
            file=sys.stderr,
        )
        return 1

    text_parts: list[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
    text = "".join(text_parts).strip()

    print(f"[verify] model response: {text!r}")
    print(f"[verify] usage: input={response.usage.input_tokens} output={response.usage.output_tokens}")

    if not text:
        print("ERROR: empty response from model.", file=sys.stderr)
        return 1

    print("[verify] ✅ Opus 4.7 reachable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
