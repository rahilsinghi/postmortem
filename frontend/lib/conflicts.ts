import { API_BASE } from "./api";

export type ConflictSide = {
  pr_number: number;
  title: string;
  position: string;
  quote: string;
  citation: string;
};

export type ConflictSeverity = "high" | "medium" | "low";

export type Conflict = {
  id: string;
  title: string;
  severity: ConflictSeverity;
  decision_a: ConflictSide;
  decision_b: ConflictSide;
  contradiction: string;
  resolution_hint?: string;
};

export type ConflictReport = {
  repo: string;
  generated_at: string;
  model: string;
  conflicts: Conflict[];
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cached: boolean;
};

export async function fetchConflicts(repo: string, force = false): Promise<ConflictReport> {
  const url = new URL(`${API_BASE}/api/conflicts`);
  url.searchParams.set("repo", repo);
  if (force) url.searchParams.set("force", "true");
  const r = await fetch(url.toString());
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`conflicts ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as ConflictReport;
}
