import { describe, expect, it } from "vitest";
import { buildWorldVisualOverrideReadback } from "./worldVisualOverridePersistence";

// Review (Devin on 7402762b): the per-placement head join has no ORDER BY, and
// `revisions` followed the row order, so identical data produced different hashes and
// every client refresh rebuilt the projection.
describe("world visual override readback fingerprint", () => {
  const heads = [
    { placementRef: "uploaded:0:0:2", targetKind: "uploaded_anchor" as const, assetId: "glb_house_new", revision: 3 },
    { placementRef: "authored:admin.placements.1a2b3c4d:p.0123456789ab", targetKind: "authored_placement" as const, assetId: null, revision: 2 },
    { placementRef: "uploaded:-1:4:0", targetKind: "uploaded_anchor" as const, assetId: "glb_well", revision: 1 },
    { placementRef: "uploaded:fixed.aurion.village-fountain.v1", targetKind: "uploaded_anchor" as const, assetId: "glb_fountain", revision: 7 },
  ];
  const permutations = <T,>(items: T[]): T[][] => items.length <= 1 ? [items] : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]));

  it("is identical for every database row order", () => {
    const readbacks = permutations(heads).map(order => buildWorldVisualOverrideReadback("w", order));
    expect(new Set(readbacks.map(readback => readback.readbackHash)).size).toBe(1);
    expect(new Set(readbacks.map(readback => JSON.stringify(readback))).size).toBe(1);
    const [first] = readbacks;
    expect(Object.keys(first!.revisions)).toEqual([...Object.keys(first!.revisions)].sort());
    // Restored placements keep their revision but render the original.
    expect(first!.revisions["authored:admin.placements.1a2b3c4d:p.0123456789ab"]).toBe(2);
    expect(first!.overrides.map(entry => entry.placementRef)).not.toContain("authored:admin.placements.1a2b3c4d:p.0123456789ab");
  });

  it("changes when the data changes", () => {
    const base = buildWorldVisualOverrideReadback("w", heads).readbackHash;
    expect(buildWorldVisualOverrideReadback("w", heads.map(head => head.revision === 1 ? { ...head, revision: 2, assetId: "glb_other" } : head)).readbackHash).not.toBe(base);
  });
});
