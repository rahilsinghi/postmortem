const SEEN = new Set<string>();

export function hasBeenSeen(id: string): boolean {
  return SEEN.has(id);
}

export function markSeen(id: string): void {
  SEEN.add(id);
}

export function resetSeenSet(): void {
  SEEN.clear();
}

// Component exported placeholder — fleshed out in Task B2.
export function ProvenanceCard() {
  return null;
}
