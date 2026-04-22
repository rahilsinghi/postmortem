import Link from "next/link";

import { IngestClient } from "./IngestClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; limit?: string; min_discussion?: string }>;
}) {
  const { repo, limit, min_discussion } = await searchParams;
  const parsedLimit = limit ? Number(limit) : undefined;
  const parsedMinDiscussion = min_discussion ? Number(min_discussion) : undefined;

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-6 py-16">
      <header className="w-full max-w-3xl">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200"
        >
          ← postmortem
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Live ingestion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste any public GitHub repo. Postmortem streams every PR classification and extraction as
          it runs — no batch wait.
        </p>
      </header>

      <div className="mt-10 w-full max-w-3xl">
        <IngestClient
          initialRepo={repo ?? ""}
          initialLimit={parsedLimit ?? 40}
          initialMinDiscussion={parsedMinDiscussion ?? 3}
        />
      </div>
    </main>
  );
}
