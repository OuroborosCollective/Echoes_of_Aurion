import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { aurionMasteryEvents, aurionProgressionReceipts, aurionStatAllocationReceipts, playerProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import { aurionMasteryDisciplineIds, resolveMasteryReadmodel } from "./aurionMasteryEthosProtocol";
import { normalizeProgressionReceipt, type ProgressionReceiptInput } from "./progressionReceiptPersistence";
import { confirmAurionStatAllocation, resolveAurionStatWallet, type AurionStatAttribute, type StatAllocation } from "../shared/aurionStatPointProtocol";

const WALLET_ID = "aurion.stat-alloc.v1";
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const cmp = (a:string,b:string) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;

export async function readAurionStatWalletInTransaction(tx: Transaction, userId: number) {
  const rows = await tx.select().from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.userId, userId));
  const masteries = new Map<string, {trackId:string;levelExact:string;sourceReceiptId:string}>();
  let character: {levelExact:string;sourceReceiptId:string}|null = null;
  for(const row of rows) {
    const normalized = normalizeProgressionReceipt(row as ProgressionReceiptInput);
    const digest = normalized.receiptHash;
    if(row.receiptHash !== digest || row.id !== `progression_${digest.slice(0,52)}`) throw new Error("AURION_STAT_PROGRESSION_RECEIPT_CORRUPT");
    if (row.actionKind === "encounter") {
      if(!character || cmp(row.levelExact,character.levelExact)>0) character={levelExact:row.levelExact,sourceReceiptId:row.id};
    }
    if (row.actionKind === "weapon_use") {
      const trackId = row.weaponTrack.endsWith("_mastery") ? row.weaponTrack : row.weaponTrack+"_mastery";
      const current=masteries.get(trackId);
      if(!current || cmp(row.levelExact,current.levelExact)>0) masteries.set(trackId,{trackId,levelExact:row.levelExact,sourceReceiptId:row.id});
    }
    if(row.actionKind === "skill_use") {
      const trackId = row.skillId;
      const current = masteries.get(trackId);
      if(!current || cmp(row.levelExact,current.levelExact)>0) masteries.set(trackId,{trackId,levelExact:row.levelExact,sourceReceiptId:row.id});
    }
  }
  // Provenance-checked Aurion mastery events already guard accepted source receipts.
  // Include all discipline level changes (including crafting/civic as unconfigured
  // until an explicit rate is approved), without granting duplicate weapon awards.
  const masteryEvents = await tx.select().from(aurionMasteryEvents).where(eq(aurionMasteryEvents.userId,userId));
  for(const disciplineId of aurionMasteryDisciplineIds) {
    const events = masteryEvents.filter(e=>e.disciplineId===disciplineId);
    if(!events.length) continue;
    const readmodel = resolveMasteryReadmodel({
      playerId: String(userId), disciplineId,
      events: events.map(e=>({idempotencyKey:e.idempotencyKey,sourceReceiptId:e.sourceReceiptId,disciplineId,
        source:e.source as typeof e.source, amountExact:e.amountExact,resolutionIndex:e.resolutionIndex,
        ruleSetVersion:e.ruleSetVersion,contentVersion:e.contentVersion})),
    });
    const levelExact=readmodel.progression.levelExact;
    const current=masteries.get(disciplineId);
    if(!current||cmp(levelExact,current.levelExact)>0)masteries.set(disciplineId,{trackId:disciplineId,levelExact,sourceReceiptId:readmodel.receiptHash});
  }
  const existing = await tx.select().from(aurionStatAllocationReceipts).where(eq(aurionStatAllocationReceipts.userId,userId));
  const allocations: StatAllocation[] = existing.map(r=>({key:r.attribute as AurionStatAttribute,amountExact:r.amountExact,idempotencyKey:r.idempotencyKey}));
  return resolveAurionStatWallet({userId,character,masteries:[...masteries.values()],allocations});
}
export async function readAurionStatWallet(userId:number) {
  const db=await getDb();if(!db)throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => readAurionStatWalletInTransaction(tx,userId));
}
export async function allocateAurionStatPoint(userId:number, attribute:AurionStatAttribute, idempotencyKey:string, expectedAvailableExact:string) {
  const db=await getDb();if(!db)throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const profile=(await tx.select().from(playerProfiles).where(eq(playerProfiles.userId,userId)).for("update"))[0];
    if(!profile) throw new Error("AURION_STAT_PLAYER_REQUIRED");
    const prior=(await tx.select().from(aurionStatAllocationReceipts).where(eq(aurionStatAllocationReceipts.idempotencyKey,idempotencyKey)).limit(1))[0];
    if(prior) {
      if(prior.userId!==userId || prior.attribute!==attribute || prior.amountExact!=="1") throw new Error("AURION_STAT_SPEND_IDEMPOTENCY_CONFLICT");
      return {applied:false as const,wallet:await readAurionStatWalletInTransaction(tx,userId)};
    }
    const before=await readAurionStatWalletInTransaction(tx,userId);
    if(expectedAvailableExact!==before.availableExact)throw new Error("AURION_STAT_STALE_BALANCE");
    const intent=confirmAurionStatAllocation(before,attribute,idempotencyKey);
    const digest=createHash("sha256").update([WALLET_ID,userId,attribute,idempotencyKey,before.earnedExact].join(":")).digest("hex");
    await tx.insert(aurionStatAllocationReceipts).values({id:"stat_"+digest.slice(0,59),userId,attribute,amountExact:intent.amountExact,earnedAtSpendExact:before.earnedExact,idempotencyKey});
    const after=await readAurionStatWalletInTransaction(tx,userId);
    if(BigInt(before.availableExact)-BigInt(after.availableExact)!==1n)throw new Error("AURION_STAT_SPEND_READBACK_MISMATCH");
    return {applied:true as const,wallet:after};
  });
}
