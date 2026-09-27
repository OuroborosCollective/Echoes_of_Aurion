/**
 * Aurion deterministic Game-Theory IR.
 *
 * Model/compile boundary only. It never persists or mutates gameplay state and
 * never loads Wolfram GameTheoryData at runtime.
 */
import { canonicalSha256 } from "./aurionCanonicalHash";
import type {
  NpcUtilityActionId,
  NpcUtilityCandidate,
  NpcUtilityGoalId,
  NpcUtilityPlannerContext,
} from "./npcUtilityPlannerProtocol";

export const AURION_GAME_THEORY_PROTOCOL_VERSION = "aurion-game-theory-ir.v1" as const;
export const AURION_GAME_THEORY_MAX_ACTORS = 32;
export const AURION_GAME_THEORY_MAX_ACTIONS = 32;
export const AURION_GAME_THEORY_MAX_PAYOFFS = 512;
export const AURION_GAME_THEORY_PAYOFF_MIN = -10_000;
export const AURION_GAME_THEORY_PAYOFF_MAX = 10_000;

export type GameTheoryType =
  | "coordination"
  | "anti_coordination"
  | "general_sum"
  | "resource_competition";

export type GameTheoryActor = Readonly<{
  actorId: string;
  role: "npc" | "faction";
}>;

export type GameTheoryAction = Readonly<{
  actionId: NpcUtilityActionId;
  goal: NpcUtilityGoalId;
}>;

export type GameTheoryPayoff = Readonly<{
  actorId: string;
  actionId: NpcUtilityActionId;
  payoffBps: number;
}>;

export type DeterministicGameTheoryModel = Readonly<{
  modelId: string;
  modelVersion: number;
  gameType: GameTheoryType;
  rulesetVersion: string;
  actors: readonly GameTheoryActor[];
  actions: readonly GameTheoryAction[];
  payoffs: readonly GameTheoryPayoff[];
}>;

export type GameTheoryCompileInput = Readonly<{
  actorId: string;
  sourceReceiptId: string;
  sourceRevision: string;
  resolutionIndex: number;
  observationHash: string;
  seed: string;
  model: DeterministicGameTheoryModel;
  plannerContext: Omit<NpcUtilityPlannerContext, "candidates" | "sourceReceiptId" | "resolutionIndex">;
  candidates: readonly NpcUtilityCandidate[];
}>;

export type GameTheoryDecision = Readonly<{
  protocol: typeof AURION_GAME_THEORY_PROTOCOL_VERSION;
  modelHash: string;
  observationHash: string;
  sourceReceiptId: string;
  sourceRevision: string;
  resolutionIndex: number;
  actorId: string;
  seedHash: string;
  candidateSetHash: string;
  chosenCandidateId: string | null;
  chosenAction: NpcUtilityActionId | null;
  utilityDecisionHash: string;
  policyOutputHash: string;
}>;

function rawSha(value: unknown): string {
  const valueHash = canonicalSha256(value);
  return valueHash.startsWith("sha256:") ? valueHash.slice(7) : valueHash;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertId(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`AURION_GAME_THEORY_${field}_INVALID`);
  }
}

function assertRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error("AURION_GAME_THEORY_SOURCE_REVISION_INVALID");
  }
}

function assertBps(value: number, field: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < AURION_GAME_THEORY_PAYOFF_MIN ||
    value > AURION_GAME_THEORY_PAYOFF_MAX
  ) {
    throw new Error(`AURION_GAME_THEORY_${field}_INVALID`);
  }
}

function validateModel(model: DeterministicGameTheoryModel): void {
  assertId(model.modelId, "MODEL_ID");
  if (!Number.isSafeInteger(model.modelVersion) || model.modelVersion < 1) {
    throw new Error("AURION_GAME_THEORY_MODEL_VERSION_INVALID");
  }
  assertId(model.rulesetVersion, "RULESET_VERSION");

  if (
    model.actors.length === 0 ||
    model.actors.length > AURION_GAME_THEORY_MAX_ACTORS
  ) {
    throw new Error("AURION_GAME_THEORY_ACTORS_OVERFLOW");
  }
  if (
    model.actions.length === 0 ||
    model.actions.length > AURION_GAME_THEORY_MAX_ACTIONS
  ) {
    throw new Error("AURION_GAME_THEORY_ACTIONS_OVERFLOW");
  }
  if (model.payoffs.length > AURION_GAME_THEORY_MAX_PAYOFFS) {
    throw new Error("AURION_GAME_THEORY_PAYOFFS_OVERFLOW");
  }

  const actorIds = new Set<string>();
  for (const actor of model.actors) {
    assertId(actor.actorId, "ACTOR_ID");
    if (actorIds.has(actor.actorId)) {
      throw new Error("AURION_GAME_THEORY_ACTOR_DUPLICATE");
    }
    actorIds.add(actor.actorId);
  }

  const actionIds = new Set<NpcUtilityActionId>();
  for (const action of model.actions) {
    if (actionIds.has(action.actionId)) {
      throw new Error("AURION_GAME_THEORY_ACTION_DUPLICATE");
    }
    actionIds.add(action.actionId);
  }

  const payoffKeys = new Set<string>();
  for (const payoff of model.payoffs) {
    assertId(payoff.actorId, "PAYOFF_ACTOR_ID");
    if (!actorIds.has(payoff.actorId)) {
      throw new Error("AURION_GAME_THEORY_PAYOFF_ACTOR_UNKNOWN");
    }
    if (!actionIds.has(payoff.actionId)) {
      throw new Error("AURION_GAME_THEORY_PAYOFF_ACTION_UNKNOWN");
    }
    assertBps(payoff.payoffBps, "PAYOFF");

    const key = payoff.actorId + "\u001f" + payoff.actionId;
    if (payoffKeys.has(key)) {
      throw new Error("AURION_GAME_THEORY_PAYOFF_DUPLICATE");
    }
    payoffKeys.add(key);
  }
}

export function gameTheoryModelHash(model: DeterministicGameTheoryModel): string {
  validateModel(model);
  return canonicalSha256({
    domain: AURION_GAME_THEORY_PROTOCOL_VERSION,
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    gameType: model.gameType,
    rulesetVersion: model.rulesetVersion,
    actors: [...model.actors].sort((a, b) => compare(a.actorId, b.actorId)),
    actions: [...model.actions].sort((a, b) => compare(a.actionId, b.actionId)),
    payoffs: [...model.payoffs].sort(
      (a, b) =>
        compare(a.actorId, b.actorId) ||
        compare(a.actionId, b.actionId) ||
        a.payoffBps - b.payoffBps,
    ),
  });
}

export function payoffFor(
  model: DeterministicGameTheoryModel,
  actorId: string,
  actionId: NpcUtilityActionId,
): number {
  return model.payoffs.find(
    value => value.actorId === actorId && value.actionId === actionId,
  )?.payoffBps ?? 0;
}

export function adjustedCandidate(
  candidate: NpcUtilityCandidate,
  payoffBps: number,
): NpcUtilityCandidate {
  assertBps(payoffBps, "PAYOFF");
  const positive = Math.max(0, payoffBps);
  const negative = Math.max(0, -payoffBps);
  return Object.freeze({
    ...candidate,
    benefitBps: Math.min(10_000, candidate.benefitBps + Math.floor(positive / 2)),
    riskBps: Math.min(10_000, candidate.riskBps + Math.floor(negative / 2)),
  });
}

export function gameTheoryObservationHash(
  input: Pick<
    GameTheoryCompileInput,
    "sourceReceiptId" | "sourceRevision" | "resolutionIndex" | "observationHash" | "seed"
  >,
): string {
  assertId(input.sourceReceiptId, "SOURCE_RECEIPT_ID");
  assertRevision(input.sourceRevision);
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("AURION_GAME_THEORY_RESOLUTION_INDEX_INVALID");
  }
  if (!input.observationHash) {
    throw new Error("AURION_GAME_THEORY_OBSERVATION_HASH_REQUIRED");
  }
  return canonicalSha256({
    domain: "aurion-game-theory-observation.v1",
    sourceReceiptId: input.sourceReceiptId,
    sourceRevision: input.sourceRevision,
    resolutionIndex: input.resolutionIndex,
    observationHash: input.observationHash,
    seedHash: rawSha(input.seed),
  });
}

export function gameTheoryPolicyOutputHash(
  decision: Omit<GameTheoryDecision, "policyOutputHash">,
): string {
  return canonicalSha256({
    domain: "aurion-game-theory-policy-output.v1",
    protocol: decision.protocol,
    modelHash: decision.modelHash,
    observationHash: decision.observationHash,
    sourceReceiptId: decision.sourceReceiptId,
    sourceRevision: decision.sourceRevision,
    resolutionIndex: decision.resolutionIndex,
    actorId: decision.actorId,
    seedHash: decision.seedHash,
    candidateSetHash: decision.candidateSetHash,
    chosenCandidateId: decision.chosenCandidateId,
    chosenAction: decision.chosenAction,
    utilityDecisionHash: decision.utilityDecisionHash,
  });
}
