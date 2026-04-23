from app.query.prompts import GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_mentions_six_exchanges() -> None:
    lowered = GHOST_INTERVIEW_SYSTEM_PROMPT.lower()
    assert "exactly 6 exchanges" in lowered or "exactly six exchanges" in lowered


def test_prompt_requires_paraphrase_disclosure() -> None:
    assert "(paraphrased — see [PR #" in GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_requires_quote_before_citation() -> None:
    assert '"' in GHOST_INTERVIEW_SYSTEM_PROMPT
    assert "[PR #N, @{subject}" in GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_forbids_invented_quotes() -> None:
    lowered = GHOST_INTERVIEW_SYSTEM_PROMPT.lower()
    assert "never invent" in lowered or "do not invent" in lowered
