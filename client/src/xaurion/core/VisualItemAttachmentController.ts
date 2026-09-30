import { releaseGlbTree } from "./GlbModelLease";
import * as THREE from "three";
import type { GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import { glbManager } from "./GLBModelManager";
import { type VisualItemLod } from "./VisualItemGeometryCompiler";
import { VisualConstructionRuntimeCache, type VisualConstructionCacheStats } from "./VisualConstructionRuntimeCache";
import type { VisualMorphologyRecipe } from "./VisualItemMorphologyCompiler";
import { resolveVisualItemRenderSource, visualItemEquipmentSlot } from "./VisualItemGlbOverrideResolver";
import { AurionVisualClock, createVisualItemMaterialBundle } from "./VisualItemMaterialCompiler";

export type VisualItemAttachmentTarget = Readonly<{
  attachEquipment: (slot: GlbEquipmentSlot, visual: THREE.Group) => boolean;
  detachEquipment: (slot: GlbEquipmentSlot) => void;
}>;

export type VisualItemModelLoader = (url: string) => Promise<Readonly<{
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
}>>;

export type VisualItemAttachmentStatus =
  | "attached"
  | "unsupported"
  | "stale"
  | "load_failed"
  | "invalid_glb"
  | "anchor_missing";

export type VisualItemAttachmentOutcome = Readonly<{
  status: VisualItemAttachmentStatus;
  slot: GlbEquipmentSlot | null;
  identity: string;
  source: "glb" | "procedural" | null;
  detail: string | null;
}>;

type OwnedAttachment = {
  identity: string;
  source: "glb" | "procedural";
  visual: THREE.Group;
  dispose: () => void;
};

function attachmentIdentity(descriptor: VisualItemDescriptor): string {
  return [
    descriptor.itemDefinitionId,
    descriptor.source.lootReceiptId,
    descriptor.source.deterministicHash,
    String(descriptor.source.visualEventIndex),
    descriptor.visual?.glbAssetId ?? "procedural",
  ].join("\u001f");
}

function hasRiggedEquipment(scene: THREE.Object3D): boolean {
  let rigged = false;
  scene.traverse(node => {
    if ((node as THREE.Bone).isBone || (node as THREE.SkinnedMesh).isSkinnedMesh) rigged = true;
  });
  return rigged;
}

function hasFiniteRenderableBounds(scene: THREE.Object3D): boolean {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene, true);
  if (bounds.isEmpty()) return false;
  return [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite);
}

function detachWithoutDisposingSharedGlb(visual: THREE.Group): void {
  visual.removeFromParent();
  releaseGlbTree(visual);
  visual.clear();
}

/**
 * Presentation-only attachment controller. Confirmed equipment identity remains
 * outside this class. It can only replace visuals on AnimatedGlbActor-compatible
 * anchors and never mutates inventory, ownership, stats or server readbacks.
 */
export class VisualItemAttachmentController {