import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveAndRecordWorldDirector } from "./worldDirectorRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";

const describeReal =
  process.env.DATABASE_URL &&
  process.env.NODE_ENV === "test" &&
  process.env.AURION_WORLD_DIRECTOR_E2E === "1"
    ? describe
    : describe.skip;

describeReal("AIM-484 World Director — real MariaDB", () => {
  let pool: Pool;
  const zoneId = "observatory_threshold:aim484";

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_group_test") {
      throw new Error("ISOLATED_WORLD_DIRECTOR_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("uses a real causal tick receipt and verifies durable director readback + idempotent replay", async () => {
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
      worldSeed: "aurion-director-runtime",
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
    expect(result.source).toBe("created");

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT sourceRevision,causalReceiptHash,sourceRootHash,decisionHash,receiptHash FROM aurionWorldDirectorReceipts WHERE zoneId=? AND logicalTick=?",
      [zoneId, causalReceipt!.tick],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceRevision).toBe(causalReceipt!.sourceRevision);
    expect(rows[0]?.causalReceiptHash).toBe(causalReceipt!.receiptHash);
    expect(rows[0]?.sourceRootHash).toBe(causalReceipt!.postStateHash);
    expect(rows[0]?.decisionHash).toBe(result.decision.decisionHash);
    expect(rows[0]?.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const replay = await resolveAndRecordWorldDirector({
      causalReceipt: causalReceipt!,
      worldPlan,
      zoneId,
      seedDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(replay.source).toBe("persisted");
    expect(replay.decision).toEqual(result.decision);
  }, 30_000);
});
