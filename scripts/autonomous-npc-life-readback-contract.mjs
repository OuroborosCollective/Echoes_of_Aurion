function resolutionIndex(value, code) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function receiptEnvelope(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("NPC_LIFE_STATE_ADVANCE_RECEIPT_INVALID");
  }
}

/**
 * Verifies a health/readback snapshot against the mutable latest NPC state row.
 * The latest row may legitimately advance after the health snapshot was read.
 * Such advancement is accepted only when it is monotone and independently
 * bound to its own immutable decision receipt.
 */
export function verifyAutonomousNpcStateReadback({ snapshot, stateRow, latestDecisionReceipt = null }) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("NPC_LIFE_STATE_SNAPSHOT_INVALID");
  if (!stateRow || typeof stateRow !== "object" || stateRow.npcId !== snapshot.npcId) throw new Error("NPC_LIFE_STATE_ROW_MISMATCH");

  const snapshotResolutionIndex = resolutionIndex(snapshot.lastResolutionIndex, "NPC_LIFE_STATE_SNAPSHOT_INDEX_INVALID");
  const latestResolutionIndex = resolutionIndex(stateRow.lastResolutionIndex, "NPC_LIFE_STATE_ROW_INDEX_INVALID");
  if (latestResolutionIndex < snapshotResolutionIndex) throw new Error("NPC_LIFE_STATE_ROW_REGRESSION");

  if (latestResolutionIndex === snapshotResolutionIndex) {
    if (stateRow.regionId !== snapshot.currentHubId) throw new Error("NPC_LIFE_STATE_ROW_MISMATCH");
    return Object.freeze({ mode: "exact", snapshotResolutionIndex, latestResolutionIndex });
  }

  if (!latestDecisionReceipt || typeof latestDecisionReceipt !== "object") throw new Error("NPC_LIFE_STATE_ADVANCE_RECEIPT_REQUIRED");
  const receiptResolutionIndex = resolutionIndex(latestDecisionReceipt.resolutionIndex, "NPC_LIFE_STATE_ADVANCE_RECEIPT_INVALID");
  const envelope = receiptEnvelope(latestDecisionReceipt.observationIdsJson);
  if (
    latestDecisionReceipt.npcId !== snapshot.npcId
    || latestDecisionReceipt.regionId !== stateRow.regionId
    || receiptResolutionIndex !== latestResolutionIndex
    || envelope.version !== "aurion-npc-decision.v3"
    || envelope.snapshot?.npcId !== snapshot.npcId
    || envelope.snapshot?.regionId !== stateRow.regionId
    || envelope.snapshot?.decision?.resolutionIndex !== latestResolutionIndex
    || latestDecisionReceipt.decisionHash !== envelope.snapshot?.decision?.decisionHash
    || envelope.snapshot?.lifeState?.economy?.currentHubId !== stateRow.regionId
  ) throw new Error("NPC_LIFE_STATE_ADVANCE_RECEIPT_MISMATCH");

  return Object.freeze({ mode: "advanced", snapshotResolutionIndex, latestResolutionIndex });
}
