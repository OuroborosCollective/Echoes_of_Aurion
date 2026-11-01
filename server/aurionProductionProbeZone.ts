import type { ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder, globalTickRecorder } from "./causality/tickRecorder";
import { restorePersistedZoneHead, type PersistedZoneRecoverySource } from "./causality/persistedZoneRecovery";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "../shared/aurionProductionProbeEvidence";

type ProbePersistence = PersistedZoneRecoverySource;

/** Read-only preparation. No registry activation or gameplay mutation before approval consumption. */
export async function prepareProductionProbeZone(
  registry: ZoneRegistry,
  persistence: ProbePersistence,
  recorder: AurionTickRecorder = globalTickRecorder,
) {
  const zoneId = "observatory_threshold";
  const active = registry.find(zoneId);
  if (active) {
    if (active.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)
      || active.getPendingIntents().some(intent => intent.entityId === `player:${AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID}`)) {
      throw new Error("PROBE_ZONE_CLEANUP_REQUIRED");
    }
    const head = active.getLatestReceipt();
    await active.flushEvidencePersistence();
    const persisted = head
      ? (await persistence.getRecordedTick(zoneId, head.tick))?.receipt
      : await persistence.getLatestReceipt(zoneId);
    if (head ? persisted?.receiptHash !== head.receiptHash : persisted !== null) {
      throw new Error("PROBE_ACTIVE_ZONE_HEAD_UNVERIFIED");
    }
    return { zone: active, needsActivation: false };
  }

  const zone = await restorePersistedZoneHead(zoneId, persistence, recorder, "PROBE_ZONE");
  return { zone, needsActivation: true };
}
