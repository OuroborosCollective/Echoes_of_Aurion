import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildGlbImportPlan } from "./glbImportPlan";
import { assetBudgets, inspectGlbAllocation } from "../shared/glbPresentationBudget";
import { AURION_VILLAGE_STREET_LAMP_LODS } from "../shared/aurionVillageStreetLampContract";

const assetPath = (fileName: string) => `assets/environment/street-lamp/${fileName}`;

function arrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("owner starter-village street-lamp assets", () => {
  it("keeps all four physical LODs hash-bound, classification-safe and phone-budgeted", async () => {
    const plans = [];
    for (const expected of AURION_VILLAGE_STREET_LAMP_LODS) {
      const bytes = await readFile(assetPath(expected.fileName));
      expect(bytes.length).toBe(expected.bytes);
      const plan = await buildGlbImportPlan(bytes.toString("base64"), "world-environment", expected.fileName);
      expect(plan).toMatchObject({
        sha256: expected.sha256,
        assetId: expected.assetId,
        bytes: expected.bytes,
        assetType: "arena",
        subcategory: "street-prop",
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

    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1]!;
      const current = plans[index]!;
      expect(current.normalization.lod.triangleCount).toBeLessThan(previous.normalization.lod.triangleCount);
      for (let axis = 0; axis < 3; axis += 1) {
        const previousExtent = previous.normalization.normalizedBoundsMm.max[axis]! - previous.normalization.normalizedBoundsMm.min[axis]!;
        const currentExtent = current.normalization.normalizedBoundsMm.max[axis]! - current.normalization.normalizedBoundsMm.min[axis]!;
        expect(Math.abs(currentExtent - previousExtent)).toBeLessThanOrEqual(Math.max(50, Math.floor(previousExtent / 10)));
      }
    }
  });
});
