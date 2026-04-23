"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

type Exchange = { question: string; answer: string; complete: boolean };

export type InterviewStatus =
  | "idle"
  | "loading_script"
  | "ready"
  | "asking_followup"
  | "followup_done"
  | "error";

export type InterviewState = {
  status: InterviewStatus;
  subject: string | null;
  collapsed: boolean;
  exchanges: Exchange[];
  followupQuestion: string;
  followupAnswer: string;
  error: string | null;
};

type Action =
  | { type: "open"; subject: string }
  | { type: "close" }
  | { type: "toggle_collapse" }
  | { type: "exchange_start"; index: number; question: string }
  | { type: "exchange_delta"; index: number; text: string }
  | { type: "exchange_end"; index: number }
  | { type: "script_end" }
  | { type: "ask_followup"; question: string }
  | { type: "followup_delta"; text: string }
  | { type: "followup_end" }
  | { type: "error"; message: string };

const initial: InterviewState = {
  status: "idle",
  subject: null,
  collapsed: false,
  exchanges: [],
  followupQuestion: "",
  followupAnswer: "",
  error: null,
};

function reducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case "open":
      return { ...initial, status: "loading_script", subject: action.subject };
    case "close":
      return initial;
    case "toggle_collapse":
      return { ...state, collapsed: !state.collapsed };
    case "exchange_start": {
      const exchanges = state.exchanges.slice();
      exchanges[action.index] = { question: action.question, answer: "", complete: false };
      return { ...state, exchanges };
    }
    case "exchange_delta": {
      const exchanges = state.exchanges.slice();
      const prev = exchanges[action.index];
      if (!prev) return state;
      exchanges[action.index] = { ...prev, answer: prev.answer + action.text };
      return { ...state, exchanges };
    }
    case "exchange_end": {
      const exchanges = state.exchanges.slice();
      const prev = exchanges[action.index];
      if (prev) exchanges[action.index] = { ...prev, complete: true };
      return { ...state, exchanges };
    }
    case "script_end":
      return { ...state, status: "ready" };
    case "ask_followup":
      return {
        ...state,
        status: "asking_followup",
        followupQuestion: action.question,
        followupAnswer: "",
      };
    case "followup_delta":
      return { ...state, followupAnswer: state.followupAnswer + action.text };
    case "followup_end":
      return { ...state, status: "followup_done" };
    case "error":
      return { ...state, status: "error", error: action.message };
    default:
      return state;
  }
}

type ContextValue = {
  state: InterviewState;
  open: (subject: string) => void;
  close: () => void;
  toggleCollapse: () => void;
  dispatch: (action: Action) => void;
};

const Ctx = createContext<ContextValue | null>(null);

export function useInterview(): ContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useInterview() outside <InterviewProvider>");
  return c;
}

export function InterviewProvider({
  owner: _owner,
  repo: _repo,
  children,
}: {
  owner: string;
  repo: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSubject = searchParams.get("interview");
  const [state, dispatch] = useReducer(reducer, initial, (s): InterviewState =>
    urlSubject ? { ...s, status: "loading_script", subject: urlSubject } : s,
  );

  const writeUrl = useCallback(
    (subject: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (subject) next.set("interview", subject);
      else next.delete("interview");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const open = useCallback(
    (subject: string) => {
      dispatch({ type: "open", subject });
      writeUrl(subject);
    },
    [writeUrl],
  );
  const close = useCallback(() => {
    dispatch({ type: "close" });
    writeUrl(null);
  }, [writeUrl]);
  const toggleCollapse = useCallback(() => dispatch({ type: "toggle_collapse" }), []);

  // ⌘I toggles collapse when a subject is selected.
  useEffect(() => {
    if (!state.subject) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.subject, toggleCollapse]);

  const value = useMemo<ContextValue>(
    () => ({ state, open, close, toggleCollapse, dispatch }),
    [state, open, close, toggleCollapse],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
