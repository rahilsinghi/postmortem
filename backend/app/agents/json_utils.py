"""Robust JSON extraction for sub-agent responses.

Sub-agent prompts ask the model to emit ONLY a JSON object, but models sometimes
include a leading explanation or wrap the JSON in a ```json fence. This helper
tries the cheap happy path first, then falls back to progressively more forgiving
strategies.
"""

from __future__ import annotations

import json
import re
from typing import Any

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)
_OBJECT_RE = re.compile(r"(\{.*\})", re.DOTALL)


def extract_json(text: str) -> Any:
    """Parse the first JSON object / array found in `text`, or raise ValueError."""
    stripped = text.strip()

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    fence = _JSON_FENCE_RE.search(stripped)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass

    obj = _OBJECT_RE.search(stripped)
    if obj:
        candidate = obj.group(1)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Could not parse JSON from model response: {exc}\n---\n{text[:800]}"
            ) from exc

    raise ValueError(f"No JSON object found in model response:\n---\n{text[:800]}")
