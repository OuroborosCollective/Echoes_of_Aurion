import { createHash } from "node:crypto";
import { z } from "zod";
import {
  VISUAL_ITEM_DESCRIPTOR_VERSION,
  visualItemDescriptorSchema,
  type CanonicalVisualMetadata,
  type VisualItemDescriptor,
} from "../shared/visualItemProtocol";
import {
  AURION_LOOT_RULESET_VERSION,
  aurionAffixSlots,
  aurionEquipmentSlots,
  aurionItemCategories,
  aurionLootQualities,
  type DeterministicLootResult,
  type LootBaseDefinition,
} from "./aurionLootProtocol";

const textCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const digest = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const exactLevelSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);

/** Strict parser for the immutable `resolvedJson` stored with aurion-loot.v2 receipts. */
export const storedDeterministicLootResultSchema = z.object({
  itemDefinitionId: z.string().min(1).max(160),
  category: z.enum(aurionItemCategories),
  equipmentSlot: z.enum(aurionEquipmentSlots).optional(),
  quality: z.enum(aurionLootQualities),
  itemLevelExact: exactLevelSchema,
  affixes: z.array(z.object({
    id: z.string().min(1).max(160),
    slot: z.enum(aurionAffixSlots),
    groupId: z.string().min(1).max(160),
    stats: z.record(z.string(), z.number().int().finite()),
  }).strict()).max(5),
  setId: z.string().min(1).max(160).optional(),
  itemPower: z.number().int().nonnegative(),
  contextHash: sha256Schema,
  deterministicHash: sha256Schema,
}).strict();

export function rederiveStoredDeterministicLootHash(loot: Omit<DeterministicLootResult, "deterministicHash">): string {
  return digest(
    AURION_LOOT_RULESET_VERSION,
    loot.contextHash,
    loot.itemDefinitionId,
    loot.quality,
    loot.itemLevelExact,
    ...loot.affixes.flatMap(affix => [
      affix.id,
      affix.slot,
      affix.groupId,
      ...Object.entries(affix.stats)
        .sort(([left], [right]) => textCompare(left, right))
        .map(([stat, amount]) => `${stat}:${amount}`),
    ]),
    loot.setId ?? "none",
    String(loot.itemPower),
  );
}

export function parseStoredDeterministicLootResult(value: string): DeterministicLootResult {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error("stored visual loot receipt JSON is invalid"); }
  const loot = storedDeterministicLootResultSchema.parse(parsed) as DeterministicLootResult;
  const derived = rederiveStoredDeterministicLootHash(loot);
  if (derived !== loot.deterministicHash) throw new Error("stored visual loot deterministic hash mismatch");
  return loot;
}

export type ConfirmedVisualItemInput = Readonly<{
  loot: DeterministicLootResult;
  baseDefinition: LootBaseDefinition;
  lootReceiptId: string;
  visualEventIndex?: number;
  visual?: CanonicalVisualMetadata | null;
}>;

function assertCanonicalReceiptId(value: string): void {
  if (!value || value !== value.trim()) throw new Error("visual item requires a canonical loot receipt id");
}

function assertLootMatchesBase(loot: DeterministicLootResult, base: LootBaseDefinition): void {
  if (loot.itemDefinitionId !== base.id) throw new Error("visual item base definition does not match confirmed loot");
  if (loot.category !== base.category) throw new Error("visual item category does not match confirmed loot");
  if ((loot.equipmentSlot ?? null) !== (base.equipmentSlot ?? null)) throw new Error("visual item equipment slot does not match confirmed loot");
}

/**
 * Pure presentation adapter from already-confirmed Aurion loot to a visual descriptor.
 * It deliberately excludes itemPower, baseStats and affix stat values so this boundary
 * cannot become a second gameplay authority.
 */
export function projectConfirmedLootToVisualItem(input: ConfirmedVisualItemInput): VisualItemDescriptor {
  assertCanonicalReceiptId(input.lootReceiptId);
  assertLootMatchesBase(input.loot, input.baseDefinition);
  const visualEventIndex = input.visualEventIndex ?? 0;
  if (!Number.isSafeInteger(visualEventIndex) || visualEventIndex < 0) throw new Error("visualEventIndex must be a non-negative safe integer");
  if (input.visual && input.visual.itemDefinitionId !== input.loot.itemDefinitionId) throw new Error("visual metadata does not match confirmed item definition");

  const affixes = input.loot.affixes
    .map(affix => ({ id: affix.id, slot: affix.slot, groupId: affix.groupId }))
    .sort((left, right) => textCompare(left.slot, right.slot) || textCompare(left.id, right.id));

  const parsed = visualItemDescriptorSchema.parse({
    version: VISUAL_ITEM_DESCRIPTOR_VERSION,
    itemDefinitionId: input.loot.itemDefinitionId,
    familyId: input.baseDefinition.familyId,
    category: input.loot.category,
    equipmentSlot: input.loot.equipmentSlot ?? null,
    quality: input.loot.quality,
    affixes,
    setId: input.loot.setId ?? null,
    visual: input.visual ?? null,
    source: {
      lootReceiptId: input.lootReceiptId,
      contextHash: input.loot.contextHash,
      deterministicHash: input.loot.deterministicHash,
      visualEventIndex,
    },
    visualSeed: digest(VISUAL_ITEM_DESCRIPTOR_VERSION, input.loot.deterministicHash, input.lootReceiptId, String(visualEventIndex)),
  });

  return Object.freeze({
    ...parsed,
    affixes: Object.freeze(parsed.affixes.map(affix => Object.freeze({ ...affix }))),
    visual: parsed.visual ? Object.freeze({ ...parsed.visual }) : null,
    source: Object.freeze({ ...parsed.source }),
  });
}
