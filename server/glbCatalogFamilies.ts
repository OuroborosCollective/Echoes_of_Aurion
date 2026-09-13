import {
  glbEquipmentSlotFromDisplayName,
  glbLodDescriptor,
  glbPurposeFromDisplayName,
  glbSubcategoryFromDisplayName,
  type GlbCatalogEntry,
  type GlbCatalogLodVariant,
} from "../shared/glbImportContract";

export type PhysicalGlbCatalogRow = Readonly<{
  assetId: string;
  sha256: string;
  bytes: number;
  displayName: string;
  assetType: GlbCatalogEntry["assetType"];
  storageUrl: string;
  targetKey: string | null;
}>;

type Physical = GlbCatalogEntry & Readonly<{ bytes: number; explicitLod: number | null; baseDisplayName: string }>;

function physical(row: PhysicalGlbCatalogRow): Physical {
  const descriptor = glbLodDescriptor(row.displayName);
  return Object.freeze({
    assetId: row.assetId,
    sha256: row.sha256,
    displayName: row.displayName,
    assetType: row.assetType,
    storageUrl: row.storageUrl,
    targetKey: row.targetKey,
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
  const { bytes: _bytes, explicitLod: _explicitLod, baseDisplayName: _baseDisplayName, ...catalog } = entry;
  return Object.freeze(catalog);
}

/**
 * Collapses explicit `LOD0`…`LOD3` physical rows into one logical catalog model.
 * Rows without an explicit LOD token remain independent. Duplicate levels fail
 * visibly by remaining separate rather than silently hiding one physical asset.
 */
export function groupGlbCatalogRows(rows: readonly PhysicalGlbCatalogRow[]): readonly GlbCatalogEntry[] {
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
    for (const member of members) levelCounts.set(member.explicitLod!, (levelCounts.get(member.explicitLod!) ?? 0) + 1);
    if ([...levelCounts.values()].some(count => count !== 1)) {
      singles.push(...members.map(standalone));
      continue;
    }

    const sorted = members.slice().sort((left, right) => left.explicitLod! - right.explicitLod! || left.sha256.localeCompare(right.sha256));
    const primary = sorted.find(member => member.explicitLod === 0) ?? sorted[0]!;
    const lods: GlbCatalogLodVariant[] = sorted.map(member => ({
      level: member.explicitLod! as 0 | 1 | 2 | 3,
      assetId: member.assetId,
      sha256: member.sha256,
      bytes: member.bytes,
      storageUrl: member.storageUrl,
      targetKey: member.targetKey,
    }));
    singles.push(Object.freeze({
      assetId: primary.assetId,
      sha256: primary.sha256,
      displayName: primary.baseDisplayName,
      assetType: primary.assetType,
      storageUrl: primary.storageUrl,
      targetKey: primary.targetKey,
      purpose: primary.purpose,
      subcategory: primary.subcategory,
      equipmentSlot: primary.equipmentSlot,
      lods,
    }));
  }

  return Object.freeze(singles.sort((left, right) => left.displayName.localeCompare(right.displayName) || left.assetId.localeCompare(right.assetId)));
}
