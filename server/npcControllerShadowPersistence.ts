import { eq } from "drizzle-orm";
import { z } from "zod";
import { aurionNpcActionReceipts, aurionNpcActionEffectReadbacks, aurionNpcControllerShadowReceipts } from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { buildPlannerContext } from "../shared/npcUtilityPlannerDebug";
import { evaluateBehavior } from "./aiFabric/behaviorForge";
import { readBoundController, readNpcControllerBindingInTransaction } from "./npcArchetypePersistence";
import type { NpcTransaction } from "./wasdNpcEvolutionPersistence";
import { getDb } from "./db";
import { isConfirmedNpcDecision, type ConfirmedNpcDecision } from "./aurion/npc/multiMemory";
import type { MerchantActionReceipt } from "./aurion/npc/actionGateway";

function recoverable(error: unknown) {
  return error instanceof z.ZodError || error instanceof SyntaxError || error instanceof Error && error.message.startsWith("NPC_");
}

/** Diagnostic sidecar only, appended AFTER the real action effect/readback. A
 * matching proposal is not execution authorization; a mismatch cannot rewrite
 * canonical actions, targets, inventory or quest state. No external calls.
 */
export async function appendNpcControllerShadowReceipt(tx: NpcTransaction, confirmed: ConfirmedNpcDecision, receipt: MerchantActionReceipt) {
  if (!isConfirmedNpcDecision(confirmed) || confirmed.snapshot.npcId !== receipt.npcId || confirmed.receiptId !== receipt.sourceDecision.receiptId) throw Error("NPC_SHADOW_SOURCE_MISMATCH");
  let bindingHash: string | null = null;
  let artifactHash: string | null = null;
  let proposal: ReturnType<typeof evaluateBehavior>["proposal"] = null;
  let comparisonHash: string | null = null;
  let reason = "NO_BOUND_CONTROLLER";
  let bindingExists = false;
  try {
    const bound = await readBoundController(tx, receipt.npcId);
    if (!bound.binding) return null; // old NPC: never bind or migrate on read
    bindingExists = true;
    bindingHash = bound.binding.bindingHash;
    if (bound.candidate) {
      const snapshot = confirmed.snapshot;
      const derived = buildPlannerContext({ npcId: snapshot.npcId, regionId: snapshot.regionId, resolutionIndex: snapshot.decision.resolutionIndex, goal: snapshot.decision.goal, needs: snapshot.needs });
      const economy = snapshot.lifeState.economy;
      const comparison = evaluateBehavior(bound.candidate.artifact, {
        ...derived, sourceReceiptId: confirmed.receiptId,
        hungerBps: economy?.hungerBps ?? derived.hungerBps, fatigueBps: economy?.fatigueBps ?? derived.fatigueBps,
        candidates: derived.candidates.map(candidate => ({ ...candidate, sourceReceiptId: confirmed.receiptId })),
      });
      proposal = comparison.proposal;
      comparisonHash = comparison.comparisonHash;
      artifactHash = comparison.controllerHash;
      reason = proposal ? "SHADOW_COMPARISON_ONLY" : "NO_ELIGIBLE_OFFER";
    } else reason = bound.binding.reason;
  } catch (error) {
    if (!recoverable(error)) throw error;
    bindingExists = true;
    reason = "CONTROLLER_VERIFICATION_FAILED";
  }
  if (!bindingExists) return null;
  const payload = {
    schemaVersion: "aurion.npc-controller-shadow-receipt.v1" as const,
    execution: "shadow" as const, mutationAuthority: "none" as const,
    npcId: receipt.npcId, bindingHash, artifactHash, comparisonHash,
    sourceDecisionReceiptId: confirmed.receiptId, sourceDecisionSha256: confirmed.receiptSha256,
    canonicalActionReceiptId: receipt.id, canonicalActionReceiptHash: receipt.receiptHash,
    canonicalAction: receipt.action, worldSeedSha256: receipt.worldSeedSha256,
    expectedEpoch: receipt.expectedEpoch, resolutionIndex: receipt.resolutionIndex,
    // The merchant contract has a resolution index, not a verified zone-tick/chunk identity.
    tickChunkBinding: "UNAVAILABLE_AUTHORITATIVE_ADMISSION_BLOCKED" as const,
    proposal, proposalDisposition: !proposal ? "CANONICAL_FALLBACK" as const : proposal.action === receipt.action ? "MATCHES_CANONICAL_ACTION" as const : "REJECTED_CANONICAL_ACTION_MISMATCH" as const,
    reason,
  };
  const receiptHash = canonicalSha256(payload);
  await tx.insert(aurionNpcControllerShadowReceipts).values({ actionReceiptId: receipt.id, npcId: receipt.npcId, receiptHash, payloadJson: JSON.stringify(payload) });
  return { ...payload, receiptHash };
}

/** Independent persisted readback, cross-checked against the actual gateway
 * receipt and effect-readback. Never reconstructs a missing historical sidecar.
 */
export async function readNpcControllerShadowReceipt(actionReceiptId: string) {
  const db = await getDb(); if (!db) throw Error("NPC_DATABASE_REQUIRED");
  return db.transaction(async tx => {
    const row = (await tx.select().from(aurionNpcControllerShadowReceipts).where(eq(aurionNpcControllerShadowReceipts.actionReceiptId, actionReceiptId)).limit(1))[0];
    if (!row) return null;
    const payload = JSON.parse(row.payloadJson) as Awaited<ReturnType<typeof appendNpcControllerShadowReceipt>>;
    const action = (await tx.select().from(aurionNpcActionReceipts).where(eq(aurionNpcActionReceipts.id, actionReceiptId)).limit(1))[0];
    const effect = (await tx.select().from(aurionNpcActionEffectReadbacks).where(eq(aurionNpcActionEffectReadbacks.actionReceiptId, actionReceiptId)).limit(1))[0];
    if (!payload || canonicalSha256(payload) !== row.receiptHash || payload.canonicalActionReceiptId !== actionReceiptId || payload.npcId !== row.npcId || !action || !effect || action.npcId !== row.npcId || action.receiptHash !== payload.canonicalActionReceiptHash || action.sourceDecisionReceiptId !== payload.sourceDecisionReceiptId || action.sourceDecisionSha256 !== payload.sourceDecisionSha256 || effect.effectsHash !== action.effectsHash) throw Error("NPC_SHADOW_READBACK_MISMATCH");
    if (payload.bindingHash) {
      const binding = await readNpcControllerBindingInTransaction(tx, row.npcId);
      if (binding?.bindingHash !== payload.bindingHash) throw Error("NPC_SHADOW_BINDING_MISMATCH");
    }
    return { ...payload, receiptHash: row.receiptHash };
  });
}
