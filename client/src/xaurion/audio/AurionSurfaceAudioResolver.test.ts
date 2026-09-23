import { describe, expect, it } from "vitest";
import { AurionSurfaceAudioOrchestrator, ConfirmedFootstepCadence, audioSurfaceForTerrainSurface, resolveAudioSurfaceAtPosition } from "./AurionSurfaceAudioResolver";

const terrain = {
  chunkSizeMeters: 32,
  tileSizeMeters: 4,
  columns: 4,
  rows: 4,
  tiles: [
    { x: 0, z: 0, surface: "grass" },
    { x: 1, z: 0, surface: "grass" },
    { x: 2, z: 0, surface: "starpath" },
    { x: 3, z: 0, surface: "water" },
  ],
} as const;

describe("Aurion surface audio", () => {
  it("maps presentation surfaces without creating another terrain truth", () => {
    expect(audioSurfaceForTerrainSurface("grass")).toBe("grass");
    expect(audioSurfaceForTerrainSurface("earth")).toBe("sand");
    expect(audioSurfaceForTerrainSurface("starpath")).toBe("stone");
    expect(audioSurfaceForTerrainSurface("water")).toBe("water");
    expect(audioSurfaceForTerrainSurface("unknown")).toBeNull();
  });

  it("resolves fixed terrain vectors deterministically", () => {
    expect(resolveAudioSurfaceAtPosition(terrain, { x: -15.9, z: -15.9 })).toBe("grass");
    expect(resolveAudioSurfaceAtPosition(terrain, { x: -11.9, z: -15.9 })).toBe("grass");
    expect(resolveAudioSurfaceAtPosition(terrain, { x: -7.9, z: -15.9 })).toBe("stone");
    expect(resolveAudioSurfaceAtPosition(terrain, { x: -3.9, z: -15.9 })).toBe("water");
    expect(resolveAudioSurfaceAtPosition(terrain, { x: 20, z: 20 })).toBeNull();
  });

  it("emits no duplicate footstep for sub-cadence confirmed movement", () => {
    const cadence = new ConfirmedFootstepCadence();
    expect(cadence.advance({ position: { x: -15.9, z: -15.9 }, tick: 1, terrain })).toBeNull();
    expect(cadence.advance({ position: { x: -15.1, z: -15.9 }, tick: 11, terrain })).toBeNull();
    expect(cadence.advance({ position: { x: -14.2, z: -15.9 }, tick: 21, terrain })?.cue).toBe("movement.footstep.grass");
  });

  it("uses run cadence above the deterministic confirmed-speed threshold", () => {
    const cadence = new ConfirmedFootstepCadence();
    cadence.advance({ position: { x: -15.9, z: -15.9 }, tick: 1, terrain });
    const first = cadence.advance({ position: { x: -13.4, z: -15.9 }, tick: 11, terrain });
    expect(first?.cue).toBe("movement.run.grass");
  });

  it("consumes each confirmed combat sequence exactly once", () => {
    const orchestrator = new AurionSurfaceAudioOrchestrator();
    expect(orchestrator.combat({ sequence: 7, hit: true }, "stone").map(event => event.cue)).toEqual(["combat.swing.blade", "combat.impact.blade"]);
    expect(orchestrator.combat({ sequence: 7, hit: true }, "stone")).toEqual([]);
    expect(orchestrator.combat({ sequence: 8, hit: false }, "water").map(event => event.cue)).toEqual(["combat.swing.blade"]);
  });
});
