import { API_BASE } from "./api";

// Shared ingest token. EventSource can't set custom headers, so when the server
// enforces auth we must pass it as a query param. Exposed via NEXT_PUBLIC so it
// rides the browser bundle — this is a "go-away-bot" token, not a secret.
const INGEST_TOKEN = process.env.NEXT_PUBLIC_INGEST_TOKEN ?? "";

export type IngestStartEvent = {
  type: "start";
  repo: string;
  pr_limit: number;
  min_discussion: number;
  concurrency: number;
  classifier_threshold: number;
};

export type IngestPrClassifiedEvent = {
  type: "pr_classified";
  idx: number;
  total: number;
  pr_number: number;
  accepted: boolean;
  is_decision: boolean;
  confidence: number;
  decision_type: string | null;
  title: string | null;
  cost_so_far: number;
  accepted_so_far: number;
  rejected_so_far: number;
};

export type IngestPrExtractedEvent = {
  type: "pr_extracted";
  pr_number: number;
  title: string;
  category: string;
  citations: number;
  alternatives: number;
};

export type IngestDoneEvent = {
  type: "done";
  repo: string;
  prs_seen: number;
  classifier_accepted: number;
  classifier_rejected: number;
  decisions_written: number;
  edges_written: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
};

export type IngestEvent =
  | IngestStartEvent
  | { type: "listing"; pr_limit: number }
  | { type: "listed"; count: number }
  | { type: "filtered"; before: number; after: number; min_discussion: number }
  | IngestPrClassifiedEvent
  | IngestPrExtractedEvent
  | { type: "pr_error"; error: string }
  | { type: "persisting" }
  | { type: "stitching"; decisions: number }
  | { type: "stitcher_error"; message: string }
  | IngestDoneEvent
  | { type: "error"; message: string };

export type IngestHandlers = {
  onEvent: (event: IngestEvent) => void;
  onClose: () => void;
};

export type IngestOptions = {
  limit?: number;
  minDiscussion?: number;
  concurrency?: number;
};

export function startIngest(
  repo: string,
  handlers: IngestHandlers,
  options: IngestOptions = {},
): EventSource {
  const url = new URL(`${API_BASE}/api/ingest`);
  url.searchParams.set("repo", repo);
  if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
  if (options.minDiscussion !== undefined)
    url.searchParams.set("min_discussion", String(options.minDiscussion));
  if (options.concurrency !== undefined)
    url.searchParams.set("concurrency", String(options.concurrency));
  if (INGEST_TOKEN) url.searchParams.set("token", INGEST_TOKEN);

  const es = new EventSource(url.toString());

  const known = [
    "start",
    "listing",
    "listed",
    "filtered",
    "pr_classified",
    "pr_extracted",
    "pr_error",
    "persisting",
    "stitching",
    "stitcher_error",
    "done",
    "error",
  ] as const;

  for (const name of known) {
    es.addEventListener(name, (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent<string>).data) as IngestEvent;
        handlers.onEvent(data);
      } catch {
        // ignore malformed
      }
      if (name === "done" || name === "error") {
        es.close();
        handlers.onClose();
      }
    });
  }

  es.addEventListener("error", () => {
    // Browser EventSource 'error' without our custom payload fires on close; ignore.
  });

  return es;
}
