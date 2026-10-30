import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { operationalNow, hostOperationalClock, type OperationalClock } from "../../shared/operationalClock";
import { activeProvenance } from "../aurionProvenance";
import { computeReceiptHash, type AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import { ZONE_FIXED_POINT_SCALE } from "../zoneProtocol";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { hashCanonicalZoneState } from "../causality/zoneCanonicalState";
import { globalTickRecorder, type AurionTickRecorder, type RecordedTickEntry } from "../causality/tickRecorder";
import { attachAurionFeed } from "./feed/aurionFeed.js";
import type { Entity, RegionInfo } from "./shared/protocol.js";
import { projectionHash, type ProjectionIdentity } from "./shared/projectionIdentity.js";

export interface CommittedProjection {
  identity: ProjectionIdentity;
  entities: Entity[];
  regions: RegionInfo[];
}

/** X/Z are confirmed fixed-point values; Y=0 is explicitly a flat presentation plane. */
export function projectCommittedTick(entry: RecordedTickEntry, observation: {
  sourceRevision: string; runtimeImageDigest: string; streamInstance: string;
  previousReceipt?: AurionCausalTickReceipt;
}): CommittedProjection {
  const { receipt, postState: state } = entry;
  if (!state || state.worldId !== receipt.worldId || state.zoneId !== receipt.zoneId
    || state.tick !== receipt.tick || receipt.sourceRevision !== observation.sourceRevision
    || !/^[a-f0-9]{40}$/.test(observation.sourceRevision)
    || hashCanonicalZoneState(state) !== receipt.postStateHash
    || computeReceiptHash(receipt) !== receipt.receiptHash) throw new Error("GODOT_COMMITTED_TICK_UNVERIFIED");
  const previous = observation.previousReceipt;
  if (receipt.tick > 1 && !previous) throw new Error("GODOT_RECEIPT_PREDECESSOR_REQUIRED");
  if (previous && (previous.worldId !== receipt.worldId || previous.zoneId !== receipt.zoneId
    || previous.tick + 1 !== receipt.tick || computeReceiptHash(previous) !== previous.receiptHash
    || receipt.previousReceiptHash !== previous.receiptHash)) {
    throw new Error("GODOT_RECEIPT_CONTINUITY_UNVERIFIED");
  }
  const position = (x: number, z: number) => {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) throw new Error("GODOT_FIXED_POSITION_INVALID");
    return { x: x / ZONE_FIXED_POINT_SCALE, y: 0, z: z / ZONE_FIXED_POINT_SCALE };
  };
  const entities: Entity[] = [
    ...state.players.map<Entity>(player => ({
      id: player.entityId, kind: "player", region: state.zoneId,
      pos: position(player.x, player.z),
      props: { health: player.health, maxHealth: player.maxHealth, stamina: player.stamina },
    })),
    ...state.mobs.map<Entity>(mob => ({
      id: mob.entityId, kind: "monster", region: state.zoneId,
      ...(mob.archetype ? { defId: mob.archetype } : {}),
      pos: position(mob.x, mob.z),
      props: { health: mob.health, maxHealth: mob.maxHealth, stamina: mob.stamina, state: mob.state },
    })),
  ].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const regions: RegionInfo[] = [{ id: state.zoneId }];
  return {
    entities, regions,
    identity: {
      schema: "aurion.godot.committed-projection.v1",
      worldId: state.worldId, zoneId: state.zoneId, tick: state.tick,
      sourceRevision: receipt.sourceRevision,
      runtimeImageDigest: observation.runtimeImageDigest,
      streamInstance: observation.streamInstance,
      receiptHash: receipt.receiptHash, stateHash: receipt.postStateHash,
      projectionHash: projectionHash(state.tick, entities, regions),
      coordinates: "aurion.fixed-xz-flat.v1", fixedPointScale: 1000,
    },
  };
}

/** No token path = no listener and no observer. Never activates a zone or creates a tick. */
export async function startAurionGodotFeed(
  env: NodeJS.ProcessEnv = process.env,
  recorder: AurionTickRecorder = globalTickRecorder,
  clock: OperationalClock = hostOperationalClock,
): Promise<{ close(): Promise<void>; port: number } | undefined> {
  if (!env.AURION_GODOT_FEED_TOKEN_FILE) return undefined;
  const token = readFileSync(env.AURION_GODOT_FEED_TOKEN_FILE, "utf8").trim();
  const port = Number(env.AURION_GODOT_FEED_PORT ?? "39220");
  const bind = env.AURION_GODOT_FEED_BIND ?? "127.0.0.1";
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535
    || !["127.0.0.1", "::1", "0.0.0.0"].includes(bind)) throw new Error("GODOT_FEED_LISTENER_INVALID");
  const zoneId = "observatory_threshold";
  const observation = {
    sourceRevision: activeProvenance.sourceRevision,
    runtimeImageDigest: activeProvenance.runtimeImageDigest,
    streamInstance: randomUUID(), // Observer transport epoch; never enters canonical state or RNG.
  };
  if (!/^[a-f0-9]{40}$/.test(observation.sourceRevision)) throw new Error("GODOT_FEED_SOURCE_UNVERIFIED");
  let current: CommittedProjection | undefined;
  let lastProjectedReceipt: AurionCausalTickReceipt | undefined;
  let lastObservedAt = 0;
  const feed = attachAurionFeed({
    token, port, bind,
    host: {
      worldId: GLOBAL_WORLD_ID,
      getTick: () => current?.identity.tick ?? 0,
      getIdentity: () => operationalNow(clock) - lastObservedAt <= 1500 ? current?.identity : undefined,
      getEntities: () => current?.entities ?? [],
      getRegions: () => current?.regions ?? [],
      // No generic applyAdminCommand: no second command authority or invented quest handler.
    },
  });
  const unsubscribe = recorder.observeCommittedTicks(entry => {
    if (entry.receipt.zoneId !== zoneId) return;
    try {
      const previousReceipt = lastProjectedReceipt ?? recorder.getReceipt(zoneId, entry.receipt.tick - 1);
      current = projectCommittedTick(entry, { ...observation, previousReceipt });
      lastProjectedReceipt = structuredClone(entry.receipt);
    }
    catch (error) { current = undefined; feed.invalidate(); throw error; }
    lastObservedAt = operationalNow(clock); // Observer freshness only; never state/receipts.
    feed.onTick(current.identity.tick);
  });
  try {
    const actualPort = await feed.ready;
    return { port: actualPort, close: async () => { unsubscribe(); await feed.close(); } };
  } catch (error) {
    unsubscribe();
    await feed.close();
    throw error;
  }
}
