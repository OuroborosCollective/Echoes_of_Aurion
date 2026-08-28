import { beforeEach, describe, expect, it } from "vitest";
import {
  companionActionAllowed,
  companionDatasetCount,
  loadCompanionSession,
  recordCompanionObservation,
  startCompanionSession,
  transitionCompanionSession,
} from "./companionLearning";

describe("Aurion companion learning dataset", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records only frame-bound human actions during learning", () => {
    startCompanionSession(11, "Lokales LLM");
    expect(
      recordCompanionObservation({
        frameDataUrl: "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==",
        featureVector: new Array(16).fill(0.5),
        action: [0.1, 0.2, 0.8, 1],
      })
    ).toBeNull();
    transitionCompanionSession("connect");
    transitionCompanionSession("learn");
    const row = recordCompanionObservation({
      frameDataUrl: "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==",
      featureVector: new Array(16).fill(0.5),
      action: [0.1, 0.2, 0.8, 1],
      stateVector: [1, 0.8, 0.6, 0, 1],
      stateMask: [1, 1, 1, 1, 1],
      note: "Spieler bewegt sich zum Resonanzanker.",
    });
    expect(row?.session_id).toBe(loadCompanionSession()?.sessionId);
    expect(row?.target_action_chunk[0]).toEqual([0.1, 0.2, 0.8, 1]);
    expect(row?.state_vector).toEqual([1, 0.8, 0.6, 0, 1, 0]);
    expect(row?.state_mask).toEqual([1, 1, 1, 1, 1, 0]);
    expect(companionDatasetCount()).toBe(1);
    expect(loadCompanionSession()?.notes).toBe(1);
  });

  it("does not allow play actions before learned data is ready", () => {
    startCompanionSession(12, "Test LLM");
    transitionCompanionSession("connect");
    transitionCompanionSession("learn");
    expect(companionActionAllowed()).toBe(false);
    expect(() => transitionCompanionSession("play")).toThrow();
    transitionCompanionSession("finish_learning");
    transitionCompanionSession("play");
    expect(companionActionAllowed()).toBe(true);
    transitionCompanionSession("stop");
    expect(companionActionAllowed()).toBe(false);
  });
});
