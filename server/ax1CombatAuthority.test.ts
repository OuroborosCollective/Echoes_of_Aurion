import { describe, expect, it } from "vitest";
import { BuffDebuffSystem, type Buff } from "./ax1CombatAuthority";

describe("Aurion-owned buff expiry and deterministic single-pass calculation", () => {
  it("removes expired buffs before totaling matching stats", () => {
    const buffs = new BuffDebuffSystem();
    const entries: Buff[] = [
      { id: "a", stat: "attack", magnitudeBps: 1000, expiresAtTick: 10 },
      { id: "b", stat: "attack", magnitudeBps: 2000, expiresAtTick: 15 },
      { id: "c", stat: "defense", magnitudeBps: 3000, expiresAtTick: 20 },
    ];
    for (const buff of entries) buffs.apply(buff, 0);
    expect(buffs.multiplier("attack", 5)).toBe(1.3);
    expect(buffs.multiplier("attack", 10)).toBe(1.2);
    expect(buffs.multiplier("attack", 15)).toBe(1);
    expect(buffs.multiplier("defense", 15)).toBe(1.3);
    expect(buffs.multiplier("defense", 20)).toBe(1);
  });
  it("preserves the canonical multiplier bounds", () => {
    const buffs = new BuffDebuffSystem();
    buffs.apply({ id: "low", stat: "attack", magnitudeBps: -100000, expiresAtTick: 3 }, 0);
    buffs.apply({ id: "high", stat: "defense", magnitudeBps: 100000, expiresAtTick: 3 }, 0);
    expect(buffs.multiplier("attack", 1)).toBe(0.1);
    expect(buffs.multiplier("defense", 1)).toBe(3);
  });
});
