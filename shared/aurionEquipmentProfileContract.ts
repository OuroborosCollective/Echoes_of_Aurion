import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

export const equipmentRevisionSchema = z.string().regex(/^(0|[1-9][0-9]{0,119})$/);
export const equipmentCombatProjectionSchema = z.object({
  weaponEquipped: z.boolean(), weaponBonus: z.number().int().min(0).max(100_000),
  maxHealth: z.number().int().min(1).max(1_000_000),
}).strict();
const reference = z.object({ id: z.string().min(1).max(128), version: z.enum(["ax1_starter", "legacy", "aurion_v2"]) }).strict();
export const equipmentMutationSchema = z.object({
  schema: z.literal("aurion.equipment.mutation.v1"), userId: z.number().int().positive(),
  operation: z.enum(["equip", "unequip"]), item: reference,
  previousRevisionExact: equipmentRevisionSchema, revisionExact: equipmentRevisionSchema,
  previousReceiptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  beforeEquipment: z.array(reference.extend({ slot: z.string().min(1) })),
  afterEquipment: z.array(reference.extend({ slot: z.string().min(1) })),
  beforeProfile: equipmentCombatProjectionSchema, afterProfile: equipmentCombatProjectionSchema,
}).strict();
export type EquipmentMutation = z.infer<typeof equipmentMutationSchema>;
export type EquipmentCombatProjection = z.infer<typeof equipmentCombatProjectionSchema>;
export type EquipmentMutationReceipt = Readonly<{ id: string; hash: string; mutation: EquipmentMutation }>;

export function sealEquipmentMutation(raw: EquipmentMutation): EquipmentMutationReceipt {
  const mutation = equipmentMutationSchema.parse(raw);
  if (BigInt(mutation.revisionExact) !== BigInt(mutation.previousRevisionExact) + 1n) throw new Error("EQUIPMENT_REVISION_GAP");
  const hash = canonicalSha256(mutation);
  return Object.freeze({ id: hash.slice(7), hash, mutation });
}
export function verifyEquipmentMutation(receipt: EquipmentMutationReceipt): EquipmentMutationReceipt {
  const sealed = sealEquipmentMutation(receipt.mutation);
  if (receipt.id !== sealed.id || receipt.hash !== sealed.hash) throw new Error("EQUIPMENT_RECEIPT_HASH_MISMATCH");
  return sealed;
}
