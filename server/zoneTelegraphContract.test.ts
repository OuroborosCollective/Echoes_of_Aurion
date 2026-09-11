import { describe, expect, it } from "vitest";
import {
  ZONE_TELEGRAPH_AUTHORITY_RULESET,
  ZONE_TELEGRAPH_CONTRACT_VERSION,
  ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION,
  validConfirmedZoneTelegraphEvent,
  type ConfirmedZoneTelegraphEvent,
} from "@shared/zoneTelegraphContract";

const validEvent = (): ConfirmedZoneTelegraphEvent => Object.freeze({
  type: "telegraph",
  contractVersion: ZONE_TELEGRAPH_CONTRACT_VERSION,
  id: "telegraph:mob_6:1",
  sequence: 1,
  startTick: 10,
  impactTick: 18,
  attackerEntityId: "mob_6",
  targetEntityId: "player:1",
  kind: "line",
  origin: Object.freeze({ x: 0, z: 68_000 }),
  target: Object.freeze({ x: 0, z: 63_000 }),
  widthFixed: 2_750,
  color: "#ef4444",
  visualSourceRevision: ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION,
  authorityRuleset: ZONE_TELEGRAPH_AUTHORITY_RULESET,
});

describe("confirmed Zone telegraph contract", () => {
  it("accepts a source-bound logical-tick pre-cast warning", () => {
    expect(validConfirmedZoneTelegraphEvent(validEvent())).toBe(true);
  });

  it("rejects forged provenance and authority identity", () => {
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), visualSourceRevision: "0".repeat(40) })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), authorityRuleset: "other" })).toBe(false);
  });

  it("rejects invalid or unbounded logical windups", () => {
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), impactTick: 10 })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), impactTick: 61 })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), startTick: -1 })).toBe(false);
  });

  it("binds the deterministic id to attacker and sequence", () => {
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), id: "telegraph:mob_5:1" })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), sequence: 2 })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), attackerEntityId: "player:1" })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), targetEntityId: "mob_1" })).toBe(false);
  });

  it("rejects malformed geometry rather than trusting presentation input", () => {
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), widthFixed: 499 })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), widthFixed: 8_001 })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), origin: { x: 0.5, z: 0 } })).toBe(false);
    expect(validConfirmedZoneTelegraphEvent({ ...validEvent(), color: "#ffffff" })).toBe(false);
  });
});
