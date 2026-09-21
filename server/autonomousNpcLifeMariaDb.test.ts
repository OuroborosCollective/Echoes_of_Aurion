import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTONOMOUS_NPC_LIFE_NPC_ID, createAutonomousNpcLifeRuntime } from "./autonomousNpcLifeRuntime";
import { resolveAndRecordWorld } from "./wasdAurionRuntime";
import type { WorldSignal } from "./wasdAurionProtocol";

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const hubs = ["observatory_threshold","windhollow","emberfall","cinder_vault"] as const;

suite("AIM-263 autonomous NPC life in isolated MariaDB", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("TRUNCATE TABLE aurionNpcMemoryReceiptsV4");
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    await pool.query("DELETE FROM aurionWorldResolutions WHERE regionId IN (?,?,?,?) AND resolutionIndex BETWEEN 0 AND 20",hubs);
    await pool.query("DELETE FROM aurionPolityStates WHERE polityId IN (?,?,?,?)",hubs.map(hub => `polity:${hub}`));
  }

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (!rows[0].name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  it("continues from the exact confirmed receipt across runtime recreation instead of resetting the NPC", async () => {
    const firstRuntime = createAutonomousNpcLifeRuntime({ enabled: true });
    await firstRuntime.resolveOnce({ tick: 600 });
    const first = firstRuntime.readback();
    expect(first).toMatchObject({ status: "confirmed", lastGatewayTick: 600, lastResolutionIndex: 0, worldRegionId: "observatory_threshold", npcReceiptSource: "created", worldReceiptSource: "created" });
    expect(first.decisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.lifeStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.worldReactionHash).toMatch(/^[a-f0-9]{64}$/);

    const restartedRuntime = createAutonomousNpcLifeRuntime({ enabled: true });
    await restartedRuntime.resolveOnce({ tick: 600 });
    const second = restartedRuntime.readback();
    expect(second.status).toBe("confirmed");
    expect(second.lastResolutionIndex).toBe(1);
    expect(second.decisionHash).not.toBe(first.decisionHash);
    expect(typeof second.worldRegionId).toBe("string");
    expect(hubs).toContain(second.worldRegionId as (typeof hubs)[number]);

    const [receipts] = await pool.query<RowDataPacket[]>("SELECT resolutionIndex,observationIdsJson FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(receipts).toHaveLength(2);
    expect(receipts.map(row => row.resolutionIndex)).toEqual([0,1]);
    expect(receipts.every(row => JSON.parse(row.observationIdsJson).version === "aurion-npc-decision.v3")).toBe(true);

    const [state] = await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex,memoryJson FROM aurionNpcStates WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(state[0].lastResolutionIndex).toBe(1);
    expect(JSON.parse(state[0].memoryJson).version).toBe("aurion-npc-memory.v2");
  });

  it("serializes queued gateway observations and rejects cadence/order violations", async () => {
    const runtime = createAutonomousNpcLifeRuntime({ enabled: true });
    await expect(runtime.observe({ tick: 599 })).rejects.toThrow("NOT_ON_CADENCE");
    const one = runtime.observe({ tick: 600 });
    const two = runtime.observe({ tick: 1200 });
    await Promise.all([one,two]);
    expect(runtime.readback()).toMatchObject({ status: "confirmed", lastGatewayTick: 1200, lastResolutionIndex: 1 });
    await expect(runtime.observe({ tick: 1200 })).rejects.toThrow("OUT_OF_ORDER");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT resolutionIndex FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(rows.map(row => row.resolutionIndex)).toEqual([0,1]);
  });

  it("deduplicates concurrent world receipts by region/resolution and rejects a conflicting retry", async () => {
    const signal: WorldSignal = { id: "autonomous-world:signal", kind: "economy", regionId: "observatory_threshold", magnitude: .2, sourceReceiptId: "autonomous-world:receipt", resolutionIndex: 9 };
    const request = { worldSeed: "autonomous-world-test", regionId: "observatory_threshold", resolutionIndex: 9, signals: [signal] } as const;
    const results = await Promise.all([0,1,2,3].map(() => resolveAndRecordWorld(request)));
    expect(results.filter(result => result.source === "created")).toHaveLength(1);
    expect(new Set(results.map(result => result.reaction.deterministicHash)).size).toBe(1);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id,reactionHash FROM aurionWorldResolutions WHERE regionId=? AND resolutionIndex=?",[request.regionId,request.resolutionIndex]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^world_[a-f0-9]{58}$/);
    await expect(resolveAndRecordWorld({ ...request, signals: [{ ...signal, magnitude: .3 }] })).rejects.toThrow("INPUT_CONFLICT");
    const [after] = await pool.query<RowDataPacket[]>("SELECT reactionHash FROM aurionWorldResolutions WHERE regionId=? AND resolutionIndex=?",[request.regionId,request.resolutionIndex]);
    expect(after).toHaveLength(1);
    expect(after[0].reactionHash).toBe(rows[0].reactionHash);
  });
});
