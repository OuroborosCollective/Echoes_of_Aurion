// Native Aurion NPC semantic memory graph system.
// Migrated from WASD provenance; active implementation is Aurion-owned.

import { createHash } from "node:crypto";
import { npcAuthority } from "./authority.js";
import { stableCatalogStringify } from "./canonical.js";
import {
  isConfirmedNpcDecision,
  parseNpcMemoryV4,
  verifyNpcMemoryEvidence,
  type ConfirmedNpcDecision,
  type NpcMemoryV4,
} from "./multiMemory.js";
import {
  merchantActionReceiptHash,
  merchantActionReceiptId,
  NPC_ACTION_RECEIPT_VERSION,
  type MerchantActionReceipt,
} from "./actionGateway.js";

export const NPC_SEMANTIC_GRAPH_VERSION = "wasd-npc-semantic-graph.v2" as const;
export const NPC_SEMANTIC_RETRIEVAL_VERSION = "wasd-npc-semantic-retrieval.v1" as const;
export const NPC_SEMANTIC_GRAPH_LIMITS = Object.freeze({
  nodes: 160,
  edges: 384,
  provenanceRefs: 160,
  performedActions: 16,
  traversalDepth: 4,
  candidates: 64,
  results: 32,
  startKeys: 16,
  filterValues: 16,
  bytes: 524288,
});

export type NpcSemanticNodeKind =
  | "actor"
  | "location"
  | "world_event"
  | "goal"
  | "action"
  | "outcome"
  | "polity"
  | "item_resource"
  | "semantic_fact"
  | "procedural_competency";

export type NpcSemanticEdgeKind =
  | "observed_at"
  | "participated_in"
  | "selected_goal"
  | "performed_action"
  | "affected"
  | "related_to"
  | "member_of"
  | "located_in"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "derived_from";

export type NpcSemanticValidity = "active" | "expired" | "contradicted" | "superseded";

export type NpcSemanticProvenanceKind =
  | "decision_receipt"
  | "action_receipt"
  | "effect_readback"
  | "memory_link";

export type NpcSemanticProvenanceRef = Readonly<{
  kind: NpcSemanticProvenanceKind;
  id: string;
  hash: string;
  logicalIndex: number;
  sourceRevision: string;
  sourceSha256: string;
}>;

export type NpcSemanticGraphNode = Readonly<{
  version: typeof NPC_SEMANTIC_GRAPH_VERSION;
  id: string;
  kind: NpcSemanticNodeKind;
  key: string;
  status: NpcSemanticValidity;
  validFromIndex: number;
  validUntilIndex: number | null;
  provenance: readonly NpcSemanticProvenanceRef[];
  payloadHash: string;
}>;

export type NpcSemanticGraphEdge = Readonly<{
  version: typeof NPC_SEMANTIC_GRAPH_VERSION;
  id: string;
  kind: NpcSemanticEdgeKind;
  relationKey: string;
  fromNodeId: string;
  toNodeId: string;
  status: NpcSemanticValidity;
  validFromIndex: number;
  validUntilIndex: number | null;
  provenance: readonly NpcSemanticProvenanceRef[];
  payloadHash: string;
}>;

export type NpcSemanticMemoryGraph = Readonly<{
  version: typeof NPC_SEMANTIC_GRAPH_VERSION;
  retrievalVersion: typeof NPC_SEMANTIC_RETRIEVAL_VERSION;
  npcId: string;
  generation: number;
  authority: ReturnType<typeof npcAuthority>;
  memoryHash: string;
  previousGraphHash: string | null;
  nodes: readonly NpcSemanticGraphNode[];
  edges: readonly NpcSemanticGraphEdge[];
  graphHash: string;
}>;

export type NpcActionEffectReadbackEvidence = Readonly<{
  id: string;
  actionReceiptId: string;
  effectsHash: string;
  npcReceiptId: string;
  npcDecisionHash: string;
  worldReceiptId: string;
  worldReactionHash: string;
  polityId: string;
  polityStateHash: string;
  marketStateHash: string;
  inventoryStateHash: string;
  sourceRevision: string;
  readbackHash: string;
}>;

export type NpcActionMemoryLinkEvidence = Readonly<{
  id: string;
  actionReceiptId: string;
  effectReadbackId: string;
  memoryReceiptId: string;
  npcId: string;
  resolutionIndex: number;
  linkHash: string;
}>;

export type VerifiedPerformedActionEvidence = Readonly<{
  sourceDecision: ConfirmedNpcDecision;
  successorDecision: ConfirmedNpcDecision;
  actionReceipt: MerchantActionReceipt;
  effectReadback: NpcActionEffectReadbackEvidence;
  memoryLink: NpcActionMemoryLinkEvidence;
}>;

export type NpcSemanticGraphQuery = Readonly<{
  logicalIndex: number;
  startKeys?: readonly string[];
  nodeKinds?: readonly NpcSemanticNodeKind[];
  edgeKinds?: readonly NpcSemanticEdgeKind[];
  maxDepth?: number;
  maxCandidates?: number;
  maxResults?: number;
}>;

export type NpcSemanticGraphQueryResult = Readonly<{
  version: typeof NPC_SEMANTIC_RETRIEVAL_VERSION;
  graphHash: string;
  query: Readonly<{
    logicalIndex: number;
    startKeys: readonly string[];
    nodeKinds: readonly NpcSemanticNodeKind[];
    edgeKinds: readonly NpcSemanticEdgeKind[];
    maxDepth: number;
    maxCandidates: number;
    maxResults: number;
  }>;
  results: readonly Readonly<{
    nodeId: string;
    kind: NpcSemanticNodeKind;
    key: string;
    status: "active";
    depth: number;
    score: number;
    payloadHash: string;
  }>[];
  resultHash: string;
}>;

export type NpcSemanticGraphBuildInput = Readonly<{
  memory: NpcMemoryV4;
  memoryReceipts: readonly ConfirmedNpcDecision[];
  performedActions?: readonly VerifiedPerformedActionEvidence[];
  previousGraph?: NpcSemanticMemoryGraph | null;
}>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const hashPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const nodeKinds = Object.freeze([
  "actor", "location", "world_event", "goal", "action", "outcome",
  "polity", "item_resource", "semantic_fact", "procedural_competency",
] as const);

const edgeKinds = Object.freeze([
  "observed_at", "participated_in", "selected_goal", "performed_action",
  "affected", "related_to", "member_of", "located_in",
  "supports", "contradicts", "supersedes", "derived_from",
] as const);

const statuses = Object.freeze(["active", "expired", "contradicted", "superseded"] as const);
const provenanceKinds = Object.freeze(["decision_receipt", "action_receipt", "effect_readback", "memory_link"] as const);

const verifiedPerformedActions = new WeakSet<object>();
const verifiedGraphs = new WeakSet<object>();

const textOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const digest = (value: unknown): string =>
  createHash("sha256").update(stableCatalogStringify(value), "utf8").digest("hex");

const same = (a: unknown, b: unknown): boolean => stableCatalogStringify(a) === stableCatalogStringify(b);

function assertId(value: unknown, code: string): void {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(code);
}
function assertRelationKey(value: unknown, code: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(code);
}
function assertHash(value: unknown, code: string): void {
  if (typeof value !== "string" || !hashPattern.test(value)) throw new Error(code);
}
function assertRevision(value: unknown, code: string): void {
  if (typeof value !== "string" || !revisionPattern.test(value)) throw new Error(code);
}
function assertIndex(value: unknown, code: string): void {
  if (!Number.isInteger(value as number) || (value as number) < 0 || (value as number) > 2147483647) throw new Error(code);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(textOrder);
}

function provenanceOrder(a: NpcSemanticProvenanceRef, b: NpcSemanticProvenanceRef): number {
  return textOrder(a.kind, b.kind) || textOrder(a.id, b.id) || textOrder(a.hash, b.hash);
}

function mergeProvenance(...groups: readonly (readonly NpcSemanticProvenanceRef[])[]): NpcSemanticProvenanceRef[] {
  const map = new Map<string, NpcSemanticProvenanceRef>();
  for (const ref of groups.flat()) {
    const key = `${ref.kind}:${ref.id}:${ref.hash}`;
    const prior = map.get(key);
    if (prior && !same(prior, ref)) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT");
    map.set(key, ref);
  }
  const result = [...map.values()].sort(provenanceOrder);
  if (result.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_LIMIT");
  return deepFreeze(result);
}

interface DecisionSource {
  receiptId: string;
  receiptSha256: string;
  logicalIndex: number;
  authority: { sourceRevision: string; sourceSha256: string };
}

function decisionRef(source: DecisionSource): NpcSemanticProvenanceRef {
  return deepFreeze({
    kind: "decision_receipt",
    id: source.receiptId,
    hash: source.receiptSha256,
    logicalIndex: source.logicalIndex,
    sourceRevision: source.authority.sourceRevision,
    sourceSha256: source.authority.sourceSha256,
  });
}

function confirmedDecisionRef(source: ConfirmedNpcDecision): NpcSemanticProvenanceRef {
  return deepFreeze({
    kind: "decision_receipt",
    id: source.receiptId,
    hash: source.receiptSha256,
    logicalIndex: source.snapshot.decision.resolutionIndex,
    sourceRevision: source.authority.sourceRevision,
    sourceSha256: source.authority.sourceSha256,
  });
}

function actionRef(action: MerchantActionReceipt): NpcSemanticProvenanceRef {
  return deepFreeze({
    kind: "action_receipt",
    id: action.id,
    hash: action.receiptHash,
    logicalIndex: action.resolutionIndex,
    sourceRevision: action.authority.sourceRevision,
    sourceSha256: action.authority.sourceSha256,
  });
}

function effectRef(effect: NpcActionEffectReadbackEvidence, sourceSha256: string, logicalIndex: number): NpcSemanticProvenanceRef {
  return deepFreeze({
    kind: "effect_readback",
    id: effect.id,
    hash: effect.readbackHash,
    logicalIndex,
    sourceRevision: effect.sourceRevision,
    sourceSha256,
  });
}

function linkRef(link: NpcActionMemoryLinkEvidence, authority: ReturnType<typeof npcAuthority>): NpcSemanticProvenanceRef {
  return deepFreeze({
    kind: "memory_link",
    id: link.id,
    hash: link.linkHash,
    logicalIndex: link.resolutionIndex,
    sourceRevision: authority.sourceRevision,
    sourceSha256: authority.sourceSha256,
  });
}

function graphNodeId(npcId: string, kind: string, key: string, provenance: readonly NpcSemanticProvenanceRef[]): string {
  return `smn_${digest([NPC_SEMANTIC_GRAPH_VERSION, npcId, kind, key, provenance]).slice(0, 60)}`;
}

function graphEdgeId(npcId: string, kind: string, relationKey: string, fromNodeId: string, toNodeId: string): string {
  return `sme_${digest([NPC_SEMANTIC_GRAPH_VERSION, npcId, kind, relationKey, fromNodeId, toNodeId]).slice(0, 60)}`;
}

function sealNode(input: Omit<NpcSemanticGraphNode, "id" | "payloadHash">, npcId: string): NpcSemanticGraphNode {
  const normalized = { ...input, provenance: mergeProvenance(input.provenance) };
  const id = graphNodeId(npcId, normalized.kind, normalized.key, normalized.provenance);
  return deepFreeze({ ...normalized, id, payloadHash: digest(normalized) });
}

function sealEdge(input: Omit<NpcSemanticGraphEdge, "id" | "payloadHash">, npcId: string): NpcSemanticGraphEdge {
  const normalized = { ...input, provenance: mergeProvenance(input.provenance) };
  const id = graphEdgeId(npcId, normalized.kind, normalized.relationKey, normalized.fromNodeId, normalized.toNodeId);
  return deepFreeze({ ...normalized, id, payloadHash: digest(normalized) });
}

function statusForFact(fact: { status: string }, superseded: boolean): NpcSemanticValidity {
  if (fact.status === "expired") return "expired";
  if (fact.status === "conflicted") return "contradicted";
  return superseded ? "superseded" : "active";
}

function statusPriority(status: string): number {
  return status === "active" ? 0 : status === "contradicted" ? 1 : status === "superseded" ? 2 : 3;
}

function nodePriority(kind: string): number {
  return kind === "actor" ? 0
    : kind === "action" || kind === "outcome" ? 1
    : kind === "semantic_fact" ? 2
    : kind === "goal" || kind === "location" ? 3
    : kind === "world_event" ? 4
    : kind === "procedural_competency" ? 5
    : 6;
}

function edgePriority(kind: string): number {
  return kind === "performed_action" ? 0
    : kind === "supersedes" || kind === "contradicts" ? 1
    : kind === "selected_goal" || kind === "located_in" ? 2
    : kind === "affected" || kind === "derived_from" ? 3
    : 4;
}

function semanticFactProvenance(fact: { provenance: readonly DecisionSource[] }): NpcSemanticProvenanceRef[] {
  return mergeProvenance(fact.provenance.map(decisionRef));
}

function episodeProvenance(episode: { source: DecisionSource }): NpcSemanticProvenanceRef[] {
  return mergeProvenance([decisionRef(episode.source)]);
}

function competencyProvenance(competency: { provenance: readonly DecisionSource[] }): NpcSemanticProvenanceRef[] {
  return mergeProvenance(competency.provenance.map(decisionRef));
}

// ---------------------------------------------------------------------------
// Performed-action evidence verification
// ---------------------------------------------------------------------------

export function verifyPerformedActionEvidence(input: Readonly<{
  sourceDecision: ConfirmedNpcDecision;
  successorDecision: ConfirmedNpcDecision;
  actionReceipt: MerchantActionReceipt;
  effectReadback: NpcActionEffectReadbackEvidence;
  memoryLink: NpcActionMemoryLinkEvidence;
}>): VerifiedPerformedActionEvidence {
  if (!isConfirmedNpcDecision(input.sourceDecision) || !isConfirmedNpcDecision(input.successorDecision)) {
    throw new Error("NPC_SEMANTIC_GRAPH_CONFIRMED_DECISION_REQUIRED");
  }
  const authority = npcAuthority();
  const action = input.actionReceipt;
  if (action.version !== NPC_ACTION_RECEIPT_VERSION || !same(action.authority, authority)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_REVISION_MISMATCH");
  assertId(action.id, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  assertHash(action.receiptHash, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  assertHash(action.effectsHash, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  const { receiptHash, ...unsignedAction } = action;
  if (receiptHash !== merchantActionReceiptHash(unsignedAction)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_HASH_INVALID");
  const { id: _id, effectsHash: _effectsHash, receiptHash: _receiptHash, ...receiptCore } = action;
  if (action.id !== merchantActionReceiptId(receiptCore)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_ID_INVALID");

  const source = input.sourceDecision;
  const sourcePlan = source.snapshot.lifeState.plan;
  if (!sourcePlan || sourcePlan.status !== "planned"
    || action.sourceDecision.receiptId !== source.receiptId
    || action.sourceDecision.receiptSha256 !== source.receiptSha256
    || action.sourceDecision.npcId !== source.snapshot.npcId
    || action.sourceDecision.resolutionIndex !== source.snapshot.decision.resolutionIndex
    || action.sourceDecision.decisionHash !== source.snapshot.decision.decisionHash
    || action.sourceDecision.planHash !== sourcePlan.planHash
    || action.sourceDecision.goal !== source.snapshot.decision.goal
  ) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_SOURCE_MISMATCH");
  }

  const successor = input.successorDecision;
  if (successor.snapshot.npcId !== action.npcId || successor.snapshot.decision.resolutionIndex !== action.resolutionIndex) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_SUCCESSOR_MISMATCH");
  }

  const effect = input.effectReadback;
  for (const value of [effect.id, effect.actionReceiptId, effect.npcReceiptId, effect.worldReceiptId, effect.polityId]) assertId(value, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  for (const value of [effect.effectsHash, effect.npcDecisionHash, effect.worldReactionHash, effect.polityStateHash, effect.marketStateHash, effect.inventoryStateHash, effect.readbackHash]) assertHash(value, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  assertRevision(effect.sourceRevision, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  if (effect.actionReceiptId !== action.id
    || effect.effectsHash !== action.effectsHash
    || effect.npcReceiptId !== successor.receiptId
    || effect.npcDecisionHash !== successor.snapshot.decision.decisionHash
    || effect.sourceRevision !== authority.sourceRevision
  ) {
    throw new Error("NPC_SEMANTIC_GRAPH_EFFECT_READBACK_MISMATCH");
  }

  const link = input.memoryLink;
  for (const value of [link.id, link.actionReceiptId, link.effectReadbackId, link.memoryReceiptId, link.npcId]) assertId(value, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  assertHash(link.linkHash, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  assertIndex(link.resolutionIndex, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  if (link.actionReceiptId !== action.id || link.effectReadbackId !== effect.id || link.npcId !== action.npcId || link.resolutionIndex !== action.resolutionIndex) {
    throw new Error("NPC_SEMANTIC_GRAPH_MEMORY_LINK_MISMATCH");
  }

  const result = deepFreeze({
    sourceDecision: source,
    successorDecision: successor,
    actionReceipt: action,
    effectReadback: effect,
    memoryLink: link,
  });
  verifiedPerformedActions.add(result);
  return result;
}

export function isVerifiedPerformedActionEvidence(value: unknown): value is VerifiedPerformedActionEvidence {
  return !!value && typeof value === "object" && verifiedPerformedActions.has(value);
}

// ---------------------------------------------------------------------------
// Graph build
// ---------------------------------------------------------------------------

function buildNpcSemanticMemoryGraph(input: NpcSemanticGraphBuildInput): NpcSemanticMemoryGraph {
  const memory = verifyNpcMemoryEvidence(parseNpcMemoryV4(input.memory), input.memoryReceipts);
  if (memory.lastResolutionIndex < 0 || !memory.lastReceiptId) throw new Error("NPC_SEMANTIC_GRAPH_SOURCE_MEMORY_REQUIRED");

  const authority = npcAuthority();
  const performed = [...input.performedActions ?? []];
  if (performed.length > NPC_SEMANTIC_GRAPH_LIMITS.performedActions) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_LIMIT");
  if (performed.some((action) => !isVerifiedPerformedActionEvidence(action))) throw new Error("NPC_SEMANTIC_GRAPH_PERFORMED_ACTION_EVIDENCE_REQUIRED");
  if (performed.some((action) => action.actionReceipt.npcId !== memory.npcId || action.actionReceipt.resolutionIndex > memory.lastResolutionIndex)) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_GENERATION_MISMATCH");
  }

  const previous = input.previousGraph ?? null;
  if (previous) {
    if (!verifiedGraphs.has(previous) || previous.npcId !== memory.npcId) throw new Error("NPC_SEMANTIC_GRAPH_PREDECESSOR_VERIFICATION_REQUIRED");
    if (previous.generation >= memory.lastResolutionIndex) throw new Error("NPC_SEMANTIC_GRAPH_GENERATION_REGRESSION");
  }

  const nodes: NpcSemanticGraphNode[] = [];
  const edges: NpcSemanticGraphEdge[] = [];
  const nodeByIdentity = new Map<string, NpcSemanticGraphNode>();
  const nodeIdRemap = new Map<string, string>();

  const allMemoryProvenance = mergeProvenance([
    ...memory.episodic.map((e) => decisionRef(e.source)),
    ...memory.semantic.flatMap((f) => f.provenance.map(decisionRef)),
    ...memory.procedural.flatMap((c) => c.provenance.map(decisionRef)),
  ]);

  const ensureIdentityNode = (
    kind: NpcSemanticNodeKind,
    key: string,
    provenance: readonly NpcSemanticProvenanceRef[],
    validFromIndex: number,
    validUntilIndex: number | null,
  ): NpcSemanticGraphNode => {
    const identity = `${kind}:${key}`;
    const existing = nodeByIdentity.get(identity);
    if (existing) {
      // Merge provenance and widen the validity interval so later evidence
      // and earlier episodic edges remain retrievable at their own logical index.
      const mergedProvenance = mergeProvenance(existing.provenance, provenance);
      const mergedValidFrom = Math.min(existing.validFromIndex, validFromIndex);
      const mergedValidUntil =
        existing.validUntilIndex === null || validUntilIndex === null
          ? null
          : Math.max(existing.validUntilIndex, validUntilIndex);
      const updated = sealNode(
        {
          version: NPC_SEMANTIC_GRAPH_VERSION,
          kind,
          key,
          status: "active",
          validFromIndex: mergedValidFrom,
          validUntilIndex: mergedValidUntil,
          provenance: mergedProvenance,
        },
        memory.npcId,
      );
      nodeByIdentity.set(identity, updated);
      nodeIdRemap.set(existing.id, updated.id);
      const index = nodes.indexOf(existing);
      if (index >= 0) nodes[index] = updated;
      else nodes.push(updated);
      return updated;
    }
    const node = sealNode({ version: NPC_SEMANTIC_GRAPH_VERSION, kind, key, status: "active", validFromIndex, validUntilIndex, provenance }, memory.npcId);
    nodeByIdentity.set(identity, node);
    nodes.push(node);
    return node;
  };

  const actor = ensureIdentityNode("actor", memory.npcId, allMemoryProvenance, 0, null);

  // Semantic facts → nodes + edges
  const semantic = [...memory.semantic].sort((a, b) => b.validFromIndex - a.validFromIndex || textOrder(a.id, b.id));
  const newestEquivalent = new Map<string, string>();
  const factStatus = new Map<string, NpcSemanticValidity>();
  for (const fact of semantic) {
    const key = `${fact.subjectId}:${fact.predicate}:${fact.value}`;
    const newer = newestEquivalent.get(key);
    const status = statusForFact(fact, !!newer);
    factStatus.set(fact.id, status);
    if (!newer && status !== "expired" && status !== "contradicted") newestEquivalent.set(key, fact.id);
  }

  const factNodes = new Map<string, NpcSemanticGraphNode>();
  for (const fact of semantic) {
    const provenance = semanticFactProvenance(fact);
    const status = factStatus.get(fact.id)!;
    const factNode = sealNode({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "semantic_fact", key: fact.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId);
    nodes.push(factNode);
    factNodes.set(fact.id, factNode);

    const kind: NpcSemanticNodeKind = fact.predicate === "current_hub" ? "location" : "goal";
    const entity = ensureIdentityNode(kind, fact.value, provenance, fact.validFromIndex, fact.validUntilIndex);
    const relation: NpcSemanticEdgeKind = fact.predicate === "current_hub" ? "located_in" : "selected_goal";
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: relation, relationKey: fact.id, fromNodeId: actor.id, toNodeId: entity.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "derived_from", relationKey: fact.id, fromNodeId: factNode.id, toNodeId: entity.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId));
  }

  // Conflict edges
  const conflictPairs = new Set<string>();
  for (const fact of semantic) {
    const from = factNodes.get(fact.id);
    if (!from) continue;
    for (const otherId of fact.conflictsWith) {
      const to = factNodes.get(otherId);
      if (!to) continue;
      const ids = [from.id, to.id].sort(textOrder);
      const pair = `${ids[0]}:${ids[1]}`;
      if (conflictPairs.has(pair)) continue;
      conflictPairs.add(pair);
      const other = semantic.find((value) => value.id === otherId);
      if (!other) continue;
      const validFrom = Math.max(fact.validFromIndex, other.validFromIndex);
      const validUntil = Math.min(fact.validUntilIndex, other.validUntilIndex);
      edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "contradicts", relationKey: pair, fromNodeId: ids[0], toNodeId: ids[1], status: "active", validFromIndex: validFrom, validUntilIndex: validUntil, provenance: mergeProvenance(semanticFactProvenance(fact), semanticFactProvenance(other)) }, memory.npcId));
    }
  }

  // Supersession edges
  for (const latestId of newestEquivalent.values()) {
    const latest = semantic.find((f) => f.id === latestId);
    if (!latest) continue;
    for (const older of semantic.filter((f) => f.id !== latest.id && f.subjectId === latest.subjectId && f.predicate === latest.predicate && f.value === latest.value && factStatus.get(f.id) === "superseded")) {
      const olderNode = factNodes.get(older.id);
      const latestNode = factNodes.get(latest.id);
      if (!olderNode || !latestNode) continue;
      edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "supersedes", relationKey: `${latest.id}:${older.id}`, fromNodeId: latestNode.id, toNodeId: olderNode.id, status: "active", validFromIndex: latest.validFromIndex, validUntilIndex: null, provenance: mergeProvenance(semanticFactProvenance(latest), semanticFactProvenance(older)) }, memory.npcId));
    }
  }

  // Episodic memory → nodes + edges
  for (const episode of memory.episodic) {
    const provenance = episodeProvenance(episode);
    const event = ensureIdentityNode("world_event", episode.id, provenance, episode.logicalIndex, episode.expiresAtIndex);
    const location = ensureIdentityNode("location", episode.regionId, provenance, episode.logicalIndex, episode.expiresAtIndex);
    const goal = ensureIdentityNode("goal", episode.goal, provenance, episode.logicalIndex, episode.expiresAtIndex);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "participated_in", relationKey: episode.id, fromNodeId: actor.id, toNodeId: event.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "observed_at", relationKey: episode.id, fromNodeId: event.id, toNodeId: location.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "selected_goal", relationKey: `episode:${episode.id}`, fromNodeId: event.id, toNodeId: goal.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
  }

  // Procedural competencies → nodes + edges
  for (const competency of memory.procedural) {
    const provenance = competencyProvenance(competency);
    const node = ensureIdentityNode("procedural_competency", competency.competencyId, provenance, competency.provenance[0].logicalIndex, null);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "supports", relationKey: competency.id, fromNodeId: actor.id, toNodeId: node.id, status: "active", validFromIndex: competency.provenance[0].logicalIndex, validUntilIndex: null, provenance }, memory.npcId));
  }

  // Performed actions → nodes + edges
  for (const performedAction of performed.sort((a, b) => a.actionReceipt.resolutionIndex - b.actionReceipt.resolutionIndex || textOrder(a.actionReceipt.id, b.actionReceipt.id))) {
    const action = performedAction.actionReceipt;
    const provenance = mergeProvenance(
      [confirmedDecisionRef(performedAction.sourceDecision)],
      [actionRef(action)],
      [effectRef(performedAction.effectReadback, authority.sourceSha256, action.resolutionIndex)],
      [linkRef(performedAction.memoryLink, authority)],
      [confirmedDecisionRef(performedAction.successorDecision)],
    );
    const actionNode = ensureIdentityNode("action", action.id, provenance, action.resolutionIndex, null);
    const outcomeNode = ensureIdentityNode("outcome", `${action.id}:committed`, provenance, action.resolutionIndex, null);
    const targetNode = ensureIdentityNode("location", action.target.hubId, provenance, action.resolutionIndex, null);
    const polityNode = ensureIdentityNode("polity", performedAction.effectReadback.polityId, provenance, action.resolutionIndex, null);
    const goalNode = ensureIdentityNode("goal", action.sourceDecision.goal, provenance, action.sourceDecision.resolutionIndex, null);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "performed_action", relationKey: action.id, fromNodeId: actor.id, toNodeId: actionNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: action.id, fromNodeId: actionNode.id, toNodeId: outcomeNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: `${action.id}:target`, fromNodeId: actionNode.id, toNodeId: targetNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: `${action.id}:polity`, fromNodeId: actionNode.id, toNodeId: polityNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "derived_from", relationKey: `${action.id}:goal`, fromNodeId: actionNode.id, toNodeId: goalNode.id, status: "active", validFromIndex: action.sourceDecision.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
  }

  // Merged identity nodes are re-sealed with a new id; repoint earlier edges.
  const resolveNodeId = (id: string): string => {
    let current = id;
    for (let next = nodeIdRemap.get(current); next !== undefined; next = nodeIdRemap.get(current)) current = next;
    return current;
  };
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const fromNodeId = resolveNodeId(edge.fromNodeId);
    const toNodeId = resolveNodeId(edge.toNodeId);
    if (fromNodeId !== edge.fromNodeId || toNodeId !== edge.toNodeId) {
      const { id: _id, payloadHash: _hash, ...rest } = edge;
      edges[i] = sealEdge({ ...rest, fromNodeId, toNodeId }, memory.npcId);
    }
  }

  // Retention: sort by priority, cap to limits
  const retainedNodes = [...nodes]
    .sort((a, b) => nodePriority(a.kind) - nodePriority(b.kind) || statusPriority(a.status) - statusPriority(b.status) || b.validFromIndex - a.validFromIndex || textOrder(a.id, b.id))
    .slice(0, NPC_SEMANTIC_GRAPH_LIMITS.nodes);
  const retainedIds = new Set(retainedNodes.map((node) => node.id));
  const retainedEdges = edges
    .filter((edge) => retainedIds.has(edge.fromNodeId) && retainedIds.has(edge.toNodeId))
    .sort((a, b) => edgePriority(a.kind) - edgePriority(b.kind) || statusPriority(a.status) - statusPriority(b.status) || b.validFromIndex - a.validFromIndex || textOrder(a.id, b.id))
    .slice(0, NPC_SEMANTIC_GRAPH_LIMITS.edges);

  const sealGraph = (edgePrefix: readonly NpcSemanticGraphEdge[]) => {
    const canonicalNodes = [...retainedNodes].sort((a, b) => textOrder(a.id, b.id));
    const canonicalEdges = [...edgePrefix].sort((a, b) => textOrder(a.id, b.id));
    const unsigned = {
      version: NPC_SEMANTIC_GRAPH_VERSION,
      retrievalVersion: NPC_SEMANTIC_RETRIEVAL_VERSION,
      npcId: memory.npcId,
      generation: memory.lastResolutionIndex,
      authority,
      memoryHash: memory.memoryHash,
      previousGraphHash: previous?.graphHash ?? null,
      nodes: canonicalNodes,
      edges: canonicalEdges,
    };
    const graph = deepFreeze({ ...unsigned, graphHash: digest(unsigned) });
    return { graph, bytes: Buffer.byteLength(stableCatalogStringify(graph), "utf8") };
  };

  let sealed = sealGraph(retainedEdges);
  if (sealed.bytes > NPC_SEMANTIC_GRAPH_LIMITS.bytes) {
    let low = 0, high = retainedEdges.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const trial = sealGraph(retainedEdges.slice(0, mid));
      if (trial.bytes <= NPC_SEMANTIC_GRAPH_LIMITS.bytes) low = mid;
      else high = mid - 1;
    }
    sealed = sealGraph(retainedEdges.slice(0, low));
  }
  if (sealed.bytes > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
  verifiedGraphs.add(sealed.graph);
  return sealed.graph;
}

export function compileNpcSemanticMemoryGraph(input: NpcSemanticGraphBuildInput): NpcSemanticMemoryGraph {
  return buildNpcSemanticMemoryGraph(input);
}

// ---------------------------------------------------------------------------
// Graph parse / verify
// ---------------------------------------------------------------------------

function validateProvenance(ref: unknown): asserts ref is NpcSemanticProvenanceRef {
  if (!ref || typeof ref !== "object") throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  const value = ref as Record<string, unknown>;
  if (!provenanceKinds.includes(value.kind as NpcSemanticProvenanceKind)) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertId(value.id, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertHash(value.hash, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertIndex(value.logicalIndex, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertRevision(value.sourceRevision, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertHash(value.sourceSha256, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
}

function parseNode(raw: unknown, npcId: string): NpcSemanticGraphNode {
  if (!raw || typeof raw !== "object") throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  const node = raw as Record<string, unknown>;
  if (node.version !== NPC_SEMANTIC_GRAPH_VERSION || !nodeKinds.includes(node.kind as NpcSemanticNodeKind) || !statuses.includes(node.status as NpcSemanticValidity)) throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertId(node.id, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertId(node.key, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertIndex(node.validFromIndex, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  if (node.validUntilIndex !== null) {
    assertIndex(node.validUntilIndex, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
    if ((node.validUntilIndex as number) <= (node.validFromIndex as number)) throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  }
  if (!Array.isArray(node.provenance) || !node.provenance.length || node.provenance.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  node.provenance.forEach(validateProvenance);
  const provenance = node.provenance as NpcSemanticProvenanceRef[];
  if (!same(provenance, [...provenance].sort(provenanceOrder)) || new Set(provenance.map((ref) => `${ref.kind}:${ref.id}:${ref.hash}`)).size !== provenance.length) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_ORDER");
  assertHash(node.payloadHash, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  const { id, payloadHash, ...payload } = node;
  if (id !== graphNodeId(npcId, node.kind as string, node.key as string, provenance) || payloadHash !== digest(payload)) throw new Error("NPC_SEMANTIC_GRAPH_NODE_HASH_INVALID");
  return node as unknown as NpcSemanticGraphNode;
}

function parseEdge(raw: unknown, npcId: string): NpcSemanticGraphEdge {
  if (!raw || typeof raw !== "object") throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  const edge = raw as Record<string, unknown>;
  if (edge.version !== NPC_SEMANTIC_GRAPH_VERSION || !edgeKinds.includes(edge.kind as NpcSemanticEdgeKind) || !statuses.includes(edge.status as NpcSemanticValidity)) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.id, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertRelationKey(edge.relationKey, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.fromNodeId, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.toNodeId, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertIndex(edge.validFromIndex, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  if (edge.validUntilIndex !== null) {
    assertIndex(edge.validUntilIndex, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
    if ((edge.validUntilIndex as number) <= (edge.validFromIndex as number)) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  }
  if (!Array.isArray(edge.provenance) || !edge.provenance.length || edge.provenance.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  edge.provenance.forEach(validateProvenance);
  const provenance = edge.provenance as NpcSemanticProvenanceRef[];
  if (!same(provenance, [...provenance].sort(provenanceOrder)) || new Set(provenance.map((ref) => `${ref.kind}:${ref.id}:${ref.hash}`)).size !== provenance.length) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_ORDER");
  assertHash(edge.payloadHash, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  const { id, payloadHash, ...payload } = edge;
  if (id !== graphEdgeId(npcId, edge.kind as string, edge.relationKey as string, edge.fromNodeId as string, edge.toNodeId as string) || payloadHash !== digest(payload)) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_HASH_INVALID");
  return edge as unknown as NpcSemanticGraphEdge;
}

export function parseNpcSemanticMemoryGraph(value: unknown): NpcSemanticMemoryGraph {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
    value = JSON.parse(value);
  }
  if (!value || typeof value !== "object") throw new Error("NPC_SEMANTIC_GRAPH_INVALID");
  const graph = value as Record<string, unknown>;
  if (graph.version !== NPC_SEMANTIC_GRAPH_VERSION || graph.retrievalVersion !== NPC_SEMANTIC_RETRIEVAL_VERSION) throw new Error("NPC_SEMANTIC_GRAPH_VERSION_INVALID");
  assertId(graph.npcId, "NPC_SEMANTIC_GRAPH_INVALID");
  assertIndex(graph.generation, "NPC_SEMANTIC_GRAPH_INVALID");
  if (!same(graph.authority, npcAuthority())) throw new Error("NPC_SEMANTIC_GRAPH_REVISION_MISMATCH");
  assertHash(graph.memoryHash, "NPC_SEMANTIC_GRAPH_INVALID");
  if (graph.previousGraphHash !== null) assertHash(graph.previousGraphHash, "NPC_SEMANTIC_GRAPH_INVALID");
  if (!Array.isArray(graph.nodes) || graph.nodes.length > NPC_SEMANTIC_GRAPH_LIMITS.nodes || !Array.isArray(graph.edges) || graph.edges.length > NPC_SEMANTIC_GRAPH_LIMITS.edges) throw new Error("NPC_SEMANTIC_GRAPH_LIMIT");
  const nodes = graph.nodes.map((node) => parseNode(node, graph.npcId as string));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || !same(nodes, [...nodes].sort((a, b) => textOrder(a.id, b.id)))) throw new Error("NPC_SEMANTIC_GRAPH_NODE_ORDER");
  const edges = graph.edges.map((edge) => parseEdge(edge, graph.npcId as string));
    if (new Set(edges.map((edge) => edge.id)).size !== edges.length || !same(edges, [...edges].sort((a, b) => textOrder(a.id, b.id))) || edges.some((edge) => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_ORDER");
  assertHash(graph.graphHash, "NPC_SEMANTIC_GRAPH_HASH_INVALID");
  const { graphHash, ...unsigned } = graph;
  if (graphHash !== digest(unsigned)) throw new Error("NPC_SEMANTIC_GRAPH_HASH_INVALID");
  if (Buffer.byteLength(stableCatalogStringify(graph), "utf8") > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
  return deepFreeze(graph) as unknown as NpcSemanticMemoryGraph;
}

export function verifyNpcSemanticMemoryGraph(value: unknown, evidence: NpcSemanticGraphBuildInput): NpcSemanticMemoryGraph {
  const candidate = parseNpcSemanticMemoryGraph(value);
  const rebuilt = buildNpcSemanticMemoryGraph(evidence);
  if (!same(candidate, rebuilt)) throw new Error("NPC_SEMANTIC_GRAPH_SOURCE_EVIDENCE_MISMATCH");
  verifiedGraphs.add(candidate);
  return candidate;
}

export function isVerifiedNpcSemanticMemoryGraph(value: unknown): value is NpcSemanticMemoryGraph {
  return !!value && typeof value === "object" && verifiedGraphs.has(value);
}

// ---------------------------------------------------------------------------
// Graph retrieval / query
// ---------------------------------------------------------------------------

function normalizeQuery(query: NpcSemanticGraphQuery): NpcSemanticGraphQueryResult["query"] {
  assertIndex(query.logicalIndex, "NPC_SEMANTIC_RETRIEVAL_QUERY_INVALID");
  const startKeys = uniqueSorted(query.startKeys ?? []);
  const kinds = uniqueSorted(query.nodeKinds ?? []) as NpcSemanticNodeKind[];
  const relations = uniqueSorted(query.edgeKinds ?? []) as NpcSemanticEdgeKind[];
  if (startKeys.length > NPC_SEMANTIC_GRAPH_LIMITS.startKeys
    || kinds.length > NPC_SEMANTIC_GRAPH_LIMITS.filterValues
    || relations.length > NPC_SEMANTIC_GRAPH_LIMITS.filterValues
    || startKeys.some((value) => !idPattern.test(value))
    || kinds.some((value) => !nodeKinds.includes(value))
    || relations.some((value) => !edgeKinds.includes(value))
  ) throw new Error("NPC_SEMANTIC_RETRIEVAL_QUERY_INVALID");
  const maxDepth = query.maxDepth ?? NPC_SEMANTIC_GRAPH_LIMITS.traversalDepth;
  const maxCandidates = query.maxCandidates ?? NPC_SEMANTIC_GRAPH_LIMITS.candidates;
  const maxResults = query.maxResults ?? NPC_SEMANTIC_GRAPH_LIMITS.results;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > NPC_SEMANTIC_GRAPH_LIMITS.traversalDepth
    || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > NPC_SEMANTIC_GRAPH_LIMITS.candidates
    || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > NPC_SEMANTIC_GRAPH_LIMITS.results
    || maxResults > maxCandidates
  ) throw new Error("NPC_SEMANTIC_RETRIEVAL_BOUNDS_INVALID");
  return deepFreeze({ logicalIndex: query.logicalIndex, startKeys, nodeKinds: kinds, edgeKinds: relations, maxDepth, maxCandidates, maxResults });
}

function activeAt(status: string, from: number, until: number | null, index: number): boolean {
  return status === "active" && index >= from && (until === null || index < until);
}

export function retrieveNpcSemanticMemoryGraph(graphValue: NpcSemanticMemoryGraph, queryValue: NpcSemanticGraphQuery): NpcSemanticGraphQueryResult {
  if (!verifiedGraphs.has(graphValue)) throw new Error("NPC_SEMANTIC_GRAPH_VERIFIED_SOURCE_REQUIRED");
  const graph = parseNpcSemanticMemoryGraph(graphValue);
  const query = normalizeQuery(queryValue);
  if (query.logicalIndex > graph.generation) throw new Error("NPC_SEMANTIC_RETRIEVAL_QUERY_AFTER_GRAPH_GENERATION");

  const activeNodes = graph.nodes.filter((node) => activeAt(node.status, node.validFromIndex, node.validUntilIndex, query.logicalIndex));
  const activeById = new Map(activeNodes.map((node) => [node.id, node]));
  const allowedEdges = graph.edges.filter((edge) =>
    activeAt(edge.status, edge.validFromIndex, edge.validUntilIndex, query.logicalIndex)
    && activeById.has(edge.fromNodeId)
    && activeById.has(edge.toNodeId)
    && (!query.edgeKinds.length || query.edgeKinds.includes(edge.kind)),
  );

  const outgoing = new Map<string, NpcSemanticGraphEdge[]>();
  for (const edge of allowedEdges) {
    const list = outgoing.get(edge.fromNodeId) ?? [];
    list.push(edge);
    outgoing.set(edge.fromNodeId, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => textOrder(a.toNodeId, b.toNodeId) || textOrder(a.id, b.id));

  const depths = new Map<string, number>();
  const seeds = (query.startKeys.length ? activeNodes.filter((node) => query.startKeys.includes(node.key)) : activeNodes)
    .sort((a, b) => textOrder(a.id, b.id))
    .slice(0, query.maxCandidates);
  let frontier = seeds.map((node) => node.id);
  for (const id of frontier) depths.set(id, 0);

  for (let depth = 0; depth < query.maxDepth && frontier.length && depths.size < query.maxCandidates; depth++) {
    const next: string[] = [];
    for (const nodeId of [...frontier].sort(textOrder)) {
      for (const edge of outgoing.get(nodeId) ?? []) {
        if (depths.has(edge.toNodeId)) continue;
        depths.set(edge.toNodeId, depth + 1);
        next.push(edge.toNodeId);
        if (depths.size >= query.maxCandidates) break;
      }
      if (depths.size >= query.maxCandidates) break;
    }
    frontier = uniqueSorted(next);
  }

  const results = [...depths.entries()]
    .map(([nodeId, depth]) => {
      const node = activeById.get(nodeId)!;
      const age = Math.max(0, query.logicalIndex - node.validFromIndex);
      const recency = Math.max(0, 999 - Math.min(999, age));
      const score = (query.startKeys.includes(node.key) ? 1e4 : 0)
        + (query.nodeKinds.includes(node.kind) ? 1e3 : 0)
        + Math.max(0, 500 - depth * 100)
        + recency
        + Math.min(99, node.provenance.length);
      return { nodeId: node.id, kind: node.kind, key: node.key, status: "active" as const, depth, score, payloadHash: node.payloadHash };
    })
    .filter((result) => !query.nodeKinds.length || query.nodeKinds.includes(result.kind))
    .sort((a, b) => b.score - a.score || a.depth - b.depth || textOrder(a.nodeId, b.nodeId))
    .slice(0, query.maxResults);

  const unsigned = { version: NPC_SEMANTIC_RETRIEVAL_VERSION, graphHash: graph.graphHash, query, results };
  return deepFreeze({ ...unsigned, resultHash: digest(unsigned) });
}
