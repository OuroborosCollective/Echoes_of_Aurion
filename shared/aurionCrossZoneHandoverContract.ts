import { canonicalSha256 } from "./aurionCanonicalHash";
export const AURION_CROSS_ZONE_HANDOVER_SCHEMA = "aurion.cross-zone-handover.v2" as const;
export const AURION_CROSS_ZONE_HANDOVER_STATES = [
  "PREPARED",
  "SOURCE_FROZEN",
  "TARGET_ACCEPTED",
  "SOURCE_FINALIZED",
  "COMMITTED",
  "REJECTED",
  "EXPIRED",
  "UNPROVABLE",
] as const;
export type AurionCrossZoneHandoverStatus = (typeof AURION_CROSS_ZONE_HANDOVER_STATES)[number];

export interface AurionCrossZonePayload {
  schema: "aurion.transfer.payload.v1";
  entityId: string;
  kind: "player" | "npc" | "item" | "projectile";
  data: unknown;
}

export interface AurionCrossZoneHandoverV2 {
  schema: typeof AURION_CROSS_ZONE_HANDOVER_SCHEMA;
  transferId: string;
  entityId: string;
  sourceWorldId: string;
  sourceZoneId: string;
  sourceTick: number;
  sourceReceiptHash: string;
  sourceStateHash: string;
  targetWorldId: string;
  targetZoneId: string;
  payload: AurionCrossZonePayload;
  payloadHash: string;
  targetAcceptedTick: number | null;
  targetReceiptHash: string | null;
  status: AurionCrossZoneHandoverStatus;
  previousTransferReceiptHash: string | null;
  transferReceiptHash: string;
}

const HASH = /^sha256:[a-f0-9]{64}$/;

function transferIdFor(input: {
  entityId: string;
  sourceWorldId: string;
  sourceZoneId: string;
  sourceTick: number;
  sourceReceiptHash: string;
  targetWorldId: string;
  targetZoneId: string;
}): string {
  const digest = canonicalSha256({
    schema: "aurion.cross-zone-transfer-id.v2",
    entityId: input.entityId,
    sourceWorldId: input.sourceWorldId,
    sourceZoneId: input.sourceZoneId,
    sourceTick: input.sourceTick,
    sourceReceiptHash: input.sourceReceiptHash,
    targetWorldId: input.targetWorldId,
    targetZoneId: input.targetZoneId,
  }).slice("sha256:".length);
  return `xfer2_${digest.slice(0, 56)}`;
}

function unsigned(receipt: Omit<AurionCrossZoneHandoverV2, "transferReceiptHash"> | AurionCrossZoneHandoverV2) {
  return {
    schema: receipt.schema,
    transferId: receipt.transferId,
    entityId: receipt.entityId,
    sourceWorldId: receipt.sourceWorldId,
    sourceZoneId: receipt.sourceZoneId,
    sourceTick: receipt.sourceTick,
    sourceReceiptHash: receipt.sourceReceiptHash,
    sourceStateHash: receipt.sourceStateHash,
    targetWorldId: receipt.targetWorldId,
    targetZoneId: receipt.targetZoneId,
    payloadHash: receipt.payloadHash,
    targetAcceptedTick: receipt.targetAcceptedTick,
    targetReceiptHash: receipt.targetReceiptHash,
    status: receipt.status,
    previousTransferReceiptHash: receipt.previousTransferReceiptHash,
  };
}

export function computeCrossZoneTransferReceiptHash(
  receipt: Omit<AurionCrossZoneHandoverV2, "transferReceiptHash"> | AurionCrossZoneHandoverV2,
): string {
  return canonicalSha256(unsigned(receipt));
}

export function computeTargetAcceptanceReceiptHash(input: {
  transferId: string;
  entityId: string;
  sourceReceiptHash: string;
  payloadHash: string;
  targetWorldId: string;
  targetZoneId: string;
  targetAcceptedTick: number;
}): string {
  if (!Number.isSafeInteger(input.targetAcceptedTick) || input.targetAcceptedTick < 0) {
    throw new Error("CROSS_ZONE_TARGET_ACCEPTANCE_TICK_INVALID");
  }
  if (!HASH.test(input.sourceReceiptHash) || !HASH.test(input.payloadHash)) {
    throw new Error("CROSS_ZONE_TARGET_ACCEPTANCE_EVIDENCE_INVALID");
  }
  return canonicalSha256({
    schema: "aurion.cross-zone-target-acceptance.v2",
    transferId: input.transferId,
    entityId: input.entityId,
    sourceReceiptHash: input.sourceReceiptHash,
    payloadHash: input.payloadHash,
    targetWorldId: input.targetWorldId,
    targetZoneId: input.targetZoneId,
    targetAcceptedTick: input.targetAcceptedTick,
  });
}

export function prepareCrossZoneHandover(input: {
  entityId: string;
  sourceWorldId: string;
  sourceZoneId: string;
  sourceTick: number;
  sourceReceiptHash: string;
  sourceStateHash: string;
  targetWorldId: string;
  targetZoneId: string;
  payload: AurionCrossZonePayload;
}): AurionCrossZoneHandoverV2 {
  if (!input.entityId.trim() || input.payload.entityId !== input.entityId) throw new Error("CROSS_ZONE_ENTITY_IDENTITY_MISMATCH");
  if (!Number.isSafeInteger(input.sourceTick) || input.sourceTick < 0) throw new Error("CROSS_ZONE_SOURCE_TICK_INVALID");
  if (!HASH.test(input.sourceReceiptHash) || !HASH.test(input.sourceStateHash)) throw new Error("CROSS_ZONE_SOURCE_EVIDENCE_INVALID");
  if (!input.sourceWorldId.trim() || !input.targetWorldId.trim() || !input.sourceZoneId.trim() || !input.targetZoneId.trim()) throw new Error("CROSS_ZONE_DOMAIN_IDENTITY_INVALID");
  if (input.sourceWorldId === input.targetWorldId && input.sourceZoneId === input.targetZoneId) throw new Error("CROSS_ZONE_TARGET_MUST_DIFFER");
  const payloadHash = canonicalSha256(input.payload);
  const base = {
    schema: AURION_CROSS_ZONE_HANDOVER_SCHEMA,
    transferId: transferIdFor(input),
    entityId: input.entityId,
    sourceWorldId: input.sourceWorldId,
    sourceZoneId: input.sourceZoneId,
    sourceTick: input.sourceTick,
    sourceReceiptHash: input.sourceReceiptHash,
    sourceStateHash: input.sourceStateHash,
    targetWorldId: input.targetWorldId,
    targetZoneId: input.targetZoneId,
    payload: input.payload,
    payloadHash,
    targetAcceptedTick: null,
    targetReceiptHash: null,
    status: "PREPARED" as const,
    previousTransferReceiptHash: null,
  };
  return Object.freeze({ ...base, transferReceiptHash: computeCrossZoneTransferReceiptHash(base) });
}

const allowed: Readonly<Record<AurionCrossZoneHandoverStatus, readonly AurionCrossZoneHandoverStatus[]>> = Object.freeze({
  PREPARED: Object.freeze(["SOURCE_FROZEN", "REJECTED", "EXPIRED", "UNPROVABLE"]),
  SOURCE_FROZEN: Object.freeze(["TARGET_ACCEPTED", "REJECTED", "EXPIRED", "UNPROVABLE"]),
  TARGET_ACCEPTED: Object.freeze(["SOURCE_FINALIZED", "REJECTED", "EXPIRED", "UNPROVABLE"]),
  SOURCE_FINALIZED: Object.freeze(["COMMITTED", "UNPROVABLE"]),
  COMMITTED: Object.freeze([]),
  REJECTED: Object.freeze([]),
  EXPIRED: Object.freeze([]),
  UNPROVABLE: Object.freeze([]),
});

export function advanceCrossZoneHandover(
  current: AurionCrossZoneHandoverV2,
  nextStatus: AurionCrossZoneHandoverStatus,
  targetAcceptance?: { targetAcceptedTick: number; targetReceiptHash: string },
): AurionCrossZoneHandoverV2 {
  if (!verifyCrossZoneHandover(current)) throw new Error("CROSS_ZONE_TRANSFER_RECEIPT_INVALID");
  if (nextStatus === current.status) {
    if (nextStatus === "TARGET_ACCEPTED" && targetAcceptance &&
      (current.targetAcceptedTick !== targetAcceptance.targetAcceptedTick || current.targetReceiptHash !== targetAcceptance.targetReceiptHash)) {
      throw new Error("CROSS_ZONE_DUPLICATE_ACCEPT_CONFLICT");
    }
    return current;
  }
  if (!allowed[current.status].includes(nextStatus)) throw new Error(`CROSS_ZONE_TRANSITION_INVALID:${current.status}->${nextStatus}`);

  let targetAcceptedTick = current.targetAcceptedTick;
  let targetReceiptHash = current.targetReceiptHash;
  if (nextStatus === "TARGET_ACCEPTED") {
    if (!targetAcceptance || !Number.isSafeInteger(targetAcceptance.targetAcceptedTick) || targetAcceptance.targetAcceptedTick < 0 || !HASH.test(targetAcceptance.targetReceiptHash)) {
      throw new Error("CROSS_ZONE_TARGET_ACCEPTANCE_INVALID");
    }
    targetAcceptedTick = targetAcceptance.targetAcceptedTick;
    targetReceiptHash = targetAcceptance.targetReceiptHash;
  }
  if (["SOURCE_FINALIZED", "COMMITTED"].includes(nextStatus) && (targetAcceptedTick === null || targetReceiptHash === null)) {
    throw new Error("CROSS_ZONE_TARGET_ACCEPTANCE_REQUIRED");
  }

  const nextBase = {
    ...current,
    targetAcceptedTick,
    targetReceiptHash,
    status: nextStatus,
    previousTransferReceiptHash: current.transferReceiptHash,
  };
  const next = Object.freeze({
    ...nextBase,
    transferReceiptHash: computeCrossZoneTransferReceiptHash(nextBase),
  });
  assertCrossZoneOwnerInvariant(next);
  return next;
}

export function verifyCrossZoneHandover(receipt: AurionCrossZoneHandoverV2): boolean {
  if (receipt.schema !== AURION_CROSS_ZONE_HANDOVER_SCHEMA) return false;
  if (receipt.payload.entityId !== receipt.entityId) return false;
  if (receipt.transferId !== transferIdFor(receipt)) return false;
  if (canonicalSha256(receipt.payload) !== receipt.payloadHash) return false;
  if (!HASH.test(receipt.sourceReceiptHash) || !HASH.test(receipt.sourceStateHash)) return false;
  if ((receipt.targetAcceptedTick === null) !== (receipt.targetReceiptHash === null)) return false;
  if (receipt.targetAcceptedTick !== null && receipt.targetReceiptHash !== null) {
    if (!HASH.test(receipt.targetReceiptHash)) return false;
    if (receipt.targetReceiptHash !== computeTargetAcceptanceReceiptHash({
      transferId: receipt.transferId,
      entityId: receipt.entityId,
      sourceReceiptHash: receipt.sourceReceiptHash,
      payloadHash: receipt.payloadHash,
      targetWorldId: receipt.targetWorldId,
      targetZoneId: receipt.targetZoneId,
      targetAcceptedTick: receipt.targetAcceptedTick,
    })) return false;
  }
  if (["TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED"].includes(receipt.status) &&
      (receipt.targetAcceptedTick === null || receipt.targetReceiptHash === null)) return false;
  if (receipt.previousTransferReceiptHash !== null && !HASH.test(receipt.previousTransferReceiptHash)) return false;
  return receipt.transferReceiptHash === computeCrossZoneTransferReceiptHash(receipt);
}

export function authoritativeOwnersForHandover(receipt: AurionCrossZoneHandoverV2): readonly string[] {
  switch (receipt.status) {
    case "PREPARED":
    case "SOURCE_FROZEN":
    case "TARGET_ACCEPTED":
    case "REJECTED":
    case "EXPIRED":
    case "UNPROVABLE":
      return Object.freeze([`${receipt.sourceWorldId}/${receipt.sourceZoneId}`]);
    case "SOURCE_FINALIZED":
    case "COMMITTED":
      return Object.freeze([`${receipt.targetWorldId}/${receipt.targetZoneId}`]);
  }
}

export function assertCrossZoneOwnerInvariant(receipt: AurionCrossZoneHandoverV2): readonly string[] {
  const owners = authoritativeOwnersForHandover(receipt);
  if (owners.length !== 1) throw new Error("CROSS_ZONE_OWNER_INVARIANT_VIOLATION");
  return owners;
}
