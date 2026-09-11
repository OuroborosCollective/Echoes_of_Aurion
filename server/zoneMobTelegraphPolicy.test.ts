import { describe, expect, it } from "vitest";
import {
  AURION_BOSS_MELEE_WINDUP_TICKS,
  AURION_ELITE_MELEE_WINDUP_TICKS,
  zoneMobTelegraphWidthFixed,
  zoneMobTelegraphWindupTicks,
} from "./zoneMobTelegraphPolicy";

describe("Aurion AX1 mob telegraph integration policy", () => {
  it("leaves ordinary mobs instant while giving elites and bosses deterministic windup", () => {
    expect(zoneMobTelegraphWindupTicks({ isBoss: false, isElite: false })).toBe(0);
    expect(zoneMobTelegraphWindupTicks({ isBoss: false, isElite: true })).toBe(AURION_ELITE_MELEE_WINDUP_TICKS);
    expect(zoneMobTelegraphWindupTicks({ isBoss: true, isElite: true })).toBe(AURION_BOSS_MELEE_WINDUP_TICKS);
    expect(AURION_ELITE_MELEE_WINDUP_TICKS).toBe(6);
    expect(AURION_BOSS_MELEE_WINDUP_TICKS).toBe(10);
  });

  it("derives bounded warning width from the authoritative attack range", () => {
    expect(zoneMobTelegraphWidthFixed({ isBoss: false, isElite: false, attackRangeFixed: 2_800 })).toBe(0);
    expect(zoneMobTelegraphWidthFixed({ isBoss: false, isElite: true, attackRangeFixed: 2_800 })).toBe(1_680);
    expect(zoneMobTelegraphWidthFixed({ isBoss: true, isElite: true, attackRangeFixed: 5_000 })).toBe(3_000);
    expect(zoneMobTelegraphWidthFixed({ isBoss: true, isElite: true, attackRangeFixed: 20_000 })).toBe(8_000);
  });
});
