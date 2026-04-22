"""Shared helpers for turning internal exceptions into safe outward messages.

Anthropic and GitHub SDK exceptions often embed their full HTTP response body
(including partial key material, internal IDs, and response metadata). The SSE
endpoints stream error events directly to the browser, so `repr(exc)` or
`str(exc)` can leak infra detail to any viewer of the demo video.

`safe_error_message(exc)` returns a terse, class-name-plus-summary form that's
safe to surface. The full exception is logged server-side for debugging.
"""

from __future__ import annotations

import logging
import re

_logger = logging.getLogger("postmortem")

# Pattern that matches anything API-key-shaped so we can redact defensively if
# a subclass ever embeds one in `str(exc)`.
_API_KEY_PATTERN = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{8,})")

_SAFE_MESSAGE_LIMIT = 160


def safe_error_message(exc: BaseException, *, context: str | None = None) -> str:
    """Return an outward-safe single-line description of `exc`.

    Strategy: exception class name + first line of `str(exc)` truncated to
    ~160 chars, with anything API-key-shaped redacted. The full traceback is
    logged server-side.
    """
    _logger.exception("Postmortem internal error (%s)", context or "unspecified")

    class_name = type(exc).__name__
    detail = str(exc).splitlines()[0] if str(exc) else ""
    detail = _API_KEY_PATTERN.sub("[redacted]", detail)
    if len(detail) > _SAFE_MESSAGE_LIMIT:
        detail = detail[: _SAFE_MESSAGE_LIMIT - 1] + "…"

    if detail:
        return f"{class_name}: {detail}"
    return class_name
