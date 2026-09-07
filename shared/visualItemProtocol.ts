import { z } from "zod";

export const VISUAL_ITEM_DESCRIPTOR_VERSION = "aurion-item-visual.v1" as const;

export const visualItemCategories = ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"] as const;
export const visualEquipmentSlots = ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"] as const;
export const visualItemQualities = ["normal", "magic", "rare", "set", "unique", "mythic"] as const;
export const visualAffixSlots = ["prefix", "suffix", "implicit", "corruption", "craft"] as const;
export const visualMaterialIds = ["rustic_iron", "star_iron", "verdant_fiber", "echo_clay", "lumen_resin", "damascus_steel", "obsidian", "celestial_gold", "bloodstone", "astral_silver"] as const;
export const visualVariantThemes = ["rustic", "starforged", "emberguard", "royal", "ancient"] as const;

export const visualItemCategorySchema = z.enum(visualItemCategories);
export const visualEquipmentSlotSchema = z.enum(visualEquipmentSlots);
export const visualItemQualitySchema = z.enum(visualItemQualities);
export const visualAffixSlotSchema = z.enum(visualAffixSlots);
export const visualMaterialIdSchema = z.enum(visualMaterialIds);
export const visualVariantThemeSchema = z.enum(visualVariantThemes);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const canonicalVisualMetadataSchema = z.object({
  itemDefinitionId: z.string().min(1).max(160),
  materialId: visualMaterialIdSchema.nullable(),
  appearanceId: z.string().min(1).max(160).nullable(),
  materialVariant: z.string().min(1).max(160).nullable(),
  variantTheme: visualVariantThemeSchema.nullable(),
  glbAssetId: z.string().min(1).max(160).nullable(),
}).strict();
export type CanonicalVisualMetadata = z.infer<typeof canonicalVisualMetadataSchema>;

export const visualItemAffixSchema = z.object({
  id: z.string().min(1).max(160),
  slot: visualAffixSlotSchema,
  groupId: z.string().min(1).max(160),
}).strict();

export const visualItemDescriptorSchema = z.object({
  version: z.literal(VISUAL_ITEM_DESCRIPTOR_VERSION),
  itemDefinitionId: z.string().min(1).max(160),
  familyId: z.string().min(1).max(160),
  category: visualItemCategorySchema,
  equipmentSlot: visualEquipmentSlotSchema.nullable(),
  quality: visualItemQualitySchema,
  affixes: z.array(visualItemAffixSchema).max(5),
  setId: z.string().min(1).max(160).nullable(),
  visual: canonicalVisualMetadataSchema.nullable(),
  source: z.object({
    lootReceiptId: z.string().min(1).max(160),
    contextHash: sha256Schema,
    deterministicHash: sha256Schema,
    visualEventIndex: z.number().int().nonnegative(),
  }).strict(),
  visualSeed: sha256Schema,
}).strict();

type ParsedVisualItemDescriptor = z.infer<typeof visualItemDescriptorSchema>;
export type VisualItemDescriptor = Readonly<
  Omit<ParsedVisualItemDescriptor, "affixes" | "visual" | "source"> & {
    affixes: readonly Readonly<ParsedVisualItemDescriptor["affixes"][number]>[];
    visual: Readonly<NonNullable<ParsedVisualItemDescriptor["visual"]>> | null;
    source: Readonly<ParsedVisualItemDescriptor["source"]>;
  }
>;
