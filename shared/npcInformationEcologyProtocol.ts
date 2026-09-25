import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

export const NPC_INFORMATION_ECOLOGY_PROTOCOL = "aurion.npc-information-ecology.v1" as const;

export const npcInformationStatusSchema = z.enum([
  "experienced",
  "remembered",
  "communicated",
  "corroborated",
  "contradicted",
  "trusted",
  "uncertain",
  "expired",
]);

export type NpcInformationStatus = z.infer<typeof npcInformationStatusSchema>;

export const npcInformationSourceKindSchema = z.enum([
  "npc_decision_receipt",
  "npc_memory_receipt",
  "npc_action_receipt",
  "world_receipt",
  "quest_receipt",
  "semantic_graph_receipt",
]);

export type NpcInformationSourceKind = z.infer<typeof npcInformationSourceKindSchema>;

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);

export const npcInformationSourceSchema = z.strictObject({
  evidenceClass: z.literal("verified"),
  sourceKind: npcInformationSourceKindSchema,
  sourceReceiptId: z.string().trim().min(1).max(128),
  sourceReceiptHash: sha256,
  sourceRevision: revision,
  sourceSha256: sha256,
  sourceCausalRoot: sha256,
});

export type NpcInformationSource = Readonly<z.infer<typeof npcInformationSourceSchema>>;

const npcInformationReceiptBaseSchema = z.strictObject({
  id: identifier,
  factId: identifier,
  worldId: identifier,
  ownerNpcId: identifier,
  subjectId: identifier,
  predicate: identifier,
  value: z.string().trim().min(1).max(255),
  claimKey: sha256,
  status: npcInformationStatusSchema,
  confidenceBps: z.number().int().min(0).max(10_000),
  witnessNpcId: identifier,
  communicatedByNpcId: identifier.nullable(),
  communicationReceiptId: identifier.nullable(),
  relatedFactId: identifier.nullable(),
  sourceKind: npcInformationSourceKindSchema,
  sourceReceiptId: z.string().trim().min(1).max(128),
  sourceReceiptHash: sha256,
  sourceRevision: revision,
  sourceSha256: sha256,
  sourceCausalRoot: sha256,
  logicalIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expiresAtIndex: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  previousReceiptId: identifier.nullable(),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const npcInformationReceiptSchema = npcInformationReceiptBaseSchema.transform(value => Object.freeze(value));

export type NpcInformationReceipt = Readonly<z.output<typeof npcInformationReceiptSchema>>;

export const NPC_INFORMATION_TRUST_THRESHOLD_BPS = 8_000;
export const NPC_INFORMATION_TRUST_MIN_CORROBORATIONS = 2;

const allowedTransitions: Record<NpcInformationStatus, readonly NpcInformationStatus[]> = {
  experienced: ["remembered", "expired"],
  remembered: ["communicated", "trusted", "uncertain", "expired"],
  communicated: ["corroborated", "contradicted", "trusted", "uncertain", "expired"],
  corroborated: ["trusted", "uncertain", "expired"],
  contradicted: ["uncertain", "expired"],
  trusted: ["expired", "uncertain"],
  uncertain: ["trusted", "expired"],
  expired: [],
};

function hashHex(value: unknown): string {
  return canonicalSha256(value).slice("sha256:".length);
}

function makeReceipt(value: Omit<NpcInformationReceipt, "id" | "receiptHash">): NpcInformationReceipt {
  const parsed = npcInformationReceiptBaseSchema.omit({ id: true, receiptHash: true }).parse(value);
  const id = "nei_" + hashHex({
    domain: "aurion.npc-information-receipt-id.v1",
    value: parsed,
  }).slice(0, 60);
  const unsigned = { ...parsed, id };
  const receiptHash = hashHex({
    domain: "aurion.npc-information-receipt.v1",
    value: unsigned,
  });
  return npcInformationReceiptSchema.parse({ ...unsigned, receiptHash });
}

function claimKey(subjectId: string, predicate: string): string {
  return canonicalSha256({
    domain: "aurion.npc-information-claim-key.v1",
    subjectId,
    predicate,
  });
}

function factId(input: {
  worldId: string;
  subjectId: string;
  predicate: string;
  value: string;
  sourceReceiptId: string;
  witnessNpcId: string;
}): string {
  return "neif_" + hashHex({
    domain: "aurion.npc-information-fact.v1",
    ...input,
  }).slice(0, 59);
}

function assertSource(source: NpcInformationSource): NpcInformationSource {
  return Object.freeze(npcInformationSourceSchema.parse(source));
}

function assertIndex(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NPC_INFORMATION_${field.toUpperCase()}_INVALID`);
  }
}

export function createExperiencedNpcInformation(input: Readonly<{
  worldId: string;
  witnessNpcId: string;
  subjectId: string;
  predicate: string;
  value: string;
  logicalIndex: number;
  expiresAtIndex?: number | null;
  confidenceBps?: number;
  source: NpcInformationSource;
}>): NpcInformationReceipt {
  const source = assertSource(input.source);
  const worldId = identifier.parse(input.worldId);
  const witnessNpcId = identifier.parse(input.witnessNpcId);
  const subjectId = identifier.parse(input.subjectId);
  const predicate = identifier.parse(input.predicate);
  const value = z.string().trim().min(1).max(255).parse(input.value);
  assertIndex(input.logicalIndex, "logical_index");
  if (input.expiresAtIndex !== undefined && input.expiresAtIndex !== null &&
      (!Number.isSafeInteger(input.expiresAtIndex) || input.expiresAtIndex <= input.logicalIndex)) {
    throw new Error("NPC_INFORMATION_EXPIRY_INVALID");
  }
  const parsedConfidence = z.number().int().min(0).max(10_000).parse(input.confidenceBps ?? 10_000);
  return makeReceipt({
    factId: factId({ worldId, subjectId, predicate, value, sourceReceiptId: source.sourceReceiptId, witnessNpcId }),
    worldId,
    ownerNpcId: witnessNpcId,
    subjectId,
    predicate,
    value,
    claimKey: claimKey(subjectId, predicate),
    status: "experienced",
    confidenceBps: parsedConfidence,
    witnessNpcId,
    communicatedByNpcId: null,
    communicationReceiptId: null,
    relatedFactId: null,
    sourceKind: source.sourceKind,
    sourceReceiptId: source.sourceReceiptId,
    sourceReceiptHash: source.sourceReceiptHash,
    sourceRevision: source.sourceRevision,
    sourceSha256: source.sourceSha256,
    sourceCausalRoot: source.sourceCausalRoot,
    logicalIndex: input.logicalIndex,
    expiresAtIndex: input.expiresAtIndex ?? null,
    previousReceiptId: null,
  });
}

export function transitionNpcInformation(previous: NpcInformationReceipt, input: Readonly<{
  status: NpcInformationStatus;
  logicalIndex: number;
  confidenceBps: number;
  ownerNpcId?: string;
  communicatedByNpcId?: string | null;
  communicationReceiptId?: string | null;
  relatedFactId?: string | null;
}>): NpcInformationReceipt {
  const prior = npcInformationReceiptSchema.parse(previous);
  const status = npcInformationStatusSchema.parse(input.status);
  if (!allowedTransitions[prior.status].includes(status)) {
    throw new Error(`NPC_INFORMATION_TRANSITION_NOT_ALLOWED:${prior.status}->${status}`);
  }
  assertIndex(input.logicalIndex, "logical_index");
  if (input.logicalIndex <= prior.logicalIndex) throw new Error("NPC_INFORMATION_LOGICAL_ORDER_INVALID");
  if (status === "expired" && (prior.expiresAtIndex === null || input.logicalIndex < prior.expiresAtIndex)) {
    throw new Error("NPC_INFORMATION_NOT_EXPIRED");
  }
  if (status !== "expired" && prior.expiresAtIndex !== null && input.logicalIndex >= prior.expiresAtIndex) {
    throw new Error("NPC_INFORMATION_EXPIRED");
  }
  if (status === "trusted" && (prior.status !== "corroborated" || input.confidenceBps < NPC_INFORMATION_TRUST_THRESHOLD_BPS)) {
    throw new Error("NPC_INFORMATION_TRUST_EVIDENCE_REQUIRED");
  }
  const confidence = z.number().int().min(0).max(10_000).parse(input.confidenceBps);
  const owner = identifier.parse(input.ownerNpcId ?? prior.ownerNpcId);
  const sender = input.communicatedByNpcId === undefined || input.communicatedByNpcId === null
    ? prior.communicatedByNpcId
    : identifier.parse(input.communicatedByNpcId);
  const communication = input.communicationReceiptId === undefined || input.communicationReceiptId === null
    ? prior.communicationReceiptId
    : identifier.parse(input.communicationReceiptId);
  const related = input.relatedFactId === undefined || input.relatedFactId === null
    ? prior.relatedFactId
    : identifier.parse(input.relatedFactId);
  return makeReceipt({
    factId: prior.factId,
    worldId: prior.worldId,
    ownerNpcId: owner,
    subjectId: prior.subjectId,
    predicate: prior.predicate,
    value: prior.value,
    claimKey: prior.claimKey,
    status,
    confidenceBps: confidence,
    witnessNpcId: prior.witnessNpcId,
    communicatedByNpcId: sender,
    communicationReceiptId: communication,
    relatedFactId: related,
    sourceKind: prior.sourceKind,
    sourceReceiptId: prior.sourceReceiptId,
    sourceReceiptHash: prior.sourceReceiptHash,
    sourceRevision: prior.sourceRevision,
    sourceSha256: prior.sourceSha256,
    sourceCausalRoot: prior.sourceCausalRoot,
    logicalIndex: input.logicalIndex,
    expiresAtIndex: prior.expiresAtIndex,
    previousReceiptId: prior.id,
  });
}

export function rememberNpcInformation(previous: NpcInformationReceipt, logicalIndex: number): NpcInformationReceipt {
  return transitionNpcInformation(previous, { status: "remembered", logicalIndex, confidenceBps: previous.confidenceBps });
}

export function communicateNpcInformation(input: Readonly<{
  source: NpcInformationReceipt;
  receiverNpcId: string;
  logicalIndex: number;
}>): NpcInformationReceipt {
  const source = npcInformationReceiptSchema.parse(input.source);
  if (source.status === "experienced") throw new Error("NPC_INFORMATION_MUST_BE_REMEMBERED_BEFORE_COMMUNICATING");
  if (source.status === "expired" || (source.expiresAtIndex !== null && input.logicalIndex >= source.expiresAtIndex)) {
    throw new Error("NPC_INFORMATION_EXPIRED");
  }
  const receiver = identifier.parse(input.receiverNpcId);
  assertIndex(input.logicalIndex, "logical_index");
  if (input.logicalIndex <= source.logicalIndex) throw new Error("NPC_INFORMATION_COMMUNICATION_ORDER_INVALID");
  if (receiver === source.ownerNpcId) throw new Error("NPC_INFORMATION_SELF_COMMUNICATION");
  const communicationReceiptId = "neic_" + hashHex({
    domain: "aurion.npc-information-communication.v1",
    sourceReceiptId: source.id,
    receiverNpcId: receiver,
    logicalIndex: input.logicalIndex,
  }).slice(0, 60);
  return transitionNpcInformation(source, {
    status: "communicated",
    logicalIndex: input.logicalIndex,
    confidenceBps: source.confidenceBps,
    ownerNpcId: receiver,
    communicatedByNpcId: source.ownerNpcId,
    communicationReceiptId,
  });
}

export function reconcileNpcInformationReports(input: Readonly<{
  left: NpcInformationReceipt;
  right: NpcInformationReceipt;
  logicalIndex: number;
}>): Readonly<{ left: NpcInformationReceipt; right: NpcInformationReceipt; relation: "corroborated" | "contradicted" }> {
  const left = npcInformationReceiptSchema.parse(input.left);
  const right = npcInformationReceiptSchema.parse(input.right);
  if (left.worldId !== right.worldId || left.claimKey !== right.claimKey) {
    throw new Error("NPC_INFORMATION_REPORT_SCOPE_MISMATCH");
  }
  if (left.factId === right.factId) throw new Error("NPC_INFORMATION_SAME_FACT_NOT_A_CONFLICT");
  if (left.sourceReceiptId === right.sourceReceiptId || left.witnessNpcId === right.witnessNpcId) {
    throw new Error("NPC_INFORMATION_INDEPENDENT_SOURCE_REQUIRED");
  }
  if (!Number.isSafeInteger(input.logicalIndex) || input.logicalIndex >= Number.MAX_SAFE_INTEGER) {
    throw new Error("NPC_INFORMATION_RECONCILIATION_ORDER_INVALID");
  }
  if (input.logicalIndex <= Math.max(left.logicalIndex, right.logicalIndex)) {
    throw new Error("NPC_INFORMATION_RECONCILIATION_ORDER_INVALID");
  }
  const relation = left.value === right.value ? "corroborated" : "contradicted";
  return {
    left: transitionNpcInformation(left, {
      status: relation,
      logicalIndex: input.logicalIndex,
      confidenceBps: left.confidenceBps,
      relatedFactId: right.factId,
    }),
    right: transitionNpcInformation(right, {
      status: relation,
      logicalIndex: input.logicalIndex + 1,
      confidenceBps: right.confidenceBps,
      relatedFactId: left.factId,
    }),
    relation,
  };
}

export function assessNpcInformationTrust(input: Readonly<{
  confidenceBps: number;
  corroborationCount: number;
  contradictionCount: number;
}>): Readonly<{ status: "trusted" | "uncertain"; confidenceBps: number }> {
  const confidence = z.number().int().min(0).max(10_000).parse(input.confidenceBps);
  if (!Number.isSafeInteger(input.corroborationCount) || input.corroborationCount < 0) {
    throw new Error("NPC_INFORMATION_CORROBORATION_COUNT_INVALID");
  }
  if (!Number.isSafeInteger(input.contradictionCount) || input.contradictionCount < 0) {
    throw new Error("NPC_INFORMATION_CONTRADICTION_COUNT_INVALID");
  }
  const status = input.corroborationCount >= NPC_INFORMATION_TRUST_MIN_CORROBORATIONS &&
    input.contradictionCount === 0 &&
    confidence >= NPC_INFORMATION_TRUST_THRESHOLD_BPS ? "trusted" : "uncertain";
  return Object.freeze({ status, confidenceBps: confidence });
}

export function expireNpcInformation(previous: NpcInformationReceipt, logicalIndex: number): NpcInformationReceipt {
  const prior = npcInformationReceiptSchema.parse(previous);
  assertIndex(logicalIndex, "logical_index");
  if (prior.expiresAtIndex === null || logicalIndex < prior.expiresAtIndex) {
    throw new Error("NPC_INFORMATION_NOT_EXPIRED");
  }
  if (prior.status === "expired") return prior;
  return transitionNpcInformation(prior, { status: "expired", logicalIndex, confidenceBps: prior.confidenceBps });
}

export function assertVerifiedNpcInformation(value: NpcInformationReceipt, logicalIndex?: number): void {
  const receipt = npcInformationReceiptSchema.parse(value);
  if (logicalIndex !== undefined) {
    assertIndex(logicalIndex, "logical_index");
    if (receipt.expiresAtIndex !== null && logicalIndex >= receipt.expiresAtIndex) throw new Error("NPC_INFORMATION_EXPIRED");
  }
}

export function isVerifiedConsumableNpcInformation(value: NpcInformationReceipt, logicalIndex: number): boolean {
  try {
    assertVerifiedNpcInformation(value, logicalIndex);
    return value.status === "corroborated" || value.status === "trusted";
  } catch {
    return false;
  }
}

export type NpcInformationProvenanceSummary = Readonly<{
  factId: string;
  originSourceReceiptId: string;
  originSourceReceiptHash: string;
  sourceRevision: string;
  sourceSha256: string;
  sourceCausalRoot: string;
  lineageReceiptIds: readonly string[];
}>;

export function summarizeNpcInformationProvenance(receipts: readonly NpcInformationReceipt[]): NpcInformationProvenanceSummary {
  const parsed = receipts.map(receipt => npcInformationReceiptSchema.parse(receipt));
  if (parsed.length === 0) throw new Error("NPC_INFORMATION_PROVENANCE_EMPTY");
  if (new Set(parsed.map(receipt => receipt.factId)).size !== 1) throw new Error("NPC_INFORMATION_PROVENANCE_FACT_MISMATCH");
  const byId = new Map(parsed.map(receipt => [receipt.id, receipt] as const));
  const latest = [...parsed].sort((a, b) => b.logicalIndex - a.logicalIndex || b.id.localeCompare(a.id))[0];
  const lineage: string[] = [];
  let current: NpcInformationReceipt | undefined = latest;
  while (current) {
    lineage.push(current.id);
    if (!current.previousReceiptId) break;
    const previous = byId.get(current.previousReceiptId);
    if (!previous) throw new Error("NPC_INFORMATION_PROVENANCE_GAP");
    current = previous;
  }
  const ordered = Object.freeze([...lineage].reverse());
  const origin = byId.get(ordered[0]);
  if (!origin) throw new Error("NPC_INFORMATION_PROVENANCE_ORIGIN_MISSING");
  return Object.freeze({
    factId: latest.factId,
    originSourceReceiptId: origin.sourceReceiptId,
    originSourceReceiptHash: origin.sourceReceiptHash,
    sourceRevision: latest.sourceRevision,
    sourceSha256: latest.sourceSha256,
    sourceCausalRoot: latest.sourceCausalRoot,
    lineageReceiptIds: ordered,
  });
}

export function projectNpcInformation(value: NpcInformationReceipt): Readonly<{
  factId: string;
  claimKey: string;
  subjectId: string;
  predicate: string;
  value: string;
  status: NpcInformationStatus;
  confidenceBps: number;
  logicalIndex: number;
  expiresAtIndex: number | null;
}> {
  const receipt = npcInformationReceiptSchema.parse(value);
  return Object.freeze({
    factId: receipt.factId,
    claimKey: receipt.claimKey,
    subjectId: receipt.subjectId,
    predicate: receipt.predicate,
    value: receipt.value,
    status: receipt.status,
    confidenceBps: receipt.confidenceBps,
    logicalIndex: receipt.logicalIndex,
    expiresAtIndex: receipt.expiresAtIndex,
  });
}
