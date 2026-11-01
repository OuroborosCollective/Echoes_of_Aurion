import { computeReceiptHash, isSupportedAurionZoneRuleset } from "../../shared/aurionCausalTickContract";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import type { ZoneId } from "../zoneProtocol";
import {
  globalTickRecorder,
  type AurionTickRecorder,
  type CausalPersistenceAdapter,
} from "./tickRecorder";
import { hashCanonicalZoneState, type CanonicalZoneState } from "./zoneCanonicalState";
import { replayZoneTick } from "./replayZoneTick";

export type PersistedZoneRecoverySource = Pick<
  CausalPersistenceAdapter,
  "getLatestReceipt" | "getRecordedTick" | "getCheckpointAtOrBefore" | "getTicksInRange"
>;

type RecoveryErrorPrefix = "ZONE" | "PROBE_ZONE";

/**
 * Reconstructs an inactive zone from its verified MariaDB checkpoint and receipt
 * tail. The zone is returned off-registry so callers can activate only after
 * replay and presence-safety checks complete.
 */
export async function restorePersistedZoneHead(
  zoneId: string,
  persistence: PersistedZoneRecoverySource,
  recorder: AurionTickRecorder = globalTickRecorder,
  errorPrefix: RecoveryErrorPrefix = "ZONE",
): Promise<AuthoritativeMovementZone> {
  const zone = new AuthoritativeMovementZone(zoneId as ZoneId, recorder);
  const latest = await persistence.getLatestReceipt(zoneId);
  if (!latest) return zone;
  if (!Number.isSafeInteger(latest.tick) || latest.tick < 1
    || latest.worldId !== GLOBAL_WORLD_ID || latest.zoneId !== zoneId
    || computeReceiptHash(latest) !== latest.receiptHash) {
    throw new Error(`${errorPrefix}_HEAD_INVALID`);
  }

  const checkpoint = await persistence.getCheckpointAtOrBefore(zoneId, latest.tick);
  if (!checkpoint || checkpoint.worldId !== GLOBAL_WORLD_ID || checkpoint.zoneId !== zoneId
    || checkpoint.state.worldId !== GLOBAL_WORLD_ID || checkpoint.state.zoneId !== zoneId
    || checkpoint.state.tick !== checkpoint.tick
    || checkpoint.snapshotHash !== hashCanonicalZoneState(checkpoint.state)
    || latest.tick - checkpoint.tick > 350 || latest.tick < checkpoint.tick) {
    throw new Error(`${errorPrefix}_CHECKPOINT_INVALID`);
  }

  let state: CanonicalZoneState = checkpoint.state;
  let previousHash: string | null = null;
  if (checkpoint.tick > 0) {
    const anchor = await persistence.getRecordedTick(zoneId, checkpoint.tick);
    if (!anchor || anchor.receipt.tick !== checkpoint.tick
      || anchor.receipt.postStateHash !== checkpoint.snapshotHash
      || anchor.receipt.worldId !== GLOBAL_WORLD_ID || anchor.receipt.zoneId !== zoneId
      || computeReceiptHash(anchor.receipt) !== anchor.receipt.receiptHash) {
      throw new Error(`${errorPrefix}_CHECKPOINT_ANCHOR_INVALID`);
    }
    previousHash = anchor.receipt.receiptHash;
  }

  const tail = await persistence.getTicksInRange(zoneId, checkpoint.tick + 1, latest.tick);
  if (tail.length !== latest.tick - checkpoint.tick) throw new Error(`${errorPrefix}_RECEIPT_GAP`);
  for (const entry of tail) {
    if (!entry.intents || entry.receipt.tick !== state.tick + 1
      || entry.receipt.previousReceiptHash !== previousHash
      || computeReceiptHash(entry.receipt) !== entry.receipt.receiptHash
      || entry.receipt.worldId !== GLOBAL_WORLD_ID || entry.receipt.zoneId !== zoneId) {
      throw new Error(`${errorPrefix}_RECEIPT_GAP`);
    }
    const result = replayZoneTick({ preState: state, intents: entry.intents, expectedReceipt: entry.receipt });
    if (result.status !== "MATCH" || !result.postState) throw new Error(`${errorPrefix}_REPLAY_FAILED`);
    state = result.postState as CanonicalZoneState;
    previousHash = entry.receipt.receiptHash;
  }

  // A verified historical head retains the ruleset already supported by
  // restoreFromCanonicalState; the live default is not a migration command.
  if (previousHash !== latest.receiptHash || state.tick !== latest.tick
    || state.ruleset !== latest.rulesetVersion || !isSupportedAurionZoneRuleset(state.ruleset)) {
    throw new Error(`${errorPrefix}_HEAD_INVALID`);
  }
  if (state.players.length) throw new Error(`${errorPrefix}_PRESENCE_RECOVERY_REQUIRED`);
  zone.restorePersistedHead(state, latest);
  return zone;
}
