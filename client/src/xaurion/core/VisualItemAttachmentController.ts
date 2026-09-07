import * as THREE from "three";
import type { GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import { glbManager } from "./GLBModelManager";
import { type VisualItemLod } from "./VisualItemGeometryCompiler";
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
  visual.clear();
}

/**
 * Presentation-only attachment controller. Confirmed equipment identity remains
 * outside this class. It can only replace visuals on AnimatedGlbActor-compatible
 * anchors and never mutates inventory, ownership, stats or server readbacks.
 */
export class VisualItemAttachmentController {
  private readonly generations = new Map<GlbEquipmentSlot, number>();
  private readonly attached = new Map<GlbEquipmentSlot, OwnedAttachment>();
  private disposed = false;

  constructor(
    private readonly target: VisualItemAttachmentTarget,
    private readonly clock: AurionVisualClock,
    private readonly loadModel: VisualItemModelLoader = url => glbManager.loadModel(url),
  ) {}

  private nextGeneration(slot: GlbEquipmentSlot): number {
    const value = (this.generations.get(slot) ?? 0) + 1;
    this.generations.set(slot, value);
    return value;
  }

  private currentGeneration(slot: GlbEquipmentSlot): number {
    return this.generations.get(slot) ?? 0;
  }

  private replaceOwned(slot: GlbEquipmentSlot, next: OwnedAttachment): boolean {
    if (!this.target.attachEquipment(slot, next.visual)) return false;
    const previous = this.attached.get(slot);
    this.attached.set(slot, next);
    previous?.dispose();
    return true;
  }

  async apply(
    descriptor: VisualItemDescriptor,
    lod: VisualItemLod,
    catalog: GlbRuntimeCatalog,
  ): Promise<VisualItemAttachmentOutcome> {
    const identity = attachmentIdentity(descriptor);
    const slot = visualItemEquipmentSlot(descriptor);
    if (this.disposed || !slot) return Object.freeze({ status: "unsupported", slot, identity, source: null, detail: "ITEM_SLOT_UNSUPPORTED" });
    const generation = this.nextGeneration(slot);
    const resolved = resolveVisualItemRenderSource(descriptor, lod, catalog);
    if (resolved.kind === "unsupported") return Object.freeze({ status: "unsupported", slot, identity, source: null, detail: resolved.reason });

    if (resolved.kind === "procedural") {
      const bundle = createVisualItemMaterialBundle(descriptor, lod, this.clock);
      bundle.apply(resolved.geometry);
      const owned: OwnedAttachment = {
        identity,
        source: "procedural",
        visual: resolved.geometry.root,
        dispose: () => {
          bundle.dispose();
          resolved.geometry.dispose();
        },
      };
      if (this.disposed || this.currentGeneration(slot) !== generation) {
        owned.dispose();
        return Object.freeze({ status: "stale", slot, identity, source: "procedural", detail: "STALE_REQUEST" });
      }
      if (!this.replaceOwned(slot, owned)) {
        owned.dispose();
        return Object.freeze({ status: "anchor_missing", slot, identity, source: "procedural", detail: "ACTOR_ANCHOR_MISSING" });
      }
      return Object.freeze({ status: "attached", slot, identity, source: "procedural", detail: resolved.reason });
    }

    let loaded: Awaited<ReturnType<VisualItemModelLoader>>;
    try {
      loaded = await this.loadModel(resolved.entry.storageUrl);
    } catch {
      return Object.freeze({ status: "load_failed", slot, identity, source: "glb", detail: "GLB_LOAD_FAILED" });
    }
    if (this.disposed || this.currentGeneration(slot) !== generation) {
      detachWithoutDisposingSharedGlb(loaded.scene);
      return Object.freeze({ status: "stale", slot, identity, source: "glb", detail: "STALE_REQUEST" });
    }
    if (hasRiggedEquipment(loaded.scene) || !hasFiniteRenderableBounds(loaded.scene)) {
      detachWithoutDisposingSharedGlb(loaded.scene);
      return Object.freeze({ status: "invalid_glb", slot, identity, source: "glb", detail: hasRiggedEquipment(loaded.scene) ? "RIGGED_EQUIPMENT_UNSUPPORTED" : "GLB_BOUNDS_INVALID" });
    }
    const owned: OwnedAttachment = {
      identity,
      source: "glb",
      visual: loaded.scene,
      // GLBModelManager owns cached geometry/material resources. Its clone may be
      // detached but must never dispose those shared GPU resources here.
      dispose: () => detachWithoutDisposingSharedGlb(loaded.scene),
    };
    if (!this.replaceOwned(slot, owned)) {
      owned.dispose();
      return Object.freeze({ status: "anchor_missing", slot, identity, source: "glb", detail: "ACTOR_ANCHOR_MISSING" });
    }
    return Object.freeze({ status: "attached", slot, identity, source: "glb", detail: resolved.entry.assetId });
  }

  invalidate(slot: GlbEquipmentSlot): void {
    if (this.disposed) return;
    this.nextGeneration(slot);
  }

  detach(slot: GlbEquipmentSlot): void {
    if (this.disposed) return;
    this.nextGeneration(slot);
    this.target.detachEquipment(slot);
    const previous = this.attached.get(slot);
    this.attached.delete(slot);
    previous?.dispose();
  }

  evidence(): readonly Readonly<{ slot: GlbEquipmentSlot; identity: string; source: "glb" | "procedural" }>[] {
    return Object.freeze([...this.attached.entries()]
      .map(([slot, value]) => Object.freeze({ slot, identity: value.identity, source: value.source }))
      .sort((left, right) => left.slot.localeCompare(right.slot)));
  }

  dispose(): void {
    if (this.disposed) return;
    for (const slot of [...this.attached.keys()]) this.detach(slot);
    this.disposed = true;
    this.generations.clear();
  }
}
