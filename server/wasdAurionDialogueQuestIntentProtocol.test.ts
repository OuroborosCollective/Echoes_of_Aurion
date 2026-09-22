import { describe, expect, it } from "vitest";
import {
  resolveDialogueQuestIntent,
  type DialogueQuestReadModel,
} from "./wasdAurionDialogueQuestIntentProtocol";

const quests: readonly DialogueQuestReadModel[] = [
  {
    key: "astral_call",
    giver: "Lyra",
    state: "available",
    readyToTurnIn: false,
  },
  {
    key: "archive_of_echoes",
    giver: "Orun",
    state: "locked",
    readyToTurnIn: false,
  },
  { key: "ember_key", giver: "Lyra", state: "locked", readyToTurnIn: false },
];

const acceptedQuestRequest = {
  state: "accepted" as const,
  semanticIntent: "ask_quest" as const,
  confidence: 0.9,
  dialectId: "observatory",
  reason: "recognized_intent",
};

describe("Wasd → Aurion dialogue quest intent protocol", () => {
  it("offers only the already available quest of the addressed Aurion quest giver", () => {
    const input = {
      npcId: "lyra",
      interpretation: acceptedQuestRequest,
      quests,
    } as const;
    const first = resolveDialogueQuestIntent(input);
    const second = resolveDialogueQuestIntent(input);

    expect(first).toEqual({
      state: "offer_available_quest",
      actionKind: "offer_quest",
      questKey: "astral_call",
      npcId: "lyra",
      reason: "accepted_quest_request",
    });
    expect(second).toEqual(first);
  });

  it("returns a turn-in request only when the exact NPC has a quest ready for hand-in", () => {
    const readyQuests: readonly DialogueQuestReadModel[] = [
      {
        key: "astral_call",
        giver: "Lyra",
        state: "active",
        readyToTurnIn: true,
      },
    ];
    const acceptedTurnIn = {
      ...acceptedQuestRequest,
      semanticIntent: "turn_in_quest" as const,
    };

    expect(
      resolveDialogueQuestIntent({
        npcId: "Lyra",
        interpretation: acceptedTurnIn,
        quests: readyQuests,
      })
    ).toEqual({
      state: "turn_in_available",
      actionKind: "request_turn_in",
      questKey: "astral_call",
      npcId: "lyra",
      reason: "accepted_turn_in_request",
    });
    expect(
      resolveDialogueQuestIntent({
        npcId: "orun",
        interpretation: acceptedTurnIn,
        quests: readyQuests,
      })
    ).toEqual({
      state: "no_action",
      reason: "no_matching_quest",
    });
  });

  it("never offers a command for quarantined, rejected, unrelated or unavailable dialogue", () => {
    expect(
      resolveDialogueQuestIntent({
        npcId: "lyra",
        interpretation: {
          ...acceptedQuestRequest,
          state: "quarantined",
          semanticIntent: "unknown",
          confidence: 0,
          reason: "sensitive_or_disallowed_content",
        },
        quests,
      })
    ).toEqual({ state: "no_action", reason: "interpretation_not_accepted" });

    expect(
      resolveDialogueQuestIntent({
        npcId: "lyra",
        interpretation: { ...acceptedQuestRequest, semanticIntent: "trade" },
        quests,
      })
    ).toEqual({ state: "no_action", reason: "intent_has_no_command" });

    expect(
      resolveDialogueQuestIntent({
        npcId: "orun",
        interpretation: acceptedQuestRequest,
        quests,
      })
    ).toEqual({ state: "no_action", reason: "no_matching_quest" });

    expect(
      resolveDialogueQuestIntent({
        npcId: "not-a-npc",
        interpretation: acceptedQuestRequest,
        quests,
      })
    ).toEqual({ state: "no_action", reason: "interpretation_not_accepted" });
  });
});
