"use client";

import { Component, type ReactNode } from "react";

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[Postmortem] render error:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-rose-400">
          render error
        </p>
        <p className="max-w-lg text-sm text-zinc-200">
          Something cracked while rendering this view. This shouldn&rsquo;t happen — the reasoning
          path still worked on the backend. Refreshing usually resolves it.
        </p>
        <pre className="max-w-xl overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left font-mono text-[11px] text-zinc-400">
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1 font-mono text-xs text-black transition hover:bg-zinc-300"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-md border border-zinc-800 px-3 py-1 font-mono text-xs text-zinc-300 transition hover:border-zinc-600"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
}
