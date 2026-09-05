import { beforeEach, describe, expect, it } from "vitest";
import {
  companionActionAllowed,
  companionDatasetCount,
  loadCompanionSession,
  recordCompanionObservation,
  startCompanionSession,
  transitionCompanionSession,
} from "./companionLearning";

const frame = "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==";
const features = new Array(16).fill(0.5);
const state = [1, 1, 1, 0, 0, 0.25];
const mask = [1, 1, 1, 1, 1, 1];

describe("Aurion companion learning dataset", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records only frame-bound human actions during learning", () => {
    startCompanionSession(11, "Lokales LLM", "gateway_fixture_11");
    expect(recordCompanionObservation({ capturedAt: 123456, frameDataUrl: frame, featureVector: features, action: [0.1, 0.2, 0.8, 1], stateVector: state, stateMask: mask })).toBeNull();
    transitionCompanionSession("connect");
    transitionCompanionSession("learn");
    const row = recordCompanionObservation({ capturedAt: 123456, frameDataUrl: frame, featureVector: features, action: [0.1, 0.2, 0.8, 1], stateVector: state, stateMask: mask, note: "Spieler bewegt sich zum Resonanzanker." });
    expect(row?.session_id).toBe(loadCompanionSession()?.sessionId);
    expect(row?.target_action_chunk[0]).toEqual([0.1, 0.2, 0.8, 1]);
    expect(row?.state_vector).toEqual(state);
    expect(row?.state_mask).toEqual(mask);
    expect(companionDatasetCount()).toBe(1);
    expect(loadCompanionSession()?.notes).toBe(1);
  });

  it("rejects local observations that the server state contract cannot accept", () => {
    startCompanionSession(13, "Test LLM", "gateway_fixture_13");
    transitionCompanionSession("connect");
    transitionCompanionSession("learn");
    expect(recordCompanionObservation({ capturedAt: 123456, frameDataUrl: frame, featureVector: features, action: [0.1, 0.2, 0.8, 1], stateVector: state.slice(0, 5), stateMask: mask })).toBeNull();
    expect(recordCompanionObservation({ capturedAt: 123456, frameDataUrl: frame, featureVector: features, action: [0.1, 0.2, 0.8, 1], stateVector: state, stateMask: mask.slice(0, 5) })).toBeNull();
    expect(recordCompanionObservation({ capturedAt: 123456, frameDataUrl: frame, featureVector: [...features.slice(0, 15), Number.NaN], action: [0.1, 0.2, 0.8, 1], stateVector: state, stateMask: mask })).toBeNull();
    expect(companionDatasetCount()).toBe(0);
    expect(loadCompanionSession()?.datasetRows).toBe(0);
  });

  it("does not allow play actions before learned data is ready", () => {
    startCompanionSession(12, "Test LLM", "gateway_fixture_12");
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
