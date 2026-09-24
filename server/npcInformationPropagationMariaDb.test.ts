import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import {
  readConfirmedNpcInformation,
  readNpcInformationProvenance,
  recordExperiencedNpcInformation,
  recordNpcInformationCommunication,
  recordNpcInformationTransition,
} from "./npcInformationPropagation";

const suite = process.env.AURION_NPC_INFORMATION_ECOLOGY_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;

const npcId = "lyra";
const receiverNpcId = "orun";

function sourceRequest(resolutionIndex: number) {
  return {
    npcId,
    regionId: "observatory_threshold",
    resolutionIndex,
    needEvents: [],
    observationIds: [\`aim487-source:\${resolutionIndex}\`],
    memory: [],
    roleId: "merchant",
    economy: {
      currentHubId: "observatory_threshold",
      wealthCopper: 1200,
      hungerBps: 2000,
      fatigueBps: 1500,
      tradeProwessBps: 10500,
      harvestYieldBps: 10000,
    },
    opportunities: [],
  };
}

suite("AIM-487 real MariaDB information ecology", () => {
  let pool: Pool;
  let isolated = false;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });

  beforeEach(async () => {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("TRUNCATE TABLE aurionNpcInformationReceipts");
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?, ?)", [npcId, receiverNpcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?, ?)", [npcId, receiverNpcId]);
  });

  afterAll(async () => {
    if (pool) {
      if (isolated) await pool.query("TRUNCATE TABLE aurionNpcInformationReceipts");
      await pool.end();
    }
  });

  it("writes and independently reads back a verified fact anchored to a real NPC decision receipt", async () => {
    await resolveAndRecordNpc(sourceRequest(0));
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, decisionHash FROM aurionNpcDecisionReceipts WHERE npcId=? AND resolutionIndex=0 LIMIT 1",
      [npcId],
    );
    const sourceRow = rows[0];
    expect(sourceRow?.id).toBeTruthy();
    const source = {
      evidenceClass: "verified" as const,
      sourceKind: "npc_decision_receipt" as const,
      sourceReceiptId: String(sourceRow.id),
      sourceReceiptHash: "sha256:" + String(sourceRow.decisionHash).padStart(64, "0").slice(0, 64),
      sourceRevision: pin.sourceRevision,
      sourceSha256: "sha256:" + pin.sourceSha256,
      sourceCausalRoot: "sha256:" + String(sourceRow.decisionHash).padStart(64, "0").slice(0, 64),
    };
    const fact = await recordExperiencedNpcInformation({
      worldId: "echoes-of-aurion-global",
      witnessNpcId: npcId,
      subjectId: "caravan-7",
      predicate: "destroyed",
      value: "true",
      logicalIndex: 10,
      expiresAtIndex: 100,
      source,
      confidenceBps: 9000,
    });
    const [stored] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNpcInformationReceipts WHERE id=?", [fact.id]);
    expect(stored).toHaveLength(1);
    expect(stored[0].receiptHash).toBe(fact.receiptHash);
    expect(await readConfirmedNpcInformation({ ownerNpcId: npcId })).toEqual([fact]);
  });

  it("persists communication exactly once and reconstructs provenance after a fresh read", async () => {
    await resolveAndRecordNpc(sourceRequest(0));
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, decisionHash FROM aurionNpcDecisionReceipts WHERE npcId=? AND resolutionIndex=0 LIMIT 1",
      [npcId],
    );
    const sourceRow = rows[0];
    const source = {
      evidenceClass: "verified" as const,
      sourceKind: "npc_decision_receipt" as const,
      sourceReceiptId: String(sourceRow.id),
      sourceReceiptHash: "sha256:" + String(sourceRow.decisionHash).padStart(64, "0").slice(0, 64),
      sourceRevision: pin.sourceRevision,
      sourceSha256: "sha256:" + pin.sourceSha256,
      sourceCausalRoot: "sha256:" + String(sourceRow.decisionHash).padStart(64, "0").slice(0, 64),
    };
    const experienced = await recordExperiencedNpcInformation({
      worldId: "echoes-of-aurion-global",
      witnessNpcId: npcId,
      subjectId: "caravan-7",
      predicate: "destroyed",
      value: "true",
      logicalIndex: 10,
      source,
    });
    const remembered = await recordNpcInformationTransition({
      previousReceiptId: experienced.id,
      status: "remembered",
      logicalIndex: 11,
      confidenceBps: 9000,
    });
    const first = await recordNpcInformationCommunication({
      sourceReceiptId: remembered.id,
      receiverNpcId,
      logicalIndex: 12,
    });
    const second = await recordNpcInformationCommunication({
      sourceReceiptId: remembered.id,
      receiverNpcId,
      logicalIndex: 12,
    });
    expect(second).toEqual(first);
    expect(await readConfirmedNpcInformation({ ownerNpcId: receiverNpcId, logicalIndex: 12 })).toEqual([first]);
    const provenance = await readNpcInformationProvenance(receiverNpcId, first.factId);
    expect(provenance?.originSourceReceiptId).toBe(source.sourceReceiptId);
    expect(provenance?.lineageReceiptIds).toEqual([experienced.id, remembered.id, first.id]);
  });

  it("does not expose source receipt payloads through the compact projection", async () => {
    await resolveAndRecordNpc(sourceRequest(0));
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, decisionHash FROM aurionNpcDecisionReceipts WHERE npcId=? AND resolutionIndex=0 LIMIT 1",
      [npcId],
    );
    const fact = await recordExperiencedNpcInformation({
      worldId: "echoes-of-aurion-global",
      witnessNpcId: npcId,
      subjectId: "ruin-7",
      predicate: "discovered",
      value: "true",
      logicalIndex: 2,
      source: {
        evidenceClass: "verified",
        sourceKind: "npc_decision_receipt",
        sourceReceiptId: String(rows[0].id),
        sourceReceiptHash: "sha256:" + String(rows[0].decisionHash).padStart(64, "0").slice(0, 64),
        sourceRevision: pin.sourceRevision,
        sourceSha256: "sha256:" + pin.sourceSha256,
        sourceCausalRoot: "sha256:" + String(rows[0].decisionHash).padStart(64, "0").slice(0, 64),
      },
    });
    const { projectNpcInformation } = await import("../shared/npcInformationEcologyProtocol");
    const projection = projectNpcInformation(fact);
    expect(JSON.stringify(projection)).not.toContain("memoryJson");
    expect(JSON.stringify(projection)).not.toContain("decisionHash");
  });
});
