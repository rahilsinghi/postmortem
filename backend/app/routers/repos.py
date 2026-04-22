"""List cached ledgers and return a single repo's ledger snapshot for viz."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.ledger.load import list_repos, load_ledger
from app.ledger.schema import connect
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


def _cost_summary(db_path: Path, repo: str) -> dict[str, Any]:
    """One-row lifetime cost snapshot for a single repo."""
    conn = connect(str(db_path))
    try:
        row = conn.execute(
            """
            SELECT
                (SELECT COALESCE(SUM(cost_usd), 0.0) FROM ingestion_runs WHERE repo = ?),
                (SELECT COALESCE(SUM(cost_usd), 0.0) FROM query_runs WHERE repo = ?),
                (SELECT COUNT(*) FROM query_runs WHERE repo = ?),
                (SELECT COALESCE(SUM(cache_read_tokens), 0) FROM query_runs WHERE repo = ?),
                (SELECT COALESCE(SUM(verified_count), 0) FROM query_runs WHERE repo = ?),
                (SELECT COALESCE(SUM(unverified_count), 0) FROM query_runs WHERE repo = ?)
            """,
            [repo] * 6,
        ).fetchone()
    finally:
        conn.close()
    ingestion, query, q_count, cache_read, verified, unverified = row or (0.0, 0.0, 0, 0, 0, 0)
    return {
        "ingestion_cost_usd": round(float(ingestion or 0.0), 4),
        "query_cost_usd": round(float(query or 0.0), 4),
        "total_cost_usd": round(float(ingestion or 0.0) + float(query or 0.0), 4),
        "query_count": int(q_count or 0),
        "cache_read_tokens": int(cache_read or 0),
        "verified_citations": int(verified or 0),
        "unverified_citations": int(unverified or 0),
    }


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
        "cost": _cost_summary(db_path, repo),
    }


@router.get("/{owner}/{name}/cost")
async def get_cost(owner: str, name: str) -> dict[str, Any]:
    """Lightweight lifetime-cost endpoint (no ledger snapshot overhead)."""
    validate_slug(owner, "owner")
    validate_slug(name, "name")
    repo = f"{owner}/{name}"
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")
    return {"repo": repo, **_cost_summary(db_path, repo)}
