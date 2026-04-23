/**
 * Streaming-safe parse of Opus answers into the Anchored-Claim-Cards shape.
 *
 * Input grammar (enforced by QUERY_SYSTEM_PROMPT):
 *
 *   ## Answer
 *   <1-2 sentence synthesis>
 *
 *   ## Reasoning
 *   1. **Short Title.** <prose with inline "quoted" text and [PR #N, @a, date] tokens>
 *   2. **Another Title.** <prose>
 *   ...
 *
 *   ## Rejected alternatives          ← opaque tail, preserved verbatim
 *   ## Related                        ← opaque tail, preserved verbatim
 *   ## Follow-ups                     ← opaque tail, preserved verbatim
 *
 * The parser runs on every SSE tick. Partial input is expected: the last step
 * may have an unterminated `**Title.` or be missing a trailing period. We
 * degrade gracefully — title stays empty until `**` closes, body streams in,
 * and `complete` flips true once we see the next numbered step or a `## ` tail.
 */

export type PulledQuote = {
  text: string;
  token: string;
};

export type AnswerStep = {
  index: number;
  title: string;
  body: string;
  pulledQuote?: PulledQuote;
  complete: boolean;
};

export type ParsedAnswer = {
  tldr: string;
  steps: AnswerStep[];
  tail: string;
};

// `## Answer` and `## Reasoning` are the two sections we reshape. Any other
// `## Something` starts the opaque tail that falls through to the legacy
// renderer (rejected alternatives, related, follow-ups).
const SECTION_RE = /^##\s+(.+?)\s*$/gm;
const STEP_HEAD_RE = /^\s*(\d+)\.\s+\*\*([^*]+?)\.\*\*\s*/;
const STEP_HEAD_PARTIAL_RE = /^\s*(\d+)\.\s+(?:\*\*[^*]*)?$/;
// Last "quoted fragment" immediately followed by a bracket citation token.
// Allows optional whitespace/punctuation between the closing quote and the
// citation, and supports curly quotes (Opus emits these sometimes).
const QUOTE_WITH_CITATION_RE = /["\u201C]([^"\u201D]{8,})["\u201D][^[]{0,12}?(\[[^\]]+\])/gu;

export function parseAnswer(text: string): ParsedAnswer {
  if (!text) return { tldr: "", steps: [], tail: "" };

  const sections = splitSections(text);
  const answerSection = sections.find((s) => /^answer$/i.test(s.name));
  const reasoningSection = sections.find((s) => /^reasoning$/i.test(s.name));
  const tailSections = sections.filter(
    (s) => !/^answer$/i.test(s.name) && !/^reasoning$/i.test(s.name),
  );

  const tldr = (answerSection?.body ?? "").trim();
  const steps = reasoningSection ? parseSteps(reasoningSection.body) : [];
  const tail = tailSections
    .map((s) => `## ${s.name}\n${s.body}`)
    .join("\n\n")
    .trim();

  return { tldr, steps, tail };
}

/** Split on `## Header` lines, preserving each section's body. */
function splitSections(text: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const matches: { idx: number; name: string }[] = [];
  let m: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
  while ((m = SECTION_RE.exec(text)) !== null) {
    matches.push({ idx: m.index, name: m[1] });
  }
  if (matches.length === 0) {
    // No section headers — treat the whole blob as Answer body so streaming
    // answers with no section markers yet still show something.
    return [{ name: "Answer", body: text }];
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const nextStart = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const slice = text.slice(start, nextStart);
    const firstNewline = slice.indexOf("\n");
    const body = firstNewline === -1 ? "" : slice.slice(firstNewline + 1);
    out.push({ name: matches[i].name, body });
  }
  return out;
}

/** Parse numbered steps out of the `## Reasoning` body. */
function parseSteps(body: string): AnswerStep[] {
  const steps: AnswerStep[] = [];
  if (!body) return steps;

  // Split on a line that starts with `N. **` — keep the delimiter so we can
  // recover the title. Walk line-by-line to survive incomplete tail text.
  const lines = body.split("\n");
  let current: AnswerStep | null = null;
  const flush = () => {
    if (!current) return;
    current.body = current.body.trim();
    current.pulledQuote = extractPulledQuote(current.body);
    // A step is "complete" once any later line exists — caller flips the last
    // one back to incomplete if the overall stream is still in flight.
    current.complete = true;
    steps.push(current);
    current = null;
  };

  for (const line of lines) {
    const full = STEP_HEAD_RE.exec(line);
    if (full) {
      flush();
      const afterHead = line.slice(full[0].length);
      current = {
        index: Number(full[1]),
        title: full[2],
        body: afterHead,
        complete: false,
      };
      continue;
    }
    const partial = STEP_HEAD_PARTIAL_RE.exec(line);
    if (partial && !current) {
      // The step head is still arriving — render an empty-title skeleton.
      current = {
        index: Number(partial[1]),
        title: "",
        body: "",
        complete: false,
      };
      continue;
    }
    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  flush();
  if (steps.length > 0) steps[steps.length - 1].complete = looksComplete(body, steps.length);
  return steps;
}

/**
 * Roughly decide whether the last step is still streaming. We consider a step
 * complete if the body ends with sentence-terminating punctuation or a closing
 * bracket — both signal Opus has finished emitting that step.
 */
function looksComplete(body: string, _stepCount: number): boolean {
  const trimmed = body.trimEnd();
  if (!trimmed) return false;
  const last = trimmed.slice(-1);
  return last === "." || last === "]" || last === "!" || last === "?";
}

function extractPulledQuote(body: string): PulledQuote | undefined {
  QUOTE_WITH_CITATION_RE.lastIndex = 0;
  let best: PulledQuote | undefined;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
  while ((m = QUOTE_WITH_CITATION_RE.exec(body)) !== null) {
    best = { text: m[1].trim(), token: m[2] };
  }
  return best;
}
