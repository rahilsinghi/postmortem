// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { InterviewProvider, useInterview } from "./InterviewProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/ledger/honojs/hono",
  useSearchParams: () => new URLSearchParams(""),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <InterviewProvider owner="honojs" repo="hono">
    {children}
  </InterviewProvider>
);

describe("InterviewProvider", () => {
  test("opens with a subject", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    expect(result.current.state.status).toBe("loading_script");
    expect(result.current.state.subject).toBe("yusukebe");
  });

  test("collapse toggles state", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    expect(result.current.state.collapsed).toBe(false);
    act(() => result.current.toggleCollapse());
    expect(result.current.state.collapsed).toBe(true);
  });

  test("close clears subject", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    act(() => result.current.close());
    expect(result.current.state.subject).toBeNull();
  });
});
