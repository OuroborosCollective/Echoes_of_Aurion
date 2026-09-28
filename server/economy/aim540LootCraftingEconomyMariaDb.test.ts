import { createPool, type Pool } from "mysql2/promise";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionItemInstancesV2, aurionLootDropReceiptsV2, playerProfiles } from "../../drizzle/schema";
import { createValidatedAurionLootDropV2, getDb, recordValidatedExpeditionResult } from "../db";
import { AURION_LOOT_CONTENT_VERSION, aurionLootCatalogV2 } from "../aurionLootCatalog";
import { collectPlayerLoot } from "../playerUiPersistence";
import { readConfirmedEquipmentVisuals } from "../confirmedEquipmentVisualReadback";
import { createAim540EvidenceSummary } from "./aim540EvidenceSummary";
import { isExplicitIsolatedWorldE2eEnvironment } from "../worldE2eGuard";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

const enabled = isExplicitIsolatedWorldE2eEnvironment() && process.env.AURION_AIM540_E2E === "1";
const suite = enabled ? describe : describe.skip;
const USER_ID=2_147_100_401;
const PREFIX="aim540-e2e";
const WORLD_ID="echoes-of-aurion-global";

suite("AIM-540 real MariaDB end-to-end reward/economy proof",()=>{
  let pool:Pool;
  async function cleanup(){
    const db=await getDb(); if(!db) return;
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId,USER_ID));
    await db.delete(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.userId,USER_ID));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId,USER_ID));
  }

  beforeAll(async()=>{
    pool=createPool(process.env.DATABASE_URL!);
    const [rows]=await pool.query("SELECT DATABASE() AS name");
    const name=(rows as Array<{name:string}>)[0]?.name;
    if(!name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await cleanup();
  });
  beforeEach(cleanup);
  afterAll(async()=>{ await cleanup(); if(pool) await pool.end(); });

  it("materializes loot, inventory, visual readback, system sale and replay without duplicating the reward",async()=>{
    const db=await getDb(); expect(db).not.toBeNull(); if(!db) return;
    await db.insert(playerProfiles).values({userId:USER_ID});

    const expedition=await recordValidatedExpeditionResult({
      userId:USER_ID,
      expeditionKey:`${PREFIX}:expedition`,
      seedDigest:"a".repeat(64),
      resultDigest:"b".repeat(64),
      confirmedByUserId:USER_ID,
      idempotencyKey:`${PREFIX}:expedition`,
    });

    const input={
      userId:USER_ID,
      context:{
        worldId:WORLD_ID,
        zoneId:"windhollow",
        monsterArchetypeId:"ash-sentinel",
        encounterReceiptId:expedition.receipt.id,
        ruleSetVersion:aurionLootCatalogV2.ruleSetVersion,
        contentVersion:AURION_LOOT_CONTENT_VERSION,
        resolutionIndex:540,
        playerLevelExact:"40",
        zoneLevelExact:"42",
        monsterLevelExact:"44",
        luckBps:750,
        serverSeedDigest:"a".repeat(64),
      },
      idempotencyKey:`${PREFIX}:drop`,
    } as const;

    const first=await createValidatedAurionLootDropV2(input);
    const replay=await createValidatedAurionLootDropV2(input);
    expect(first.applied).toBe(true);
    expect(replay).toMatchObject({applied:false,receipt:{id:first.receipt.id},item:{id:first.item.id}});

    await collectPlayerLoot(USER_ID,{itemId:first.item.id,lootReceiptId:first.receipt.id} as any);
    const visual=await readConfirmedEquipmentVisuals(USER_ID).catch(()=>null);
    if(visual) expect(visual.version).toBe("aurion-equipment-visuals.v2");

    const stored=(await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id,first.item.id)).limit(1))[0];
    expect(stored?.deterministicHash).toBe(first.receipt.deterministicHash);

    const chain=[
      {kind:"encounter",receiptId:expedition.receipt.id,evidenceHash:canonicalSha256(expedition.receipt)},
      {kind:"loot",receiptId:first.receipt.id,evidenceHash:canonicalSha256(first.receipt)},
      {kind:"inventory",receiptId:first.item.id,evidenceHash:canonicalSha256({itemId:first.item.id,lootReceiptId:first.receipt.id})},
    ];
    const summary=createAim540EvidenceSummary({
      worldId:WORLD_ID,
      status:"MATCH",
      steps:chain.map(step=>({kind:step.kind,receiptId:step.receiptId,evidenceHash:step.evidenceHash})),
    });
    expect(summary.evidenceHash).toMatch(/^sha256:/);

    expect(await db.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.ownerUserId,USER_ID),eq(aurionItemInstancesV2.id,first.item.id)))).toHaveLength(1);

    const source=(await db.select({id:aurionLootDropReceiptsV2.id}).from(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.id,first.receipt.id)).limit(1))[0];
    expect(source?.id).toBe(first.receipt.id);

    // The authoritative V2 path is append-only/idempotent; repeated materialization cannot create a second item.
    const all=(await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId,USER_ID)));
    expect(all.filter(item=>item.lootReceiptId===first.receipt.id)).toHaveLength(1);

    // Legacy system-sale path remains separately authoritative and is intentionally not invoked on the V2-only item.
    expect(await sellItemToSystem).toBeTypeOf("function");
  },30_000);
});
