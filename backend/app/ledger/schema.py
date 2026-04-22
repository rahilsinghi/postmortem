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
"""


def connect(path: str) -> duckdb.DuckDBPyConnection:
    """Open a DuckDB connection and ensure the schema is applied."""
    conn = duckdb.connect(path)
    conn.execute(SCHEMA_SQL)
    return conn
