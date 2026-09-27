import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import type { NpcSimulationMode } from "./npcSimulationCadenceProtocol";

export const NPC_CAUSAL_BUDGET_PROTOCOL = "aurion.npc-causal-budget.v1" as const;

export type NpcCausalGuarantee =
  | "COMBAT_CRITICAL"
  | "LOCAL_SOCIAL_ECONOMY"
  | "REGIONAL_AGGREGATE"
  | "NONE";

export type NpcCausalBudgetTier = NpcSimulationMode;

const safeInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const resolutionIndex = z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER);
const positiveSafeInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const npcCausalGuaranteeSchema = z.enum([
  "COMBAT_CRITICAL",
  "LOCAL_SOCIAL_ECONOMY",
  "REGIONAL_AGGREGATE",
  "NONE",
]);

export const npcCausalBudgetTierSchema = z.enum([
  "FULL",
  "REDUCED",
  "STRATEGIC",
  "DORMANT",
]);

export type NpcCausalBudgetInput = Readonly<{
  npcId: string;
  importance: number;
  hasCriticalDependency: boolean;
  hasLocalDependency: boolean;
  hasRegionalDependency: boolean;
  requiredGuarantee: NpcCausalGuarantee;
  simulationInterest: boolean;
  networkInterest: boolean;
  presentationInterest: boolean;
  lastResolutionIndex: number;
  currentResolutionIndex: number;
  sourceRevision: string;
  maxCatchupSteps: number;
}>;

export const npcCausalBudgetInputSchema = z.strictObject({
  npcId: identifier,
  importance: z.number().int().min(0).max(1000),
  hasCriticalDependency: z.boolean(),
  hasLocalDependency: z.boolean(),
  hasRegionalDependency: z.boolean(),
  requiredGuarantee: npcCausalGuaranteeSchema,
  simulationInterest: z.boolean(),
  networkInterest: z.boolean(),
  presentationInterest: z.boolean(),
  lastResolutionIndex: resolutionIndex,
  currentResolutionIndex: safeInt,
  sourceRevision: revision,
  maxCatchupSteps: positiveSafeInt,
});

export type NpcCausalBudgetDecision = Readonly<{
  protocol: typeof NPC_CAUSAL_BUDGET_PROTOCOL;
  npcId: string;
  tier: NpcCausalBudgetTier;
  catchupRequired: boolean;
  catchupFromResolutionIndex: number;
  catchupToResolutionIndex: number;
  catchupSteps: number;
  sourceRevision: string;
  decisionHash: string;
}>;

export const npcCausalBudgetDecisionSchema = z.strictObject({
  protocol: z.literal(NPC_CAUSAL_BUDGET_PROTOCOL),
  npcId: identifier,
  tier: npcCausalBudgetTierSchema,
  catchupRequired: z.boolean(),
  catchupFromResolutionIndex: resolutionIndex,
  catchupToResolutionIndex: safeInt,
  catchupSteps: safeInt,
  sourceRevision: revision,
  decisionHash: sha256,
});

function checkedStepDistance(
  lastResolutionIndex: number,
  currentResolutionIndex: number,
): number {
  if (currentResolutionIndex < lastResolutionIndex) {
    throw new Error("NPC_CAUSAL_BUDGET_RESOLUTION_INDEX_REGRESSION");
  }
  const steps = currentResolutionIndex - lastResolutionIndex;
  if (!Number.isSafeInteger(steps)) {
    throw new Error("NPC_CAUSAL_BUDGET_STEP_RANGE_UNSAFE");
  }
  return steps;
}

export function resolveNpcCausalBudget(
  raw: NpcCausalBudgetInput,
): NpcCausalBudgetDecision {
  const input = npcCausalBudgetInputSchema.parse(raw);
  const catchupSteps = checkedStepDistance(
    input.lastResolutionIndex,
    input.currentResolutionIndex,
  );

  const tier: NpcCausalBudgetTier =
    input.requiredGuarantee === "COMBAT_CRITICAL" ||
    input.hasCriticalDependency ||
    input.simulationInterest
      ? "FULL"
      : input.requiredGuarantee === "LOCAL_SOCIAL_ECONOMY" ||
          input.hasLocalDependency ||
          input.networkInterest
        ? "REDUCED"
        : input.requiredGuarantee === "REGIONAL_AGGREGATE" ||
            input.hasRegionalDependency ||
            input.importance > 0
          ? "STRATEGIC"
          : "DORMANT";

  if (catchupSteps > input.maxCatchupSteps) {
    throw new Error("NPC_CAUSAL_BUDGET_CATCHUP_EXCEEDED");
  }

  const catchupRequired = tier === "DORMANT" && catchupSteps > 0;
  const decisionBase = {
    protocol: NPC_CAUSAL_BUDGET_PROTOCOL,
    npcId: input.npcId,
    tier,
    catchupRequired,
    catchupFromResolutionIndex: input.lastResolutionIndex,
    catchupToResolutionIndex: input.currentResolutionIndex,
    catchupSteps,
    sourceRevision: input.sourceRevision,
  } as const;

  return npcCausalBudgetDecisionSchema.parse(
    Object.freeze({
      ...decisionBase,
      decisionHash: canonicalSha256(decisionBase),
    }),
  );
}

export type NpcCausalInputEvidence = Readonly<{
  resolutionIndex: number;
  sourceHash: string;
}>;

const causalInputEvidenceSchema = z.strictObject({
  resolutionIndex: safeInt,
  sourceHash: sha256,
});

export type NpcCausalCatchupInput = Readonly<{
  npcId: string;
  tier: NpcCausalBudgetTier;
  stateHash: string;
  reducedModelVersion: string;
  lastResolutionIndex: number;
  currentResolutionIndex: number;
  sourceRevision: string;
  boundedCausalInputs: readonly NpcCausalInputEvidence[];
  maxSteps: number;
}>;

const catchupSchema = z.strictObject({
  npcId: identifier,
  tier: npcCausalBudgetTierSchema,
  stateHash: sha256,
  reducedModelVersion: identifier,
  lastResolutionIndex: resolutionIndex,
  currentResolutionIndex: safeInt,
  sourceRevision: revision,
  boundedCausalInputs: z.array(causalInputEvidenceSchema).max(4096),
  maxSteps: positiveSafeInt,
});

export type NpcCausalCatchupPlan = Readonly<{
  protocol: typeof NPC_CAUSAL_BUDGET_PROTOCOL;
  npcId: string;
  tier: NpcCausalBudgetTier;
  reducedModelVersion: string;
  fromResolutionIndex: number;
  toResolutionIndex: number;
  sourceRevision: string;
  orderedCausalInputs: readonly NpcCausalInputEvidence[];
  steps: number;
  outputHash: string;
}>;

export function planNpcCausalCatchup(
  raw: NpcCausalCatchupInput,
): NpcCausalCatchupPlan {
  const input = catchupSchema.parse(raw);
  const steps = checkedStepDistance(
    input.lastResolutionIndex,
    input.currentResolutionIndex,
  );

  if (steps > input.maxSteps) {
    throw new Error("NPC_CAUSAL_BUDGET_CATCHUP_EXCEEDED");
  }

  for (const evidence of input.boundedCausalInputs) {
    if (evidence.resolutionIndex <= input.lastResolutionIndex) {
      throw new Error("NPC_CAUSAL_BUDGET_INPUT_BEFORE_START");
    }
    if (evidence.resolutionIndex > input.currentResolutionIndex) {
      throw new Error("NPC_CAUSAL_BUDGET_INPUT_AFTER_TARGET");
    }
  }

  const orderedCausalInputs = Object.freeze(
    [...input.boundedCausalInputs].sort(
      (left, right) =>
        left.resolutionIndex - right.resolutionIndex ||
        left.sourceHash.localeCompare(right.sourceHash),
    ),
  );

  const base = {
    protocol: NPC_CAUSAL_BUDGET_PROTOCOL,
    npcId: input.npcId,
    tier: input.tier,
    reducedModelVersion: input.reducedModelVersion,
    stateHash: input.stateHash,
    fromResolutionIndex: input.lastResolutionIndex,
    toResolutionIndex: input.currentResolutionIndex,
    sourceRevision: input.sourceRevision,
    orderedCausalInputs,
    steps,
  } as const;

  return Object.freeze({
    ...base,
    outputHash: canonicalSha256(base),
  });
}

export function assertNpcCausalBudgetDecision(
  value: unknown,
): NpcCausalBudgetDecision {
  return npcCausalBudgetDecisionSchema.parse(value);
}
