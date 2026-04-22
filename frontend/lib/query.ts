import { API_BASE } from "./api";

export type QueryPhase = "retrieving" | "reasoning" | "self_checking" | "done";

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
  decisions: number;
  citations: number;
  alternatives: number;
  edges: number;
};

export type QueryEvents = {
  onPhase: (phase: QueryPhase) => void;
  onStats: (stats: StatsEvent) => void;
  onDelta: (text: string) => void;
  onSelfCheck: (result: SelfCheckResult) => void;
  onUsage: (usage: UsageEvent) => void;
  onError: (message: string) => void;
};

export function startQuery(
  repo: string,
  question: string,
  handlers: QueryEvents,
  { selfCheck = true, effort = "high" }: { selfCheck?: boolean; effort?: "high" | "xhigh" } = {},
): EventSource {
  const url = new URL(`${API_BASE}/api/query`);
  url.searchParams.set("repo", repo);
  url.searchParams.set("question", question);
  url.searchParams.set("self_check", selfCheck ? "true" : "false");
  url.searchParams.set("effort", effort);

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

  return es;
}
