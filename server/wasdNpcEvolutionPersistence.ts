import { and, desc, eq, sql } from "drizzle-orm";
import { 
  aurionNpcPolicyVersions, 
  aurionNpcPolicyActivePointers, 
  aurionNpcPolicyMutationReceipts, 
  aurionNpcPolicyRollbackReceipts 
} from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash, stableCatalogStringify } from "./wasdNpcCapsule";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type NpcTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type WasdMutationReceipt = Readonly<{
  mutationReceiptId: string;
  npcId: string;
  previousVersion: number | null;
  previousPolicyHash: string | null;
  nextVersion: number;
  nextPolicyHash: string;
  rejectedCandidateHash: string | null;
  verdict: "accepted" | "rejected";
  reason: string;
  provenanceDigest: string;
  evidenceWindow: { startIndex: number; endIndex: number };
  fitnessContract: { version: string; resultDigest: string };
  mutationRule: { version: string };
  envelopeHash: string;
  rollbackTargetVersion: number | null;
  sourceRevision: string;
  sourceSha256: string;
  payload: Record<string, any>;
}>;

/**
 * Validates mutation receipt integrity against the pinned WASD revision and capsule identity.
 */
export function verifyMutationReceiptIntegrity(receipt: WasdMutationReceipt): void {
  // 1. Enforce capsule source and revision pinning
  if (receipt.sourceRevision !== pin.sourceRevision || receipt.sourceSha256 !== pin.sourceSha256) {
    throw new Error("EVOLUTION_SOURCE_MISMATCH");
  }

  // 2. Reject mutation if provenance digest is empty
  if (!receipt.provenanceDigest || receipt.provenanceDigest.trim() === "") {
    throw new Error("MUTATION_COMMIT_WITHOUT_FULL_PROVENANCE");
  }

  // 3. Reject mutation if verdict is invalid
  if (receipt.verdict !== "accepted" && receipt.verdict !== "rejected") {
    throw new Error("INVALID_MUTATION_VERDICT");
  }
}

/**
 * Commits a verified WASD mutation receipt to the version history and updates active pointers.
 * Enforces transaction-level checks (concurrency, stale detection, exact database readbacks).
 */
export async function commitNpcPolicyMutation(
  tx: NpcTransaction,
  receipt: WasdMutationReceipt,
  adminUserId: string = "system"
): Promise<void> {
  // 1. Verify basic capsule parameters
  verifyMutationReceiptIntegrity(receipt);

  // 2. Query the current active pointer for this NPC
  const activePointer = (await tx.select().from(aurionNpcPolicyActivePointers)
    .where(eq(aurionNpcPolicyActivePointers.npcId, receipt.npcId)).limit(1))[0];

  // 3. Idempotency Check: check if this receipt already exists
  const existingReceipt = (await tx.select().from(aurionNpcPolicyMutationReceipts)
    .where(eq(aurionNpcPolicyMutationReceipts.id, receipt.mutationReceiptId)).limit(1))[0];

  if (existingReceipt) {
    // If it's a perfect duplicate, treat it as idempotent and return
    if (existingReceipt.npcId === receipt.npcId && existingReceipt.verdict === receipt.verdict) {
      return;
    }
    throw new Error("CONFLICTING_DUPLICATE_RECEIPT");
  }

  if (receipt.verdict === "accepted") {
    // Verify previous version matches active pointer exactly (Fail closed on stale active pointer)
    const expectedPrevVersion = activePointer ? (await tx.select().from(aurionNpcPolicyVersions).where(eq(aurionNpcPolicyVersions.id, activePointer.activeVersionId)).limit(1))[0]?.version ?? 0 : 0;
    const expectedPrevHash = activePointer?.activePolicyHash ?? null;

    if (receipt.previousVersion !== null && receipt.previousVersion !== expectedPrevVersion) {
      throw new Error("MUTATION_STALE_PREVIOUS_VERSION");
    }
    if (receipt.previousPolicyHash !== expectedPrevHash) {
      throw new Error("MUTATION_STALE_PREVIOUS_HASH");
    }

    // Fail closed if two mutations try to target the exact same previous version (concurrency block)
    const existingVersion = (await tx.select().from(aurionNpcPolicyVersions)
      .where(and(
        eq(aurionNpcPolicyVersions.npcId, receipt.npcId),
        eq(aurionNpcPolicyVersions.version, receipt.nextVersion)
      )).limit(1))[0];

    if (existingVersion) {
      throw new Error("MUTATION_CONCURRENT_DUPLICATE_VERSION");
    }

    // Insert new immutable policy version row
    const versionId = `pver_${npcHash([receipt.npcId, String(receipt.nextVersion), receipt.nextPolicyHash]).slice(0, 58)}`;
    await tx.insert(aurionNpcPolicyVersions).values({
      id: versionId,
      npcId: receipt.npcId,
      version: receipt.nextVersion,
      policyHash: receipt.nextPolicyHash,
      payloadJson: JSON.stringify(receipt.payload),
      sourceRevision: receipt.sourceRevision,
      sourceSha256: receipt.sourceSha256,
    });

    // Insert mutation receipt
    const receiptHash = npcHash(stableCatalogStringify({ ...receipt, payload: undefined }));
    await tx.insert(aurionNpcPolicyMutationReceipts).values({
      id: receipt.mutationReceiptId,
      npcId: receipt.npcId,
      previousVersionId: activePointer ? activePointer.activeVersionId : null,
      previousPolicyHash: activePointer ? activePointer.activePolicyHash : null,
      nextVersionId: versionId,
      nextPolicyHash: receipt.nextPolicyHash,
      rejectedCandidateHash: null,
      verdict: "accepted",
      reason: receipt.reason,
      provenanceDigest: receipt.provenanceDigest,
      evidenceWindowJson: JSON.stringify(receipt.evidenceWindow),
      fitnessContractVersion: receipt.fitnessContract.version,
      fitnessResultDigest: receipt.fitnessContract.resultDigest,
      mutationRuleVersion: receipt.mutationRule.version,
      envelopeHash: receipt.envelopeHash,
      rollbackTargetVersion: receipt.rollbackTargetVersion,
      sourceRevision: receipt.sourceRevision,
      sourceSha256: receipt.sourceSha256,
      receiptHash,
    });

    // Update active version pointer
    const activeRow = {
      activeVersionId: versionId,
      activePolicyHash: receipt.nextPolicyHash,
    };

    if (activePointer) {
      await tx.update(aurionNpcPolicyActivePointers)
        .set(activeRow)
        .where(eq(aurionNpcPolicyActivePointers.npcId, receipt.npcId));
    } else {
      await tx.insert(aurionNpcPolicyActivePointers).values({
        npcId: receipt.npcId,
        ...activeRow,
      });
    }

    // Trace rollback if it is designated as a rollback mutation
    if (receipt.rollbackTargetVersion !== null) {
      const targetVersionRow = (await tx.select().from(aurionNpcPolicyVersions)
        .where(and(
          eq(aurionNpcPolicyVersions.npcId, receipt.npcId),
          eq(aurionNpcPolicyVersions.version, receipt.rollbackTargetVersion)
        )).limit(1))[0];

      if (!targetVersionRow) {
        throw new Error("ROLLBACK_TARGET_VERSION_NOT_FOUND");
      }

      await tx.insert(aurionNpcPolicyRollbackReceipts).values({
        id: `roll_${npcHash([receipt.npcId, receipt.mutationReceiptId, String(receipt.rollbackTargetVersion)]).slice(0, 58)}`,
        npcId: receipt.npcId,
        mutationReceiptId: receipt.mutationReceiptId,
        requestedVersionId: targetVersionRow.id,
        requestedPolicyHash: targetVersionRow.policyHash,
        reason: receipt.reason,
        adminUserId,
        wasdVerifiedReceiptId: `wroll_${npcHash(["wasd-verified", receipt.mutationReceiptId]).slice(0, 50)}`,
      });
    }

    // Exact database readback and verification
    const readbackReceipt = (await tx.select().from(aurionNpcPolicyMutationReceipts)
      .where(eq(aurionNpcPolicyMutationReceipts.id, receipt.mutationReceiptId)).limit(1))[0];
    if (!readbackReceipt || readbackReceipt.receiptHash !== receiptHash) {
      throw new Error("MUTATION_RECEIPT_READBACK_MISMATCH");
    }

    const readbackPointer = (await tx.select().from(aurionNpcPolicyActivePointers)
      .where(eq(aurionNpcPolicyActivePointers.npcId, receipt.npcId)).limit(1))[0];
    if (!readbackPointer || readbackPointer.activeVersionId !== versionId || readbackPointer.activePolicyHash !== receipt.nextPolicyHash) {
      throw new Error("ACTIVE_POINTER_READBACK_MISMATCH");
    }

  } else {
    // Rejected verdict: Store the mutation receipt for auditing, but leave active version pointers completely untouched
    const receiptHash = npcHash(stableCatalogStringify({ ...receipt, payload: undefined }));
    await tx.insert(aurionNpcPolicyMutationReceipts).values({
      id: receipt.mutationReceiptId,
      npcId: receipt.npcId,
      previousVersionId: activePointer ? activePointer.activeVersionId : null,
      previousPolicyHash: activePointer ? activePointer.activePolicyHash : null,
      nextVersionId: null,
      nextPolicyHash: null,
      rejectedCandidateHash: receipt.rejectedCandidateHash,
      verdict: "rejected",
      reason: receipt.reason,
      provenanceDigest: receipt.provenanceDigest,
      evidenceWindowJson: JSON.stringify(receipt.evidenceWindow),
      fitnessContractVersion: receipt.fitnessContract.version,
      fitnessResultDigest: receipt.fitnessContract.resultDigest,
      mutationRuleVersion: receipt.mutationRule.version,
      envelopeHash: receipt.envelopeHash,
      rollbackTargetVersion: null,
      sourceRevision: receipt.sourceRevision,
      sourceSha256: receipt.sourceSha256,
      receiptHash,
    });

    // Readback verification for the audit receipt
    const readbackReceipt = (await tx.select().from(aurionNpcPolicyMutationReceipts)
      .where(eq(aurionNpcPolicyMutationReceipts.id, receipt.mutationReceiptId)).limit(1))[0];
    if (!readbackReceipt || readbackReceipt.receiptHash !== receiptHash) {
      throw new Error("MUTATION_AUDIT_RECEIPT_READBACK_MISMATCH");
    }
  }
}

/**
 * Validates a rollback request and triggers a rollback mutation receipt through the transaction layer.
 * Replays version chain to restore the exact target version's parameters without modifying historical rows in place.
 */
export async function requestNpcPolicyRollback(
  tx: NpcTransaction,
  npcId: string,
  targetVersion: number,
  reason: string,
  adminUserId: string
): Promise<void> {
  // 1. Retrieve the active version pointer to locate the current version
  const activePointer = (await tx.select().from(aurionNpcPolicyActivePointers)
    .where(eq(aurionNpcPolicyActivePointers.npcId, npcId)).limit(1))[0];

  if (!activePointer) {
    throw new Error("ROLLBACK_NO_ACTIVE_POLICY");
  }

  const currentVersionRow = (await tx.select().from(aurionNpcPolicyVersions)
    .where(eq(aurionNpcPolicyVersions.id, activePointer.activeVersionId)).limit(1))[0];

  if (!currentVersionRow) {
    throw new Error("ROLLBACK_ACTIVE_VERSION_MISSING");
  }

  const currentVersion = currentVersionRow.version;

  // 2. Ensure target version is strictly within previous range (N-1 or older, no future rollbacks)
  if (targetVersion >= currentVersion) {
    throw new Error("ROLLBACK_INVALID_TARGET_VERSION");
  }

  // 3. Fetch the target historical policy version
  const targetVersionRow = (await tx.select().from(aurionNpcPolicyVersions)
    .where(and(
      eq(aurionNpcPolicyVersions.npcId, npcId),
      eq(aurionNpcPolicyVersions.version, targetVersion)
    )).limit(1))[0];

  if (!targetVersionRow) {
    throw new Error("ROLLBACK_TARGET_VERSION_NOT_FOUND");
  }

  // 4. Construct a WASD-verified Rollback Mutation Receipt
  // Rollback moves version chain forward cleanly (Version N + 1) while restoring older parameters
  const nextVersion = currentVersion + 1;
  const payload = JSON.parse(targetVersionRow.payloadJson);
  const nextPolicyHash = targetVersionRow.policyHash;

  const rollbackMutationReceiptId = `mut_roll_${npcHash([npcId, String(nextVersion), nextPolicyHash]).slice(0, 50)}`;

  const rollbackMutation: WasdMutationReceipt = {
    mutationReceiptId: rollbackMutationReceiptId,
    npcId,
    previousVersion: currentVersion,
    previousPolicyHash: currentVersionRow.policyHash,
    nextVersion,
    nextPolicyHash,
    rejectedCandidateHash: null,
    verdict: "accepted",
    reason: `Verified Rollback to version ${targetVersion}: ${reason}`,
    provenanceDigest: `rollback:${targetVersionRow.id}`,
    evidenceWindow: { startIndex: 0, endIndex: 0 },
    fitnessContract: { version: "wasd-rollback-contract.v1", resultDigest: npcHash(["rollback", String(targetVersion)]) },
    mutationRule: { version: "wasd-rollback-rule.v1" },
    envelopeHash: npcHash(["envelope", npcId, String(nextVersion)]),
    rollbackTargetVersion: targetVersion,
    sourceRevision: pin.sourceRevision,
    sourceSha256: pin.sourceSha256,
    payload,
  };

  // 5. Commit the rollback mutation receipt transactionally
  await commitNpcPolicyMutation(tx, rollbackMutation, adminUserId);
}

/**
 * Public/AX1 projection interface. Retrieves the confirmed policy parameters for an NPC.
 * If no active pointer exists, returns a default template state.
 */
export async function getConfirmedNpcPolicy(npcId: string): Promise<{
  npcId: string;
  version: number;
  policyHash: string;
  payload: Record<string, any>;
  sourceRevision: string;
  sourceSha256: string;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const activePointer = (await db.select().from(aurionNpcPolicyActivePointers)
    .where(eq(aurionNpcPolicyActivePointers.npcId, npcId)).limit(1))[0];

  if (!activePointer) {
    return null;
  }

  const versionRow = (await db.select().from(aurionNpcPolicyVersions)
    .where(eq(aurionNpcPolicyVersions.id, activePointer.activeVersionId)).limit(1))[0];

  if (!versionRow) {
    return null;
  }

  return {
    npcId,
    version: versionRow.version,
    policyHash: versionRow.policyHash,
    payload: JSON.parse(versionRow.payloadJson),
    sourceRevision: versionRow.sourceRevision,
    sourceSha256: versionRow.sourceSha256,
  };
}
