"""Load sub-agent prompts from `.claude/agents/*.md`.

Each agent markdown file has YAML front-matter (name, description, tools, model)
followed by the system prompt body. We embed the body as the system prompt for
`client.messages.create` calls.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml  # type: ignore[import-untyped]

MODEL_ALIASES: dict[str, str] = {
    "opus": "claude-opus-4-7",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
}

# Resolve the repo root from the agents directory so this works whether we're
# invoked from the backend package or from a scripts/ CLI.
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[3]
AGENTS_DIR = _REPO_ROOT / ".claude" / "agents"


@dataclass(frozen=True)
class AgentPrompt:
    name: str
    description: str
    model: str
    system: str


def _split_frontmatter(text: str) -> tuple[dict[str, object], str]:
    if not text.startswith("---"):
        raise ValueError("agent markdown must start with YAML front-matter (---)")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("malformed front-matter block")
    raw_front = parts[1]
    body = parts[2].lstrip("\n")
    front = yaml.safe_load(raw_front) or {}
    if not isinstance(front, dict):
        raise ValueError("front-matter must parse to a mapping")
    return front, body


def load_agent(name: str) -> AgentPrompt:
    """Load an agent by name (the filename without .md)."""
    path = AGENTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"No agent at {path}")
    raw = path.read_text(encoding="utf-8")
    front, body = _split_frontmatter(raw)

    model_alias = str(front.get("model", "opus"))
    model = MODEL_ALIASES.get(model_alias, model_alias)

    return AgentPrompt(
        name=str(front.get("name", name)),
        description=str(front.get("description", "")),
        model=model,
        system=body.strip(),
    )
