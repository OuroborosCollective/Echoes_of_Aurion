import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  applySocialMembershipCommand,
  createSocialMembershipCommand,
  resolveSocialFormationStep,
  verifySocialFormationResolution,
  type SocialActorEvidence,
  type SocialFormationCandidate,
  type SocialFormationInput,
  type SocialOrganizationState,
} from "./aurionSocialOrganizationProtocol";

const REVISION = "a".repeat(40);
const OTHER_REVISION = "b".repeat(40);
const receiptHash = (id: string) =>
  canonicalSha256({ authority: "aurion", receiptId: id });
const binding = (id: string, resolutionIndex = 12) => ({
  sourceReceiptId: `receipt:${id}`,
  sourceReceiptHash: receiptHash(`receipt:${id}`),
  sourceRevision: REVISION,
  resolutionIndex,
});

const actor = (
  entityId: string,
  role: SocialActorEvidence["role"],
  capabilities: SocialActorEvidence["capabilities"],
  needKinds: SocialActorEvidence["needKinds"] = ["safety", "belonging"]
): SocialActorEvidence => ({
  entityId,
  regionId: "region:observatory",
  alive: true,
  role,
  capabilities,
  needKinds,
  evidence: binding(`actor-${entityId}`),
});

const actors: readonly SocialActorEvidence[] = [
  actor("npc:alpha", "leader", ["combat", "diplomacy"]),
  actor("npc:bravo", "healer", ["healing", "knowledge"]),
  actor("npc:charlie", "scout", ["scouting", "transport"]),
];

const candidate = (
  candidateId: string,
  overrides: Partial<SocialFormationCandidate> = {}
): SocialFormationCandidate => ({
  candidateId,
  kind: "adventure_group",
  regionId: "region:observatory",
  memberIds: ["npc:alpha", "npc:bravo", "npc:charlie"],
  sharedNeedKind: "safety",
  requiredCapabilities: ["combat", "healing", "scouting"],
  requiredRoles: ["leader", "healer", "scout"],
  sharedNeedBps: 7_000,
  complementaryCapabilityBps: 8_000,
  trustBps: 7_500,
  mutualBenefitBps: 8_000,
  repeatedCooperationBps: 6_000,
  geographyBps: 7_000,
  dangerBps: 7_000,
  tradeOpportunityBps: 0,
  evidence: [binding(`candidate-${candidateId}`)],
  sourceRevision: REVISION,
  resolutionIndex: 12,
  ...overrides,
});

const baseInput = (): SocialFormationInput => ({
  sourceRevision: REVISION,
  resolutionIndex: 12,
  actors,
  candidates: [candidate("candidate:b"), candidate("candidate:a")],
  existingOrganizationIds: [],
});

function commandFor(
  state: SocialOrganizationState,
  overrides: Partial<Parameters<typeof createSocialMembershipCommand>[0]> = {}
) {
  return createSocialMembershipCommand({
    commandId: "command:join-delta",
    organizationId: state.organizationId,
    operation: "join",
    memberId: "npc:delta",
    role: "guard",
    expectedRevision: state.revision,
    sourceRevision: state.sourceRevision,
    resolutionIndex: 13,
    sourceReceiptId: "receipt:command-join-delta",
    sourceReceiptHash: receiptHash("receipt:command-join-delta"),
    ...overrides,
  });
}

describe("AIM-549 deterministic social organization formation", () => {
  it("selects one eligible candidate deterministically and is input-order invariant", () => {
    const first = resolveSocialFormationStep(baseInput());
    const second = resolveSocialFormationStep({
      ...baseInput(),
      actors: [...actors].reverse(),
      candidates: [...baseInput().candidates].reverse(),
    });
    expect(first).toEqual(second);
    expect(first.selectedCandidateId).toBe("candidate:a");
    expect(first.organizationState?.kind).toBe("adventure_group");
    expect(
      first.organizationState?.members.map(member => member.entityId)
    ).toEqual(["npc:alpha", "npc:bravo", "npc:charlie"]);
    expect(first.effectIntent).toMatchObject({
      effectType: "social-organization-formation",
      subjectId: first.organizationState?.organizationId,
      ordinal: 12,
    });
    expect(first.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifySocialFormationResolution(baseInput(), first)).toBe(true);
  });

  it("requires shared needs, complementary capabilities and exact metric boundaries", () => {
    const blocked = resolveSocialFormationStep({
      ...baseInput(),
      candidates: [
        candidate("candidate:blocked", {
          sharedNeedBps: 4_999,
          requiredCapabilities: ["combat", "healing", "trade"],
        }),
      ],
      actors: actors.map(value =>
        value.entityId === "npc:charlie"
          ? { ...value, needKinds: ["family"] }
          : value
      ),
    });
    expect(blocked.selectedCandidateId).toBeNull();
    expect(blocked.effectIntent).toBeNull();
    expect(blocked.blockedCandidates).toEqual([
      {
        candidateId: "candidate:blocked",
        code: "CANDIDATE_SHARED_NEED_MISSING",
      },
    ]);

    const boundary = resolveSocialFormationStep({
      ...baseInput(),
      candidates: [candidate("candidate:boundary", { sharedNeedBps: 5_000 })],
    });
    expect(boundary.selectedCandidateId).toBe("candidate:boundary");
  });

  it("does not auto-form an organization that already exists", () => {
    const formed = resolveSocialFormationStep(baseInput());
    const organizationId = formed.organizationState!.organizationId;
    const repeated = resolveSocialFormationStep({
      ...baseInput(),
      candidates: [candidate("candidate:a")],
      existingOrganizationIds: [organizationId],
    });
    expect(repeated.selectedCandidateId).toBeNull();
    expect(repeated.blockedCandidates).toContainEqual({
      candidateId: "candidate:a",
      code: "CANDIDATE_ALREADY_FORMED",
    });
  });

  it("applies revision-bound join once and returns the same state on replay", () => {
    const formed = resolveSocialFormationStep(baseInput());
    const state = formed.organizationState!;
    const command = commandFor(state);
    const joined = applySocialMembershipCommand(state, command);
    const replay = applySocialMembershipCommand(joined.state, command);
    expect(joined.changed).toBe(true);
    expect(joined.alreadyApplied).toBe(false);
    expect(replay.alreadyApplied).toBe(true);
    expect(replay.changed).toBe(false);
    expect(replay.state).toEqual(joined.state);
    expect(replay.commandHash).toBe(joined.commandHash);
    expect(replay.state.members.map(member => member.entityId)).toContain(
      "npc:delta"
    );
    expect(replay.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("makes leave idempotent, protects the leader, and rejects command tampering", () => {
    const state = resolveSocialFormationStep(baseInput()).organizationState!;
    const leader = state.leaderId!;
    const leaveLeader = createSocialMembershipCommand({
      commandId: "command:leave-leader",
      organizationId: state.organizationId,
      operation: "leave",
      memberId: leader,
      role: "leader",
      expectedRevision: state.revision,
      sourceRevision: state.sourceRevision,
      resolutionIndex: 13,
      sourceReceiptId: "receipt:leave-leader",
      sourceReceiptHash: receiptHash("receipt:leave-leader"),
    });
    expect(() => applySocialMembershipCommand(state, leaveLeader)).toThrow(
      "SOCIAL_LEADER_LEAVE_REQUIRES_SUCCESSOR"
    );

    const leaveUnknown = createSocialMembershipCommand({
      commandId: "command:leave-unknown",
      organizationId: state.organizationId,
      operation: "leave",
      memberId: "npc:unknown",
      role: "member",
      expectedRevision: state.revision,
      sourceRevision: state.sourceRevision,
      resolutionIndex: 13,
      sourceReceiptId: "receipt:leave-unknown",
      sourceReceiptHash: receiptHash("receipt:leave-unknown"),
    });
    const noOp = applySocialMembershipCommand(state, leaveUnknown);
    expect(noOp.changed).toBe(false);
    expect(noOp.state.revision).toBe(state.revision + 1);
    const noOpReplay = applySocialMembershipCommand(noOp.state, leaveUnknown);
    expect(noOpReplay.alreadyApplied).toBe(true);
    expect(noOpReplay.changed).toBe(false);
    expect(noOpReplay.state).toEqual(noOp.state);

    expect(() =>
      applySocialMembershipCommand(
        state,
        commandFor(state, { sourceRevision: OTHER_REVISION })
      )
    ).toThrow("SOCIAL_COMMAND_REVISION_MISMATCH");
    expect(() =>
      applySocialMembershipCommand(state, {
        ...commandFor(state),
        admissionHash: receiptHash("tampered-admission"),
      })
    ).toThrow("SOCIAL_COMMAND_ADMISSION_HASH_MISMATCH");
  });

  it("fails closed for tampered organization state and idempotency conflicts", () => {
    const state = resolveSocialFormationStep(baseInput()).organizationState!;
    expect(() =>
      applySocialMembershipCommand(
        { ...state, stateHash: receiptHash("tampered-state") },
        commandFor(state)
      )
    ).toThrow("SOCIAL_STATE_HASH_MISMATCH");
    const command = commandFor(state);
    const joined = applySocialMembershipCommand(state, command);
    expect(() =>
      applySocialMembershipCommand(joined.state, {
        ...command,
        role: "merchant",
        admissionHash: createSocialMembershipCommand({
          ...command,
          role: "merchant",
        }).admissionHash,
      })
    ).toThrow("SOCIAL_COMMAND_IDEMPOTENCY_CONFLICT");
  });
});
