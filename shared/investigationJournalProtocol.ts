/**
 * Aurion Investigation Journal & Rumor Board — shared Aurion readmodel contract.
 *
 * Issue #784: Exposes the causal rumor/investigation state to players as a
 * journal/board without making the client authoritative.
 *
 *   server-confirmed rumor/readmodel
 *     -> Aurion client projection
 *     -> journal / board / map hints
 *
 * Client may group claims, show source class and confidence bands, show
 * discovered relations and submit deduction intents built from this
 * readmodel. Client may NOT invent clues, mark truth, complete
 * investigations locally, grant rewards or mutate NPC memory/world state —
 * and this contract carries no data that would let it: hidden/private
 * claims are absent by #781 construction, and every deduction intent is
 * revalidated server-side against the bound projection revision (#782).
 *
 * Guidance levels (Whisper/Plot/Conspiracy) are presentation policies only.
 * They decide which fields the UI renders; they never alter canonical claim
 * availability.
 */
import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import { verifyRumorProjection, type RumorClaimProjection, type RumorProjection } from "./rumorProjectionProtocol";
import {
  deductionIntentSchema,
  verifyInvestigationGraph,
  type DeductionIntent,
  type DeductionType,
  type InvestigationGraph,
} from "./investigationGraphProtocol";

// ---------------------------------------------------------------------------
// Version / ruleset
// ---------------------------------------------------------------------------

export const INVESTIGATION_JOURNAL_PROTOCOL = "aurion.investigation-journal.v1" as const;
export const INVESTIGATION_JOURNAL_RULESET = "aurion.investigation-journal.ruleset.v1" as const;

/** Q16 confidence band thresholds (presentation only). */
export const JOURNAL_CONFIDENCE_HIGH_Q16 = 49_152;
export const JOURNAL_CONFIDENCE_MEDIUM_Q16 = 24_576;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const journalConfidenceBandSchema = z.enum(["low", "medium", "high"]);
export type JournalConfidenceBand = z.infer<typeof journalConfidenceBandSchema>;

export const journalGuidanceSchema = z.enum(["whisper", "plot", "conspiracy"]);
export type JournalGuidance = z.infer<typeof journalGuidanceSchema>;

export const journalEntrySchema = z.strictObject({
  claimId: identifier,
  subjectId: identifier,
  predicate: identifier,
  value: z.string().trim().min(1).max(255),
  sourceClass: z.enum(["WITNESS", "DOCUMENT", "WORLD_EVIDENCE", "HEARSAY"]),
  confidenceBand: journalConfidenceBandSchema,
  /** True when the projection masks provenance (partial disclosure). */
  provenanceMasked: z.boolean(),
  /** Claim ids of visible corroborating claims. */
  corroboratedBy: z.array(identifier),
  /** Claim ids of visible contradicting claims. */
  contradictedBy: z.array(identifier),
});
export type JournalEntry = Readonly<z.infer<typeof journalEntrySchema>>;

export const journalInvestigationSchema = z.strictObject({
  investigationId: identifier,
  claimKey: sha256,
  subjectId: identifier,
  predicate: identifier,
  entries: z.array(journalEntrySchema),
  /** True when the visible claims disagree with each other. */
  hasContradiction: z.boolean(),
});
export type JournalInvestigation = Readonly<z.infer<typeof journalInvestigationSchema>>;

export const investigationJournalSchema = z.strictObject({
  version: z.literal(INVESTIGATION_JOURNAL_PROTOCOL),
  ruleset: z.literal(INVESTIGATION_JOURNAL_RULESET),
  viewerId: identifier,
  worldId: identifier,
  atIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  guidance: journalGuidanceSchema,
  /** Revision token: the #781 projection this journal renders. */
  sourceProjectionHash: sha256,
  sourceGraphHash: sha256,
  investigations: z.array(journalInvestigationSchema),
  journalHash: sha256,
});
export type InvestigationJournal = Readonly<z.infer<typeof investigationJournalSchema>>;

// ---------------------------------------------------------------------------
// Deterministic presentation derivations
// ---------------------------------------------------------------------------

export function confidenceBand(confidenceQ16: number): JournalConfidenceBand {
  if (!Number.isSafeInteger(confidenceQ16) || confidenceQ16 < 0 || confidenceQ16 > 65_536) {
    throw new Error("JOURNAL_CONFIDENCE_INVALID");
  }
  if (confidenceQ16 >= JOURNAL_CONFIDENCE_HIGH_Q16) return "high";
  if (confidenceQ16 >= JOURNAL_CONFIDENCE_MEDIUM_Q16) return "medium";
  return "low";
}

/**
 * Presentation policy per guidance level. Whisper gives full provenance
 * hints, Plot keeps relations, Conspiracy is minimal guidance. Availability
 * of claims is identical on every level.
 */
export function guidancePresentation(guidance: JournalGuidance): Readonly<{
  showProvenance: boolean;
  showRelations: boolean;
}> {
  journalGuidanceSchema.parse(guidance);
  return Object.freeze({
    showProvenance: guidance === "whisper",
    showRelations: guidance !== "conspiracy",
  });
}

// ---------------------------------------------------------------------------
// Journal construction (server side)
// ---------------------------------------------------------------------------

/**
 * Build the server-confirmed journal/board readmodel from the verified #781
 * projection and #782 graph. Deterministic: same inputs => same journalHash.
 * The readmodel never contains hidden/private claims because the projection
 * does not contain them.
 */
export function buildInvestigationJournal(input: Readonly<{
  projection: RumorProjection;
  graph: InvestigationGraph;
  guidance: JournalGuidance;
}>): InvestigationJournal {
  const projection = verifyRumorProjection(input.projection);
  const graph = verifyInvestigationGraph(input.graph);
  if (graph.sourceProjectionHash !== projection.projectionHash) {
    throw new Error("JOURNAL_PROJECTION_GRAPH_MISMATCH");
  }
  if (graph.viewerId !== projection.viewerId || graph.worldId !== projection.worldId) {
    throw new Error("JOURNAL_SCOPE_MISMATCH");
  }
  const guidance = journalGuidanceSchema.parse(input.guidance);

  const sourceClassByClaimId = new Map(graph.nodes.map(node => [node.claimId, node.sourceClass] as const));
  const groups = new Map<string, RumorClaimProjection[]>();
  for (const claim of projection.claims) {
    const bucket = groups.get(claim.claimKey);
    if (bucket) bucket.push(claim);
    else groups.set(claim.claimKey, [claim]);
  }

  const investigations: JournalInvestigation[] = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([claimKey, claims]) => {
      const ordered = [...claims].sort((a, b) =>
        a.value.localeCompare(b.value) || a.claimId.localeCompare(b.claimId)
      );
      const entries: JournalEntry[] = ordered.map(claim => journalEntrySchema.parse({
        claimId: claim.claimId,
        subjectId: claim.subjectId,
        predicate: claim.predicate,
        value: claim.value,
        sourceClass: sourceClassByClaimId.get(claim.claimId) ?? "HEARSAY",
        confidenceBand: confidenceBand(claim.confidenceQ16),
        provenanceMasked: claim.visibility === "partial",
        corroboratedBy: [...claim.corroboratedBy].sort(),
        contradictedBy: [...claim.contradictedBy].sort(),
      }));
      const first = ordered[0];
      const investigationId = "inv_" + canonicalSha256({
        domain: "aurion.investigation-journal-investigation-id.v1",
        claimKey,
      }).slice("sha256:".length, "sha256:".length + 59);
      return journalInvestigationSchema.parse({
        investigationId,
        claimKey,
        subjectId: first.subjectId,
        predicate: first.predicate,
        entries,
        hasContradiction: entries.some(entry => entry.contradictedBy.length > 0),
      });
    });

  const unsigned = {
    version: INVESTIGATION_JOURNAL_PROTOCOL,
    ruleset: INVESTIGATION_JOURNAL_RULESET,
    viewerId: projection.viewerId,
    worldId: projection.worldId,
    atIndex: projection.atIndex,
    guidance,
    sourceProjectionHash: projection.projectionHash,
    sourceGraphHash: graph.graphHash,
    investigations,
  };
  const journalHash = canonicalSha256({
    domain: "aurion.investigation-journal.v1",
    value: unsigned,
  });
  return investigationJournalSchema.parse({ ...unsigned, journalHash });
}

/** Fail-closed journal hash verification. */
export function verifyInvestigationJournal(journal: InvestigationJournal): InvestigationJournal {
  const parsed = investigationJournalSchema.parse(journal);
  const { journalHash, ...unsigned } = parsed;
  const expected = canonicalSha256({
    domain: "aurion.investigation-journal.v1",
    value: unsigned,
  });
  if (expected !== journalHash) {
    throw new Error("JOURNAL_HASH_MISMATCH");
  }
  return Object.freeze(parsed);
}

// ---------------------------------------------------------------------------
// Deduction intent builder (client-safe)
// ---------------------------------------------------------------------------

/**
 * Build a deduction intent from a confirmed journal and a user selection.
 * The client can only reference claims the server already disclosed; the
 * intent binds the journal's projection revision, and the server revalidates
 * everything through #782 validateDeductionIntent. A stale journal produces
 * a stale intent, which the server rejects (DEDUCTION_STALE_PROJECTION).
 */
export function buildDeductionIntentFromJournal(input: Readonly<{
  journal: InvestigationJournal;
  selectedClaimIds: readonly string[];
  deductionType: DeductionType;
}>): DeductionIntent {
  const journal = verifyInvestigationJournal(input.journal);
  const known = new Set(
    journal.investigations.flatMap(investigation => investigation.entries.map(entry => entry.claimId)),
  );
  for (const claimId of input.selectedClaimIds) {
    if (!known.has(claimId)) {
      throw new Error("JOURNAL_UNKNOWN_CLAIM");
    }
  }
  return deductionIntentSchema.parse({
    actorId: journal.viewerId,
    selectedClaimIds: [...input.selectedClaimIds],
    deductionType: input.deductionType,
    sourceProjectionHash: journal.sourceProjectionHash,
  });
}
