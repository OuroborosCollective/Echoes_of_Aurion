import { describe, expect, it } from "vitest";
import {
  applyCompanionIntent,
  assertCompanionInvariants,
  companionCanAct,
  createCompanionSession,
  transitionCompanion,
} from "@shared/companionLearningProtocol";

describe("Aurion companion learning protocol", () => {
  it("requires learning to finish before play can start", () => {
    const connected = applyCompanionIntent(createCompanionSession({ sessionId: "cmp_1", userId: 7, llmLabel: "Test LLM" }), "connect");
    const learning = applyCompanionIntent(connected, "learn");
    expect(learning.mode).toBe("learning");
    expect(() => applyCompanionIntent(learning, "play")).toThrow(/Ungültiger Companion-Übergang/);
    const ready = applyCompanionIntent(learning, "finish_learning");
    const playing = applyCompanionIntent(ready, "play");
    expect(playing.mode).toBe("playing");
    expect(playing.companionSpawned).toBe(true);
    expect(companionCanAct(playing)).toBe(true);
  });

  it("despawns immediately on stop and disallows further action", () => {
    const base = createCompanionSession({ sessionId: "cmp_2", userId: 8, llmLabel: "Test LLM" });
    const playing = applyCompanionIntent(applyCompanionIntent(applyCompanionIntent(applyCompanionIntent(base, "connect"), "learn"), "finish_learning"), "play");
    const stopping = applyCompanionIntent(playing, "stop");
    expect(stopping.mode).toBe("stopping");
    expect(stopping.companionSpawned).toBe(false);
    expect(companionCanAct(stopping)).toBe(false);
    const disconnected = applyCompanionIntent(stopping, "disconnect");
    expect(disconnected.mode).toBe("disconnected");
    expect(disconnected.companionSpawned).toBe(false);
  });

  it("forces offline sessions into stopping and never permits offline action", () => {
    const base = createCompanionSession({ sessionId: "cmp_3", userId: 9, llmLabel: "Test LLM" });
    const playing = applyCompanionIntent(applyCompanionIntent(applyCompanionIntent(applyCompanionIntent(base, "connect"), "learn"), "finish_learning"), "play");
    const offline = applyCompanionIntent(playing, "user_offline");
    expect(offline.online).toBe(false);
    expect(offline.mode).toBe("stopping");
    expect(companionCanAct(offline)).toBe(false);
    assertCompanionInvariants(offline);
  });

  it("keeps transition rules deterministic and rejects direct spawn paths", () => {
    expect(transitionCompanion("ready", "play")).toBe("playing");
    expect(transitionCompanion("playing", "learn")).toBe("learning");
    expect(() => transitionCompanion("connected", "play")).toThrow();
    expect(() => transitionCompanion("disconnected", "play")).toThrow();
  });
});
