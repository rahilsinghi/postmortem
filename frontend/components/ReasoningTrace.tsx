"use client";

import type { Decision } from "../lib/api";
import { splitWithCitations } from "../lib/citations";
import type { SelfCheckResult } from "../lib/query";
import { CitationChip } from "./CitationChip";

export function ReasoningTrace({
  text,
  decisions,
  selfCheck,
}: {
  text: string;
  decisions: Decision[];
  selfCheck: SelfCheckResult | null;
}) {
  if (!text) return null;

  const { segments } = splitWithCitations(text);

  const verdictByToken = new Map<string, { verified: boolean; reason: string }>();
  if (selfCheck?.citations) {
    for (const entry of selfCheck.citations) {
      verdictByToken.set(entry.token, { verified: entry.verified, reason: entry.reason });
    }
  }

  // Split the response into our structured sections. Keep it simple: sections are
  // introduced by `## `. Everything before the first `##` is a streaming preamble.
  const rawSections = text.split(/\n##\s+/g);
  const preamble = text.startsWith("## ") ? "" : (rawSections.shift() ?? "");
  const sections = (
    text.startsWith("## ")
      ? text
          .slice(3)
          .split(/\n##\s+/g)
          .map((block, idx) =>
            idx === 0
              ? { heading: block.split("\n")[0], body: block.slice(block.split("\n")[0].length) }
              : {
                  heading: block.split("\n")[0],
                  body: block.slice(block.split("\n")[0].length),
                },
          )
      : rawSections.map((block) => ({
          heading: block.split("\n")[0],
          body: block.slice(block.split("\n")[0].length),
        }))
  ).filter((s) => s.heading.trim().length > 0);

  // If nothing matched section headings yet (answer still streaming), render flat.
  if (sections.length === 0) {
    return <RenderSegments segments={segments} decisions={decisions} verdict={verdictByToken} />;
  }

  return (
    <div className="space-y-5">
      {preamble.trim() ? (
        <RenderSegments
          segments={splitWithCitations(preamble).segments}
          decisions={decisions}
          verdict={verdictByToken}
        />
      ) : null}
      {sections.map((sec) => (
        <section key={`sec-${sec.heading}`}>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {sec.heading}
          </h3>
          <div className="space-y-2 text-[13.5px] leading-relaxed text-zinc-200">
            <RenderSegments
              segments={splitWithCitations(sec.body).segments}
              decisions={decisions}
              verdict={verdictByToken}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function RenderSegments({
  segments,
  decisions,
  verdict,
}: {
  segments: ReturnType<typeof splitWithCitations>["segments"];
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
}) {
  return (
    <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-zinc-200">
      {segments.map((seg, idx) => {
        // Segments are produced by a deterministic regex split of a streaming
        // string. Index IS position; it cannot reorder. biome's noArrayIndexKey
        // doesn't know that, so we opt out locally.
        if (seg.kind === "text") {
          // biome-ignore lint/suspicious/noArrayIndexKey: position-based key is correct here
          return <span key={`t-${idx}`}>{seg.content}</span>;
        }
        const v = verdict.get(seg.content);
        const citation = seg.citation;
        if (!citation) return null;
        return (
          <CitationChip
            // biome-ignore lint/suspicious/noArrayIndexKey: position-based key is correct here
            key={`c-${idx}`}
            match={citation}
            decisions={decisions}
            verified={v?.verified ?? null}
            unverifiedReason={v?.reason ?? null}
          />
        );
      })}
    </div>
  );
}
