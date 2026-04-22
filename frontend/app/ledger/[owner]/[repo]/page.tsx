import { notFound } from "next/navigation";

import { API_BASE, type LedgerResponse } from "../../../../lib/api";
import { SUGGESTED_QUERIES_BY_REPO } from "../../../../lib/teasers";
import { LedgerPage } from "./LedgerPage";

async function fetchLedger(repo: string): Promise<LedgerResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/repos/${repo}/ledger`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LedgerResponse;
  } catch {
    return null;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const repo = `${owner}/${repoName}`;
  const ledger = await fetchLedger(repo);
  if (!ledger) notFound();

  const suggested = SUGGESTED_QUERIES_BY_REPO[repo] ?? [
    "What are the most common architectural tradeoffs in this repo?",
    "Which decisions superseded earlier ones?",
    "What alternatives were rejected most often?",
  ];

  return <LedgerPage ledger={ledger} suggestedQueries={suggested} />;
}
