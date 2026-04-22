"""Hero-repo configuration — the locked PR set used for sub-agent verification.

Kept in one place so the Day 2 verification harness, the cost-calibration
script, and any future regression test all exercise the same PRs.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HeroRepo:
    repo: str
    verification_prs: tuple[int, ...]


ZUSTAND = HeroRepo(
    repo="pmndrs/zustand",
    verification_prs=(3336, 3252, 3362, 3371, 3209),
)

# Ordered from recognizable → developer-favorite → small-but-famous per SPEC §Hero repos.
HERO_REPOS: tuple[HeroRepo, ...] = (
    HeroRepo("shadcn-ui/ui", verification_prs=()),
    HeroRepo("honojs/hono", verification_prs=()),
    ZUSTAND,
)
