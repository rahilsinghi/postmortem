// frontend/lib/interview.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InterviewHandlers } from "./interview";
import { parseScriptEvent } from "./interview";

describe("parseScriptEvent", () => {
  test("parses exchange_delta payload", () => {
    const r = parseScriptEvent("exchange_delta", '{"index":2,"text_delta":"hello"}');
    expect(r).toEqual({ name: "exchange_delta", payload: { index: 2, text_delta: "hello" } });
  });
  test("returns null for unknown events", () => {
    const r = parseScriptEvent("unknown_event_x", "{}");
    expect(r).toBeNull();
  });
  test("returns null on malformed JSON", () => {
    const r = parseScriptEvent("exchange_delta", "{not json");
    expect(r).toBeNull();
  });
});
