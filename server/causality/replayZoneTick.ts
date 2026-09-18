import type { CanonicalZoneState } from "./zoneCanonicalState";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { orderCanonicalZoneIntents, hashCanonicalIntents } from "../../shared/aurionZoneIntentContract";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
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

/**
 * Re-executes one tick without persistence, broadcasts or live-state mutation.
 * Receipt v1 proves PRE, canonical INPUT_ORDER, resulting POST and the receipt
 * identity. Intermediate per-phase hashes are not present in v1 and therefore
 * remain unverified rather than being reported as verified.
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
  zone.restoreFromCanonicalState(preState, expectedReceipt.previousReceiptHash);
  for (const intent of orderedIntents) zone.enqueueIntent(intent);
  zone.tick();

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

  const replayReceipt = zone.getLatestReceipt();
  if (!replayReceipt) return replayUnprovable(context, verified, "REPLAY_RECEIPT_MISSING", { tick });
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
