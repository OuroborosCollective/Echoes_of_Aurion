/**
 * Aurion Player-Facing Causal Rumor Projection — shared contract surface.
 *
 * Issue #781: Turns the confirmed NPC Information Ecology (#487) into a
 * deterministic player-facing rumor/readmodel layer without creating a new
 * world, quest, NPC, or narrative authority.
 *
 * Canonical boundary (see causal-rumor-and-investigation-gameplay.md):
 *
 *   world truth
 *     -> causal receipt
 *     -> observation / witness
 *     -> information claim
 *     -> propagation / trust / contradiction / expiry
 *     -> player-facing rumor projection
 *
 * A rumor NEVER mutates world truth. This module has no mutation path; it is
 * a pure projection over already confirmed #487 receipts.
 *
 * Determinism rules (Issue #468 §3, Issue #781):
 *  - Q16 fixed-point presentation values are derived by exact integer
 *    arithmetic from the canonical BPS fields of #487 receipts.
 *  - Canonical ordering of claims, witnesses, transmissions and relations.
 *  - Logical-index expiry only; no wall-clock, no Math.random, no Date.now.
 *  - Duplicate propagation input is idempotent.
 *  - Same confirmed input graph + ruleset version => same projectionHash.
 *  - Contradictory claims remain distinct projections; never collapsed.
 *  - Trust may affect disclosure and confidence presentation; it never
 *    changes the underlying source receipt truth.
 */
import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  NPC_INFORMATION_TRUST_MIN_CORROBORATIONS,
  NPC_INFORMATION_TRUST_THRESHOLD_BPS,
  npcInformationReceiptSchema,
  type NpcInformationReceipt,
} from "./npcInformationEcologyProtocol";

// ---------------------------------------------------------------------------
// Version / ruleset
// ---------------------------------------------------------------------------

export const RUMOR_PROJECTION_PROTOCOL = "aurion.rumor-projection.v1" as const;
export const RUMOR_PROJECTION_RULESET = "aurion.rumor-projection.ruleset.v1" as const;

/** Q16.16 fixed-point unit. */
export const RUMOR_Q16_ONE = 65_536;

/**
 * Maximum claims per projection. Mirrors the 512-receipt readback page bound
 * of the #487 persistence layer.
 */
export const RUMOR_PROJECTION_MAX_CLAIMS = 512;

/**
 * Trust (in BPS toward an audience member) required for a LOCAL claim to
 * become partially visible outside its direct audience. Aligned with the
 * canonical #487 trust threshold.
 */
export const RUMOR_LOCAL_DISCLOSURE_TRUST_THRESHOLD_BPS = NPC_INFORMATION_TRUST_THRESHOLD_BPS;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const rumorEvidenceClassSchema = z.enum(["DIRECT", "COMMUNICATED", "INFERRED"]);
export type RumorEvidenceClass = z.infer<typeof rumorEvidenceClassSchema>;

export const rumorDisclosureClassSchema = z.enum(["PRIVATE", "LOCAL", "PUBLIC"]);
export type RumorDisclosureClass = z.infer<typeof rumorDisclosureClassSchema>;

export const rumorVisibilitySchema = z.enum(["visible", "partial"]);
export type RumorVisibility = z.infer<typeof rumorVisibilitySchema>;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const q16 = z.number().int().min(0).max(RUMOR_Q16_ONE);
const logicalIndex = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const rumorClaimProjectionSchema = z.strictObject({
  /** Deterministic claim identity derived from the #487 fact identity. */
  claimId: identifier,
  /** Underlying #487 fact identity (provenance link, never authored here). */
  factId: identifier,
  claimKey: sha256,
  subjectId: identifier,
  predicate: identifier,
  value: z.string().trim().min(1).max(255),
  /** Current #487 lifecycle status of the latest confirmed receipt. */
  status: z.enum([
    "experienced",
    "remembered",
    "communicated",
    "corroborated",
    "contradicted",
    "trusted",
    "uncertain",
  ]),
  /** Kind of the canonical source receipt that anchors this claim. */
  sourceKind: z.enum([
    "npc_decision_receipt",
    "npc_memory_receipt",
    "npc_action_receipt",
    "world_receipt",
    "quest_receipt",
    "semantic_graph_receipt",
  ]),
  evidenceClass: rumorEvidenceClassSchema,
  /** Q16 presentation confidence, exact integer derivation from BPS. */
  confidenceQ16: q16,
  /** Q16 logical freshness, derived from logical indices only. */
  freshnessQ16: q16,
  /** Canonical lineage receipt ids; empty when visibility masks provenance. */
  sourceReceiptIds: z.array(identifier),
  witnessIds: z.array(identifier),
  transmissionReceiptIds: z.array(identifier),
  /** Visible claims with the same claimKey but a different value. */
  contradictedBy: z.array(identifier),
  /** Visible claims with the same claimKey and the same value. */
  corroboratedBy: z.array(identifier),
  disclosureClass: rumorDisclosureClassSchema,
  visibility: rumorVisibilitySchema,
  /** Logical index of the latest confirmed receipt behind this claim. */
  projectionIndex: logicalIndex,
  expiresAtIndex: logicalIndex.positive().nullable(),
});

export type RumorClaimProjection = Readonly<z.infer<typeof rumorClaimProjectionSchema>>;

export const rumorProjectionSchema = z.strictObject({
  version: z.literal(RUMOR_PROJECTION_PROTOCOL),
  ruleset: z.literal(RUMOR_PROJECTION_RULESET),
  viewerId: identifier,
  worldId: identifier,
  /** Logical index this projection is confirmed at (projection revision). */
  atIndex: logicalIndex,
  claims: z.array(rumorClaimProjectionSchema),
  projectionHash: sha256,
});

export type RumorProjection = Readonly<z.infer<typeof rumorProjectionSchema>>;

// ---------------------------------------------------------------------------
// Deterministic fixed-point helpers
// ---------------------------------------------------------------------------

function assertIndex(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`RUMOR_PROJECTION_${field.toUpperCase()}_INVALID`);
  }
}

/**
 * Exact integer BPS -> Q16 conversion: floor(bps * 65536 / 10000).
 * Inputs are bounded integers, so the product is exact in IEEE-754.
 */
export function bpsToQ16(bps: number): number {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error("RUMOR_PROJECTION_BPS_INVALID");
  }
  return Math.floor((bps * RUMOR_Q16_ONE) / 10_000);
}

/**
 * Logical freshness in Q16. Claims without logical expiry stay maximally
 * fresh; expired claims have freshness 0. Uses logical indices only.
 */
export function freshnessQ16(receipt: NpcInformationReceipt, atIndex: number): number {
  assertIndex(atIndex, "at_index");
  if (receipt.expiresAtIndex === null) return RUMOR_Q16_ONE;
  const remaining = receipt.expiresAtIndex - atIndex;
  if (remaining <= 0) return 0;
  const span = receipt.expiresAtIndex - receipt.logicalIndex;
  if (span <= 0) return 0;
  return Math.min(RUMOR_Q16_ONE, Math.floor((RUMOR_Q16_ONE * remaining) / span));
}

/** True when the claim is logically expired at the given index. */
export function isLogicallyExpired(receipt: NpcInformationReceipt, atIndex: number): boolean {
  return receipt.status === "expired" ||
    (receipt.expiresAtIndex !== null && atIndex >= receipt.expiresAtIndex);
}

// ---------------------------------------------------------------------------
// Deterministic derivations
// ---------------------------------------------------------------------------

function hashHex(value: unknown): string {
  return canonicalSha256(value).slice("sha256:".length);
}

/** Deterministic claim identity: same confirmed fact => same claim id. */
export function rumorClaimId(factId: string): string {
  return "rum_" + hashHex({
    domain: "aurion.rumor-claim-id.v1",
    factId,
  }).slice(0, 60);
}

/**
 * Derive the evidence class from the confirmed receipt lineage.
 * DIRECT: the knower is the original witness and never received it transitively.
 * COMMUNICATED: the claim reached the knower through a transmission receipt.
 * INFERRED: everything else (e.g. trust derived from corroboration only).
 */
export function deriveEvidenceClass(receipt: NpcInformationReceipt): RumorEvidenceClass {
  if (receipt.communicatedByNpcId !== null || receipt.communicationReceiptId !== null) {
    return "COMMUNICATED";
  }
  if (receipt.ownerNpcId === receipt.witnessNpcId) {
    return "DIRECT";
  }
  return "INFERRED";
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

type FactGroup = Readonly<{
  factId: string;
  lineage: readonly NpcInformationReceipt[];
  latest: NpcInformationReceipt;
}>;

function groupLatestByFact(receipts: readonly NpcInformationReceipt[]): readonly FactGroup[] {
  // Canonical order first: input order and duplicates must not matter.
  const ordered = [...receipts].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map<string, NpcInformationReceipt>();
  for (const receipt of ordered) {
    // Duplicate propagation is idempotent: identical receipt id collapses.
    byId.set(receipt.id, receipt);
  }
  const groups = new Map<string, NpcInformationReceipt[]>();
  for (const receipt of byId.values()) {
    const group = groups.get(receipt.factId);
    if (group) group.push(receipt);
    else groups.set(receipt.factId, [receipt]);
  }
  const result: FactGroup[] = [];
  for (const [factId, lineage] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const latest = [...lineage].sort((a, b) =>
      b.logicalIndex - a.logicalIndex || b.id.localeCompare(a.id)
    )[0];
    result.push(Object.freeze({ factId, lineage: Object.freeze(lineage), latest }));
  }
  return Object.freeze(result);
}

function audienceOf(group: FactGroup): ReadonlySet<string> {
  // Every communication transition creates a receipt owned by the receiver,
  // so the owner set across the lineage is the causal audience of the claim.
  return new Set(group.lineage.map(receipt => receipt.ownerNpcId));
}

function classifyDisclosure(
  group: FactGroup,
  sameKeyGroups: readonly FactGroup[],
): RumorDisclosureClass {
  // PUBLIC: the claim value is independently corroborated by at least the
  // canonical minimum number of distinct facts (independent witnesses/sources
  // are already enforced by the #487 reconciliation contract).
  const sameValueFacts = sameKeyGroups.filter(other =>
    other.latest.value === group.latest.value
  ).length;
  if (sameValueFacts >= NPC_INFORMATION_TRUST_MIN_CORROBORATIONS) {
    return "PUBLIC";
  }
  // LOCAL: the claim propagated through at least one transmission.
  if (group.lineage.some(receipt => receipt.communicationReceiptId !== null)) {
    return "LOCAL";
  }
  return "PRIVATE";
}

function resolveVisibility(input: Readonly<{
  disclosureClass: RumorDisclosureClass;
  // Full #487 lifecycle union: expired facts are filtered before this call,
  // so every remaining status (including the claim-schema subset) is valid.
  status: NpcInformationReceipt["status"];
  audience: ReadonlySet<string>;
  viewerId: string;
  viewerTrustBpsByActor: Readonly<Record<string, number>>;
}>): RumorVisibility | "hidden" {
  const { disclosureClass, status, audience, viewerId, viewerTrustBpsByActor } = input;
  if (disclosureClass === "PRIVATE") {
    // Private memory never leaks: only the causal audience may see it.
    return audience.has(viewerId) ? "visible" : "hidden";
  }
  if (disclosureClass === "LOCAL") {
    if (audience.has(viewerId)) return "visible";
    // Trust may disclose a local claim partially, never fully.
    const trusted = [...audience].some(actorId =>
      (viewerTrustBpsByActor[actorId] ?? 0) >= RUMOR_LOCAL_DISCLOSURE_TRUST_THRESHOLD_BPS
    );
    return trusted ? "partial" : "hidden";
  }
  // PUBLIC: visible inside the same world; uncertain/contradicted claims are
  // presented with masked provenance instead of being silently collapsed.
  if (status === "uncertain" || status === "contradicted") return "partial";
  return "visible";
}

function projectClaim(
  group: FactGroup,
  visibility: RumorVisibility,
  disclosureClass: RumorDisclosureClass,
  atIndex: number,
): RumorClaimProjection {
  const latest = group.latest;
  // Expired facts are filtered from the live set before projection; fail
  // closed if one ever reaches this point instead of leaking it (also
  // narrows the #487 status union for the claim schema).
  if (latest.status === "expired") {
    throw new Error("RUMOR_PROJECTION_EXPIRED_CLAIM");
  }
  const lineageOrdered = [...group.lineage].sort((a, b) =>
    a.logicalIndex - b.logicalIndex || a.id.localeCompare(b.id)
  );
  const masked = visibility === "partial";
  const witnessIds = masked ? [] : [...new Set(lineageOrdered.map(receipt => receipt.witnessNpcId))].sort();
  const transmissionReceiptIds = masked
    ? []
    : lineageOrdered
        .map(receipt => receipt.communicationReceiptId)
        .filter((id): id is string => id !== null);
  const sourceReceiptIds = masked ? [] : lineageOrdered.map(receipt => receipt.id);
  return rumorClaimProjectionSchema.parse({
    claimId: rumorClaimId(group.factId),
    factId: group.factId,
    claimKey: latest.claimKey,
    subjectId: latest.subjectId,
    predicate: latest.predicate,
    value: latest.value,
    status: latest.status,
    sourceKind: latest.sourceKind,
    evidenceClass: deriveEvidenceClass(latest),
    confidenceQ16: bpsToQ16(latest.confidenceBps),
    freshnessQ16: freshnessQ16(latest, atIndex),
    sourceReceiptIds,
    witnessIds,
    transmissionReceiptIds,
    contradictedBy: [],
    corroboratedBy: [],
    disclosureClass,
    visibility,
    projectionIndex: latest.logicalIndex,
    expiresAtIndex: latest.expiresAtIndex,
  });
}

/**
 * Project confirmed #487 information receipts into the player-facing rumor
 * readmodel for one viewer in one world at one logical index.
 *
 * The projection is a pure function: same confirmed input graph (in any
 * order, with any duplicates) + same ruleset version => identical output
 * including `projectionHash`. Restart/readback equality follows because the
 * input is the confirmed receipt set.
 *
 * @throws RUMOR_PROJECTION_SCOPE_MISMATCH on any cross-world receipt —
 *         cross-world/scope leaks are rejected, never filtered silently.
 */
export function projectRumorClaims(input: Readonly<{
  viewerId: string;
  worldId: string;
  atIndex: number;
  receipts: readonly NpcInformationReceipt[];
  viewerTrustBpsByActor?: Readonly<Record<string, number>>;
}>): RumorProjection {
  const viewerId = identifier.parse(input.viewerId);
  const worldId = identifier.parse(input.worldId);
  assertIndex(input.atIndex, "at_index");
  const viewerTrustBpsByActor = input.viewerTrustBpsByActor ?? {};
  for (const [actorId, trust] of Object.entries(viewerTrustBpsByActor)) {
    identifier.parse(actorId);
    if (!Number.isSafeInteger(trust) || trust < 0 || trust > 10_000) {
      throw new Error("RUMOR_PROJECTION_TRUST_INVALID");
    }
  }

  const parsed = input.receipts.map(receipt => npcInformationReceiptSchema.parse(receipt));
  for (const receipt of parsed) {
    if (receipt.worldId !== worldId) {
      throw new Error("RUMOR_PROJECTION_SCOPE_MISMATCH");
    }
  }

  const groups = groupLatestByFact(parsed);
  const live = groups.filter(group => !isLogicallyExpired(group.latest, input.atIndex));

  const claims: RumorClaimProjection[] = [];
  for (const group of live) {
    const sameKeyGroups = live.filter(other => other.latest.claimKey === group.latest.claimKey);
    const disclosureClass = classifyDisclosure(group, sameKeyGroups);
    const audience = audienceOf(group);
    const visibility = resolveVisibility({
      disclosureClass,
      status: group.latest.status,
      audience,
      viewerId,
      viewerTrustBpsByActor,
    });
    if (visibility === "hidden") continue;
    claims.push(projectClaim(group, visibility, disclosureClass, input.atIndex));
  }

  // Relation edges only between claims the viewer can actually see; hidden or
  // private claims can never be referenced through the projection.
  const byKey = new Map<string, RumorClaimProjection[]>();
  for (const claim of claims) {
    const bucket = byKey.get(claim.claimKey);
    if (bucket) bucket.push(claim);
    else byKey.set(claim.claimKey, [claim]);
  }
  const linked = claims.map(claim => {
    const peers = byKey.get(claim.claimKey) ?? [];
    const corroboratedBy = peers
      .filter(peer => peer.claimId !== claim.claimId && peer.value === claim.value)
      .map(peer => peer.claimId)
      .sort();
    const contradictedBy = peers
      .filter(peer => peer.claimId !== claim.claimId && peer.value !== claim.value)
      .map(peer => peer.claimId)
      .sort();
    return rumorClaimProjectionSchema.parse({ ...claim, corroboratedBy, contradictedBy });
  });

  // Canonical claim order: claimKey, value, claimId.
  linked.sort((a, b) =>
    a.claimKey.localeCompare(b.claimKey) ||
    a.value.localeCompare(b.value) ||
    a.claimId.localeCompare(b.claimId)
  );
  if (linked.length > RUMOR_PROJECTION_MAX_CLAIMS) {
    throw new Error("RUMOR_PROJECTION_PAGE_REQUIRED");
  }

  const unsigned = {
    version: RUMOR_PROJECTION_PROTOCOL,
    ruleset: RUMOR_PROJECTION_RULESET,
    viewerId,
    worldId,
    atIndex: input.atIndex,
    claims: linked,
  };
  const projectionHash = canonicalSha256({
    domain: "aurion.rumor-projection.v1",
    value: unsigned,
  });
  return rumorProjectionSchema.parse({ ...unsigned, projectionHash });
}

/**
 * Recompute and verify the projection hash. Fail-closed: any drift between
 * content and hash is a hard error, never a silent repair.
 */
export function verifyRumorProjection(projection: RumorProjection): RumorProjection {
  const parsed = rumorProjectionSchema.parse(projection);
  const { projectionHash, ...unsigned } = parsed;
  const expected = canonicalSha256({
    domain: "aurion.rumor-projection.v1",
    value: unsigned,
  });
  if (expected !== projectionHash) {
    throw new Error("RUMOR_PROJECTION_HASH_MISMATCH");
  }
  return Object.freeze(parsed);
}
