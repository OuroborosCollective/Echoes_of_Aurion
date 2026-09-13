import { describe, expect, it } from "vitest";
import { groupGlbCatalogRows } from "./glbCatalogFamilies";

const row = (lod: number, sha: string, targetKey: string | null = null) => ({
  assetId: `glb_${sha.slice(0, 48)}`,
  sha256: sha,
  bytes: 1000 + lod,
  displayName: `World Nature · tree · Ancient Oak LOD${lod}`,
  assetType: "arena" as const,
  storageUrl: `/api/assets/glb/${sha}.glb`,
  targetKey,
});

const sha = (digit: string) => digit.repeat(64);

describe("groupGlbCatalogRows", () => {
  it("collapses four explicit physical LODs into one logical model", () => {
    const catalog = groupGlbCatalogRows([row(2, sha("c")), row(0, sha("a")), row(3, sha("d")), row(1, sha("b"))]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ displayName: "World Nature · tree · Ancient Oak", purpose: "world-nature", subcategory: "tree", sha256: sha("a") });
    expect(catalog[0]!.lods.map(lod => [lod.level, lod.sha256])).toEqual([[0, sha("a")], [1, sha("b")], [2, sha("c")], [3, sha("d")]]);
  });

  it("keeps ordinary single models independent and backward compatible", () => {
    const catalog = groupGlbCatalogRows([{ ...row(0, sha("e")), displayName: "World Nature · tree · Lone Oak" }]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.displayName).toBe("World Nature · tree · Lone Oak");
    expect(catalog[0]!.lods).toEqual([]);
  });

  it("fails visibly on duplicate levels instead of hiding a physical asset", () => {
    const duplicate = { ...row(0, sha("f")), assetId: `glb_${sha("f").slice(0, 48)}` };
    const catalog = groupGlbCatalogRows([row(0, sha("a")), duplicate]);
    expect(catalog).toHaveLength(2);
    expect(catalog.every(entry => entry.displayName.includes("LOD0"))).toBe(true);
  });
});
