"""List cached ledgers and return a single repo's ledger snapshot for viz."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.ledger.load import list_repos, load_ledger
from app.validators import validate_slug

router = APIRouter(prefix="/api/repos", tags=["repos"])


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        # Resolve relative paths against the repo root (two dirs up from backend/app).
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("")
async def list_ledger_repos() -> list[dict[str, Any]]:
    db_path = _resolve_db_path()
    if not db_path.exists():
        return []
    return list_repos(db_path)


@router.get("/{owner}/{name}/ledger")
async def get_ledger(owner: str, name: str) -> dict[str, Any]:
    validate_slug(owner, "owner")
    validate_slug(name, "name")
    repo = f"{owner}/{name}"
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")
    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        raise HTTPException(status_code=404, detail=f"No decisions for {repo}")
    return {
        "repo": snapshot.repo,
        "decision_count": snapshot.decision_count,
        "citation_count": snapshot.citation_count,
        "alternative_count": snapshot.alternative_count,
        "edge_count": len(snapshot.edges),
        "decisions": snapshot.decisions,
        "edges": snapshot.edges,
    }
