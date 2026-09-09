import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import mysql from "mysql2/promise";
import { npcHash, npcMemoryReceiptIds, parseNpcMemoryV4, projectNpcMemoryV4, verifyConfirmedNpcDecision, verifyNpcMemoryEvidence } from "../vendor/wasd-npc/index.js";
const npcPin = JSON.parse(fs.readFileSync("config/wasd-npc-capsule.json","utf8"));

const expectedRevision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase();
if (!expectedRevision || !/^[a-f0-9]{40}$/.test(expectedRevision)) throw new Error("AURION_RELEASE_SHA_REQUIRED");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");

const response = await fetch("http://127.0.0.1:3000/healthz", { cache: "no-store" });
if (!response.ok) throw new Error(`AURION_RUNTIME_HEALTH_HTTP_${response.status}`);
const health = await response.json();
await mkdir("test-results", { recursive: true });
fs.writeFileSync("test-results/aim259-autonomous-npc-life-health.json", `${JSON.stringify(health, null, 2)}\n`, "utf8");

if (health.status !== "ok" || health.service !== "echoes-of-aurion" || health.revision !== expectedRevision) throw new Error("AURION_RUNTIME_HEALTH_REVISION_MISMATCH");
const life = health.npcLife;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identity = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
if (!life || life.enabled !== true || life.status !== "confirmed" || life.intervalTicks !== 600) throw new Error("NPC_LIFE_RUNTIME_NOT_CONFIRMED");
if (!Number.isSafeInteger(life.lastGatewayTick) || life.lastGatewayTick < 600 || life.lastGatewayTick % 600 !== 0) throw new Error("NPC_LIFE_GATEWAY_TICK_INVALID");
if (!Number.isSafeInteger(life.lastResolutionIndex) || life.lastResolutionIndex < 0) throw new Error("NPC_LIFE_RESOLUTION_INVALID");
if (![life.decisionHash, life.lifeStateHash, life.worldReactionHash].every(hash)) throw new Error("NPC_LIFE_HASH_READBACK_INVALID");
if (![life.npcId, life.homeRegionId, life.currentHubId, life.worldRegionId].every(identity) || !life.goal || !life.longTermGoal || life.failureCode !== null) throw new Error("NPC_LIFE_RUNTIME_READBACK_INCOMPLETE");
if (life.npcReceiptSource !== "created" && life.npcReceiptSource !== "persisted") throw new Error("NPC_LIFE_NPC_RECEIPT_SOURCE_INVALID");
if (life.worldReceiptSource !== "created" && life.worldReceiptSource !== "persisted") throw new Error("NPC_LIFE_WORLD_RECEIPT_SOURCE_INVALID");

const pool = mysql.createPool(process.env.DATABASE_URL);
try {
  const [stateRows] = await pool.query("SELECT npcId,regionId,lastResolutionIndex FROM aurionNpcStates WHERE npcId=?", [life.npcId]);
  if (stateRows.length !== 1 || stateRows[0].npcId !== life.npcId || stateRows[0].regionId !== life.currentHubId || stateRows[0].lastResolutionIndex !== life.lastResolutionIndex) throw new Error("NPC_LIFE_STATE_ROW_MISMATCH");

  const [receiptRows] = await pool.query("SELECT regionId,goal,decisionHash,observationIdsJson FROM aurionNpcDecisionReceipts WHERE npcId=? AND resolutionIndex=?", [life.npcId, life.lastResolutionIndex]);
  if (receiptRows.length !== 1 || receiptRows[0].regionId !== life.currentHubId || receiptRows[0].goal !== life.goal || receiptRows[0].decisionHash !== life.decisionHash) throw new Error("NPC_LIFE_DECISION_RECEIPT_MISMATCH");
  const envelope = JSON.parse(receiptRows[0].observationIdsJson);
  if (envelope.version !== "aurion-npc-decision.v3" || envelope.snapshot?.npcId !== life.npcId || envelope.snapshot?.regionId !== life.currentHubId || envelope.snapshot?.decision?.resolutionIndex !== life.lastResolutionIndex || envelope.snapshot?.decision?.decisionHash !== life.decisionHash || envelope.snapshot?.lifeState?.stateHash !== life.lifeStateHash || envelope.snapshot?.lifeState?.economy?.currentHubId !== life.currentHubId) throw new Error("NPC_LIFE_V3_RECEIPT_MISMATCH");

  const [worldRows] = await pool.query("SELECT regionId,resolutionIndex,reactionHash FROM aurionWorldResolutions WHERE regionId=? AND resolutionIndex=?", [life.worldRegionId, life.lastResolutionIndex]);
  if (worldRows.length !== 1 || worldRows[0].regionId !== life.worldRegionId || worldRows[0].resolutionIndex !== life.lastResolutionIndex || worldRows[0].reactionHash !== life.worldReactionHash) throw new Error("NPC_LIFE_WORLD_RECEIPT_MISMATCH");

  const [memoryRows] = await pool.query("SELECT * FROM aurionNpcMemoryReceiptsV4 WHERE npcId=? AND resolutionIndex=?",[life.npcId,life.lastResolutionIndex]);
  if (memoryRows.length!==1) throw new Error("NPC_MULTI_MEMORY_RECEIPT_REQUIRED");
  const memoryRow=memoryRows[0], memory=parseNpcMemoryV4(memoryRow.memoryJson), ids=npcMemoryReceiptIds(memory);
  if (memoryRow.memoryHash!==memory.memoryHash || memoryRow.sourceRevision!==npcPin.sourceRevision || memoryRow.sourceSha256!==npcPin.sourceSha256 || memory.lastReceiptId!==memoryRow.sourceDecisionReceiptId) throw new Error("NPC_MULTI_MEMORY_ROW_MISMATCH");
  const [sourceRows]=await pool.query(`SELECT * FROM aurionNpcDecisionReceipts WHERE npcId=? AND id IN (${ids.map(()=>"?").join(",")})`,[life.npcId,...ids]);
  verifyNpcMemoryEvidence(memory,sourceRows.map(row=>verifyConfirmedNpcDecision(row.observationIdsJson,{...row,receiptId:row.id})));
  if (npcHash(projectNpcMemoryV4(memory))!==npcHash(life.multiMemory)) throw new Error("NPC_MULTI_MEMORY_RUNTIME_PROJECTION_MISMATCH");

  console.log(JSON.stringify({
    recordType: "aurion_autonomous_npc_life_runtime_readback",
    sourceRevision: expectedRevision,
    npcId: life.npcId,
    homeRegionId: life.homeRegionId,
    currentHubId: life.currentHubId,
    worldRegionId: life.worldRegionId,
    lastGatewayTick: life.lastGatewayTick,
    lastResolutionIndex: life.lastResolutionIndex,
    action: life.action,
    goal: life.goal,
    longTermGoal: life.longTermGoal,
    decisionHash: life.decisionHash,
    lifeStateHash: life.lifeStateHash,
    worldReactionHash: life.worldReactionHash,
    npcReceiptSource: life.npcReceiptSource,
    worldReceiptSource: life.worldReceiptSource,
    receiptBound: true,
    multiMemory: { memoryHash:memory.memoryHash, receiptHash:memoryRow.receiptHash, sourceRevision:memoryRow.sourceRevision, sourceSha256:memoryRow.sourceSha256, counts:life.multiMemory.counts, retainedSourcesVerified:ids.length },
  }));
} finally {
  await pool.end();
}
