import { z } from "zod";

export const NPC_SIMULATION_CADENCE_PROTOCOL = "aurion.npc-simulation-cadence.v1" as const;

export type NpcSimulationMode = "FULL" | "REDUCED" | "STRATEGIC" | "DORMANT";

export const npcSimulationModeSchema = z.enum(["FULL", "REDUCED", "STRATEGIC", "DORMANT"]);

const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export type NpcSimulationCadenceContract = Readonly<{
  protocol: typeof NPC_SIMULATION_CADENCE_PROTOCOL;
  fullIntervalTicks: number;
  reducedIntervalTicks: number;
  strategicIntervalTicks: number;
  dormantEpochCatchup: boolean;
  maxCatchupEpochs: number;
}>;

export const npcSimulationCadenceContractSchema = z.strictObject({
  protocol: z.literal(NPC_SIMULATION_CADENCE_PROTOCOL),
  fullIntervalTicks: positiveSafeInteger,
  reducedIntervalTicks: positiveSafeInteger,
  strategicIntervalTicks: positiveSafeInteger,
  dormantEpochCatchup: z.boolean(),
  maxCatchupEpochs: positiveSafeInteger,
});

export const DEFAULT_NPC_SIMULATION_CADENCE: NpcSimulationCadenceContract = Object.freeze({
  protocol: NPC_SIMULATION_CADENCE_PROTOCOL,
  fullIntervalTicks: 1,
  reducedIntervalTicks: 10,
  strategicIntervalTicks: 100,
  dormantEpochCatchup: true,
  maxCatchupEpochs: 256,
});

export type NpcSimulationEvaluation = Readonly<{
  mode: NpcSimulationMode;
  currentTick: number;
  lastEvaluationTick: number | null;
  evaluateNow: boolean;
  intervalTicks: number | null;
  elapsedTicks: number;
  fromEpoch: number | null;
  toEpoch: number | null;
  catchupEpochs: readonly number[];
}>;

function intervalFor(mode: NpcSimulationMode, contract: NpcSimulationCadenceContract): number | null {
  switch (mode) {
    case "FULL": return contract.fullIntervalTicks;
    case "REDUCED": return contract.reducedIntervalTicks;
    case "STRATEGIC": return contract.strategicIntervalTicks;
    case "DORMANT": return null;
  }
}

export function createNpcSimulationEvaluation(input: {
  mode: NpcSimulationMode;
  currentTick: number;
  lastEvaluationTick: number | null;
  epoch: number;
  lastConfirmedEpoch: number | null;
  cadence?: NpcSimulationCadenceContract;
}): NpcSimulationEvaluation {
  const cadence = npcSimulationCadenceContractSchema.parse(input.cadence ?? DEFAULT_NPC_SIMULATION_CADENCE);
  if (!Number.isSafeInteger(input.currentTick) || input.currentTick < 1) throw new Error("NPC_CADENCE_TICK_INVALID");
  if (input.lastEvaluationTick !== null && (!Number.isSafeInteger(input.lastEvaluationTick) || input.lastEvaluationTick < 0 || input.lastEvaluationTick >= input.currentTick)) {
    throw new Error("NPC_CADENCE_LAST_TICK_INVALID");
  }
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0) throw new Error("NPC_CADENCE_EPOCH_INVALID");
  if (input.lastConfirmedEpoch !== null && (!Number.isSafeInteger(input.lastConfirmedEpoch) || input.lastConfirmedEpoch < 0 || input.lastConfirmedEpoch > input.epoch)) {
    throw new Error("NPC_CADENCE_CONFIRMED_EPOCH_INVALID");
  }

  const intervalTicks = intervalFor(input.mode, cadence);
  const elapsedTicks = input.lastEvaluationTick === null ? input.currentTick : input.currentTick - input.lastEvaluationTick;
  const evaluateNow = input.mode === "DORMANT"
    ? cadence.dormantEpochCatchup && input.lastConfirmedEpoch !== input.epoch
    : input.lastEvaluationTick === null || elapsedTicks >= intervalTicks!;
  const fromEpoch = input.mode === "DORMANT" ? input.lastConfirmedEpoch : null;
  const toEpoch = input.mode === "DORMANT" ? input.epoch : null;

  let catchupEpochs: readonly number[] = [];
  if (evaluateNow && input.mode === "DORMANT" && input.lastConfirmedEpoch !== null) {
    const count = input.epoch - input.lastConfirmedEpoch;
    if (count > cadence.maxCatchupEpochs) throw new Error("NPC_CADENCE_CATCHUP_BUDGET_EXCEEDED");
    catchupEpochs = Object.freeze(Array.from({ length: count }, (_, index) => input.lastConfirmedEpoch! + index + 1));
  } else if (evaluateNow && input.mode === "DORMANT" && input.lastConfirmedEpoch === null) {
    catchupEpochs = Object.freeze([input.epoch]);
  }

  return Object.freeze({
    mode: input.mode,
    currentTick: input.currentTick,
    lastEvaluationTick: input.lastEvaluationTick,
    evaluateNow,
    intervalTicks,
    elapsedTicks,
    fromEpoch,
    toEpoch,
    catchupEpochs,
  });
}

export function assertNpcSimulationEvaluation(value: NpcSimulationEvaluation): void {
  const parsed = {
    mode: value.mode,
    currentTick: value.currentTick,
    lastEvaluationTick: value.lastEvaluationTick,
    evaluateNow: value.evaluateNow,
    intervalTicks: value.intervalTicks,
    elapsedTicks: value.elapsedTicks,
    fromEpoch: value.fromEpoch,
    toEpoch: value.toEpoch,
    catchupEpochs: value.catchupEpochs,
  };
  if (!npcSimulationModeSchema.safeParse(parsed.mode).success) throw new Error("NPC_CADENCE_MODE_INVALID");
  nonNegativeSafeInteger.parse(parsed.currentTick);
  if (parsed.lastEvaluationTick !== null) nonNegativeSafeInteger.parse(parsed.lastEvaluationTick);
  nonNegativeSafeInteger.parse(parsed.elapsedTicks);
  if (parsed.intervalTicks !== null) positiveSafeInteger.parse(parsed.intervalTicks);
  if (parsed.fromEpoch !== null) nonNegativeSafeInteger.parse(parsed.fromEpoch);
  if (parsed.toEpoch !== null) nonNegativeSafeInteger.parse(parsed.toEpoch);
  parsed.catchupEpochs.forEach(epoch => nonNegativeSafeInteger.parse(epoch));
}
