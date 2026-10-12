import { describe, it, expect } from "vitest";
import { BuffDebuffSystem, Buff } from "./ax1CombatAuthority.js";

describe("BuffDebuffSystem", () => {
  it("calculates multiplier correctly", () => {
    const system = new BuffDebuffSystem();
    const buff1: Buff = { id: "1", stat: "attack", magnitudeBps: 1000, expiresAtTick: 10 };
    const buff2: Buff = { id: "2", stat: "attack", magnitudeBps: 2000, expiresAtTick: 15 };
    const buff3: Buff = { id: "3", stat: "defense", magnitudeBps: 3000, expiresAtTick: 20 };

    system.apply(buff1, 0);
    system.apply(buff2, 0);
    system.apply(buff3, 0);

    expect(system.multiplier("attack", 5)).toBe(1.3);
    expect(system.multiplier("attack", 10)).toBe(1.2); // buff1 expired
    expect(system.multiplier("attack", 15)).toBe(1.0); // buff2 expired
  });
});
