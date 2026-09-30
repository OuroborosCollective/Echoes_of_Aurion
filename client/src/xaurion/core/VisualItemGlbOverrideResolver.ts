import { glbRuntimeCatalogSchema, selectGlbCatalogLod, type GlbCatalogEntry, type GlbEquipmentSlot, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import {
  compileVisualItemGeometry,
  type GeneratedVisualItemGeometry,
  type UnsupportedVisualItemGeometry,
  type VisualItemGeometryCompileOptions,
  type VisualItemLod,
} from "./VisualItemGeometryCompiler";

export type VisualItemGlbFallbackReason =
  | "NO_CONFIRMED_GLB_BINDING"
  | "CATALOG_INVALID"
  | "ITEM_SLOT_UNSUPPORTED"
  | "ASSET_NOT_IN_CATALOG"
  | "ASSET_ID_AMBIGUOUS"
  | "ASSET_PURPOSE_MISMATCH"
  | "ASSET_TARGET_KEY_FORBIDDEN"
  | "ASSET_SLOT_MISMATCH"
  | "ASSET_TYPE_MISMATCH"
  | "ASSET_STORAGE_MISMATCH";

export type VisualItemGlbSource = Readonly<{
  kind: "glb";
  lod: VisualItemLod;
  equipmentSlot: GlbEquipmentSlot;
  catalogRevision: string;
  entry: Readonly<GlbCatalogEntry>;
  evidence: Readonly<{
    assetId: string;
    sha256: string;
    storageUrl: string;
    measuredTriangles: null;
    measuredLod: VisualItemLod | null;
  }>;
}>;

export type VisualItemProceduralSource = Readonly<{
  kind: "procedural";
  lod: VisualItemLod;
  reason: VisualItemGlbFallbackReason;
  geometry: GeneratedVisualItemGeometry;
}>;

export type VisualItemUnsupportedSource = Readonly<{
  kind: "unsupported";
  lod: VisualItemLod;
  reason: VisualItemGlbFallbackReason | UnsupportedVisualItemGeometry["reason"];
  geometry: UnsupportedVisualItemGeometry;
}>;

export type VisualItemRenderSource = VisualItemGlbSource | VisualItemProceduralSource | VisualItemUnsupportedSource;

const armorSlotMap = Object.freeze({
  head: "helmet",
  chest: "chest",
  hands: "arms",
  legs: "legs",
  feet: "boots",
} satisfies Readonly<Partial<Record<string, GlbEquipmentSlot>>>);

export function visualItemEquipmentSlot(descriptor: VisualItemDescriptor): GlbEquipmentSlot | null {
  if (descriptor.category === "weapon") {
    if (descriptor.familyId === "shield" || descriptor.equipmentSlot === "off_hand") return "shield";
    return descriptor.equipmentSlot === "main_hand" ? "weapon" : null;
  }
  if (descriptor.category === "armor" && descriptor.equipmentSlot) {
    return armorSlotMap[descriptor.equipmentSlot as keyof typeof armorSlotMap] ?? null;
  }
  return null;
}

function expectedAssetType(slot: GlbEquipmentSlot): "weapon" | "armor" {
  return slot === "weapon" ? "weapon" : "armor";
}

function fallback(
  descriptor: VisualItemDescriptor,
  lod: VisualItemLod,
  reason: VisualItemGlbFallbackReason,
  options?: VisualItemGeometryCompileOptions,
): VisualItemProceduralSource | VisualItemUnsupportedSource {
  const geometry = compileVisualItemGeometry(descriptor, lod, options);
  if (geometry.kind === "generated") return Object.freeze({ kind: "procedural", lod, reason, geometry });
  return Object.freeze({ kind: "unsupported", lod, reason: geometry.reason === "CATEGORY_UNSUPPORTED" || geometry.reason === "ARMOR_SLOT_UNSUPPORTED" || geometry.reason === "WEAPON_FAMILY_UNSUPPORTED" ? geometry.reason : reason, geometry });
}

/**
 * Resolves an item visual against Aurion's existing server-authored GLB catalog.
 * Only an explicit canonical glbAssetId may select a logical GLB family. The
 * requested presentation LOD may choose a physical member of that family, but
 * inventory identity, ownership and gameplay stats remain bound to the same
 * canonical item descriptor and logical asset id.
 */
export function resolveVisualItemRenderSource(
  descriptor: VisualItemDescriptor,
  lod: VisualItemLod,
  catalog: GlbRuntimeCatalog,
  options?: VisualItemGeometryCompileOptions,
): VisualItemRenderSource {
  const slot = visualItemEquipmentSlot(descriptor);
  if (!slot) return fallback(descriptor, lod, "ITEM_SLOT_UNSUPPORTED", options);

  const assetId = descriptor.visual?.glbAssetId ?? null;
  if (!assetId) return fallback(descriptor, lod, "NO_CONFIRMED_GLB_BINDING", options);

  const parsedCatalog = glbRuntimeCatalogSchema.safeParse(catalog);
  if (!parsedCatalog.success) return fallback(descriptor, lod, "CATALOG_INVALID", options);

  const matches = parsedCatalog.data.entries.filter(entry => entry.assetId === assetId);
  if (matches.length === 0) return fallback(descriptor, lod, "ASSET_NOT_IN_CATALOG", options);
  if (matches.length !== 1) return fallback(descriptor, lod, "ASSET_ID_AMBIGUOUS", options);
  const entry = matches[0]!;

  if (entry.purpose !== "equipment") return fallback(descriptor, lod, "ASSET_PURPOSE_MISMATCH", options);
  if (entry.targetKey !== null) return fallback(descriptor, lod, "ASSET_TARGET_KEY_FORBIDDEN", options);
  if (entry.equipmentSlot !== slot) return fallback(descriptor, lod, "ASSET_SLOT_MISMATCH", options);
  if (entry.assetType !== expectedAssetType(slot)) return fallback(descriptor, lod, "ASSET_TYPE_MISMATCH", options);

  const variant = selectGlbCatalogLod(entry, lod);
  if (variant.targetKey !== null || variant.storageUrl !== `/api/assets/glb/${variant.sha256}.glb`) return fallback(descriptor, lod, "ASSET_STORAGE_MISMATCH", options);

  const safeEntry = Object.freeze({ ...entry, sha256: variant.sha256, storageUrl: variant.storageUrl });
  return Object.freeze({
    kind: "glb",
    lod,
    equipmentSlot: slot,
    catalogRevision: parsedCatalog.data.revision,
    entry: safeEntry,
    evidence: Object.freeze({
      assetId: entry.assetId,
      sha256: variant.sha256,
      storageUrl: variant.storageUrl,
      measuredTriangles: null,
      measuredLod: entry.lods?.length ? variant.level as VisualItemLod : null,
    }),
  });
}