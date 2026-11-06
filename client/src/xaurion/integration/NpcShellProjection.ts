import * as THREE from "three";
import type { GlbCatalogEntry, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { WorldDesignReadback } from "@shared/aurionAuthoringContract";
import { isNpcShellAsset, isNpcShellDesign } from "@shared/adminPlacementPlan";
import { authoredPlacementRef } from "@shared/worldVisualOverrideContract";
import { joinWorldChunkPositionMm, splitWorldChunkPositionMm } from "@shared/worldChunkProtocol";
import type { ConfirmedNpcPurpose, NpcPurposeReadback } from "@shared/npcPurposeContract";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";

/** Height of an NPC shell at 100 % (same as the NPC fallback actors). */
export const NPC_SHELL_BASE_HEIGHT_M = 2;
/** Shells rendered around the player at once. */
export const MAX_RENDERED_NPC_SHELLS = 24;
/** Shells farther away stand still (no animation mixer update) to save frame time. */
export const NPC_SHELL_ANIMATION_RANGE_M = 35;
/** Admins open a shell with E within this distance. */
export const NPC_SHELL_INTERACTION_RANGE_M = 4;

/** What a rendered shell carries for the admin tools (presentation metadata only). */
export type NpcShellTarget = Readonly<{
  shellRef: string;
  designKey: string;
  placementKey: string;
  assetId: string;
  displayName: string;
  position: Readonly<{ x: number; y: number; z: number }>;
  /** The confirmed purpose (name, role, dialogue), once the admin confirmed one. */
  purpose?: Readonly<{ purposeHash: string; displayName: string; role: string; greeting: string; topics: readonly Readonly<{ topic: string; line: string }>[] }>;
}>;

type ShellAsset = Pick<GlbCatalogEntry, "assetId" | "storageUrl" | "normalization">;

/**
 * Loads a character model as an idle shell actor at the NPC base height. Shared by the
 * projection and the admin placement preview, so both show exactly the same size.
 */
export async function loadNpcShellActor(asset: ShellAsset): Promise<AnimatedGlbActor> {
  const loaded = await glbManager.loadModel(asset.storageUrl, asset.normalization);
  try {
    return new AnimatedGlbActor(loaded.scene, loaded.animations, NPC_SHELL_BASE_HEIGHT_M);
  } catch (error) {
    releaseGlbTree(loaded.scene);
    throw error;
  }
}

export function npcShellScale(scalePermille: number): number {
  return THREE.MathUtils.clamp(scalePermille / 1_000, 0.25, 4);
}

type Placement = Readonly<{
  id: string;
  target: Omit<NpcShellTarget, "position">;
  asset: GlbCatalogEntry;
  x: number;
  z: number;
  rotationQuarterTurns: number;
  scalePermille: number;
}>;
type Rendered = { sha256: string; holder: THREE.Group; actor: AnimatedGlbActor };

/**
 * Projects confirmed NPC shells (World Designs `npc.shells.*`) as idle character models.
 * Presentation of confirmed Aurion state only: no collider, no gameplay object, no life.
 */
export class NpcShellProjection {
  readonly root = new THREE.Group();
  private catalog: GlbRuntimeCatalog | null = null;
  private design: WorldDesignReadback | null = null;
  private purposes = new Map<string, ConfirmedNpcPurpose>();
  private purposesRevision = "none";
  private readonly rendered = new Map<string, Rendered>();
  private readonly pending = new Set<string>();
  private signature = "";
  private disposed = false;

  constructor(private readonly engine: { scene: THREE.Scene; player: { position: THREE.Vector3 }; landscape: { chunkManager: { getElevationAt(x: number, z: number): number } } }) {
    this.root.name = "aurion-npc-shells";
    engine.scene.add(this.root);
  }

  setCatalog(catalog: GlbRuntimeCatalog | null): void {
    if (this.disposed || this.catalog?.revision === catalog?.revision) return;
    this.catalog = catalog;
    this.signature = "";
  }

  setWorldDesign(design: WorldDesignReadback | null): void {
    if (this.disposed || this.design?.revision === design?.revision) return;
    this.design = design;
    this.signature = "";
  }

  /** Confirmed purposes (public readback); only confirmed data is ever shown to players. */
  setPurposes(readback: NpcPurposeReadback | null): void {
    if (this.disposed) return;
    const revision = readback?.revision ?? "none";
    if (revision === this.purposesRevision) return;
    this.purposesRevision = revision;
    this.purposes = new Map((readback?.purposes ?? []).map(item => [item.shellRef, item] as const));
    for (const rendered of this.rendered.values()) this.applyPurpose(rendered.holder);
  }

  private applyPurpose(holder: THREE.Group): void {
    const current = holder.userData.npcShell as NpcShellTarget | undefined;
    if (!current) return;
    const confirmed = this.purposes.get(current.shellRef);
    const purpose = confirmed ? Object.freeze({ purposeHash: confirmed.purposeHash, displayName: confirmed.purpose.displayName, role: confirmed.purpose.role,
      greeting: confirmed.purpose.greeting, topics: Object.freeze(confirmed.purpose.topics.map(topic => Object.freeze({ ...topic }))) }) : undefined;
    const { purpose: _previous, ...base } = current;
    holder.userData.npcShell = Object.freeze(purpose ? { ...base, purpose } : base);
    holder.getObjectByName("aurion-npc-shell-label")?.removeFromParent();
    if (purpose) {
      const label = nameLabel(purpose.displayName, purpose.role);
      if (label) holder.add(label);
    }
  }

  private desired(position: { x: number; z: number }): Placement[] {
    if (!this.catalog || !this.design) return [];
    const center = splitWorldChunkPositionMm({ x: Math.round(position.x * 1000), z: Math.round(position.z * 1000) }).coordinate;
    const placements: Placement[] = [];
    for (const design of this.design.designs) {
      if (!isNpcShellDesign(design.designKey)) continue;
      for (const placement of design.placements) {
        if (Math.abs(placement.chunkX - center.x) > 1 || Math.abs(placement.chunkZ - center.z) > 1) continue;
        const asset = this.catalog.entries.find(entry => entry.assetId === placement.assetId && isNpcShellAsset(entry));
        if (!asset) continue;
        const world = joinWorldChunkPositionMm({ coordinate: { x: placement.chunkX, z: placement.chunkZ }, localPositionMm: { x: placement.xMm, z: placement.zMm } });
        placements.push(Object.freeze({
          id: `${design.designKey}:${placement.placementKey}`,
          target: Object.freeze({ shellRef: authoredPlacementRef(design.designKey, placement.placementKey), designKey: design.designKey, placementKey: placement.placementKey, assetId: asset.assetId, displayName: asset.displayName }),
          asset, x: world.x / 1000, z: world.z / 1000, rotationQuarterTurns: placement.rotationQuarterTurns, scalePermille: placement.scalePermille,
        }));
      }
    }
    placements.sort((left, right) => Math.hypot(left.x - position.x, left.z - position.z) - Math.hypot(right.x - position.x, right.z - position.z) || left.id.localeCompare(right.id));
    return placements.slice(0, MAX_RENDERED_NPC_SHELLS);
  }

  private remove(id: string): void {
    const current = this.rendered.get(id);
    if (!current) return;
    current.actor.dispose();
    const label = current.holder.getObjectByName("aurion-npc-shell-label") as THREE.Sprite | undefined;
    label?.material.map?.dispose(); label?.material.dispose();
    current.holder.removeFromParent();
    this.rendered.delete(id);
  }

  private async project(placement: Placement): Promise<void> {
    if (this.disposed || this.pending.has(placement.id)) return;
    this.pending.add(placement.id);
    let actor: AnimatedGlbActor | null = null;
    try {
      actor = await loadNpcShellActor(placement.asset);
      const stillWanted = this.catalog?.entries.some(entry => entry.assetId === placement.asset.assetId && entry.sha256 === placement.asset.sha256);
      if (this.disposed || !stillWanted) return;
      const y = this.engine.landscape.chunkManager.getElevationAt(placement.x, placement.z);
      if (!Number.isFinite(y)) return;
      const holder = new THREE.Group();
      holder.name = `aurion-npc-shell:${placement.id}`;
      holder.position.set(placement.x, y, placement.z);
      holder.rotation.y = placement.rotationQuarterTurns * Math.PI / 2;
      holder.scale.setScalar(npcShellScale(placement.scalePermille));
      holder.userData.npcShell = Object.freeze({ ...placement.target, position: Object.freeze({ x: placement.x, y, z: placement.z }) } satisfies NpcShellTarget);
      holder.add(actor.group);
      this.applyPurpose(holder);
      this.remove(placement.id);
      this.root.add(holder);
      this.rendered.set(placement.id, { sha256: placement.asset.sha256, holder, actor });
      actor = null;
    } catch {
      // A shell whose model cannot load stays invisible; confirmed state is unchanged.
    } finally {
      actor?.dispose();
      this.pending.delete(placement.id);
    }
  }

  update(delta: number, position = { x: this.engine.player.position.x, z: this.engine.player.position.z }): void {
    if (this.disposed) return;
    const placements = this.desired(position);
    const signature = `${this.catalog?.revision ?? "none"}:${this.design?.revision ?? "none"}:${placements.map(placement => `${placement.id}:${placement.asset.sha256}:${placement.scalePermille}:${placement.rotationQuarterTurns}`).join("|")}`;
    if (signature !== this.signature) {
      this.signature = signature;
      const wanted = new Set(placements.map(placement => placement.id));
      for (const id of [...this.rendered.keys()]) if (!wanted.has(id)) this.remove(id);
      for (const placement of placements) {
        const current = this.rendered.get(placement.id);
        const transformChanged = current && (current.holder.scale.x !== npcShellScale(placement.scalePermille) || current.holder.rotation.y !== placement.rotationQuarterTurns * Math.PI / 2);
        if (!current || current.sha256 !== placement.asset.sha256 || transformChanged) void this.project(placement);
      }
    }
    const frame = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.25) : 0;
    if (frame <= 0) return;
    for (const { actor, holder } of this.rendered.values()) {
      if (Math.hypot(holder.position.x - position.x, holder.position.z - position.z) <= NPC_SHELL_ANIMATION_RANGE_M) actor.update(frame);
    }
  }

  evidence() {
    return Object.freeze({ rendered: this.rendered.size, pending: this.pending.size, maxRendered: MAX_RENDERED_NPC_SHELLS, shells: Object.freeze([...this.rendered.keys()].sort()) });
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.rendered.keys()]) this.remove(id);
    this.root.removeFromParent();
  }
}

/**
 * Floating name and role above a shell with a confirmed purpose (canvas sprite).
 * Returns null where no 2D canvas exists (tests, headless capture).
 */
function nameLabel(name: string, role: string): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "rgba(0,0,0,0.55)";
  context.fillRect(0, 8, 512, 112);
  context.textAlign = "center";
  context.fillStyle = "#fbbf24";
  context.font = "bold 44px Georgia, serif";
  context.fillText(name.slice(0, 40), 256, 58);
  context.fillStyle = "#e5e7eb";
  context.font = "28px system-ui, sans-serif";
  context.fillText(role.slice(0, 60), 256, 100);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.name = "aurion-npc-shell-label";
  sprite.scale.set(2, 0.5, 1);
  sprite.position.set(0, NPC_SHELL_BASE_HEIGHT_M + 0.45, 0);
  sprite.raycast = () => undefined;
  return sprite;
}

/** The nearest rendered NPC shell within range of a world position (admin E interaction). */
export function findNearestNpcShell(scene: THREE.Object3D, position: { x: number; z: number }, rangeMeters = NPC_SHELL_INTERACTION_RANGE_M): NpcShellTarget | null {
  let best: NpcShellTarget | null = null;
  let bestDistance = rangeMeters;
  scene.traverse(node => {
    const shell = node.userData.npcShell as NpcShellTarget | undefined;
    if (!shell) return;
    const distance = Math.hypot(shell.position.x - position.x, shell.position.z - position.z);
    if (distance <= bestDistance) { best = shell; bestDistance = distance; }
  });
  return best;
}
