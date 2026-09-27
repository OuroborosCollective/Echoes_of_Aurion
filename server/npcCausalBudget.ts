import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  npcCausalBudgetInputSchema,
  planNpcCausalCatchup,
  resolveNpcCausalBudget,
  type NpcCausalBudgetDecision,
  type NpcCausalBudgetInput,
  type NpcCausalCatchupPlan,
  type NpcCausalInputEvidence,
} from "../shared/npcCausalBudgetProtocol";

export type NpcCausalBudgetRuntimeInput = Readonly<
  NpcCausalBudgetInput & {
    stateHash: string;
    reducedModelVersion: string;
    boundedCausalInputs: readonly NpcCausalInputEvidence[];
  }
>;

export type NpcCausalBudgetRuntimePlan = Readonly<{
  decision: NpcCausalBudgetDecision;
  catchup: NpcCausalCatchupPlan | null;
  runtimeHash: string;
}>;

export function planNpcCausalBudget(
  input: NpcCausalBudgetRuntimeInput,
): NpcCausalBudgetRuntimePlan {
  const {
    stateHash,
    reducedModelVersion,
    boundedCausalInputs,
    ...causalBudgetInput
  } = input;

  const causalBudget = npcCausalBudgetInputSchema.parse(causalBudgetInput);
  const decision = resolveNpcCausalBudget(causalBudget);

  const catchup = decision.catchupRequired
    ? planNpcCausalCatchup({
        npcId: decision.npcId,
        tier: decision.tier,
        stateHash,
        reducedModelVersion,
        lastResolutionIndex: decision.catchupFromResolutionIndex,
        currentResolutionIndex: decision.catchupToResolutionIndex,
        sourceRevision: decision.sourceRevision,
        boundedCausalInputs,
        maxSteps: causalBudget.maxCatchupSteps,
      })
    : null;

  const runtimeBase = {
    domain: "aurion.npc-causal-budget.runtime.v1",
    decision: decision.decisionHash,
    catchup: catchup?.outputHash ?? null,
  } as const;

  return Object.freeze({
    decision,
    catchup,
    runtimeHash: canonicalSha256(runtimeBase),
  });
}
