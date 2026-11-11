import { describe, expect, it } from "vitest";
import { WorldNatureCollision } from "./worldNatureCollision";
import { WASD_ZONE_CARDINAL_STEP_FIXED as STEP } from "./wasdZoneMovementProtocol";

/** Regression coordinates are from AIM-259 run 34430721497, not a fabricated collision receipt. */
describe("nature collision approach geometry", () => {
  it("reproduces the failed browser's five unobstructed westward ticks on its overshot row", () => {
    const world = new WorldNatureCollision();
    let position = { x: -22_780, z: -58_480 };
    for (let tick = 0; tick < 5; tick++) {
      const desired = { x: position.x - STEP, z: position.z };
      expect(world.blockingObstacle(position, desired)).toBeUndefined();
      expect(world.resolve(position, desired)).toEqual(desired);
      position = desired;
    }
    expect(position).toEqual({ x: -24_480, z: -58_480 });
  });

  it("binds the intended approach to the real oak footprint rather than elapsed input time", () => {
    const world = new WorldNatureCollision();
    // Until 2026-11-10 this bound to Tree_Oak_6 at (-24 m, -56 m). That tree stood inside
    // the starter-city wall clearance and was removed with every other procedural object
    // there (owner design brief). The nearest solid tree north of the wall is now Tree_Oak_4.
    expect(world.obstaclesForChunk({ x: 0, z: -1 }).some(value => value.origin.x === -24_000 && value.origin.z === -56_000)).toBe(false);
    const obstacle = world.obstaclesForChunk({ x: 0, z: -1 }).find(value =>
      value.assetId === "nature-tree-oak-4" && value.origin.x === -23_000 && value.origin.z === -74_000
    );
    expect(obstacle).toBeDefined();
    const targetZ = Math.round(obstacle!.origin.z / STEP) * STEP;
    expect(targetZ).toBe(-74_120);
    // The browser may settle one fixed step either side of the alignment target;
    // each accepted row must still actually reach this specific solid hull.
    for (const z of [targetZ - STEP, targetZ, targetZ + STEP]) {
      let position = { x: 0, z };
      for (let tick = 0; tick < 100; tick++) position = world.resolve(position, { x: position.x - STEP, z });
      expect(world.blockingObstacle(position, position)).toBeUndefined();
      expect(world.blockingObstacle(position, { x: position.x - STEP, z })?.id).toBe(obstacle!.id);
      const next = world.resolve(position, { x: position.x - STEP, z });
      expect(next).toEqual(position);
      if (z === targetZ) expect(position).toEqual({ x: -21_420, z: -74_120 });
      expect(world.resolve(position, { x: position.x + STEP, z })).toEqual({ x: position.x + STEP, z });
    }
  });
});
