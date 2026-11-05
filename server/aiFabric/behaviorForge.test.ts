import { describe, expect, it } from "vitest";
import { evaluateBehavior, behaviorTemplate } from "./behaviorForge";
import { buildPlannerContext } from "../../shared/npcUtilityPlannerDebug";

// Synthetic observations. These tests do not claim production NPC execution.
const context = () => buildPlannerContext({ npcId: "isolated-npc", resolutionIndex: 3,
  goal: "gather_resources", needs: { safety: .8, resources: .8, belonging: .8, status: .8, wealth: .8, power: .8 } });

describe("Behavior Forge recommendation boundary", () => {
  it("never promotes a blocked action even when a behavior tree prioritizes it", () => {
    const input = context();
    const candidate = behaviorTemplate("blacksmith", "tree");
    const constrained = { ...input, candidates: input.candidates.map(c => c.action === "produce"
      ? { ...c, constraintStatus: "blocked" as const, constraintCode: "INVENTORY_FULL" } : c) };
    const result = evaluateBehavior(candidate, constrained);
    expect(result.proposal?.action).not.toBe("produce");
    expect(result.mutationAuthority).toBe("none");
    expect(result).not.toHaveProperty("receipt");
    expect(evaluateBehavior(candidate, constrained)).toEqual(result);
  });
});

it("keeps hunger and fatigue interrupts in every controller mode", () => {
  for(const mode of ["tree","utility","micro-shadow"] as const) {
    const artifact=behaviorTemplate("blacksmith",mode);
    expect(evaluateBehavior(artifact,{...context(),hungerBps:8000}).proposal?.action).toBe("consume");
    expect(evaluateBehavior(artifact,{...context(),fatigueBps:9000}).proposal?.action).toBe("rest");
  }
});
it("returns no recommendation when the canonical gate blocks every candidate",()=>{
  const c=context();
  const blocked={...c,candidates:c.candidates.map(x=>({...x,sourceReceiptId:"stale"}))};
  expect(evaluateBehavior(behaviorTemplate("guard","utility"),blocked)).toMatchObject({proposal:null,fallback:"NO_RECOMMENDATION_KEEP_CANONICAL_RUNTIME"});
});
it("rejects hidden effect fields, unsupported actions, fractional weights and overflow",()=>{
  const a=behaviorTemplate("guard","utility");
  for(const invalid of [{...a,reward:100},{...a,allowedActions:["REQUEST_ATTACK"]},{...a,weights:[1.1,0,0,0]},{...a,weights:[17,0,0,0]},{...a,bias:Infinity}])
    expect(()=>evaluateBehavior(invalid,context())).toThrow();
});
it("uses declaration order for ties and binds version changes without mutating old artifacts",()=>{
  const a={...behaviorTemplate("blacksmith","utility"),weights:[0,0,0,0] as [number,number,number,number],bias:0};
  const c=context(),old=JSON.stringify(a),one=evaluateBehavior(a,c);
  expect(one.proposal?.action).toBe("consume");
  expect(evaluateBehavior({...a,version:2},c).controllerHash).not.toBe(one.controllerHash);
  expect(evaluateBehavior(JSON.parse(old),c)).toEqual(one);
  expect(JSON.stringify(a)).toBe(old);
});
it("checks risk-sign editing against independently calculated scores",async()=>{
  const {weightSpaceExperiment}=await import("./behaviorForge");
  expect(weightSpaceExperiment()).toMatchObject({beforeScores:[25000,11000],afterScores:[7000,9000],utilityScores:[7000,9000],deltaRank:1,trained:false});
});
it("measures bounded synthetic comparison load, not live tick capacity",()=>{
  const a=behaviorTemplate("blacksmith","utility"),c=context();
  for(const count of [1,100,1000]) {
    const memory=process.memoryUsage().heapUsed,start=performance.now();
    let last="";
    for(let i=0;i<count;i++) last=evaluateBehavior(a,c).comparisonHash;
    const elapsedMs=performance.now()-start;
    console.info("BEHAVIOR_SYNTHETIC_BENCHMARK",JSON.stringify({count,elapsedMs,heapDeltaBytes:process.memoryUsage().heapUsed-memory,hash:last,node:process.version,arch:process.arch,liveTickImpact:"NOT_MEASURED"}));
    expect(elapsedMs).toBeLessThan(20000);
    expect(last).toMatch(/^sha256:[a-f0-9]{64}$/);
  }
});
