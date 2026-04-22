"""In-process per-IP rate limiting for the public API surface.

Deliberately minimal — no Redis, no external deps, single process only. Fine
for the Cloud Run single-instance deployment the demo runs on. If we ever
need cross-instance limits, swap in `fastapi-limiter` with a Redis backend.

Limits are bucketed per `(bucket_name, client_ip)` with a 60-second sliding
window. Each bucket has its own `per_minute` cap.

Usage in a FastAPI route:

    @router.get("/foo", dependencies=[Depends(rate_limit("foo", per_minute=10))])
    async def foo(): ...
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Awaitable, Callable
from time import monotonic

from fastapi import HTTPException, Request

_WINDOW_S = 60.0
_BUCKETS: dict[tuple[str, str], list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    # Respect X-Forwarded-For when the backend runs behind a trusted proxy
    # (Cloud Run sets this). Fall back to the socket peer address.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, per_minute: int) -> Callable[[Request], Awaitable[None]]:
    """Returns a FastAPI dependency that enforces a per-IP sliding-window limit."""

    async def _check(request: Request) -> None:
        ip = _client_ip(request)
        key = (bucket, ip)
        now = monotonic()
        cutoff = now - _WINDOW_S
        timestamps = _BUCKETS[key]
        # Prune entries that fell outside the sliding window.
        drop = 0
        while drop < len(timestamps) and timestamps[drop] < cutoff:
            drop += 1
        if drop:
            del timestamps[:drop]
        if len(timestamps) >= per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"rate limit exceeded: {per_minute}/min on '{bucket}'",
                headers={"Retry-After": "60"},
            )
        timestamps.append(now)

    return _check
