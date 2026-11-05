import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aurionNpcPolicyVersions as versions, aurionNpcPolicyMutationReceipts as mutations,
  aurionNpcPolicyActivePointers as individualPointers, aurionNpcStates, aurionNpcDecisionReceipts,
  aurionNpcControllerArtifacts as artifacts, aurionNpcArchetypeReleases as releases,
  aurionNpcArchetypePointers as pointers, aurionNpcControllerBindings as bindings,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { NpcTransaction } from "./wasdNpcEvolutionPersistence";
import { npcHash, stableCatalogStringify } from "./wasdNpcCapsule";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { npcCapsulePin } from "./aurion/npc/authority";
import { CANONICAL_NPC_FALLBACK, NPC_CONTROLLER_ARCHETYPES, controllerArchetypeForNpc, verifyArchetypeCandidate } from "./aiFabric/npcArchetypeRegistry";

const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const Promote = z.object({ archetypeId: id, expectedRevision: z.number().int().min(0).max(2147483646), mutationReceiptId: id, sourceRevision: revision }).strict();
const definitionHash = (archetypeId: string) => canonicalSha256(NPC_CONTROLLER_ARCHETYPES[archetypeId as keyof typeof NPC_CONTROLLER_ARCHETYPES]);

/** Reuse existing append-only per-NPC custody. No new external approval authority.
 * This admits SHADOW candidates only; it does not grant release/deployment rights.
 */
async function approvedPolicy(tx: NpcTransaction, mutationReceiptId: string) {
  const receipt = (await tx.select().from(mutations).where(eq(mutations.id, mutationReceiptId)).limit(1).for("update"))[0];
  if (!receipt || receipt.verdict !== "accepted" || !receipt.nextVersionId) throw Error("NPC_CONTROLLER_APPROVAL_REQUIRED");
  const policy = (await tx.select().from(versions).where(eq(versions.id, receipt.nextVersionId)).limit(1).for("update"))[0];
  if (!policy || policy.npcId !== receipt.npcId || policy.policyHash !== receipt.nextPolicyHash) throw Error("NPC_CONTROLLER_POLICY_MISMATCH");
  const candidate = verifyArchetypeCandidate(JSON.parse(policy.payloadJson));
  if (npcHash(candidate) !== policy.policyHash || receipt.envelopeHash !== policy.policyHash || receipt.provenanceDigest !== canonicalSha256(candidate)) throw Error("NPC_CONTROLLER_POLICY_HASH_MISMATCH");
  if (policy.sourceRevision !== npcCapsulePin.sourceRevision || policy.sourceSha256 !== npcCapsulePin.sourceSha256 || receipt.sourceRevision !== policy.sourceRevision || receipt.sourceSha256 !== policy.sourceSha256) throw Error("NPC_CONTROLLER_POLICY_SOURCE_MISMATCH");
  if (receipt.fitnessContractVersion !== candidate.regression.suite || receipt.fitnessResultDigest !== candidate.regression.resultDigest.slice(7) || receipt.mutationRuleVersion !== "npc-archetype-registry.v1") throw Error("NPC_CONTROLLER_REGRESSION_MISMATCH");
  const previous = receipt.previousVersionId ? (await tx.select().from(versions).where(eq(versions.id, receipt.previousVersionId)).limit(1).for("update"))[0] : null;
  if (receipt.previousVersionId && (!previous || previous.npcId !== policy.npcId || previous.policyHash !== receipt.previousPolicyHash)) throw Error("NPC_CONTROLLER_PREDECESSOR_MISMATCH");
  const original = {
    mutationReceiptId: receipt.id, npcId: receipt.npcId, previousVersion: previous?.version ?? null,
    previousPolicyHash: receipt.previousPolicyHash, nextVersion: policy.version, nextPolicyHash: policy.policyHash,
    rejectedCandidateHash: receipt.rejectedCandidateHash, verdict: receipt.verdict, reason: receipt.reason,
    provenanceDigest: receipt.provenanceDigest, evidenceWindow: JSON.parse(receipt.evidenceWindowJson),
    fitnessContract: { version: receipt.fitnessContractVersion, resultDigest: receipt.fitnessResultDigest },
    mutationRule: { version: receipt.mutationRuleVersion }, envelopeHash: receipt.envelopeHash,
    rollbackTargetVersion: receipt.rollbackTargetVersion, sourceRevision: receipt.sourceRevision, sourceSha256: receipt.sourceSha256,
  };
  // Preserve the existing custody receipt's exact (double-serialized) hash contract.
  if (npcHash(stableCatalogStringify({ ...original, payload: undefined })) !== receipt.receiptHash) throw Error("NPC_CONTROLLER_APPROVAL_HASH_MISMATCH");
  return { policy, receipt, candidate };
}

/** Caller owns the transaction. Row lock + expected revision serializes releases,
 * including first release races. Rolling back means a NEW revision pointing at an
 * old approved artifact, never editing history or existing NPC bindings.
 */
export async function promoteNpcArchetype(tx: NpcTransaction, raw: z.infer<typeof Promote>) {
  const input = Promote.parse(raw);
  // All registry writers serialize pointer -> approval -> artifact; current reads
  // also remain correct when genesis already holds an older REPEATABLE READ view.
  await tx.insert(pointers).values({ archetypeId: input.archetypeId, revision: 0, releaseHash: null }).onDuplicateKeyUpdate({ set: { archetypeId: input.archetypeId } });
  const current = (await tx.select().from(pointers).where(eq(pointers.archetypeId, input.archetypeId)).for("update"))[0];
  if (current.revision !== input.expectedRevision) throw Error("NPC_ARCHETYPE_RELEASE_STALE");
  const approved = await approvedPolicy(tx, input.mutationReceiptId);
  if (approved.candidate.archetypeId !== input.archetypeId || approved.candidate.regression.sourceRevision !== input.sourceRevision) throw Error("NPC_CONTROLLER_RELEASE_SCOPE_MISMATCH");
  // INSERT IGNORE does not run an UPDATE against the append-only artifact table.
  const artifact = (await tx.select().from(artifacts).where(eq(artifacts.artifactHash, approved.candidate.artifactHash)).limit(1).for("update"))[0];
  if (!artifact) await tx.insert(artifacts).ignore().values({ artifactHash: approved.candidate.artifactHash, artifactJson: JSON.stringify(approved.candidate.artifact) });
  const stored = (await tx.select().from(artifacts).where(eq(artifacts.artifactHash, approved.candidate.artifactHash)).limit(1).for("update"))[0];
  if (!stored || canonicalSha256(JSON.parse(stored.artifactJson)) !== approved.candidate.artifactHash) throw Error("NPC_CONTROLLER_ARTIFACT_HASH_MISMATCH");
  const release = {
    schemaVersion: "aurion.npc-archetype-release.v1" as const, archetypeId: input.archetypeId,
    revision: current.revision + 1, previousReleaseHash: current.releaseHash,
    artifactHash: approved.candidate.artifactHash, policyVersionId: approved.policy.id,
    mutationReceiptId: approved.receipt.id, approvalHash: approved.receipt.receiptHash,
    sourceRevision: input.sourceRevision, regressionDigest: approved.candidate.regression.resultDigest,
    definitionHash: definitionHash(input.archetypeId), execution: "shadow" as const,
  };
  const releaseHash = canonicalSha256(release);
  await tx.insert(releases).values({ releaseHash, archetypeId: input.archetypeId, revision: release.revision, artifactHash: release.artifactHash, policyVersionId: release.policyVersionId, mutationReceiptId: release.mutationReceiptId, payloadJson: JSON.stringify(release) });
  await tx.update(pointers).set({ revision: release.revision, releaseHash }).where(eq(pointers.archetypeId, input.archetypeId));
  return { ...release, releaseHash };
}

const Binding = z.object({
  schemaVersion: z.literal("aurion.npc-controller-binding.v1"), npcId: id, genesisReceiptId: id,
  archetypeId: z.string().nullable(), registryRevision: z.number().int().nonnegative(),
  releaseHash: sha.nullable(), artifactHash: sha.nullable(), individualVersionId: id.nullable(),
  individualMutationReceiptId: id.nullable(), status: z.enum(["BOUND_SHADOW", "CANONICAL_FALLBACK"]),
  reason: z.string(), fallbackId: z.literal(CANONICAL_NPC_FALLBACK.id),
}).strict();
export type NpcControllerBinding = z.infer<typeof Binding> & { bindingHash: string };

async function readRelease(tx: NpcTransaction, releaseHash: string) {
  const row = (await tx.select().from(releases).where(eq(releases.releaseHash, releaseHash)).limit(1).for("update"))[0];
  if (!row) throw Error("NPC_ARCHETYPE_RELEASE_MISSING");
  const release = JSON.parse(row.payloadJson);
  if (canonicalSha256(release) !== releaseHash || release.archetypeId !== row.archetypeId || release.revision !== row.revision || release.artifactHash !== row.artifactHash || release.policyVersionId !== row.policyVersionId || release.mutationReceiptId !== row.mutationReceiptId || release.execution !== "shadow" || release.definitionHash !== definitionHash(row.archetypeId)) throw Error("NPC_ARCHETYPE_RELEASE_CORRUPT");
  const approved = await approvedPolicy(tx, row.mutationReceiptId);
  if (approved.policy.id !== row.policyVersionId || approved.candidate.archetypeId !== row.archetypeId || approved.candidate.artifactHash !== row.artifactHash || approved.receipt.receiptHash !== release.approvalHash || approved.candidate.regression.resultDigest !== release.regressionDigest || approved.candidate.regression.sourceRevision !== release.sourceRevision) throw Error("NPC_ARCHETYPE_RELEASE_APPROVAL_MISMATCH");
  return { release, approved };
}

/** Only invoked inside the canonical first-decision transaction. There is no
 * client route, lazy binding of old NPCs, or automatic per-tick version refresh.
 */
export async function bindNpcControllerAtGenesis(tx: NpcTransaction, npcId: string, genesisReceiptId: string) {
  const prior = (await tx.select().from(bindings).where(eq(bindings.npcId, npcId)).limit(1).for("update"))[0];
  if (prior) throw Error("NPC_CONTROLLER_EXPLICIT_MIGRATION_REQUIRED");
  const decisions = await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.npcId, npcId)).limit(2).for("update");
  const state = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId, npcId)).limit(1).for("update"))[0];
  if (decisions.length !== 1 || decisions[0].id !== genesisReceiptId || !state || state.lastResolutionIndex !== decisions[0].resolutionIndex) throw Error("NPC_CONTROLLER_GENESIS_REQUIRED");
  const archetypeId = controllerArchetypeForNpc(npcId);
  const binding: z.infer<typeof Binding> = {
    schemaVersion: "aurion.npc-controller-binding.v1", npcId, genesisReceiptId, archetypeId,
    registryRevision: 0, releaseHash: null, artifactHash: null, individualVersionId: null, individualMutationReceiptId: null,
    status: "CANONICAL_FALLBACK", reason: archetypeId ? "NO_APPROVED_RELEASE" : "UNMAPPED_CONTROLLER_ARCHETYPE", fallbackId: CANONICAL_NPC_FALLBACK.id,
  };
  if (archetypeId) {
    const pointer = (await tx.select().from(pointers).where(eq(pointers.archetypeId, archetypeId)).limit(1).for("update"))[0];
    if (pointer?.releaseHash) {
      // Controller corruption must not prevent canonical NPC genesis.
      try {
        const { release } = await readRelease(tx, pointer.releaseHash);
        if (release.revision !== pointer.revision || release.archetypeId !== archetypeId) throw Error("NPC_ARCHETYPE_POINTER_CORRUPT");
        binding.registryRevision = release.revision;
        binding.releaseHash = pointer.releaseHash;
        binding.artifactHash = release.artifactHash;
        const individual = (await tx.select().from(individualPointers).where(eq(individualPointers.npcId, npcId)).limit(1).for("update"))[0];
        if (individual) {
          const receipts = await tx.select().from(mutations).where(and(eq(mutations.npcId, npcId), eq(mutations.nextVersionId, individual.activeVersionId), eq(mutations.verdict, "accepted"))).limit(2).for("update");
          if (receipts.length !== 1) throw Error("NPC_INDIVIDUAL_POLICY_APPROVAL_REQUIRED");
          const override = await approvedPolicy(tx, receipts[0].id);
          if (override.candidate.archetypeId !== archetypeId || override.policy.policyHash !== individual.activePolicyHash) throw Error("NPC_INDIVIDUAL_POLICY_INCOMPATIBLE");
          binding.artifactHash = override.candidate.artifactHash;
          binding.individualVersionId = override.policy.id;
          binding.individualMutationReceiptId = override.receipt.id;
          await tx.insert(artifacts).ignore().values({ artifactHash: override.candidate.artifactHash, artifactJson: JSON.stringify(override.candidate.artifact) });
        }
        const row = (await tx.select().from(artifacts).where(eq(artifacts.artifactHash, binding.artifactHash!)).limit(1).for("update"))[0];
        if (!row || canonicalSha256(JSON.parse(row.artifactJson)) !== binding.artifactHash) throw Error("NPC_CONTROLLER_ARTIFACT_HASH_MISMATCH");
        binding.status = "BOUND_SHADOW";
        binding.reason = "AUTHORITATIVE_ADMISSION_NOT_RELEASED";
      } catch (error) {
        // Only known invalid-controller failures are recoverable; SQL/transport failures abort atomically.
        if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError) && !(error instanceof Error && error.message.startsWith("NPC_"))) throw error;
        binding.artifactHash = null;
        binding.status = "CANONICAL_FALLBACK";
        binding.reason = "CONTROLLER_VERIFICATION_FAILED";
      }
    }
  }
  const parsed = Binding.parse(binding), bindingHash = canonicalSha256(parsed);
  await tx.insert(bindings).values({ npcId, genesisReceiptId, bindingHash, bindingJson: JSON.stringify(parsed) });
  return { ...parsed, bindingHash };
}

export async function readNpcControllerBindingInTransaction(tx: NpcTransaction, npcId: string): Promise<NpcControllerBinding | null> {
  const row = (await tx.select().from(bindings).where(eq(bindings.npcId, npcId)).limit(1).for("update"))[0];
  if (!row) return null; // pre-registry NPC: no migration by reading
  const binding = Binding.parse(JSON.parse(row.bindingJson));
  if (binding.npcId !== npcId || binding.genesisReceiptId !== row.genesisReceiptId || canonicalSha256(binding) !== row.bindingHash) throw Error("NPC_CONTROLLER_BINDING_CORRUPT");
  return { ...binding, bindingHash: row.bindingHash };
}

export async function readNpcControllerBinding(npcId: string) {
  const db = await getDb(); if (!db) throw Error("NPC_DATABASE_REQUIRED");
  return db.transaction(tx => readNpcControllerBindingInTransaction(tx, npcId));
}

/** Always resolves the immutable binding, never the current archetype pointer. */
export async function readBoundController(tx: NpcTransaction, npcId: string) {
  const binding = await readNpcControllerBindingInTransaction(tx, npcId);
  if (!binding || binding.status !== "BOUND_SHADOW" || !binding.releaseHash) return { binding, candidate: null };
  const { release, approved } = await readRelease(tx, binding.releaseHash);
  const selected = binding.individualMutationReceiptId ? await approvedPolicy(tx, binding.individualMutationReceiptId) : approved;
  if (binding.archetypeId !== release.archetypeId || binding.registryRevision !== release.revision || binding.artifactHash !== selected.candidate.artifactHash || selected.candidate.archetypeId !== binding.archetypeId || (binding.individualVersionId && (selected.policy.id !== binding.individualVersionId || selected.policy.npcId !== npcId))) throw Error("NPC_CONTROLLER_BINDING_SCOPE_MISMATCH");
  const row = (await tx.select().from(artifacts).where(eq(artifacts.artifactHash, binding.artifactHash!)).limit(1).for("update"))[0];
  if (!row || canonicalSha256(JSON.parse(row.artifactJson)) !== binding.artifactHash) throw Error("NPC_CONTROLLER_ARTIFACT_HASH_MISMATCH");
  return { binding, candidate: selected.candidate };
}
