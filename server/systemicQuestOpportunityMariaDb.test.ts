import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveAndRecordWorldDirector } from "./worldDirectorRuntime";
import { readWorldDirectorReceiptAt } from "./worldDirectorPersistence";
import { globalTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { compileSystemicQuestOpportunities } from "./systemicQuestOpportunityCompiler";

const describeReal =
  process.env.DATABASE_URL &&
  process.env.NODE_ENV === "test" &&
  process.env.AURION_SYSTEMIC_QUEST_E2E === "1"
    ? describe
    : describe.skip;

describeReal("AIM-595 systemic quest opportunities — real MariaDB source receipt", () => {
  let pool: Pool;
  const zoneId = "observatory_threshold:aim595";

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost", "mariadb"].includes(url.hostname) || url.pathname !== "/aurion_group_test") {
      throw new Error("ISOLATED_SYSTEMIC_QUEST_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("derives from the durably read-back WorldDirector decision without creating a second receipt authority", async () => {
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as any;
    const zone = new AuthoritativeMovementZone(zoneId as any);
    zone.join({
      userId: 2_146_999_984,
      socket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" },
    });
    zone.tick();
    await globalTickRecorder.flushPersistence();

    const causalReceipt = zone.getLatestReceipt();
    expect(causalReceipt).toBeDefined();

    const worldPlan = buildGlobalWorldPlan({
      worldSeed: "aurion-systemic-quest-runtime",
      epoch: causalReceipt!.tick,
      activePlayerCount: 1,
      highWaterPlayerCount: 1,
    });
    const result = await resolveAndRecordWorldDirector({
      causalReceipt: causalReceipt!,
      worldPlan,
      zoneId,
      seedDigest: `sha256:${"a".repeat(64)}`,
    });

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT causalReceiptHash,sourceRevision,decisionHash,receiptHash FROM aurionWorldDirectorReceipts WHERE zoneId=? AND logicalTick=?",
      [zoneId, causalReceipt!.tick],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.causalReceiptHash).toBe(causalReceipt!.receiptHash);
    expect(rows[0]?.sourceRevision).toBe(causalReceipt!.sourceRevision);
    expect(rows[0]?.decisionHash).toBe(result.decision.decisionHash);
    expect(rows[0]?.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const persisted = await readWorldDirectorReceiptAt("echoes-of-aurion-global", zoneId, causalReceipt!.tick);
    if (!persisted) throw new Error("SYSTEMIC_QUEST_SOURCE_RECEIPT_READBACK_REQUIRED");
    const replayedDecision = JSON.parse(persisted.decisionJson) as Parameters<typeof compileSystemicQuestOpportunities>[0]["decision"];
    expect(replayedDecision.decisionHash).toBe(persisted.decisionHash);
    const compilation = compileSystemicQuestOpportunities({
      worldId: persisted.worldId,
      sourceRevision: persisted.sourceRevision,
      decision: replayedDecision,
      confirmedActors: [{ actorId: "player:2146999984", regionId: zoneId }],
      maxCandidates: 8,
    });

    expect(compilation.opportunities.every(opportunity => opportunity.sourceReceiptIds.includes(persisted.causalReceiptHash))).toBe(true);
    expect(compilation.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  }, 30_000);
});
