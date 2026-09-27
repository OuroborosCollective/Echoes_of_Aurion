import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_EMERGENT_LIFE_PROTOCOL = "aurion.emergent-life.v1" as const;

export const emergentLifeActionKinds = [
  "survive", "forage", "gather", "farm", "craft", "trade", "work", "migrate",
  "build", "form_household", "reproduce", "join_group", "leave_group",
  "explore", "defend", "negotiate", "raid", "fight", "make_peace",
] as const;
export type EmergentLifeActionKind = (typeof emergentLifeActionKinds)[number];

export const emergentLifeNeedKinds = ["safety", "resources", "belonging", "status", "wealth", "power"] as const;
export type EmergentLifeNeedKind = (typeof emergentLifeNeedKinds)[number];

export type EmergentLifeNeedState = Readonly<Record<EmergentLifeNeedKind, number>>;

export type EmergentLifeImpact = Readonly<{
  sourceReceiptId: string;
  targetEntityIds: readonly string[];
  domain: string;
  magnitudeBps: number;
  causeTags: readonly string[];
  regionId: string;
  resolutionIndex: number;
}>;

export type EmergentLifeActionCandidate = Readonly<{
  id: string;
  kind: EmergentLifeActionKind;
  sourceReceiptId: string;
  resolutionIndex: number;
  priorityBps: number;
  benefitBps: number;
  riskBps: number;
  distanceBps: number;
}>;

export type EmergentLifeResolution = Readonly<{
  protocol: typeof AURION_EMERGENT_LIFE_PROTOCOL;
  entityId: string;
  regionId: string;
  resolutionIndex: number;
  inputImpactIds: readonly string[];
  beforeNeedsHash: string;
  afterNeedsHash: string;
  candidateSetHash: string;
  selectedAction: EmergentLifeActionCandidate | null;
  actionIntentHash: string;
  nextImpact: EmergentLifeImpact | null;
  resolutionHash: string;
}>;

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const assertInteger = (value: number, code: string) => {
  if (!Number.isSafeInteger(value)) throw new Error(code);
};
const clampBps = (value: number) => Math.max(0, Math.min(10_000, Math.trunc(value)));

function normalizeImpact(value: EmergentLifeImpact): EmergentLifeImpact {
  if (!value.sourceReceiptId.trim() || !value.regionId.trim() || !value.domain.trim()) throw new Error("EMERGENT_LIFE_IMPACT_IDENTITY_INVALID");
  assertInteger(value.magnitudeBps, "EMERGENT_LIFE_IMPACT_MAGNITUDE_INVALID");
  assertInteger(value.resolutionIndex, "EMERGENT_LIFE_IMPACT_INDEX_INVALID");
  if (value.resolutionIndex < 0) throw new Error("EMERGENT_LIFE_IMPACT_INDEX_INVALID");
  const targets = Array.from(new Set(value.targetEntityIds.map(v => v.trim()).filter(Boolean))).sort(compare);
  if (!targets.length) throw new Error("EMERGENT_LIFE_IMPACT_TARGETS_REQUIRED");
  const tags = Array.from(new Set(value.causeTags.map(v => v.trim()).filter(Boolean))).sort(compare);
  return Object.freeze({
    ...value,
    magnitudeBps: clampBps(value.magnitudeBps),
    targetEntityIds: Object.freeze(targets),
    causeTags: Object.freeze(tags),
  });
}

export function normalizeEmergentLifeImpacts(
  values: readonly EmergentLifeImpact[],
  entityId: string,
  resolutionIndex: number,
): readonly EmergentLifeImpact[] {
  if (!entityId.trim()) throw new Error("EMERGENT_LIFE_ENTITY_REQUIRED");
  assertInteger(resolutionIndex, "EMERGENT_LIFE_RESOLUTION_INDEX_INVALID");
  if (resolutionIndex < 0) throw new Error("EMERGENT_LIFE_RESOLUTION_INDEX_INVALID");
  const normalized = values.map(normalizeImpact)
    .filter(value => value.targetEntityIds.includes(entityId))
    .filter(value => value.resolutionIndex <= resolutionIndex)
    .sort((a, b) => a.resolutionIndex - b.resolutionIndex || compare(a.domain, b.domain) || compare(a.sourceReceiptId, b.sourceReceiptId));
  const seen = new Set<string>();
  for (const value of normalized) {
    const key = value.sourceReceiptId + "\u001f" + value.resolutionIndex;
    if (seen.has(key)) throw new Error("EMERGENT_LIFE_DUPLICATE_IMPACT");
    seen.add(key);
  }
  return Object.freeze(normalized);
}

export function applyEmergentLifeImpacts(
  needs: EmergentLifeNeedState,
  impacts: readonly EmergentLifeImpact[],
): Readonly<Record<NpcNeedKey, number>> {
  const next: Record<EmergentLifeNeedKind, number> = {
    safety: clampBps(needs.safety),
    resources: clampBps(needs.resources),
    belonging: clampBps(needs.belonging),
    status: clampBps(needs.status),
    wealth: clampBps(needs.wealth),
    power: clampBps(needs.power),
  };
  for (const impact of impacts) {
    if (impact.domain === "hazard" || impact.domain === "war" || impact.domain === "safety") next.safety = clampBps(next.safety - impact.magnitudeBps);
    if (impact.domain === "ecology" || impact.domain === "resource") next.resources = clampBps(next.resources - impact.magnitudeBps);
    if (impact.domain === "economy" || impact.domain === "market") next.wealth = clampBps(next.wealth - impact.magnitudeBps);
    if (impact.domain === "social" || impact.domain === "belonging") next.belonging = clampBps(next.belonging - impact.magnitudeBps);
    if (impact.domain === "politics" || impact.domain === "status") next.status = clampBps(next.status - impact.magnitudeBps);
    if (impact.domain === "conflict" || impact.domain === "power") next.power = clampBps(next.power - impact.magnitudeBps);
  }
  return Object.freeze(next);
}

export function resolveEmergentLifeStep(input: {
  entityId: string;
  regionId: string;
  resolutionIndex: number;
  currentNeeds: Readonly<Record<NpcNeedKey, number>>;
  impacts: readonly EmergentLifeImpact[];
  candidates: readonly EmergentLifeActionCandidate[];
}): EmergentLifeResolution {
  if (!input.entityId.trim() || !input.regionId.trim()) throw new Error("EMERGENT_LIFE_IDENTITY_INVALID");
  assertInteger(input.resolutionIndex, "EMERGENT_LIFE_RESOLUTION_INDEX_INVALID");
  if (input.resolutionIndex < 0) throw new Error("EMERGENT_LIFE_RESOLUTION_INDEX_INVALID");
  const normalizedImpacts = normalizeEmergentLifeImpacts(input.impacts, input.entityId, input.resolutionIndex);
  const needs = applyEmergentLifeImpacts(input.currentNeeds, normalizedImpacts);
  const normalizedCandidates = input.candidates
    .map(candidate => ({
      ...candidate,
      priorityBps: clampBps(candidate.priorityBps),
      benefitBps: clampBps(candidate.benefitBps),
      riskBps: clampBps(candidate.riskBps),
      distanceBps: clampBps(candidate.distanceBps),
    }))
    .filter(candidate => candidate.sourceReceiptId.trim() && candidate.resolutionIndex <= input.resolutionIndex)
    .sort((a, b) =>
      b.priorityBps - a.priorityBps ||
      b.benefitBps - a.benefitBps ||
      a.riskBps - b.riskBps ||
      a.distanceBps - b.distanceBps ||
      compare(a.kind, b.kind) ||
      compare(a.id, b.id),
    );
  const candidateSetHash = canonicalSha256({
    domain: "aurion.emergent-life.candidate-set.v1",
    entityId: input.entityId,
    resolutionIndex: input.resolutionIndex,
    candidates: normalizedCandidates,
  });
  const selectedAction = normalizedCandidates[0] ?? null;
  const nextImpact = selectedAction
    ? Object.freeze({
        sourceReceiptId: selectedAction.sourceReceiptId,
        targetEntityIds: Object.freeze([input.entityId]),
        domain: selectedAction.kind,
        magnitudeBps: clampBps(Math.max(0, selectedAction.benefitBps - selectedAction.riskBps)),
        causeTags: Object.freeze(["action:" + selectedAction.kind, "candidate:" + selectedAction.id]),
        regionId: input.regionId,
        resolutionIndex: input.resolutionIndex,
      })
    : null;
  const beforeNeedsHash = canonicalSha256(input.currentNeeds);
  const afterNeedsHash = canonicalSha256(needs);
  const actionIntentHash = canonicalSha256({
    domain: "aurion.emergent-life.action-intent.v1",
    entityId: input.entityId,
    resolutionIndex: input.resolutionIndex,
    selectedAction,
  });
  const resolutionHash = canonicalSha256({
    protocol: AURION_EMERGENT_LIFE_PROTOCOL,
    entityId: input.entityId,
    regionId: input.regionId,
    resolutionIndex: input.resolutionIndex,
    inputImpactIds: normalizedImpacts.map(value => value.sourceReceiptId),
    beforeNeedsHash,
    afterNeedsHash,
    candidateSetHash,
    actionIntentHash,
    nextImpact,
  });
  return Object.freeze({
    protocol: AURION_EMERGENT_LIFE_PROTOCOL,
    entityId: input.entityId,
    regionId: input.regionId,
    resolutionIndex: input.resolutionIndex,
    inputImpactIds: Object.freeze(normalizedImpacts.map(value => value.sourceReceiptId)),
    beforeNeedsHash,
    afterNeedsHash,
    candidateSetHash,
    selectedAction,
    actionIntentHash,
    nextImpact,
    resolutionHash,
  });
}
