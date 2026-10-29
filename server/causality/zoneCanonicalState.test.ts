import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { hashCanonicalZoneState, sortCanonicalZoneState, type CanonicalZoneState } from "./zoneCanonicalState";

describe("canonical zone sorted records", () => {
  it("preserves fromEntries semantics and the canonical hash for special and reordered keys", () => {
    const cooldowns = JSON.parse('{"__proto__":7,"z":4,"a":1,"10":2,"02":3}') as Record<string, number>;
    const progress = JSON.parse('{"__proto__":false,"z":3,"a":"ready"}') as Record<string, string | number | boolean>;
    const state = {
      schema: "aurion.zone.state.v1", worldId: "w", zoneId: "z", tick: 1, ruleset: "r", combatSequence: 0,
      players: [{ entityId: "p", skillCooldowns: cooldowns }], mobs: [], resources: [], questSummaries: [],
      questInstances: [{ instanceId: "q", completedNodeIds: [], boundRoles: [], objectiveProgress: progress }],
    } as unknown as CanonicalZoneState;
    const expected = {
      ...state,
      players: [{ ...state.players[0]!, skillCooldowns: Object.fromEntries(Object.entries(cooldowns).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) }],
      questInstances: [{ ...state.questInstances![0]!, objectiveProgress: Object.fromEntries(Object.entries(progress).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) }],
    };
    const result = sortCanonicalZoneState(state);
    expect(Object.hasOwn(result.players[0]!.skillCooldowns, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.questInstances![0]!.objectiveProgress, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.players[0]!.skillCooldowns)).toBe(Object.prototype);
    expect(canonicalJson(result)).toBe(canonicalJson(expected));
    expect(hashCanonicalZoneState(state)).toBe(canonicalSha256(expected));
  });
});
