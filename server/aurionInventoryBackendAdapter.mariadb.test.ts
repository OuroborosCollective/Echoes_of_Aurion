import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aurionItemInstancesV2, itemInstances, playerProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import { executeAurionInventoryTransaction, readAurionInventorySnapshot } from "./aurionInventoryBackendAdapter";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey } from "./aurionInventoryStackIdentity";

const enabled = process.env.AURION_INVENTORY_DB_E2E === "1" && !!process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;

const RUN_ID = Date.now() % 1_000_000;
const USER_ID = 9_500_000 + RUN_ID;
const OTHER_USER_ID = USER_ID + 1;

function v2Item(id: string, ownerUserId: number, lootReceiptId: string, quantityExact: string) {
  const shape = {
    definitionId: "aurion-oak-component-v2",
    category: "crafting_component" as const,
    equipmentSlot: null,
    quality: "normal" as const,
    levelExact: "1",
    affixesJson: "[]",
    setId: null,
    itemPower: 1,
  };
  return {
    id, ownerUserId, lootReceiptId, inventoryReceiptId: null, originItemId: null,
    baseItemDefinitionId: shape.definitionId, category: shape.category, equipmentSlot: shape.equipmentSlot,
    quality: shape.quality, itemLevelExact: shape.levelExact, affixesJson: shape.affixesJson, setId: shape.setId,
    itemPower: shape.itemPower, deterministicHash: "hash-" + id,
    quantityExact, maxQuantityExact: inventoryMaxQuantityExact(shape),
    mergeKey: inventoryMergeKey(shape), provenanceHash: inventoryItemShapeHash(shape),
    status: "owned" as const,
  };
}

suite("aurion inventory backend adapter MariaDB", () => {
  const dbRef = () => getDb();

  beforeAll(async () => {
    const db = await dbRef();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    await db.delete(itemInstances).where(eq(itemInstances.ownerUserId, USER_ID));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, OTHER_USER_ID));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, USER_ID));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, OTHER_USER_ID));
    await db.insert(playerProfiles).values({ userId: USER_ID, inventoryRevisionExact: "0" });
    await db.insert(playerProfiles).values({ userId: OTHER_USER_ID, inventoryRevisionExact: "0" });
  });

  afterAll(async () => {
    const db = await dbRef();
    if (!db) return;
    await db.delete(itemInstances).where(eq(itemInstances.ownerUserId, USER_ID));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, OTHER_USER_ID));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, USER_ID));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, OTHER_USER_ID));
  });

  it("applies merge atomically and replays the exact receipt", async () => {
    const db = await dbRef();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const sourceId = "merge-" + RUN_ID + "-source";
    const targetId = "merge-" + RUN_ID + "-target";
    await db.insert(aurionItemInstancesV2).values([
      v2Item(sourceId, USER_ID, "loot-" + RUN_ID + "-source", "7"),
      v2Item(targetId, USER_ID, "loot-" + RUN_ID + "-target", "5"),
    ]);
    const before = await readAurionInventorySnapshot(USER_ID);
    const command = { operation: "merge" as const, sourceStackId: sourceId, targetStackId: targetId, quantityExact: "7" };
    const first = await executeAurionInventoryTransaction({
      userId: USER_ID, command, idempotencyKey: "merge-" + RUN_ID + "-1",
      expectedRevisionExact: before.revisionExact, expectedStateHash: before.stateHash,
    });
    expect(first.status).toBe("applied");
    const replay = await executeAurionInventoryTransaction({
      userId: USER_ID, command, idempotencyKey: "merge-" + RUN_ID + "-1",
      expectedRevisionExact: "0", expectedStateHash: before.stateHash,
    });
    expect(replay.status).toBe("replay");
    expect(replay.receipt).toEqual(first.receipt);

    const rows = await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID));
    const source = rows.find(row => row.id === sourceId);
    const target = rows.find(row => row.id === targetId);
    expect(source?.quantityExact).toBe("0");
    expect(source?.status).toBe("consumed");
    expect(target?.quantityExact).toBe("12");
    expect((await db.select().from(playerProfiles).where(eq(playerProfiles.userId, USER_ID)))[0]?.inventoryRevisionExact).toBe("1");
  });

  it("serializes concurrent identical commands and rejects stale non-idempotent work", async () => {
    const db = await dbRef();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const sourceId = "concurrent-" + RUN_ID + "-source";
    const targetId = "concurrent-" + RUN_ID + "-target";
    await db.insert(aurionItemInstancesV2).values([
      v2Item(sourceId, USER_ID, "loot-" + RUN_ID + "-con-source", "4"),
      v2Item(targetId, USER_ID, "loot-" + RUN_ID + "-con-target", "3"),
    ]);
    const before = await readAurionInventorySnapshot(USER_ID);
    const command = { operation: "merge" as const, sourceStackId: sourceId, targetStackId: targetId, quantityExact: "4" };
    const attempts = await Promise.all([
      executeAurionInventoryTransaction({ userId: USER_ID, command, idempotencyKey: "con-" + RUN_ID + "-same", expectedRevisionExact: before.revisionExact, expectedStateHash: before.stateHash }),
      executeAurionInventoryTransaction({ userId: USER_ID, command, idempotencyKey: "con-" + RUN_ID + "-same", expectedRevisionExact: before.revisionExact, expectedStateHash: before.stateHash }),
    ]);
    expect(attempts.filter(result => result.status === "applied")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "replay")).toHaveLength(1);

    await expect(executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: targetId, quantityExact: "1" },
      idempotencyKey: "stale-" + RUN_ID,
      expectedRevisionExact: before.revisionExact,
      expectedStateHash: before.stateHash,
    })).rejects.toThrow("INVENTORY_STALE_REVISION");
  });

  it("fails closed on conflicting idempotency and rolls back item writes", async () => {
    const db = await dbRef();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const sourceId = "rollback-" + RUN_ID + "-source";
    await db.insert(aurionItemInstancesV2).values([v2Item(sourceId, USER_ID, "loot-" + RUN_ID + "-rollback", "10")]);
    const before = await readAurionInventorySnapshot(USER_ID);
    await expect(executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: sourceId, quantityExact: "2" },
      idempotencyKey: "rollback-" + RUN_ID,
      expectedRevisionExact: before.revisionExact,
      expectedStateHash: before.stateHash,
      testFailurePoint: "afterItemWrites",
    })).rejects.toThrow("INVENTORY_TEST_ROLLBACK");

    expect(await readAurionInventorySnapshot(USER_ID)).toEqual(before);
    expect((await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, sourceId)))[0]?.quantityExact).toBe("10");

    const applied = await executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: sourceId, quantityExact: "2" },
      idempotencyKey: "conflict-" + RUN_ID,
      expectedRevisionExact: before.revisionExact,
      expectedStateHash: before.stateHash,
    });
    expect(applied.status).toBe("applied");
    await expect(executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: sourceId, quantityExact: "3" },
      idempotencyKey: "conflict-" + RUN_ID,
      expectedRevisionExact: applied.state.revisionExact,
      expectedStateHash: applied.receipt.afterStateHash,
    })).rejects.toThrow("INVENTORY_IDEMPOTENCY_CONFLICT");
  });

  it("splits deterministically, preserves provenance, supports legacy consume, and rejects foreign ownership", async () => {
    const db = await dbRef();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const splitSourceId = "split-" + RUN_ID + "-source";
    await db.insert(aurionItemInstancesV2).values([v2Item(splitSourceId, USER_ID, "loot-" + RUN_ID + "-split", "10")]);
    const otherId = "foreign-" + RUN_ID;
    await db.insert(aurionItemInstancesV2).values([v2Item(otherId, OTHER_USER_ID, "loot-" + RUN_ID + "-foreign", "2")]);

    const before = await readAurionInventorySnapshot(USER_ID);
    const result = await executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "split", sourceStackId: splitSourceId, quantityExact: "4" },
      idempotencyKey: "split-" + RUN_ID,
      expectedRevisionExact: before.revisionExact,
      expectedStateHash: before.stateHash,
    });
    expect(result.status).toBe("applied");
    const v2Rows = await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER_ID));
    const splitRows = v2Rows.filter(row => row.id === splitSourceId || row.inventoryReceiptId === result.receipt.receiptId);
    expect(splitRows).toHaveLength(2);
    expect(splitRows.reduce((sum, row) => sum + BigInt(row.quantityExact), 0n)).toBe(10n);
    expect(splitRows.every(row => row.provenanceHash === result.state.stacks.find(stack => stack.id === row.id)?.provenanceHash)).toBe(true);

    const foreignSnapshot = await readAurionInventorySnapshot(USER_ID);
    await expect(executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: otherId, quantityExact: "1" },
      idempotencyKey: "foreign-" + RUN_ID,
      expectedRevisionExact: foreignSnapshot.revisionExact,
      expectedStateHash: foreignSnapshot.stateHash,
    })).rejects.toThrow("OWNED_ITEM_REQUIRED");

    const legacyId = "legacy-" + RUN_ID;
    await db.insert(itemInstances).values({
      id: legacyId, ownerUserId: USER_ID, sourceKind: "loot", lootReceiptId: "legacy-loot-" + RUN_ID,
      craftingReceiptId: null, craftingOutputKey: "base", baseItemKey: "legacy_material",
      quality: "normal", itemLevel: 1, affixesJson: "[]", setKey: null, status: "owned",
      quantityExact: "1", maxQuantityExact: "1", mergeKey: "legacy:" + legacyId,
      provenanceHash: "sha256:legacy-test-provenance",
    });
    const legacyBefore = await readAurionInventorySnapshot(USER_ID);
    const consumed = await executeAurionInventoryTransaction({
      userId: USER_ID,
      command: { operation: "consume", sourceStackId: legacyId, quantityExact: "1" },
      idempotencyKey: "legacy-consume-" + RUN_ID,
      expectedRevisionExact: legacyBefore.revisionExact,
      expectedStateHash: legacyBefore.stateHash,
    });
    expect(consumed.status).toBe("applied");
    expect((await db.select().from(itemInstances).where(eq(itemInstances.id, legacyId)))[0]?.status).toBe("consumed");
  });

  it("reloads the canonical inventory with the same deterministic hash", async () => {
    const first = await readAurionInventorySnapshot(USER_ID);
    const second = await readAurionInventorySnapshot(USER_ID);
    expect(second).toEqual(first);
  });
});
