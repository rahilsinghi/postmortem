/**
 * Desaturated category palette — each hue is a "tinted zinc" variant, not a
 * competing primary. The real brand accent is the archival amber in
 * `globals.css::--accent`; CategoryBadge stays cool on purpose.
 */
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  state_management: {
    bg: "bg-violet-950/30",
    text: "text-violet-300",
    border: "border-violet-800/50",
  },
  api_contract: {
    bg: "bg-sky-950/30",
    text: "text-sky-300",
    border: "border-sky-800/50",
  },
  build: {
    bg: "bg-amber-950/30",
    text: "text-amber-300",
    border: "border-amber-800/50",
  },
  tooling: {
    bg: "bg-emerald-950/30",
    text: "text-emerald-300",
    border: "border-emerald-800/50",
  },
  infra: {
    bg: "bg-rose-950/30",
    text: "text-rose-300",
    border: "border-rose-800/50",
  },
  performance: {
    bg: "bg-orange-950/30",
    text: "text-orange-300",
    border: "border-orange-800/50",
  },
  security: {
    bg: "bg-red-950/30",
    text: "text-red-300",
    border: "border-red-800/50",
  },
  testing: {
    bg: "bg-teal-950/30",
    text: "text-teal-300",
    border: "border-teal-800/50",
  },
  data: {
    bg: "bg-indigo-950/30",
    text: "text-indigo-300",
    border: "border-indigo-800/50",
  },
  auth: {
    bg: "bg-fuchsia-950/30",
    text: "text-fuchsia-300",
    border: "border-fuchsia-800/50",
  },
  routing: {
    bg: "bg-cyan-950/30",
    text: "text-cyan-300",
    border: "border-cyan-800/50",
  },
  ui_architecture: {
    bg: "bg-pink-950/30",
    text: "text-pink-300",
    border: "border-pink-800/50",
  },
  other: {
    bg: "bg-zinc-800/50",
    text: "text-zinc-300",
    border: "border-zinc-700",
  },
};

export function categoryStyle(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}

export function CategoryBadge({ category }: { category: string }) {
  const style = categoryStyle(category);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${style.bg} ${style.text} ${style.border}`}
    >
      {category.replaceAll("_", " ")}
    </span>
  );
}
