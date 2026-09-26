import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("NPC coordination ownership boundary", () => {
  it("is a pure constraint layer with no persistence, gateway or legacy-donor imports", () => {
    const source = read("server/npcCoordinationLaw.ts");
    expect(source).not.toMatch(/from ["'].*drizzle|from ["']\.\/db|from ["']\.\/npcActionGatewayPersistence/);
    expect(source).not.toContain("executeConfirmedMerchantAction");
    expect(source).not.toContain("planMerchantAction");
    expect(source).not.toContain("vendor/wasd-npc");
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("process.hrtime");
  });

  it("keeps the existing canonical action gateway as the only mutation/effect boundary", () => {
    const gateway = read("server/npcActionGatewayPersistence.ts");
    expect(gateway).toContain("executeConfirmedMerchantAction");
    expect(gateway).toContain("planMerchantAction");
    expect(gateway).toContain("validateMerchantAction");
    expect(gateway).toContain("aurionNpcActionEffectReadbacks");
    expect(gateway).toContain("appendNpcMultiMemory");
  });

  it("documents that coordination output is advisory before any receipt exists", () => {
    const source = read("server/npcCoordinationLaw.ts");
    expect(source).toContain("does not");
    expect(source).toContain("coordination constraint");
    expect(source).toContain("existing Aurion utility planner");
    expect(source).toContain("No database");
  });
});
