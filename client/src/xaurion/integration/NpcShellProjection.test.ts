import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbCatalogEntry, GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { WorldDesignReadback } from "@shared/aurionAuthoringContract";
import { buildPlacementDraft } from "@shared/adminPlacementPlan";
import { glbManager } from "../core/GLBModelManager";
import * as lease from "../core/GlbModelLease";
import { AdminPlacementGhost } from "./AdminPlacementGhost";
import { MAX_RENDERED_NPC_SHELLS, NPC_SHELL_ANIMATION_RANGE_M, NPC_SHELL_BASE_HEIGHT_M, NpcShellProjection, findNearestNpcShell, type NpcShellTarget } from "./NpcShellProjection";

const sha = (digit: string) => digit.repeat(64);
const entry = (assetId: string, digit: string, overrides: Partial<GlbCatalogEntry> = {}) => ({ assetId, sha256: sha(digit), displayName: `Figur ${assetId}`, purpose: "npc-fallback", assetType: "character",
  targetKey: null, subcategory: null, equipmentSlot: null, storageUrl: `/api/assets/glb/${sha(digit)}.glb`, ...overrides }) as GlbCatalogEntry;
const ranger = entry("glb_ranger", "1");
const playerModel = entry("glb_player_hero", "2", { purpose: "player-public" });
const barrel = entry("glb_barrel", "3", { assetType: "arena", purpose: "world-environment" });
const catalog = (entries: GlbCatalogEntry[]): GlbRuntimeCatalog => ({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries });
const placement = (key: string, assetId: string, xMm = 32_000, zMm = 32_000, extra: Partial<{ rotationQuarterTurns: 0 | 1 | 2 | 3; scalePermille: number; chunkX: number }> = {}) =>
  ({ placementKey: key, assetId, chunkX: extra.chunkX ?? 0, chunkZ: 0, xMm, zMm, rotationQuarterTurns: extra.rotationQuarterTurns ?? 0, scalePermille: extra.scalePermille ?? 1000 });
const design = (designs: Array<{ designKey: string; placements: ReturnType<typeof placement>[] }>, revision = "b"): WorldDesignReadback => ({ schemaVersion: "aurion.world-design.v1", revision: revision.repeat(64),
  designs: designs.map(item => ({ ...item, version: 1, title: "NPC-Hüllen", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64) })) });

function character() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.4), new THREE.MeshStandardMaterial()));
  const idle = new THREE.AnimationClip("Idle", 1, [new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 0, 0.02, 0])]);
  return { scene, animations: [idle] };
}
function engine(player = new THREE.Vector3(0, 0, 0)) {
  return { scene: new THREE.Scene(), player: { position: player }, landscape: { chunkManager: { getElevationAt: () => 1.5 } } };
}
function shells(projection: NpcShellProjection): NpcShellTarget[] {
  const found: NpcShellTarget[] = [];
  projection.root.traverse(node => { if (node.userData.npcShell) found.push(node.userData.npcShell); });
  return found.sort((a, b) => a.shellRef.localeCompare(b.shellRef));
}

afterEach(() => vi.restoreAllMocks());

describe("NPC shell projection", () => {
  it("shows a confirmed shell as an idle character at its place, addressable for the admin tools", async () => {
    const load = vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const world = engine();
    const projection = new NpcShellProjection(world);
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger", 34_000, 30_000, { rotationQuarterTurns: 1, scalePermille: 1500 })] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(1));
    expect(load).toHaveBeenCalledWith(ranger.storageUrl, ranger.normalization);
    const [shell] = shells(projection);
    expect(shell).toMatchObject({ shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", designKey: "npc.shells.1a2b3c4d", placementKey: "p.000000000001", assetId: "glb_ranger", position: { x: 2, y: 1.5, z: -2 } });
    const holder = projection.root.getObjectByName("aurion-npc-shell:npc.shells.1a2b3c4d:p.000000000001")!;
    expect(holder.rotation.y).toBeCloseTo(Math.PI / 2);
    holder.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(holder, true);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(NPC_SHELL_BASE_HEIGHT_M * 1.5, 3);
    expect(bounds.min.y).toBeCloseTo(1.5, 3); // stands on the terrain
    projection.dispose();
  });

  it("ignores object groups, World Designs, player characters and props: only free NPC figures in npc.shells groups", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger, playerModel, barrel]));
    projection.setWorldDesign(design([
      { designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger"), placement("p.000000000002", "glb_player_hero"), placement("p.000000000003", "glb_barrel")] },
      { designKey: "admin.placements.1a2b3c4d", placements: [placement("p.000000000004", "glb_ranger")] },
      { designKey: "village", placements: [placement("well", "glb_ranger")] },
    ]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(shells(projection).map(shell => shell.shellRef)).toEqual(["authored:npc.shells.1a2b3c4d:p.000000000001"]);
    projection.dispose();
  });

  it("renders only nearby shells, at most the cap, and drops a shell when its group is retired", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const release = vi.spyOn(lease, "releaseGlbTree");
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger]));
    const many = Array.from({ length: MAX_RENDERED_NPC_SHELLS + 6 }, (_, i) => placement(`p.${String(i).padStart(12, "0")}`, "glb_ranger", 30_000 + i * 250));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [...many, placement("p.far000000000", "glb_ranger", 32_000, 32_000, { chunkX: 5 })] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence()).toMatchObject({ rendered: MAX_RENDERED_NPC_SHELLS, pending: 0 }));
    expect(shells(projection).some(shell => shell.placementKey === "p.far000000000")).toBe(false);
    projection.setWorldDesign(design([], "d"));
    projection.update(0.016);
    expect(projection.evidence().rendered).toBe(0);
    expect(release).toHaveBeenCalled();
    projection.dispose();
  });

  it("finds the nearest shell within interaction range only", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger", 33_000), placement("p.000000000002", "glb_ranger", 35_000)] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(2));
    expect(findNearestNpcShell(projection.root, { x: 0.5, z: 0 })?.placementKey).toBe("p.000000000001");
    expect(findNearestNpcShell(projection.root, { x: 3.2, z: 0 })?.placementKey).toBe("p.000000000002");
    expect(findNearestNpcShell(projection.root, { x: 20, z: 0 })).toBeNull();
    projection.dispose();
  });

  it("previews a shell in the placement mode with exactly the size the projection renders", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const loadStatic = vi.spyOn(glbManager, "loadStaticLodFamily");
    const world = { ...engine(), camera: new THREE.PerspectiveCamera(), projectTouchDestination: () => ({ x: 3, y: 0, z: -2 }) };
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(ranger);
    expect(loadStatic).not.toHaveBeenCalled();
    ghost.setPointer({ x: 1, y: 1 });
    ghost.setScalePermille(2_000);
    ghost.update();
    ghost.root.updateMatrixWorld(true);
    const preview = new THREE.Box3().setFromObject(ghost.root, true);
    const draft = buildPlacementDraft(null, "a".repeat(64), ghost.placementInput()!, undefined, "npc-shell");
    expect(draft.designKey).toMatch(/^npc\.shells\./);
    const projection = new NpcShellProjection(world);
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: draft.designKey, placements: draft.placements }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(1));
    projection.root.updateMatrixWorld(true);
    const persisted = new THREE.Box3().setFromObject(projection.root, true);
    for (const axis of ["x", "y", "z"] as const) {
      expect(persisted.min[axis]).toBeCloseTo(preview.min[axis], 3);
      expect(persisted.max[axis]).toBeCloseTo(preview.max[axis], 3);
    }
    projection.dispose();
    ghost.dispose();
  });

  it("animates only shells near the player", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const player = new THREE.Vector3(0, 0, 0);
    const projection = new NpcShellProjection(engine(player));
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger", 33_000), placement("p.000000000002", "glb_ranger", 32_000, 32_000, { chunkX: 1 })] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(2));
    const { AnimatedGlbActor } = await import("../core/AnimatedGlbActor");
    const update = vi.spyOn(AnimatedGlbActor.prototype, "update");
    projection.update(0.016);
    // The shell 1 m away animates; the one 64 m away (rendered, next chunk) stands still.
    expect(64).toBeGreaterThan(NPC_SHELL_ANIMATION_RANGE_M);
    expect(update).toHaveBeenCalledTimes(1);
    projection.dispose();
  });
});
