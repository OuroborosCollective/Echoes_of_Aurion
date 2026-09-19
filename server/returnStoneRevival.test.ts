import { describe, expect, it } from "vitest";
import {
  AURION_RETURN_STONE_POSITION,
  AURION_RETURN_STONE_REVIVE_DELAY_TICKS,
} from "../shared/aurionReturnStoneContract";
import { WASD_MAX_STAMINA } from "./wasdStaminaProtocol";
import { resolveReturnStoneRevival } from "./returnStoneRevival";

const base = {
  zoneId: "observatory_threshold",
  tick: 100,
  health: 0,
  maxHealth: 137,
  stamina: 0,
  lastCombatSequence: 70_004,
} as const;

describe("return-stone revival", () => {
  it("revives only after the deterministic 10-Hz delay and returns to the canonical stone", () => {
    expect(resolveReturnStoneRevival({ ...base, tick: 70 + AURION_RETURN_STONE_REVIVE_DELAY_TICKS - 1 })).toBeNull();
    expect(resolveReturnStoneRevival({ ...base, tick: 70 + AURION_RETURN_STONE_REVIVE_DELAY_TICKS })).toEqual({
      health: base.maxHealth,
      stamina: WASD_MAX_STAMINA,
      position: AURION_RETURN_STONE_POSITION,
      deathTick: 70,
      reviveTick: 70 + AURION_RETURN_STONE_REVIVE_DELAY_TICKS,
    });
  });

  it("fails closed for living players, other zones and missing combat death evidence", () => {
    expect(resolveReturnStoneRevival({ ...base, health: 1 })).toBeNull();
    expect(resolveReturnStoneRevival({ ...base, zoneId: "windhollow" })).toBeNull();
    expect(resolveReturnStoneRevival({ ...base, lastCombatSequence: 0 })).toBeNull();
  });
});
