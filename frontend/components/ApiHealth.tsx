"use client";

import { useEffect, useState } from "react";

import { API_BASE } from "../lib/api";

type Status = "checking" | "up" | "down";

export function ApiHealth() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch(`${API_BASE}/healthz`, { cache: "no-store" });
        if (!cancelled) setStatus(res.ok ? "up" : "down");
      } catch {
        if (!cancelled) setStatus("down");
      }
    }
    void ping();
    const interval = setInterval(ping, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status === "up") return null;

  if (status === "down") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-rose-800/70 bg-rose-950/95 p-3 font-mono text-[11px] text-rose-200 shadow-xl shadow-black/60 backdrop-blur">
        <div className="mb-1 font-semibold uppercase tracking-wider">Backend unreachable</div>
        <p className="text-rose-300/90">
          Postmortem&rsquo;s Python service at <span className="text-rose-100">{API_BASE}</span> is
          not responding. Run it from the repo root:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-black/60 p-2 text-[10px] text-rose-100">
          {`cd backend && uv run uvicorn app.main:app \\\n  --host 127.0.0.1 --port 8765`}
        </pre>
      </div>
    );
  }

  return null;
}
