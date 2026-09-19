import type { CanonicalZoneState } from "./zoneCanonicalState";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import {
  orderCanonicalZoneIntents,
  hashCanonicalIntents,
} from "../../shared/aurionZoneIntentContract";
import {
  type AurionCausalTickReceipt,
  computeReceiptHash,
} from "../../shared/aurionCausalTickContract";
import type { ReplayVerdict } from "../../shared/aurionReplayContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

export interface ReplayInput {
  preState: CanonicalZoneState;
  intents: AurionZoneIntent[];
  expectedReceipt: AurionCausalTickReceipt;
}

/**
 * Deterministically replays a single zone tick starting from a known PRE state
 * with recorded ordered intents, and verifies each phase against the expected receipt.
 */
export function replayZoneTick(input: ReplayInput): ReplayVerdict {
  const { preState, intents, expectedReceipt } = input;
  const tick = expectedReceipt.tick;

  // Stage 1: PRE_STATE verification
  const computedPreStateHash = hashCanonicalZoneState(preState);
  if (computedPreStateHash !== expectedReceipt.preStateHash) {
    return {
      status: "FIRST_DIVERGENCE",
      verdict: "FIRST_DIVERGENCE",
      stage: "PRE_STATE",
      expected: expectedReceipt.preStateHash,
      observed: computedPreStateHash,
      tick,
      expectedHash: expectedReceipt.preStateHash,
      observedHash: computedPreStateHash,
      diffDetails: `Pre-state hash mismatch. Expected ${expectedReceipt.preStateHash}, observed ${computedPreStateHash}`,
    };
  }

  // Stage 2: INPUT_ORDER verification
  const orderedIntents = orderCanonicalZoneIntents(intents);
  const computedIntentHash = hashCanonicalIntents(orderedIntents);
  if (computedIntentHash !== expectedReceipt.orderedIntentHash) {
    return {
      status: "FIRST_DIVERGENCE",
      verdict: "FIRST_DIVERGENCE",
      stage: "INPUT_ORDER",
      expected: expectedReceipt.orderedIntentHash,
      observed: computedIntentHash,
      tick,
      expectedHash: expectedReceipt.orderedIntentHash,
      observedHash: computedIntentHash,
      diffDetails: `Ordered intent hash mismatch. Expected ${expectedReceipt.orderedIntentHash}, observed ${computedIntentHash}`,
    };
  }

  // Pure simulation execution using AuthoritativeMovementZone instance initialized to preState
  const zone = new AuthoritativeMovementZone(preState.zoneId as any);
  zone.isReplay = true;
  zone.restoreFromCanonicalState(preState, expectedReceipt.previousReceiptHash);

  // Enqueue recorded intents in canonical order
  for (const intent of orderedIntents) {
    zone.enqueueIntent(intent);
  }

  // Advance simulation by 1 tick
  zone.tick();

  const postState = zone.getCanonicalZoneState();
  const computedPostStateHash = hashCanonicalZoneState(postState);

  if (computedPostStateHash !== expectedReceipt.postStateHash) {
    return {
      status: "FIRST_DIVERGENCE",
      verdict: "FIRST_DIVERGENCE",
      stage: "POST_STATE",
      expected: expectedReceipt.postStateHash,
      observed: computedPostStateHash,
      tick,
      expectedHash: expectedReceipt.postStateHash,
      observedHash: computedPostStateHash,
      diffDetails: `Post-state hash divergence. Expected ${expectedReceipt.postStateHash}, observed ${computedPostStateHash}`,
    };
  }

  const latestReceipt = zone.getLatestReceipt();
  if (!latestReceipt) {
    return {
      status: "UNPROVABLE",
      verdict: "UNPROVABLE",
      tick,
      reason: "No receipt generated during replay tick",
    };
  }

  if (latestReceipt.receiptHash !== expectedReceipt.receiptHash) {
    return {
      status: "FIRST_DIVERGENCE",
      verdict: "FIRST_DIVERGENCE",
      stage: "POST_STATE",
      expected: expectedReceipt.receiptHash,
      observed: latestReceipt.receiptHash,
      tick,
      expectedHash: expectedReceipt.receiptHash,
      observedHash: latestReceipt.receiptHash,
      diffDetails: `Receipt hash divergence. Expected ${expectedReceipt.receiptHash}, observed ${latestReceipt.receiptHash}`,
    };
  }

  return {
    status: "MATCH",
    verdict: "MATCH",
    stagesVerified: 8,
    tick,
    preStateHash: computedPreStateHash,
    postStateHash: computedPostStateHash,
    receiptHash: latestReceipt.receiptHash,
    postState: postState,
  };
}
