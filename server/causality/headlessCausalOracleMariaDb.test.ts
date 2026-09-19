import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type WebSocket from "ws";
import {
  aurionCausalCheckpoints,
  aurionCausalTickReceipts,
  aurionReplayRuns,
} from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { AurionHeadlessCausalOracle } from "./headlessCausalOracle";
import { globalTickRecorder } from "./tickRecorder";

const enabled = process.env.NODE_ENV === "test" &&
  process.env.AURION_ORACLE_E2E === "1" &&
  Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const ZONE = "observatory_threshold:oracle-step25";
const RELEASE = process.env.AURION_RELEASE_SHA ?? "";
const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;

async function counts() {
  const db = await getDb();
  if (!db) throw new Error("ORACLE_TEST_DATABASE_REQUIRED");
  const [receipts] = await db.select({ value: sql<number>`count(*)` }).from(aurionCausalTickReceipts)
    .where(eq(aurionCausalTickReceipts.zoneId, ZONE));
  const [checkpoints] = await db.select({ value: sql<number>`count(*)` }).from(aurionCausalCheckpoints)
    .where(eq(aurionCausalCheckpoints.zoneId, ZONE));
  const [replays] = await db.select({ value: sql<number>`count(*)` }).from(aurionReplayRuns)
    .where(eq(aurionReplayRuns.zoneId, ZONE));
  return {
    receipts: Number(receipts?.value ?? 0),
    checkpoints: Number(checkpoints?.value ?? 0),
    replays: Number(replays?.value ?? 0),
  };
}

suite("Wave 2 Step 25 Headless Causal Oracle V2 MariaDB", () => {
  beforeAll(async () => {
    expect(RELEASE).toMatch(/^[a-f0-9]{40}$/);
    expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
    const db = await getDb();
    if (!db) throw new Error("ORACLE_TEST_DATABASE_REQUIRED");

    await db.delete(aurionCausalCheckpoints).where(eq(aurionCausalCheckpoints.zoneId, ZONE));
    await db.delete(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.zoneId, ZONE));
    await db.delete(aurionReplayRuns).where(eq(aurionReplayRuns.zoneId, ZONE));

    const zone = new AuthoritativeMovementZone(ZONE as any);
    zone.sourceRevisionOverride = RELEASE;
    const { connectionId } = zone.join({
      userId: 25_101,
      socket,
      combatProfile: { combatLevel: 8, maxHealth: 650, weaponBonus: 17, weaponTrack: "blade" },
    });

    for (let tick = 1; tick <= 4; tick += 1) {
      zone.submitMovement(connectionId, {
        type: "move",
        clientSeq: tick,
        input: tick % 2 === 0 ? { x: 0, z: -1 } : { x: 1, z: 0 },
      });
      zone.tick();
    }
    await globalTickRecorder.flushPersistence();

    const persisted = await counts();
    expect(persisted.receipts).toBe(4);
    expect(persisted.checkpoints).toBe(1);
    expect(persisted.replays).toBe(0);
  }, 30_000);

  it("replays a later range from the sparse persisted checkpoint without writing evidence", async () => {
    const before = await counts();
    const oracle = new AurionHeadlessCausalOracle();
    const result = await oracle.replayRange({ zoneId: ZONE, fromTick: 3, toTick: 4 });
    const after = await counts();

    expect(result.status).toBe("MATCH");
    expect(result.mutationAuthority).toBe("none");
    expect(result.checkpoint?.tick).toBe(0);
    expect(result.warmupTicks).toEqual([1, 2]);
    expect(result.verifiedTicks).toEqual([3, 4]);
    expect(result.sourceRevision).toBe(RELEASE);
    expect(result.oracleResultHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(after).toEqual(before);

    const repeated = await oracle.replayRange({ zoneId: ZONE, fromTick: 3, toTick: 4 });
    expect(repeated.oracleResultHash).toBe(result.oracleResultHash);
    expect(await counts()).toEqual(before);

    const evidencePath = process.env.AURION_STEP25_ZONE_ID_PATH?.trim();
    if (evidencePath) writeFileSync(evidencePath, ZONE + "\n", "utf8");
  });
});
