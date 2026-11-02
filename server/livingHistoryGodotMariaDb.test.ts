import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { orchestrateCivilizationLoop } from "./aurion/civilizationService";
import { listVisibleRuins, readPublicCollapseHistory } from "./aurionCivilizationHistoryPersistence";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveWorldEpochReaction } from "./worldEpochReactionProtocol";

const suite = process.env.AURION_EXPLORATION_MEMORY_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const worldA = "history-godot-proof-a";
const worldB = "history-godot-proof-b";

suite("Living History: canonical ruin identity and world isolation", () => {
  let pool: Pool;

  async function cleanup() {
    await pool.execute("DELETE FROM aurionRuinOrigins WHERE originCivilizationId IN (?, ?)", ["history-proof-civ-a", "history-proof-civ-b"]);
    await pool.execute("DELETE FROM aurionCivilizationHistoryEvents WHERE worldId IN (?, ?)", [worldA, worldB]);
    await pool.execute("DELETE FROM aurionActiveCivilizations WHERE worldId IN (?, ?)", [worldA, worldB]);
    await pool.execute("DELETE FROM aurionWorldEpochReactions WHERE worldId IN (?, ?)", [worldA, worldB]);
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<any[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { await cleanup(); await pool.end(); } });

  it("returns the same persisted, bounded ruin identity on collapse and replay", async () => {
    await pool.execute(
      "INSERT INTO aurionActiveCivilizations (civilizationId,worldId,worldEpoch,population,stability,hazardIndex,scarcitySeverity,lastResolutionIndex) VALUES (?,?,?,?,?,?,?,?)",
      ["history-proof-civ-a", worldA, 3, 50, 0.1, 0.9, 0.1, 4],
    );
    const first = await orchestrateCivilizationLoop(worldA, 3, "history-proof-receipt-a");
    expect(first.action).toBe("COLLAPSED");
    if (first.action !== "COLLAPSED") throw new Error("EXPECTED_COLLAPSE");
    expect(first.ruinId.length).toBeLessThanOrEqual(64);
    const [rows] = await pool.execute<any[]>(
      "SELECT r.ruinId,r.collapseEventId,e.worldId,e.eventType FROM aurionRuinOrigins r JOIN aurionCivilizationHistoryEvents e ON e.eventId=r.collapseEventId WHERE e.worldId=?",
      [worldA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ruinId: first.ruinId, worldId: worldA, eventType: "CIVILIZATION_COLLAPSE" });
    const replay = await orchestrateCivilizationLoop(worldA, 3, "history-proof-receipt-a");
    expect(replay).toEqual(first);
  });

  it("returns only ruins whose collapse receipt belongs to the requested world", async () => {
    for (const [suffix, world] of [["a", worldA], ["b", worldB]] as const) {
      await pool.execute(
        "INSERT INTO aurionCivilizationHistoryEvents (eventId,civilizationId,worldId,worldEpoch,eventType,sourceReceiptId,sourceRevision,eventPayloadHash,occurredSequence) VALUES (?,?,?,?,?,?,?,?,?)",
        [`history-proof-collapse-${suffix}`, `history-proof-civ-${suffix}`, world, 1, "CIVILIZATION_COLLAPSE", `history-proof-receipt-${suffix}`, "history-proof-v1", "a".repeat(64), 1],
      );
      await pool.execute(
        "INSERT INTO aurionRuinOrigins (ruinId,originCivilizationId,collapseEventId,locationIdentity,worldEpoch,historyDigest,rulesetVersion,generationSeedDigest,state) VALUES (?,?,?,?,?,?,?,?,?)",
        [`history-proof-ruin-${suffix}`, `history-proof-civ-${suffix}`, `history-proof-collapse-${suffix}`, "world_heart", 1, "b".repeat(64), "history-proof-v1", "c".repeat(64), "DISCOVERED"],
      );
    }
    const result = await listVisibleRuins(worldA);
    expect(result.map(ruin => ruin.ruinId)).toEqual(["history-proof-ruin-a"]);
  });

  it("does not bootstrap a new civilization while a collapsed ruin awaits qualified rebirth", async () => {
    await pool.execute(
      "INSERT INTO aurionActiveCivilizations (civilizationId,worldId,worldEpoch,population,stability,hazardIndex,scarcitySeverity,lastResolutionIndex) VALUES (?,?,?,?,?,?,?,?)",
      ["history-proof-civ-a", worldA, 3, 50, 0.1, 0.9, 0.1, 4],
    );
    const collapse = await orchestrateCivilizationLoop(worldA, 3, "history-proof-before-rebirth");
    expect(collapse.action).toBe("COLLAPSED");
    if (collapse.action !== "COLLAPSED") throw new Error("EXPECTED_COLLAPSE");
    const [before] = await pool.execute<any[]>(
      "SELECT r.* FROM aurionRuinOrigins r JOIN aurionCivilizationHistoryEvents e ON e.eventId=r.collapseEventId WHERE e.worldId=?",
      [worldA],
    );
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ ruinId: collapse.ruinId, state: "ELIGIBLE" });

    // An undiscovered ruin is absent from the presentation query. That absence
    // must not authorize initial seeding or bypass the dungeon/rebirth rules.
    expect(await listVisibleRuins(worldA)).toHaveLength(0);
    const next = await orchestrateCivilizationLoop(worldA, 4, "history-proof-awaiting-rebirth");
    expect(next).toEqual({ action: "IDLE" });
    const [active] = await pool.execute<any[]>("SELECT * FROM aurionActiveCivilizations WHERE worldId=?", [worldA]);
    expect(active).toHaveLength(0);
    const [after] = await pool.execute<any[]>(
      "SELECT r.* FROM aurionRuinOrigins r JOIN aurionCivilizationHistoryEvents e ON e.eventId=r.collapseEventId WHERE e.worldId=?",
      [worldA],
    );
    expect(after).toEqual(before);
    const [history] = await pool.execute<any[]>("SELECT eventType FROM aurionCivilizationHistoryEvents WHERE worldId=?", [worldA]);
    expect(history).toEqual([{ eventType: "CIVILIZATION_COLLAPSE" }]);
    expect(await orchestrateCivilizationLoop(worldA, 3, "history-proof-before-rebirth")).toEqual(collapse);
  });

  it("bootstraps an untouched world once even when another world has collapsed", async () => {
    await pool.execute(
      "INSERT INTO aurionActiveCivilizations (civilizationId,worldId,worldEpoch,population,stability,hazardIndex,scarcitySeverity,lastResolutionIndex) VALUES (?,?,?,?,?,?,?,?)",
      ["history-proof-civ-a", worldA, 3, 50, 0.1, 0.9, 0.1, 4],
    );
    expect((await orchestrateCivilizationLoop(worldA, 3, "history-proof-other-world-collapse")).action).toBe("COLLAPSED");
    const receipt = "history-proof-virgin-world-seed";
    const seeded = await orchestrateCivilizationLoop(worldB, 1, receipt);
    expect(seeded).toEqual({ action: "INITIAL_CIV_SEEDED", civilizationId: `civ_initial_${worldB}` });
    expect(await orchestrateCivilizationLoop(worldB, 1, receipt)).toEqual(seeded);
    const [active] = await pool.execute<any[]>("SELECT civilizationId,worldEpoch,lastResolutionIndex FROM aurionActiveCivilizations WHERE worldId=?", [worldB]);
    expect(active).toEqual([{ civilizationId: seeded.civilizationId, worldEpoch: 1, lastResolutionIndex: 0 }]);
    const [events] = await pool.execute<any[]>("SELECT eventType,sourceReceiptId FROM aurionCivilizationHistoryEvents WHERE worldId=?", [worldB]);
    expect(events).toEqual([{ eventType: "INITIAL_CIV_SEEDED", sourceReceiptId: receipt }]);
  });

  it("reconciles concurrent attempts against one persisted collapse", async () => {
    await pool.execute(
      "INSERT INTO aurionActiveCivilizations (civilizationId,worldId,worldEpoch,population,stability,hazardIndex,scarcitySeverity,lastResolutionIndex) VALUES (?,?,?,?,?,?,?,?)",
      ["history-proof-civ-a", worldA, 3, 50, 0.1, 0.9, 0.1, 4],
    );
    const results = await Promise.all([
      orchestrateCivilizationLoop(worldA, 3, "history-proof-receipt-concurrent"),
      orchestrateCivilizationLoop(worldA, 3, "history-proof-receipt-concurrent"),
    ]);
    expect(results[0]?.action).toBe("COLLAPSED");
    expect(results[1]).toEqual(results[0]);
    const [rows] = await pool.execute<any[]>(
      "SELECT r.ruinId FROM aurionRuinOrigins r JOIN aurionCivilizationHistoryEvents e ON e.eventId=r.collapseEventId WHERE e.worldId=?",
      [worldA],
    );
    expect(rows).toHaveLength(1);
  });

  it("projects only consistent public collapse event metadata and fails closed on tampering", async () => {
    // The source receipt is generated by the real deterministic resolver. The
    // test world override is a fixture, not proof of a production world identity.
    const plan = buildGlobalWorldPlan({ worldSeed: "history-proof", epoch: 7, activePlayerCount: 0, highWaterPlayerCount: 1 });
    const reaction = { ...resolveWorldEpochReaction({ plan, resolutionIndex: 7, confirmedDeltas: [], observedPresence: [] }), worldId: worldA };
    const receipt = reaction.receiptId;
    const reactionHash = reaction.deterministicHash;
    await pool.execute(
      "INSERT INTO aurionWorldEpochReactions (receiptId,worldId,epoch,ruleSetVersion,contentVersion,snapshotHash,reactionHash,reactionJson) VALUES (?,?,?,?,?,?,?,?)",
      [receipt, worldA, 7, reaction.ruleSetVersion, reaction.contentVersion, plan.deterministicHash, reactionHash, JSON.stringify(reaction)],
    );
    await pool.execute(
      "INSERT INTO aurionActiveCivilizations (civilizationId,worldId,worldEpoch,population,stability,hazardIndex,scarcitySeverity,lastResolutionIndex) VALUES (?,?,?,?,?,?,?,?)",
      ["history-proof-civ-a", worldA, 3, 50, 0.1, 0.9, 0.1, 4],
    );
    const collapse = await orchestrateCivilizationLoop(worldA, 7, receipt);
    expect(collapse.action).toBe("COLLAPSED");
    await pool.execute(
      "INSERT INTO aurionCivilizationHistoryEvents (eventId,civilizationId,worldId,worldEpoch,eventType,sourceReceiptId,sourceRevision,eventPayloadHash,occurredSequence) VALUES (?,?,?,?,?,?,?,?,?)",
      ["history-proof-missing-source", "history-proof-civ-a", worldA, 1, "CIVILIZATION_COLLAPSE", "missing-source", "aurion:civ:v1", "a".repeat(64), 1],
    );
    // Measure the real read's query budget; the spy calls through to MariaDB.
    // Source rows are already joined, so validation must add no N+1 reads.
    const database = await getDb();
    if (!database) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    const selects = vi.spyOn(database, "select");
    const projection = await (async () => {
      try {
        const result = await readPublicCollapseHistory(worldA);
        expect(selects.mock.calls.length, "history source validation exceeded one SELECT").toBe(1);
        return result;
      } finally { selects.mockRestore(); }
    })();
    expect(projection).toMatchObject({ worldId: worldA, disclosureScope: "public-history-events", events: [
      { civilizationId: "history-proof-civ-a", sourceReceiptId: receipt, sourceReactionHash: reactionHash },
    ] });
    const event = projection.events[0]!;
    expect(event).not.toHaveProperty("ruinId");
    expect(event).not.toHaveProperty("locationIdentity");
    expect(event).not.toHaveProperty("ruinState");
    expect((await readPublicCollapseHistory(worldB)).events).toHaveLength(0);
    await pool.execute("UPDATE aurionCivilizationHistoryEvents SET eventPayloadHash=? WHERE eventId=?", ["f".repeat(64), event.eventId]);
    await expect(readPublicCollapseHistory(worldA)).rejects.toThrow("LIVING_HISTORY_EVENT_READBACK_MISMATCH");
    await pool.execute("UPDATE aurionCivilizationHistoryEvents SET eventPayloadHash=? WHERE eventId=?", [event.eventPayloadHash, event.eventId]);
    await pool.execute("UPDATE aurionCivilizationHistoryEvents SET eventId=? WHERE eventId=?", ["e".repeat(64), event.eventId]);
    await expect(readPublicCollapseHistory(worldA)).rejects.toThrow("LIVING_HISTORY_EVENT_READBACK_MISMATCH");
    await pool.execute("UPDATE aurionCivilizationHistoryEvents SET eventId=? WHERE eventId=?", [event.eventId, "e".repeat(64)]);
    await pool.execute("UPDATE aurionWorldEpochReactions SET reactionJson=? WHERE receiptId=?", [JSON.stringify({ ...reaction, deterministicHash: "e".repeat(64) }), receipt]);
    await expect(readPublicCollapseHistory(worldA)).rejects.toThrow();
    const alteredSector = { ...reaction.sectors[0]!, resources: { ...reaction.sectors[0]!.resources, food: 0.123456 } };
    await pool.execute("UPDATE aurionWorldEpochReactions SET reactionJson=? WHERE receiptId=?", [JSON.stringify({ ...reaction, sectors: [alteredSector, ...reaction.sectors.slice(1)] }), receipt]);
    await expect(readPublicCollapseHistory(worldA)).rejects.toThrow("LIVING_HISTORY_SOURCE_READBACK_MISMATCH");
  });

});
