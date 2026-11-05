import { z } from "zod";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { NPC_UTILITY_ACTION_KEYS, type NpcUtilityPlannerContext } from "../../shared/npcUtilityPlannerProtocol";
import { resolveNpcUtilityScores } from "../npcUtilityPlanner";

const action = z.enum(NPC_UTILITY_ACTION_KEYS);
const weight = z.number().int().min(-16).max(16);
const vector = z.tuple([weight, weight, weight, weight]);
export const BehaviorRole = z.enum(["blacksmith", "questgiver", "guard", "animal"]);
export const BehaviorMode = z.enum(["tree", "utility", "micro-shadow"]);
export const BehaviorArtifact = z.object({
  schemaVersion: z.literal("aurion.behavior-forge.v1"),
  controllerId: z.string().regex(/^[a-z][a-z0-9._-]{2,63}$/),
  version: z.number().int().min(1).max(1_000_000),
  mode: BehaviorMode,
  allowedActions: z.array(action).min(1).max(7).refine(a => new Set(a).size === a.length),
  // A bounded selector tree: ordered condition/action leaves, no scripts or loops.
  rules: z.array(z.object({ action, maxRiskBps: z.number().int().min(0).max(10000) }).strict()).min(1).max(32),
  weights: vector,
  bias: z.number().int().min(-10000).max(10000),
}).strict().refine(a => a.rules.every(r => a.allowedActions.includes(r.action)), {message:"RULE_ACTION_NOT_ALLOWED"});
export type BehaviorArtifactType = z.infer<typeof BehaviorArtifact>;

/** Templates describe candidates, never assert that a role or world entity exists. */
export function behaviorTemplate(role: z.infer<typeof BehaviorRole>, mode: z.infer<typeof BehaviorMode>): BehaviorArtifactType {
  const priorities = {
    blacksmith: ["produce", "trade", "socialize", "rest", "consume"],
    questgiver: ["socialize", "rest", "consume"],
    guard: ["patrol", "rest", "consume"],
    animal: ["rest", "consume"],
  } as const;
  const actions = [...priorities[BehaviorRole.parse(role)]];
  return BehaviorArtifact.parse({schemaVersion:"aurion.behavior-forge.v1", controllerId:`forge.${role}.${mode}`,
    version:1, mode, allowedActions:actions, rules:actions.map(action=>({action,maxRiskBps:10000})), weights:[2,1,-1,-1],bias:0});
}

/** Pure, read-only comparison over the existing planner's eligibility gate.
 * Dot-product bound: 4*16*10000+10000 = 650000; exact safe integers, no rounding.
 * micro-shadow is a 4 -> 4 identity/ReLU -> 1 network; deliberately offline only.
 */
export function evaluateBehavior(raw: unknown, context: NpcUtilityPlannerContext) {
  const artifact = BehaviorArtifact.parse(raw);
  const scores = resolveNpcUtilityScores(context);
  const baseline = scores.find(c=>c.constraintStatus === "eligible") ?? null;
  const eligible = scores.filter(c=>c.constraintStatus === "eligible" && artifact.allowedActions.includes(c.action));
  const traces = eligible.map(c => {
    const activations = [c.needPressureBps,c.benefitBps,c.riskBps,c.costBps];
    const terms = activations.map((v,i)=>v*artifact.weights[i]!);
    const preactivation = artifact.bias + terms.reduce((sum,v)=>sum+v,0);
    return {candidateId:c.id,action:c.action,declarationIndex:c.declarationIndex,activations,terms,
      preactivation,score:artifact.mode === "micro-shadow" ? Math.max(0,preactivation) : preactivation};
  });
  let selected: typeof traces[number] | undefined;
  if (artifact.mode === "tree") {
    for (const rule of artifact.rules) {
      const c = eligible.filter(c=>c.action===rule.action && c.riskBps<=rule.maxRiskBps)
        .sort((a,b)=>a.declarationIndex-b.declarationIndex)[0];
      if(c){ selected=traces.find(t=>t.candidateId===c.id);break; }
    }
  } else {
    selected = [...traces].sort((a,b)=>b.score-a.score || a.declarationIndex-b.declarationIndex)[0];
  }
  const result = { schemaVersion:"aurion.behavior-comparison.v1" as const,
    mutationAuthority:"none" as const, execution:"offline" as const,
    controllerHash:canonicalSha256(artifact), controllerId:artifact.controllerId, controllerVersion:artifact.version,
    observationHash:canonicalSha256(context), sourceReceiptId:context.sourceReceiptId,resolutionIndex:context.resolutionIndex,
    proposal:selected ? {candidateId:selected.candidateId,action:selected.action} : null,
    fallback:selected ? null : "NO_RECOMMENDATION_KEEP_CANONICAL_RUNTIME" as const,
    baseline:baseline ? {candidateId:baseline.id,action:baseline.action,scoreBps:baseline.scoreBps} : null,
    constraints:scores.map(c=>({candidateId:c.id,status:c.constraintStatus,code:c.constraintCode})),traces };
  return {...result, comparisonHash:canonicalSha256(result)};
}

/** Research fixture authored here, not a trained model or production observation. */
export function weightSpaceExperiment() {
  const inputs = [[6000,5000,9000,1000],[4000,3000,1000,1000]];
  const before = [2,1,1,-1], after = [2,1,-1,-1];
  const evaluate = (weights:number[]) => inputs.map(x=>Math.max(0,x.reduce((s,v,i)=>s+v*weights[i]!,0)));
  return {scope:"SYNTHETIC_OFFLINE_RESEARCH",trained:false,inputs,hidden:"identity-ReLU",
    before,after,delta:[0,0,-2,0],changedWeights:1,deltaRank:1,
    beforeScores:evaluate(before),afterScores:evaluate(after),utilityScores:evaluate(after),
    conclusion:"Risk sign correction reverses the ranking. Identical utility weights achieve the same result; no neural advantage demonstrated."};
}
