"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { type AnswerStep, parseAnswer } from "../lib/answerParser";
import type { Decision } from "../lib/api";
import { parseCitations, splitWithCitations } from "../lib/citations";
import { useReducedMotion } from "../lib/motion";
import type { SelfCheckResult } from "../lib/query";
import { CitationChip } from "./CitationChip";
import { InterviewButton } from "./InterviewButton";

/**
 * "Anchored claim cards" answer layout.
 *
 * Renders the `## Answer` / `## Reasoning` portion as a bold TL;DR hero +
 * citation summary strip + one card per reasoning step. Each card has a
 * title (emitted by Opus as `**Title.**`), prose body with inline citation
 * chips, and — when detectable — a pulled-out verbatim quote with amber
 * accent and author attribution.
 *
 * The tail (`## Rejected alternatives`, `## Related`, `## Follow-ups`) is
 * rendered with the existing ⊢ section style so it visually matches the
 * rest of the app — this redesign is intentionally scoped to the Answer +
 * Reasoning pair.
 */
export function AnswerView({
  text,
  decisions,
  selfCheck,
  streaming = false,
  onFollow,
}: {
  text: string;
  decisions: Decision[];
  selfCheck: SelfCheckResult | null;
  streaming?: boolean;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  const reduced = useReducedMotion();
  const parsed = useMemo(
    () => parseAnswer(streaming ? trimToWordBoundary(text) : text),
    [text, streaming],
  );
  const verdictByToken = useMemo(() => {
    const m = new Map<string, { verified: boolean; reason: string }>();
    if (selfCheck?.citations) {
      for (const c of selfCheck.citations) {
        m.set(c.token, { verified: c.verified, reason: c.reason });
      }
    }
    return m;
  }, [selfCheck]);

  const summary = useMemo(
    () => citationSummary(parsed.steps, decisions),
    [parsed.steps, decisions],
  );
  const pathname = usePathname() ?? "";
  const pathMatch = /\/ledger\/([^/]+)\/([^/?#]+)/.exec(pathname);
  const owner = pathMatch?.[1] ?? "";
  const repo = pathMatch?.[2] ?? "";
  const dominant = useMemo(
    () => dominantAuthor(parsed.tldr ?? "", parsed.steps),
    [parsed.tldr, parsed.steps],
  );
  if (!text) return null;

  const tailSections = parsed.tail ? splitTail(parsed.tail) : [];

  return (
    <div className="space-y-5">
      {/* TL;DR hero */}
      {parsed.tldr ? (
        <motion.section
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4a24c]/80">
            <span className="text-[#d4a24c]">⊢</span>
            <span>Answer</span>
          </h3>
          <div className="rounded-xl border border-[#d4a24c]/30 bg-gradient-to-br from-[#d4a24c]/[0.07] via-zinc-950 to-zinc-950 p-4">
            {/* Wrapper is <div> not <p> because CitationChip renders a
                ProvenanceCard containing a <blockquote>, and blockquotes
                aren't valid children of paragraph elements. */}
            <div className="text-[15px] font-medium leading-relaxed text-zinc-50">
              <InlineWithCitations
                text={parsed.tldr}
                decisions={decisions}
                verdict={verdictByToken}
                onFollow={onFollow}
              />
              {streaming && parsed.steps.length === 0 ? <TypingCursor /> : null}
            </div>
            {summary ? (
              <div className="mt-3 border-t border-zinc-900 pt-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {summary}
              </div>
            ) : null}
            {dominant && owner && repo ? (
              <div className="mt-3 border-t border-[#d4a24c]/20 pt-2">
                <InterviewButton
                  variant="answer-inline"
                  owner={owner}
                  repo={repo}
                  author={dominant}
                />
              </div>
            ) : null}
          </div>
        </motion.section>
      ) : null}

      {/* Reasoning — one card per numbered step */}
      {parsed.steps.length > 0 ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            <span className="text-[#d4a24c]">⊢</span>
            <span>Reasoning</span>
            <span className="ml-auto font-mono text-[10px] text-zinc-600">
              {parsed.steps.length} {parsed.steps.length === 1 ? "step" : "steps"}
            </span>
          </h3>
          <ol className="space-y-3">
            {parsed.steps.map((step, idx) => {
              const isLastStep = idx === parsed.steps.length - 1;
              const showCursor = streaming && isLastStep && !step.complete;
              return (
                <StepCard
                  key={`step-${step.index}`}
                  step={step}
                  decisions={decisions}
                  verdict={verdictByToken}
                  streaming={showCursor}
                  onFollow={onFollow}
                />
              );
            })}
          </ol>
        </section>
      ) : null}

      {/* Tail: rejected alternatives, related, follow-ups — each gets its
          own palette + structured item parse so judges can skim the answer. */}
      {tailSections.map((sec) => (
        <TailSection
          key={`tail-${sec.heading}`}
          heading={sec.heading}
          body={sec.body}
          decisions={decisions}
          verdict={verdictByToken}
          onFollow={onFollow}
        />
      ))}
    </div>
  );
}

type TailKind = "rejected" | "related" | "followups" | "other";

const TAIL_PALETTES: Record<
  TailKind,
  {
    border: string;
    bg: string;
    accent: string;
    glyph: string;
    glyphColor: string;
    labelColor: string;
    chipBorder: string;
  }
> = {
  rejected: {
    border: "border-rose-500/30",
    bg: "bg-rose-950/20",
    accent: "bg-rose-500",
    glyph: "✕",
    glyphColor: "text-rose-300",
    labelColor: "text-rose-300/80",
    chipBorder: "border-rose-900/60",
  },
  related: {
    border: "border-cyan-500/30",
    bg: "bg-cyan-950/20",
    accent: "bg-cyan-500",
    glyph: "⟿",
    glyphColor: "text-cyan-300",
    labelColor: "text-cyan-300/80",
    chipBorder: "border-cyan-900/60",
  },
  followups: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-950/20",
    accent: "bg-emerald-500",
    glyph: "→",
    glyphColor: "text-emerald-300",
    labelColor: "text-emerald-300/80",
    chipBorder: "border-emerald-900/60",
  },
  other: {
    border: "border-zinc-700/60",
    bg: "bg-zinc-950",
    accent: "bg-zinc-500",
    glyph: "⊢",
    glyphColor: "text-zinc-400",
    labelColor: "text-zinc-400",
    chipBorder: "border-zinc-800",
  },
};

function classifyHeading(heading: string): TailKind {
  const h = heading.toLowerCase();
  if (h.includes("rejected") || h.includes("alternative")) return "rejected";
  if (h.includes("related")) return "related";
  if (h.includes("follow")) return "followups";
  return "other";
}

function TailSection({
  heading,
  body,
  decisions,
  verdict,
  onFollow,
}: {
  heading: string;
  body: string;
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  const reduced = useReducedMotion();
  const kind = classifyHeading(heading);
  const palette = TAIL_PALETTES[kind];
  const items = useMemo(
    () => parseTailItems(body, kind),
    [body, kind],
  );
  const count = items.length;
  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
      className={`overflow-hidden rounded-xl border ${palette.border} ${palette.bg}`}
    >
      <header className="flex items-center gap-2 border-b border-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">
        <span className={palette.glyphColor}>{palette.glyph}</span>
        <span className={palette.labelColor}>{heading}</span>
        {count > 0 ? (
          <span className="ml-auto rounded-full border border-white/10 px-2 py-[1px] font-mono text-[9px] tracking-wider text-zinc-400">
            {count}
          </span>
        ) : null}
      </header>
      <div className="px-4 py-3 space-y-2.5">
        {items.length === 0 ? (
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">
            <InlineRich text={body} decisions={decisions} verdict={verdict} onFollow={onFollow} />
          </div>
        ) : (
          items.map((item, idx) => (
            <TailItem
              // biome-ignore lint/suspicious/noArrayIndexKey: stable within a parse pass
              key={`tail-item-${idx}`}
              item={item}
              kind={kind}
              palette={palette}
              decisions={decisions}
              verdict={verdict}
              onFollow={onFollow}
            />
          ))
        )}
      </div>
    </motion.section>
  );
}

type TailItem = {
  ordinal?: number; // only for follow-ups
  headline?: string; // bolded lead, e.g. "Importing `Buffer` from `node:buffer`"
  body: string; // remaining prose (may contain inline citations)
};

function parseTailItems(body: string, kind: TailKind): TailItem[] {
  const lines = body.split("\n");
  const items: TailItem[] = [];
  const bulletRe = /^\s*[-*]\s+(.*)$/;
  const numberedRe = /^\s*(\d+)\.\s+(.*)$/;
  let current: TailItem | null = null;
  const flush = () => {
    if (current) items.push(current);
    current = null;
  };
  for (const line of lines) {
    if (kind === "followups") {
      const nm = numberedRe.exec(line);
      if (nm) {
        flush();
        current = { ordinal: Number(nm[1]), body: nm[2] };
        continue;
      }
    }
    const bm = bulletRe.exec(line);
    if (bm) {
      flush();
      current = splitHeadline(bm[1]);
      continue;
    }
    if (current) {
      current.body += (current.body ? " " : "") + line.trim();
    } else if (line.trim()) {
      // Untagged prose — keep as a single item so it still renders cleanly.
      current = { body: line };
    }
  }
  flush();
  return items.filter((it) => it.body.trim() || it.headline?.trim());
}

/**
 * Split a bullet like `**Importing Buffer...** — rejected because "..." [cite]`
 * into a structured `{ headline, body }`. Handles optional `Related: ` prefix
 * and the em-dash / hyphen separator between headline and reason.
 */
function splitHeadline(raw: string): TailItem {
  // Strip a leading "Related: " or "Supersedes: " / "Depends on: " label.
  let text = raw.replace(/^(Related|Supersedes|Depends on):\s*/i, "").trim();

  // Case 1: starts with **…** headline
  const boldMatch = /^\*\*([^*]+?)\*\*\s*(?:[—–-]\s*)?([\s\S]*)$/.exec(text);
  if (boldMatch) {
    const headline = boldMatch[1].trim();
    const body = boldMatch[2].trim();
    return { headline, body };
  }
  // Case 2: `Title [PR #N]` — no bold, take everything before first bracket as headline.
  const bracketIdx = text.indexOf("[");
  if (bracketIdx > 12) {
    const headline = text.slice(0, bracketIdx).trim().replace(/[—–-]$/, "").trim();
    const body = text.slice(bracketIdx).trim();
    return { headline, body };
  }
  return { body: text };
}

function TailItem({
  item,
  kind,
  palette,
  decisions,
  verdict,
  onFollow,
}: {
  item: TailItem;
  kind: TailKind;
  palette: (typeof TAIL_PALETTES)[TailKind];
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  return (
    <div
      className={`rounded-lg border ${palette.chipBorder} bg-black/30 p-3 transition hover:bg-black/50`}
    >
      <div className="flex items-baseline gap-2.5">
        {item.ordinal !== undefined ? (
          <span className={`font-mono text-[10px] tabular-nums ${palette.glyphColor}`}>
            {String(item.ordinal).padStart(2, "0")}
          </span>
        ) : (
          <span className={`mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${palette.accent}`} />
        )}
        <div className="flex-1 text-[13px] leading-relaxed text-zinc-100">
          {item.headline ? (
            <div className="font-medium text-zinc-50">
              <InlineRich
                text={item.headline}
                decisions={decisions}
                verdict={verdict}
                onFollow={onFollow}
              />
            </div>
          ) : null}
          {item.body ? (
            <div className={item.headline ? "mt-1 text-zinc-300" : "text-zinc-200"}>
              <InlineRich
                text={item.body}
                decisions={decisions}
                verdict={verdict}
                onFollow={onFollow}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline renderer that handles **bold**, citation chips, and plain text. Used
 * everywhere we're rendering Opus output so `**…**` never leaks to the UI.
 */
export function InlineRich({
  text,
  decisions,
  verdict,
  onFollow,
}: {
  text: string;
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  // Walk the string, handle **bold** runs, and defer non-bold chunks to
  // splitWithCitations so citation chips render exactly once.
  const parts: Array<{ kind: "bold" | "plain"; text: string }> = [];
  let i = 0;
  while (i < text.length) {
    const boldStart = text.indexOf("**", i);
    if (boldStart === -1) {
      parts.push({ kind: "plain", text: text.slice(i) });
      break;
    }
    const boldEnd = text.indexOf("**", boldStart + 2);
    if (boldEnd === -1) {
      parts.push({ kind: "plain", text: text.slice(i) });
      break;
    }
    if (boldStart > i) parts.push({ kind: "plain", text: text.slice(i, boldStart) });
    parts.push({ kind: "bold", text: text.slice(boldStart + 2, boldEnd) });
    i = boldEnd + 2;
  }
  return (
    <>
      {parts.map((p, idx) => {
        if (p.kind === "bold") {
          return (
            <strong
              // biome-ignore lint/suspicious/noArrayIndexKey: position-based key
              key={`b-${idx}`}
              className="font-semibold text-zinc-50"
            >
              <InlineWithCitations
                text={p.text}
                decisions={decisions}
                verdict={verdict}
                onFollow={onFollow}
              />
            </strong>
          );
        }
        return (
          <InlineWithCitations
            // biome-ignore lint/suspicious/noArrayIndexKey: position-based key
            key={`p-${idx}`}
            text={p.text}
            decisions={decisions}
            verdict={verdict}
            onFollow={onFollow}
          />
        );
      })}
    </>
  );
}

function StepCard({
  step,
  decisions,
  verdict,
  streaming,
  onFollow,
}: {
  step: AnswerStep;
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  streaming: boolean;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  const reduced = useReducedMotion();
  const bodyWithoutQuote = step.pulledQuote
    ? stripPulledQuote(step.body, step.pulledQuote.text, step.pulledQuote.token)
    : step.body;
  const quoteVerdict = step.pulledQuote ? verdict.get(step.pulledQuote.token) : null;
  const quoteMeta = step.pulledQuote ? parseCitations(step.pulledQuote.token)[0] : null;

  return (
    <motion.li
      layout
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="list-none rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-zinc-700"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] tabular-nums text-zinc-600">
          {String(step.index).padStart(2, "0")}
        </span>
        <h4 className="flex-1 text-[13px] font-semibold tracking-tight text-zinc-50">
          {step.title ? (
            step.title
          ) : (
            <span className="inline-flex items-center gap-1.5 text-zinc-600">
              <motion.span
                aria-hidden
                className="inline-block h-1 w-6 rounded-full bg-zinc-700"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider">thinking…</span>
            </span>
          )}
        </h4>
      </div>

      {bodyWithoutQuote.trim() ? (
        <div className="mt-2 pl-8 text-[13px] leading-relaxed text-zinc-300">
          <InlineWithCitations
            text={bodyWithoutQuote}
            decisions={decisions}
            verdict={verdict}
            onFollow={onFollow}
          />
          {streaming ? <TypingCursor /> : null}
        </div>
      ) : streaming ? (
        <div className="mt-2 pl-8">
          <TypingCursor />
        </div>
      ) : null}

      {step.pulledQuote ? (
        <motion.blockquote
          layout
          initial={reduced ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`mt-3 ml-8 rounded-md border-l-2 ${
            quoteVerdict?.verified === false
              ? "border-rose-500/70 bg-rose-950/20"
              : "border-[#d4a24c]/70 bg-zinc-900/50"
          } py-2 pl-3 pr-3`}
        >
          <p className="font-mono text-[12px] italic leading-relaxed text-zinc-100">
            &ldquo;{step.pulledQuote.text}&rdquo;
          </p>
          {quoteMeta ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <span className="text-zinc-300">@{quoteMeta.author}</span>
              {quoteMeta.prNumber ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>
                    PR #{quoteMeta.prNumber}
                    {quoteMeta.kind === "review"
                      ? " review"
                      : quoteMeta.kind === "inline"
                        ? " inline"
                        : ""}
                  </span>
                </>
              ) : null}
              {quoteMeta.dateIso ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{quoteMeta.dateIso}</span>
                </>
              ) : null}
              {quoteVerdict?.verified === false ? (
                <span className="ml-auto rounded-full border border-rose-500/40 px-2 py-[1px] text-rose-300">
                  unverified
                </span>
              ) : quoteVerdict?.verified === true ? (
                <span className="ml-auto rounded-full border border-emerald-500/40 px-2 py-[1px] text-emerald-300">
                  verified
                </span>
              ) : null}
            </p>
          ) : null}
        </motion.blockquote>
      ) : null}
    </motion.li>
  );
}

function InlineWithCitations({
  text,
  decisions,
  verdict,
  onFollow,
}: {
  text: string;
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  const { segments } = splitWithCitations(text);
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.kind === "text") {
          // biome-ignore lint/suspicious/noArrayIndexKey: position-based key
          return <span key={`t-${idx}`}>{seg.content}</span>;
        }
        if (!seg.citation) return null;
        const v = verdict.get(seg.content);
        return (
          <CitationChip
            // biome-ignore lint/suspicious/noArrayIndexKey: position-based key
            key={`c-${idx}`}
            match={seg.citation}
            decisions={decisions}
            verified={v?.verified ?? null}
            unverifiedReason={v?.reason ?? null}
            onFollow={onFollow}
          />
        );
      })}
    </>
  );
}

function TypingCursor() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[0.5em] -translate-y-[1px] rounded-[1px] align-middle"
      style={{ backgroundColor: "#d4a24c" }}
      animate={
        reduced
          ? {}
          : {
              backgroundColor: ["#d4a24c", "#fafafa", "#d4a24c"],
              opacity: [0.9, 1, 0.9],
            }
      }
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/**
 * Count resolvable quote-bearing citations + unique PRs + unique authors
 * across all reasoning steps. Used as the hero strip under the TL;DR.
 */
function citationSummary(steps: AnswerStep[], decisions: Decision[]): string {
  const tokens = new Set<string>();
  const prs = new Set<number>();
  const authors = new Set<string>();
  for (const step of steps) {
    const matches = parseCitations(step.body);
    for (const m of matches) {
      tokens.add(m.token);
      if (m.prNumber) prs.add(m.prNumber);
      if (m.author) authors.add(m.author);
    }
  }
  if (tokens.size === 0) return "";
  const prList = prs.size > 0 ? `${prs.size} ${prs.size === 1 ? "PR" : "PRs"}` : null;
  const authorList =
    authors.size > 0 ? `${authors.size} ${authors.size === 1 ? "author" : "authors"}` : null;
  const ledgerCount = decisions.length;
  return [
    `${tokens.size} ${tokens.size === 1 ? "citation" : "citations"}`,
    prList,
    authorList,
    `across ${ledgerCount} decisions`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function stripPulledQuote(body: string, quoteText: string, token: string): string {
  // Remove `"<quote>" ... [token]` (any short glue between).
  const re = new RegExp(
    `["\u201C]${escapeRe(quoteText)}["\u201D][^\\[]{0,12}?${escapeRe(token)}`,
    "u",
  );
  return body
    .replace(re, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitTail(tail: string): { heading: string; body: string }[] {
  // parseAnswer already prefixed each tail section with `## Heading\nbody`.
  const parts = tail.split(/\n##\s+/).filter(Boolean);
  return parts.map((block) => {
    const cleaned = block.startsWith("## ") ? block.slice(3) : block;
    const firstNl = cleaned.indexOf("\n");
    const heading = firstNl === -1 ? cleaned : cleaned.slice(0, firstNl);
    const body = firstNl === -1 ? "" : cleaned.slice(firstNl + 1);
    return { heading: heading.trim(), body };
  });
}

function trimToWordBoundary(text: string): string {
  if (!text) return text;
  const terminators = [" ", "\n", "\t", ".", ",", ";", ":", "]", ")", "—", "-", "!"];
  let cutoff = -1;
  for (const t of terminators) {
    const idx = text.lastIndexOf(t);
    if (idx > cutoff) cutoff = idx;
  }
  if (cutoff < 0) return "";
  return text.slice(0, cutoff + 1);
}

function dominantAuthor(tldr: string, steps: AnswerStep[]): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  const bodies = [tldr, ...steps.map((s) => s.body)];
  const re = /\[[^\]]*@([A-Za-z0-9][A-Za-z0-9-]*),/g;
  for (const body of bodies) {
    let m: RegExpExecArray | null = re.exec(body);
    while (m !== null) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      total++;
      m = re.exec(body);
    }
    re.lastIndex = 0;
  }
  if (total < 3) return null;
  for (const [author, n] of counts) {
    if (n / total > 0.6) return author;
  }
  return null;
}
