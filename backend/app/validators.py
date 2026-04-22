"""Shared input validators for the public API surface."""

from __future__ import annotations

import re

from fastapi import HTTPException

# GitHub's actual allowed character set for usernames and repository names:
# alphanumeric plus `._-`. We reject anything else so a malicious slug can't
# contain `/`, `..`, null bytes, or path separators that could escape the
# on-disk cache directory in `archaeology.py`.
_SLUG_RE = re.compile(r"^[a-zA-Z0-9._-]{1,100}$")


def validate_slug(value: str, field_name: str) -> str:
    """Reject anything that doesn't look like a GitHub username / repo name."""
    if not value or not _SLUG_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must match [a-zA-Z0-9._-]{{1,100}}",
        )
    return value


def validate_repo(repo: str) -> tuple[str, str]:
    """Split `owner/name` and validate each half."""
    if repo.count("/") != 1:
        raise HTTPException(status_code=400, detail="repo must be owner/name")
    owner, name = repo.split("/", 1)
    return validate_slug(owner, "owner"), validate_slug(name, "name")
