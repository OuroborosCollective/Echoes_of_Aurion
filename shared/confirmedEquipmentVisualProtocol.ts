import { z } from "zod";
import { glbEquipmentSlots, type GlbEquipmentSlot } from "./glbImportContract";
import { itemRecordVersionSchema, uiSlots } from "./playerUiProtocol";
import { visualItemDescriptorSchema } from "./visualItemProtocol";

export const CONFIRMED_EQUIPMENT_VISUAL_VERSION = "aurion-equipment-visuals.v2" as const;

export const uiEquipmentVisualSlot = Object.freeze({
  main_hand: "weapon",
  off_hand: "shield",
  focus: "shield",
  head: "helmet",
  chest: "chest",
  hands: "arms",
  legs: "legs",
  feet: "boots",
} satisfies Partial<Record<(typeof uiSlots)[number], GlbEquipmentSlot>>);

const confirmedEquipmentBaseSchema = z.object({
  uiSlot: z.enum(uiSlots),
  equipmentSlot: z.enum(glbEquipmentSlots),
  itemId: z.string().min(1).max(64),
  definition: z.string().min(1).max(160),
  receiptId: z.string().min(1).max(128),
}).strict();

export const confirmedV2EquipmentVisualSchema = confirmedEquipmentBaseSchema.extend({
  version: z.literal("aurion_v2"),
  visualDescriptor: visualItemDescriptorSchema,
}).superRefine((value, context) => {
  if (value.visualDescriptor.itemDefinitionId !== value.definition) {
    context.addIssue({ code: "custom", message: "V2 visual definition mismatch" });
  }
  if (value.visualDescriptor.source.lootReceiptId !== value.receiptId) {
    context.addIssue({ code: "custom", message: "V2 visual receipt mismatch" });
  }
});

export const compatibleEquipmentVisualSchema = confirmedEquipmentBaseSchema.extend({
  version: itemRecordVersionSchema.exclude(["aurion_v2"]),
  visualDescriptor: z.null(),
});

export const confirmedEquipmentVisualSchema = z.union([
  confirmedV2EquipmentVisualSchema,
  compatibleEquipmentVisualSchema,
]);

export const confirmedEquipmentVisualReadbackSchema = z.object({
  version: z.literal(CONFIRMED_EQUIPMENT_VISUAL_VERSION),
  userId: z.number().int().positive(),
  equipment: z.array(confirmedEquipmentVisualSchema).max(12),
}).strict().superRefine((value, context) => {
  const slots = new Set<string>();
  for (const entry of value.equipment) {
    if (slots.has(entry.equipmentSlot)) context.addIssue({ code: "custom", message: "Duplicate equipment visual slot" });
    slots.add(entry.equipmentSlot);
  }
});

export type ConfirmedEquipmentVisual = z.infer<typeof confirmedEquipmentVisualSchema>;
export type ConfirmedV2EquipmentVisual = z.infer<typeof confirmedV2EquipmentVisualSchema>;
export type ConfirmedEquipmentVisualReadback = z.infer<typeof confirmedEquipmentVisualReadbackSchema>;
