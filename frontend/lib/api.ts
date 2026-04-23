export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8765";

export type RepoSummary = {
  repo: string;
  decisions: number;
  categories: number;
  earliest: string | null;
  latest: string | null;
  ingestion_cost_usd: number;
  query_count: number;
  query_cost_usd: number;
  cache_read_tokens: number;
};

export type LedgerCost = {
  ingestion_cost_usd: number;
  query_cost_usd: number;
  total_cost_usd: number;
  query_count: number;
  cache_read_tokens: number;
  verified_citations: number;
  unverified_citations: number;
};

export type Citation = {
  claim: string;
  quote: string;
  source_type: string;
  source_id: string;
  author: string | null;
  timestamp: string | null;
  url: string;
};

export type Alternative = {
  name: string;
  rejection_reason: string;
  rejection_reason_quoted: string | null;
  source_type: string;
  source_id: string;
  author: string | null;
  url: string;
  confidence: number;
};

export type Decision = {
  id: string;
  pr_number: number;
  title: string;
  summary: string;
  category: string;
  decided_at: string | null;
  decided_by: string[];
  status: string;
  commit_shas: string[];
  confidence: number;
  pr_url: string;
  citations: {
    context: Citation[];
    decision: Citation[];
    forces: Citation[];
    consequences: Citation[];
  };
  alternatives: Alternative[];
};

export type Edge = {
  from_id: string;
  to_id: string;
  kind: "supersedes" | "depends_on" | "related_to";
  reason: string | null;
  from_pr: number;
  to_pr: number;
  from_title: string;
  to_title: string;
  from_category: string;
  to_category: string;
};

export type LedgerResponse = {
  repo: string;
  decision_count: number;
  citation_count: number;
  alternative_count: number;
  edge_count: number;
  decisions: Decision[];
  edges: Edge[];
  cost: LedgerCost;
};

async function loadFixture<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`demo fixture ${path} missing`);
  return (await res.json()) as T;
}

export async function fetchRepos(opts: { demo?: boolean } = {}): Promise<RepoSummary[]> {
  if (opts.demo) return loadFixture<RepoSummary[]>("/demo/gallery-repos.json");
  const res = await fetch(`${API_BASE}/api/repos`);
  if (!res.ok) throw new Error(`/api/repos ${res.status}`);
  return (await res.json()) as RepoSummary[];
}

export async function fetchLedger(
  repo: string,
  opts: { demo?: boolean } = {},
): Promise<LedgerResponse> {
  if (opts.demo) {
    // Demo ships a single ledger fixture (honojs/hono). Unknown repos in
    // demo mode fall through to the real backend so the caller can still
    // surface an error if needed.
    if (repo === "honojs/hono") {
      return loadFixture<LedgerResponse>("/demo/hono-ledger.json");
    }
  }
  const res = await fetch(`${API_BASE}/api/repos/${repo}/ledger`);
  if (!res.ok) throw new Error(`/api/repos/${repo}/ledger ${res.status}`);
  return (await res.json()) as LedgerResponse;
}
