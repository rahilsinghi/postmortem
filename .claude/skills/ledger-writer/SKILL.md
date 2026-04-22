---
name: ledger-writer
description: Persist an extracted decision (from `rationale-extractor` output) into the DuckDB decision ledger with the right schema, and write the decision's summary + rationale embedding into LanceDB so semantic search works. Handles idempotency — re-ingesting the same PR replaces the prior row and its dependent citations/alternatives rather than appending duplicates. Use whenever a classifier+extractor has produced a new decision record that needs to land in the queryable ledger.
license: MIT
---

# Ledger Writer

Owns the last mile of ingestion: turning a validated extraction into durable rows that queries can hit.

## What it writes

- **DuckDB** (`decisions`, `citations`, `alternatives`, `decision_edges`, `ingestion_runs`) — see [backend/app/ledger/schema.py](../../../backend/app/ledger/schema.py). Schema is authoritative; this skill never invents columns.
- **LanceDB** — one row per decision with `id`, `summary`, `title`, `category`, and an embedding vector. Day 2 leaves LanceDB out; Day 3 adds it when semantic search lands.

## Inputs

A `DecisionRecord` from [backend/app/ledger/models.py](../../../backend/app/ledger/models.py). The record already has `id`, `repo`, `pr_number`, title/summary/category, citations per kind, and alternatives.

Plus:

- `db_path` — path to the DuckDB file
- `embedding_fn` — callable `summary, title -> list[float]` (Day 3)

## Idempotency contract

Primary key: `(repo, pr_number)`. On upsert:

1. Look up existing `decisions` row by `(repo, pr_number)`.
2. If found: delete dependent rows in `citations` and `alternatives` WHERE `decision_id = existing_id`, then delete the decisions row.
3. Insert new `decisions` row using the **existing** UUID (preserve id so edges that point at it don't dangle).
4. Insert all new citations + alternatives.

This is implemented today in [backend/app/ledger/store.py](../../../backend/app/ledger/store.py) `LedgerStore.upsert_decision`. This skill's role is to expose that as an agent-callable tool and enforce the contract from the Managed Agents session.

## Outputs

```json
{
  "decision_id": "uuid",
  "repo": "owner/name",
  "pr_number": 4512,
  "citations_written": 13,
  "alternatives_written": 2,
  "status": "inserted | replaced"
}
```

## Critical rules

1. **Never write without validation.** The record must round-trip through `DecisionRecord.model_validate(...)` before this skill touches DuckDB. Garbage in = poisoned ledger.
2. **Transactions per record.** A partial write (decisions row without its citations) must roll back. LedgerStore handles this today; any reimplementation must preserve it.
3. **Never touch `decision_edges` from here.** Edges are `graph-stitcher`'s domain — stitching runs AFTER a batch of ledger-writes, never inline with one.
4. **Ingestion run bookkeeping is the orchestrator's job.** ledger-writer reports the write result; it does NOT increment `ingestion_runs` counters. Keeps bookkeeping in one place.

## Status

Day 2 scaffold: contract locked. Runtime already lives in
`backend/app/ledger/store.py` — Day 3 wraps it as a proper Claude Skill
so the Managed Agents session can call it from inside the ingestion
agent without reaching into backend-private APIs.
