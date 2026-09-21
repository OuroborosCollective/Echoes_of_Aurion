import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATIC_GLB_FALLBACK_CONFIRMATION,
  automaticGlbFallbackReconcileInputSchema,
  reconcileAutomaticGlbFallback,
  scanAutomaticGlbFallback,
} from "./automaticGlbFallback";
import type { GlbRuntimeCatalog } from "../shared/glbImportContract";

const sha = (ch: string) => ch.repeat(64);
function catalog(entries: any[], revision = sha("a")): GlbRuntimeCatalog {
  return { version: "aurion.glb-import.v1", revision, entries } as GlbRuntimeCatalog;
}
function entryForGap(gap: any, index: number) {
  const purpose = gap.assignmentTarget ? "enemy-fallback" : gap.purpose;
  return {
    assetId: `glb_satisfied_${index}`,
    sha256: sha(((index % 6) + 1).toString()),
    displayName: `Satisfied ${gap.id}`,
    assetType: gap.need.assetType,
    storageUrl: `/api/assets/glb/${sha(((index % 6) + 1).toString())}.glb`,
    targetKey: gap.assignmentTarget,
    purpose,
    subcategory: gap.need.subcategory ?? (gap.need.rejectSubcategory ? "rigged-monster" : null),
    equipmentSlot: gap.need.equipmentSlot ?? null,
  };
}

describe("automatic GLB fallback reconciliation", () => {
  it("scans the complete canonical gap set deterministically with a stable metadata tie break", async () => {
    const search = vi.fn((input: any) => ({
      schemaVersion: "aurion.os3a-fallback-search.v1",
      query: input.query,
      tier: "phone",
      source: {},
      matches: [
        { sourceAssetId: "candidate-b", projectId: "pm-test", name: "B", fileSize: 100, attributes: {}, semanticScore: 10, tier: "phone", transferBudgetBytes: 8 * 1024 * 1024, transferBudgetFit: true, discoveryOnly: false, discoveryNote: null, classificationStatus: "requires-pinned-byte-plan" },
        { sourceAssetId: "candidate-c", projectId: "pm-test", name: "C", fileSize: 110, attributes: {}, semanticScore: 8, tier: "phone", transferBudgetBytes: 8 * 1024 * 1024, transferBudgetFit: true, discoveryOnly: false, discoveryNote: null, classificationStatus: "requires-pinned-byte-plan" },
      ],
    } as any));
    const first = await scanAutomaticGlbFallback({ catalog: async () => catalog([]), search });
    const second = await scanAutomaticGlbFallback({ catalog: async () => catalog([]), search });
    expect(first).toEqual(second);
    expect(first.requirementCount).toBe(18);
    expect(first.missingCount).toBe(18);
    expect(first.policy).toMatchObject({ mode: "BATCH_AUTOMATIC_MISSING_ONLY", overwriteExisting: false, targetTier: "phone" });
    expect(first.gaps.every(gap => gap.selectedCandidate?.sourceAssetId === "candidate-b")).toBe(true);
    expect(first.gaps.every(gap => gap.selectedCandidate?.scoreMargin === 2)).toBe(true);
  });

  it("fills only the missing requirement and never invokes assignment for already-filled targets", async () => {
    const definition = await scanAutomaticGlbFallback({
      catalog: async () => catalog([]),
      search: (() => ({ matches: [] })) as any,
    });
    const missingId = "world:nature:tree";
    let entries = definition.gaps.filter(gap => gap.id !== missingId).map(entryForGap);
    let revision = sha("b");
    const catalogReader = async () => catalog(entries, revision);
    const search = vi.fn((input: any) => ({
      matches: input.query.includes("tree")
        ? [{ sourceAssetId: "tree-source", projectId: "pm-test", name: "Oak", fileSize: 100, attributes: {}, semanticScore: 21, tier: "phone", transferBudgetBytes: 8 * 1024 * 1024, transferBudgetFit: true, discoveryOnly: false, discoveryNote: null, classificationStatus: "requires-pinned-byte-plan" }]
        : [],
    } as any));
    const plan = vi.fn(async () => ({
      planSha256: sha("c"),
      classification: { assetType: "arena", subcategory: "tree", equipmentSlot: null, worldFamily: "nature", lod: null },
    } as any));
    const apply = vi.fn(async () => {
      const asset = {
        assetId: "glb_tree_auto",
        sha256: sha("d"),
        displayName: "World Nature · tree · Oak",
        assetType: "arena",
        storageUrl: `/api/assets/glb/${sha("d")}.glb`,
        targetKey: null,
        purpose: "world-nature",
        subcategory: "tree",
        equipmentSlot: null,
      };
      entries = [...entries, asset as any];
      revision = sha("e");
      return {
        fallbackPlanSha256: sha("c"),
        source: { sourceSha256: sha("d") },
        admission: { aurionAssetId: "glb_tree_auto" },
      } as any;
    });
    const assign = vi.fn(async () => { throw new Error("assignment must not run"); });
    const receipt = await reconcileAutomaticGlbFallback(7, { confirmation: AUTOMATIC_GLB_FALLBACK_CONFIRMATION }, {
      catalog: catalogReader,
      search,
      plan,
      apply,
      assign,
    });
    expect(receipt.actions).toHaveLength(1);
    expect(receipt.actions[0]).toMatchObject({ requirementId: missingId, aurionAssetId: "glb_tree_auto", replacedExisting: false });
    expect(receipt.remaining).toEqual([]);
    expect(receipt.overwrittenExisting).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("fails closed without the exact batch approval phrase", () => {
    expect(() => automaticGlbFallbackReconcileInputSchema.parse({ confirmation: "AUTO_FILL" })).toThrow();
    expect(automaticGlbFallbackReconcileInputSchema.parse({ confirmation: AUTOMATIC_GLB_FALLBACK_CONFIRMATION }).confirmation)
      .toBe(AUTOMATIC_GLB_FALLBACK_CONFIRMATION);
  });
});
