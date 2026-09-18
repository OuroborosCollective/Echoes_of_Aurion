import type { CanonicalZoneState } from "./zoneCanonicalState";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { orderCanonicalZoneIntents, hashCanonicalIntents } from "../../shared/aurionZoneIntentContract";
import {
  AURION_CAUSAL_TICK_SCHEMA_V2,
  type AurionCausalStageReceipt,
  type AurionCausalTickReceipt,
} from "../../shared/aurionCausalTickContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  replayFirstDivergence,
  replayMatch,
  replayUnprovable,
  type ReplayVerdict,
  type ReplayVerdictContext,
} from "../../shared/aurionReplayContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";

export interface ReplayInput {
  preState: CanonicalZoneState;
  intents: AurionZoneIntent[];
  expectedReceipt: AurionCausalTickReceipt;
}

function contextFor(receipt: AurionCausalTickReceipt): ReplayVerdictContext {
  return {
    domain: "ZONE_TICK",
    sourceRevision: receipt.sourceRevision,
    rulesetVersion: receipt.rulesetVersion,
    scopeIdentity: { worldId: receipt.worldId, zoneId: receipt.zoneId },
    range: { fromTick: receipt.tick, toTick: receipt.tick },
  };
}

function stageHash(stage: AurionCausalStageReceipt): string {
  return canonicalSha256({
    stageName: stage.stageName,
    stageOrdinal: stage.stageOrdinal,
    stageInputIdentity: stage.stageInputIdentity,
    canonicalStateHash: stage.canonicalStateHash,
    transitionHash: stage.transitionHash,
  });
}

function firstV2StageDivergence(
  context: ReplayVerdictContext,
  verified: string[],
  tick: number,
  expected: readonly AurionCausalStageReceipt[],
  observed: readonly AurionCausalStageReceipt[],
): ReplayVerdict | null {
  const count = Math.max(expected.length, observed.length);
  for (let index = 0; index < count; index += 1) {
    const expectedStage = expected[index];
    const observedStage = observed[index];
    const stageName = expectedStage?.stageName ?? observedStage?.stageName ?? `AUTHORITY_STAGE_${index + 1}`;
    if (!expectedStage || !observedStage) {
      return replayFirstDivergence(context, verified, {
        stage: stageName,
        tick,
        expected: expectedStage ? stageHash(expectedStage) : "MISSING",
        observed: observedStage ? stageHash(observedStage) : "MISSING",
        diffDetails: `Authority stage set diverged at ordinal ${index + 1}`,
      });
    }

    const expectedHash = stageHash(expectedStage);
    const observedHash = stageHash(observedStage);
    if (expectedHash !== observedHash) {
      return replayFirstDivergence(context, verified, {
        stage: stageName,
        tick,
        expected: expectedHash,
        observed: observedHash,
        expectedHash,
        observedHash,
        diffDetails:
          `Authority stage ${stageName} diverged: ` +
          `input ${expectedStage.stageInputIdentity} vs ${observedStage.stageInputIdentity}; ` +
          `state ${expectedStage.canonicalStateHash} vs ${observedStage.canonicalStateHash}; ` +
          `transition ${expectedStage.transitionHash} vs ${observedStage.transitionHash}`,
      });
    }
    verified.push(`AUTHORITY:${stageName}`);
  }
  return null;
}

/**
 * Re-executes one tick without persistence, broadcasts or live-state mutation.
 *
 * v1 semantics stay frozen: PRE -> INPUT_ORDER -> POST -> RECEIPT are the only
 * observable stages. v2 additionally compares every authority phase in order
 * and returns immediately at the first divergent phase; projection/transport
 * is deliberately outside the receipt.
 */
export function replayZoneTick(input: ReplayInput): ReplayVerdict {
  const { preState, intents, expectedReceipt } = input;
  const tick = expectedReceipt.tick;
  const context = contextFor(expectedReceipt);
  const verified: string[] = [];

  if (preState.zoneId !== expectedReceipt.zoneId || preState.worldId !== expectedReceipt.worldId) {
    return replayUnprovable(context, verified, "REPLAY_SCOPE_MISMATCH", { tick });
  }
  if (preState.ruleset !== expectedReceipt.rulesetVersion) {
    return replayUnprovable(context, verified, `RULESET_MISMATCH:${preState.ruleset}:${expectedReceipt.rulesetVersion}`, { tick });
  }

  const computedPreStateHash = hashCanonicalZoneState(preState);
  if (computedPreStateHash !== expectedReceipt.preStateHash) {
    return replayFirstDivergence(context, verified, {
      stage: "PRE_STATE",
      tick,
      expected: expectedReceipt.preStateHash,
      observed: computedPreStateHash,
      expectedHash: expectedReceipt.preStateHash,
      observedHash: computedPreStateHash,
      diffDetails: `Pre-state hash mismatch. Expected ${expectedReceipt.preStateHash}, observed ${computedPreStateHash}`,
    });
  }
  verified.push("PRE_STATE");

  const orderedIntents = orderCanonicalZoneIntents(intents);
  const computedIntentHash = hashCanonicalIntents(orderedIntents);
  if (computedIntentHash !== expectedReceipt.orderedIntentHash) {
    return replayFirstDivergence(context, verified, {
      stage: "INPUT_ORDER",
      tick,
      expected: expectedReceipt.orderedIntentHash,
      observed: computedIntentHash,
      expectedHash: expectedReceipt.orderedIntentHash,
      observedHash: computedIntentHash,
      diffDetails: `Ordered intent hash mismatch. Expected ${expectedReceipt.orderedIntentHash}, observed ${computedIntentHash}`,
    });
  }
  verified.push("INPUT_ORDER");

  const zone = new AuthoritativeMovementZone(preState.zoneId as any);
  zone.isReplay = true;
  zone.sourceRevisionOverride = expectedReceipt.sourceRevision;
  zone.receiptSchemaOverride = expectedReceipt.schema;
  zone.restoreFromCanonicalState(preState, expectedReceipt.previousReceiptHash);
  for (const intent of orderedIntents) zone.enqueueIntent(intent);
  zone.tick();

  const replayReceipt = zone.getLatestReceipt();
  if (!replayReceipt) return replayUnprovable(context, verified, "REPLAY_RECEIPT_MISSING", { tick });

  if (expectedReceipt.schema === AURION_CAUSAL_TICK_SCHEMA_V2) {
    if (replayReceipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) {
      return replayUnprovable(context, verified, "REPLAY_V2_STAGE_EVIDENCE_MISSING", { tick });
    }
    const stageVerdict = firstV2StageDivergence(
      context,
      verified,
      tick,
      expectedReceipt.stages,
      replayReceipt.stages,
    );
    if (stageVerdict) return stageVerdict;
  }

  const postState = zone.getCanonicalZoneState();
  const computedPostStateHash = hashCanonicalZoneState(postState);
  if (computedPostStateHash !== expectedReceipt.postStateHash) {
    return replayFirstDivergence(context, verified, {
      stage: "POST_STATE",
      tick,
      expected: expectedReceipt.postStateHash,
      observed: computedPostStateHash,
      expectedHash: expectedReceipt.postStateHash,
      observedHash: computedPostStateHash,
      diffDetails: `Post-state hash divergence. Expected ${expectedReceipt.postStateHash}, observed ${computedPostStateHash}`,
    });
  }
  verified.push("POST_STATE");

  if (replayReceipt.receiptHash !== expectedReceipt.receiptHash) {
    return replayFirstDivergence(context, verified, {
      stage: "RECEIPT",
      tick,
      expected: expectedReceipt.receiptHash,
      observed: replayReceipt.receiptHash,
      expectedHash: expectedReceipt.receiptHash,
      observedHash: replayReceipt.receiptHash,
      diffDetails: `Receipt hash divergence. Expected ${expectedReceipt.receiptHash}, observed ${replayReceipt.receiptHash}`,
    });
  }
  verified.push("RECEIPT");

  return replayMatch(context, verified, {
    tick,
    preStateHash: computedPreStateHash,
    postStateHash: computedPostStateHash,
    receiptHash: replayReceipt.receiptHash,
    postState,
  });
}
