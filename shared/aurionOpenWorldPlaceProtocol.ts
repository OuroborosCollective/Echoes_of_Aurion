import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_OPEN_WORLD_PLACE_PROTOCOL = "aurion.open-world-place.v1" as const;
export const OPEN_WORLD_PLACE_QUARTER_TURNS = 4 as const;
export const OPEN_WORLD_CHUNK_SIZE_MM = 64_000 as const;
export const OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM = Object.freeze({ x: 6_000, z: 5_000 });
export const OPEN_WORLD_GENERIC_STRUCTURE_FOOTPRINT_MM = Object.freeze({ x: 1_000, z: 1_000 });

export type OpenWorldPlaceKind = "homestead" | "workshop" | "public";

export type OpenWorldPlacementInput = Readonly<{
  worldId: string;
  sourceRevision: string;
  chunkCoordinate: { x: number; z: number };
  structureId: string;
  ownerId: string;
  kind: OpenWorldPlaceKind;
  xMm: number;
  zMm: number;
  rotationQuarterTurns: number;
  footprintMm: { x: number; z: number };
}>;

export type OpenWorldPlacement = Readonly<OpenWorldPlacementInput & {
  protocol: typeof AURION_OPEN_WORLD_PLACE_PROTOCOL;
  placementHash: string;
}>;

export type OpenWorldSocialPlaceInput = Readonly<{
  placeId: string;
  sourceRevision: string;
  residentIds: readonly string[];
  householdCount: number;
  activeWorkers: number;
  infrastructureLevel: number;
  resourceNeedQ16: number;
  socialCohesionQ16: number;
  activityIndexQ16: number;
}>;

export type OpenWorldSocialPlaceState = Readonly<{
  protocol: typeof AURION_OPEN_WORLD_PLACE_PROTOCOL;
  placeId: string;
  sourceRevision: string;
  residentIds: readonly string[];
  householdCount: number;
  activeWorkers: number;
  infrastructureLevel: number;
  resourceNeedQ16: number;
  socialCohesionQ16: number;
  activityIndexQ16: number;
  stateHash: string;
}>;

const identifier = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new Error(`OPEN_WORLD_PLACE_${label.toUpperCase()}_INVALID`);
  return normalized;
};

const assertSafeInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value)) throw new Error(`OPEN_WORLD_PLACE_${label.toUpperCase()}_INVALID`);
};

const assertNonNegative = (value: number, label: string) => {
  assertSafeInteger(value, label);
  if (value < 0) throw new Error(`OPEN_WORLD_PLACE_${label.toUpperCase()}_INVALID`);
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clampQ16 = (value: number) => Math.max(0, Math.min(65_536, Math.trunc(value)));

export function footprintForOpenWorldPlace(kind: OpenWorldPlaceKind): Readonly<{ x: number; z: number }> {
  return kind === "homestead" ? OPEN_WORLD_HOMESTEAD_FOOTPRINT_MM : OPEN_WORLD_GENERIC_STRUCTURE_FOOTPRINT_MM;
}

export function resolveOpenWorldPlacement(input: OpenWorldPlacementInput): OpenWorldPlacement {
  const worldId = identifier(input.worldId, "world_id");
  const sourceRevision = identifier(input.sourceRevision, "source_revision");
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("OPEN_WORLD_PLACE_SOURCE_REVISION_INVALID");
  const structureId = identifier(input.structureId, "structure_id");
  const ownerId = identifier(input.ownerId, "owner_id");
  assertSafeInteger(input.chunkCoordinate.x, "chunk_x");
  assertSafeInteger(input.chunkCoordinate.z, "chunk_z");
  assertNonNegative(input.xMm, "x_mm");
  assertNonNegative(input.zMm, "z_mm");
  assertSafeInteger(input.rotationQuarterTurns, "rotation_quarter_turns");
  if (input.rotationQuarterTurns < 0 || input.rotationQuarterTurns >= OPEN_WORLD_PLACE_QUARTER_TURNS) throw new Error("OPEN_WORLD_PLACE_ROTATION_INVALID");
  assertNonNegative(input.footprintMm.x, "footprint_x");
  assertNonNegative(input.footprintMm.z, "footprint_z");
  if (!Number.isSafeInteger(input.footprintMm.x) || input.footprintMm.x < 1 || input.footprintMm.x > OPEN_WORLD_CHUNK_SIZE_MM) throw new Error("OPEN_WORLD_PLACE_FOOTPRINT_X_INVALID");
  if (!Number.isSafeInteger(input.footprintMm.z) || input.footprintMm.z < 1 || input.footprintMm.z > OPEN_WORLD_CHUNK_SIZE_MM) throw new Error("OPEN_WORLD_PLACE_FOOTPRINT_Z_INVALID");
  if (!["homestead", "workshop", "public"].includes(input.kind)) throw new Error("OPEN_WORLD_PLACE_KIND_INVALID");
  const halfX = Math.floor(input.footprintMm.x / 2);
  const halfZ = Math.floor(input.footprintMm.z / 2);
  if (input.xMm - halfX < 0 || input.xMm + halfX >= OPEN_WORLD_CHUNK_SIZE_MM || input.zMm - halfZ < 0 || input.zMm + halfZ >= OPEN_WORLD_CHUNK_SIZE_MM) {
    throw new Error("OPEN_WORLD_PLACE_FOOTPRINT_OUTSIDE_CHUNK");
  }
  const rotationQuarterTurns = ((input.rotationQuarterTurns % OPEN_WORLD_PLACE_QUARTER_TURNS) + OPEN_WORLD_PLACE_QUARTER_TURNS) % OPEN_WORLD_PLACE_QUARTER_TURNS;
  const rotateFootprint = rotationQuarterTurns % 2 === 1;
  const canonical = {
    protocol: AURION_OPEN_WORLD_PLACE_PROTOCOL,
    worldId,
    sourceRevision,
    chunkCoordinate: { x: input.chunkCoordinate.x, z: input.chunkCoordinate.z },
    structureId,
    ownerId,
    kind: input.kind,
    xMm: input.xMm,
    zMm: input.zMm,
    rotationQuarterTurns,
    footprintMm: rotateFootprint
      ? { x: input.footprintMm.z, z: input.footprintMm.x }
      : { x: input.footprintMm.x, z: input.footprintMm.z },
  } as const;
  return Object.freeze({
    ...canonical,
    placementHash: canonicalSha256({ domain: "aurion.open-world-place.v1", placement: canonical }),
  });
}

export function deriveOpenWorldSocialPlace(input: OpenWorldSocialPlaceInput): OpenWorldSocialPlaceState {
  const placeId = identifier(input.placeId, "place_id");
  const sourceRevision = identifier(input.sourceRevision, "source_revision");
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("OPEN_WORLD_SOCIAL_PLACE_SOURCE_REVISION_INVALID");
  const residentIds = Array.from(new Set(input.residentIds.map(value => identifier(value, "resident_id")))).sort(compare);
  assertNonNegative(input.householdCount, "household_count");
  assertNonNegative(input.activeWorkers, "active_workers");
  assertNonNegative(input.infrastructureLevel, "infrastructure_level");
  if (input.activeWorkers > residentIds.length) throw new Error("OPEN_WORLD_SOCIAL_PLACE_WORKERS_EXCEED_RESIDENTS");
  if (input.householdCount > residentIds.length) throw new Error("OPEN_WORLD_SOCIAL_PLACE_HOUSEHOLDS_EXCEED_RESIDENTS");
  const resourceNeedQ16 = clampQ16(input.resourceNeedQ16);
  const socialCohesionQ16 = clampQ16(input.socialCohesionQ16);
  const activityIndexQ16 = clampQ16(input.activityIndexQ16);
  const envelope = {
    protocol: AURION_OPEN_WORLD_PLACE_PROTOCOL,
    placeId,
    sourceRevision,
    residentIds,
    householdCount: input.householdCount,
    activeWorkers: input.activeWorkers,
    infrastructureLevel: input.infrastructureLevel,
    resourceNeedQ16,
    socialCohesionQ16,
    activityIndexQ16,
  } as const;
  return Object.freeze({
    ...envelope,
    residentIds: Object.freeze([...residentIds]),
    stateHash: canonicalSha256({ domain: "aurion.open-world-social-place.v1", state: envelope }),
  });
}
