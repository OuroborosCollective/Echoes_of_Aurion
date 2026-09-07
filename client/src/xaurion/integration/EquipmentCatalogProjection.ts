import * as THREE from "three";
import type { GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { selectEquipmentCatalogAsset } from "../core/UploadedAssetRuntime";

type ConfirmedEquipmentVisual = Readonly<{
  uiSlot: string;
  equipmentSlot: GlbEquipmentSlot;
  itemId: string;
  version: string;
  definition: string;
  receiptId: string;
}>;
type Readback = Readonly<{ version: string; userId: number; equipment: readonly ConfirmedEquipmentVisual[] }>;
type Attachment = Readonly<{ identity: string; sha256: string; holder: THREE.Group }>;

const anchorAliases: Record<GlbEquipmentSlot, readonly string[]> = {
  weapon: ["socketweaponr", "slotweaponr", "slothandr", "handr", "righthand"],
  shield: ["socketweaponl", "slotoffhand", "slothandl", "handl", "lefthand"],
  helmet: ["sockethead", "slothead", "head"],
  chest: ["socketchest", "slotchest", "upperchest", "chest", "spine2", "spine"],
  shoulders: ["socketshoulders", "slotshoulders", "upperchest", "spine2", "spine"],
  arms: ["socketarms", "slotarms", "upperchest", "spine2", "spine"],
  legs: ["socketlegs", "slotlegs", "pelvis", "hips"],
  boots: ["socketboots", "slotboots", "pelvis", "hips"],
};
const targetSize: Record<GlbEquipmentSlot, number> = { weapon: 1.35, shield: 1.0, helmet: 0.7, chest: 1.2, shoulders: 1.2, arms: 1.05, legs: 1.1, boots: 0.85 };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * View-only bridge from server-confirmed player.ui equipment to catalog meshes.
 * It never invokes engine.equipItem/unequipItem and cannot grant ownership/stats.
 */
export class EquipmentCatalogProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private confirmed: Readback | null = null;
  private readonly attachments = new Map<GlbEquipmentSlot, Attachment>();
  private readonly pending = new Set<GlbEquipmentSlot>();
  private refreshBusy = false;
  private lastRefreshTick = -150;
  private avatarIdentity = "";
  private disposed = false;

  constructor(private readonly engine: MMOEngine) {}

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

  private remove(slot: GlbEquipmentSlot): void {
    const existing = this.attachments.get(slot);
    if (!existing) return;
    existing.holder.removeFromParent();
    this.attachments.delete(slot);
  }

  private clear(): void {
    for (const slot of [...this.attachments.keys()]) this.remove(slot);
  }

  private async load(binding: ConfirmedEquipmentVisual): Promise<void> {
    const slot = binding.equipmentSlot;
    if (this.disposed || this.pending.has(slot) || !this.catalog) return;
    const identity = `${binding.version}:${binding.definition}:${binding.receiptId}:${binding.itemId}`;
    const selected = selectEquipmentCatalogAsset(this.catalog, slot, identity);
    if (!selected) { this.remove(slot); return; }
    const existing = this.attachments.get(slot);
    if (existing?.identity === identity && existing.sha256 === selected.sha256) return;
    const anchor = this.anchor(slot);
    if (!anchor) { this.remove(slot); return; }

    this.pending.add(slot);
    try {
      const loaded = await glbManager.loadModel(selected.storageUrl);
      if (this.disposed || !this.catalog?.entries.some(entry => entry.assetId === selected.assetId && entry.sha256 === selected.sha256 && entry.purpose === "equipment" && entry.equipmentSlot === slot)) return;
      const current = this.confirmed?.equipment.find(value => value.equipmentSlot === slot);
      if (!current || `${current.version}:${current.definition}:${current.receiptId}:${current.itemId}` !== identity) return;
      let skinned = false;
      loaded.scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh || (node as THREE.Bone).isBone) skinned = true; });
      if (skinned) return;
      loaded.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) return;
      const activeAnchor = this.anchor(slot);
      if (!activeAnchor) return;

      const scale = THREE.MathUtils.clamp(targetSize[slot] / maxDimension, 0.05, 8);
      const center = bounds.getCenter(new THREE.Vector3());
      loaded.scene.scale.setScalar(scale);
      loaded.scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      loaded.scene.traverse(node => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      });
      const holder = new THREE.Group();
      holder.name = `aurion-confirmed-equipment:${slot}`;
      holder.userData.confirmedEquipment = Object.freeze({ slot, itemId: binding.itemId, version: binding.version, receiptId: binding.receiptId, assetId: selected.assetId, sha256: selected.sha256 });
      holder.add(loaded.scene);
      this.remove(slot);
      activeAnchor.add(holder);
      this.attachments.set(slot, Object.freeze({ identity, sha256: selected.sha256, holder }));
    } catch {
      // Missing/corrupt visual never changes the confirmed equipment readback.
    } finally { this.pending.delete(slot); }
  }

  private async refresh(): Promise<void> {
    if (this.disposed || this.refreshBusy) return;
    this.refreshBusy = true;
    try {
      const response = await fetch("/api/game/confirmed-equipment-visuals", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("EQUIPMENT_VISUAL_READBACK_UNAVAILABLE");
      const body = await response.json() as Readback;
      if (!body || !Number.isSafeInteger(body.userId) || !Array.isArray(body.equipment)) throw new Error("EQUIPMENT_VISUAL_READBACK_INVALID");
      this.confirmed = Object.freeze({ ...body, equipment: Object.freeze(body.equipment.map(value => Object.freeze({ ...value }))) });
      await this.reconcile();
    } catch {
      // Keep proven attachments through transient reads. Server state is not mutated.
    } finally { this.refreshBusy = false; }
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) return;
    if (!this.engine.player.activeGlbModelId || !this.confirmed || !this.catalog) { this.clear(); return; }
    const desired = new Set(this.confirmed.equipment.map(binding => binding.equipmentSlot));
    for (const slot of [...this.attachments.keys()]) if (!desired.has(slot)) this.remove(slot);
    for (const binding of this.confirmed.equipment) void this.load(binding);
  }

  update(_delta: number, logicalTick: number): void {
    if (this.disposed) return;
    const nextAvatar = this.engine.player.activeGlbModelId ?? "";
    if (nextAvatar !== this.avatarIdentity) {
      this.avatarIdentity = nextAvatar;
      this.clear();
      void this.reconcile();
    }
    if (logicalTick - this.lastRefreshTick >= 150) { this.lastRefreshTick = logicalTick; void this.refresh(); }
  }

  evidence() { return Object.freeze({ avatar: this.avatarIdentity || null, confirmed: this.confirmed?.equipment.length ?? 0, rendered: this.attachments.size, pending: this.pending.size,
    slots: Object.freeze([...this.attachments.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slot, value]) => Object.freeze({ slot, sha256: value.sha256, identity: value.identity }))) }); }

  dispose(): void { this.disposed = true; this.pending.clear(); this.clear(); }
}
