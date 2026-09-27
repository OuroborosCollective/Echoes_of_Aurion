import { describe, expect, it } from "vitest";
import {
  OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM,
  deriveOpenWorldSocialPlace,
  footprintForOpenWorldPlace,
  resolveOpenWorldPlacement,
} from "./aurionOpenWorldPlaceProtocol";

const REVISION = "0123456789abcdef0123456789abcdef01234567";

describe("aurion open-world place protocol", () => {
  it("models a homestead as a world-bound placed structure, not an instance", () => {
    const placement = resolveOpenWorldPlacement({
      worldId: "aurion",
      sourceRevision: REVISION,
      chunkCoordinate: { x: 4, z: -2 },
      structureId: "structure:83:house-0001",
      ownerId: "83",
      kind: "homestead",
      xMm: 32_000,
      zMm: 32_000,
      rotationQuarterTurns: 0,
      footprintMm: footprintForOpenWorldPlace("homestead"),
    });
    expect(placement.protocol).toBe("aurion.open-world-place.v1");
    expect(placement.footprintMm).toEqual(OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM);
    expect(placement.placementHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("normalizes a 90-degree rotation by swapping the canonical footprint axes", () => {
    const placement = resolveOpenWorldPlacement({
      worldId: "aurion",
      sourceRevision: REVISION,
      chunkCoordinate: { x: 1, z: 1 },
      structureId: "structure:83:house-rotated",
      ownerId: "83",
      kind: "homestead",
      xMm: 32_000,
      zMm: 32_000,
      rotationQuarterTurns: 1,
      footprintMm: OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM,
    });
    expect(placement.rotationQuarterTurns).toBe(1);
    expect(placement.footprintMm).toEqual({ x: 5_000, z: 6_000 });
  });

  it("rejects an open-world building footprint that would leave its chunk", () => {
    expect(() => resolveOpenWorldPlacement({
      worldId: "aurion",
      sourceRevision: REVISION,
      chunkCoordinate: { x: 0, z: 0 },
      structureId: "structure:83:house-0002",
      ownerId: "83",
      kind: "homestead",
      xMm: 1_000,
      zMm: 32_000,
      rotationQuarterTurns: 0,
      footprintMm: OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM,
    })).toThrow("OPEN_WORLD_PLACE_FOOTPRINT_OUTSIDE_CHUNK");
  });

  it("is permutation-invariant for derived social-place state", () => {
    const first = deriveOpenWorldSocialPlace({
      placeId: "place:windhollow:1",
      sourceRevision: REVISION,
      residentIds: ["orun", "lyra", "orun"],
      householdCount: 1,
      activeWorkers: 1,
      infrastructureLevel: 2,
      resourceNeedQ16: 70_000,
      socialCohesionQ16: 44_444,
      activityIndexQ16: 12_345,
    });
    const replay = deriveOpenWorldSocialPlace({
      placeId: "place:windhollow:1",
      sourceRevision: REVISION,
      residentIds: ["lyra", "orun"],
      householdCount: 1,
      activeWorkers: 1,
      infrastructureLevel: 2,
      resourceNeedQ16: 70_000,
      socialCohesionQ16: 44_444,
      activityIndexQ16: 12_345,
    });
    expect(first).toEqual(replay);
    expect(first.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed when worker or household counts exceed confirmed residents", () => {
    expect(() => deriveOpenWorldSocialPlace({
      placeId: "place:windhollow:1",
      sourceRevision: REVISION,
      residentIds: ["lyra"],
      householdCount: 2,
      activeWorkers: 1,
      infrastructureLevel: 0,
      resourceNeedQ16: 0,
      socialCohesionQ16: 0,
      activityIndexQ16: 0,
    })).toThrow("OPEN_WORLD_SOCIAL_PLACE_HOUSEHOLDS_EXCEED_RESIDENTS");
    expect(() => deriveOpenWorldSocialPlace({
      placeId: "place:windhollow:1",
      sourceRevision: REVISION,
      residentIds: ["lyra"],
      householdCount: 1,
      activeWorkers: 2,
      infrastructureLevel: 0,
      resourceNeedQ16: 0,
      socialCohesionQ16: 0,
      activityIndexQ16: 0,
    })).toThrow("OPEN_WORLD_SOCIAL_PLACE_WORKERS_EXCEED_RESIDENTS");
  });
});
