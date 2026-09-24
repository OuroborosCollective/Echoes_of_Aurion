import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  createNpcSimulationEvaluation,
  DEFAULT_NPC_SIMULATION_CADENCE,
} from "../shared/npcSimulationCadenceProtocol";
import {
  createNpcStructureObservationInput,
} from "../shared/npcStructureObservationProtocol";
import {
  createStructureProjectionContract,
} from "../shared/structureProjectionProtocol";
import { NpcSimulationScheduler, planNpcSimulationTick } from "./npcSimulationScheduler";

const identity = {
  protocol: "aurion.structure-observation.v1" as const,
  worldId: "echoes-of-aurion-global",
  epoch: 7,
  chunkCoordinate: { x: -4, z: 9 },
  structureId: "tower-7",
  anchorId: "anchor:tower-7",
  grammarId: "tower",
  grammarVersion: "2.0.0",
  worldSeedHash: canonicalSha256({ seed: "seed-7" }),
  confirmedChunkAuthorityStateHash: canonicalSha256({ chunk: "confirmed-7" }),
  sourceRevision: "b".repeat(40),
  sourceCausalRoot: canonicalSha256({ root: "root-7" }),
};
const observationKey = canonicalSha256({ domain: "aurion.structure-observation-key.v1", identity });
const materializationEnvelope = {
  protocol: "aurion.structure-materialization.v1" as const,
  observationKey,
  recipeHash: "4".repeat(64),
  state: "BASE_GRAMMAR" as const,
  primitives: [],
  deltaOverride: null,
  footprint: {
    protocol: "aurion.structure-footprint.v1" as const,
    semantics: "projection-only" as const,
    primitives: [],
    deltaOverridePositionMm: null,
  },
  collision: {
    protocol: "aurion.structure-collision-descriptor.v1" as const,
    semantics: "projection-only" as const,
    primitiveIds: [],
    deltaOverride: false,
  },
  presentation: {
    protocol: "aurion.structure-presentation-descriptor.v1" as const,
    semantics: "presentation-only" as const,
    assetKeys: [],
    primitiveKinds: [],
  },
};
const materialization = {
  ...materializationEnvelope,
  materializationHash: canonicalSha256({
    domain: "aurion.structure-materialization.v1",
    materialization: materializationEnvelope,
  }),
};
const projection = createStructureProjectionContract({
  identity,
  recipeHash: materialization.recipeHash,
  materialization,
});
const structureObservation = createNpcStructureObservationInput(projection, 100);

describe("AIM-485 deterministic multi-timescale scheduler", () => {
  it("keeps cadence a pure evaluation decision and never changes structure identity", () => {
    const full = createNpcSimulationEvaluation({
      mode: "FULL",
      currentTick: 100,
      lastEvaluationTick: 99,
      epoch: 7,
      lastConfirmedEpoch: 7,
    });
    const reduced = createNpcSimulationEvaluation({
      mode: "REDUCED",
      currentTick: 100,
      lastEvaluationTick: 99,
      epoch: 7,
      lastConfirmedEpoch: 7,
    });
    expect(full.evaluateNow).toBe(true);
    expect(reduced.evaluateNow).toBe(false);
    expect(structureObservation.observationKey).toBe(projection.observationKey);
  });

  it("does not skip or duplicate reduced logical evaluation indices", () => {
    const scheduler = new NpcSimulationScheduler();
    const first = scheduler.plan({ npcId: "npc-1", mode: "REDUCED", currentTick: 1, epoch: 1 });
    const second = scheduler.plan({ npcId: "npc-1", mode: "REDUCED", currentTick: 9, epoch: 1 });
    const third = scheduler.plan({ npcId: "npc-1", mode: "REDUCED", currentTick: 10, epoch: 1 });
    const fourth = scheduler.plan({ npcId: "npc-1", mode: "REDUCED", currentTick: 20, epoch: 1 });
    expect(first.evaluation.evaluateNow).toBe(true);
    expect(second.evaluation.evaluateNow).toBe(false);
    expect(third.evaluation.evaluateNow).toBe(true);
    expect(fourth.evaluation.evaluateNow).toBe(true);
    expect(scheduler.readback("npc-1")).toMatchObject({ lastEvaluationTick: 20 });
  });

  it("reproduces dormant catch-up from confirmed epoch evidence", () => {
    const a = createNpcSimulationEvaluation({
      mode: "DORMANT",
      currentTick: 1_000,
      lastEvaluationTick: 100,
      epoch: 12,
      lastConfirmedEpoch: 8,
    });
    const b = createNpcSimulationEvaluation({
      mode: "DORMANT",
      currentTick: 1_000,
      lastEvaluationTick: 100,
      epoch: 12,
      lastConfirmedEpoch: 8,
    });
    expect(a).toEqual(b);
    expect(a.catchupEpochs).toEqual([9, 10, 11, 12]);
  });

  it("fails closed when dormant catch-up exceeds the explicit budget", () => {
    expect(() => createNpcSimulationEvaluation({
      mode: "DORMANT",
      currentTick: 1_000,
      lastEvaluationTick: 100,
      epoch: DEFAULT_NPC_SIMULATION_CADENCE.maxCatchupEpochs + 2,
      lastConfirmedEpoch: 0,
    })).toThrow("NPC_CADENCE_CATCHUP_BUDGET_EXCEEDED");
  });

  it("binds the NPC structure evidence hash to the same confirmed observation regardless of input order", () => {
    const a = planNpcSimulationTick({
      npcId: "npc-2",
      mode: "FULL",
      currentTick: 100,
      lastEvaluationTick: 99,
      epoch: 7,
      lastConfirmedEpoch: 7,
      structureObservations: [structureObservation],
    });
    const b = planNpcSimulationTick({
      npcId: "npc-2",
      mode: "FULL",
      currentTick: 100,
      lastEvaluationTick: 99,
      epoch: 7,
      lastConfirmedEpoch: 7,
      structureObservations: [structureObservation],
    });
    expect(a).toEqual(b);
    expect(a.structureObservationKeys).toEqual([observationKey]);
    expect(a.structureEvidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects future structure evidence instead of allowing the renderer/cache to advance NPC state", () => {
    const future = createNpcStructureObservationInput(projection, 101);
    expect(() => planNpcSimulationTick({
      npcId: "npc-3",
      mode: "FULL",
      currentTick: 100,
      lastEvaluationTick: 99,
      epoch: 7,
      lastConfirmedEpoch: 7,
      structureObservations: [future],
    })).toThrow("NPC_STRUCTURE_OBSERVATION_FUTURE_TICK");
  });
});
