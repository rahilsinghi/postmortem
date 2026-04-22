export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 bg-[length:200%_100%] ${className}`}
      style={{ animation: "pulse 2.4s cubic-bezier(.4,0,.6,1) infinite" }}
    />
  );
}

export function GalleryCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-1 h-3 w-40" />
      <Skeleton className="mt-6 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-3/4" />
      <Skeleton className="mt-auto pt-6 h-3 w-20" />
    </div>
  );
}

export function LedgerPageSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-black">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </header>
      <div className="flex flex-1 min-h-0">
        <section className="w-2/5 border-r border-zinc-800 p-8">
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 24 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
              <Skeleton key={`gn-${i}`} className="h-12" />
            ))}
          </div>
        </section>
        <section className="w-1/5 border-r border-zinc-800 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-6 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-6 h-3 w-32" />
        </section>
        <section className="w-2/5 p-4">
          <Skeleton className="h-16 w-full" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
        </section>
      </div>
    </div>
  );
}
