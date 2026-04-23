// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { runTypewriter } from "./TypedInput";

describe("runTypewriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("types each char and fires input events", () => {
    const el = document.createElement("input");
    const events: string[] = [];
    el.addEventListener("input", () => events.push(el.value));
    const handle = runTypewriter(el, "hi", { perCharMs: 10 });
    // First char fires after the first setTimeout(perCharMs) tick
    vi.advanceTimersByTime(11);
    expect(el.value).toBe("h");
    vi.advanceTimersByTime(11);
    expect(el.value).toBe("hi");
    expect(events).toEqual(["h", "hi"]);
    handle.cancel();
  });

  test("cancel halts the typing", () => {
    const el = document.createElement("input");
    const handle = runTypewriter(el, "hello", { perCharMs: 10 });
    vi.advanceTimersByTime(11);
    expect(el.value).toBe("h");
    handle.cancel();
    vi.advanceTimersByTime(100);
    expect(el.value).toBe("h");
  });
});
