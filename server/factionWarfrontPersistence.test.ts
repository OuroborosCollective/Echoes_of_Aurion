import { describe, expect, it } from "vitest";
import { normalizeFactionWarfront } from "./factionWarfrontPersistence";

describe("AIM-232 versioned faction and warfront evidence", () => {
  const input = {
    userId: 9,
    characterId: "character-9",
    faction: "sunward_concord",
    worldRevision: "world-epoch-13",
    sourceReceiptId: "world-receipt-13",
    sequence: 13,
    idempotencyKey: "faction-warfront-9-13",
    standingDeltaBps: 125,
    loyaltyDeltaBps: -40,
    warfront: { frontId: "windhollow-front", phase: "skirmish" as const, controlBps: 5200, conflictPressureBps: 3100, civilianSafetyBps: 8700 },
  };

  it("hashes character, faction, revision, sequence and confirmed warfront state", () => {
    const result = normalizeFactionWarfront(input);
    expect(result.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalizeFactionWarfront({ ...input, worldRevision: "world-epoch-14", sourceReceiptId: "world-receipt-14", sequence: 14 }).stateHash).not.toBe(result.stateHash);
  });

  it("rejects out-of-range conflict state and deltas", () => {
    expect(() => normalizeFactionWarfront({ ...input, standingDeltaBps: 10001 })).toThrow();
    expect(() => normalizeFactionWarfront({ ...input, warfront: { ...input.warfront, controlBps: 10001 } })).toThrow();
  });

  it("keeps fictional conflict fields bounded and deterministic", () => {
    const first = normalizeFactionWarfront(input);
    const second = normalizeFactionWarfront({ ...input, warfront: { ...input.warfront } });
    expect(first.warfront).toEqual(second.warfront);
    expect(first.stateHash).toBe(second.stateHash);
  });
});
