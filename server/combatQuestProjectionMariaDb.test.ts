import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { AdminQuestStudioService } from "./questCompiler/adminService";
import { drainCombatQuestProjections, persistAurionCombatVictoryEvidence } from "./aurionCombatVictoryPersistence";
import { readPilotCombatCompletionEvidence } from "./questCompiler/pilotCombatCompletionEvidence";
import { recordWorldPresenceLease, requestQuestActionFromDialogue } from "./db";
import { interpretAndRecordDialogue } from "./wasdAurionRuntime";
import { globalZoneRegistry } from "./zoneRuntime";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";

const real = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_ENCOUNTER_E2E === "1" ? describe : describe.skip;
real("durable combat quest projection — real MariaDB", () => {
  const userId = 973600;
  let pool: ReturnType<typeof createPool>;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    await pool.query("DELETE FROM aurionCombatVictoryEvents WHERE playerUserId IN (?, ?)", [userId, userId + 1]);
    await pool.query("DELETE r FROM aurionQuestReceipts r JOIN aurionQuestInstances i ON i.id=r.instanceId WHERE i.playerUserId IN (?, ?)", [userId, userId + 1]);
    await pool.query("DELETE FROM aurionQuestInstances WHERE playerUserId IN (?, ?)", [userId, userId + 1]);
  });
  afterAll(async () => { await pool?.end(); });
  it("retries a lost post-commit acknowledgment after service restart without crediting a later quest", async () => {
    const service = new AdminQuestStudioService();
    const zone = globalZoneRegistry.get("observatory_threshold");
    const joined = zone.join({ userId, socket: { readyState: 1, OPEN: 1, send() {}, close() {} } as any });
    // Fixture initial state at the giver; this test proves persistence/closure,
    // not an HTTP movement journey or actual wolf combat.
    const state = zone.getCanonicalZoneState();
    zone.restoreFromCanonicalState({ ...state, players: state.players.map(player => player.userId === userId ? { ...player, x: 0, z: -30_000 } : player) });
    await recordWorldPresenceLease({ userId, connectionId: joined.connectionId, zoneId: "observatory_threshold", position: { x: 0, z: -30_000 } });
    const dialogue = async (text: string, actionKind: "offer_quest" | "request_turn_in") => {
      const interpreted = await interpretAndRecordDialogue({ userId, npcId: "starter_village_north_gate_guard", text, trust: 0.6, threat: 0.1, idempotencyKey: `outbox-dialogue-${actionKind}` });
      return requestQuestActionFromDialogue({ userId, dialogueReceiptId: interpreted.receiptId, actionKind, questKey: "starter-wolves-6", idempotencyKey: `outbox-command-${actionKind}` });
    };
    await dialogue("Ich brauche einen Auftrag", "offer_quest");
    const first = await service.offerPlayerQuest(userId, "starter-wolves-6");
    await service.acceptPlayerQuest(userId, first.instance.id);
    await persistAurionCombatVictoryEvidence({
      schema: "aurion.combat.victory.v1", eventId: "outbox-recovery-victory", receiptId: "outbox-recovery-receipt",
      logicalRevision: 100, playerUserId: userId, opponentEntityId: "outbox-wolf", opponentSpecies: "wolf", outcome: "victory", confirmed: true,
    });
    await expect(drainCombatQuestProjections(async (user, receipt, targets) => {
      await service.applyConfirmedCombatVictory(user, receipt, targets);
      throw new Error("LOST_ACK_AFTER_COMMIT");
    })).rejects.toThrow("LOST_ACK_AFTER_COMMIT");
    expect((await service.playerQuestDetails(userId, first.instance.id)).instance.objectiveProgress.wolf_victories).toBe(1);
    expect((await service.offerPlayerQuest(userId, "starter-wolves-6")).instance.objectiveProgress.wolf_victories).toBe(1);
    // A second player's victory has no accepted quest at evidence persistence.
    await persistAurionCombatVictoryEvidence({
      schema: "aurion.combat.victory.v1", eventId: "outbox-before-accept", receiptId: "outbox-before-accept-receipt",
      logicalRevision: 101, playerUserId: userId + 1, opponentEntityId: "outbox-wolf-2", opponentSpecies: "wolf", outcome: "victory", confirmed: true,
    });
    const later = await service.offerQuest({ playerUserId: userId + 1, templateId: "starter-wolves-6" });
    await service.acceptQuest(userId + 1, later.instance.id);
    const restarted = new AdminQuestStudioService();
    await drainCombatQuestProjections((user, receipt, targets) => restarted.applyConfirmedCombatVictory(user, receipt, targets));
    await drainCombatQuestProjections(() => { throw new Error("ALREADY_ACKNOWLEDGED"); });
    expect((await restarted.playerQuestDetails(userId, first.instance.id)).instance.objectiveProgress.wolf_victories).toBe(1);
    expect((await restarted.playerQuestDetails(userId + 1, later.instance.id)).instance.objectiveProgress.wolf_victories ?? 0).toBe(0);
    const [rows] = await pool.query("SELECT questProjected FROM aurionCombatVictoryEvents WHERE receiptId='outbox-recovery-receipt'");
    expect(rows).toEqual([expect.objectContaining({ questProjected: 1 })]);
    await expect(readPilotCombatCompletionEvidence((await restarted.playerQuestDetails(userId, first.instance.id)).instance))
      .rejects.toThrow("QUEST_PILOT_OBJECTIVE_NOT_COMPLETED");
    for (let n = 2; n <= 6; n++) {
      await persistAurionCombatVictoryEvidence({
        schema: "aurion.combat.victory.v1", eventId: `outbox-victory-${n}`, receiptId: `outbox-receipt-${n}`,
        logicalRevision: 100 + n, playerUserId: userId, opponentEntityId: `outbox-wolf-${n}`, opponentSpecies: "wolf", outcome: "victory", confirmed: true,
      });
    }
    await drainCombatQuestProjections((user, receipt, targets) => restarted.applyConfirmedCombatVictory(user, receipt, targets));
    const finished = (await restarted.playerQuestDetails(userId, first.instance.id)).instance;
    const bundle = await readPilotCombatCompletionEvidence(finished);
    expect(bundle.id).toBe(`evt_combat_quest_complete_${finished.id}`);
    expect(bundle.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(await readPilotCombatCompletionEvidence(finished)).toEqual(bundle);
    await expect(restarted.completePlayerQuest(userId, finished.id)).rejects.toThrow("QUEST_DIALOGUE_AUTHORITY_REQUIRED");
    await dialogue("Ich bin fertig", "request_turn_in");
    const completed = await restarted.completePlayerQuest(userId, finished.id);
    expect(completed.updatedInstance.state).toBe("completed");
    expect((await new AdminQuestStudioService().completePlayerQuest(userId, finished.id)).replayed).toBe(true);
    const [rewardItems] = await pool.query("SELECT i.baseItemDefinitionId,i.quantityExact,i.originItemId,r.operation FROM aurionItemInstancesV2 i JOIN aurionInventoryReceipts r ON r.id=i.inventoryReceiptId WHERE i.ownerUserId=?", [userId]);
    expect(rewardItems).toEqual([expect.objectContaining({
      baseItemDefinitionId: "component-craft-star-iron-v2", quantityExact: "1", operation: "grant",
      originItemId: canonicalSha256({ domain: "aurion.quest.reward.origin.v1", questReceiptId: completed.receipt.id }).slice(7),
    })]);
    await pool.query("UPDATE aurionCombatVictoryEvents SET opponentSpecies='boar' WHERE receiptId='outbox-receipt-6'");
    await expect(readPilotCombatCompletionEvidence(finished)).rejects.toThrow("QUEST_PILOT_VICTORY_IDENTITY_MISMATCH");
  });
});
