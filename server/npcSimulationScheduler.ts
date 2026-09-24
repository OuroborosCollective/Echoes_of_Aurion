import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  createNpcSimulationEvaluation,
  DEFAULT_NPC_SIMULATION_CADENCE,
  npcSimulationCadenceContractSchema,
  type NpcSimulationCadenceContract,
  type NpcSimulationEvaluation,
  type NpcSimulationMode,
} from "../shared/npcSimulationCadenceProtocol";
import {
  npcStructureObservationInputSchema,
  type NpcStructureObservationInput,
} from "../shared/npcStructureObservationProtocol";

export type NpcSimulationScheduleDecision = Readonly<{
  npcId: string;
  evaluation: NpcSimulationEvaluation;
  structureObservationKeys: readonly string[];
  structureEvidenceHash: string;
}>;

function npcId(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(trimmed)) throw new Error("NPC_SCHEDULER_ID_INVALID");
  return trimmed;
}

function canonicalStructureInputs(
  values: readonly NpcStructureObservationInput[],
  tick: number,
): readonly NpcStructureObservationInput[] {
  const parsed = values.map(value => npcStructureObservationInputSchema.parse(value));
  for (const value of parsed) {
    if (value.logicalTick > tick) throw new Error("NPC_STRUCTURE_OBSERVATION_FUTURE_TICK");
  }
  const unique = new Map<string, NpcStructureObservationInput>();
  for (const value of parsed) {
    const existing = unique.get(value.observationKey);
    if (existing && existing.materializationHash !== value.materializationHash) {
      throw new Error("NPC_STRUCTURE_OBSERVATION_CONFLICT");
    }
    if (!existing || value.logicalTick >= existing.logicalTick) unique.set(value.observationKey, value);
  }
  return Object.freeze(Array.from(unique.values()).sort((left, right) =>
    left.observationKey.localeCompare(right.observationKey) ||
    left.structureId.localeCompare(right.structureId) ||
    left.anchorId.localeCompare(right.anchorId),
  ));
}

export function planNpcSimulationTick(input: {
  npcId: string;
  mode: NpcSimulationMode;
  currentTick: number;
  lastEvaluationTick: number | null;
  epoch: number;
  lastConfirmedEpoch: number | null;
  structureObservations?: readonly NpcStructureObservationInput[];
  cadence?: NpcSimulationCadenceContract;
}): NpcSimulationScheduleDecision {
  const id = npcId(input.npcId);
  const cadence = npcSimulationCadenceContractSchema.parse(input.cadence ?? DEFAULT_NPC_SIMULATION_CADENCE);
  const evaluation = createNpcSimulationEvaluation({
    mode: input.mode,
    currentTick: input.currentTick,
    lastEvaluationTick: input.lastEvaluationTick,
    epoch: input.epoch,
    lastConfirmedEpoch: input.lastConfirmedEpoch,
    cadence,
  });
  const observations = canonicalStructureInputs(input.structureObservations ?? [], input.currentTick);
  const structureObservationKeys = Object.freeze(observations.map(value => value.observationKey));
  const structureEvidenceHash = canonicalSha256({
    domain: "aurion.npc-structure-evidence.v1",
    npcId: id,
    logicalTick: input.currentTick,
    observations: observations.map(value => ({
      observationKey: value.observationKey,
      worldId: value.worldId,
      chunkCoordinate: value.chunkCoordinate,
      structureId: value.structureId,
      anchorId: value.anchorId,
      grammarId: value.grammarId,
      grammarVersion: value.grammarVersion,
      confirmedChunkAuthorityStateHash: value.confirmedChunkAuthorityStateHash,
      sourceCausalRoot: value.sourceCausalRoot,
      sourceRevision: value.sourceRevision,
      recipeHash: value.recipeHash,
      materializationHash: value.materializationHash,
    })),
  });
  return Object.freeze({
    npcId: id,
    evaluation,
    structureObservationKeys,
    structureEvidenceHash,
  });
}

export class NpcSimulationScheduler {
  private readonly cadence: NpcSimulationCadenceContract;
  private readonly states = new Map<string, { lastEvaluationTick: number | null; lastConfirmedEpoch: number | null }>();

  constructor(cadence: NpcSimulationCadenceContract = DEFAULT_NPC_SIMULATION_CADENCE) {
    this.cadence = Object.freeze(npcSimulationCadenceContractSchema.parse(cadence));
  }

  reset(npcIdValue: string): void {
    this.states.delete(npcId(npcIdValue));
  }

  plan(input: {
    npcId: string;
    mode: NpcSimulationMode;
    currentTick: number;
    epoch: number;
    structureObservations?: readonly NpcStructureObservationInput[];
  }): NpcSimulationScheduleDecision {
    const id = npcId(input.npcId);
    const current = this.states.get(id) ?? { lastEvaluationTick: null, lastConfirmedEpoch: null };
    const decision = planNpcSimulationTick({
      ...input,
      npcId: id,
      lastEvaluationTick: current.lastEvaluationTick,
      lastConfirmedEpoch: current.lastConfirmedEpoch,
      cadence: this.cadence,
    });
    if (decision.evaluation.evaluateNow) {
      this.states.set(id, {
        lastEvaluationTick: input.currentTick,
        lastConfirmedEpoch: input.mode === "DORMANT" ? input.epoch : current.lastConfirmedEpoch,
      });
    }
    return decision;
  }

  readback(npcIdValue: string): Readonly<{ lastEvaluationTick: number | null; lastConfirmedEpoch: number | null }> {
    const id = npcId(npcIdValue);
    const state = this.states.get(id) ?? { lastEvaluationTick: null, lastConfirmedEpoch: null };
    return Object.freeze({ ...state });
  }
}
