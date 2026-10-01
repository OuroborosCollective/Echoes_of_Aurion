// Native Aurion NPC decision log — collects all NPC decisions from the
// resolveNpcLife system into a queryable table for impact analysis.

import { eq, desc, and, sql } from "drizzle-orm";
import { aurionNpcDecisionLog } from "../../drizzle/schema";
import { getDb } from "../db";
import type { NpcLifeDecision } from "./npc/npcLifeProtocol.js";

export type NpcDecisionLogEntry = Readonly<{
  npcId: string;
  regionId: string;
  resolutionIndex: number;
  goal: string;
  longTermGoal: string;
  planStatus: string;
  planHash: string;
  decisionHash: string;
  utilityBpsJson: string;
  needsJson: string;
  observationIdsJson: string;
  sourceReceiptId: string;
}>;

export async function recordNpcDecisionLog(input: NpcDecisionLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[NpcDecisionLog] Database not available — decision not logged");
    return;
  }
  await db.insert(aurionNpcDecisionLog).values({
    id: `ndlog_${input.npcId}_${input.resolutionIndex}`,
    npcId: input.npcId,
    regionId: input.regionId,
    resolutionIndex: input.resolutionIndex,
    goal: input.goal,
    longTermGoal: input.longTermGoal,
    planStatus: input.planStatus,
    planHash: input.planHash,
    decisionHash: input.decisionHash,
    utilityBpsJson: input.utilityBpsJson,
    needsJson: input.needsJson,
    observationIdsJson: input.observationIdsJson,
    sourceReceiptId: input.sourceReceiptId,
  }).onDuplicateKeyUpdate({
    set: {
      goal: input.goal,
      longTermGoal: input.longTermGoal,
      planStatus: input.planStatus,
      planHash: input.planHash,
      decisionHash: input.decisionHash,
      utilityBpsJson: input.utilityBpsJson,
      needsJson: input.needsJson,
      observationIdsJson: input.observationIdsJson,
      sourceReceiptId: input.sourceReceiptId,
    },
  });
}

export async function recordNpcDecisionFromLifeDecision(
  decision: NpcLifeDecision,
  regionId: string,
  sourceReceiptId: string,
): Promise<void> {
  await recordNpcDecisionLog({
    npcId: decision.npcId,
    regionId,
    resolutionIndex: decision.resolutionIndex,
    goal: decision.goal,
    longTermGoal: decision.longTermGoal,
    planStatus: decision.plan.status,
    planHash: decision.plan.planHash,
    decisionHash: decision.decisionHash,
    utilityBpsJson: JSON.stringify(decision.utilityBps),
    needsJson: JSON.stringify(decision.needs),
    observationIdsJson: JSON.stringify(decision.observationIds),
    sourceReceiptId,
  });
}

export async function readNpcDecisionLog(opts: {
  npcId?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return Object.freeze([]);
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = Math.max(0, opts.offset ?? 0);
  const query = db.select().from(aurionNpcDecisionLog);
  const rows = opts.npcId
    ? await query.where(eq(aurionNpcDecisionLog.npcId, opts.npcId)).orderBy(desc(aurionNpcDecisionLog.resolutionIndex)).limit(limit).offset(offset)
    : await query.orderBy(desc(aurionNpcDecisionLog.resolutionIndex)).limit(limit).offset(offset);
  return Object.freeze(rows);
}

export async function countNpcDecisions(npcId?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = npcId
    ? await db.select({ count: sql<number>`count(*)` }).from(aurionNpcDecisionLog).where(eq(aurionNpcDecisionLog.npcId, npcId))
    : await db.select({ count: sql<number>`count(*)` }).from(aurionNpcDecisionLog);
  return Number(result[0]?.count ?? 0);
}
