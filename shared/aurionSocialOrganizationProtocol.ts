import {
  createEffectIntent,
  type AurionEffectIntent,
} from "./aurionEffectIntentContract";
import { canonicalSha256 } from "./aurionCanonicalHash";
import type { NeedDynamicsNeedKind } from "./aurionNeedDynamics";

export const AURION_SOCIAL_ORGANIZATION_PROTOCOL =
  "aurion.social-organization.v1" as const;
export const SOCIAL_BPS_MAX = 10_000;
export const SOCIAL_MAX_MEMBERS = 32;
export const SOCIAL_MAX_APPLIED_COMMANDS = 256;

export const SOCIAL_ORGANIZATION_KINDS = [
  "party",
  "adventure_group",
  "guild",
  "militia",
  "caravan",
  "trade_organization",
] as const;
export const SOCIAL_ROLES = [
  "leader",
  "scout",
  "guard",
  "healer",
  "craftsperson",
  "merchant",
  "scholar",
  "worker",
  "member",
] as const;
export const SOCIAL_CAPABILITIES = [
  "combat",
  "defense",
  "healing",
  "scouting",
  "crafting",
  "trade",
  "transport",
  "diplomacy",
  "knowledge",
] as const;

export type SocialOrganizationKind = (typeof SOCIAL_ORGANIZATION_KINDS)[number];
export type SocialRole = (typeof SOCIAL_ROLES)[number];
export type SocialCapability = (typeof SOCIAL_CAPABILITIES)[number];

export type SocialMetricThresholds = Readonly<{
  sharedNeedBps: number;
  complementaryCapabilityBps: number;
  trustBps: number;
  mutualBenefitBps: number;
  repeatedCooperationBps: number;
  geographyBps: number;
  dangerBps: number;
  tradeOpportunityBps: number;
}>;

export const SOCIAL_FORMATION_THRESHOLDS: Readonly<
  Record<SocialOrganizationKind, SocialMetricThresholds>
> = Object.freeze({
  party: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 5_000,
    trustBps: 5_000,
    mutualBenefitBps: 5_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 0,
    dangerBps: 0,
    tradeOpportunityBps: 0,
  }),
  adventure_group: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 6_000,
    trustBps: 6_000,
    mutualBenefitBps: 6_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 5_000,
    dangerBps: 5_000,
    tradeOpportunityBps: 0,
  }),
  guild: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 6_000,
    trustBps: 6_000,
    mutualBenefitBps: 6_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 5_000,
    dangerBps: 0,
    tradeOpportunityBps: 5_000,
  }),
  militia: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 6_000,
    trustBps: 6_000,
    mutualBenefitBps: 6_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 5_000,
    dangerBps: 5_000,
    tradeOpportunityBps: 0,
  }),
  caravan: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 6_000,
    trustBps: 6_000,
    mutualBenefitBps: 6_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 5_000,
    dangerBps: 0,
    tradeOpportunityBps: 5_000,
  }),
  trade_organization: Object.freeze({
    sharedNeedBps: 5_000,
    complementaryCapabilityBps: 6_000,
    trustBps: 6_000,
    mutualBenefitBps: 6_000,
    repeatedCooperationBps: 5_000,
    geographyBps: 5_000,
    dangerBps: 0,
    tradeOpportunityBps: 6_000,
  }),
});

export type SocialEvidenceBinding = Readonly<{
  sourceReceiptId: string;
  sourceReceiptHash: string;
  sourceRevision: string;
  resolutionIndex: number;
}>;

export type SocialActorEvidence = Readonly<{
  entityId: string;
  regionId: string;
  alive: boolean;
  needKinds: readonly NeedDynamicsNeedKind[];
  capabilities: readonly SocialCapability[];
  role: SocialRole;
  evidence: SocialEvidenceBinding;
}>;

export type SocialFormationCandidate = Readonly<{
  candidateId: string;
  kind: SocialOrganizationKind;
  regionId: string;
  memberIds: readonly string[];
  sharedNeedKind: NeedDynamicsNeedKind;
  requiredCapabilities: readonly SocialCapability[];
  requiredRoles: readonly SocialRole[];
  sharedNeedBps: number;
  complementaryCapabilityBps: number;
  trustBps: number;
  mutualBenefitBps: number;
  repeatedCooperationBps: number;
  geographyBps: number;
  dangerBps: number;
  tradeOpportunityBps: number;
  evidence: readonly SocialEvidenceBinding[];
  sourceRevision: string;
  resolutionIndex: number;
}>;

export type SocialOrganizationMember = Readonly<{
  entityId: string;
  role: SocialRole;
}>;

export type AppliedSocialCommand = Readonly<{
  commandId: string;
  commandHash: string;
}>;

export type SocialOrganizationState = Readonly<{
  protocol: typeof AURION_SOCIAL_ORGANIZATION_PROTOCOL;
  organizationId: string;
  kind: SocialOrganizationKind;
  regionId: string;
  sourceRevision: string;
  revision: number;
  leaderId: string | null;
  members: readonly SocialOrganizationMember[];
  formationReceiptIds: readonly string[];
  appliedCommands: readonly AppliedSocialCommand[];
  stateHash: string;
}>;

export type SocialFormationInput = Readonly<{
  sourceRevision: string;
  resolutionIndex: number;
  actors: readonly SocialActorEvidence[];
  candidates: readonly SocialFormationCandidate[];
  existingOrganizationIds: readonly string[];
}>;

export type SocialFormationBlockerCode =
  | "CANDIDATE_DUPLICATE"
  | "CANDIDATE_KIND_INVALID"
  | "CANDIDATE_REGION_MISMATCH"
  | "CANDIDATE_MEMBER_COUNT_INVALID"
  | "CANDIDATE_MEMBER_DUPLICATE"
  | "CANDIDATE_MEMBER_UNKNOWN"
  | "CANDIDATE_MEMBER_DEAD"
  | "CANDIDATE_MEMBER_REGION_MISMATCH"
  | "CANDIDATE_SHARED_NEED_MISSING"
  | "CANDIDATE_CAPABILITY_INSUFFICIENT"
  | "CANDIDATE_ROLE_INSUFFICIENT"
  | "CANDIDATE_METRIC_INSUFFICIENT"
  | "CANDIDATE_EVIDENCE_INVALID"
  | "CANDIDATE_REVISION_MISMATCH"
  | "CANDIDATE_RESOLUTION_INDEX_MISMATCH"
  | "CANDIDATE_ALREADY_FORMED";

export type SocialFormationBlocker = Readonly<{
  candidateId: string;
  code: SocialFormationBlockerCode;
  actual?: number;
  required?: number;
  entityId?: string;
}>;

export type SocialFormationResolution = Readonly<{
  protocol: typeof AURION_SOCIAL_ORGANIZATION_PROTOCOL;
  sourceRevision: string;
  resolutionIndex: number;
  candidateSetHash: string;
  eligibleCandidateIds: readonly string[];
  blockedCandidates: readonly SocialFormationBlocker[];
  selectedCandidateId: string | null;
  organizationState: SocialOrganizationState | null;
  authorityReceiptHash: string;
  effectIntent: AurionEffectIntent | null;
  resolutionHash: string;
}>;

export type SocialMembershipCommand = Readonly<{
  commandId: string;
  organizationId: string;
  operation: "join" | "leave";
  memberId: string;
  role: SocialRole;
  expectedRevision: number;
  sourceRevision: string;
  resolutionIndex: number;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  admissionHash: string;
}>;

export type SocialMembershipResolution = Readonly<{
  protocol: typeof AURION_SOCIAL_ORGANIZATION_PROTOCOL;
  organizationId: string;
  commandId: string;
  commandHash: string;
  changed: boolean;
  alreadyApplied: boolean;
  state: SocialOrganizationState;
  resolutionHash: string;
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIdentifier(value: string, code: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,191}$/.test(value)) throw new Error(code);
  return value;
}

function assertRevision(value: string, code: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(code);
  return value;
}

function assertHash(value: string, code: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function assertInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
    throw new Error(code);
  return value;
}

function assertBps(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > SOCIAL_BPS_MAX)
    throw new Error(code);
  return value;
}

function normalizeEvidence(
  evidence: SocialEvidenceBinding,
  sourceRevision: string,
  resolutionIndex: number,
  codePrefix: string
): SocialEvidenceBinding {
  assertIdentifier(
    evidence.sourceReceiptId,
    `${codePrefix}_RECEIPT_ID_INVALID`
  );
  assertHash(evidence.sourceReceiptHash, `${codePrefix}_RECEIPT_HASH_INVALID`);
  assertRevision(evidence.sourceRevision, `${codePrefix}_REVISION_INVALID`);
  assertInteger(evidence.resolutionIndex, `${codePrefix}_INDEX_INVALID`);
  if (evidence.sourceRevision !== sourceRevision)
    throw new Error("CANDIDATE_REVISION_MISMATCH");
  if (evidence.resolutionIndex !== resolutionIndex)
    throw new Error("CANDIDATE_RESOLUTION_INDEX_MISMATCH");
  return Object.freeze({ ...evidence });
}

function normalizeActor(
  actor: SocialActorEvidence,
  sourceRevision: string,
  resolutionIndex: number
): SocialActorEvidence {
  assertIdentifier(actor.entityId, "SOCIAL_ACTOR_ID_INVALID");
  assertIdentifier(actor.regionId, "SOCIAL_ACTOR_REGION_INVALID");
  if (!SOCIAL_ROLES.includes(actor.role))
    throw new Error("SOCIAL_ACTOR_ROLE_INVALID");
  const needKinds = [...new Set(actor.needKinds)].sort(compareText);
  const capabilities = [...new Set(actor.capabilities)].sort(compareText);
  for (const capability of capabilities)
    if (!SOCIAL_CAPABILITIES.includes(capability))
      throw new Error("SOCIAL_ACTOR_CAPABILITY_INVALID");
  return Object.freeze({
    ...actor,
    needKinds: Object.freeze(needKinds),
    capabilities: Object.freeze(capabilities),
    evidence: normalizeEvidence(
      actor.evidence,
      sourceRevision,
      resolutionIndex,
      "CANDIDATE_EVIDENCE"
    ),
  });
}

function metricValues(candidate: SocialFormationCandidate): readonly number[] {
  return [
    candidate.sharedNeedBps,
    candidate.complementaryCapabilityBps,
    candidate.trustBps,
    candidate.mutualBenefitBps,
    candidate.repeatedCooperationBps,
    candidate.geographyBps,
    candidate.dangerBps,
    candidate.tradeOpportunityBps,
  ];
}

function normalizeCandidate(
  candidate: SocialFormationCandidate,
  sourceRevision: string,
  resolutionIndex: number
): SocialFormationCandidate {
  assertIdentifier(candidate.candidateId, "CANDIDATE_ID_INVALID");
  if (!SOCIAL_ORGANIZATION_KINDS.includes(candidate.kind))
    throw new Error("CANDIDATE_KIND_INVALID");
  assertIdentifier(candidate.regionId, "CANDIDATE_REGION_INVALID");
  if (!needKindIsValid(candidate.sharedNeedKind))
    throw new Error("CANDIDATE_SHARED_NEED_INVALID");
  const memberIds = [...candidate.memberIds].map(id =>
    assertIdentifier(id, "CANDIDATE_MEMBER_ID_INVALID")
  );
  if (memberIds.length < 2 || memberIds.length > SOCIAL_MAX_MEMBERS)
    throw new Error("CANDIDATE_MEMBER_COUNT_INVALID");
  if (new Set(memberIds).size !== memberIds.length)
    throw new Error("CANDIDATE_MEMBER_DUPLICATE");
  const requiredCapabilities = [
    ...new Set(candidate.requiredCapabilities),
  ].sort(compareText);
  const requiredRoles = [...new Set(candidate.requiredRoles)].sort(compareText);
  if (requiredRoles.length === 0)
    throw new Error("CANDIDATE_ROLE_REQUIREMENT_MISSING");
  if (candidate.evidence.length === 0)
    throw new Error("CANDIDATE_EVIDENCE_MISSING");
  const normalizedEvidence = candidate.evidence.map(value =>
    normalizeEvidence(
      value,
      sourceRevision,
      resolutionIndex,
      "CANDIDATE_EVIDENCE"
    )
  );
  for (const value of metricValues(candidate))
    assertBps(value, "CANDIDATE_METRIC_INVALID");
  assertRevision(candidate.sourceRevision, "CANDIDATE_SOURCE_REVISION_INVALID");
  assertInteger(
    candidate.resolutionIndex,
    "CANDIDATE_RESOLUTION_INDEX_INVALID"
  );
  if (candidate.sourceRevision !== sourceRevision)
    throw new Error("CANDIDATE_REVISION_MISMATCH");
  if (candidate.resolutionIndex !== resolutionIndex)
    throw new Error("CANDIDATE_RESOLUTION_INDEX_MISMATCH");
  return Object.freeze({
    ...candidate,
    memberIds: Object.freeze(memberIds.sort(compareText)),
    requiredCapabilities: Object.freeze(requiredCapabilities),
    requiredRoles: Object.freeze(requiredRoles),
    evidence: Object.freeze(normalizedEvidence),
  });
}

function needKindIsValid(value: NeedDynamicsNeedKind): boolean {
  return typeof value === "string" && value.length > 0;
}

function blocker(
  candidateId: string,
  code: SocialFormationBlockerCode,
  actual?: number,
  required?: number,
  entityId?: string
): SocialFormationBlocker {
  return Object.freeze({ candidateId, code, actual, required, entityId });
}

function metricBlocker(
  candidate: SocialFormationCandidate,
  thresholds: SocialMetricThresholds
): SocialFormationBlocker | null {
  const metrics: readonly [SocialFormationBlockerCode, number, number][] = [
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.sharedNeedBps,
      thresholds.sharedNeedBps,
    ],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.complementaryCapabilityBps,
      thresholds.complementaryCapabilityBps,
    ],
    ["CANDIDATE_METRIC_INSUFFICIENT", candidate.trustBps, thresholds.trustBps],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.mutualBenefitBps,
      thresholds.mutualBenefitBps,
    ],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.repeatedCooperationBps,
      thresholds.repeatedCooperationBps,
    ],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.geographyBps,
      thresholds.geographyBps,
    ],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.dangerBps,
      thresholds.dangerBps,
    ],
    [
      "CANDIDATE_METRIC_INSUFFICIENT",
      candidate.tradeOpportunityBps,
      thresholds.tradeOpportunityBps,
    ],
  ];
  const failed = metrics.find(([, actual, required]) => actual < required);
  return failed ? blocker(candidate.candidateId, ...failed) : null;
}

function validateCandidate(
  candidate: SocialFormationCandidate,
  actorsById: ReadonlyMap<string, SocialActorEvidence>,
  existingIds: ReadonlySet<string>
): SocialFormationBlocker | null {
  const actors = candidate.memberIds.map(memberId => actorsById.get(memberId));
  if (actors.some(actor => !actor))
    return blocker(candidate.candidateId, "CANDIDATE_MEMBER_UNKNOWN");
  if (existingIds.has(organizationIdFor(candidate)))
    return blocker(candidate.candidateId, "CANDIDATE_ALREADY_FORMED");
  const typedActors = actors as SocialActorEvidence[];
  if (typedActors.some(actor => !actor.alive))
    return blocker(candidate.candidateId, "CANDIDATE_MEMBER_DEAD");
  if (typedActors.some(actor => actor.regionId !== candidate.regionId))
    return blocker(candidate.candidateId, "CANDIDATE_MEMBER_REGION_MISMATCH");
  if (
    typedActors.some(
      actor => !actor.needKinds.includes(candidate.sharedNeedKind)
    )
  )
    return blocker(candidate.candidateId, "CANDIDATE_SHARED_NEED_MISSING");
  const capabilities = new Set(
    typedActors.flatMap(actor => actor.capabilities)
  );
  if (candidate.requiredCapabilities.some(value => !capabilities.has(value)))
    return blocker(candidate.candidateId, "CANDIDATE_CAPABILITY_INSUFFICIENT");
  const roles = new Set(typedActors.map(actor => actor.role));
  if (candidate.requiredRoles.some(value => !roles.has(value)))
    return blocker(candidate.candidateId, "CANDIDATE_ROLE_INSUFFICIENT");
  return metricBlocker(candidate, SOCIAL_FORMATION_THRESHOLDS[candidate.kind]);
}

function organizationIdFor(candidate: SocialFormationCandidate): string {
  return `organization:${candidate.kind}:${candidate.regionId}:${candidate.candidateId}`;
}

function candidateRank(
  candidate: SocialFormationCandidate
): readonly (number | string)[] {
  return [
    -candidate.mutualBenefitBps,
    -candidate.sharedNeedBps,
    -candidate.complementaryCapabilityBps,
    -candidate.trustBps,
    -candidate.repeatedCooperationBps,
    -candidate.geographyBps,
    -candidate.dangerBps,
    -candidate.tradeOpportunityBps,
    candidate.candidateId,
  ];
}

function compareCandidates(
  left: SocialFormationCandidate,
  right: SocialFormationCandidate
): number {
  const leftRank = candidateRank(left);
  const rightRank = candidateRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    const leftValue = leftRank[index]!;
    const rightValue = rightRank[index]!;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}

function stateHashValue(
  state: Omit<SocialOrganizationState, "stateHash">
): string {
  return canonicalSha256({
    domain: "aurion.social-organization.state.v1",
    ...state,
  });
}

function assertState(state: SocialOrganizationState): void {
  assertIdentifier(
    state.organizationId,
    "SOCIAL_STATE_ORGANIZATION_ID_INVALID"
  );
  assertIdentifier(state.regionId, "SOCIAL_STATE_REGION_INVALID");
  assertRevision(state.sourceRevision, "SOCIAL_STATE_REVISION_INVALID");
  assertInteger(state.revision, "SOCIAL_STATE_REVISION_INDEX_INVALID");
  if (!SOCIAL_ORGANIZATION_KINDS.includes(state.kind))
    throw new Error("SOCIAL_STATE_KIND_INVALID");
  const members = [...state.members].sort((left, right) =>
    compareText(left.entityId, right.entityId)
  );
  if (members.length > SOCIAL_MAX_MEMBERS)
    throw new Error("SOCIAL_STATE_MEMBER_COUNT_INVALID");
  if (new Set(members.map(member => member.entityId)).size !== members.length)
    throw new Error("SOCIAL_STATE_MEMBER_DUPLICATE");
  if (members.length === 0 && state.leaderId !== null)
    throw new Error("SOCIAL_STATE_LEADER_INVALID");
  if (
    members.length > 0 &&
    (!state.leaderId ||
      !members.some(member => member.entityId === state.leaderId))
  )
    throw new Error("SOCIAL_STATE_LEADER_INVALID");
  if (state.appliedCommands.length > SOCIAL_MAX_APPLIED_COMMANDS)
    throw new Error("SOCIAL_STATE_COMMAND_HISTORY_TOO_LARGE");
  assertHash(state.stateHash, "SOCIAL_STATE_HASH_INVALID");
  const { stateHash: _ignored, ...withoutHash } = state;
  if (stateHashValue(withoutHash) !== state.stateHash)
    throw new Error("SOCIAL_STATE_HASH_MISMATCH");
}

function buildOrganizationState(input: {
  candidate: SocialFormationCandidate;
  actorsById: ReadonlyMap<string, SocialActorEvidence>;
  sourceRevision: string;
}): SocialOrganizationState {
  const members = input.candidate.memberIds
    .map(entityId => {
      const actor = input.actorsById.get(entityId);
      if (!actor) throw new Error("CANDIDATE_MEMBER_UNKNOWN");
      return { entityId, role: actor.role } as SocialOrganizationMember;
    })
    .sort((left, right) => compareText(left.entityId, right.entityId));
  const withoutHash = {
    protocol: AURION_SOCIAL_ORGANIZATION_PROTOCOL,
    organizationId: organizationIdFor(input.candidate),
    kind: input.candidate.kind,
    regionId: input.candidate.regionId,
    sourceRevision: input.sourceRevision,
    revision: 0,
    leaderId: members[0]?.entityId ?? null,
    members: Object.freeze(members),
    formationReceiptIds: Object.freeze(
      input.candidate.evidence
        .map(value => value.sourceReceiptId)
        .sort(compareText)
    ),
    appliedCommands: Object.freeze([] as AppliedSocialCommand[]),
  } satisfies Omit<SocialOrganizationState, "stateHash">;
  return Object.freeze({
    ...withoutHash,
    stateHash: stateHashValue(withoutHash),
  });
}

export function resolveSocialFormationStep(
  input: SocialFormationInput
): SocialFormationResolution {
  const sourceRevision = assertRevision(
    input.sourceRevision,
    "SOCIAL_SOURCE_REVISION_INVALID"
  );
  const resolutionIndex = assertInteger(
    input.resolutionIndex,
    "SOCIAL_RESOLUTION_INDEX_INVALID"
  );
  const actorsById = new Map<string, SocialActorEvidence>();
  for (const actor of input.actors) {
    const normalized = normalizeActor(actor, sourceRevision, resolutionIndex);
    if (actorsById.has(normalized.entityId))
      throw new Error("SOCIAL_ACTOR_DUPLICATE");
    actorsById.set(normalized.entityId, normalized);
  }
  const existingIds = new Set(
    input.existingOrganizationIds.map(id =>
      assertIdentifier(id, "SOCIAL_EXISTING_ORGANIZATION_ID_INVALID")
    )
  );
  const normalizedCandidates: SocialFormationCandidate[] = [];
  const blockedCandidates: SocialFormationBlocker[] = [];
  const candidateIds = new Set<string>();
  for (const value of input.candidates) {
    let normalized: SocialFormationCandidate;
    try {
      normalized = normalizeCandidate(value, sourceRevision, resolutionIndex);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "CANDIDATE_EVIDENCE_INVALID";
      if (message === "CANDIDATE_REVISION_MISMATCH") throw error;
      blockedCandidates.push(
        blocker(value.candidateId, "CANDIDATE_EVIDENCE_INVALID")
      );
      continue;
    }
    if (candidateIds.has(normalized.candidateId)) {
      blockedCandidates.push(
        blocker(normalized.candidateId, "CANDIDATE_DUPLICATE")
      );
      continue;
    }
    candidateIds.add(normalized.candidateId);
    const candidateBlocker = validateCandidate(
      normalized,
      actorsById,
      existingIds
    );
    if (candidateBlocker) blockedCandidates.push(candidateBlocker);
    else normalizedCandidates.push(normalized);
  }
  const eligible = [...normalizedCandidates].sort(compareCandidates);
  const selected = eligible[0] ?? null;
  const candidateSetHash = canonicalSha256({
    domain: "aurion.social-organization.candidate-set.v1",
    sourceRevision,
    resolutionIndex,
    candidates: [...normalizedCandidates, ...blockedCandidates].sort(
      (left, right) => compareText(left.candidateId, right.candidateId)
    ),
  });
  const organizationState = selected
    ? buildOrganizationState({
        candidate: selected,
        actorsById,
        sourceRevision,
      })
    : null;
  const authorityReceiptHash = canonicalSha256({
    domain: "aurion.social-organization.authority.v1",
    sourceRevision,
    resolutionIndex,
    candidateSetHash,
    organizationStateHash: organizationState?.stateHash ?? null,
  });
  const effectIntent =
    selected && organizationState
      ? createEffectIntent({
          authorityReceiptHash,
          effectType: "social-organization-formation",
          subjectId: organizationState.organizationId,
          ordinal: resolutionIndex,
          payload: {
            protocol: AURION_SOCIAL_ORGANIZATION_PROTOCOL,
            kind: selected.kind,
            memberIds: organizationState.members.map(member => member.entityId),
            sourceRevision,
            candidateId: selected.candidateId,
            candidateSetHash,
            organizationStateHash: organizationState.stateHash,
          },
        })
      : null;
  const resultWithoutHash = {
    protocol: AURION_SOCIAL_ORGANIZATION_PROTOCOL,
    sourceRevision,
    resolutionIndex,
    candidateSetHash,
    eligibleCandidateIds: Object.freeze(
      eligible.map(candidate => candidate.candidateId)
    ),
    blockedCandidates: Object.freeze(blockedCandidates),
    selectedCandidateId: selected?.candidateId ?? null,
    organizationState,
    authorityReceiptHash,
    effectIntent,
  };
  return Object.freeze({
    ...resultWithoutHash,
    resolutionHash: canonicalSha256({
      domain: "aurion.social-organization.resolution.v1",
      ...resultWithoutHash,
      effectIntent: effectIntent
        ? {
            effectId: effectIntent.effectId,
            payloadHash: effectIntent.payloadHash,
          }
        : null,
    }),
  });
}

function commandAdmissionHash(command: SocialMembershipCommand): string {
  return canonicalSha256({
    domain: "aurion.social-organization.admission.v1",
    organizationId: command.organizationId,
    operation: command.operation,
    memberId: command.memberId,
    role: command.role,
    expectedRevision: command.expectedRevision,
    sourceRevision: command.sourceRevision,
    resolutionIndex: command.resolutionIndex,
    sourceReceiptId: command.sourceReceiptId,
  });
}

function commandHash(command: SocialMembershipCommand): string {
  return canonicalSha256({
    domain: "aurion.social-organization.command.v1",
    ...command,
  });
}

export function applySocialMembershipCommand(
  state: SocialOrganizationState,
  command: SocialMembershipCommand
): SocialMembershipResolution {
  assertState(state);
  assertIdentifier(command.commandId, "SOCIAL_COMMAND_ID_INVALID");
  assertIdentifier(
    command.organizationId,
    "SOCIAL_COMMAND_ORGANIZATION_ID_INVALID"
  );
  assertIdentifier(command.memberId, "SOCIAL_COMMAND_MEMBER_ID_INVALID");
  if (command.organizationId !== state.organizationId)
    throw new Error("SOCIAL_COMMAND_ORGANIZATION_MISMATCH");
  if (!SOCIAL_ROLES.includes(command.role))
    throw new Error("SOCIAL_COMMAND_ROLE_INVALID");
  assertInteger(
    command.expectedRevision,
    "SOCIAL_COMMAND_EXPECTED_REVISION_INVALID"
  );
  assertInteger(
    command.resolutionIndex,
    "SOCIAL_COMMAND_RESOLUTION_INDEX_INVALID"
  );
  assertRevision(command.sourceRevision, "SOCIAL_COMMAND_REVISION_INVALID");
  assertIdentifier(
    command.sourceReceiptId,
    "SOCIAL_COMMAND_RECEIPT_ID_INVALID"
  );
  assertHash(command.sourceReceiptHash, "SOCIAL_COMMAND_RECEIPT_HASH_INVALID");
  assertHash(command.admissionHash, "SOCIAL_COMMAND_ADMISSION_HASH_INVALID");
  if (command.sourceRevision !== state.sourceRevision)
    throw new Error("SOCIAL_COMMAND_REVISION_MISMATCH");
  if (command.admissionHash !== commandAdmissionHash(command))
    throw new Error("SOCIAL_COMMAND_ADMISSION_HASH_MISMATCH");
  const hash = commandHash(command);
  const prior = state.appliedCommands.find(
    value => value.commandId === command.commandId
  );
  if (prior) {
    if (prior.commandHash !== hash)
      throw new Error("SOCIAL_COMMAND_IDEMPOTENCY_CONFLICT");
    const replayWithoutHash = {
      protocol: AURION_SOCIAL_ORGANIZATION_PROTOCOL,
      organizationId: state.organizationId,
      commandId: command.commandId,
      commandHash: hash,
      changed: false,
      alreadyApplied: true,
      state,
    };
    return Object.freeze({
      ...replayWithoutHash,
      resolutionHash: canonicalSha256({
        domain: "aurion.social-organization.membership-resolution.v1",
        ...replayWithoutHash,
        stateHash: state.stateHash,
      }),
    });
  }
  if (command.expectedRevision !== state.revision)
    throw new Error("SOCIAL_COMMAND_REVISION_MISMATCH");
  const current = new Map(
    state.members.map(member => [member.entityId, member])
  );
  let changed = false;
  if (command.operation === "join") {
    if (current.has(command.memberId))
      throw new Error("SOCIAL_MEMBER_ALREADY_PRESENT");
    if (current.size >= SOCIAL_MAX_MEMBERS)
      throw new Error("SOCIAL_ORGANIZATION_FULL");
    current.set(command.memberId, {
      entityId: command.memberId,
      role: command.role,
    });
    changed = true;
  } else {
    if (current.has(command.memberId)) {
      if (command.memberId === state.leaderId && current.size > 1)
        throw new Error("SOCIAL_LEADER_LEAVE_REQUIRES_SUCCESSOR");
      current.delete(command.memberId);
      changed = true;
    }
  }
  const members = [...current.values()].sort((left, right) =>
    compareText(left.entityId, right.entityId)
  );
  const appliedCommands = [
    ...state.appliedCommands,
    { commandId: command.commandId, commandHash: hash },
  ];
  if (appliedCommands.length > SOCIAL_MAX_APPLIED_COMMANDS)
    appliedCommands.shift();
  const { stateHash: _ignored, ...stateWithoutHash } = state;
  const withoutHash = {
    ...stateWithoutHash,
    revision: state.revision + 1,
    leaderId: members[0]?.entityId ?? null,
    members: Object.freeze(members),
    appliedCommands: Object.freeze(appliedCommands),
  };
  const nextState = Object.freeze({
    ...withoutHash,
    stateHash: stateHashValue(withoutHash),
  });
  const resultWithoutHash = {
    protocol: AURION_SOCIAL_ORGANIZATION_PROTOCOL,
    organizationId: state.organizationId,
    commandId: command.commandId,
    commandHash: hash,
    changed,
    alreadyApplied: false,
    state: nextState,
  };
  return Object.freeze({
    ...resultWithoutHash,
    resolutionHash: canonicalSha256({
      domain: "aurion.social-organization.membership-resolution.v1",
      ...resultWithoutHash,
      stateHash: nextState.stateHash,
    }),
  });
}

export function createSocialMembershipCommand(
  input: Omit<SocialMembershipCommand, "admissionHash">
): SocialMembershipCommand {
  return Object.freeze({
    ...input,
    admissionHash: commandAdmissionHash(input as SocialMembershipCommand),
  });
}

export function verifySocialFormationResolution(
  input: SocialFormationInput,
  resolution: SocialFormationResolution
): boolean {
  try {
    return (
      resolveSocialFormationStep(input).resolutionHash ===
      resolution.resolutionHash
    );
  } catch {
    return false;
  }
}
