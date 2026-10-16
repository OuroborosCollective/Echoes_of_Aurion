/**
 * Aurion Causal Investigation Graph — shared contract surface.
 *
 * Issue #782: Deterministic investigation layer on top of the player-facing
 * rumor projection (#781). Players connect, compare and challenge claims
 * produced by the confirmed #487 information ecology; this module never
 * invents facts.
 *
 * Core model:
 *
 *   visible claims
 *     -> clue graph
 *     -> prerequisites / relations
 *     -> contradiction or corroboration candidate
 *     -> player deduction intent
 *     -> server validation
 *     -> deduction receipt
 *     -> optional existing quest/action opportunity
 *
 * Hard rule: a deduction modifies only player/investigation state until a
 * validated gameplay action follows. `deduction != world truth`. This module
 * has no world-mutation path and no runtime LLM dependency.
 *
 * Determinism rules: canonical node/relation ordering, order-independent
 * ingestion, logical indices only, no wall-clock, no randomness. The graph
 * is bound to the source projection hash; stale projection revisions are
 * rejected at deduction validation time.
 */
import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  verifyRumorProjection,
  type RumorClaimProjection,
  type RumorProjection,
} from "./rumorProjectionProtocol";

// ---------------------------------------------------------------------------
// Version / ruleset
// ---------------------------------------------------------------------------

export const INVESTIGATION_GRAPH_PROTOCOL = "aurion.investigation-graph.v1" as const;
export const INVESTIGATION_GRAPH_RULESET = "aurion.investigation-graph.ruleset.v1" as const;

/** Selection bounds for a deduction intent. */
export const DEDUCTION_MIN_CLAIMS = 2;
export const DEDUCTION_MAX_CLAIMS = 8;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const investigationSourceClassSchema = z.enum([
  "WITNESS",
  "DOCUMENT",
  "WORLD_EVIDENCE",
  "HEARSAY",
]);
export type InvestigationSourceClass = z.infer<typeof investigationSourceClassSchema>;

export const investigationNodeSchema = z.strictObject({
  claimId: identifier,
  /** Logical index at which the claim became visible to this viewer. */
  revealedAtIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sourceClass: investigationSourceClassSchema,
});
export type InvestigationNode = Readonly<z.infer<typeof investigationNodeSchema>>;

export const investigationRelationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CORROBORATES"), a: identifier, b: identifier }),
  z.strictObject({ kind: z.literal("CONTRADICTS"), a: identifier, b: identifier }),
  z.strictObject({ kind: z.literal("REQUIRES"), from: identifier, to: identifier }),
]);
export type InvestigationRelation = Readonly<z.infer<typeof investigationRelationSchema>>;

export const investigationGraphSchema = z.strictObject({
  version: z.literal(INVESTIGATION_GRAPH_PROTOCOL),
  ruleset: z.literal(INVESTIGATION_GRAPH_RULESET),
  viewerId: identifier,
  worldId: identifier,
  /** Revision token: the #781 projection this graph was built from. */
  sourceProjectionHash: sha256,
  nodes: z.array(investigationNodeSchema),
  relations: z.array(investigationRelationSchema),
  graphHash: sha256,
});
export type InvestigationGraph = Readonly<z.infer<typeof investigationGraphSchema>>;

export const deductionTypeSchema = z.enum(["affirm", "challenge", "chain"]);
export type DeductionType = z.infer<typeof deductionTypeSchema>;

export const deductionIntentSchema = z.strictObject({
  actorId: identifier,
  selectedClaimIds: z.array(identifier),
  deductionType: deductionTypeSchema,
  sourceProjectionHash: sha256,
});
export type DeductionIntent = Readonly<z.infer<typeof deductionIntentSchema>>;

export const deductionReceiptSchema = z.strictObject({
  id: identifier,
  actorId: identifier,
  deductionType: deductionTypeSchema,
  /** Canonically ordered claim selection. */
  selectedClaimIds: z.array(identifier).min(DEDUCTION_MIN_CLAIMS).max(DEDUCTION_MAX_CLAIMS),
  sourceProjectionHash: sha256,
  graphHash: sha256,
  result: z.literal("validated"),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DeductionReceipt = Readonly<z.infer<typeof deductionReceiptSchema>>;

/**
 * Versioned prerequisite table: predicate -> predicates that must also be
 * knowable for a REQUIRES edge to exist. Design data, part of the ruleset;
 * never runtime-generated.
 */
export type InvestigationPrerequisites = Readonly<Record<string, readonly string[]>>;

// ---------------------------------------------------------------------------
// Deterministic derivations
// ---------------------------------------------------------------------------

/**
 * Source class of a clue, derived from the confirmed claim only.
 * Communicated claims are hearsay; otherwise the canonical source receipt
 * kind decides between witness, document and world evidence.
 */
export function deriveSourceClass(claim: RumorClaimProjection): InvestigationSourceClass {
  if (claim.evidenceClass === "COMMUNICATED") return "HEARSAY";
  switch (claim.sourceKind) {
    case "world_receipt":
    case "npc_action_receipt":
      return "WORLD_EVIDENCE";
    case "quest_receipt":
      return "DOCUMENT";
    case "npc_decision_receipt":
    case "npc_memory_receipt":
    case "semantic_graph_receipt":
      return "WITNESS";
  }
}

function relationSortKey(relation: InvestigationRelation): string {
  if (relation.kind === "REQUIRES") return `REQUIRES:${relation.from}:${relation.to}`;
  return `${relation.kind}:${relation.a}:${relation.b}`;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build the deterministic investigation graph over the claims a viewer can
 * actually see. Ingestion is order-independent: nodes and relations are
 * canonically sorted before hashing, and the graph binds the source
 * projection hash as its revision token.
 *
 * Hidden/private claims cannot become nodes — they are absent from the #781
 * projection by construction.
 *
 * @throws RUMOR_PROJECTION_HASH_MISMATCH if the projection content drifted.
 */
export function buildInvestigationGraph(input: Readonly<{
  projection: RumorProjection;
  prerequisites?: InvestigationPrerequisites;
}>): InvestigationGraph {
  const projection = verifyRumorProjection(input.projection);
  const prerequisites = input.prerequisites ?? {};

  const nodes: InvestigationNode[] = projection.claims
    .map(claim => investigationNodeSchema.parse({
      claimId: claim.claimId,
      revealedAtIndex: claim.projectionIndex,
      sourceClass: deriveSourceClass(claim),
    }))
    .sort((a, b) => a.claimId.localeCompare(b.claimId));

  const relations = new Map<string, InvestigationRelation>();
  for (const claim of projection.claims) {
    for (const other of claim.corroboratedBy) {
      const [a, b] = [claim.claimId, other].sort();
      const relation: InvestigationRelation = { kind: "CORROBORATES", a, b };
      relations.set(relationSortKey(relation), relation);
    }
    for (const other of claim.contradictedBy) {
      const [a, b] = [claim.claimId, other].sort();
      const relation: InvestigationRelation = { kind: "CONTRADICTS", a, b };
      relations.set(relationSortKey(relation), relation);
    }
  }
  const byPredicate = new Map<string, RumorClaimProjection[]>();
  for (const claim of projection.claims) {
    const bucket = byPredicate.get(claim.predicate);
    if (bucket) bucket.push(claim);
    else byPredicate.set(claim.predicate, [claim]);
  }
  for (const [predicate, required] of Object.entries(prerequisites)) {
    const from = byPredicate.get(predicate);
    if (!from) continue;
    for (const requiredPredicate of [...required].sort()) {
      const to = byPredicate.get(requiredPredicate) ?? [];
      for (const source of from) {
        for (const target of to) {
          if (source.claimId === target.claimId) continue;
          const relation: InvestigationRelation = {
            kind: "REQUIRES",
            from: target.claimId,
            to: source.claimId,
          };
          relations.set(relationSortKey(relation), relation);
        }
      }
    }
  }

  const orderedRelations = [...relations.values()].sort((a, b) =>
    relationSortKey(a).localeCompare(relationSortKey(b))
  );

  const unsigned = {
    version: INVESTIGATION_GRAPH_PROTOCOL,
    ruleset: INVESTIGATION_GRAPH_RULESET,
    viewerId: projection.viewerId,
    worldId: projection.worldId,
    sourceProjectionHash: projection.projectionHash,
    nodes,
    relations: orderedRelations,
  };
  const graphHash = canonicalSha256({
    domain: "aurion.investigation-graph.v1",
    value: unsigned,
  });
  return investigationGraphSchema.parse({ ...unsigned, graphHash });
}

/** Fail-closed graph hash verification. */
export function verifyInvestigationGraph(graph: InvestigationGraph): InvestigationGraph {
  const parsed = investigationGraphSchema.parse(graph);
  const { graphHash, ...unsigned } = parsed;
  const expected = canonicalSha256({
    domain: "aurion.investigation-graph.v1",
    value: unsigned,
  });
  if (expected !== graphHash) {
    throw new Error("INVESTIGATION_GRAPH_HASH_MISMATCH");
  }
  return Object.freeze(parsed);
}

// ---------------------------------------------------------------------------
// Deduction validation
// ---------------------------------------------------------------------------

function hasRelation(
  relations: readonly InvestigationRelation[],
  kind: "CORROBORATES" | "CONTRADICTS",
  selection: ReadonlySet<string>,
): boolean {
  return relations.some(relation =>
    relation.kind === kind && selection.has(relation.a) && selection.has(relation.b)
  );
}

/**
 * True when the REQUIRES edges restricted to the selection form one rooted
 * cover: exactly one root without incoming edge, every other node reachable
 * from it. Deterministic, cycle-safe (a cycle has no root and is rejected).
 */
function isSpannedByRequires(
  relations: readonly InvestigationRelation[],
  selection: ReadonlySet<string>,
): boolean {
  const incoming = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.kind !== "REQUIRES") continue;
    if (!selection.has(relation.from) || !selection.has(relation.to)) continue;
    const bucket = incoming.get(relation.to);
    if (bucket) bucket.push(relation.from);
    else incoming.set(relation.to, [relation.from]);
  }
  const roots = [...selection].filter(claimId => !incoming.has(claimId));
  if (roots.length !== 1) return false;
  const reachable = new Set<string>(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of relations) {
      if (relation.kind !== "REQUIRES") continue;
      if (!selection.has(relation.from) || !selection.has(relation.to)) continue;
      if (reachable.has(relation.from) && !reachable.has(relation.to)) {
        reachable.add(relation.to);
        grew = true;
      }
    }
  }
  return reachable.size === selection.size;
}

/**
 * Server-side validation of a player deduction intent against the confirmed
 * investigation graph. On success returns a deterministic deduction receipt
 * (investigation state only — never world truth). On any rule violation the
 * function throws a typed error; invalid deductions produce no receipt.
 *
 * Rejections (fail closed):
 *  - DEDUCTION_STALE_PROJECTION — intent bound to an old projection revision
 *  - DEDUCTION_ACTOR_MISMATCH — actor is not the projection viewer
 *  - DEDUCTION_UNKNOWN_CLAIM — selected claim is not visible (covers
 *    hidden/private claims, which are absent from the projection)
 *  - DEDUCTION_DUPLICATE_CLAIM / DEDUCTION_ARITY_INVALID
 *  - DEDUCTION_CONTRADICTION_PRESENT — affirm over unresolved contradiction
 *  - DEDUCTION_RELATION_REQUIRED — missing corroboration/contradiction/chain
 */
export function validateDeductionIntent(input: Readonly<{
  intent: DeductionIntent;
  graph: InvestigationGraph;
}>): DeductionReceipt {
  const graph = verifyInvestigationGraph(input.graph);
  const intent = deductionIntentSchema.parse(input.intent);

  if (intent.sourceProjectionHash !== graph.sourceProjectionHash) {
    throw new Error("DEDUCTION_STALE_PROJECTION");
  }
  if (intent.actorId !== graph.viewerId) {
    throw new Error("DEDUCTION_ACTOR_MISMATCH");
  }
  const selected = [...intent.selectedClaimIds].sort();
  if (selected.length < DEDUCTION_MIN_CLAIMS || selected.length > DEDUCTION_MAX_CLAIMS) {
    throw new Error("DEDUCTION_ARITY_INVALID");
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error("DEDUCTION_DUPLICATE_CLAIM");
  }
  const nodeIds = new Set(graph.nodes.map(node => node.claimId));
  for (const claimId of selected) {
    if (!nodeIds.has(claimId)) {
      throw new Error("DEDUCTION_UNKNOWN_CLAIM");
    }
  }
  const selection = new Set(selected);

  if (intent.deductionType === "affirm") {
    if (hasRelation(graph.relations, "CONTRADICTS", selection)) {
      throw new Error("DEDUCTION_CONTRADICTION_PRESENT");
    }
    if (!hasRelation(graph.relations, "CORROBORATES", selection)) {
      throw new Error("DEDUCTION_RELATION_REQUIRED");
    }
  } else if (intent.deductionType === "challenge") {
    if (!hasRelation(graph.relations, "CONTRADICTS", selection)) {
      throw new Error("DEDUCTION_RELATION_REQUIRED");
    }
  } else {
    if (!isSpannedByRequires(graph.relations, selection)) {
      throw new Error("DEDUCTION_RELATION_REQUIRED");
    }
  }

  const unsigned = {
    actorId: intent.actorId,
    deductionType: intent.deductionType,
    selectedClaimIds: selected,
    sourceProjectionHash: intent.sourceProjectionHash,
    graphHash: graph.graphHash,
    result: "validated" as const,
  };
  const id = "ded_" + canonicalSha256({
    domain: "aurion.deduction-receipt-id.v1",
    value: unsigned,
  }).slice("sha256:".length, "sha256:".length + 59);
  const receiptHash = canonicalSha256({
    domain: "aurion.deduction-receipt.v1",
    value: { ...unsigned, id },
  }).slice("sha256:".length);
  return deductionReceiptSchema.parse({ ...unsigned, id, receiptHash });
}
