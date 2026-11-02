import { eq } from "drizzle-orm";
import { aurionGlobalWorldStates } from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { freezeEvidence } from "../shared/aurionChunkStateContract";
import { verifyAnyWorldRoot } from "../shared/aurionChunkWorldRootContract";
import { splitWorldChunkPositionMm } from "../shared/worldChunkProtocol";
import { WORLD_SLICE_MAX_BYTES, WORLD_SLICE_POLICY, WORLD_SLICE_SCHEMA, WORLD_SLICE_ZONE, worldSliceQuerySchema, worldSliceSchema } from "../shared/worldSliceProtocol";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { getDb } from "./db";
import { readExplorationMemoryChunk } from "./explorationMemoryPersistence";
import { requireExplorationActorConnection } from "./explorationActorObservation";
import { globalZoneRegistry } from "./zoneRuntime";
import { AurionHeadlessCausalOracle } from "./causality/headlessCausalOracle";
import { worldCausalRootService } from "./causality/worldCausalRootService";
import { projectConfirmedChunkAssetReadback } from "./causality/worldChunkProjectionService";

/** Read-only observer. No fallback to a generated/client/ephemeral world. */
export async function readActorWorldSlice(userId: number, rawQuery: unknown) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("WORLD_SLICE_ACTOR_INVALID");
  const query = worldSliceQuerySchema.parse(rawQuery);
  const zone = globalZoneRegistry.find(WORLD_SLICE_ZONE);
  const requireConnection = () => {
    try { return requireExplorationActorConnection(zone, userId, query.coordinate); }
    catch { throw new Error("WORLD_SLICE_ACTOR_SCOPE_MISMATCH"); }
  };
  const connectionId = requireConnection();
  const db = await getDb();
  if (!db) throw new Error("WORLD_SLICE_DATABASE_UNAVAILABLE");
  const readEpoch = async () => (await db.select({ epoch: aurionGlobalWorldStates.epoch })
    .from(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).limit(1))[0]?.epoch;
  const epoch = await readEpoch();
  if (!epoch || !Number.isSafeInteger(epoch)) throw new Error("WORLD_SLICE_EPOCH_UNPROVABLE");
  if (query.expectedEpoch !== undefined && query.expectedEpoch !== epoch) throw new Error("WORLD_SLICE_REVISION_STALE");
  const root = await worldCausalRootService.read(GLOBAL_WORLD_ID, epoch);
  if (root?.status !== "VERIFIED" || !verifyAnyWorldRoot(root.root)) throw new Error("WORLD_SLICE_ROOT_UNPROVABLE");
  if (query.expectedWorldRoot !== undefined && query.expectedWorldRoot !== root.root.worldRootHash) throw new Error("WORLD_SLICE_REVISION_STALE");
  const zoneRoot = root.root.zoneRoots.find(item => item.zoneId === WORLD_SLICE_ZONE);
  if (!zoneRoot) throw new Error("WORLD_SLICE_ACTOR_UNPROVABLE");
  // Reuse the sole persisted replay algorithm. Never authorize from memoryHash,
  // an active transport lease alone, or a mutable current-zone snapshot.
  const observed = await new AurionHeadlessCausalOracle().readConfirmedState({
    zoneId: WORLD_SLICE_ZONE, fromTick: zoneRoot.toTick, toTick: zoneRoot.toTick,
  });
  if (observed.evidence.status !== "MATCH" || !observed.state
    || observed.evidence.terminalReceiptHash !== zoneRoot.lastReceiptHash
    || observed.evidence.sourceRevision !== zoneRoot.sourceRevision
    || observed.evidence.rulesetVersion !== zoneRoot.rulesetVersion
    || observed.state.worldId !== GLOBAL_WORLD_ID || observed.state.zoneId !== WORLD_SLICE_ZONE
    || observed.state.tick !== zoneRoot.toTick) throw new Error("WORLD_SLICE_ACTOR_UNPROVABLE");
  const actorId = `player:${userId}`;
  const actors = observed.state.players.filter(player => player.userId === userId || player.entityId === actorId);
  if (actors.length !== 1 || actors[0].userId !== userId || actors[0].entityId !== actorId) throw new Error("WORLD_SLICE_ACTOR_UNPROVABLE");
  const actor = actors[0];
  const coordinate = splitWorldChunkPositionMm({ x: actor.x, z: actor.z }).coordinate;
  if (coordinate.x !== query.coordinate.x || coordinate.z !== query.coordinate.z) throw new Error("WORLD_SLICE_ACTOR_SCOPE_MISMATCH");

  const memory = await readExplorationMemoryChunk(userId, GLOBAL_WORLD_ID, epoch, coordinate);
  const chunks = [];
  if (memory) {
    if (memory.firstDiscoveryReceiptHash !== observed.evidence.terminalReceiptHash
      || memory.latestConfirmedVisitSequence !== zoneRoot.toTick) throw new Error("WORLD_SLICE_DISCOVERY_UNPROVABLE");
    const readback = await worldCausalRootService.readChunk(GLOBAL_WORLD_ID, epoch, coordinate);
    if (readback.status !== "VERIFIED" || readback.worldRootHash !== root.root.worldRootHash) throw new Error("WORLD_SLICE_CHUNK_UNPROVABLE");
    const projection = await projectConfirmedChunkAssetReadback(readback);
    if (projection.status !== "VERIFIED" || memory.latestProjectionHash !== projection.manifest.projectionHash
      || memory.sourceRevision !== projection.sourceRevision) throw new Error("WORLD_SLICE_DISCOVERY_UNPROVABLE");
    const materialized = readback.state.materialized;
    // Construct an explicit public DTO. Never spread base resources, deltas,
    // seeds, private actor state, collision or undiscovered neighbor geometry.
    chunks.push({ coordinate, authorityReceiptHash: readback.receipt.receiptHash,
      tiles: materialized.base.tiles.map(tile => ({ x: tile.x, z: tile.z, heightMm: tile.heightMm, surface: tile.surface }))
        .sort((a, b) => a.z - b.z || a.x - b.x),
      structures: materialized.structures.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      roads: materialized.roads.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    });
  }
  const slice = worldSliceSchema.parse({
    schema: WORLD_SLICE_SCHEMA, policy: WORLD_SLICE_POLICY,
    worldId: GLOBAL_WORLD_ID, zoneId: WORLD_SLICE_ZONE, actorId, epoch,
    worldRoot: root.root.worldRootHash, sourceRevision: root.root.sourceRevision,
    observedAtTick: zoneRoot.toTick, coordinate, radius: query.radius, lod: query.lod,
    knowledgeHash: memory?.memoryHash ?? null, chunks,
    entities: [{ entityId: actorId, position: { x: actor.x, z: actor.z } }],
  });
  // Monotonic epoch and live scope are re-read after all awaited work. A camera
  // request cannot retain a stale authorization through a movement/reconnect.
  const finalRoot = await worldCausalRootService.read(GLOBAL_WORLD_ID, epoch);
  if (await readEpoch() !== epoch || finalRoot?.status !== "VERIFIED"
    || finalRoot.root.worldRootHash !== root.root.worldRootHash) throw new Error("WORLD_SLICE_REVISION_STALE");
  if (requireConnection() !== connectionId) throw new Error("WORLD_SLICE_SESSION_CHANGED");
  const result = { status: memory ? "VERIFIED" as const : "FOGGED" as const, connectionId, slice,
    fingerprint: canonicalSha256({ domain: WORLD_SLICE_SCHEMA, slice }), mutationAuthority: "none" as const };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > WORLD_SLICE_MAX_BYTES) throw new Error("WORLD_SLICE_PAYLOAD_LIMIT");
  return freezeEvidence(result);
}
