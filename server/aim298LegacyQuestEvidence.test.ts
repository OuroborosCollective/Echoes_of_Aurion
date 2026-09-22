import { describe, expect, it } from "vitest";
import {
  computeEncounterCompletionEvidenceHash,
  encounterCompletionEvidenceSchema,
  verifyEncounterCompletionEvidenceIdentity,
} from "../shared/aurionLegacyQuestBridgeContract";
import { getLegacyQuestBridge, listLegacyQuestBridges } from "./legacyQuestBridge";
import { deriveEncounterCompletionEvidence } from "./encounterCompletionEvidence";
import { matchesQuestObjectiveEvent } from "./questCompiler/eventBindingMatcher";
import { encounterActionIdentity } from "./encounterIdentity";
import { aurionEncounters, damageForMcpAction } from "./gameplayProtocol";
import { gameplayActionReceipts, gameplaySessions } from "../drizzle/schema";

type SessionRow = typeof gameplaySessions.$inferSelect;
type ActionRow = typeof gameplayActionReceipts.$inferSelect;

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "game_test_asterion",
    userId: 7,
    encounterKey: "asterion",
    status: "completed",
    bossHp: 0,
    maxBossHp: 112,
    nextSequence: 4,
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    completedAt: new Date("2026-01-01T00:01:00.000Z"),
    updatedAt: new Date("2026-01-01T00:01:00.000Z"),
    ...overrides,
  };
}

function action(sequence: number, overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: encounterActionIdentity("game_test_asterion", sequence),
    sessionId: "game_test_asterion",
    userId: 7,
    sequence,
    command: "9",
    action: "skill_9",
    source: "human",
    damage: damageForMcpAction("skill_9"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("AIM-298 legacy quest bridge", () => {
  it("represents all six established QuestKeys without changing their source semantics", () => {
    const bridges = listLegacyQuestBridges();
    expect(bridges).toHaveLength(6);
    expect(bridges.map(value => value.key)).toEqual([
      "astral_call",
      "archive_of_echoes",
      "ember_key",
      "starfall_resonance",
      "clockwork_core",
      "sunwatch_vanguard",
    ]);
    expect(bridges.map(value => value.encounterKey)).toEqual([
      "asterion",
      "archive",
      "solarium",
      "starfall_crater",
      "rootgear_foundry",
      "sunwatch_bastion",
    ]);
    expect(getLegacyQuestBridge("astral_call")).toMatchObject({
      giver: "Lyra",
      requiredLevel: 1,
      requires: null,
      reward: { xp: 122, points: 20 },
      eventBinding: {
        source: "encounter",
        event: "completed",
        matchField: "encounterKey",
        matchValue: "asterion",
      },
    });
    expect(getLegacyQuestBridge("ember_key")).toMatchObject({
      reward: { xp: 360, points: 60, dungeonKey: "ember_key" },
      eventBinding: { matchValue: "solarium" },
    });
  });

  it("keeps the bridge aligned with the canonical encounter catalog", () => {
    expect(listLegacyQuestBridges().map(value => value.encounterKey)).toEqual(
      aurionEncounters.filter(value => value.questKey !== null).map(value => value.key),
    );
  });

  it("derives deterministic completion evidence from the real durable action chain", () => {
    const evidence = deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(3), action(1), action(2)],
    });

    expect(evidence).toMatchObject({
      schema: "aurion.encounter.completion.v1",
      eventId: "evt_encounter_complete_game_test_asterion",
      sessionId: "game_test_asterion",
      userId: 7,
      encounterKey: "asterion",
      completionSequence: 3,
      finalBossHp: 0,
      maxBossHp: 112,
      actionCount: 3,
      finalActionReceiptId: action(3).id,
    });
    expect(verifyEncounterCompletionEvidenceIdentity(evidence)).toBe(true);
    expect(computeEncounterCompletionEvidenceHash({
      schema: evidence.schema,
      eventId: evidence.eventId,
      sessionId: evidence.sessionId,
      userId: evidence.userId,
      encounterKey: evidence.encounterKey,
      completionSequence: evidence.completionSequence,
      finalActionReceiptId: evidence.finalActionReceiptId,
      finalBossHp: evidence.finalBossHp,
      maxBossHp: evidence.maxBossHp,
      actionCount: evidence.actionCount,
      actionChainHash: evidence.actionChainHash,
    })).toBe(evidence.evidenceHash);
  });

  it("rejects missing or duplicated sequence evidence", () => {
    expect(() => deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(3)],
    })).toThrow("NON_CONTIGUOUS_ACTION_CHAIN");

    expect(() => deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(2), action(2)],
    })).toThrow("NON_CONTIGUOUS_ACTION_CHAIN");
  });

  it("matches only a bound encounter completion with intact evidence identity", () => {
    const evidence = deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(2), action(3)],
    });
    const objective = {
      key: "boss_defeated",
      targetValue: 1,
      eventBinding: {
        source: "encounter" as const,
        event: "completed" as const,
        matchField: "encounterKey" as const,
        matchValue: "asterion" as const,
      },
    };
    expect(matchesQuestObjectiveEvent(objective, evidence)).toBe(true);
    expect(matchesQuestObjectiveEvent(
      { ...objective, eventBinding: { ...objective.eventBinding, matchValue: "archive" as const } },
      evidence,
    )).toBe(false);
    expect(matchesQuestObjectiveEvent(
      objective,
      { ...evidence, evidenceHash: "0".repeat(64) },
    )).toBe(false);
  });

  it("rejects falsified action semantics and damage", () => {
    expect(() => deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(2), action(3, { damage: 42 })],
    })).toThrow("DAMAGE_MISMATCH");

    expect(() => deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(2), action(3, { action: "attack" })],
    })).toThrow("ACTION_IDENTITY_MISMATCH");
  });

  it("rejects fabricated session completion or an incomplete simulated kill", () => {
    expect(() => deriveEncounterCompletionEvidence({
      session: session({ status: "active" }),
      receipts: [action(1), action(2), action(3)],
    })).toThrow("SESSION_NOT_COMPLETED");

    expect(() => deriveEncounterCompletionEvidence({
      session: session({ maxBossHp: 999 }),
      receipts: [action(1), action(2), action(3)],
    })).toThrow("SIMULATED_HP_NOT_ZERO");
  });

  it("detects tampering after evidence creation", () => {
    const evidence = deriveEncounterCompletionEvidence({
      session: session(),
      receipts: [action(1), action(2), action(3)],
    });
    const tampered = encounterCompletionEvidenceSchema.parse({
      ...evidence,
      completionSequence: evidence.completionSequence + 1,
    });
    expect(verifyEncounterCompletionEvidenceIdentity(tampered)).toBe(false);
  });
});
