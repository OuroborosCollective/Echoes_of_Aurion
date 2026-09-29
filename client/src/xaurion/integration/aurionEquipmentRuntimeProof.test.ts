import { describe, expect, it } from "vitest";
import type {
  GlbCatalogEntry,
  GlbRuntimeCatalog,
} from "@shared/glbImportContract";
import {
  createCanonicalAvatarProfile,
  type CanonicalAvatarProfileInput,
} from "@shared/aurionCanonicalAvatarContract";
import {
  createAurionEquipmentRuntimeProof,
  verifyAurionEquipmentRuntimeProof,
} from "@shared/aurionEquipmentRuntimeProof";
import {
  visualItemDescriptorSchema,
  type VisualItemDescriptor,
} from "@shared/visualItemProtocol";
import { compileVisualItemGeometry } from "../core/VisualItemGeometryCompiler";
import { resolveVisualItemRenderSource } from "../core/VisualItemGlbOverrideResolver";
import { glbNormalizationTestFixture } from "../core/GlbNormalizationTestFixture.test";

const hex = (char: string) => `sha256:${char.repeat(64)}`;
const profileInput = (id: string): CanonicalAvatarProfileInput => ({
  avatarProfileId: id,
  avatarProfileVersion: "aurion-avatar-profile.v1",
  skeletonRevision: hex("a"),
  bones: [
    {
      boneId: "arm",
      sourceName: "arm",
      parentBoneId: "root",
      restPositionNormalized: [0, 0.4, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "foot",
      sourceName: "foot",
      parentBoneId: "root",
      restPositionNormalized: [0, 0.1, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "hand",
      sourceName: "hand",
      parentBoneId: "root",
      restPositionNormalized: [0, 0.5, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "head",
      sourceName: "head",
      parentBoneId: "root",
      restPositionNormalized: [0, 0.9, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "leg",
      sourceName: "leg",
      parentBoneId: "root",
      restPositionNormalized: [0, 0.3, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "root",
      sourceName: "root",
      parentBoneId: null,
      restPositionNormalized: [0, 0, 0],
      restQuaternion: [0, 0, 0, 1],
    },
  ],
  bodyRegions: [
    {
      regionId: "head",
      boneId: "hand",
      normalizedBounds: { min: [-0.1, 0.4, -0.1], max: [0.1, 0.6, 0.1] },
      clearanceRadiusNormalized: 0.1,
    },
  ],
  attachmentSockets: [
    {
      equipmentSlot: "weapon",
      socketId: `aurion:${id}:weapon`,
      boneId: "hand",
      positionNormalized: [0, 0.5, 0],
    },
  ],
  normalizedBounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  armorClearanceEnvelopes: [{ regionId: "head", radiusNormalized: 0.1 }],
  supportedEquipmentSlots: ["weapon"],
  surfaceLandmarks: [
    { landmarkId: "head", boneId: "hand", positionNormalized: [0, 0.5, 0] },
  ],
  deformationMode: "rigid",
});

function descriptor(
  overrides: Partial<VisualItemDescriptor> = {}
): VisualItemDescriptor {
  const itemDefinitionId = overrides.itemDefinitionId ?? "weapon-spear-v2";
  const visualSeed = overrides.visualSeed ?? "c".repeat(64);
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId,
    familyId: "spear",
    category: "weapon",
    equipmentSlot: "main_hand",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: {
      itemDefinitionId,
      materialId: "star_iron",
      appearanceId: "spear-starforged",
      materialVariant: null,
      variantTheme: "starforged",
      glbAssetId: "glb-proof-spear",
    },
    source: {
      lootReceiptId: overrides.source?.lootReceiptId ?? "receipt:spear",
      contextHash: "a".repeat(64),
      deterministicHash: "b".repeat(64),
      visualEventIndex: 0,
    },
    visualSeed,
    ...overrides,
  });
}

function entry(overrides: any = {}): GlbCatalogEntry {
  const sha256 = overrides.sha256 ?? "d".repeat(64);
  const result = {
    assetId: "glb-proof-spear",
    sha256,
    displayName: "Equipment · weapon · Proof Spear",
    assetType: "weapon",
    storageUrl: `/api/assets/glb/${sha256}.glb`,
    targetKey: null,
    purpose: "equipment",
    subcategory: "weapon",
    equipmentSlot: "weapon",
    ...overrides,
  };
  return {
    ...result,
    normalization: glbNormalizationTestFixture(result.sha256),
  };
}

const catalog: GlbRuntimeCatalog = {
  version: "aurion.glb-import.v1",
  revision: "f".repeat(64),
  entries: [entry()],
};

describe("Aurion end-to-end equipment runtime proof", () => {
  it("proves receipt-bound variants, two avatar profiles, GLB/procedural sources, cache replay, and LOD identity", () => {
    const glbDescriptor = descriptor();
    const fallbackDescriptor = descriptor({
      itemDefinitionId: "weapon-axe-v2",
      familyId: "axe",
      source: { ...glbDescriptor.source, lootReceiptId: "receipt:axe" },
      visualSeed: "e".repeat(64),
      visual: null,
    });
    const glb = resolveVisualItemRenderSource(glbDescriptor, 0, catalog);
    const fallback = resolveVisualItemRenderSource(
      fallbackDescriptor,
      1,
      catalog
    );
    expect(glb.kind).toBe("glb");
    expect(fallback.kind).toBe("procedural");
    if (fallback.kind !== "procedural")
      throw new Error("expected procedural fallback");
    const lodReadbacks = ([0, 1, 2] as const).map(lod => {
      const result = compileVisualItemGeometry(fallbackDescriptor, lod);
      if (result.kind !== "generated")
        throw new Error("expected generated geometry");
      const value = {
        lod,
        logicalIdentity: fallbackDescriptor.source.deterministicHash,
        structuralFingerprint: result.structuralFingerprint,
      };
      result.dispose();
      return value;
    });
    const proof = createAurionEquipmentRuntimeProof({
      sourceRevision: "1".repeat(40),
      lootReceipts: [
        {
          receiptId: "receipt:spear",
          itemDefinitionId: glbDescriptor.itemDefinitionId,
          familyId: glbDescriptor.familyId,
          visualSeed: hex("c"),
        },
        {
          receiptId: "receipt:axe",
          itemDefinitionId: fallbackDescriptor.itemDefinitionId,
          familyId: fallbackDescriptor.familyId,
          visualSeed: hex("e"),
        },
      ],
      visualDescriptors: [glbDescriptor, fallbackDescriptor],
      avatarProfiles: [
        createCanonicalAvatarProfile(profileInput("avatar:a")),
        createCanonicalAvatarProfile(profileInput("avatar:b")),
      ],
      equipmentSlots: ["weapon", "head"],
      renderEvidence: [
        {
          equipmentSlot: "weapon",
          source: "glb",
          fingerprint: glb.kind === "glb" ? glb.entry.sha256 : "",
        },
        {
          equipmentSlot: "weapon",
          source: "procedural",
          fingerprint: fallback.geometry.structuralFingerprint,
        },
      ],
      cacheReplayFingerprints: [
        fallback.geometry.structuralFingerprint,
        fallback.geometry.structuralFingerprint,
      ],
      lodReadbacks,
    });
    expect(verifyAurionEquipmentRuntimeProof(proof)).toBe(true);
    expect(proof.proofFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
