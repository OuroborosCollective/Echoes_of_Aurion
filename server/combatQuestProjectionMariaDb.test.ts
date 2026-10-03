import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool } from "mysql2/promise";
import { AdminQuestStudioService } from "./questCompiler/adminService";
import { drainCombatQuestProjections, persistAurionCombatVictoryEvidence } from "./aurionCombatVictoryPersistence";
import { readPilotCombatCompletionEvidence } from "./questCompiler/pilotCombatCompletionEvidence";
import { recordWorldPresenceLease, requestQuestActionFromDialogue, resolveAndRecordGlobalWorldEpoch } from "./db";
import { interpretAndRecordDialogue } from "./wasdAurionRuntime";
import { QuestPersistenceEngine } from "./questCompiler/persistence";
import { globalZoneRegistry } from "./zoneRuntime";

const real = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_ENCOUNTER_E2E === "1" ? describe : describe.skip;
real("durable combat quest projection — real MariaDB", () => {
  const userId = 973600;
  let pool: ReturnType<typeof createPool>;
  let fixtureDatabase: string;
  let baseUrl: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    baseUrl = process.env.DATABASE_URL!;
    const admin = createPool(baseUrl);
    fixtureDatabase = `${url.pathname.slice(1)}_handin_test`;
    if (!/^[a-zA-Z0-9_]+$/.test(fixtureDatabase)) throw new Error("INVALID_FIXTURE_DATABASE");
    await admin.query(`DROP DATABASE IF EXISTS \`${fixtureDatabase}\``);
    await admin.query(`CREATE DATABASE \`${fixtureDatabase}\``);
    const [tables] = await admin.query("SHOW TABLES");
    for (const row of tables as Record<string, string>[]) {
      const table = Object.values(row)[0];
      if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error("INVALID_FIXTURE_TABLE");
      await admin.query(`CREATE TABLE \`${fixtureDatabase}\`.\`${table}\` LIKE \`${url.pathname.slice(1)}\`.\`${table}\``);
    }
    await admin.end();
    url.pathname = `/${fixtureDatabase}`;
    process.env.DATABASE_URL = url.toString();
    pool = createPool(process.env.DATABASE_URL);
    await pool.query("DELETE FROM aurionCombatVictoryEvents WHERE playerUserId IN (?, ?)", [userId, userId + 1]);
    await pool.query("DELETE r FROM aurionQuestReceipts r JOIN aurionQuestInstances i ON i.id=r.instanceId WHERE i.playerUserId IN (?, ?)", [userId, userId + 1]);
    await pool.query("DELETE FROM aurionQuestInstances WHERE playerUserId IN (?, ?)", [userId, userId + 1]);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await pool?.end();
    if (baseUrl) {
      const admin = createPool(baseUrl);
      await admin.query(`DROP DATABASE IF EXISTS \`${fixtureDatabase}\``);
      await admin.end();
      process.env.DATABASE_URL = baseUrl;
    }
  });
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
      logicalRevision: 100, playerUserId: userId, opponentEntityId: "outbox-wolf", opponentSpecies: "clockwork_stalker", outcome: "victory", confirmed: true,
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
      logicalRevision: 101, playerUserId: userId + 1, opponentEntityId: "outbox-wolf-2", opponentSpecies: "clockwork_stalker", outcome: "victory", confirmed: true,
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
        logicalRevision: 100 + n, playerUserId: userId, opponentEntityId: `outbox-wolf-${n}`, opponentSpecies: "clockwork_stalker", outcome: "victory", confirmed: true,
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
    const pending = await Promise.allSettled([
      restarted.completePlayerQuest(userId, finished.id),
      new AdminQuestStudioService().completePlayerQuest(userId, finished.id),
    ]);
    for (const result of pending) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason.message).toBe("QUEST_CAUSAL_WORLD_PROOF_PENDING");
    }
    const handInCount = async () => {
      const [counts] = await pool.query("SELECT COUNT(*) AS count FROM aurionCausalTickReceipts WHERE JSON_CONTAINS(inputJson, JSON_OBJECT('instanceId', ?)) = 1", [finished.id]);
      return (counts as {count: number}[])[0].count;
    };
    expect(await handInCount()).toBe(1);
    const [epochRequests] = await pool.query("SELECT COUNT(*) AS count FROM aurionWorldEpochRequests");
    expect(epochRequests).toEqual([expect.objectContaining({ count: 0 })]);
    // Explicit isolated test/operator trigger, never performed by player hand-in.
    await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: userId, idempotencyKey: "handin-test-approved-proof" });
    // Advance only the isolated operator fixture. The matching hand-in proof is
    // older than a full page, and newer valid proofs cover a later zone tick.
    zone.tick();
    await (await import("./causality/tickRecorder")).globalTickRecorder.flushPersistence();
    for (let epoch = 2; epoch <= 65; epoch++) {
      await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: userId, idempotencyKey: `handin-test-approved-proof-${epoch}` });
    }
    const [storedHandIns] = await pool.query("SELECT receiptHash, inputJson FROM aurionCausalTickReceipts WHERE JSON_CONTAINS(inputJson, JSON_OBJECT('instanceId', ?)) = 1", [finished.id]);
    const storedHandIn = (storedHandIns as { receiptHash: string; inputJson: string }[])[0];
    const tamperedIntents = JSON.parse(storedHandIn.inputJson);
    tamperedIntents[0].clientSeq += 1;
    await pool.query("UPDATE aurionCausalTickReceipts SET inputJson=? WHERE receiptHash=?", [JSON.stringify(tamperedIntents), storedHandIn.receiptHash]);
    await expect(restarted.completePlayerQuest(userId, finished.id)).rejects.toThrow("QUEST_CAUSAL_INTENT_HASH_MISMATCH");
    await pool.query("UPDATE aurionCausalTickReceipts SET inputJson=? WHERE receiptHash=?", [storedHandIn.inputJson, storedHandIn.receiptHash]);
    const originalCommit = QuestPersistenceEngine.prototype.commitObjectiveTransition;
    let failed = false;
    const commitSpy = vi.spyOn(QuestPersistenceEngine.prototype, "commitObjectiveTransition").mockImplementation(async function(input) {
      if (input.causalClosure && !failed) { failed = true; throw new Error("INJECTED_COMPLETION_COMMIT_FAILURE"); }
      return originalCommit.call(this, input);
    });
    await expect(restarted.completePlayerQuest(userId, finished.id)).rejects.toThrow("INJECTED_COMPLETION_COMMIT_FAILURE");
    commitSpy.mockRestore();
    const completedCalls = await Promise.all([
      restarted.completePlayerQuest(userId, finished.id),
      new AdminQuestStudioService().completePlayerQuest(userId, finished.id),
    ]);
    const completed = completedCalls[0];
    expect(completedCalls[1].replayed).toBe(true);
    expect(await handInCount()).toBe(1);
    expect(completed.updatedInstance.state).toBe("completed");
    expect((await new AdminQuestStudioService().completePlayerQuest(userId, finished.id)).replayed).toBe(true);
    await pool.query("UPDATE aurionCombatVictoryEvents SET opponentSpecies='boar' WHERE receiptId='outbox-receipt-6'");
    await expect(readPilotCombatCompletionEvidence(finished)).rejects.toThrow("QUEST_PILOT_VICTORY_IDENTITY_MISMATCH");
  }, 60_000);
});
