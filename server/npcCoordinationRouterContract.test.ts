import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("NPC coordination runtime query boundary", () => {
  it("exposes coordination only as a protected read-only gameplay query", () => {
    const router = read("server/routers.ts");
    const start = router.indexOf("npcCoordinationPreview:");
    expect(start).toBeGreaterThan(0);
    const tail = router.slice(start, start + 7_500);
    expect(tail).toContain("protectedProcedure.query");
    expect(tail).toContain("readConfirmedNpcPacket");
    expect(tail).toContain("resolveNpcUtilityDecisionsWithCoordination");
    expect(tail).toContain("mutationAuthority: "none"");
    expect(tail).not.toContain(".mutation(");
    expect(tail).not.toContain("executeConfirmedMerchantAction");
  });

  it("keeps the actual action gateway outside the coordination preview", () => {
    const gateway = read("server/npcActionGatewayPersistence.ts");
    const coordination = read("server/npcCoordinationLaw.ts");
    expect(gateway).toContain("executeConfirmedMerchantAction");
    expect(coordination).not.toContain("executeConfirmedMerchantAction");
    expect(coordination).not.toContain("getDb");
  });
});
