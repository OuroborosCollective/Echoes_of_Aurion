import { beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_RESEARCH_LABEL, startNativeResearchRecording, stopNativeResearchRecording } from "./nativeResearchRecording";
import { loadCompanionSession } from "./companionLearning";

describe("native research recording", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("CustomEvent", class<T> extends Event {
      detail: T;
      constructor(type: string, init: CustomEventInit<T>) {
        super(type);
        this.detail = init.detail as T;
      }
    });
  });

  it("starts directly in learning mode without a gateway session", () => {
    const session = startNativeResearchRecording(7);
    expect(session.mode).toBe("learning");
    expect(session.online).toBe(true);
    expect(session.companionSpawned).toBe(false);
    expect(session.llmLabel).toBe(NATIVE_RESEARCH_LABEL);
    expect(session.sessionId).toBe("cmp_native_7_1");
    expect(loadCompanionSession()).toEqual(session);
  });

  it("uses a new session identity for every recording window", () => {
    const first = startNativeResearchRecording(7);
    stopNativeResearchRecording();
    const second = startNativeResearchRecording(7);
    expect(first.sessionId).toBe("cmp_native_7_1");
    expect(second.sessionId).toBe("cmp_native_7_2");
  });

  it("stops through the existing deterministic state machine", () => {
    startNativeResearchRecording(7);
    const stopped = stopNativeResearchRecording();
    expect(stopped?.mode).toBe("disconnected");
    expect(stopped?.companionSpawned).toBe(false);
  });

  it("rejects unauthenticated identities", () => {
    expect(() => startNativeResearchRecording(0)).toThrow("AUTHENTICATED_USER_REQUIRED");
  });
});
