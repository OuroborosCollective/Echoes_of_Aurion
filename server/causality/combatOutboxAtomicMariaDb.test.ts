import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import type { AurionCombatVictoryEvidence } from "../../shared/aurionQuestContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { MariaDBCausalPersistenceAdapter } from "./persistence";
import { AurionTickRecorder } from "./tickRecorder";

const real = process.env.AURION_ATOMIC_OUTBOX_E2E === "1" && process.env.NODE_ENV === "test" ? describe : describe.skip;
real("atomic causal tick and combat outbox — real MariaDB", () => {
  let pool: Pool;
  const adapter = new MariaDBCausalPersistenceAdapter();
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_atomic_test") throw new Error("ISOLATED_ATOMIC_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    await pool.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId LIKE 'atomic-outbox:%'");
    await pool.query("DELETE FROM aurionCausalCheckpoints WHERE zoneId LIKE 'atomic-outbox:%'");
    await pool.query("DELETE FROM aurionCombatVictoryEvents WHERE playerUserId=973699");
  });
  afterAll(async () => { await pool?.end(); });

  it("rolls back the tick AND earlier victories when a later outbox INSERT fails, then retries exactly once", async () => {
    const zone = new AuthoritativeMovementZone("atomic-outbox:rollback" as any, new AurionTickRecorder());
    zone.tick();
    const receipt = zone.getLatestReceipt()!;
    const victory = (n: number): AurionCombatVictoryEvidence => ({
      schema: "aurion.combat.victory.v1", eventId: `atomic-event-${n}`, receiptId: `atomic-receipt-${n}`,
      logicalRevision: n, playerUserId: 973699, opponentEntityId: `mob_${n}`,
      opponentSpecies: "clockwork_stalker", outcome: "victory", confirmed: true,
    });
    await pool.query("CREATE TRIGGER atomic_outbox_failure BEFORE INSERT ON aurionCombatVictoryEvents FOR EACH ROW BEGIN IF NEW.eventId='atomic-event-2' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INJECTED_OUTBOX_INSERT_FAILURE'; END IF; END");
    try {
      await expect(adapter.saveReceipt(receipt, [], [victory(1), victory(2)])).rejects.toThrow();
      const [ticks] = await pool.query("SELECT id FROM aurionCausalTickReceipts WHERE zoneId=?", [receipt.zoneId]);
      const [victories] = await pool.query("SELECT eventId FROM aurionCombatVictoryEvents WHERE playerUserId=973699");
      expect(ticks).toEqual([]);
      expect(victories).toEqual([]);
    } finally { await pool.query("DROP TRIGGER atomic_outbox_failure"); }
    await adapter.saveReceipt(receipt, [], [victory(1), victory(2)]);
    await adapter.saveReceipt(receipt, [], [victory(1), victory(2)]);
    const [ticks] = await pool.query("SELECT id FROM aurionCausalTickReceipts WHERE zoneId=?", [receipt.zoneId]);
    const [victories] = await pool.query("SELECT eventId,questProjected FROM aurionCombatVictoryEvents WHERE playerUserId=973699");
    expect(ticks).toHaveLength(1);
    expect(victories).toHaveLength(2);
    expect(victories).toEqual(expect.arrayContaining([expect.objectContaining({ questProjected: 0 })]));
  });

  it("preserves receipt and initial checkpoint before 0069, while explicitly reporting the unavailable projection capability", async () => {
    await pool.query("RENAME TABLE aurionCombatVictoryEvents TO atomic_hidden_combat_events");
    try {
      const recorder = new AurionTickRecorder(100, adapter);
      const zone = new AuthoritativeMovementZone("atomic-outbox:pre0069" as any, recorder);
      zone.tick();
      await recorder.flushPersistence();
      expect(recorder.getPersistenceStatus()).toMatchObject({ pending: 0, failures: 1,
        lastError: "AURION_COMBAT_PROJECTION_SCHEMA_UNAVAILABLE: migration 0069 is required" });
      expect(await adapter.getLatestReceipt(zone.zoneId)).not.toBeNull();
      expect(await adapter.getCheckpoint(zone.zoneId, 0)).not.toBeNull();
      const combatZone = new AuthoritativeMovementZone("atomic-outbox:missing-combat-schema" as any, new AurionTickRecorder());
      combatZone.tick();
      await expect(adapter.saveReceipt(combatZone.getLatestReceipt()!, [], [{
        schema: "aurion.combat.victory.v1", eventId: "atomic-unavailable-event", receiptId: "atomic-unavailable-receipt",
        logicalRevision: 1, playerUserId: 973699, opponentEntityId: "mob_1",
        opponentSpecies: "clockwork_stalker", outcome: "victory", confirmed: true,
      }])).rejects.toThrow();
      expect(await adapter.getLatestReceipt(combatZone.zoneId)).toBeNull();
    } finally { await pool.query("RENAME TABLE atomic_hidden_combat_events TO aurionCombatVictoryEvents"); }
    await adapter.projectPendingCombatVictories();
  });
});
