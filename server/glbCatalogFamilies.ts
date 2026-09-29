import {
  glbEquipmentSlotFromDisplayName,
  glbLodDescriptor,
  glbPurposeFromDisplayName,
  glbSubcategoryFromDisplayName,
  type GlbCatalogEntry,
  type GlbCatalogLodVariant,
} from "../shared/glbImportContract";
import type { GlbNormalizationManifest } from "../shared/glbNormalizationContract";

export type PhysicalGlbCatalogRow = Readonly<{
  assetId: string;
  sha256: string;
  bytes: number;
  displayName: string;
  assetType: GlbCatalogEntry["assetType"];
  storageUrl: string;
  targetKey: string | null;
  normalization: GlbNormalizationManifest;
}>;

type Physical = GlbCatalogEntry &
  Readonly<{
    bytes: number;
    explicitLod: number | null;
    baseDisplayName: string;
  }>;

function physical(row: PhysicalGlbCatalogRow): Physical {
  const descriptor = glbLodDescriptor(row.displayName);
  return Object.freeze({
    assetId: row.assetId,
    sha256: row.sha256,
    displayName: row.displayName,
    assetType: row.assetType,
    storageUrl: row.storageUrl,
    targetKey: row.targetKey,
    normalization: row.normalization,
    purpose: glbPurposeFromDisplayName(row.displayName),
    subcategory: glbSubcategoryFromDisplayName(row.displayName),
    equipmentSlot: glbEquipmentSlotFromDisplayName(row.displayName),
    lods: [],
    bytes: row.bytes,
    explicitLod: descriptor.lodLevel,
    baseDisplayName: descriptor.baseDisplayName,
  });
}

function familyKey(entry: Physical): string {
  return JSON.stringify([
    entry.purpose,
    entry.assetType,
    entry.subcategory,
    entry.equipmentSlot,
    entry.baseDisplayName.toLocaleLowerCase("en-US"),
  ]);
}

function standalone(entry: Physical): GlbCatalogEntry {
  const {
    bytes: _bytes,
    explicitLod: _explicitLod,
    baseDisplayName: _baseDisplayName,
    ...catalog
  } = entry;
  return Object.freeze(catalog);
}

function compatibleLodFamily(members: readonly Physical[]): boolean {
  const ordered = members
    .slice()
    .sort((left, right) => left.explicitLod! - right.explicitLod!);
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index]!;
    if (current.normalization.lod.level !== current.explicitLod) return false;
    if (index === 0) continue;
    const previous = ordered[index - 1]!;
    if (
      current.normalization.lod.maxRenderDistanceMm <=
      previous.normalization.lod.maxRenderDistanceMm
    )
      return false;
    if (
      current.normalization.lod.triangleCount >
      previous.normalization.lod.triangleCount
    )
      return false;
    const previousBounds = previous.normalization.normalizedBoundsMm;
    const currentBounds = current.normalization.normalizedBoundsMm;
    for (let axis = 0; axis < 3; axis++) {
      const previousExtent =
        previousBounds.max[axis]! - previousBounds.min[axis]!;
      const currentExtent = currentBounds.max[axis]! - currentBounds.min[axis]!;
      const tolerance = Math.max(50, Math.floor(previousExtent / 10));
      if (Math.abs(currentExtent - previousExtent) > tolerance) return false;
    }
  }
  return true;
}

/**
 * Collapses explicit `LOD0`…`LOD3` physical rows into one logical catalog model.
 * Rows without an explicit LOD token remain independent. Duplicate levels fail
 * visibly by remaining separate rather than silently hiding one physical asset.
 */
export function groupGlbCatalogRows(
  rows: readonly PhysicalGlbCatalogRow[]
): readonly GlbCatalogEntry[] {
  const singles: GlbCatalogEntry[] = [];
  const families = new Map<string, Physical[]>();

  for (const row of rows) {
    const entry = physical(row);
    if (entry.explicitLod === null) {
      singles.push(standalone(entry));
      continue;
    }
    const key = familyKey(entry);
    const current = families.get(key) ?? [];
    current.push(entry);
    families.set(key, current);
  }

  for (const members of families.values()) {
    const levelCounts = new Map<number, number>();
    for (const member of members)
      levelCounts.set(
        member.explicitLod!,
        (levelCounts.get(member.explicitLod!) ?? 0) + 1
      );
    if ([...levelCounts.values()].some(count => count !== 1)) {
      singles.push(...members.map(standalone));
      continue;
    }

    const sorted = members
      .slice()
      .sort(
        (left, right) =>
          left.explicitLod! - right.explicitLod! ||
          left.sha256.localeCompare(right.sha256)
      );
    if (!compatibleLodFamily(sorted)) {
      singles.push(...members.map(standalone));
      continue;
    }
    const primary =
      sorted.find(member => member.explicitLod === 0) ?? sorted[0]!;
    const lods: GlbCatalogLodVariant[] = sorted.map(member => ({
      level: member.explicitLod! as 0 | 1 | 2 | 3,
      assetId: member.assetId,
      sha256: member.sha256,
      bytes: member.bytes,
      storageUrl: member.storageUrl,
      targetKey: member.targetKey,
      normalization: member.normalization,
    }));
    singles.push(
      Object.freeze({
        assetId: primary.assetId,
        sha256: primary.sha256,
        displayName: primary.baseDisplayName,
        assetType: primary.assetType,
        storageUrl: primary.storageUrl,
        targetKey: primary.targetKey,
        normalization: primary.normalization,
        purpose: primary.purpose,
        subcategory: primary.subcategory,
        equipmentSlot: primary.equipmentSlot,
        lods,
      })
    );
  }

  return Object.freeze(
    singles.sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.assetId.localeCompare(right.assetId)
    )
  );
}
