import { createHash } from "node:crypto";
import { z } from "zod";
import {
  VISUAL_ITEM_DESCRIPTOR_VERSION,
  canonicalVisualMetadataSchema,
  visualAffixSlotSchema,
  visualEquipmentSlotSchema,
  visualItemCategorySchema,
  visualItemQualitySchema,
} from "./visualItemProtocol";

// ─── Protocol constants ───────────────────────────────────────────────
//
// Issue #527: Visual CAG/Wolfram intelligence boundary.
// The visual recipe is a bounded, presentation-only intermediate
// representation derived from an already-confirmed Aurion visual item
// descriptor. It is the ONLY input CAG/Wolfram/Source Intelligence or
// external literature research may ever inspect. It deliberately carries
// no gameplay statistics (no itemPower, no affix stat values), so this
// boundary can never become a second gameplay authority.

export const AURION_VISUAL_RECIPE_PROTOCOL = "aurion.visual-recipe.v1" as const;
export const AURION_VISUAL_RECIPE_COMPILER_VERSION =
  "aurion.visual-recipe-compiler.v1" as const;

export const VISUAL_RECIPE_HASH_DOMAIN = "aurion.visual.recipe.v1" as const;
export const VISUAL_ANALYSIS_FINGERPRINT_DOMAIN =
  "aurion.visual-cag-analysis-fingerprint.v1" as const;

export const MAX_VISUAL_RECIPE_AFFIXES = 5 as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const identifierSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/);

export const visualRecipeAffixSchema = z
  .object({
    id: z.string().min(1).max(160),
    slot: visualAffixSlotSchema,
    groupId: z.string().min(1).max(160),
  })
  .strict();

export const visualRecipeSchema = z
  .object({
    protocol: z.literal(AURION_VISUAL_RECIPE_PROTOCOL),
    compilerVersion: z.literal(AURION_VISUAL_RECIPE_COMPILER_VERSION),
    descriptorVersion: z.literal(VISUAL_ITEM_DESCRIPTOR_VERSION),
    itemDefinitionId: z.string().min(1).max(160),
    familyId: z.string().min(1).max(160),
    category: visualItemCategorySchema,
    equipmentSlot: visualEquipmentSlotSchema.nullable(),
    quality: visualItemQualitySchema,
    affixes: z.array(visualRecipeAffixSchema).max(MAX_VISUAL_RECIPE_AFFIXES),
    setId: z.string().min(1).max(160).nullable(),
    visual: canonicalVisualMetadataSchema.nullable(),
    /**
     * Read-only binding back to the confirmed gameplay truth. These hashes
     * let analysis EVIDENCE reference the authoritative loot receipt, but
     * they are never written back and never recomputed from analysis output.
     */
    source: z
      .object({
        lootReceiptId: z.string().min(1).max(160),
        contextHash: sha256Schema,
        deterministicHash: sha256Schema,
        visualEventIndex: z.number().int().nonnegative(),
      })
      .strict(),
    visualSeed: sha256Schema,
    /** Content/source revision the recipe was compiled against. */
    sourceRevision: identifierSchema,
  })
  .strict();

type ParsedVisualRecipe = z.infer<typeof visualRecipeSchema>;
export type VisualRecipe = Readonly<
  Omit<ParsedVisualRecipe, "affixes" | "visual" | "source"> & {
    affixes: readonly Readonly<ParsedVisualRecipe["affixes"][number]>[];
    visual: Readonly<NonNullable<ParsedVisualRecipe["visual"]>> | null;
    source: Readonly<ParsedVisualRecipe["source"]>;
  }
>;

export type VisualRecipeCompilation = Readonly<{
  recipe: VisualRecipe;
  /** sha256 over the domain-separated canonical serialization of the recipe. */
  recipeHash: string;
}>;

// ─── Canonical serialization (deterministic, key-sorted) ──────────────

export function canonicalSerializeVisual(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalSerializeVisual).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        key => `${JSON.stringify(key)}:${canonicalSerializeVisual(record[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Domain-separated recipe hash: the ONLY identity analysis may bind to. */
export function hashVisualRecipe(recipe: VisualRecipe): string {
  return sha256Hex(
    `${VISUAL_RECIPE_HASH_DOMAIN}::${canonicalSerializeVisual(recipe)}`
  );
}
