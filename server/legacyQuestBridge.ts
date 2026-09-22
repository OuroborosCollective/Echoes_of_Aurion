import { aurionEncounters, aurionQuestline, type QuestKey } from "./gameplayProtocol";
import {
  legacyQuestBridgeSchema,
  legacyQuestKeys,
  type LegacyQuestBridge,
  type LegacyQuestKey,
} from "../shared/aurionLegacyQuestBridgeContract";

function encounterForQuest(key: QuestKey) {
  const matches = aurionEncounters.filter(encounter => encounter.questKey === key);
  if (matches.length !== 1) {
    throw new Error(`LEGACY_QUEST_ENCOUNTER_MAPPING_INVALID:${key}`);
  }
  return matches[0]!;
}

/**
 * Lossless bridge descriptor. gameplayProtocol remains the single source for the
 * established legacy QuestKey definitions; this module only packages the exact
 * existing values for canonical migration/validation.
 */
export function getLegacyQuestBridge(key: LegacyQuestKey): LegacyQuestBridge {
  const quest = aurionQuestline.find(candidate => candidate.key === key);
  if (!quest) throw new Error(`LEGACY_QUEST_NOT_FOUND:${key}`);
  const encounter = encounterForQuest(quest.key);
  return Object.freeze(legacyQuestBridgeSchema.parse({
    key: quest.key,
    giver: quest.giver,
    title: quest.title,
    objective: quest.objective,
    requiredLevel: quest.requiredLevel,
    requires: quest.requires,
    reward: quest.reward,
    encounterKey: encounter.key,
    eventBinding: {
      source: "encounter",
      event: "completed",
      matchField: "encounterKey",
      matchValue: encounter.key,
    },
  }));
}

export function listLegacyQuestBridges(): readonly LegacyQuestBridge[] {
  return Object.freeze(legacyQuestKeys.map(getLegacyQuestBridge));
}
