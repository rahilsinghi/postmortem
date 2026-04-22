"""Per-call cost accounting for Anthropic Messages API invocations."""

from __future__ import annotations

from dataclasses import dataclass, field

# Approximate public prices per 1M tokens, April 2026.
MODEL_PRICES_PER_MILLION: dict[str, tuple[float, float]] = {
    "claude-opus-4-7": (15.0, 75.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5-20251001": (0.80, 4.0),
}


@dataclass
class UsageBucket:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    cost_usd: float = 0.0
    calls: int = 0


@dataclass
class CostTracker:
    per_agent: dict[str, UsageBucket] = field(default_factory=dict)

    def record(
        self,
        agent: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        *,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> float:
        bucket = self.per_agent.setdefault(agent, UsageBucket())
        bucket.input_tokens += input_tokens
        bucket.output_tokens += output_tokens
        bucket.cache_creation_tokens += cache_creation_tokens
        bucket.cache_read_tokens += cache_read_tokens
        bucket.calls += 1
        price_in, price_out = MODEL_PRICES_PER_MILLION.get(model, (0.0, 0.0))
        # Anthropic ephemeral cache: write = 1.25x input, read = 0.1x input.
        call_cost = (
            (input_tokens / 1_000_000) * price_in
            + (output_tokens / 1_000_000) * price_out
            + (cache_creation_tokens / 1_000_000) * price_in * 1.25
            + (cache_read_tokens / 1_000_000) * price_in * 0.10
        )
        bucket.cost_usd += call_cost
        return call_cost

    def totals(self) -> UsageBucket:
        total = UsageBucket()
        for bucket in self.per_agent.values():
            total.input_tokens += bucket.input_tokens
            total.output_tokens += bucket.output_tokens
            total.cache_creation_tokens += bucket.cache_creation_tokens
            total.cache_read_tokens += bucket.cache_read_tokens
            total.cost_usd += bucket.cost_usd
            total.calls += bucket.calls
        return total

    def pretty(self) -> str:
        lines = ["  per-agent:"]
        for name, bucket in sorted(self.per_agent.items()):
            lines.append(
                f"    {name:22s} calls={bucket.calls:4d}  "
                f"in={bucket.input_tokens:>9d}  out={bucket.output_tokens:>7d}  "
                f"cache_w={bucket.cache_creation_tokens:>7d}  "
                f"cache_r={bucket.cache_read_tokens:>7d}  "
                f"${bucket.cost_usd:.4f}"
            )
        t = self.totals()
        lines.append(
            f"  TOTAL                   calls={t.calls:4d}  "
            f"in={t.input_tokens:>9d}  out={t.output_tokens:>7d}  "
            f"cache_w={t.cache_creation_tokens:>7d}  "
            f"cache_r={t.cache_read_tokens:>7d}  "
            f"${t.cost_usd:.4f}"
        )
        return "\n".join(lines)
