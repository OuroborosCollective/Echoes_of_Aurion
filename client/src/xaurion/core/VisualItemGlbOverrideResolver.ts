import { glbRuntimeCatalogSchema, type GlbCatalogEntry, type GlbEquipmentSlot, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import { compileVisualItemGeometry, type GeneratedVisualItemGeometry, type UnsupportedVisualItemGeometry, type VisualItemLod } from "./VisualItemGeometryCompiler";

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
    measuredLod: null;
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

function expectedEquipmentSlot(descriptor: VisualItemDescriptor): GlbEquipmentSlot | null {
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

function fallback(descriptor: VisualItemDescriptor, lod: VisualItemLod, reason: VisualItemGlbFallbackReason): VisualItemProceduralSource | VisualItemUnsupportedSource {
  const geometry = compileVisualItemGeometry(descriptor, lod);
  if (geometry.kind === "generated") return Object.freeze({ kind: "procedural", lod, reason, geometry });
  return Object.freeze({ kind: "unsupported", lod, reason: geometry.reason === "CATEGORY_UNSUPPORTED" || geometry.reason === "ARMOR_SLOT_UNSUPPORTED" || geometry.reason === "WEAPON_FAMILY_UNSUPPORTED" ? geometry.reason : reason, geometry });
}

/**
 * Resolves an item visual against Aurion's existing server-authored GLB catalog.
 * Only an explicit canonical glbAssetId may select a GLB. Slot-pool hashing,
 * display-name inference and arbitrary URLs are intentionally excluded here.
 */
export function resolveVisualItemRenderSource(
  descriptor: VisualItemDescriptor,
  lod: VisualItemLod,
  catalog: GlbRuntimeCatalog,
): VisualItemRenderSource {
  const slot = expectedEquipmentSlot(descriptor);
  if (!slot) return fallback(descriptor, lod, "ITEM_SLOT_UNSUPPORTED");

  const assetId = descriptor.visual?.glbAssetId ?? null;
  if (!assetId) return fallback(descriptor, lod, "NO_CONFIRMED_GLB_BINDING");

  const parsedCatalog = glbRuntimeCatalogSchema.safeParse(catalog);
  if (!parsedCatalog.success) return fallback(descriptor, lod, "CATALOG_INVALID");

  const matches = parsedCatalog.data.entries.filter(entry => entry.assetId === assetId);
  if (matches.length === 0) return fallback(descriptor, lod, "ASSET_NOT_IN_CATALOG");
  if (matches.length !== 1) return fallback(descriptor, lod, "ASSET_ID_AMBIGUOUS");
  const entry = matches[0]!;

  if (entry.purpose !== "equipment") return fallback(descriptor, lod, "ASSET_PURPOSE_MISMATCH");
  if (entry.targetKey !== null) return fallback(descriptor, lod, "ASSET_TARGET_KEY_FORBIDDEN");
  if (entry.equipmentSlot !== slot) return fallback(descriptor, lod, "ASSET_SLOT_MISMATCH");
  if (entry.assetType !== expectedAssetType(slot)) return fallback(descriptor, lod, "ASSET_TYPE_MISMATCH");
  if (entry.storageUrl !== `/api/assets/glb/${entry.sha256}.glb`) return fallback(descriptor, lod, "ASSET_STORAGE_MISMATCH");

  const safeEntry = Object.freeze({ ...entry });
  return Object.freeze({
    kind: "glb",
    lod,
    equipmentSlot: slot,
    catalogRevision: parsedCatalog.data.revision,
    entry: safeEntry,
    evidence: Object.freeze({
      assetId: safeEntry.assetId,
      sha256: safeEntry.sha256,
      storageUrl: safeEntry.storageUrl,
      measuredTriangles: null,
      measuredLod: null,
    }),
  });
}
