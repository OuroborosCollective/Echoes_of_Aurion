import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey } from "./aurionInventoryStackIdentity";
const suite = process.env.AURION_MANIPULATION_HTTP_E2E === "1" ? describe : describe.skip;

suite("AIM-535 compiled HTTP runtime", () => {
  it("authenticates, crafts, replays and independently reads the canonical item and receipt", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_ui_test") throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    const endpoint = "http://127.0.0.1:3000/api/trpc/";
    let cookie = "";
    const rpc = async (procedure: string, input?: unknown) => {
      const response = await fetch(endpoint + procedure, { method: input === undefined ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: input === undefined ? undefined : JSON.stringify({ json: input }) });
      const next = response.headers.getSetCookie();
      if (next.length) cookie = next.map(value => value.split(";")[0]).join("; ");
      const body = await response.json() as { error?: unknown; result: { data: { json: any } } };
      expect(body.error).toBeUndefined();
      expect(response.ok).toBe(true);
      return body.result.data.json;
    };
    const denied = await fetch(endpoint + "crafting.manipulationRead");
    expect(denied.status).toBe(401);
    const user = await rpc("auth.registerLocal", { handle: `aim535_${process.env.AURION_TEST_SOURCE_SHA!.slice(0, 8)}`, password: "Aurion-isolated-535-test-only!" });
    await rpc("player.me");
    const materialId = `aim535-http-${user.id}-iron`;
    const shape = { definitionId: "component-craft-star-iron-v2", category: "crafting_component", equipmentSlot: null, quality: "normal", levelExact: "1", affixesJson: "[]", setId: null, itemPower: 5 };
    const pool = createPool(process.env.DATABASE_URL!);
    try {
      await pool.execute("INSERT INTO aurionItemInstancesV2 (id,ownerUserId,lootReceiptId,baseItemDefinitionId,category,quality,itemLevelExact,affixesJson,itemPower,deterministicHash,quantityExact,maxQuantityExact,mergeKey,provenanceHash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [materialId, user.id, `loot-${materialId}`, shape.definitionId, shape.category, shape.quality, shape.levelExact, shape.affixesJson, shape.itemPower, "a".repeat(64), "2", inventoryMaxQuantityExact(shape), inventoryMergeKey(shape), inventoryItemShapeHash(shape)]);
      const before = await rpc("crafting.manipulationRead");
      const command = { recipeId: "aurion-craft-v2", materialItemIds: [materialId], idempotencyKey: "aim535-http-craft", expectedRevisionExact: before.inventory.revisionExact, expectedStateHash: before.inventory.stateHash };
      const first = await rpc("crafting.manipulate", command);
      expect(first.applied).toBe(true);
      const replay = await rpc("crafting.manipulate", command);
      expect(replay.applied).toBe(false);
      expect(replay.result).toEqual(first.result);
      const after = await rpc("crafting.manipulationRead");
      const ui = await rpc("player.ui");
      expect(after.inventory.stateHash).toBe(first.afterStateHash);
      expect(after.receipts.some((receipt: any) => receipt.id === first.receipt.id)).toBe(true);
      expect(ui.items.some((item: any) => item.id === first.outputs[0].id && item.receiptId === first.receipt.id)).toBe(true);
      const [rows] = await pool.query<any[]>("SELECT quantityExact,status FROM aurionItemInstancesV2 WHERE id=?", [materialId]);
      expect(rows[0]).toMatchObject({ quantityExact: "0", status: "consumed" });
      console.log(JSON.stringify({ recordType: "aurion.aim535.http-readback.v2", sourceRevision: process.env.AURION_TEST_SOURCE_SHA, receiptId: first.receipt.id, stateHash: after.inventory.stateHash, replayApplied: replay.applied }));
    } finally { await pool.end(); }
  }, 30_000);
});
