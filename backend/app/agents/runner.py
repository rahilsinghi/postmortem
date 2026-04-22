"""One-shot sub-agent invocations via the Anthropic Messages API.

These helpers load the relevant agent's prompt from `.claude/agents/*.md`
(front-matter stripped), send a single user turn with the serialized PR
archaeology, and return parsed Pydantic results. Costs are tracked via the
passed-in `CostTracker`.

Each sub-agent call is a plain `client.messages.create` — NOT a Managed Agents
call. Managed Agents is used only for the long-running ingestion session
(see `app.managed_agents`).
"""

from __future__ import annotations

import asyncio
from typing import Any

from anthropic import AsyncAnthropic, RateLimitError
from anthropic.types import TextBlock
from pydantic import ValidationError

from app.agents.cost import CostTracker
from app.agents.input_builder import (
    build_classifier_input,
    build_extractor_input,
    build_stitcher_input,
)
from app.agents.json_utils import extract_json
from app.agents.loader import AgentPrompt, load_agent
from app.ledger.models import ClassificationResult, DecisionEdge, RationaleExtraction

CLASSIFIER_MAX_TOKENS = 1024
EXTRACTOR_MAX_TOKENS = 8192
STITCHER_MAX_TOKENS = 2048

USER_PREAMBLE_CLASSIFIER = (
    "Here is the PR archaeology JSON. Read it carefully and return the JSON "
    "described in your system prompt (fields: is_decision, title, category, "
    "confidence, rationale_snippets, notes). Return ONLY the JSON object.\n\n"
)

USER_PREAMBLE_EXTRACTOR = (
    "Here is the full PR archaeology JSON for a PR the classifier confirmed as "
    "an architectural decision. Extract the full structured rationale AND every "
    "rejected alternative exactly as specified in your system prompt. Return ONLY "
    "the JSON object — no surrounding prose.\n\n"
)

USER_PREAMBLE_STITCHER = (
    "Here are batches of decisions. For each new decision, determine whether it "
    "has a 'supersedes', 'depends_on', or 'related_to' relationship with any "
    "existing decision. Return ONLY the JSON object described in your system "
    "prompt, with an `edges` array (items: from_pr_number, to_pr_number, kind, "
    "reason).\n\n"
)


async def _invoke(
    client: AsyncAnthropic,
    agent: AgentPrompt,
    user_content: str,
    max_tokens: int,
    *,
    tracker: CostTracker,
    agent_label: str,
) -> tuple[str, int, int]:
    attempt = 0
    max_attempts = 4
    while True:
        attempt += 1
        try:
            response = await client.messages.create(
                model=agent.model,
                max_tokens=max_tokens,
                system=agent.system,
                messages=[{"role": "user", "content": user_content}],
            )
        except RateLimitError:
            if attempt >= max_attempts:
                raise
            await asyncio.sleep(min(30.0, 2.0**attempt))
            continue

        text_parts: list[str] = []
        for block in response.content:
            if isinstance(block, TextBlock):
                text_parts.append(block.text)
        full_text = "".join(text_parts)
        tracker.record(
            agent_label,
            agent.model,
            response.usage.input_tokens,
            response.usage.output_tokens,
        )
        return full_text, response.usage.input_tokens, response.usage.output_tokens


async def run_classifier(
    client: AsyncAnthropic,
    pr: dict[str, Any],
    *,
    tracker: CostTracker,
) -> ClassificationResult:
    agent = load_agent("decision-classifier")
    user = USER_PREAMBLE_CLASSIFIER + build_classifier_input(pr)
    raw, _, _ = await _invoke(
        client, agent, user, CLASSIFIER_MAX_TOKENS,
        tracker=tracker, agent_label="decision-classifier",
    )
    obj = extract_json(raw)
    try:
        return ClassificationResult.model_validate(obj)
    except ValidationError as exc:
        raise ValueError(
            f"classifier output failed schema validation: {exc}\n---\n{raw[:800]}"
        ) from exc


async def run_extractor(
    client: AsyncAnthropic,
    pr: dict[str, Any],
    *,
    tracker: CostTracker,
) -> RationaleExtraction:
    agent = load_agent("rationale-extractor")
    user = USER_PREAMBLE_EXTRACTOR + build_extractor_input(pr)
    raw, _, _ = await _invoke(
        client, agent, user, EXTRACTOR_MAX_TOKENS,
        tracker=tracker, agent_label="rationale-extractor",
    )
    obj = extract_json(raw)
    try:
        return RationaleExtraction.model_validate(obj)
    except ValidationError as exc:
        raise ValueError(
            f"extractor output failed schema validation: {exc}\n---\n{raw[:1200]}"
        ) from exc


async def run_stitcher(
    client: AsyncAnthropic,
    new_decisions: list[dict[str, Any]],
    existing_summary: list[dict[str, Any]],
    *,
    tracker: CostTracker,
) -> list[dict[str, Any]]:
    agent = load_agent("graph-stitcher")
    user = USER_PREAMBLE_STITCHER + build_stitcher_input(new_decisions, existing_summary)
    raw, _, _ = await _invoke(
        client, agent, user, STITCHER_MAX_TOKENS,
        tracker=tracker, agent_label="graph-stitcher",
    )
    obj = extract_json(raw)
    edges = obj.get("edges", []) if isinstance(obj, dict) else []
    return list(edges) if isinstance(edges, list) else []


# Shared helper re-exported for tests.
__all__ = [
    "DecisionEdge",
    "run_classifier",
    "run_extractor",
    "run_stitcher",
]
