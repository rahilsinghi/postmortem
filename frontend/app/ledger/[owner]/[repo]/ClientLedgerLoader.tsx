"use client";

import { useEffect, useState } from "react";

import { fetchLedger, type LedgerResponse } from "../../../../lib/api";
import { useDemo } from "../../../../lib/demo/DemoProvider";
import { LedgerPage } from "./LedgerPage";

/**
 * Thin client wrapper around LedgerPage. In demo mode it re-fetches the
 * ledger from /public/demo/hono-ledger.json so the demo playback works
 * when the backend is offline. In normal mode it passes through the SSR-
 * fetched ledger unchanged.
 */
export function ClientLedgerLoader({
  initial,
  repo,
  suggestedQueries,
}: {
  initial: LedgerResponse;
  repo: string;
  suggestedQueries: string[];
}) {
  const { isDemo } = useDemo();
  const [ledger, setLedger] = useState<LedgerResponse>(initial);
  useEffect(() => {
    if (!isDemo) return;
    let cancelled = false;
    fetchLedger(repo, { demo: true })
      .then((d) => {
        if (!cancelled && d) setLedger(d);
      })
      .catch(() => {
        // Fixture load failed — keep the SSR-fetched ledger.
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, repo]);
  return <LedgerPage ledger={ledger} suggestedQueries={suggestedQueries} />;
}
