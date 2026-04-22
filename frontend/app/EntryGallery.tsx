"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import type { RepoSummary } from "../lib/api";
import { TEASER_QUERIES } from "../lib/teasers";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 1, 0.5, 1] as const } },
};

export function EntryGallery({ repos, apiBase }: { repos: RepoSummary[]; apiBase: string }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-6 py-24">
      <motion.div
        initial="hidden"
        animate="show"
        variants={container}
        className="w-full max-w-3xl text-center"
      >
        <motion.p
          variants={item}
          className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500"
        >
          decision archaeology · built with opus 4.7
        </motion.p>
        <motion.h1
          variants={item}
          className="mt-4 text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl"
        >
          Postmortem
        </motion.h1>
        <motion.p
          variants={item}
          className="mt-5 max-w-xl text-balance text-sm text-zinc-400 sm:text-base mx-auto"
        >
          Read a repo&rsquo;s PR history, reconstruct why the code is the way it is, and ask it
          questions. Every answer cites the exact comment, review, or commit that supports it.
        </motion.p>
      </motion.div>

      <motion.section
        initial="hidden"
        animate="show"
        variants={container}
        className="mt-16 w-full max-w-5xl"
      >
        <motion.div variants={item} className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Hero repos
          </h2>
          <Link
            href="/ingest"
            className="rounded-full border border-zinc-800 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
          >
            + ingest your own
          </Link>
        </motion.div>

        {repos.length === 0 ? (
          <motion.div
            variants={item}
            className="rounded-lg border border-dashed border-zinc-800 p-8 text-sm text-zinc-500"
          >
            No ledgers cached yet. Run an ingestion:
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-zinc-400">
              uv run --project backend python scripts/ingest.py pmndrs/zustand \ --limit 200
              --min-discussion 3 --db .cache/ledger.duckdb
            </pre>
            <p className="mt-3">
              Also check the backend is running at{" "}
              <span className="font-mono text-zinc-300">{apiBase}</span>.
            </p>
          </motion.div>
        ) : (
          <motion.ul variants={container} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {repos.map((repo) => {
              const teaser = TEASER_QUERIES[repo.repo];
              return (
                <motion.li key={repo.repo} variants={item}>
                  <motion.div
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <Link
                      href={`/ledger/${repo.repo}`}
                      className="group flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-500 hover:bg-zinc-900"
                    >
                      <p className="font-mono text-sm text-zinc-300 group-hover:text-zinc-50">
                        {repo.repo}
                      </p>
                      <p className="mt-3 text-2xl font-semibold text-zinc-50">
                        {repo.decisions}{" "}
                        <span className="text-sm font-normal text-zinc-500">
                          decisions excavated
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                        {repo.categories} categories · {repo.earliest?.slice(0, 4) ?? "–"}–
                        {repo.latest?.slice(0, 4) ?? "–"}
                      </p>
                      {teaser ? (
                        <p className="mt-6 text-[13px] italic leading-relaxed text-zinc-400 group-hover:text-zinc-200">
                          &ldquo;{teaser}&rdquo;
                        </p>
                      ) : null}
                      <span className="mt-auto pt-6 inline-flex items-center gap-1 font-mono text-xs text-zinc-400 group-hover:text-zinc-50">
                        Open ledger →
                      </span>
                    </Link>
                  </motion.div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </motion.section>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="mt-auto pt-16 text-center font-mono text-xs text-zinc-600"
      >
        Code lives. Intent is a ghost. Postmortem summons it.
      </motion.footer>
    </main>
  );
}
