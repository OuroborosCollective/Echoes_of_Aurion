import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  advanceCrossZoneHandover,
  assertCrossZoneOwnerInvariant,
  authoritativeOwnersForHandover,
  computeTargetAcceptanceReceiptHash,
  prepareCrossZoneHandover,
  verifyCrossZoneHandover,
  type AurionCrossZoneHandoverV2,
} from "../../shared/aurionCrossZoneHandoverContract";

const WORLD = "echoes-of-aurion-global";
const SOURCE = "observatory_threshold";
const TARGET = "windhollow";
const sourceReceiptHash = canonicalSha256({ receipt: "source" });
const sourceStateHash = canonicalSha256({ state: "source" });

function prepared(targetZoneId = TARGET): AurionCrossZoneHandoverV2 {
  return prepareCrossZoneHandover({
    entityId: "player:23001",
    sourceWorldId: WORLD,
    sourceZoneId: SOURCE,
    sourceTick: 91,
    sourceReceiptHash,
    sourceStateHash,
    targetWorldId: WORLD,
    targetZoneId,
    payload: {
      schema: "aurion.transfer.payload.v1",
      entityId: "player:23001",
      kind: "player",
      data: { userId: 23001, position: { x: 1200, z: -400 } },
    },
  });
}

function accepted(): AurionCrossZoneHandoverV2 {
  const frozen = advanceCrossZoneHandover(prepared(), "SOURCE_FROZEN");
  const targetAcceptedTick = 144;
  const targetReceiptHash = computeTargetAcceptanceReceiptHash({
    transferId: frozen.transferId,
    entityId: frozen.entityId,
    sourceReceiptHash: frozen.sourceReceiptHash,
    payloadHash: frozen.payloadHash,
    targetWorldId: frozen.targetWorldId,
    targetZoneId: frozen.targetZoneId,
    targetAcceptedTick,
  });
  return advanceCrossZoneHandover(frozen, "TARGET_ACCEPTED", { targetAcceptedTick, targetReceiptHash });
}

describe("crossZoneSynchronizationService V2 contract", () => {
  it("keeps exactly one source owner through prepare, freeze and target reservation", () => {
    let receipt = prepared();
    for (const status of ["PREPARED", "SOURCE_FROZEN"] as const) {
      if (status !== "PREPARED") receipt = advanceCrossZoneHandover(receipt, status);
      expect(assertCrossZoneOwnerInvariant(receipt)).toEqual([`${WORLD}/${SOURCE}`]);
    }
    receipt = accepted();
    expect(authoritativeOwnersForHandover(receipt)).toEqual([`${WORLD}/${SOURCE}`]);
  });

  it("switches authority only after target acceptance and source finalization", () => {
    const targetAccepted = accepted();
    const finalized = advanceCrossZoneHandover(targetAccepted, "SOURCE_FINALIZED");
    const committed = advanceCrossZoneHandover(finalized, "COMMITTED");
    expect(authoritativeOwnersForHandover(targetAccepted)).toEqual([`${WORLD}/${SOURCE}`]);
    expect(authoritativeOwnersForHandover(finalized)).toEqual([`${WORLD}/${TARGET}`]);
    expect(authoritativeOwnersForHandover(committed)).toEqual([`${WORLD}/${TARGET}`]);
    expect(verifyCrossZoneHandover(committed)).toBe(true);
  });

  it("cryptographically chains every handover transition", () => {
    const first = prepared();
    const frozen = advanceCrossZoneHandover(first, "SOURCE_FROZEN");
    const targetAccepted = accepted();
    const finalized = advanceCrossZoneHandover(targetAccepted, "SOURCE_FINALIZED");
    const committed = advanceCrossZoneHandover(finalized, "COMMITTED");
    expect(first.previousTransferReceiptHash).toBeNull();
    expect(frozen.previousTransferReceiptHash).toBe(first.transferReceiptHash);
    expect(targetAccepted.previousTransferReceiptHash).toBe(frozen.transferReceiptHash);
    expect(finalized.previousTransferReceiptHash).toBe(targetAccepted.transferReceiptHash);
    expect(committed.previousTransferReceiptHash).toBe(finalized.transferReceiptHash);
  });

  it("gives concurrent target attempts distinct deterministic transfer identities", () => {
    const first = prepared("windhollow");
    const second = prepared("emberfall");
    expect(first.transferId).not.toBe(second.transferId);
    expect(prepared("windhollow").transferId).toBe(first.transferId);
  });

  it("makes duplicate target acceptance idempotent and conflicting duplicates fail closed", () => {
    const receipt = accepted();
    const same = advanceCrossZoneHandover(receipt, "TARGET_ACCEPTED", {
      targetAcceptedTick: receipt.targetAcceptedTick!,
      targetReceiptHash: receipt.targetReceiptHash!,
    });
    expect(same).toBe(receipt);
    expect(() => advanceCrossZoneHandover(receipt, "TARGET_ACCEPTED", {
      targetAcceptedTick: receipt.targetAcceptedTick! + 1,
      targetReceiptHash: canonicalSha256({ wrong: true }),
    })).toThrow("CROSS_ZONE_DUPLICATE_ACCEPT_CONFLICT");
  });

  it("forbids finalize before a receipt-bound target acceptance", () => {
    const frozen = advanceCrossZoneHandover(prepared(), "SOURCE_FROZEN");
    expect(() => advanceCrossZoneHandover(frozen, "SOURCE_FINALIZED")).toThrow("CROSS_ZONE_TRANSITION_INVALID");
  });

  it("rejects tampered payload, transfer identity and target acceptance", () => {
    const receipt = prepared();
    expect(verifyCrossZoneHandover({
      ...receipt,
      payload: { ...receipt.payload, data: { tampered: true } },
    })).toBe(false);
    expect(verifyCrossZoneHandover({
      ...receipt,
      transferId: receipt.transferId.replace(/^xfer2_./, "xfer2_f"),
    })).toBe(false);

    const targetAccepted = accepted();
    expect(verifyCrossZoneHandover({
      ...targetAccepted,
      targetReceiptHash: canonicalSha256({ forged: true }),
    })).toBe(false);
  });

  it("keeps rejected, expired and unprovable transfers owned by the source", () => {
    for (const terminal of ["REJECTED", "EXPIRED", "UNPROVABLE"] as const) {
      const receipt = advanceCrossZoneHandover(prepared(), terminal);
      expect(authoritativeOwnersForHandover(receipt)).toEqual([`${WORLD}/${SOURCE}`]);
    }
  });
});
