import assert from "node:assert/strict";
import test from "node:test";
import { verifyAutonomousNpcStateReadback } from "./autonomous-npc-life-readback-contract.mjs";

const snapshot = Object.freeze({
  npcId: "ax1_merchant_observatory_threshold",
  currentHubId: "observatory_threshold",
  lastResolutionIndex: 4,
});

function receipt({ index = 5, regionId = "market_crossing", decisionHash = "d".repeat(64) } = {}) {
  return {
    npcId: snapshot.npcId,
    regionId,
    resolutionIndex: index,
    decisionHash,
    observationIdsJson: JSON.stringify({
      version: "aurion-npc-decision.v3",
      snapshot: {
        npcId: snapshot.npcId,
        regionId,
        decision: { resolutionIndex: index, decisionHash },
        lifeState: { economy: { currentHubId: regionId } },
      },
    }),
  };
}

test("accepts the exact mutable row for the captured health snapshot", () => {
  assert.deepEqual(
    verifyAutonomousNpcStateReadback({
      snapshot,
      stateRow: { npcId: snapshot.npcId, regionId: snapshot.currentHubId, lastResolutionIndex: 4 },
    }),
    { mode: "exact", snapshotResolutionIndex: 4, latestResolutionIndex: 4 },
  );
});

test("accepts monotone autonomous advancement only with the later immutable receipt", () => {
  assert.deepEqual(
    verifyAutonomousNpcStateReadback({
      snapshot,
      stateRow: { npcId: snapshot.npcId, regionId: "market_crossing", lastResolutionIndex: 5 },
      latestDecisionReceipt: receipt(),
    }),
    { mode: "advanced", snapshotResolutionIndex: 4, latestResolutionIndex: 5 },
  );
});

test("rejects a mutable row older than the captured health snapshot", () => {
  assert.throws(
    () => verifyAutonomousNpcStateReadback({
      snapshot,
      stateRow: { npcId: snapshot.npcId, regionId: snapshot.currentHubId, lastResolutionIndex: 3 },
    }),
    /NPC_LIFE_STATE_ROW_REGRESSION/,
  );
});

test("rejects autonomous advancement without a receipt for the observed latest row", () => {
  assert.throws(
    () => verifyAutonomousNpcStateReadback({
      snapshot,
      stateRow: { npcId: snapshot.npcId, regionId: "market_crossing", lastResolutionIndex: 5 },
    }),
    /NPC_LIFE_STATE_ADVANCE_RECEIPT_REQUIRED/,
  );
});

test("rejects a forged or mismatched receipt for the advanced row", () => {
  assert.throws(
    () => verifyAutonomousNpcStateReadback({
      snapshot,
      stateRow: { npcId: snapshot.npcId, regionId: "market_crossing", lastResolutionIndex: 5 },
      latestDecisionReceipt: receipt({ regionId: "observatory_threshold" }),
    }),
    /NPC_LIFE_STATE_ADVANCE_RECEIPT_MISMATCH/,
  );
});
