from __future__ import annotations

import duckdb

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY,
    repo TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    decided_at TIMESTAMP,
    decided_by TEXT[],
    status TEXT NOT NULL DEFAULT 'active',
    superseded_by UUID,
    commit_shas TEXT[],
    confidence DOUBLE NOT NULL,
    extracted_at TIMESTAMP NOT NULL,
    pr_url TEXT NOT NULL,
    UNIQUE (repo, pr_number)
);
-- Repo-filter pushdown so `SELECT ... WHERE repo = ?` doesn't table-scan as
-- the ledger grows past ~200 decisions per repo.
CREATE INDEX IF NOT EXISTS idx_decisions_repo ON decisions(repo);

CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY,
    decision_id UUID NOT NULL REFERENCES decisions(id),
    kind TEXT NOT NULL,  -- 'context' | 'decision' | 'forces' | 'consequences'
    claim TEXT NOT NULL,
    citation_quote TEXT NOT NULL,
    citation_source_type TEXT NOT NULL,
    citation_source_id TEXT NOT NULL,
    citation_author TEXT,
    citation_timestamp TIMESTAMP,
    citation_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citations_decision_id ON citations(decision_id);
CREATE INDEX IF NOT EXISTS idx_citations_kind ON citations(kind);

CREATE TABLE IF NOT EXISTS alternatives (
    id UUID PRIMARY KEY,
    decision_id UUID NOT NULL REFERENCES decisions(id),
    name TEXT NOT NULL,
    rejection_reason TEXT NOT NULL,
    rejection_reason_quoted TEXT,
    citation_source_type TEXT NOT NULL,
    citation_source_id TEXT NOT NULL,
    citation_author TEXT,
    citation_url TEXT NOT NULL,
    confidence DOUBLE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alternatives_decision_id ON alternatives(decision_id);

CREATE TABLE IF NOT EXISTS decision_edges (
    id UUID PRIMARY KEY,
    from_id UUID NOT NULL REFERENCES decisions(id),
    to_id UUID NOT NULL REFERENCES decisions(id),
    kind TEXT NOT NULL,  -- 'supersedes' | 'depends_on' | 'related_to'
    reason TEXT,
    UNIQUE (from_id, to_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON decision_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON decision_edges(to_id);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id UUID PRIMARY KEY,
    repo TEXT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    prs_seen INTEGER NOT NULL DEFAULT 0,
    decisions_written INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd DOUBLE NOT NULL DEFAULT 0.0,
    notes TEXT
);

-- Cost-engine ledger: every /api/query and /api/impact run writes one row so
-- we can aggregate query spend per repo and surface "how much did this
-- knowledge cost?" on the gallery + ledger chrome.
CREATE TABLE IF NOT EXISTS query_runs (
    id UUID PRIMARY KEY,
    repo TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'query',   -- 'query' | 'impact'
    question TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    effort TEXT NOT NULL DEFAULT 'high',  -- 'high' | 'xhigh'
    self_check BOOLEAN NOT NULL DEFAULT true,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd DOUBLE NOT NULL DEFAULT 0.0,
    verified_count INTEGER NOT NULL DEFAULT 0,
    unverified_count INTEGER NOT NULL DEFAULT 0,
    anchor_pr INTEGER  -- set only for 'impact' runs
);
CREATE INDEX IF NOT EXISTS idx_query_runs_repo ON query_runs(repo);
CREATE INDEX IF NOT EXISTS idx_query_runs_created ON query_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS interviews (
    repo_owner       VARCHAR NOT NULL,
    repo_name        VARCHAR NOT NULL,
    subject_author   VARCHAR NOT NULL,
    generated_at     TIMESTAMP NOT NULL,
    model            VARCHAR NOT NULL,
    script_json      JSON    NOT NULL,
    voice_sample_ids JSON    NOT NULL,
    token_usage      JSON    NOT NULL,
    PRIMARY KEY (repo_owner, repo_name, subject_author)
);
CREATE INDEX IF NOT EXISTS idx_interviews_repo
    ON interviews(repo_owner, repo_name);

-- Conflict Finder cache: one row per repo. An Opus pass scans the full
-- ledger for decisions that contradict across supersedes chains or within
-- overlapping categories. Demo-cheap — re-opening the panel replays the
-- cached JSON rather than re-paying the extractor call.
CREATE TABLE IF NOT EXISTS conflicts_cache (
    repo          VARCHAR NOT NULL PRIMARY KEY,
    generated_at  TIMESTAMP NOT NULL,
    model         VARCHAR NOT NULL,
    conflicts_json JSON NOT NULL,
    token_usage   JSON NOT NULL
);
"""


def connect(path: str) -> duckdb.DuckDBPyConnection:
    """Open a DuckDB connection and ensure the schema is applied."""
    conn = duckdb.connect(path)
    conn.execute(SCHEMA_SQL)
    return conn
