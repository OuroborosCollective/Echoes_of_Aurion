import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";
import { audioCueForFootstep, audioCueForSword } from "@shared/audioProtocol";

export type SurfaceAudioTerrain = Readonly<{
  chunkSizeMeters: number;
  tileSizeMeters: number;
  columns: number;
  rows: number;
  tiles: readonly { x: number; z: number; surface: string }[];
}>;

export type ConfirmedMovementSample = Readonly<{
  position: { x: number; z: number };
  tick: number;
  terrain: SurfaceAudioTerrain | null;
}>;

export type ConfirmedCombatSample = Readonly<{
  sequence: number;
  hit: boolean;
}>;

export function audioSurfaceForTerrainSurface(surface: string): AudioSurface | null {
  if (surface === "grass" || surface === "flower_meadow" || surface === "farmland" || surface === "garden_parcels") return "grass";
  if (surface === "earth") return "sand";
  if (surface === "starpath" || surface === "starpath_crossing") return "stone";
  if (surface === "stone" || surface === "ruin_path") return "stone";
  if (surface === "water" || surface === "riverbank") return "water";
  if (surface === "sand" || surface === "ash") return "sand";
  return null;
}

export function resolveAudioSurfaceAtPosition(terrain: SurfaceAudioTerrain | null, position: { x: number; z: number }): AudioSurface | null {
  if (!terrain || terrain.tileSizeMeters <= 0 || terrain.columns <= 0 || terrain.rows <= 0) return null;
  const minX = -terrain.chunkSizeMeters / 2;
  const minZ = -terrain.chunkSizeMeters / 2;
  const tileX = Math.floor((position.x - minX) / terrain.tileSizeMeters);
  const tileZ = Math.floor((position.z - minZ) / terrain.tileSizeMeters);
  if (tileX < 0 || tileX >= terrain.columns || tileZ < 0 || tileZ >= terrain.rows) return null;
  const tile = terrain.tiles.find(value => value.x === tileX && value.z === tileZ);
  return tile ? audioSurfaceForTerrainSurface(tile.surface) : null;
}

export class ConfirmedFootstepCadence {
  private last: { x: number; z: number; tick: number } | null = null;
  private accumulatedMeters = 0;
  private lastSurface: AudioSurface | null = null;
  private lastGait: "walk" | "run" | null = null;

  advance(sample: ConfirmedMovementSample): AudioEvent | null {
    if (!Number.isSafeInteger(sample.tick) || sample.tick < 0) return null;
    if (!Number.isFinite(sample.position.x) || !Number.isFinite(sample.position.z)) return null;
    if (!this.last) {
      this.last = { x: sample.position.x, z: sample.position.z, tick: sample.tick };
      this.lastSurface = resolveAudioSurfaceAtPosition(sample.terrain, sample.position);
      return null;
    }
    const tickDelta = sample.tick - this.last.tick;
    if (tickDelta <= 0) return null;
    const distance = Math.hypot(sample.position.x - this.last.x, sample.position.z - this.last.z);
    this.last = { x: sample.position.x, z: sample.position.z, tick: sample.tick };
    if (distance <= 0) return null;

    const speedMetersPerSecond = distance / (tickDelta / 10);
    const gait = speedMetersPerSecond >= 4.5 ? "run" : "walk";
    const surface = resolveAudioSurfaceAtPosition(sample.terrain, sample.position);
    if (!surface) {
      this.accumulatedMeters = 0;
      this.lastSurface = null;
      this.lastGait = null;
      return null;
    }
    if (surface !== this.lastSurface || gait !== this.lastGait) this.accumulatedMeters = 0;
    this.lastSurface = surface;
    this.lastGait = gait;
    this.accumulatedMeters += distance;
    const threshold = gait === "run" ? 2.25 : 1.65;
    if (this.accumulatedMeters < threshold) return null;
    this.accumulatedMeters -= threshold;
    return audioCueForFootstep(surface, gait, sample.tick);
  }

  reset(): void {
    this.last = null;
    this.accumulatedMeters = 0;
    this.lastSurface = null;
    this.lastGait = null;
  }
}

export class AurionSurfaceAudioOrchestrator {
  private readonly footstepCadence = new ConfirmedFootstepCadence();
  private readonly seenCombatSequences = new Set<number>();

  advanceMovement(sample: ConfirmedMovementSample): AudioEvent | null {
    return this.footstepCadence.advance(sample);
  }

  combat(sample: ConfirmedCombatSample, impactSurface?: AudioSurface): readonly AudioEvent[] {
    if (!Number.isSafeInteger(sample.sequence) || sample.sequence < 1 || this.seenCombatSequences.has(sample.sequence)) return [];
    this.seenCombatSequences.add(sample.sequence);
    if (this.seenCombatSequences.size > 512) {
      const first = this.seenCombatSequences.values().next().value;
      if (typeof first === "number") this.seenCombatSequences.delete(first);
    }
    const events: AudioEvent[] = [audioCueForSword("swing")];
    if (sample.hit) events.push(audioCueForSword("impact", impactSurface));
    return events;
  }

  reset(): void {
    this.footstepCadence.reset();
    this.seenCombatSequences.clear();
  }
}
