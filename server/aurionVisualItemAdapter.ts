import { createHash } from "node:crypto";
import {
  VISUAL_ITEM_DESCRIPTOR_VERSION,
  visualItemDescriptorSchema,
  type CanonicalVisualMetadata,
  type VisualItemDescriptor,
} from "../shared/visualItemProtocol";
import type { DeterministicLootResult, LootBaseDefinition } from "./aurionLootProtocol";

const textCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const digest = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

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
