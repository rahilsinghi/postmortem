// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { InterviewBubble } from "./InterviewBubble";

describe("InterviewBubble", () => {
  test("renders interviewer question in monospace small caps", () => {
    render(
      <InterviewBubble role="interviewer" text="Why did you push back on Buffer?" decisions={[]} />,
    );
    expect(screen.getByText(/why did you push back/i)).toBeTruthy();
  });

  test("renders subject answer without leaking raw asterisks", () => {
    render(
      <InterviewBubble
        role="subject"
        text='**Because** "Buffer is not in the Web Standards API" [PR #1234, @yusukebe, 2025-01-09].'
        decisions={[]}
      />,
    );
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });
});
