"""GitHub API client — GraphQL + REST with ETag caching and rate-limit backoff."""

from __future__ import annotations

import asyncio
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = f"{GITHUB_API}/graphql"
USER_AGENT = "postmortem-hackathon/0.1"


@dataclass
class RateLimitSnapshot:
    remaining: int
    reset_at: str | None = None
    cost: int | None = None


class GitHubError(RuntimeError):
    pass


class GitHubRateLimited(GitHubError):
    pass


class GitHubClient:
    """Async GitHub client with GraphQL + REST support.

    * ETag cache on disk keyed by `(method, url)` — re-requests send
      `If-None-Match`; 304 is treated as "use cached body".
    * On 403 (rate limit) or 429, exponential backoff with jitter.
    """

    def __init__(
        self,
        token: str,
        cache_dir: Path | None = None,
        timeout: float = 30.0,
        max_retries: int = 5,
    ) -> None:
        self.token = token
        self.cache_dir = cache_dir or Path(".cache/pr-archaeology")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._etag_path = self.cache_dir / "etags.json"
        self._etags: dict[str, dict[str, Any]] = self._load_etags()
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Authorization": f"bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": USER_AGENT,
            },
        )
        self.last_rate_limit: RateLimitSnapshot | None = None

    async def __aenter__(self) -> GitHubClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()
        self._save_etags()

    def _load_etags(self) -> dict[str, dict[str, Any]]:
        if self._etag_path.exists():
            with self._etag_path.open() as fh:
                return dict(json.load(fh))
        return {}

    def _save_etags(self) -> None:
        with self._etag_path.open("w") as fh:
            json.dump(self._etags, fh)

    async def graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        payload = {"query": query, "variables": variables}
        body = await self._request_with_retries("POST", GITHUB_GRAPHQL, json=payload)
        if "errors" in body:
            raise GitHubError(f"GraphQL errors: {body['errors']}")
        rate_limit = body.get("data", {}).get("rateLimit")
        if rate_limit is not None:
            self.last_rate_limit = RateLimitSnapshot(
                remaining=int(rate_limit.get("remaining", 0)),
                reset_at=rate_limit.get("resetAt"),
                cost=rate_limit.get("cost"),
            )
        data: dict[str, Any] = body.get("data", {})
        return data

    async def rest_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{GITHUB_API}{path}"
        return await self._request_with_retries("GET", url, params=params)

    async def _request_with_retries(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> Any:
        cache_key = f"{method} {url}"
        cached = self._etags.get(cache_key)

        headers: dict[str, str] = {}
        if method == "GET" and cached and "etag" in cached:
            headers["If-None-Match"] = cached["etag"]

        attempt = 0
        while True:
            attempt += 1
            try:
                response = await self._client.request(method, url, headers=headers, **kwargs)
            except httpx.HTTPError as exc:
                if attempt >= self.max_retries:
                    raise GitHubError(f"network error after {attempt} tries: {exc}") from exc
                await self._backoff(attempt)
                continue

            if response.status_code == 304 and cached and "body" in cached:
                return cached["body"]

            if response.status_code in (403, 429):
                if attempt >= self.max_retries:
                    raise GitHubRateLimited(
                        f"{response.status_code} after {attempt} tries: {response.text[:300]}"
                    )
                retry_after = response.headers.get("retry-after")
                if retry_after and retry_after.isdigit():
                    await asyncio.sleep(int(retry_after))
                else:
                    await self._backoff(attempt)
                continue

            if response.status_code >= 500:
                if attempt >= self.max_retries:
                    raise GitHubError(f"server error after {attempt} tries: {response.status_code}")
                await self._backoff(attempt)
                continue

            if response.status_code >= 400:
                raise GitHubError(f"{response.status_code} {response.text[:300]}")

            data = response.json() if response.content else None
            etag = response.headers.get("etag")
            if method == "GET" and etag is not None:
                self._etags[cache_key] = {"etag": etag, "body": data}
            return data

    async def _backoff(self, attempt: int) -> None:
        delay = min(60.0, (2.0**attempt) + random.uniform(0, 1))
        await asyncio.sleep(delay)
