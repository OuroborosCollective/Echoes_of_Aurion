import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  planNpcCausalCatchup,
  resolveNpcCausalBudget,
  type NpcCausalBudgetInput,
  type NpcCausalBudgetDecision,
  type NpcCausalCatchupPlan,
} from "../shared/npcCausalBudgetProtocol";

export type NpcCausalBudgetRuntimeInput = Readonly<NpcCausalBudgetInput & {
  stateHash: string;
  boundedCausalInputHashes: readonly string[];
}>;

export type NpcCausalBudgetRuntimePlan = Readonly<{
  decision: NpcCausalBudgetDecision;
  catchup: NpcCausalCatchupPlan | null;
  runtimeHash: string;
}>;

export function planNpcCausalBudget(input: NpcCausalBudgetRuntimeInput): NpcCausalBudgetRuntimePlan {
  const decision = resolveNpcCausalBudget(input);
  const catchup = decision.catchupRequired
    ? planNpcCausalCatchup({
        npcId: decision.npcId,
        tier: decision.tier,
        stateHash: input.stateHash,
        lastResolutionIndex: decision.catchupFromResolutionIndex,
        currentResolutionIndex: decision.catchupToResolutionIndex,
        sourceRevision: decision.sourceRevision,
        boundedCausalInputHashes: input.boundedCausalInputHashes,
        maxSteps: input.maxCatchupSteps,
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
