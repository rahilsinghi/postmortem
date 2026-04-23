// frontend/lib/interview.ts
import { API_BASE } from "./api";

export type InterviewSubject = {
  handle: string;
  avatar_url: string;
  citation_count: number;
  decision_count: number;
  span_start: string | null;
  span_end: string | null;
};

export type SubjectMeta = {
  handle: string;
  avatar_url: string;
  decision_count: number;
  citation_count: number;
};

export type ExchangeStartPayload = { index: number; question: string };
export type ExchangeDeltaPayload = { index: number; text_delta: string };
export type ExchangeEndPayload = { index: number };
export type ScriptEndPayload = { usage: { input_tokens: number; output_tokens: number } };

export type ScriptEventName =
  | "subject_meta"
  | "exchange_start"
  | "exchange_delta"
  | "exchange_end"
  | "script_end"
  | "error";

export function parseScriptEvent(
  name: string,
  data: string,
): { name: ScriptEventName; payload: unknown } | null {
  const valid: ScriptEventName[] = [
    "subject_meta",
    "exchange_start",
    "exchange_delta",
    "exchange_end",
    "script_end",
    "error",
  ];
  if (!valid.includes(name as ScriptEventName)) return null;
  try {
    return { name: name as ScriptEventName, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

export type InterviewHandlers = {
  onSubjectMeta: (meta: SubjectMeta) => void;
  onExchangeStart: (p: ExchangeStartPayload) => void;
  onExchangeDelta: (p: ExchangeDeltaPayload) => void;
  onExchangeEnd: (p: ExchangeEndPayload) => void;
  onScriptEnd: (p: ScriptEndPayload) => void;
  onAnswerDelta?: (p: { text_delta: string }) => void;
  onAnswerEnd?: (p: { usage: unknown }) => void;
  onError: (message: string) => void;
};

export async function fetchSubjects(owner: string, repo: string): Promise<InterviewSubject[]> {
  const url = new URL(`${API_BASE}/api/interview/subjects`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`subjects ${r.status}`);
  const body = (await r.json()) as { subjects: InterviewSubject[] };
  return body.subjects;
}

export function startInterview(
  owner: string,
  repo: string,
  author: string,
  handlers: InterviewHandlers,
  { force = false }: { force?: boolean } = {},
): EventSource {
  const url = new URL(`${API_BASE}/api/interview/script`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  url.searchParams.set("author", author);
  if (force) url.searchParams.set("force", "true");
  const es = new EventSource(url.toString());
  attachScriptHandlers(es, handlers);
  es.addEventListener("script_end", () => es.close());
  return es;
}

export function askFollowup(
  owner: string,
  repo: string,
  author: string,
  question: string,
  handlers: InterviewHandlers,
): EventSource {
  const url = new URL(`${API_BASE}/api/interview/followup`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  url.searchParams.set("author", author);
  url.searchParams.set("question", question);
  const es = new EventSource(url.toString());
  es.addEventListener("answer_delta", (ev) => {
    const p = JSON.parse((ev as MessageEvent<string>).data) as { text_delta: string };
    handlers.onAnswerDelta?.(p);
  });
  es.addEventListener("answer_end", (ev) => {
    try {
      const p = JSON.parse((ev as MessageEvent<string>).data) as { usage: unknown };
      handlers.onAnswerEnd?.(p);
    } finally {
      es.close();
    }
  });
  es.addEventListener("error", (ev) => {
    const mev = ev as MessageEvent<string> & Event;
    handlers.onError(mev.data ?? "connection error");
    es.close();
  });
  return es;
}

function attachScriptHandlers(es: EventSource, h: InterviewHandlers): void {
  es.addEventListener("subject_meta", (ev) => {
    h.onSubjectMeta(JSON.parse((ev as MessageEvent<string>).data) as SubjectMeta);
  });
  es.addEventListener("exchange_start", (ev) => {
    h.onExchangeStart(JSON.parse((ev as MessageEvent<string>).data) as ExchangeStartPayload);
  });
  es.addEventListener("exchange_delta", (ev) => {
    h.onExchangeDelta(JSON.parse((ev as MessageEvent<string>).data) as ExchangeDeltaPayload);
  });
  es.addEventListener("exchange_end", (ev) => {
    h.onExchangeEnd(JSON.parse((ev as MessageEvent<string>).data) as ExchangeEndPayload);
  });
  es.addEventListener("script_end", (ev) => {
    h.onScriptEnd(JSON.parse((ev as MessageEvent<string>).data) as ScriptEndPayload);
  });
  es.addEventListener("error", (ev) => {
    const mev = ev as MessageEvent<string> & Event;
    h.onError(mev.data ?? "connection error");
  });
}
