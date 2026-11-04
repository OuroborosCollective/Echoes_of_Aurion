import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionItemInstancesV2, aurionLootDropReceiptsV2, expeditionResultReceipts } from "../drizzle/schema";
import { createValidatedAurionLootDropV2, getDb, recordValidatedExpeditionResult } from "./db";
import { AURION_LOOT_CONTENT_VERSION, aurionLootCatalogV2, aurionLootCatalogV3 } from "./aurionLootCatalog";
import { isExplicitIsolatedWorldE2eEnvironment } from "./worldE2eGuard";

const describeWithIsolatedDatabase = isExplicitIsolatedWorldE2eEnvironment() ? describe : describe.skip;
const USER_ID = 2_146_991_026;
const PREFIX = "aurion-loot-v2-e2e";

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID));
  await db.delete(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.userId, USER_ID));
  const results = await db.select({ id: expeditionResultReceipts.id }).from(expeditionResultReceipts).where(eq(expeditionResultReceipts.userId, USER_ID));
  for (const result of results) await db.delete(expeditionResultReceipts).where(eq(expeditionResultReceipts.id, result.id));
}

describeWithIsolatedDatabase("Aurion V2 loot E2E", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("persists V3 effects/provenance, replays one item and rejects a changed cause or actor", async () => {
    const accepted = await recordValidatedExpeditionResult({ userId: USER_ID, expeditionKey: `${PREFIX}:v3`, seedDigest: "f".repeat(64), resultDigest: "b".repeat(64), confirmedByUserId: USER_ID, idempotencyKey: `${PREFIX}:v3-result` });
    const input = { userId: USER_ID, idempotencyKey: `${PREFIX}:v3-drop`, context: {
      worldId: "echoes-of-aurion-global", zoneId: "windhollow", monsterArchetypeId: "ash-sentinel", encounterReceiptId: accepted.receipt.id,
      ruleSetVersion: aurionLootCatalogV3.ruleSetVersion, contentVersion: aurionLootCatalogV3.contentVersion,
      resolutionIndex: 19, playerLevelExact: "100", zoneLevelExact: "100", monsterLevelExact: "100", luckBps: 400, serverSeedDigest: "f".repeat(64),
    } };
    const first = await createValidatedAurionLootDropV2(input);
    expect(first.receipt.ruleSetVersion).toBe("aurion-loot.v3");
    expect(JSON.parse(first.receipt.resolvedJson).contract.source.encounterReceiptId).toBe(accepted.receipt.id);
    expect((await createValidatedAurionLootDropV2(input)).item.id).toBe(first.item.id);
    await expect(createValidatedAurionLootDropV2({ ...input, userId: USER_ID + 1 })).rejects.toThrow(/SCOPE_MISMATCH/);
    await expect(createValidatedAurionLootDropV2({ ...input, context: { ...input.context, resolutionIndex: 20 } })).rejects.toThrow(/CONTEXT_MISMATCH/);
    const db = await getDb();
    expect(await db!.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID))).toHaveLength(1);
  });

  it("materializes exactly one immutable high-level item from a matching accepted server receipt", async () => {
    const accepted = await recordValidatedExpeditionResult({
      userId: USER_ID,
      expeditionKey: `${PREFIX}:expedition`,
      seedDigest: "f".repeat(64),
      resultDigest: "a".repeat(64),
      confirmedByUserId: USER_ID,
      idempotencyKey: `${PREFIX}:result`,
    });
    const input = {
      userId: USER_ID,
      context: {
        worldId: "echoes-of-aurion-global", zoneId: "windhollow", monsterArchetypeId: "ash-sentinel", encounterReceiptId: accepted.receipt.id,
        ruleSetVersion: aurionLootCatalogV2.ruleSetVersion, contentVersion: AURION_LOOT_CONTENT_VERSION, resolutionIndex: 19,
        playerLevelExact: "9007199254740992", zoneLevelExact: "9007199254740993", monsterLevelExact: "9007199254740994", luckBps: 400,
        serverSeedDigest: "f".repeat(64),
      },
      idempotencyKey: `${PREFIX}:drop`,
    } as const;
    const first = await createValidatedAurionLootDropV2(input);
    const replay = await createValidatedAurionLootDropV2(input);
    expect(first.applied).toBe(true);
    expect(replay).toMatchObject({ applied: false, receipt: { id: first.receipt.id }, item: { id: first.item.id } });
    expect(first.item).toMatchObject({ ownerUserId: USER_ID, lootReceiptId: first.receipt.id, itemLevelExact: "9007199254740994", deterministicHash: first.receipt.deterministicHash });
    await expect(createValidatedAurionLootDropV2({ ...input, idempotencyKey: `${PREFIX}:wrong-seed`, context: { ...input.context, serverSeedDigest: "0".repeat(64) } })).rejects.toThrow(/passendem Serversamen/i);
  });
});
