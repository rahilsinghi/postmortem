import { API_BASE, type RepoSummary } from "../lib/api";
import { EntryGallery } from "./EntryGallery";

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
  return <EntryGallery repos={repos} apiBase={API_BASE} />;
}
