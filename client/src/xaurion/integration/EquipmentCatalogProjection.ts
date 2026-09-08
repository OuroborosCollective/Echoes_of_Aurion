import * as THREE from "three";
import {
  confirmedEquipmentVisualReadbackSchema,
  type ConfirmedEquipmentVisual,
  type ConfirmedEquipmentVisualReadback,
  type ConfirmedV2EquipmentVisual,
} from "@shared/confirmedEquipmentVisualProtocol";
import type { GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { selectEquipmentCatalogAsset } from "../core/UploadedAssetRuntime";
import { VisualItemAttachmentController, type VisualItemAttachmentTarget } from "../core/VisualItemAttachmentController";
import { AurionVisualClock } from "../core/VisualItemMaterialCompiler";

export const EQUIPMENT_VISUAL_EVIDENCE_EVENT = "aurion:xaurion-equipment-visual-evidence" as const;

type CompatAttachment = Readonly<{ identity: string; sha256: string; holder: THREE.Group }>;

// These are exactly the existing Aurion AnimatedGlbActor attachment aliases.
// This projection searches only inside the active actor mount; there is no generic
// scene-root/head/hips fallback and no gameplay meaning is derived from an anchor.
const anchorAliases: Readonly<Record<GlbEquipmentSlot, readonly string[]>> = Object.freeze({
  weapon: ["socketweaponr", "slotweaponr", "slothandr", "handr", "righthand"],
  shield: ["socketweaponl", "slotoffhand", "slothandl", "handl", "lefthand"],
  helmet: ["sockethead", "slothead", "head"],
  chest: ["socketchest", "slotchest", "upperchest", "chest", "spine2", "spine"],
  shoulders: ["socketshoulders", "slotshoulders", "upperchest", "spine2", "spine"],
  arms: ["socketarms", "slotarms", "upperchest", "spine2", "spine"],
  legs: ["socketlegs", "slotlegs", "pelvis", "hips"],
  boots: ["socketboots", "slotboots", "pelvis", "hips"],
});
const targetSize: Readonly<Record<GlbEquipmentSlot, number>> = Object.freeze({ weapon: 1.35, shield: 1.0, helmet: 0.7, chest: 1.2, shoulders: 1.2, arms: 1.05, legs: 1.1, boots: 0.85 });
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const bindingIdentity = (binding: ConfirmedEquipmentVisual) => `${binding.version}:${binding.definition}:${binding.receiptId}:${binding.itemId}`;

/**
 * View-only bridge from server-confirmed equipment to active actor visuals.
 * aurion_v2 uses receipt-backed VisualItemDescriptor → compiler/GLB override.
 * Legacy/AX1 stay on the existing compatibility catalog pool and never receive
 * fabricated V2 hashes or gameplay authority.
 */
export class EquipmentCatalogProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private confirmed: ConfirmedEquipmentVisualReadback | null = null;
  private readonly compat = new Map<GlbEquipmentSlot, CompatAttachment>();
  private readonly holders = new Map<GlbEquipmentSlot, THREE.Group>();
  private readonly pendingCompat = new Set<GlbEquipmentSlot>();
  private readonly visualClock = new AurionVisualClock();
  private readonly v2Controller: VisualItemAttachmentController;
  private refreshBusy = false;
  private lastRefreshTick = -150;
  private avatarIdentity = "";
  private disposed = false;

  constructor(private readonly engine: MMOEngine) {
    const target: VisualItemAttachmentTarget = Object.freeze({
      attachEquipment: (slot, visual) => this.attachToActiveActor(slot, visual),
      detachEquipment: slot => this.removeHolder(slot),
    });
    this.v2Controller = new VisualItemAttachmentController(target, this.visualClock);
  }

  setCatalog(catalog: GlbRuntimeCatalog | null): void {
    if (this.disposed || this.catalog?.revision === catalog?.revision) return;
    this.catalog = catalog;
    void this.reconcile();
  }

  private anchor(slot: GlbEquipmentSlot): THREE.Object3D | null {
    const aliases = new Set(anchorAliases[slot]);
    let found: THREE.Object3D | null = null;
    this.engine.player.glbAvatarGroup.traverse(node => {
      if (!found && node.name && aliases.has(normalize(node.name))) found = node;
    });
    return found;
  }

  private removeHolder(slot: GlbEquipmentSlot): void {
    const holder = this.holders.get(slot);
    if (!holder) return;
    holder.removeFromParent();
    this.holders.delete(slot);
  }

  private attachToActiveActor(slot: GlbEquipmentSlot, visual: THREE.Group): boolean {
    if (this.disposed || !this.engine.player.activeGlbModelId) return false;
    const anchor = this.anchor(slot);
    if (!anchor) return false;
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual, true);
    if (bounds.isEmpty()) return false;
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) return false;

    const scale = THREE.MathUtils.clamp(targetSize[slot] / maxDimension, 0.05, 8);
    const center = bounds.getCenter(new THREE.Vector3());
    visual.scale.setScalar(scale);
    visual.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    visual.traverse(node => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
    const holder = new THREE.Group();
    holder.name = `aurion-confirmed-equipment:${slot}`;
    holder.userData.confirmedEquipmentSlot = slot;
    holder.add(visual);
    this.removeHolder(slot);
    anchor.add(holder);
    this.holders.set(slot, holder);
    return true;
  }

  private removeCompat(slot: GlbEquipmentSlot): void { this.compat.delete(slot); }

  private clear(): void {
    for (const slot of [...this.compat.keys()]) this.compat.delete(slot);
    for (const slot of [...this.v2Controller.evidence()].map(value => value.slot)) this.v2Controller.detach(slot);
    for (const slot of [...this.holders.keys()]) this.removeHolder(slot);
  }

  private async loadCompat(binding: Exclude<ConfirmedEquipmentVisual, ConfirmedV2EquipmentVisual>): Promise<void> {
    const slot = binding.equipmentSlot;
    if (this.disposed || this.pendingCompat.has(slot) || !this.catalog) return;
    const identity = bindingIdentity(binding);
    const selected = selectEquipmentCatalogAsset(this.catalog, slot, identity);
    if (!selected) { this.v2Controller.detach(slot); this.removeHolder(slot); this.removeCompat(slot); return; }
    const existing = this.compat.get(slot);
    if (existing?.identity === identity && existing.sha256 === selected.sha256) return;

    this.pendingCompat.add(slot);
    try {
      const loaded = await glbManager.loadModel(selected.storageUrl);
      if (this.disposed || !this.catalog?.entries.some(entry => entry.assetId === selected.assetId && entry.sha256 === selected.sha256 && entry.purpose === "equipment" && entry.equipmentSlot === slot)) return;
      const current = this.confirmed?.equipment.find(value => value.equipmentSlot === slot);
      if (!current || current.version === "aurion_v2" || bindingIdentity(current) !== identity) return;
      let skinned = false;
      loaded.scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh || (node as THREE.Bone).isBone) skinned = true; });
      if (skinned) return;
      loaded.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(Math.max(size.x, size.y, size.z))) return;

      this.v2Controller.detach(slot);
      if (!this.attachToActiveActor(slot, loaded.scene)) return;
      const holder = this.holders.get(slot);
      if (!holder) return;
      holder.userData.confirmedEquipment = Object.freeze({ slot, itemId: binding.itemId, version: binding.version, receiptId: binding.receiptId, assetId: selected.assetId, sha256: selected.sha256, compatibility: true });
      this.compat.set(slot, Object.freeze({ identity, sha256: selected.sha256, holder }));
    } catch {
      // Compatibility visual failure never changes confirmed equipment truth.
    } finally { this.pendingCompat.delete(slot); }
  }

  private async loadV2(binding: ConfirmedV2EquipmentVisual): Promise<void> {
    if (this.disposed || !this.catalog) return;
    const identity = bindingIdentity(binding);
    const existing = this.v2Controller.evidence().find(value => value.slot === binding.equipmentSlot);
    if (existing?.identity.includes(binding.receiptId) && existing.identity.includes(binding.definition)) return;
    const outcome = await this.v2Controller.apply(binding.visualDescriptor, 0, this.catalog);
    if (this.disposed) return;
    const current = this.confirmed?.equipment.find(value => value.equipmentSlot === binding.equipmentSlot);
    if (!current || current.version !== "aurion_v2" || bindingIdentity(current) !== identity) {
      const active = this.v2Controller.evidence().find(value => value.slot === binding.equipmentSlot);
      if (active?.identity === outcome.identity) this.v2Controller.detach(binding.equipmentSlot);
      else this.v2Controller.invalidate(binding.equipmentSlot);
      return;
    }
    if (outcome.status === "attached") {
      this.removeCompat(binding.equipmentSlot);
      const holder = this.holders.get(binding.equipmentSlot);
      if (holder) holder.userData.confirmedEquipment = Object.freeze({
        slot: binding.equipmentSlot,
        itemId: binding.itemId,
        version: binding.version,
        receiptId: binding.receiptId,
        descriptorHash: binding.visualDescriptor.source.deterministicHash,
        source: outcome.source,
      });
    }
  }

  private async refresh(): Promise<void> {
    if (this.disposed || this.refreshBusy) return;
    this.refreshBusy = true;
    try {
      const response = await fetch("/api/game/confirmed-equipment-visuals-v2", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("EQUIPMENT_VISUAL_READBACK_UNAVAILABLE");
      this.confirmed = confirmedEquipmentVisualReadbackSchema.parse(await response.json());
      await this.reconcile();
    } catch {
      // Keep the last fully proven readback/visuals through transient failures.
    } finally { this.refreshBusy = false; }
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) return;
    if (!this.engine.player.activeGlbModelId || !this.confirmed || !this.catalog) { this.clear(); return; }
    const desired = new Set(this.confirmed.equipment.map(binding => binding.equipmentSlot));
    for (const slot of [...this.holders.keys()]) {
      if (!desired.has(slot)) {
        this.v2Controller.detach(slot);
        this.removeCompat(slot);
        this.removeHolder(slot);
      }
    }
    for (const binding of this.confirmed.equipment) {
      if (binding.version === "aurion_v2") void this.loadV2(binding);
      else void this.loadCompat(binding);
    }
  }

  private publishEvidence(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EQUIPMENT_VISUAL_EVIDENCE_EVENT, { detail: this.evidence() }));
  }

  update(delta: number, logicalTick: number): void {
    if (this.disposed) return;
    if (Number.isFinite(delta) && delta > 0) this.visualClock.advance(Math.min(delta, 0.25));
    const nextAvatar = this.engine.player.activeGlbModelId ?? "";
    if (nextAvatar !== this.avatarIdentity) {
      this.avatarIdentity = nextAvatar;
      this.clear();
      void this.reconcile();
    }
    if (logicalTick - this.lastRefreshTick >= 150) { this.lastRefreshTick = logicalTick; void this.refresh(); }
    if (logicalTick % 10 === 0) this.publishEvidence();
  }

  evidence() {
    const v2 = this.v2Controller.evidence();
    return Object.freeze({
      avatar: this.avatarIdentity || null,
      confirmed: this.confirmed?.equipment.length ?? 0,
      rendered: this.holders.size,
      pending: this.pendingCompat.size,
      v2: Object.freeze(v2),
      slots: Object.freeze([...this.holders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slot, holder]) => Object.freeze({ slot, source: v2.some(value => value.slot === slot) ? "visual-item-compiler" : "compatibility", receiptId: (holder.userData.confirmedEquipment as { receiptId?: string } | undefined)?.receiptId ?? null }))),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.v2Controller.dispose();
    this.pendingCompat.clear();
    this.disposed = true;
  }
}
