import type { Citation, Decision } from "./api";

export type CitationMatch = {
  token: string;
  prNumber: number | null;
  commitSha: string | null;
  issueNumber: number | null;
  author: string;
  dateIso: string | null;
  kind: "body" | "review" | "inline" | "issue" | "commit";
};

const CITATION_REGEX =
  /\[(?:PR #(\d+)(?:\s+(review|inline))?|issue #(\d+)|commit ([0-9a-f]{7,40})),\s+@([\w-]+)(?:,\s+(\d{4}-\d{2}-\d{2}))?\]/g;

export function parseCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = [];
  for (const m of text.matchAll(CITATION_REGEX)) {
    matches.push({
      token: m[0],
      prNumber: m[1] ? Number(m[1]) : null,
      commitSha: m[4] ?? null,
      issueNumber: m[3] ? Number(m[3]) : null,
      author: m[5],
      dateIso: m[6] ?? null,
      kind:
        m[2] === "review"
          ? "review"
          : m[2] === "inline"
            ? "inline"
            : m[3]
              ? "issue"
              : m[4]
                ? "commit"
                : "body",
    });
  }
  return matches;
}

/**
 * Replace citation tokens in a text with `[[CITATION:i]]` sentinels, returning
 * the resolved citation list. Useful for rendering inline React chips without
 * losing surrounding markdown.
 */
export function splitWithCitations(text: string): {
  segments: Array<{ kind: "text" | "citation"; content: string; citation?: CitationMatch }>;
} {
  const segments: Array<{
    kind: "text" | "citation";
    content: string;
    citation?: CitationMatch;
  }> = [];
  let lastIndex = 0;
  for (const m of text.matchAll(CITATION_REGEX)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) {
      segments.push({ kind: "text", content: text.slice(lastIndex, m.index) });
    }
    segments.push({
      kind: "citation",
      content: m[0],
      citation: {
        token: m[0],
        prNumber: m[1] ? Number(m[1]) : null,
        commitSha: m[4] ?? null,
        issueNumber: m[3] ? Number(m[3]) : null,
        author: m[5],
        dateIso: m[6] ?? null,
        kind:
          m[2] === "review"
            ? "review"
            : m[2] === "inline"
              ? "inline"
              : m[3]
                ? "issue"
                : m[4]
                  ? "commit"
                  : "body",
      },
    });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", content: text.slice(lastIndex) });
  }
  return { segments };
}

/** Look up the underlying citation row from the ledger for hover-card rendering. */
export function resolveCitation(
  match: CitationMatch,
  decisions: Decision[],
): { decision: Decision; citation: Citation } | null {
  if (!match.prNumber) return null;
  const decision = decisions.find((d) => d.pr_number === match.prNumber);
  if (!decision) return null;

  const allCitations = [
    ...decision.citations.context,
    ...decision.citations.decision,
    ...decision.citations.forces,
    ...decision.citations.consequences,
  ];

  const sourceTypeHint =
    match.kind === "review"
      ? "review_comment"
      : match.kind === "inline"
        ? "inline_review_comment"
        : null;

  const authored = allCitations.filter((c) => c.author === match.author);
  const matchingKind = sourceTypeHint
    ? authored.find((c) => c.source_type === sourceTypeHint)
    : null;
  const best =
    matchingKind ??
    authored.find((c) => c.source_type === "pr_body") ??
    authored[0] ??
    allCitations[0];

  if (!best) return null;
  return { decision, citation: best };
}
