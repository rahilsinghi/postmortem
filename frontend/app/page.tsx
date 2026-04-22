import Link from "next/link";

import { API_BASE, type RepoSummary } from "../lib/api";

async function fetchRepos(): Promise<RepoSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/repos`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as RepoSummary[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const repos = await fetchRepos();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-6 py-24">
      <div className="max-w-3xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          decision archaeology · built with opus 4.7
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
          Postmortem
        </h1>
        <p className="mt-5 max-w-xl text-balance text-sm text-zinc-400 sm:text-base">
          Read a repo&rsquo;s PR history, reconstruct why the code is the way it is, and ask it
          questions. Every answer cites the exact comment, review, or commit that supports it.
        </p>
      </div>

      <section className="mt-16 w-full max-w-4xl">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Hero repos
        </h2>

        {repos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-sm text-zinc-500">
            No ledgers cached yet. Run an ingestion:
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-zinc-400">
              uv run --project backend python scripts/ingest.py pmndrs/zustand \ --limit 200
              --min-discussion 3 --db .cache/ledger.duckdb
            </pre>
            <p className="mt-3">
              Also check the backend is running at{" "}
              <span className="font-mono text-zinc-300">{API_BASE}</span>.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {repos.map((repo) => (
              <li key={repo.repo}>
                <Link
                  href={`/ledger/${repo.repo}`}
                  className="group flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <p className="font-mono text-sm text-zinc-300 group-hover:text-zinc-50">
                    {repo.repo}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-50">
                    {repo.decisions}{" "}
                    <span className="text-sm font-normal text-zinc-500">decisions excavated</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {repo.categories} categories · {repo.earliest?.slice(0, 4) ?? "–"}–
                    {repo.latest?.slice(0, 4) ?? "–"}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1 font-mono text-xs text-zinc-400 group-hover:text-zinc-50">
                    Open ledger →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-auto pt-16 text-center font-mono text-xs text-zinc-600">
        Code lives. Intent is a ghost. Postmortem summons it.
      </footer>
    </main>
  );
}
