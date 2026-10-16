import { AURION_ZONE_RULESET_VERSION, computeReceiptHash } from "../shared/aurionCausalTickContract";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { AuthoritativeMovementZone, type ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder, globalTickRecorder, type CausalPersistenceAdapter } from "./causality/tickRecorder";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { replayZoneTick } from "./causality/replayZoneTick";
import type { CanonicalZoneState } from "./causality/zoneCanonicalState";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "../shared/aurionProductionProbeEvidence";

type ProbePersistence = Pick<CausalPersistenceAdapter, "getLatestReceipt" | "getRecordedTick" | "getCheckpointAtOrBefore" | "getTicksInRange">;

/** Read-only preparation. No registry activation or gameplay mutation before approval consumption. */
export async function prepareProductionProbeZone(registry: ZoneRegistry, persistence: ProbePersistence, recorder: AurionTickRecorder = globalTickRecorder) {
  const zoneId = "observatory_threshold";
  const active = registry.find(zoneId);
  if (active) {
    if (active.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)
      || active.getPendingIntents().some(intent => intent.entityId === `player:${AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID}`)) {
      throw new Error("PROBE_ZONE_CLEANUP_REQUIRED");
    }
    const head = active.getLatestReceipt();
    await active.flushEvidencePersistence();
    const persisted = head ? (await persistence.getRecordedTick(zoneId, head.tick))?.receipt : await persistence.getLatestReceipt(zoneId);
    if (head ? persisted?.receiptHash !== head.receiptHash : persisted !== null) throw new Error("PROBE_ACTIVE_ZONE_HEAD_UNVERIFIED");
    return { zone: active, needsActivation: false };
  }
  const latest = await persistence.getLatestReceipt(zoneId);
  const zone = new AuthoritativeMovementZone(zoneId, recorder);
  if (latest) {
    if (latest.worldId !== GLOBAL_WORLD_ID || latest.zoneId !== zoneId || computeReceiptHash(latest) !== latest.receiptHash) throw new Error("PROBE_ZONE_HEAD_INVALID");
    const checkpoint = await persistence.getCheckpointAtOrBefore(zoneId, latest.tick);
    if (!checkpoint || checkpoint.worldId !== GLOBAL_WORLD_ID || checkpoint.zoneId !== zoneId
      || checkpoint.state.tick !== checkpoint.tick || checkpoint.state.zoneId !== zoneId
      || checkpoint.snapshotHash !== hashCanonicalZoneState(checkpoint.state)
      || latest.tick - checkpoint.tick > 350 || latest.tick < checkpoint.tick) throw new Error("PROBE_ZONE_CHECKPOINT_INVALID");
    let state: CanonicalZoneState = checkpoint.state;
    let previousHash: string | null = null;
    if (checkpoint.tick > 0) {
      const anchor = await persistence.getRecordedTick(zoneId, checkpoint.tick);
      if (!anchor || anchor.receipt.postStateHash !== checkpoint.snapshotHash
        || anchor.receipt.worldId !== GLOBAL_WORLD_ID || anchor.receipt.zoneId !== zoneId
        || computeReceiptHash(anchor.receipt) !== anchor.receipt.receiptHash) throw new Error("PROBE_ZONE_CHECKPOINT_ANCHOR_INVALID");
      previousHash = anchor.receipt.receiptHash;
    }
    const tail = await persistence.getTicksInRange(zoneId, checkpoint.tick + 1, latest.tick);
    if (tail.length !== latest.tick - checkpoint.tick) throw new Error("PROBE_ZONE_RECEIPT_GAP");
    for (const entry of tail) {
      if (!entry.intents || entry.receipt.tick !== state.tick + 1 || entry.receipt.previousReceiptHash !== previousHash
        || computeReceiptHash(entry.receipt) !== entry.receipt.receiptHash
        || entry.receipt.worldId !== GLOBAL_WORLD_ID || entry.receipt.zoneId !== zoneId) throw new Error("PROBE_ZONE_RECEIPT_GAP");
      const result = replayZoneTick({ preState: state, intents: entry.intents, expectedReceipt: entry.receipt });
      if (result.status !== "MATCH" || !result.postState) throw new Error("PROBE_ZONE_REPLAY_FAILED");
      state = result.postState as CanonicalZoneState;
      previousHash = entry.receipt.receiptHash;
    }
    if (previousHash !== latest.receiptHash || state.ruleset !== AURION_ZONE_RULESET_VERSION) throw new Error("PROBE_ZONE_HEAD_INVALID");
    // Recovery of interrupted player sessions is an operations task, never an
    // implicit effect of a diagnostic approval (including a stranded old probe).
    if (state.players.length) throw new Error("PROBE_ZONE_PRESENCE_RECOVERY_REQUIRED");
    zone.restorePersistedHead(state, latest);
  }
  return { zone, needsActivation: true };
}
