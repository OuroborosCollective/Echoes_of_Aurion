import { describe, expect, it } from "vitest";
import { ZoneMobRuntime } from "./zoneMobRuntime";

describe("ZoneMobRuntime cached ordered state view", () => {
  it("does not expose the mutable cache and refreshes the published view on state replacement", () => {
    const runtime = new ZoneMobRuntime();
    const before = runtime.orderedStates();

    expect(Object.isFrozen(before)).toBe(true);
    expect(before.length).toBeGreaterThan(0);
    expect(() => (before as unknown as Array<unknown>).pop()).toThrow();

    const first = before[0]!;
    runtime.applyCombatState(first.definition.entityId, {
      health: Math.max(0, first.health - 1),
      stamina: first.stamina,
      nextAttackTick: first.nextAttackTick,
    });

    const after = runtime.orderedStates();
    expect(Object.isFrozen(after)).toBe(true);
    expect(after).not.toBe(before);
    expect(after).toHaveLength(before.length);
    expect(after[0]?.definition.entityId).toBe(first.definition.entityId);
  });
});
