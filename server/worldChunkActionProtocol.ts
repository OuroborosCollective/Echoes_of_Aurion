import {
  WORLD_CHUNK_BASE_REVISION,
  WORLD_CHUNK_SIZE_MM,
  generateBaseWorldChunk,
  type WorldChunkCoordinate,
  type WorldChunkDeltaKind,
} from "./worldChunkProtocol";

export const WORLD_CHUNK_ACTION_REACH_MM = 3_500 as const;
export const WORLD_CHUNK_ROAD_MAX_LENGTH_MM = 6_000 as const;
export const WORLD_CHUNK_STRUCTURE_MAXIMUM = 24 as const;
export const WORLD_CHUNK_ROAD_MAXIMUM = 32 as const;

export type WorldChunkActionIntent =
  | { kind: "harvest_resource"; coordinate: WorldChunkCoordinate; expectedBaseRevision: number; expectedBaseHash: string; resourceId: string; idempotencyKey: string }
  | { kind: "place_structure"; coordinate: WorldChunkCoordinate; expectedBaseRevision: number; expectedBaseHash: string; assetKey: "aurion_tripo_starpath_marker" | "aurion_tripo_garden_border"; xMm: number; zMm: number; idempotencyKey: string }
  | { kind: "remove_structure"; coordinate: WorldChunkCoordinate; expectedBaseRevision: number; expectedBaseHash: string; structureId: string; xMm: number; zMm: number; idempotencyKey: string }
  | { kind: "build_road"; coordinate: WorldChunkCoordinate; expectedBaseRevision: number; expectedBaseHash: string; fromXmm: number; fromZmm: number; toXmm: number; toZmm: number; idempotencyKey: string };

export type ResolvedWorldChunkAction = {
  kind: WorldChunkDeltaKind;
  targetId: string;
  payload: Record<string, string | number | boolean>;
};

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function assertInChunk(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value < 0 || value >= WORLD_CHUNK_SIZE_MM) throw new Error(`${label} is outside the chunk`);
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value)) throw new Error("world chunk idempotency key is invalid");
}

function assertReachable(actorPosition: { x: number; z: number }, localPosition: { x: number; z: number }): void {
  const actorX = actorPosition.x + WORLD_CHUNK_SIZE_MM / 2;
  const actorZ = actorPosition.z + WORLD_CHUNK_SIZE_MM / 2;
  const dx = localPosition.x - actorX;
  const dz = localPosition.z - actorZ;
  if (dx * dx + dz * dz > WORLD_CHUNK_ACTION_REACH_MM * WORLD_CHUNK_ACTION_REACH_MM) throw new Error("world action target is outside the server-confirmed reach");
}

function stableTargetToken(value: string): string {
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ ((code << 7) | (code >>> 9)), 0x85ebca6b) >>> 0;
  }
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

function derivedTargetId(prefix: string, actorUserId: number, idempotencyKey: string): string {
  return `${prefix}:${actorUserId}:${stableTargetToken(idempotencyKey)}`;
}

/** Resolves a client intent into a bounded delta shape; it has no database authority. */
export function resolveWorldChunkAction(input: {
  actorUserId: number;
  actorPosition: { x: number; z: number };
  worldId: string;
  worldSeed: string;
  intent: WorldChunkActionIntent;
}): ResolvedWorldChunkAction {
  assertSafeInteger(input.actorUserId, "actorUserId");
  if (input.actorUserId < 1) throw new Error("actorUserId must be positive");
  const intent = input.intent;
  assertIdempotencyKey(intent.idempotencyKey);
  const base = generateBaseWorldChunk({ worldId: input.worldId, worldSeed: input.worldSeed, coordinate: intent.coordinate });
  if (intent.expectedBaseRevision !== WORLD_CHUNK_BASE_REVISION || intent.expectedBaseRevision !== base.baseRevision) throw new Error("world action base revision is stale");
  if (intent.expectedBaseHash !== base.deterministicHash) throw new Error("world action base hash is stale");

  if (intent.kind === "harvest_resource") {
    const resource = base.resources.find(candidate => candidate.id === intent.resourceId);
    if (!resource) throw new Error("world action resource is not in the generated chunk base");
    assertReachable(input.actorPosition, resource.positionMm);
    return Object.freeze({ kind: "resource_depleted", targetId: resource.id, payload: Object.freeze({ yieldKey: resource.yieldKey, resourceKind: resource.kind }) });
  }

  if (intent.kind === "place_structure") {
    assertInChunk(intent.xMm, "structure xMm");
    assertInChunk(intent.zMm, "structure zMm");
    assertReachable(input.actorPosition, { x: intent.xMm, z: intent.zMm });
    return Object.freeze({
      kind: "structure_placed",
      targetId: derivedTargetId("structure", input.actorUserId, intent.idempotencyKey),
      payload: Object.freeze({ assetKey: intent.assetKey, xMm: intent.xMm, zMm: intent.zMm }),
    });
  }

  if (intent.kind === "remove_structure") {
    if (!/^structure:[1-9][0-9]*:[0-9a-f]{16}$/.test(intent.structureId)) throw new Error("structureId is invalid");
    assertInChunk(intent.xMm, "structure xMm");
    assertInChunk(intent.zMm, "structure zMm");
    assertReachable(input.actorPosition, { x: intent.xMm, z: intent.zMm });
    return Object.freeze({ kind: "structure_removed", targetId: intent.structureId, payload: Object.freeze({ xMm: intent.xMm, zMm: intent.zMm }) });
  }

  for (const [value, label] of [[intent.fromXmm, "road fromXmm"], [intent.fromZmm, "road fromZmm"], [intent.toXmm, "road toXmm"], [intent.toZmm, "road toZmm"]] as const) assertInChunk(value, label);
  assertReachable(input.actorPosition, { x: intent.fromXmm, z: intent.fromZmm });
  const dx = intent.toXmm - intent.fromXmm;
  const dz = intent.toZmm - intent.fromZmm;
  if (dx * dx + dz * dz > WORLD_CHUNK_ROAD_MAX_LENGTH_MM * WORLD_CHUNK_ROAD_MAX_LENGTH_MM) throw new Error("road length exceeds the authoritative construction limit");
  return Object.freeze({
    kind: "road_built",
    targetId: derivedTargetId("road", input.actorUserId, intent.idempotencyKey),
    payload: Object.freeze({ fromXmm: intent.fromXmm, fromZmm: intent.fromZmm, toXmm: intent.toXmm, toZmm: intent.toZmm }),
  });
}
