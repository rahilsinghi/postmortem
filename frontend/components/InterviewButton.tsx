"use client";

import { useState } from "react";
import { useInterview } from "../lib/InterviewProvider";
import { InterviewPicker } from "./InterviewPicker";

type Variant = "toolbar" | "node" | "answer-inline";

export function InterviewButton({
  variant,
  owner,
  repo,
  author,
}: {
  variant: Variant;
  owner: string;
  repo: string;
  author?: string;
}) {
  const { open } = useInterview();
  const [pickerOpen, setPickerOpen] = useState(false);

  const click = () => {
    if (author) {
      open(author);
      return;
    }
    setPickerOpen(true);
  };

  if (variant === "toolbar") {
    return (
      <>
        <button
          type="button"
          data-demo-target="interview-open"
          onClick={click}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#d4a24c]/50 bg-[#d4a24c]/[0.05] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c] hover:bg-[#d4a24c]/[0.12]"
        >
          <span>👁</span>
          <span>interview a maintainer</span>
        </button>
        <InterviewPicker
          open={pickerOpen}
          owner={owner}
          repo={repo}
          onClose={() => setPickerOpen(false)}
          onPick={(h) => {
            setPickerOpen(false);
            open(h);
          }}
        />
      </>
    );
  }

  if (variant === "node") {
    return (
      <button
        type="button"
        onClick={click}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] hover:text-[#f1c37a]"
      >
        <span>👁</span>
        <span>interview @{author}</span>
      </button>
    );
  }

  // variant === "answer-inline"
  return (
    <button
      type="button"
      onClick={click}
      className="inline-flex items-center gap-1 text-[12px] text-[#d4a24c] underline decoration-[#d4a24c]/40 underline-offset-2 hover:decoration-[#d4a24c]"
    >
      this decision was shaped by @{author} — interview them →
    </button>
  );
}
