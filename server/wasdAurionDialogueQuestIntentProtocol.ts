import type { QuestKey, QuestState } from "./gameplayProtocol";
import type { DialogueInterpretation } from "./wasdAurionProtocol";

export type DialogueQuestActionKind = "offer_quest" | "request_turn_in";

export type DialogueQuestReadModel = {
  readonly key: QuestKey;
  readonly giver: "Lyra" | "Orun";
  readonly state: QuestState;
  readonly readyToTurnIn: boolean;
};

export type DialogueQuestIntentResolution =
  | {
      readonly state: "offer_available_quest";
      readonly actionKind: "offer_quest";
      readonly questKey: QuestKey;
      readonly npcId: "lyra" | "orun";
      readonly reason: "accepted_quest_request";
    }
  | {
      readonly state: "turn_in_available";
      readonly actionKind: "request_turn_in";
      readonly questKey: QuestKey;
      readonly npcId: "lyra" | "orun";
      readonly reason: "accepted_turn_in_request";
    }
  | {
      readonly state: "no_action";
      readonly reason:
        | "interpretation_not_accepted"
        | "intent_has_no_command"
        | "no_matching_quest";
    };

function normalizeNpcId(npcId: string): "lyra" | "orun" | null {
  const normalized = npcId.trim().toLocaleLowerCase("de-DE");
  return normalized === "lyra" || normalized === "orun" ? normalized : null;
}

function matchesNpc(
  npcId: "lyra" | "orun",
  giver: DialogueQuestReadModel["giver"]
): boolean {
  return npcId === giver.toLocaleLowerCase("de-DE");
}

/**
 * Converts a persisted, already-moderated dialogue meaning into a bounded Aurion UI/action offer.
 * It never accepts or completes a quest; those remain explicit protected database commands.
 */
export function resolveDialogueQuestIntent(input: {
  readonly npcId: string;
  readonly interpretation: DialogueInterpretation;
  readonly quests: readonly DialogueQuestReadModel[];
}): DialogueQuestIntentResolution {
  const npcId = normalizeNpcId(input.npcId);
  if (!npcId || input.interpretation.state !== "accepted") {
    return { state: "no_action", reason: "interpretation_not_accepted" };
  }

  if (input.interpretation.semanticIntent === "ask_quest") {
    const quest = input.quests.find(
      candidate =>
        candidate.state === "available" && matchesNpc(npcId, candidate.giver)
    );
    return quest
      ? {
          state: "offer_available_quest",
          actionKind: "offer_quest",
          questKey: quest.key,
          npcId,
          reason: "accepted_quest_request",
        }
      : { state: "no_action", reason: "no_matching_quest" };
  }

  if (input.interpretation.semanticIntent === "turn_in_quest") {
    const quest = input.quests.find(
      candidate => candidate.readyToTurnIn && matchesNpc(npcId, candidate.giver)
    );
    return quest
      ? {
          state: "turn_in_available",
          actionKind: "request_turn_in",
          questKey: quest.key,
          npcId,
          reason: "accepted_turn_in_request",
        }
      : { state: "no_action", reason: "no_matching_quest" };
  }

  return { state: "no_action", reason: "intent_has_no_command" };
}
