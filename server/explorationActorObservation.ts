import { computeReceiptHash } from "../shared/aurionCausalTickContract";
import { splitWorldChunkPositionMm, type WorldChunkCoordinate } from "../shared/worldChunkProtocol";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import type { AuthoritativeMovementZone } from "./zoneRuntime";

export const EXPLORATION_ZONE_ID = "observatory_threshold" as const;

type StoredTick = Readonly<{
  worldId: string;
  zoneId: string;
  tick: number;
  receiptHash: string;
  postStateHash: string;
}>;

/** This checks an Aurion-owned zone snapshot, never a client-supplied position. */
export function requireExplorationActorConnection(
  zone: AuthoritativeMovementZone | undefined,
  userId: number,
  coordinate: WorldChunkCoordinate,
): string {
  const connection = zone?.liveConnectionIdForUser(userId);
  if (!zone || !connection) throw new Error("EXPLORATION_ACTOR_NOT_CONNECTED");
  const position = zone.positionForConnection(connection);
  if (!position) throw new Error("EXPLORATION_ACTOR_NOT_CONNECTED");
  const current = splitWorldChunkPositionMm(position).coordinate;
  if (current.x !== coordinate.x || current.z !== coordinate.z) throw new Error("EXPLORATION_ACTOR_CHUNK_MISMATCH");
  return connection;
}

/**
 * Bind a personal discovery to the final persisted zone tick covered by the
 * verified epoch root. Missing/evicted snapshots fail closed; a hash alone does
 * not identify an actor or establish their position.
 */
export function verifyExplorationActorObservation(input: {
  zone: AuthoritativeMovementZone;
  userId: number;
  coordinate: WorldChunkCoordinate;
  connectionId: string;
  epochFromTick: number;
  epochToTick: number;
  epochSourceRevision: string;
  epochRulesetVersion: string;
  epochLastReceiptHash: string;
  stored: StoredTick;
}): Readonly<{ tick: number; receiptHash: string }> {
  const { zone, userId, coordinate, connectionId, epochFromTick, epochToTick, epochSourceRevision, epochRulesetVersion, epochLastReceiptHash, stored } = input;
  if (requireExplorationActorConnection(zone, userId, coordinate) !== connectionId) {
    throw new Error("EXPLORATION_ACTOR_SESSION_CHANGED");
  }
  if (!Number.isSafeInteger(epochFromTick) || epochFromTick < 1 || !Number.isSafeInteger(epochToTick)
    || epochToTick < epochFromTick || epochToTick > zone.getTickNumber()) {
    throw new Error("EXPLORATION_EPOCH_TICK_INVALID");
  }
  const entry = zone.recordedTick(epochToTick);
  const receipt = entry?.receipt;
  const state = entry?.postState;
  if (!receipt || !state || stored.worldId !== GLOBAL_WORLD_ID || stored.zoneId !== EXPLORATION_ZONE_ID
    || stored.tick !== epochToTick || receipt.tick !== epochToTick || state.tick !== epochToTick
    || receipt.worldId !== stored.worldId || receipt.zoneId !== stored.zoneId
    || state.worldId !== stored.worldId || state.zoneId !== stored.zoneId
    || receipt.sourceRevision !== epochSourceRevision || receipt.rulesetVersion !== epochRulesetVersion
    || state.ruleset !== receipt.rulesetVersion
    || stored.receiptHash !== epochLastReceiptHash || stored.receiptHash !== receipt.receiptHash || stored.postStateHash !== receipt.postStateHash
    || computeReceiptHash(receipt) !== receipt.receiptHash || hashCanonicalZoneState(state) !== receipt.postStateHash) {
    throw new Error("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
  }
  const actorId = `player:${userId}`;
  const actors = state.players.filter(player => player.userId === userId || player.entityId === actorId);
  if (actors.length !== 1 || actors[0].userId !== userId || actors[0].entityId !== actorId) {
    throw new Error("EXPLORATION_ACTOR_NOT_IN_EPOCH");
  }
  const observed = splitWorldChunkPositionMm({ x: actors[0].x, z: actors[0].z }).coordinate;
  if (observed.x !== coordinate.x || observed.z !== coordinate.z) throw new Error("EXPLORATION_ACTOR_CHUNK_MISMATCH");
  return Object.freeze({ tick: receipt.tick, receiptHash: receipt.receiptHash });
}
