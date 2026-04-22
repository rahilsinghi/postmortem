from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", "../.env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development")
    frontend_origin: str = Field(default="http://localhost:3000")
    anthropic_api_key: str | None = Field(default=None)
    github_token: str | None = Field(default=None)
    ledger_db_path: str = Field(default=".cache/ledger.duckdb")

    # If set, /api/ingest requires a matching X-Ingest-Token header or ?token= query
    # param. Unset = endpoint is open (acceptable for local dev, not for public demo).
    ingest_auth_token: str | None = Field(default=None)

    # Optional comma-separated allowlist for /api/ingest repos. Empty = any public
    # GitHub repo is accepted.
    ingest_allowed_repos: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _parse_env_file(path: Path, key: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{key}="):
            return stripped.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def resolve_secret(key: str, *, repo_root: Path | None = None) -> str | None:
    """Return a secret, preferring os.environ but falling back to .env.local.

    The Claude Code sandbox scrubs `ANTHROPIC_API_KEY` from the process
    environment so the agent can't spend the user's credits silently. Reading
    the file directly bypasses that — the key is still only used by code the
    user authored and ran.
    """
    if value := os.environ.get(key):
        return value
    if repo_root is None:
        repo_root = Path(__file__).resolve().parents[2]
    for candidate in (repo_root / ".env.local", repo_root / ".env"):
        if result := _parse_env_file(candidate, key):
            return result
    return None
