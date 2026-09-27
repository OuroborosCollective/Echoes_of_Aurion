import type { VisualItemDescriptor } from "@shared/visualItemProtocol";

export const VISUAL_MORPHOLOGY_PROTOCOL = "aurion.visual-morphology.v1" as const;
export const VISUAL_MORPHOLOGY_GRAMMAR_VERSION = "aurion-visual-morphology.v1" as const;

export type VisualMorphologyRecipe = Readonly<{
  protocol: typeof VISUAL_MORPHOLOGY_PROTOCOL;
  grammarVersion: string;
  category: VisualItemDescriptor["category"];
  familyId: string;
  equipmentSlot: VisualItemDescriptor["equipmentSlot"];
  visualSeed: string;
  descriptorBinding: string;
  contextBinding: string;
  silhouetteVariant: number;
  proportionXbp: number;
  proportionYbp: number;
  proportionZbp: number;
  accentBp: number;
  ornamentVariant: number;
  recipeHash: string;
}>;

export type VisualMorphologyTransform = Readonly<{
  positionScale: readonly [number, number, number];
  scale: readonly [number, number, number];
}>;

const HEX64 = /^[a-f0-9]{64}$/;
const BP_MIN = 960;
const BP_MAX = 1040;
const ACCENT_MIN = 940;
const ACCENT_MAX = 1060;

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function seedByte(seed: string, offset: number): number {
  return Number.parseInt(seed.slice(offset * 2, offset * 2 + 2), 16);
}

function bindingText(descriptor: VisualItemDescriptor, grammarVersion: string): string {
  const affixes = descriptor.affixes
    .map(affix => affix.slot + ":" + affix.groupId + ":" + affix.id)
    .sort()
    .join("|");
  return [
    VISUAL_MORPHOLOGY_PROTOCOL,
    grammarVersion,
    descriptor.version,
    descriptor.category,
    descriptor.familyId,
    descriptor.equipmentSlot ?? "-",
    descriptor.quality,
    descriptor.setId ?? "-",
    descriptor.visual?.materialId ?? "-",
    descriptor.visual?.variantTheme ?? "-",
    affixes,
    descriptor.visualSeed,
    descriptor.source.deterministicHash,
    descriptor.source.contextHash,
  ].join("::");
}

export function compileVisualMorphologyRecipe(
  descriptor: VisualItemDescriptor,
  grammarVersion: string = VISUAL_MORPHOLOGY_GRAMMAR_VERSION,
): VisualMorphologyRecipe {
  if (!HEX64.test(descriptor.visualSeed)) {
    throw new Error("VISUAL_MORPHOLOGY_SEED_INVALID");
  }
  if (!grammarVersion.trim()) {
    throw new Error("VISUAL_MORPHOLOGY_GRAMMAR_VERSION_REQUIRED");
  }

  const silhouetteVariant = seedByte(descriptor.visualSeed, 0) % 16;
  const proportionXbp = BP_MIN + (seedByte(descriptor.visualSeed, 1) % ((BP_MAX - BP_MIN) + 1));
  const proportionYbp = BP_MIN + (seedByte(descriptor.visualSeed, 2) % ((BP_MAX - BP_MIN) + 1));
  const proportionZbp = BP_MIN + (seedByte(descriptor.visualSeed, 3) % ((BP_MAX - BP_MIN) + 1));
  const accentBp = ACCENT_MIN + (seedByte(descriptor.visualSeed, 4) % ((ACCENT_MAX - ACCENT_MIN) + 1));
  const ornamentVariant = seedByte(descriptor.visualSeed, 5) % 8;
  const canonicalBinding = bindingText(descriptor, grammarVersion);
  const recipeHash = "fnv1a32:" + fnv1a32(canonicalBinding + "::" + silhouetteVariant + "::" + proportionXbp + "::" + proportionYbp + "::" + proportionZbp + "::" + accentBp + "::" + ornamentVariant);

  return Object.freeze({
    protocol: VISUAL_MORPHOLOGY_PROTOCOL,
    grammarVersion,
    category: descriptor.category,
    familyId: descriptor.familyId,
    equipmentSlot: descriptor.equipmentSlot,
    visualSeed: descriptor.visualSeed,
    descriptorBinding: descriptor.source.deterministicHash,
    contextBinding: descriptor.source.contextHash,
    silhouetteVariant,
    proportionXbp,
    proportionYbp,
    proportionZbp,
    accentBp,
    ornamentVariant,
    recipeHash,
  });
}

function stablePartBias(partName: string, recipe: VisualMorphologyRecipe): readonly [number, number, number] {
  const digest = fnv1a32(recipe.visualSeed + "::" + recipe.silhouetteVariant + "::" + partName);
  const a = (Number.parseInt(digest.slice(0, 2), 16) % 5) - 2;
  const b = (Number.parseInt(digest.slice(2, 4), 16) % 5) - 2;
  const c = (Number.parseInt(digest.slice(4, 6), 16) % 5) - 2;
  return [1 + a * 0.008, 1 + b * 0.006, 1 + c * 0.008] as const;
}

const accentPartTokens = Object.freeze([
  "guard", "pommel", "crest", "rim", "prong", "spike", "boss", "visor", "cuff", "ferrule",
]);
const ornamentPartTokens = Object.freeze([
  "pommel", "crest", "prong", "spike", "rim", "boss", "nock", "wing",
]);

function hasToken(name: string, tokens: readonly string[]): boolean {
  return tokens.some(token => name.includes(token));
}

export function visualMorphologyTransform(
  partName: string,
  recipe: VisualMorphologyRecipe,
): VisualMorphologyTransform {
  const normalizedName = partName.toLowerCase();
  const localBias = stablePartBias(normalizedName, recipe);
  const accent = hasToken(normalizedName, accentPartTokens) ? recipe.accentBp / 1000 : 1;
  const ornament = hasToken(normalizedName, ornamentPartTokens)
    ? 0.96 + recipe.ornamentVariant * 0.01
    : 1;
  const silhouettePulse = 1 + ((recipe.silhouetteVariant % 5) - 2) * 0.012;

  const sx = (recipe.proportionXbp / 1000) * localBias[0] * accent * ornament * silhouettePulse;
  const sy = (recipe.proportionYbp / 1000) * localBias[1] * (hasToken(normalizedName, ["shaft", "haft", "grip", "snath", "blade"]) ? 1.01 : 1);
  const sz = (recipe.proportionZbp / 1000) * localBias[2] * (hasToken(normalizedName, ["shell", "cuirass", "body", "core"]) ? accent : 1);

  return Object.freeze({
    positionScale: [sx, sy, sz] as const,
    scale: [sx, sy, sz] as const,
  });
}
