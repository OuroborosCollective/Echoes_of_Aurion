import { readFileSync } from "node:fs";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type WebSocket from "ws";
import {
  AURION_CAUSAL_STAGE_NAMES,
  AURION_CAUSAL_TICK_SCHEMA_V1,
  AURION_CAUSAL_TICK_SCHEMA_V2,
  computeReceiptHash,
} from "../../shared/aurionCausalTickContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { MariaDBCausalPersistenceAdapter } from "./persistence";

const suite =
  process.env.AURION_CLASSLESS_E2E === "1" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

const ZONE_PREFIX = "observatory_threshold:b3-0049";
const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;

suite("Blocker 3 migration 0049 causal receipt-v2 persistence", () => {
  let pool: Pool;
  let isolated = false;

  async function clean() {
    if (!isolated) throw new Error("ISOLATED_0049_TEST_DATABASE_REQUIRED");
    await pool.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId LIKE ?", [`${ZONE_PREFIX}%`]);
  }

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query("SELECT DATABASE() AS name");
    const name = (rows as Array<{ name: string }>)[0]?.name ?? "";
    if (!name.endsWith("_classless_test")) throw new Error("ISOLATED_0049_TEST_DATABASE_REQUIRED");
    if (!/^[a-f0-9]{40}$/.test(process.env.AURION_RELEASE_SHA ?? "")) {
      throw new Error("EXACT_TEST_REVISION_REQUIRED");
    }
    isolated = true;
  });

  beforeEach(clean);
  afterAll(async () => {
    if (pool) {
      if (isolated) await clean();
      await pool.end();
    }
  });

  it("proves 0048 base table plus 0049 columns and full journal wave are physically active", async () => {
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'aurionCausalTickReceipts'
       ORDER BY ORDINAL_POSITION`,
    );
    const names = (columns as Array<{ name: string }>).map(row => row.name);
    expect(names).toEqual(expect.arrayContaining([
      "id",
      "worldId",
      "zoneId",
      "transitionHash",
      "rngRootHash",
      "receiptHash",
      "receiptSchema",
      "stageReceiptsJson",
    ]));

    const [journal] = await pool.query("SELECT COUNT(*) AS rowCount FROM __drizzle_migrations");
    const declaredJournal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(Number((journal as Array<{ rowCount: number | string }>)[0]?.rowCount))
      .toBe(declaredJournal.entries.length);
    expect(declaredJournal.entries.at(-1)).toMatchObject({
      idx: 54,
      tag: "0054_aurion_semantic_memory_graph_v2",
  "0055_aurion_glb_external_provenance",
    });
  });

  it("round-trips v2 stage evidence through MariaDB and verifies the persisted receipt hash", async () => {
    const zoneId = `${ZONE_PREFIX}:v2`;
    const zone = new AuthoritativeMovementZone(zoneId as any);
    const { connectionId } = zone.join({
      userId: 9_304_901,
      socket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
    });
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    const intents = [...zone.getPendingIntents()];
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt || receipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) throw new Error("LIVE_V2_RECEIPT_EXPECTED");

    const adapter = new MariaDBCausalPersistenceAdapter();
    await adapter.saveReceipt(receipt, intents);
    const restored = await adapter.getLatestReceipt(zoneId);

    expect(restored?.schema).toBe(AURION_CAUSAL_TICK_SCHEMA_V2);
    if (!restored || restored.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) return;
    expect(restored.stages.map(stage => stage.stageName)).toEqual([...AURION_CAUSAL_STAGE_NAMES]);
    expect(restored.stages).toEqual(receipt.stages);
    expect(computeReceiptHash(restored)).toBe(receipt.receiptHash);

    const [raw] = await pool.query(
      "SELECT receiptSchema,stageReceiptsJson FROM aurionCausalTickReceipts WHERE zoneId=? AND tick=?",
      [zoneId, receipt.tick],
    );
    const row = (raw as Array<{ receiptSchema: string; stageReceiptsJson: string | null }>)[0];
    expect(row?.receiptSchema).toBe(AURION_CAUSAL_TICK_SCHEMA_V2);
    expect(JSON.parse(row?.stageReceiptsJson ?? "[]")).toHaveLength(AURION_CAUSAL_STAGE_NAMES.length);
  });

  it("keeps a persisted v1 receipt valid after 0049", async () => {
    const zoneId = `${ZONE_PREFIX}:v1`;
    const zone = new AuthoritativeMovementZone(zoneId as any);
    zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V1;
    zone.join({
      userId: 9_304_902,
      socket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" },
    });
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt || receipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V1) throw new Error("V1_RECEIPT_EXPECTED");

    const adapter = new MariaDBCausalPersistenceAdapter();
    await adapter.saveReceipt(receipt, []);
    const restored = await adapter.getLatestReceipt(zoneId);
    expect(restored).toEqual(receipt);

    const [raw] = await pool.query(
      "SELECT receiptSchema,stageReceiptsJson FROM aurionCausalTickReceipts WHERE zoneId=? AND tick=?",
      [zoneId, receipt.tick],
    );
    const row = (raw as Array<{ receiptSchema: string; stageReceiptsJson: string | null }>)[0];
    expect(row?.receiptSchema).toBe(AURION_CAUSAL_TICK_SCHEMA_V1);
    expect(row?.stageReceiptsJson).toBeNull();
  });
});
