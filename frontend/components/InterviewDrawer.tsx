"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Decision } from "../lib/api";
import { useDemo } from "../lib/demo/DemoProvider";
import { askFollowup, startInterview, type SubjectMeta } from "../lib/interview";
import { useInterview } from "../lib/InterviewProvider";
import { useReducedMotion } from "../lib/motion";
import { InterviewBubble } from "./InterviewBubble";

/** Fixture event shape written by scripts/freeze-interview-fixture.py. */
type FixtureEvent = { ts_ms: number; event: string; data: unknown };

/**
 * Replay a captured interview SSE stream into the same dispatch shape the
 * live `startInterview` drives. Used only while the demo provider reports
 * `isDemo === true`; production playback is untouched.
 */
function replayInterviewFixture(
  subject: string,
  onMeta: (m: SubjectMeta) => void,
  dispatch: ReturnType<typeof useInterview>["dispatch"],
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  fetch(`/demo/hono-interview-${subject}.json`, { cache: "no-store" })
    .then((r) => r.json() as Promise<{ events: FixtureEvent[] }>)
    .then((body) => {
      if (cancelled) return;
      for (const ev of body.events) {
        const id = setTimeout(() => {
          if (cancelled) return;
          switch (ev.event) {
            case "subject_meta":
              onMeta(ev.data as SubjectMeta);
              break;
            case "exchange_start": {
              const p = ev.data as { index: number; question: string };
              dispatch({ type: "exchange_start", index: p.index, question: p.question });
              break;
            }
            case "exchange_delta": {
              const p = ev.data as { index: number; text_delta: string };
              dispatch({ type: "exchange_delta", index: p.index, text: p.text_delta });
              break;
            }
            case "exchange_end": {
              const p = ev.data as { index: number };
              dispatch({ type: "exchange_end", index: p.index });
              break;
            }
            case "script_end":
              dispatch({ type: "script_end" });
              break;
          }
        }, ev.ts_ms);
        timers.push(id);
      }
    })
    .catch((err) => {
      if (!cancelled) dispatch({ type: "error", message: String(err) });
    });

  return () => {
    cancelled = true;
    for (const id of timers) clearTimeout(id);
  };
}

export function InterviewDrawer({
  owner,
  repo,
  decisions,
}: {
  owner: string;
  repo: string;
  decisions: Decision[];
}) {
  const { state, close, toggleCollapse, dispatch } = useInterview();
  const { isDemo } = useDemo();
  const reduced = useReducedMotion();
  const [meta, setMeta] = useState<SubjectMeta | null>(null);
  const followInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest bubble.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.exchanges, state.followupAnswer]);

  // Open an EventSource when a subject is loaded. In demo mode, replay a
  // captured fixture so playback is deterministic and API-free.
  useEffect(() => {
    if (!state.subject || state.status !== "loading_script") return;
    if (isDemo) {
      return replayInterviewFixture(state.subject, setMeta, dispatch);
    }
    const es = startInterview(owner, repo, state.subject, {
      onSubjectMeta: setMeta,
      onExchangeStart: (p) =>
        dispatch({ type: "exchange_start", index: p.index, question: p.question }),
      onExchangeDelta: (p) =>
        dispatch({ type: "exchange_delta", index: p.index, text: p.text_delta }),
      onExchangeEnd: (p) => dispatch({ type: "exchange_end", index: p.index }),
      onScriptEnd: () => dispatch({ type: "script_end" }),
      onError: (m) => dispatch({ type: "error", message: m }),
    });
    return () => es.close();
  }, [owner, repo, state.subject, state.status, dispatch, isDemo]);

  if (!state.subject) return null;

  const isCollapsed = state.collapsed;
  const width = isCollapsed ? 44 : 440;

  const submitFollowup = () => {
    const q = followInputRef.current?.value.trim();
    if (!q || state.status !== "ready" || !state.subject) return;
    dispatch({ type: "ask_followup", question: q });
    askFollowup(owner, repo, state.subject, q, {
      onSubjectMeta: () => {},
      onExchangeStart: () => {},
      onExchangeDelta: () => {},
      onExchangeEnd: () => {},
      onScriptEnd: () => {},
      onAnswerDelta: (p) => dispatch({ type: "followup_delta", text: p.text_delta }),
      onAnswerEnd: () => dispatch({ type: "followup_end" }),
      onError: (m) => dispatch({ type: "error", message: m }),
    });
    if (followInputRef.current) followInputRef.current.value = "";
  };

  return (
    <motion.aside
      aria-label={`interview with @${state.subject}`}
      initial={reduced ? false : { x: 40 }}
      animate={{ x: 0, width }}
      transition={reduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-[#d4a24c]/30 bg-zinc-950/95 backdrop-blur"
      style={{ width }}
    >
      {isCollapsed ? (
        <button
          type="button"
          className="flex h-full w-full items-start justify-center pt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4a24c]"
          onClick={toggleCollapse}
          aria-label="expand interview drawer"
        >
          <span className="origin-center rotate-90 whitespace-nowrap">👁 @{state.subject}</span>
        </button>
      ) : (
        <>
          <header className="flex shrink-0 items-center gap-3 border-b border-zinc-900 px-4 py-3">
            {meta ? (
              // biome-ignore lint/performance/noImgElement: avatar from github user content
              <img
                src={meta.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full border border-zinc-700"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800" />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="truncate font-medium text-zinc-50">@{state.subject}</div>
              <div className="truncate font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {meta
                  ? `${meta.decision_count} decisions · ${meta.citation_count} quoted lines`
                  : "loading…"}
              </div>
            </div>
            <button
              type="button"
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
              onClick={toggleCollapse}
              aria-label="collapse"
            >
              ⌘I
            </button>
            <button
              type="button"
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
              onClick={close}
              aria-label="close"
            >
              ✕
            </button>
          </header>

          {/* Progress bar across 6 segments */}
          <div className="flex h-[2px] w-full shrink-0 bg-zinc-900">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length
                key={`seg-${i}`}
                className="flex-1 border-r border-zinc-950 transition-colors"
                style={{
                  backgroundColor: state.exchanges[i]?.complete ? "#d4a24c" : "transparent",
                }}
              />
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {state.exchanges.map((ex, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: position
              <div key={`ex-${idx}`} className="space-y-2">
                <InterviewBubble role="interviewer" text={ex.question} decisions={decisions} />
                <InterviewBubble
                  role="subject"
                  text={ex.answer}
                  decisions={decisions}
                  streaming={!ex.complete}
                />
              </div>
            ))}
            {state.status === "asking_followup" || state.status === "followup_done" ? (
              <div className="space-y-2 pt-2">
                <InterviewBubble
                  role="interviewer"
                  text={state.followupQuestion}
                  decisions={decisions}
                />
                <InterviewBubble
                  role="subject"
                  text={state.followupAnswer}
                  decisions={decisions}
                  streaming={state.status === "asking_followup"}
                />
              </div>
            ) : null}
            {state.status === "error" ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[12px] text-rose-300">
                interview interrupted · {state.error ?? "unknown error"}
              </div>
            ) : null}
          </div>

          <footer className="shrink-0 border-t border-zinc-900 px-3 py-2.5">
            {state.status === "ready" ? (
              <div className="flex items-center gap-2">
                <input
                  ref={followInputRef}
                  placeholder="ask one follow-up…"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#d4a24c]/60 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitFollowup();
                  }}
                />
                <button
                  type="button"
                  className="rounded-md border border-[#d4a24c]/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#d4a24c] hover:bg-[#d4a24c]/10"
                  onClick={submitFollowup}
                >
                  ask
                </button>
              </div>
            ) : state.status === "followup_done" ? (
              <button
                type="button"
                className="w-full rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-[#d4a24c]/40 hover:text-[#d4a24c]"
                onClick={close}
              >
                interview complete · start another →
              </button>
            ) : (
              <div className="text-center font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {state.status === "loading_script" ? "summoning…" : "waiting"}
              </div>
            )}
          </footer>
        </>
      )}
    </motion.aside>
  );
}
