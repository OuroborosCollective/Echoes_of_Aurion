import {
  buildWorldPressureField,
  deriveWorldDirectorCandidates,
  decideWorldDirectors,
  type WorldDirectorDecision,
} from "../shared/worldPressureProtocol";
import type { GlobalWorldPlan } from "./globalWorldProtocol";
import type { AurionCausalTickReceipt } from "../shared/aurionCausalTickContract";
import { readLatestWorldDirectorReceipt, readWorldDirectorReceiptAt, persistWorldDirectorDecision } from "./worldDirectorPersistence";

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

  const canonicalSourceRootHash = input.causalReceipt.postStateHash;
  if (input.sourceRootHash !== undefined && input.sourceRootHash !== canonicalSourceRootHash) {
    throw new Error("WORLD_DIRECTOR_SOURCE_ROOT_CONFLICT");
  }
  const field = buildWorldPressureField({

    worldPlan: input.worldPlan,
    worldRevision: input.causalReceipt.sourceRevision,
    logicalTick: input.causalReceipt.tick,
    sourceRootHash: canonicalSourceRootHash,
  });
  const existing = await readWorldDirectorReceiptAt(field.worldId, input.zoneId, field.logicalTick);
  const previous = await readLatestWorldDirectorReceipt(field.worldId, input.zoneId, field.logicalTick);
  const previousReceiptHash = previous?.receiptHash ?? null;
  const decision = decideWorldDirectors({
    field,
    candidates,
    causalReceiptHash: input.causalReceipt.receiptHash,
    seedDigest: input.seedDigest,
    previousReceiptHash,
    maxIntents: input.maxIntents,
  });

  if (existing) {
    if (
      existing.decisionHash !== decision.decisionHash ||
      existing.causalReceiptHash !== decision.causalReceiptHash ||
      existing.sourceRevision !== decision.sourceRevision ||
      existing.sourceRootHash !== decision.sourceRootHash
    ) {
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
