import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  adjustedCandidate,
  gameTheoryModelHash,
  gameTheoryObservationHash,
  gameTheoryPolicyOutputHash,
  payoffFor,
  type DeterministicGameTheoryModel,
  type GameTheoryCompileInput,
  type GameTheoryDecision,
} from "../shared/deterministicGameTheoryProtocol";
import {
  resolveNpcUtilityDecision,
  type NpcUtilityCandidate,
  type NpcUtilityPlannerContext,
} from "./npcUtilityPlanner";
import {
  AURION_NPC_COORDINATION_RESEARCH_LAW,
  resolveNpcUtilityWithCoordination,
  type CoordinatedNpcUtilityResult,
} from "./npcCoordinationLaw";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rawSha(value: unknown): string {
  const valueHash = canonicalSha256(value);
  return valueHash.startsWith("sha256:") ? valueHash.slice(7) : valueHash;
}

function validateInput(input: GameTheoryCompileInput): void {
  if (!ID_PATTERN.test(input.actorId)) throw new Error("AURION_GAME_THEORY_ACTOR_ID_INVALID");
  if (!ID_PATTERN.test(input.sourceReceiptId)) throw new Error("AURION_GAME_THEORY_SOURCE_RECEIPT_ID_INVALID");
  if (!/^[a-f0-9]{40}$/.test(input.sourceRevision)) throw new Error("AURION_GAME_THEORY_SOURCE_REVISION_INVALID");
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("AURION_GAME_THEORY_RESOLUTION_INDEX_INVALID");
  }
  if (!input.observationHash) throw new Error("AURION_GAME_THEORY_OBSERVATION_HASH_REQUIRED");
  if (!input.seed) throw new Error("AURION_GAME_THEORY_SEED_REQUIRED");
  if (!input.candidates.length) throw new Error("AURION_GAME_THEORY_CANDIDATES_EMPTY");

  for (const candidate of input.candidates) {
    if (candidate.sourceReceiptId !== input.sourceReceiptId) {
      throw new Error("AURION_GAME_THEORY_CANDIDATE_SOURCE_MISMATCH");
    }
  }

  if (!input.model.actors.some(actor => actor.actorId === input.actorId)) {
    throw new Error("AURION_GAME_THEORY_ACTOR_NOT_IN_MODEL");
  }
}

function normalizeCandidates(
  input: GameTheoryCompileInput,
  model: DeterministicGameTheoryModel,
): readonly NpcUtilityCandidate[] {
  const actions = new Map(model.actions.map(action => [action.actionId, action]));
  return Object.freeze(
    input.candidates
      .slice()
      .sort((a, b) => compare(a.id, b.id))
      .map(candidate => {
        const action = actions.get(candidate.action);
        if (!action) throw new Error("AURION_GAME_THEORY_CANDIDATE_ACTION_NOT_IN_MODEL");
        if (action.goal !== candidate.goal) {
          throw new Error("AURION_GAME_THEORY_CANDIDATE_GOAL_MISMATCH");
        }
        return adjustedCandidate(candidate, payoffFor(model, input.actorId, candidate.action));
      }),
  );
}

/**
 * Compile a bounded strategic model into the existing Aurion Utility Planner.
 *
 * The Game-Theory layer changes candidate evidence only. Final scoring,
 * deterministic tie-breaking, action intent creation and persistence remain on
 * their existing Aurion paths.
 */
export function compileNpcGameTheoryDecision(input: GameTheoryCompileInput): GameTheoryDecision {
  validateInput(input);

  const modelHash = gameTheoryModelHash(input.model);
  const observationHash = gameTheoryObservationHash(input);
  const seedHash = rawSha(input.seed);
  const candidates = normalizeCandidates(input, input.model);

  const plannerContext: NpcUtilityPlannerContext = {
    ...input.plannerContext,
    sourceReceiptId: input.sourceReceiptId,
    resolutionIndex: input.resolutionIndex,
    candidates,
  };
  const utilityDecision = resolveNpcUtilityDecision(plannerContext);

  const base: Omit<GameTheoryDecision, "policyOutputHash"> = {
    protocol: "aurion-game-theory-ir.v1",
    modelHash,
    observationHash,
    sourceReceiptId: input.sourceReceiptId,
    sourceRevision: input.sourceRevision,
    resolutionIndex: input.resolutionIndex,
    actorId: input.actorId,
    seedHash,
    candidateSetHash: utilityDecision.candidateSetHash,
    chosenCandidateId: utilityDecision.winnerId,
    chosenAction: utilityDecision.winnerAction,
    utilityDecisionHash: utilityDecision.decisionHash,
  };

  return Object.freeze({
    ...base,
    policyOutputHash: gameTheoryPolicyOutputHash(base),
  });
}

/**
 * Reuses the existing coordination-law implementation after the Game-Theory
 * compiler has normalized candidates. This function does not create a second
 * planner or persistence path.
 */
export function compileNpcGameTheoryWithCoordination(
  input: GameTheoryCompileInput,
): Readonly<{
  decision: GameTheoryDecision;
  coordinated: CoordinatedNpcUtilityResult;
}> {
  validateInput(input);
  const model = input.model;
  const modelHash = gameTheoryModelHash(model);
  const candidates = normalizeCandidates(input, model);
  const context: NpcUtilityPlannerContext = {
    ...input.plannerContext,
    sourceReceiptId: input.sourceReceiptId,
    resolutionIndex: input.resolutionIndex,
    candidates,
  };

  const coordinated = resolveNpcUtilityWithCoordination(
    {
      actorId: input.actorId,
      scopeKey: `game-theory:${model.modelId}`,
      context,
    },
    AURION_NPC_COORDINATION_RESEARCH_LAW,
  );

  const observationHash = gameTheoryObservationHash(input);
  const base: Omit<GameTheoryDecision, "policyOutputHash"> = {
    protocol: "aurion-game-theory-ir.v1",
    modelHash,
    observationHash,
    sourceReceiptId: input.sourceReceiptId,
    sourceRevision: input.sourceRevision,
    resolutionIndex: input.resolutionIndex,
    actorId: input.actorId,
    seedHash: rawSha(input.seed),
    candidateSetHash: coordinated.decision.candidateSetHash,
    chosenCandidateId: coordinated.decision.winnerId,
    chosenAction: coordinated.decision.winnerAction,
    utilityDecisionHash: coordinated.decision.decisionHash,
  };

  return Object.freeze({
    decision: Object.freeze({
      ...base,
      policyOutputHash: gameTheoryPolicyOutputHash(base),
    }),
    coordinated,
  });
}
