import { describe, expect, it } from "vitest";
import { bladeProfileOutline, resolveBladeProfile, type VisualBladeProfile } from "./VisualBladeProfile";

describe("confirmed visual blade profiles", () => {
  it("selects stable metal, organic and lithic silhouettes without changing gameplay", () => {
    expect([0, 1, 2, 3].map(silhouetteVariant =>
      resolveBladeProfile({ materialId: "star_iron", silhouetteVariant })
    )).toEqual(["broadsword", "flamberge", "falchion", "runic_cleaver"]);
    expect(resolveBladeProfile({ materialId: "verdant_fiber", silhouetteVariant: 0 })).toBe("wooden_macuahuitl");
    expect(resolveBladeProfile({ materialId: "lumen_resin", silhouetteVariant: 3 })).toBe("falchion");
    expect(resolveBladeProfile({ materialId: "obsidian", silhouetteVariant: 0 })).toBe("runic_cleaver");
    expect(resolveBladeProfile({ materialId: "echo_clay", silhouetteVariant: 1 })).toBe("falchion");
  });

  it("rejects invalid variants instead of accepting an unbound random seed", () => {
    for (const silhouetteVariant of [-1, 16, 1.5, Infinity, NaN]) {
      expect(() => resolveBladeProfile({ materialId: "star_iron", silhouetteVariant })).toThrow("BLADE_PROFILE_SEED_INVALID");
    }
  });

  it("produces bounded non-degenerate, deterministic and immutable outlines", () => {
    for (const profile of ["broadsword", "flamberge", "falchion", "runic_cleaver", "wooden_macuahuitl"] as const satisfies readonly VisualBladeProfile[]) {
      const outline = bladeProfileOutline(profile);
      expect(Object.isFrozen(outline)).toBe(true);
      expect(outline.length).toBeGreaterThanOrEqual(5);
      expect(outline.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 0.3 && y >= 0 && y <= 1.3)).toBe(true);
      const twiceArea = outline.reduce((sum, [x, y], index) => {
        const next = outline[(index + 1) % outline.length]!;
        return sum + x * next[1] - next[0] * y;
      }, 0);
      expect(Math.abs(twiceArea)).toBeGreaterThan(0.05);
      expect(bladeProfileOutline(profile)).toEqual(outline);
    }
  });
});
