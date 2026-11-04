import { describe, expect, it } from "vitest";
import { worldTableInventorySchema } from "./worldTableInventoryProtocol";

const stock = () => ({ schema: "aurion.worldtable-owned-stock.v1", actorId: "player:7",
  revisionExact: "9007199254740993", stockHash: "sha256:" + "f".repeat(64), mutationAuthority: "none",
  stacks: [{ id: "stock1", version: "legacy", definitionId: "oakwood", quantityExact: "9007199254740993" }] });
describe("public WorldTable stock boundary", () => {
  it("preserves quantities above Number.MAX_SAFE_INTEGER without coercion", () => {
    expect(worldTableInventorySchema.parse(stock()).stacks[0].quantityExact).toBe("9007199254740993");
    for (const quantityExact of [17, "0", "01", "-1", "1e9", "9".repeat(129)]) {
      const input = stock();
      (input.stacks[0] as any).quantityExact = quantityExact;
      expect(worldTableInventorySchema.safeParse(input).success).toBe(false);
    }
  });
  it("rejects ambiguous identities across inventory versions", () => {
    const input = stock();
    input.stacks.push({ ...input.stacks[0], version: "aurion_v2" });
    expect(worldTableInventorySchema.safeParse(input).success).toBe(false);
  });
  it("rejects unbounded or private data instead of stripping it", () => {
    expect(worldTableInventorySchema.safeParse({ ...stock(), warehouseContents: [] }).success).toBe(false);
    const input = stock();
    (input.stacks[0] as any).provenanceHash = "private";
    expect(worldTableInventorySchema.safeParse(input).success).toBe(false);
    expect(worldTableInventorySchema.safeParse({ ...stock(), stacks: Array.from({ length: 257 }, (_, i) => ({ ...stock().stacks[0], id: `item${i}` })) }).success).toBe(false);
  });
});
