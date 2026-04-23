import { API_BASE } from "./api";

export type QueryPhase = "retrieving" | "reasoning" | "self_checking" | "subgraph" | "done";

export type SelfCheckResult = {
  verified_count?: number;
  unverified_count?: number;
  overall_verdict?: "all_verified" | "some_unverified" | "none_verified" | "unparseable";
  citations?: Array<{
    token: string;
    verified: boolean;
    reason: string;
  }>;
  raw?: string;
  error?: string;
};

export type UsageEvent = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  per_agent: Record<
    string,
    {
      calls: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
    }
  >;
};

export type StatsEvent = {
  repo: string;
  // Query mode fields
  decisions?: number;
  citations?: number;
  alternatives?: number;
  edges?: number;
  // Impact mode fields
  anchor_pr?: number;
  anchor_title?: string;
  subgraph_decisions?: number;
  subgraph_edges?: number;
};

export type SubgraphEvent = {
  anchor_pr: number;
  included_prs: number[];
};

export type ThoughtEvent = {
  label: string;
};

export type QueryEvents = {
  onPhase: (phase: QueryPhase) => void;
  onStats: (stats: StatsEvent) => void;
  onDelta: (text: string) => void;
  onSelfCheck: (result: SelfCheckResult) => void;
  onUsage: (usage: UsageEvent) => void;
  onError: (message: string) => void;
  onSubgraph?: (subgraph: SubgraphEvent) => void;
  onThought?: (thought: ThoughtEvent) => void;
};

export function startQuery(
  repo: string,
  question: string,
  handlers: QueryEvents,
  {
    selfCheck = true,
    effort = "high",
    anchorPr = null,
    mode = "query",
  }: {
    selfCheck?: boolean;
    effort?: "high" | "xhigh";
    anchorPr?: number | null;
    mode?: "query" | "impact";
  } = {},
): EventSource {
  const path = mode === "impact" ? "/api/impact" : "/api/query";
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("repo", repo);
  url.searchParams.set("question", question);
  url.searchParams.set("self_check", selfCheck ? "true" : "false");
  if (mode === "query") {
    url.searchParams.set("effort", effort);
  }
  if (anchorPr !== null && anchorPr !== undefined && mode === "impact") {
    url.searchParams.set("anchor_pr", String(anchorPr));
  }

  const es = new EventSource(url.toString());

  es.addEventListener("phase", (ev) => {
    handlers.onPhase((ev as MessageEvent<string>).data as QueryPhase);
    if ((ev as MessageEvent<string>).data === "done") {
      es.close();
    }
  });
  es.addEventListener("stats", (ev) => {
    handlers.onStats(JSON.parse((ev as MessageEvent<string>).data) as StatsEvent);
  });
  es.addEventListener("delta", (ev) => {
    const data = JSON.parse((ev as MessageEvent<string>).data) as { text: string };
    handlers.onDelta(data.text);
  });
  es.addEventListener("self_check", (ev) => {
    handlers.onSelfCheck(JSON.parse((ev as MessageEvent<string>).data) as SelfCheckResult);
  });
  es.addEventListener("usage", (ev) => {
    handlers.onUsage(JSON.parse((ev as MessageEvent<string>).data) as UsageEvent);
  });
  es.addEventListener("error", (ev) => {
    const mev = ev as MessageEvent<string> & Event;
    if (mev.data) {
      try {
        const parsed = JSON.parse(mev.data) as { message: string };
        handlers.onError(parsed.message);
      } catch {
        handlers.onError(mev.data);
      }
    } else {
      handlers.onError("connection error");
    }
    es.close();
  });

  es.addEventListener("subgraph", (ev) => {
    try {
      const parsed = JSON.parse((ev as MessageEvent<string>).data) as {
        anchor_pr: number;
        included_prs: number[];
      };
      handlers.onSubgraph?.(parsed);
    } catch {
      // ignore
    }
  });

  es.addEventListener("thought", (ev) => {
    try {
      const parsed = JSON.parse((ev as MessageEvent<string>).data) as ThoughtEvent;
      handlers.onThought?.(parsed);
    } catch {
      // ignore — forward-compat: unknown shapes are safe to skip
    }
  });

  return es;
}
