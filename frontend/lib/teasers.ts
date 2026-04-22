export const TEASER_QUERIES: Record<string, string> = {
  "pmndrs/zustand": "What changed architecturally in Zustand v5?",
  "shadcn-ui/ui": "Why does shadcn/ui use CVA for variants?",
  "honojs/hono": "Why does Hono run on the Web Standards API instead of Node-only?",
};

export const SUGGESTED_QUERIES_BY_REPO: Record<string, string[]> = {
  "pmndrs/zustand": [
    "Why does persist middleware use a hydrationVersion counter?",
    "What changed architecturally in Zustand v5?",
    "Why did Zustand drop the default export?",
  ],
  "shadcn-ui/ui": [
    "Why does shadcn/ui use CVA for variants?",
    "How did the component distribution model evolve?",
    "Why did shadcn/ui adopt Tailwind v4?",
  ],
  "honojs/hono": [
    "Why does Hono run on the Web Standards API instead of Node-only?",
    "How does Hono's middleware chain differ from Express?",
    "Why did Hono split types from runtime?",
  ],
};
