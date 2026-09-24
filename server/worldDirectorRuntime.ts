import {
  buildWorldPressureField,
  deriveWorldDirectorCandidates,
  decideWorldDirectors,
  type WorldDirectorDecision,
} from "../shared/worldPressureProtocol";
import type { GlobalWorldPlan } from "./globalWorldProtocol";
import type { AurionCausalTickReceipt } from "../shared/aurionCausalTickContract";
import { readLatestWorldDirectorReceipt, persistWorldDirectorDecision } from "./worldDirectorPersistence";

export async function resolveAndRecordWorldDirector(input: {
  causalReceipt: AurionCausalTickReceipt;
  worldPlan: GlobalWorldPlan;
  zoneId: string;
  seedDigest: string;
  sourceRootHash?: string;
  maxIntents?: number;
}): Promise<{ decision: WorldDirectorDecision; source: "created" | "persisted" }> {
  if (input.causalReceipt.worldId !== "echoes-of-aurion-global") throw new Error("WORLD_DIRECTOR_WORLD_ID_MISMATCH");
  if (!/^[a-f0-9]{40}$/.test(input.causalReceipt.sourceRevision)) throw new Error("WORLD_DIRECTOR_SOURCE_REVISION_INVALID");
  if (input.worldPlan.epoch !== input.causalReceipt.tick) throw new Error("WORLD_DIRECTOR_EPOCH_TICK_MISMATCH");

  const sourceRootHash = input.sourceRootHash ?? input.worldPlan.deterministicHash;
  const field = buildWorldPressureField({
    worldPlan: input.worldPlan,
    worldRevision: input.causalReceipt.sourceRevision,
    logicalTick: input.causalReceipt.tick,
    sourceRootHash,
  });
  const candidates = deriveWorldDirectorCandidates(field, input.worldPlan);
  const previous = await readLatestWorldDirectorReceipt(field.worldId, input.zoneId);
  const previousReceiptHash = previous?.receiptHash ?? null;
  const decision = decideWorldDirectors({
    field,
    candidates,
    causalReceiptHash: input.causalReceipt.receiptHash,
    seedDigest: input.seedDigest,
    previousReceiptHash,
    maxIntents: input.maxIntents,
  });

  if (previous && previous.logicalTick === decision.logicalTick) {
    if (previous.decisionHash !== decision.decisionHash || previous.causalReceiptHash !== decision.causalReceiptHash) {
      throw new Error("WORLD_DIRECTOR_REPLAY_CONFLICT");
    }
    return { decision, source: "persisted" };
  }

  const persisted = await persistWorldDirectorDecision({
    decision,
    zoneId: input.zoneId,
  });
  if (
    persisted.decisionHash !== decision.decisionHash ||
    persisted.sourceRevision !== input.causalReceipt.sourceRevision ||
    persisted.causalReceiptHash !== input.causalReceipt.receiptHash
  ) throw new Error("WORLD_DIRECTOR_READBACK_CONFLICT");

  return { decision, source: "created" };
}
