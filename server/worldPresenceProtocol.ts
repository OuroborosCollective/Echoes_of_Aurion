import { splitWorldChunkPositionMm, WORLD_CHUNK_SIZE_MM, WORLD_CHUNK_COORDINATE_LIMIT } from "../shared/worldChunkProtocol";
import { validWorldPosition } from "../shared/zonePresenceContract";
import type { ZoneId, ZonePosition } from "./zoneProtocol";
import type { WorldChunkCoordinate } from "./worldChunkProtocol";

export const WORLD_PRESENCE_LEASE_MS = 120_000 as const;
export const WORLD_PRESENCE_REFRESH_MS = 30_000 as const;
export const AURION_WORLD_EPOCH_RULESET_VERSION = "aurion-world-epoch.v1" as const;

export type WorldPresenceLease = {
  userId: number;
  connectionId: string;
  zoneId: ZoneId;
  chunk: WorldChunkCoordinate;
  position: ZonePosition;
  expiresAt: Date;
};

const zoneAnchors: Readonly<Record<ZoneId, WorldChunkCoordinate>> = Object.freeze({
  observatory_threshold: Object.freeze({ x: 0, z: 0 }),
});

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

export function worldChunkForZone(zoneId: ZoneId): WorldChunkCoordinate {
  const coordinate = zoneAnchors[zoneId];
  if (!coordinate) throw new Error(`No world chunk anchor is configured for zone ${zoneId}`);
  return coordinate;
}

/** Operational clock values only control lease expiry; they never directly determine a world outcome. */
export function createWorldPresenceLease(input: { userId: number; connectionId: string; zoneId: ZoneId; position: ZonePosition; now: Date }): WorldPresenceLease {
  assertPositiveSafeInteger(input.userId, "userId");
  if (!/^[A-Za-z0-9_-]{12,96}$/.test(input.connectionId)) throw new Error("connectionId is invalid");
  if (!validWorldPosition(input.position)) throw new Error("position must be a valid zone fixed-point coordinate");
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error("now must be a valid date");
  worldChunkForZone(input.zoneId);
  return Object.freeze({
    userId: input.userId,
    connectionId: input.connectionId,
    zoneId: input.zoneId,
    chunk: splitWorldChunkPositionMm(input.position).coordinate,
    position: Object.freeze({ ...input.position }),
    expiresAt: new Date(input.now.getTime() + WORLD_PRESENCE_LEASE_MS),
  });
}

export function nextWorldEpoch(currentEpoch: number): number {
  if (!Number.isSafeInteger(currentEpoch) || currentEpoch < 0) throw new Error("currentEpoch must be a non-negative safe integer");
  if (currentEpoch >= Number.MAX_SAFE_INTEGER) throw new Error("world epoch cannot exceed the safe integer range");
  return currentEpoch + 1;
}

export function canonicalWorldEpochRequestKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(normalized)) throw new Error("world epoch idempotency key is invalid");
  return normalized;
}

/** Existing INT columns store centered chunk-local millimetres. Chunk zero is
 * backward compatible with every lease written by the original bounded zone. */
export function worldPresenceStoragePosition(position: ZonePosition): ZonePosition {
  const {localPositionMm}=splitWorldChunkPositionMm(position);
  return {x:localPositionMm.x-WORLD_CHUNK_SIZE_MM/2,z:localPositionMm.z-WORLD_CHUNK_SIZE_MM/2};
}
export function worldPresenceGlobalPosition(chunk: WorldChunkCoordinate, local: ZonePosition): ZonePosition {
  if (![chunk.x,chunk.z].every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=WORLD_CHUNK_COORDINATE_LIMIT) || ![local.x,local.z].every(v=>Number.isSafeInteger(v)&&v>=-WORLD_CHUNK_SIZE_MM/2&&v<WORLD_CHUNK_SIZE_MM/2)) throw Error("WORLD_PRESENCE_STORAGE_INVALID");
  return {x:chunk.x*WORLD_CHUNK_SIZE_MM+local.x,z:chunk.z*WORLD_CHUNK_SIZE_MM+local.z};
}
