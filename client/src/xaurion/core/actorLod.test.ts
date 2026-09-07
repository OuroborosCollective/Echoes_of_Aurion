import { describe, expect, it } from "vitest";
import {
  ACTOR_LOD_FAR_MAX_METERS,
  ACTOR_LOD_MID_MAX_METERS,
  ACTOR_LOD_NEAR_MAX_METERS,
  actorAnimationStride,
  actorLodBand,
  actorUsesSkinnedVisual,
  shouldUpdateActorAnimation,
} from "./actorLod";

describe("AIM-272 deterministic actor LOD", () => {
  it("keeps exact distance boundaries deterministic and every actor represented", () => {
    expect(actorLodBand(0)).toBe("near");
    expect(actorLodBand(ACTOR_LOD_NEAR_MAX_METERS - .001)).toBe("near");
    expect(actorLodBand(ACTOR_LOD_NEAR_MAX_METERS)).toBe("mid");
    expect(actorLodBand(ACTOR_LOD_MID_MAX_METERS - .001)).toBe("mid");
    expect(actorLodBand(ACTOR_LOD_MID_MAX_METERS)).toBe("far");
    expect(actorLodBand(ACTOR_LOD_FAR_MAX_METERS - .001)).toBe("far");
    expect(actorLodBand(ACTOR_LOD_FAR_MAX_METERS)).toBe("very_far");
    expect(() => actorLodBand(-1)).toThrow("ACTOR_LOD_DISTANCE_INVALID");
    expect(() => actorLodBand(Number.NaN)).toThrow("ACTOR_LOD_DISTANCE_INVALID");
    expect(actorUsesSkinnedVisual("near")).toBe(true);
    expect(actorUsesSkinnedVisual("mid")).toBe(true);
    expect(actorUsesSkinnedVisual("far")).toBe(false);
    expect(actorUsesSkinnedVisual("very_far")).toBe(false);
  });

  it("updates near mixers every frame, staggers mid mixers, and freezes proxy bands", () => {
    expect(actorAnimationStride).toEqual({ near: 1, mid: 3, far: 0, very_far: 0 });
    for (let tick = 0; tick < 12; tick += 1) expect(shouldUpdateActorAnimation(tick, "player:7", "near")).toBe(true);
    const playerA = Array.from({ length: 12 }, (_, tick) => shouldUpdateActorAnimation(tick, "player:7", "mid"));
    const playerB = Array.from({ length: 12 }, (_, tick) => shouldUpdateActorAnimation(tick, "player:8", "mid"));
    expect(playerA.filter(Boolean)).toHaveLength(4);
    expect(playerB.filter(Boolean)).toHaveLength(4);
    expect(playerA).not.toEqual(playerB);
    for (let tick = 0; tick < 12; tick += 1) {
      expect(shouldUpdateActorAnimation(tick, "player:7", "far")).toBe(false);
      expect(shouldUpdateActorAnimation(tick, "player:7", "very_far")).toBe(false);
    }
    expect(() => shouldUpdateActorAnimation(-1, "player:7", "near")).toThrow("ACTOR_LOD_TICK_INVALID");
    expect(() => shouldUpdateActorAnimation(0, "", "mid")).toThrow("ACTOR_LOD_IDENTITY_INVALID");
  });
});
