import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">404 · ledger</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
        No ledger for this repo.
      </h1>
      <p className="mt-3 max-w-md text-sm text-zinc-400">
        Postmortem hasn&rsquo;t ingested this repo yet. Paste its URL into the live-ingest screen to
        mine its decisions, or pick one of the cached hero repos.
      </p>
      <div className="mt-6 flex gap-3 font-mono text-xs">
        <Link
          href="/"
          className="rounded-md border border-zinc-800 px-3 py-1 text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ← gallery
        </Link>
        <Link
          href="/ingest"
          className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1 text-black transition hover:bg-zinc-300"
        >
          ingest a repo →
        </Link>
      </div>
    </main>
  );
}
