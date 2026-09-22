import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_REPLAY_VERDICT_SCHEMA = "aurion.replay.verdict.v2" as const;

export const replayDomainSchema = z.enum([
  "ZONE_TICK",
  "QUEST_COMPILER",
  "WORLD_CONTEXT",
]);
export type ReplayDomain = z.infer<typeof replayDomainSchema>;

export const replayRangeSchema = z.object({
  fromTick: z.number().int().nonnegative().optional(),
  toTick: z.number().int().nonnegative().optional(),
  fromEpoch: z.number().int().nonnegative().optional(),
  toEpoch: z.number().int().nonnegative().optional(),
  fromSequence: z.number().int().nonnegative().optional(),
  toSequence: z.number().int().nonnegative().optional(),
}).strict().refine(
  value => Object.values(value).some(candidate => candidate !== undefined),
  "Replay range must bind at least one tick, epoch, or sequence boundary",
);
export type ReplayRange = z.infer<typeof replayRangeSchema>;

export const replayScopeIdentitySchema = z.record(z.string().min(1), z.string().min(1));
export type ReplayScopeIdentity = z.infer<typeof replayScopeIdentitySchema>;

export type ReplayStage =
  | "PRE_STATE"
  | "INPUT_ORDER"
  | "POST_STATE"
  | "RECEIPT"
  | "MOVEMENT"
  | "PLAYER_ACTION"
  | "RESOURCE"
  | "MOB_FSM"
  | "MOB_COMBAT"
  | "TEMPLATE_SET"
  | "CANDIDATE_SET"
  | "TEMPLATE_SELECTION"
  | "SEED_DIGEST"
  | "ROLE_BINDING"
  | "PLAN_HASH"
  | "RUNTIME_EVENTS"
  | "SEMANTIC_OUTCOME"
  | "QUERY_CONTRACT"
  | "SOURCE_SCOPE"
  | "SOURCE_ROOT_HASH"
  | "SELECTED_SOURCE_COUNT"
  | "SELECTED_SOURCE_ROOT_HASH"
  | "OMITTED_SOURCE_ROOT_HASH"
  | "CAPSULE_HASH";

const replayCommonShape = {
  schemaVersion: z.literal(AURION_REPLAY_VERDICT_SCHEMA),
  domain: replayDomainSchema,
  sourceRevision: z.string().min(1),
  rulesetVersion: z.string().min(1),
  scopeIdentity: replayScopeIdentitySchema,
  range: replayRangeSchema,
  verifiedStages: z.array(z.string().min(1)),
  stagesVerified: z.number().int().nonnegative(),
  firstDivergentStage: z.string().min(1).nullable(),
  expectedHash: z.string().min(1).nullable(),
  observedHash: z.string().min(1).nullable(),
  reason: z.string().min(1).nullable(),
};

export const replayVerdictSchema = z.discriminatedUnion("status", [
  z.object({
    ...replayCommonShape,
    verifiedStages: z.array(z.string().min(1)).min(1),
    stagesVerified: z.number().int().positive(),
    status: z.literal("MATCH"),
    verdict: z.literal("MATCH"),
    firstDivergentStage: z.null(),
    expectedHash: z.null(),
    observedHash: z.null(),
    reason: z.null(),
    tick: z.number().int().nonnegative().optional(),
    preStateHash: z.string().optional(),
    postStateHash: z.string().optional(),
    receiptHash: z.string().optional(),
    postState: z.unknown().optional(),
    capsuleHash: z.string().optional(),
  }).strict(),
  z.object({
    ...replayCommonShape,
    status: z.literal("FIRST_DIVERGENCE"),
    verdict: z.literal("FIRST_DIVERGENCE"),
    firstDivergentStage: z.string().min(1),
    expectedHash: z.string().min(1),
    observedHash: z.string().min(1),
    reason: z.null(),
    stage: z.string().min(1),
    expected: z.string(),
    observed: z.string(),
    tick: z.number().int().nonnegative().optional(),
    diffDetails: z.string().optional(),
  }).strict(),
  z.object({
    ...replayCommonShape,
    status: z.literal("UNPROVABLE"),
    verdict: z.literal("UNPROVABLE"),
    firstDivergentStage: z.null(),
    expectedHash: z.null(),
    observedHash: z.null(),
    reason: z.string().min(1),
    tick: z.number().int().nonnegative().optional(),
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.stagesVerified !== value.verifiedStages.length) {
    ctx.addIssue({
      code: "custom",
      path: ["stagesVerified"],
      message: "REPLAY_VERIFIED_STAGE_COUNT_MISMATCH",
    });
  }
});
export type ReplayVerdict = z.infer<typeof replayVerdictSchema>;

export interface ReplayVerdictContext {
  domain: ReplayDomain;
  sourceRevision: string;
  rulesetVersion: string;
  scopeIdentity: ReplayScopeIdentity;
  range: ReplayRange;
}

function base(context: ReplayVerdictContext, verifiedStages: readonly string[]) {
  const normalized = {
    schemaVersion: AURION_REPLAY_VERDICT_SCHEMA,
    domain: context.domain,
    sourceRevision: context.sourceRevision,
    rulesetVersion: context.rulesetVersion,
    scopeIdentity: context.scopeIdentity,
    range: context.range,
    verifiedStages: [...verifiedStages],
    stagesVerified: verifiedStages.length,
  } as const;
  replayRangeSchema.parse(normalized.range);
  replayScopeIdentitySchema.parse(normalized.scopeIdentity);
  if (!normalized.sourceRevision.trim()) throw new Error("REPLAY_SOURCE_REVISION_MISSING");
  if (!normalized.rulesetVersion.trim()) throw new Error("REPLAY_RULESET_VERSION_MISSING");
  return normalized;
}

export function replayMatch(
  context: ReplayVerdictContext,
  verifiedStages: readonly string[],
  extra: Partial<Pick<Extract<ReplayVerdict, { status: "MATCH" }>, "tick" | "preStateHash" | "postStateHash" | "receiptHash" | "postState" | "capsuleHash">> = {},
): Extract<ReplayVerdict, { status: "MATCH" }> {
  return replayVerdictSchema.parse({
    ...base(context, verifiedStages),
    status: "MATCH",
    verdict: "MATCH",
    firstDivergentStage: null,
    expectedHash: null,
    observedHash: null,
    reason: null,
    ...extra,
  }) as Extract<ReplayVerdict, { status: "MATCH" }>;
}

function replayObservedValueHash(value: string): string {
  if (/^(?:sha256:)?[a-f0-9]{64}$/i.test(value)) return value;
  return canonicalSha256({ schema: "aurion.replay.observed-value.v1", value });
}

export function replayFirstDivergence(
  context: ReplayVerdictContext,
  verifiedStages: readonly string[],
  input: {
    stage: ReplayStage | string;
    expected: string;
    observed: string;
    expectedHash?: string;
    observedHash?: string;
    tick?: number;
    diffDetails?: string;
  },
): Extract<ReplayVerdict, { status: "FIRST_DIVERGENCE" }> {
  return replayVerdictSchema.parse({
    ...base(context, verifiedStages),
    status: "FIRST_DIVERGENCE",
    verdict: "FIRST_DIVERGENCE",
    firstDivergentStage: input.stage,
    expectedHash: input.expectedHash ?? replayObservedValueHash(input.expected),
    observedHash: input.observedHash ?? replayObservedValueHash(input.observed),
    reason: null,
    stage: input.stage,
    expected: input.expected,
    observed: input.observed,
    tick: input.tick,
    diffDetails: input.diffDetails,
  }) as Extract<ReplayVerdict, { status: "FIRST_DIVERGENCE" }>;
}

export function replayUnprovable(
  context: ReplayVerdictContext,
  verifiedStages: readonly string[],
  reason: string,
  extra: { tick?: number } = {},
): Extract<ReplayVerdict, { status: "UNPROVABLE" }> {
  return replayVerdictSchema.parse({
    ...base(context, verifiedStages),
    status: "UNPROVABLE",
    verdict: "UNPROVABLE",
    firstDivergentStage: null,
    expectedHash: null,
    observedHash: null,
    reason,
    ...extra,
  }) as Extract<ReplayVerdict, { status: "UNPROVABLE" }>;
}

export function isReplayMatch(verdict: ReplayVerdict): boolean {
  return verdict.status === "MATCH";
}
