import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_WORLD_CAUSAL_ROOT_SCHEMA = "aurion.world.causal-root.v1" as const;
export const AURION_ZONE_EPOCH_ROOT_SCHEMA = "aurion.zone.epoch-root.v1" as const;

/**
 * This list is deliberately the causal-runtime zone set, not the broader region
 * content catalog. Step 22 must only require zones that the authoritative zone
 * runtime can actually produce receipts for.
 */
export const AURION_WORLD_CAUSAL_ZONE_IDS = Object.freeze([
  "observatory_threshold",
] as const);

export type AurionWorldCausalZoneId = (typeof AURION_WORLD_CAUSAL_ZONE_IDS)[number];

export interface AurionZoneReceiptReference {
  worldId: string;
  zoneId: string;
  tick: number;
  sourceRevision: string;
  rulesetVersion: string;
  previousReceiptHash: string | null;
  receiptHash: string;
}

export interface AurionZoneEpochRoot {
  zoneId: string;
  fromTick: number;
  toTick: number;
  firstReceiptHash: string;
  lastReceiptHash: string;
  zoneRootHash: string;
}

export interface AurionWorldCausalRoot {
  schema: typeof AURION_WORLD_CAUSAL_ROOT_SCHEMA;
  worldId: string;
  epoch: number;
  sourceRevision: string;
  rulesetVersion: string;
  zoneRoots: readonly AurionZoneEpochRoot[];
  previousWorldRoot: string | null;
  worldRootHash: string;
}

export type AurionWorldCausalRootUnprovableReason =
  | "EXPECTED_ZONE_EVIDENCE_MISSING"
  | "UNEXPECTED_ZONE_EVIDENCE"
  | "DUPLICATE_ZONE_EVIDENCE"
  | "ZONE_RECEIPT_CHAIN_INVALID"
  | "ZONE_RECEIPT_IDENTITY_MISMATCH"
  | "SOURCE_REVISION_UNVERIFIED"
  | "PREVIOUS_WORLD_ROOT_UNPROVABLE";

export type AurionWorldCausalRootResult =
  | Readonly<{
      schema: "aurion.world.causal-root-result.v1";
      status: "VERIFIED";
      root: AurionWorldCausalRoot;
      evidenceHash: string;
      missingZoneIds: readonly string[];
      unexpectedZoneIds: readonly string[];
      reason: null;
    }>
  | Readonly<{
      schema: "aurion.world.causal-root-result.v1";
      status: "UNPROVABLE";
      root: null;
      evidenceHash: string;
      missingZoneIds: readonly string[];
      unexpectedZoneIds: readonly string[];
      reason: AurionWorldCausalRootUnprovableReason;
    }>;

const GIT_SHA = /^[a-f0-9]{40}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalZoneIds(zoneIds: readonly string[]): string[] {
  return [...zoneIds].sort(compareText);
}

function unprovable(input: {
  worldId: string;
  epoch: number;
  sourceRevision: string;
  rulesetVersion: string;
  previousWorldRoot: string | null;
  expectedZoneIds: readonly string[];
  zoneRoots: readonly AurionZoneEpochRoot[];
  missingZoneIds?: readonly string[];
  unexpectedZoneIds?: readonly string[];
  reason: AurionWorldCausalRootUnprovableReason;
}): AurionWorldCausalRootResult {
  const missingZoneIds = canonicalZoneIds(input.missingZoneIds ?? []);
  const unexpectedZoneIds = canonicalZoneIds(input.unexpectedZoneIds ?? []);
  const evidenceHash = canonicalSha256({
    schema: "aurion.world.causal-root-unprovable.v1",
    worldId: input.worldId,
    epoch: input.epoch,
    sourceRevision: input.sourceRevision,
    rulesetVersion: input.rulesetVersion,
    previousWorldRoot: input.previousWorldRoot,
    expectedZoneIds: canonicalZoneIds(input.expectedZoneIds),
    zoneRoots: [...input.zoneRoots].sort((a, b) => compareText(a.zoneId, b.zoneId)),
    missingZoneIds,
    unexpectedZoneIds,
    reason: input.reason,
  });
  return Object.freeze({
    schema: "aurion.world.causal-root-result.v1",
    status: "UNPROVABLE",
    root: null,
    evidenceHash,
    missingZoneIds: Object.freeze(missingZoneIds),
    unexpectedZoneIds: Object.freeze(unexpectedZoneIds),
    reason: input.reason,
  });
}

export function computeZoneEpochRoot(
  receipts: readonly AurionZoneReceiptReference[],
): AurionZoneEpochRoot {
  if (receipts.length === 0) throw new Error("ZONE_EPOCH_RECEIPTS_REQUIRED");
  const ordered = [...receipts].sort((a, b) => a.tick - b.tick);
  const first = ordered[0]!;
  for (let index = 0; index < ordered.length; index += 1) {
    const receipt = ordered[index]!;
    if (
      receipt.worldId !== first.worldId ||
      receipt.zoneId !== first.zoneId ||
      !Number.isSafeInteger(receipt.tick) ||
      receipt.tick < 0 ||
      !HASH.test(receipt.receiptHash)
    ) {
      throw new Error("ZONE_RECEIPT_IDENTITY_MISMATCH");
    }
    if (index === 0) continue;
    const previous = ordered[index - 1]!;
    if (
      receipt.tick !== previous.tick + 1 ||
      receipt.previousReceiptHash !== previous.receiptHash
    ) {
      throw new Error("ZONE_RECEIPT_CHAIN_INVALID");
    }
  }
  const last = ordered[ordered.length - 1]!;
  const zoneRootHash = canonicalSha256({
    schema: AURION_ZONE_EPOCH_ROOT_SCHEMA,
    worldId: first.worldId,
    zoneId: first.zoneId,
    fromTick: first.tick,
    toTick: last.tick,
    receipts: ordered.map(receipt => ({
      tick: receipt.tick,
      sourceRevision: receipt.sourceRevision,
      rulesetVersion: receipt.rulesetVersion,
      previousReceiptHash: receipt.previousReceiptHash,
      receiptHash: receipt.receiptHash,
    })),
  });
  return Object.freeze({
    zoneId: first.zoneId,
    fromTick: first.tick,
    toTick: last.tick,
    firstReceiptHash: first.receiptHash,
    lastReceiptHash: last.receiptHash,
    zoneRootHash,
  });
}

export function computeWorldCausalRoot(input: {
  worldId: string;
  epoch: number;
  sourceRevision: string;
  rulesetVersion: string;
  expectedZoneIds: readonly string[];
  zoneRoots: readonly AurionZoneEpochRoot[];
  previousWorldRoot: string | null;
  previousWorldRootProvable?: boolean;
}): AurionWorldCausalRootResult {
  const expectedZoneIds = canonicalZoneIds(input.expectedZoneIds);
  const seen = new Set<string>();
  for (const zoneRoot of input.zoneRoots) {
    if (seen.has(zoneRoot.zoneId)) {
      return unprovable({ ...input, reason: "DUPLICATE_ZONE_EVIDENCE" });
    }
    seen.add(zoneRoot.zoneId);
  }

  const missingZoneIds = expectedZoneIds.filter(zoneId => !seen.has(zoneId));
  const unexpectedZoneIds = canonicalZoneIds(
    [...seen].filter(zoneId => !expectedZoneIds.includes(zoneId)),
  );
  if (missingZoneIds.length > 0) {
    return unprovable({
      ...input,
      missingZoneIds,
      unexpectedZoneIds,
      reason: "EXPECTED_ZONE_EVIDENCE_MISSING",
    });
  }
  if (unexpectedZoneIds.length > 0) {
    return unprovable({
      ...input,
      unexpectedZoneIds,
      reason: "UNEXPECTED_ZONE_EVIDENCE",
    });
  }
  if (!GIT_SHA.test(input.sourceRevision)) {
    return unprovable({ ...input, reason: "SOURCE_REVISION_UNVERIFIED" });
  }
  if (input.previousWorldRootProvable === false) {
    return unprovable({ ...input, reason: "PREVIOUS_WORLD_ROOT_UNPROVABLE" });
  }
  if (input.previousWorldRoot !== null && !HASH.test(input.previousWorldRoot)) {
    return unprovable({ ...input, reason: "PREVIOUS_WORLD_ROOT_UNPROVABLE" });
  }

  const zoneRoots = [...input.zoneRoots].sort((a, b) => compareText(a.zoneId, b.zoneId));
  const unsigned = {
    schema: AURION_WORLD_CAUSAL_ROOT_SCHEMA,
    worldId: input.worldId,
    epoch: input.epoch,
    sourceRevision: input.sourceRevision,
    rulesetVersion: input.rulesetVersion,
    zoneRoots,
    previousWorldRoot: input.previousWorldRoot,
  } as const;
  const worldRootHash = canonicalSha256(unsigned);
  const root: AurionWorldCausalRoot = Object.freeze({
    ...unsigned,
    zoneRoots: Object.freeze(zoneRoots),
    worldRootHash,
  });
  return Object.freeze({
    schema: "aurion.world.causal-root-result.v1",
    status: "VERIFIED",
    root,
    evidenceHash: worldRootHash,
    missingZoneIds: Object.freeze([]),
    unexpectedZoneIds: Object.freeze([]),
    reason: null,
  });
}

export function verifyWorldCausalRoot(root: AurionWorldCausalRoot): boolean {
  const expected = canonicalSha256({
    schema: root.schema,
    worldId: root.worldId,
    epoch: root.epoch,
    sourceRevision: root.sourceRevision,
    rulesetVersion: root.rulesetVersion,
    zoneRoots: [...root.zoneRoots].sort((a, b) => compareText(a.zoneId, b.zoneId)),
    previousWorldRoot: root.previousWorldRoot,
  });
  return root.worldRootHash === expected;
}
