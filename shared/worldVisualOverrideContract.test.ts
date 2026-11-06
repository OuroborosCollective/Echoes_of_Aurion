import { describe, expect, it } from "vitest";
import { authoredPlacementRef, worldVisualTargetKind, WorldVisualOverrideSetInput } from "./worldVisualOverrideContract";

// Review (Devin, CodeRabbit): two valid 96-character World Design keys produced a
// reference beyond the bound; authoredPlacementRef threw and the frame loop stopped.
describe("authored placement references", () => {
  const canonical = (prefix: string, length: number) => `${prefix}${"x".repeat(length - 1)}`;

  it("stays bounded, valid and never throws for every valid key length", () => {
    for (const designLength of [3, 40, 80, 96]) {
      for (const placementLength of [3, 40, 80, 96]) {
        const ref = authoredPlacementRef(canonical("d", designLength), canonical("p", placementLength));
        expect(ref.length).toBeLessThanOrEqual(160);
        expect(worldVisualTargetKind(ref)).toBe("authored_placement");
        expect(WorldVisualOverrideSetInput.safeParse({ placementRef: ref, assetId: null, expectedRevision: 0 }).success).toBe(true);
      }
    }
  });

  it("keeps short keys readable and admin placement references stable", () => {
    expect(authoredPlacementRef("admin.placements.1a2b3c4d", "p.0123456789ab")).toBe("authored:admin.placements.1a2b3c4d:p.0123456789ab");
  });

  it("distinguishes key pairs that would concatenate to the same direct reference", () => {
    const left = authoredPlacementRef("a:b", "cde");
    const right = authoredPlacementRef("a", "b:cde");
    expect(left).not.toBe(right);
    expect(left).toMatch(/^authored:sha256\.[a-f0-9]{40}$/);
    // A direct reference always has at least two ':'; the digest form exactly one.
    expect(authoredPlacementRef("abc", "def").split(":")).toHaveLength(3);
    expect(left.split(":")).toHaveLength(2);
  });

  it("is deterministic across calls (the override must find the same placement again)", () => {
    const long = [canonical("d", 96), canonical("p", 96)] as const;
    expect(authoredPlacementRef(...long)).toBe(authoredPlacementRef(...long));
    expect(authoredPlacementRef(...long)).not.toBe(authoredPlacementRef(canonical("d", 96), canonical("q", 96)));
  });
});
