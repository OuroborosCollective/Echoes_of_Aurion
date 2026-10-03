import { describe, expect, it } from "vitest";
import type { AurionCombatVictoryEvidence } from "../../shared/aurionQuestContract";
import { AdminQuestStudioService } from "./adminService";

function combatEvidence(receiptId: string, overrides: Partial<AurionCombatVictoryEvidence> = {}): AurionCombatVictoryEvidence {
  return {
    schema: "aurion.combat.victory.v1", eventId: `event-${receiptId}`, receiptId,
    logicalRevision: Number(receiptId.replace(/\D/g, "")) || 1, playerUserId: 77,
    opponentEntityId: `wolf-${receiptId}`, opponentSpecies: "wolf", outcome: "victory", confirmed: true,
    ...overrides,
  };
}

describe("pilot quest admin evidence projection", () => {
  it("reads six persisted receipt identities, rejects unknown/replayed evidence, and caps at six", async () => {
    const persisted = new Map<string, AurionCombatVictoryEvidence>();
    for (let index = 1; index <= 7; index += 1) persisted.set(`receipt-${index}`, combatEvidence(`receipt-${index}`));
    persisted.set("wrong-species", combatEvidence("wrong-species", { opponentSpecies: "boar" }));
    persisted.set("foreign-player", combatEvidence("foreign-player", { playerUserId: 88 }));
    const service = new AdminQuestStudioService({ now: () => 1_800_000_000_000 }, async id => persisted.get(id) ?? null);
    const offered = await service.offerQuest({ playerUserId: 77, templateId: "starter-wolves-6" });
    await service.acceptQuest(77, offered.instance.id);

    await expect(service.applyConfirmedCombatVictory(77, "unknown")).rejects.toThrow("QUEST_COMBAT_RECEIPT_UNKNOWN");
    expect(await service.applyConfirmedCombatVictory(77, "wrong-species")).toEqual([]);
    expect(await service.applyConfirmedCombatVictory(77, "foreign-player")).toEqual([]);
    for (let index = 1; index <= 5; index += 1) {
      const updates = await service.applyConfirmedCombatVictory(77, `receipt-${index}`);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.completedNode).toBe(false);
    }
    expect((await service.playerQuestDetails(77, offered.instance.id)).instance.objectiveProgress.wolf_victories).toBe(5);
    const repeated = await service.applyConfirmedCombatVictory(77, "receipt-5");
    expect(repeated).toMatchObject([{ replayed: true, completedNode: false }]);
    expect((await service.playerQuestDetails(77, offered.instance.id)).instance.objectiveProgress.wolf_victories).toBe(5);
    const sixth = await service.applyConfirmedCombatVictory(77, "receipt-6");
    expect(sixth).toMatchObject([{ completedNode: true, replayed: false }]);
    expect((await service.playerQuestDetails(77, offered.instance.id)).instance.objectiveProgress.wolf_victories).toBe(6);
    expect(await service.applyConfirmedCombatVictory(77, "receipt-7")).toEqual([]);
    expect((await service.playerQuestDetails(77, offered.instance.id)).instance.objectiveProgress.wolf_victories).toBe(6);
  });
});
