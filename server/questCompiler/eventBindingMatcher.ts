import {
  QuestObjectiveRequirementSchema,
  type QuestObjectiveRequirement,
} from "../../shared/aurionQuestContract";
import {
  encounterCompletionEvidenceSchema,
  verifyEncounterCompletionEvidenceIdentity,
  type EncounterCompletionEvidence,
} from "../../shared/aurionLegacyQuestBridgeContract";

export function matchesQuestObjectiveEvent(
  objective: QuestObjectiveRequirement,
  evidence: unknown,
): boolean {
  const parsedObjective = QuestObjectiveRequirementSchema.parse(objective);
  const binding = parsedObjective.eventBinding;
  if (!binding) return false;

  if (
    binding.source !== "encounter"
    || binding.event !== "completed"
    || binding.matchField !== "encounterKey"
    || !binding.matchValue
  ) {
    return false;
  }

  let parsedEvidence: EncounterCompletionEvidence;
  try {
    parsedEvidence = encounterCompletionEvidenceSchema.parse(evidence);
  } catch {
    return false;
  }

  return verifyEncounterCompletionEvidenceIdentity(parsedEvidence)
    && parsedEvidence.encounterKey === binding.matchValue
    && parsedEvidence.finalBossHp === 0;
}

export function assertQuestObjectiveEventMatch(
  objective: QuestObjectiveRequirement,
  evidence: unknown,
): asserts evidence is EncounterCompletionEvidence {
  if (!matchesQuestObjectiveEvent(objective, evidence)) {
    throw new Error("QUEST_OBJECTIVE_EVENT_UNPROVABLE");
  }
}
