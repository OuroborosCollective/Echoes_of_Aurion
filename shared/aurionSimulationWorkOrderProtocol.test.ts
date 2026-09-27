import { describe, expect, it } from "vitest";
import {
  AURION_SIMULATION_PHASES,
  buildSimulationWorkPlan,
  canonicalizeSimulationWork,
  partitionSimulationWork,
  type SimulationWorkItem,
} from "./aurionSimulationWorkOrderProtocol";

const revision = "32b51cad50593e049431e3007cb877a1eb8252f6";
const hash = (suffix: string) => "sha256:" + suffix.padStart(64, "0").slice(-64);

const items: SimulationWorkItem[] = [
  { workId:"w3", phase:"LOCAL_ECONOMY", entityId:"npc:2", actionId:"trade", resolutionIndex:2, sourceRevision:revision, logicalTick:40, inputHash:hash("3"), dependencyIds:["npc:1","market:1"] },
  { workId:"w1", phase:"WORLD_IMPACT", entityId:"npc:2", actionId:"observe", resolutionIndex:1, sourceRevision:revision, logicalTick:40, inputHash:hash("1"), dependencyIds:["world:root"] },
  { workId:"w2", phase:"WORLD_IMPACT", entityId:"npc:1", actionId:"observe", resolutionIndex:1, sourceRevision:revision, logicalTick:40, inputHash:hash("2"), dependencyIds:["world:root"] },
  { workId:"w4", phase:"LONG_HORIZON", entityId:"faction:1", actionId:"govern", resolutionIndex:9, sourceRevision:revision, logicalTick:40, inputHash:hash("4"), dependencyIds:[] },
  { workId:"w5", phase:"HOUSEHOLD", entityId:"house:1", actionId:"consume", resolutionIndex:1, sourceRevision:revision, logicalTick:40, inputHash:hash("5"), dependencyIds:["npc:1"] },
];

describe("aurion.simulation-work-order.v1", () => {
  it("fixes the phase and tie-break order independent of input order", () => {
    const first = canonicalizeSimulationWork(items);
    const second = canonicalizeSimulationWork([...items].reverse());
    expect(first.map(v => v.workId)).toEqual(["w2","w1","w5","w3","w4"]);
    expect(second.map(v => v.workId)).toEqual(first.map(v => v.workId));
    expect(AURION_SIMULATION_PHASES[0]).toBe("WORLD_IMPACT");
  });

  it("sorts dependency identities canonically without changing work identity", () => {
    const first = canonicalizeSimulationWork([items[0]!])[0]!;
    expect(first.dependencyIds).toEqual(["market:1","npc:1"]);
    expect(first.workId).toBe("w3");
  });

  it("creates deterministic bounded deferred work instead of dropping overflow", () => {
    const one = buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:items, maxWorkItems:3 });
    const two = buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:[...items].reverse(), maxWorkItems:3 });
    expect(one.orderedWork).toHaveLength(3);
    expect(one.deferredWork).toHaveLength(2);
    expect(one.deferredWork.map(v => v.workId)).toEqual(["w3","w4"]);
    expect(one.planHash).toBe(two.planHash);
    expect(one.inputHash).toBe(two.inputHash);
    expect(one.deferredWork.map(v => v.continuationOrdinal)).toEqual([1,2]);
  });

  it("recombines deterministic partitions to the same canonical plan", () => {
    const partitions = partitionSimulationWork(items, 3);
    const recombined = partitions.flatMap(partition => partition);
    const single = buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:items, maxWorkItems:items.length });
    const parallel = buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:recombined, maxWorkItems:items.length });
    expect(parallel.planHash).toBe(single.planHash);
    expect(parallel.orderedWork.map(v => v.workId)).toEqual(single.orderedWork.map(v => v.workId));
  });

  it("fails closed on mixed revision, future tick, duplicate identity and bad budget", () => {
    expect(() => buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:[{ ...items[0]!, sourceRevision:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }], maxWorkItems:1 })).toThrow("SIMULATION_WORK_MIXED_REVISION");
    expect(() => buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:[{ ...items[0]!, logicalTick:41 }], maxWorkItems:1 })).toThrow("SIMULATION_WORK_FUTURE_TICK");
    expect(() => canonicalizeSimulationWork([items[0]!, { ...items[0]!, workId:"w3x" }])).not.toThrow();
    expect(() => canonicalizeSimulationWork([items[0]!, { ...items[0]! }])).toThrow("SIMULATION_WORK_DUPLICATE");
    expect(() => buildSimulationWorkPlan({ sourceRevision:revision, logicalTick:40, workItems:items, maxWorkItems:0 })).toThrow("SIMULATION_WORK_BUDGET_INVALID");
  });
});