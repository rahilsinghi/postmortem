from pathlib import Path

from app.ledger.schema import connect


def test_interviews_table_created_on_connect(tmp_path: Path) -> None:
    db = tmp_path / "fresh.duckdb"
    conn = connect(str(db))
    try:
        cols = conn.execute("PRAGMA table_info(interviews)").fetchall()
        names = {c[1] for c in cols}
        assert {
            "repo_owner",
            "repo_name",
            "subject_author",
            "generated_at",
            "model",
            "script_json",
            "voice_sample_ids",
            "token_usage",
        }.issubset(names)
    finally:
        conn.close()
