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

  // Review (Devin, #1328): a shell removed while its model loaded was drawn anyway.
  it("never draws a shell that was removed while its model was still loading", async () => {
    let finish: (value: ReturnType<typeof character>) => void = () => undefined;
    vi.spyOn(glbManager, "loadModel").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger")] }]));
    projection.update(0.016);
    projection.setWorldDesign(design([], "d"));
    projection.update(0.016);
    finish(character());
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(projection.evidence().rendered).toBe(0);
    projection.dispose();
  });

  // Review (Devin, CodeRabbit, #1328): a failed render (terrain not ready, load error) stayed invisible for good.
  it("retries a shell whose terrain was not ready or whose model failed, with a back-off", async () => {
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const load = vi.spyOn(glbManager, "loadModel").mockRejectedValueOnce(new Error("NETWORK")).mockImplementation(async () => character());
    let terrainReady = false;
    const world = { scene: new THREE.Scene(), player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => (terrainReady ? 0 : Number.NaN) } } };
    const projection = new NpcShellProjection(world);
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger")] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0)); // load error
    now += 5_000; projection.update(0.016);
    expect(load).toHaveBeenCalledTimes(1); // back-off not yet passed
    now += 6_000; projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0)); // terrain not ready
    expect(load).toHaveBeenCalledTimes(2);
    expect(projection.evidence().rendered).toBe(0);
    terrainReady = true;
    now += 2_500; projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(1));
  });

  it("shows the confirmed purpose (name, role, dialogue) on its shell and follows changes", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger"), placement("p.000000000002", "glb_ranger", 34_000)] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(2));
    const purpose = (role: string) => ({ schemaVersion: "aurion.npc-purpose.v1" as const, shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", displayName: "Mira", role,
      persona: "Ruhig und neugierig.", greeting: "Willkommen.", topics: [{ topic: "Kräuter", line: "Silberblatt." }], routine: [{ label: "Beet", offsetXMm: 0, offsetZMm: 0, dwellSeconds: 60 }], questIdeas: [] });
    projection.setPurposes({ schemaVersion: "aurion.npc-purpose.v1", revision: "1".repeat(64), purposes: [{ shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", purposeHash: "a".repeat(64), receiptId: "authoring:npc:1", purpose: purpose("Händlerin") }] });
    const [first, second] = shells(projection);
    expect(first!.purpose).toMatchObject({ displayName: "Mira", role: "Händlerin", greeting: "Willkommen.", purposeHash: "a".repeat(64) });
    expect(second!.purpose).toBeUndefined();
    projection.setPurposes({ schemaVersion: "aurion.npc-purpose.v1", revision: "2".repeat(64), purposes: [{ shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", purposeHash: "b".repeat(64), receiptId: "authoring:npc:2", purpose: purpose("Heilerin") }] });
    expect(shells(projection)[0]!.purpose?.role).toBe("Heilerin");
    projection.setPurposes(null);
    expect(shells(projection)[0]!.purpose).toBeUndefined();
    projection.dispose();
  });

  // Review (Devin, #1329): every purpose revision replaced name labels without freeing their textures.
  it("frees the old name label texture and material when a purpose changes", async () => {
    vi.spyOn(glbManager, "loadModel").mockImplementation(async () => character());
    const context = { fillRect: vi.fn(), fillText: vi.fn(), set fillStyle(_value: string) {}, set font(_value: string) {}, set textAlign(_value: string) {} };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const projection = new NpcShellProjection(engine());
    projection.setCatalog(catalog([ranger]));
    projection.setWorldDesign(design([{ designKey: "npc.shells.1a2b3c4d", placements: [placement("p.000000000001", "glb_ranger")] }]));
    projection.update(0.016);
    await vi.waitFor(() => expect(projection.evidence().rendered).toBe(1));
    const purpose = (role: string) => ({ schemaVersion: "aurion.npc-purpose.v1" as const, shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", displayName: "Mira", role,
      persona: "Ruhig und neugierig.", greeting: "Willkommen.", topics: [{ topic: "Kräuter", line: "Silberblatt." }], routine: [{ label: "Beet", offsetXMm: 0, offsetZMm: 0, dwellSeconds: 60 }], questIdeas: [] });
    projection.setPurposes({ schemaVersion: "aurion.npc-purpose.v1", revision: "1".repeat(64), purposes: [{ shellRef: purpose("a").shellRef, purposeHash: "a".repeat(64), receiptId: "r1", purpose: purpose("Händlerin") }] });
    const first = projection.root.getObjectByName("aurion-npc-shell-label") as THREE.Sprite;
    expect(first).toBeTruthy();
    const textureDispose = vi.spyOn(first.material.map!, "dispose");
    const materialDispose = vi.spyOn(first.material, "dispose");
    projection.setPurposes({ schemaVersion: "aurion.npc-purpose.v1", revision: "2".repeat(64), purposes: [{ shellRef: purpose("a").shellRef, purposeHash: "b".repeat(64), receiptId: "r2", purpose: purpose("Heilerin") }] });
    expect(textureDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    const labels: THREE.Object3D[] = [];
    projection.root.traverse(node => { if (node.name === "aurion-npc-shell-label") labels.push(node); });
    expect(labels).toHaveLength(1);
    projection.dispose();
  });
});
