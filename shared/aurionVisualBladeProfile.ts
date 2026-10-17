/** Presentation-only blade silhouettes. Never derives equipment stats or item identity. */
export const VISUAL_BLADE_PROFILE_RULESET = "aurion.visual-blade-profile.v1" as const;
export type VisualBladeProfile = "broadsword" | "flamberge" | "falchion" | "runic_cleaver" | "wooden_macuahuitl";
export type BladePoint = readonly [x: number, y: number];

export function resolveBladeProfile(input: Readonly<{ materialId: string | null; silhouetteVariant: number }>): VisualBladeProfile {
  if (!Number.isSafeInteger(input.silhouetteVariant) || input.silhouetteVariant < 0 || input.silhouetteVariant > 15) {
    throw new Error("BLADE_PROFILE_SEED_INVALID");
  }
  if (input.materialId === "verdant_fiber" || input.materialId === "lumen_resin") {
    return input.silhouetteVariant % 2 === 0 ? "wooden_macuahuitl" : "falchion";
  }
  if (input.materialId === "obsidian" || input.materialId === "echo_clay" || input.materialId === "bloodstone") {
    return input.silhouetteVariant % 2 === 0 ? "runic_cleaver" : "falchion";
  }
  return (["broadsword", "flamberge", "falchion", "runic_cleaver"] as const)[input.silhouetteVariant % 4];
}

/** Closed by the caller. Coordinates are metres in the existing weapon-grip XY plane. */
export function bladeProfileOutline(profile: VisualBladeProfile): readonly BladePoint[] {
  let points: BladePoint[];
  if (profile === "broadsword") {
    points = [[-0.075, 0], [-0.075, 0.84], [-0.055, 1.02], [0, 1.16], [0.055, 1.02], [0.075, 0.84], [0.075, 0]];
  } else if (profile === "falchion") {
    points = [[-0.055, 0], [-0.045, 0.35], [-0.085, 0.86], [-0.14, 1.07], [0.015, 1.16], [0.12, 1.03], [0.095, 0.84], [0.055, 0.15], [0.055, 0]];
  } else if (profile === "runic_cleaver") {
    points = [[-0.09, 0], [-0.115, 0.75], [-0.13, 1.09], [-0.075, 1.16], [0.09, 1.16], [0.13, 1.03], [0.115, 0.75], [0.09, 0]];
  } else if (profile === "wooden_macuahuitl") {
    const edge: BladePoint[] = [[-0.075, 0]];
    for (let i = 1; i <= 8; i += 1) {
      edge.push([i % 2 === 0 ? -0.075 : -0.135, i * 0.125]);
    }
    points = [...edge, [-0.075, 1.14], [0.075, 1.14], ...edge.slice(1).reverse().map(([x, y]): BladePoint => [-x, y]), [0.075, 0]];
  } else {
    const edge: BladePoint[] = [[-0.075, 0]];
    for (let i = 1; i <= 8; i += 1) {
      const taper = 1 - i / 40;
      edge.push([-0.075 * taper + (i % 2 === 0 ? 0.01 : -0.022), i * 0.132]);
    }
    points = [...edge, [0, 1.16], ...edge.slice(1).reverse().map(([x, y]): BladePoint => [-x, y]), [0.075, 0]];
  }
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}
