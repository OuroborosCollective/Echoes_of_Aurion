import { expect, test, type Page } from "@playwright/test";
import { createPool } from "mysql2/promise";
import { createHash } from "node:crypto";
import { aurionLootCatalogV2 } from "../server/aurionLootCatalog";
import { lootItemPower } from "../server/aurionLootProtocol";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey } from "../server/aurionInventoryStackIdentity";

test.skip(process.env.AURION_UI_E2E !== "1", "Isolated authenticated runtime required");

async function rpc<T>(page: Page, procedure: string, input?: unknown): Promise<T> {
  const response = input === undefined
    ? await page.request.get(`/api/trpc/${procedure}`)
    : await page.request.post(`/api/trpc/${procedure}`, { data: { json: input } });
  const body = await response.json();
  expect(body.error).toBeUndefined();
  expect(response.ok()).toBe(true);
  return body.result.data.json;
}

test("authenticated inventory projection preserves quantities, equipment, and stale revision rejection", async ({ page }) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || (!dbUrl.includes("/aurion_ui_test") && !dbUrl.includes("/aurion_group_test"))) {
    throw new Error(`Isolated MariaDB database required, got: ${dbUrl}`);
  }
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const auth = page.getByRole("dialog");
    await auth.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    const handle = `issue502_${Date.now()}`;
    await auth.getByLabel("Rufname", { exact: true }).fill(handle);
    await auth.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-ui-regression!");
    await auth.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });

    // Establish the profile through the canonical account read before inventory commands.
    await rpc(page, "player.me");
    const initial = await rpc<{ userId: number; items: Array<{ id: string; quantityExact?: string }> }>(page, "player.ui");
    const userId = initial.userId;
    const sourceId = `issue502-${Date.now()}-source`;
    const materialDefinition = aurionLootCatalogV2.baseItems.find(base => base.id === "component-craft-star-iron-v2")!;
    const shape = {
      definitionId: materialDefinition.id,
      category: materialDefinition.category,
      equipmentSlot: null,
      quality: "normal",
      levelExact: "1",
      affixesJson: "[]",
      setId: null,
      itemPower: lootItemPower(materialDefinition, []),
    };
    await pool.execute(
      `INSERT INTO aurionItemInstancesV2
       (id, ownerUserId, lootReceiptId, inventoryReceiptId, originItemId, baseItemDefinitionId, category, equipmentSlot,
        quality, itemLevelExact, affixesJson, setId, itemPower, deterministicHash, quantityExact, maxQuantityExact,
        mergeKey, provenanceHash, status)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'owned')`,
      [sourceId, userId, `issue502-loot-${Date.now()}`, shape.definitionId, shape.category, shape.quality, shape.levelExact,
        shape.affixesJson, shape.itemPower, createHash("sha256").update(sourceId).digest("hex"), "10", inventoryMaxQuantityExact(shape),
        inventoryMergeKey(shape), inventoryItemShapeHash(shape)],
    );
    const equipmentId = `issue502-${Date.now()}-equipment`;
    const equipmentDefinition = aurionLootCatalogV2.baseItems.find(base => base.id === "weapon-blade-v2")!;
    const equipmentShape = {
      definitionId: "weapon-blade-v2",
      category: "weapon" as const,
      equipmentSlot: "main_hand" as const,
      quality: "rare" as const,
      levelExact: "1",
      affixesJson: "[]",
      setId: null,
      itemPower: lootItemPower(equipmentDefinition, []),
    };
    await pool.execute(
      `INSERT INTO aurionItemInstancesV2
       (id, ownerUserId, lootReceiptId, inventoryReceiptId, originItemId, baseItemDefinitionId, category, equipmentSlot,
        quality, itemLevelExact, affixesJson, setId, itemPower, deterministicHash, quantityExact, maxQuantityExact,
        mergeKey, provenanceHash, status)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, '1', '1', ?, ?, 'owned')`,
      [equipmentId, userId, `issue502-equipment-loot-${Date.now()}`, equipmentShape.definitionId, equipmentShape.category,
        equipmentShape.equipmentSlot, equipmentShape.quality, equipmentShape.levelExact, equipmentShape.affixesJson,
        equipmentShape.itemPower, createHash("sha256").update(equipmentId).digest("hex"), inventoryMergeKey(equipmentShape), inventoryItemShapeHash(equipmentShape)],
    );

    const before = await rpc<{ revisionExact: string; stateHash: string; stacks: Array<{ id: string; quantityExact: string }> }>(page, "player.inventoryState");
    const command = { operation: "split", sourceStackId: sourceId, quantityExact: "4", idempotencyKey: `issue502-${Date.now()}`, expectedRevisionExact: before.revisionExact, expectedStateHash: before.stateHash };
    const applied = await rpc<{ status: string; state: typeof before }>(page, "player.inventoryTransaction", command);
    expect(applied.status).toBe("applied");
    expect(before.stacks.reduce((sum, stack) => sum + BigInt(stack.quantityExact), 0n)).toBe(11n);
    expect(applied.state.stacks.reduce((sum, stack) => sum + BigInt(stack.quantityExact), 0n)).toBe(11n);

    const projection = await rpc<{ items: Array<{ id: string; quantityExact?: string }> }>(page, "player.ui");
    expect(projection.items.find(item => item.id === sourceId)?.quantityExact).toBe("6");
    expect(projection.items.some(item => item.quantityExact === "4")).toBe(true);

    const splitStack = applied.state.stacks.find(stack => stack.id !== sourceId && stack.id !== equipmentId && stack.quantityExact === "4");
    expect(splitStack).toBeDefined();

    const beforeMerge = await rpc<{ revisionExact: string; stateHash: string; stacks: Array<{ id: string; quantityExact: string }> }>(page, "player.inventoryState");
    const mergeCommand = {
      operation: "merge",
      sourceStackId: splitStack!.id,
      targetStackId: sourceId,
      quantityExact: "4",
      idempotencyKey: `issue502-merge-${Date.now()}`,
      expectedRevisionExact: beforeMerge.revisionExact,
      expectedStateHash: beforeMerge.stateHash,
    };
    const mergeApplied = await rpc<{ status: string; state: typeof beforeMerge }>(page, "player.inventoryTransaction", mergeCommand);
    expect(mergeApplied.status).toBe("applied");
    expect(mergeApplied.state.stacks.find(stack => stack.id === sourceId)?.quantityExact).toBe("10");

    const mergeReplay = await rpc<{ status: string; state: typeof beforeMerge }>(page, "player.inventoryTransaction", mergeCommand);
    expect(mergeReplay.status).toBe("replay");
    expect(mergeReplay.state.stacks.find(stack => stack.id === sourceId)?.quantityExact).toBe("10");

    await rpc(page, "player.equipItem", { id: equipmentId, version: "aurion_v2", expectedItem: null });
    expect((await rpc<{ items: Array<{ id: string; status: string }> }>(page, "player.ui")).items.find(item => item.id === equipmentId)?.status).toBe("equipped");
    await rpc(page, "player.unequipItem", { id: equipmentId, version: "aurion_v2" });
    expect((await rpc<{ items: Array<{ id: string; status: string }> }>(page, "player.ui")).items.find(item => item.id === equipmentId)?.status).toBe("owned");

    await expect(rpc(page, "player.inventoryTransaction", { ...command, idempotencyKey: `issue502-stale-${Date.now()}` })).rejects.toThrow();

    await page.screenshot({ path: "test-results/issue-502-authenticated-inventory.png", fullPage: true });
  } finally {
    await pool.end();
  }
});
