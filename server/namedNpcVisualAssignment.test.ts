import { describe, expect, it } from "vitest";
import { namedNpcVisualInputSchema, namedNpcVisualTargetKey } from "./namedNpcVisualAssignment";

describe("named NPC visual assignment contract", () => {
  it("derives the exact renderer target for Lyra without changing NPC authority", () => {
    expect(namedNpcVisualTargetKey("lyra")).toBe("npc_lyra");
    expect(namedNpcVisualInputSchema.parse({ assetId: "glb_12345678", npcId: "lyra" })).toEqual({
      assetId: "glb_12345678",
      npcId: "lyra",
    });
  });

  it("rejects path-like or whitespace NPC identities before any assignment", () => {
    expect(() => namedNpcVisualTargetKey("../lyra")).toThrow();
    expect(() => namedNpcVisualTargetKey("lyra npc")).toThrow();
  });
});
