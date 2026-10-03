import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { AdminQuestStudioService } from "./questCompiler/adminService";
import { drainCombatQuestProjections, persistAurionCombatVictoryEvidence } from "./aurionCombatVictoryPersistence";

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
    const first = await service.offerQuest({ playerUserId: userId, templateId: "starter-wolves-6" });
    await service.acceptQuest(userId, first.instance.id);
    await persistAurionCombatVictoryEvidence({
      schema: "aurion.combat.victory.v1", eventId: "outbox-recovery-victory", receiptId: "outbox-recovery-receipt",
      logicalRevision: 100, playerUserId: userId, opponentEntityId: "outbox-wolf", opponentSpecies: "wolf", outcome: "victory", confirmed: true,
    });
    await expect(drainCombatQuestProjections(async (user, receipt, targets) => {
      await service.applyConfirmedCombatVictory(user, receipt, targets);
      throw new Error("LOST_ACK_AFTER_COMMIT");
    })).rejects.toThrow("LOST_ACK_AFTER_COMMIT");
    expect((await service.playerQuestDetails(userId, first.instance.id)).instance.objectiveProgress.wolf_victories).toBe(1);
    expect((await service.offerQuest({ playerUserId: userId, templateId: "starter-wolves-6" })).instance.objectiveProgress.wolf_victories).toBe(1);
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
  });
});
