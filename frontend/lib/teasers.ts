// Every teaser here has been spot-checked against the live ledger — each
// references a PR that's actually in the extraction, so the engine has
// something substantive to reason over (no "not in ledger" dead beats during
// a demo). Update when the ledger changes.
export const TEASER_QUERIES: Record<string, string> = {
  "pmndrs/zustand": "Why does persist middleware use a hydrationVersion counter?",
  "shadcn-ui/ui": "What drove the multi-style registry refactor in shadcn/ui?",
  "honojs/hono": "Why does Hono run on the Web Standards API instead of Node-only?",
  "rahilsinghi/postmortem": "Why does Postmortem run sub-agents outside Managed Agents?",
};

export const SUGGESTED_QUERIES_BY_REPO: Record<string, string[]> = {
  "pmndrs/zustand": [
    "Why does persist middleware use a hydrationVersion counter?",
    "Why was the createWithEqualityFn shallow comparator split out of the core?",
    "What drove the `react` default store constructor refactor?",
  ],
  "shadcn-ui/ui": [
    "What drove the multi-style registry refactor in shadcn/ui?",
    "Why did shadcn/ui migrate to Next.js 16 as the default scaffold?",
    "Why did the `shadcn apply` command become its own surface?",
  ],
  "honojs/hono": [
    "Why does Hono run on the Web Standards API instead of Node-only?",
    "Why did Hono reject `node:crypto` for streaming ETag hashing?",
    "Why did Hono build per-runtime WebSocket adapters instead of adopting CrossWS?",
  ],
  "rahilsinghi/postmortem": [
    "Why does Postmortem run sub-agents outside Managed Agents?",
    "Why did the Day-2 ingestion orchestrator build its own runner instead of using MA?",
    "How did the Managed Agents SDK wrapper evolve across Day 1 and Day 2?",
  ],
};
