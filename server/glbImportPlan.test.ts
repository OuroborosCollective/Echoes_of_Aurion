import { describe, expect, it } from "vitest";
import { buildGlbImportPlan } from "./glbImportPlan";
import { testGlb } from "./glbImportFixtures";

describe("production GLB import plans", () => {
  it("binds rendered bytes to stable IDs, classification and target independently of names supplied by a client", () => {
    const bytes = testGlb();
    const first = buildGlbImportPlan(bytes.toString("base64"));
    expect(buildGlbImportPlan(bytes.toString("base64"))).toEqual(first);
    expect(first.targetKey).toBe("weapon_spear");
    expect(first.classification.assetType).toBe("weapon");
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(buildGlbImportPlan(testGlb("Aurion_Blade_Weapon").toString("base64")).planSha256).not.toBe(first.planSha256);
  });
  it("rejects external dependencies, invalid geometry bounds and cyclic scene graphs", () => {
    expect(() => buildGlbImportPlan(testGlb(undefined, { images: [{ uri: "https://example.invalid/private" }] }).toString("base64"))).toThrow("GLB_EXTERNAL_RESOURCE");
    expect(() => buildGlbImportPlan(testGlb(undefined, { bufferViews: [{ buffer: 0, byteOffset: -1, byteLength: 36 }] }).toString("base64"))).toThrow("GLB_BUFFER_BOUNDS");
    expect(() => buildGlbImportPlan(testGlb(undefined, { bufferViews: [{ buffer: 0, byteLength: 1000 }] }).toString("base64"))).toThrow("GLB_BUFFER_BOUNDS");
    expect(() => buildGlbImportPlan(testGlb(undefined, { nodes: [{ name: "Spear", mesh: 0, children: [0] }] }).toString("base64"))).toThrow("GLB_SCENE_CYCLE");
  });
  it("leaves ambiguous weapon targets out of automatic placement", () => {
    expect(buildGlbImportPlan(testGlb("Blade_Spear_Weapon").toString("base64")).targetKey).toBeNull();
  });
});
