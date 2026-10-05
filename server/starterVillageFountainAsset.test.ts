import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildGlbImportPlan } from "./glbImportPlan";
import { assetBudgets, inspectGlbAllocation } from "../shared/glbPresentationBudget";
import { AURION_VILLAGE_FOUNTAIN_LODS } from "../shared/aurionVillageFountainContract";

const assetPath = (fileName: string) => `assets/environment/fountain/${fileName}`;

function arrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("owner starter-village fountain assets", () => {
  it("keeps both physical LODs hash-bound, classification-safe and phone-budgeted", async () => {
    const plans = [];
    for (const expected of AURION_VILLAGE_FOUNTAIN_LODS) {
      const bytes = await readFile(assetPath(expected.fileName));
      expect(bytes.length).toBe(expected.bytes);
      const plan = await buildGlbImportPlan(bytes.toString("base64"), "world-environment", expected.fileName);
      expect(plan).toMatchObject({
        sha256: expected.sha256,
        assetId: expected.assetId,
        bytes: expected.bytes,
        assetType: "arena",
        subcategory: "fountain",
        worldFamily: "environment",
      });
      expect(plan.classification).toMatchObject({
        lod: expected.level,
        skinCount: 0,
        animationNames: [],
      });
      expect(plan.normalization.lod).toMatchObject({
        level: expected.level,
        triangleCount: expected.triangles,
      });

      const inspected = inspectGlbAllocation(arrayBuffer(bytes));
      expect(inspected.json.skins ?? []).toHaveLength(0);
      expect(inspected.json.animations ?? []).toHaveLength(0);
      expect(inspected.json.images ?? []).toHaveLength(3);
      expect(inspected.allocation.textureBytes).toBeLessThanOrEqual(assetBudgets.phone.textureBytes);
      expect(inspected.allocation.decodedBytes).toBeLessThanOrEqual(assetBudgets.phone.decodedBytes);
      expect(bytes.length).toBeLessThanOrEqual(assetBudgets.phone.assetBytes);
      plans.push(plan);
    }

    const first = plans[0]!;
    const second = plans[1]!;
    expect(second.normalization.lod.triangleCount).toBeLessThan(first.normalization.lod.triangleCount);
    for (let axis = 0; axis < 3; axis += 1) {
      const firstExtent = first.normalization.normalizedBoundsMm.max[axis]! - first.normalization.normalizedBoundsMm.min[axis]!;
      const secondExtent = second.normalization.normalizedBoundsMm.max[axis]! - second.normalization.normalizedBoundsMm.min[axis]!;
      expect(Math.abs(secondExtent - firstExtent)).toBeLessThanOrEqual(Math.max(50, Math.floor(firstExtent / 10)));
    }
  });
});
