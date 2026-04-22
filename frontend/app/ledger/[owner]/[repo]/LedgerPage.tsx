"use client";

import Link from "next/link";
import { useState } from "react";

import { AskPanel } from "../../../../components/AskPanel";
import { DecisionSidePanel } from "../../../../components/DecisionSidePanel";
import { LedgerGraph } from "../../../../components/LedgerGraph";
import type { LedgerResponse } from "../../../../lib/api";

export function LedgerPage({
  ledger,
  suggestedQueries,
}: {
  ledger: LedgerResponse;
  suggestedQueries: string[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ledger.decisions.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-black text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200"
          >
            ← postmortem
          </Link>
          <span className="font-mono text-sm text-zinc-200">{ledger.repo}</span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          {ledger.decision_count} decisions · {ledger.citation_count} citations ·{" "}
          {ledger.alternative_count} alts · {ledger.edge_count} edges
        </span>
      </header>

      <div className="flex flex-1 min-h-0">
        <section className="relative w-2/5 border-r border-zinc-800">
          <LedgerGraph
            decisions={ledger.decisions}
            edges={ledger.edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>
        <section className="w-1/5 border-r border-zinc-800 bg-zinc-950">
          <DecisionSidePanel decision={selected} />
        </section>
        <section className="w-2/5">
          <AskPanel
            repo={ledger.repo}
            decisions={ledger.decisions}
            suggestedQueries={suggestedQueries}
          />
        </section>
      </div>
    </div>
  );
}
