import type { CanonicalZoneState } from "./zoneCanonicalState";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { orderCanonicalZoneIntents, hashCanonicalIntents } from "../../shared/aurionZoneIntentContract";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import type { ReplayVerdict } from "../../shared/aurionReplayContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";

export interface ReplayInput {
  preState: CanonicalZoneState;
  intents: AurionZoneIntent[];
  expectedReceipt: AurionCausalTickReceipt;
}

/**
 * Re-executes one tick without persistence, broadcasts or live-state mutation.
 * Receipt v1 proves PRE, canonical INPUT_ORDER, resulting POST and the receipt
 * identity. Intermediate per-phase hashes are not present in v1 and therefore
 * remain UNOBSERVABLE rather than being reported as verified.
 */
export function replayZoneTick(input: ReplayInput): ReplayVerdict {
  const { preState, intents, expectedReceipt } = input;
  const tick = expectedReceipt.tick;

  if (preState.zoneId !== expectedReceipt.zoneId || preState.worldId !== expectedReceipt.worldId) {
    return { status: "UNPROVABLE", verdict: "UNPROVABLE", tick, reason: "REPLAY_SCOPE_MISMATCH" };
  }
  if (preState.ruleset !== expectedReceipt.rulesetVersion) {
    return { status: "UNPROVABLE", verdict: "UNPROVABLE", tick, reason: `RULESET_MISMATCH:${preState.ruleset}:${expectedReceipt.rulesetVersion}` };
  }

  const computedPreStateHash = hashCanonicalZoneState(preState);
  if (computedPreStateHash !== expectedReceipt.preStateHash) {
    return {
      status: "FIRST_DIVERGENCE", verdict: "FIRST_DIVERGENCE", stage: "PRE_STATE", tick,
      expected: expectedReceipt.preStateHash, observed: computedPreStateHash,
      expectedHash: expectedReceipt.preStateHash, observedHash: computedPreStateHash,
      diffDetails: `Pre-state hash mismatch. Expected ${expectedReceipt.preStateHash}, observed ${computedPreStateHash}`,
    };
  }

  const orderedIntents = orderCanonicalZoneIntents(intents);
  const computedIntentHash = hashCanonicalIntents(orderedIntents);
  if (computedIntentHash !== expectedReceipt.orderedIntentHash) {
    return {
      status: "FIRST_DIVERGENCE", verdict: "FIRST_DIVERGENCE", stage: "INPUT_ORDER", tick,
      expected: expectedReceipt.orderedIntentHash, observed: computedIntentHash,
      expectedHash: expectedReceipt.orderedIntentHash, observedHash: computedIntentHash,
      diffDetails: `Ordered intent hash mismatch. Expected ${expectedReceipt.orderedIntentHash}, observed ${computedIntentHash}`,
    };
  }

  const zone = new AuthoritativeMovementZone(preState.zoneId as any);
  zone.isReplay = true;
  zone.sourceRevisionOverride = expectedReceipt.sourceRevision;
  zone.restoreFromCanonicalState(preState, expectedReceipt.previousReceiptHash);
  for (const intent of orderedIntents) zone.enqueueIntent(intent);
  zone.tick();

  const postState = zone.getCanonicalZoneState();
  const computedPostStateHash = hashCanonicalZoneState(postState);
  if (computedPostStateHash !== expectedReceipt.postStateHash) {
    return {
      status: "FIRST_DIVERGENCE", verdict: "FIRST_DIVERGENCE", stage: "POST_STATE", tick,
      expected: expectedReceipt.postStateHash, observed: computedPostStateHash,
      expectedHash: expectedReceipt.postStateHash, observedHash: computedPostStateHash,
      diffDetails: `Post-state hash divergence. Expected ${expectedReceipt.postStateHash}, observed ${computedPostStateHash}`,
    };
  }

  const replayReceipt = zone.getLatestReceipt();
  if (!replayReceipt) return { status: "UNPROVABLE", verdict: "UNPROVABLE", tick, reason: "REPLAY_RECEIPT_MISSING" };
  if (replayReceipt.receiptHash !== expectedReceipt.receiptHash) {
    return {
      status: "FIRST_DIVERGENCE", verdict: "FIRST_DIVERGENCE", stage: "RECEIPT", tick,
      expected: expectedReceipt.receiptHash, observed: replayReceipt.receiptHash,
      expectedHash: expectedReceipt.receiptHash, observedHash: replayReceipt.receiptHash,
      diffDetails: `Receipt hash divergence. Expected ${expectedReceipt.receiptHash}, observed ${replayReceipt.receiptHash}`,
    };
  }

  return {
    status: "MATCH",
    verdict: "MATCH",
    stagesVerified: 4,
    tick,
    preStateHash: computedPreStateHash,
    postStateHash: computedPostStateHash,
    receiptHash: replayReceipt.receiptHash,
    postState,
  };
}
