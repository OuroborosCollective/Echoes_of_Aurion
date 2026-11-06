import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { buildPlacementDraft } from "@shared/adminPlacementPlan";
import { glbManager } from "../core/GLBModelManager";
import * as lease from "../core/GlbModelLease";
import { ADMIN_PLACEMENT_FALLBACK_DISTANCE_M, ADMIN_PLACEMENT_MAX_DISTANCE_M, AdminPlacementGhost } from "./AdminPlacementGhost";
import { UploadedWorldCatalogProjection } from "./UploadedWorldCatalogProjection";

const sha = "e".repeat(64);
const tower = { assetId: "glb_tower", sha256: sha, displayName: "Turm", purpose: "world-environment", assetType: "arena", targetKey: null,
  subcategory: "building", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` } as GlbCatalogEntry;

function box() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshStandardMaterial());
  mesh.position.set(5, 2, -3); // off-centre source model
  scene.add(mesh);
  return { scene, animations: [], lodLevels: [0] };
}

function engine(options: { player?: THREE.Vector3; pointerHit?: { x: number; y: number; z: number } | null; camera?: { position: THREE.Vector3; lookAt: THREE.Vector3 } } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(options.camera?.position ?? new THREE.Vector3(0, 6, 8));
  camera.lookAt(options.camera?.lookAt ?? new THREE.Vector3(0, 1.5, 0));
  camera.updateMatrixWorld(true);
  return {
    scene: new THREE.Scene(),
    camera,
    player: { position: options.player ?? new THREE.Vector3(0, 0, 0) },
    landscape: { chunkManager: { getElevationAt: () => 0 } },
    projectTouchDestination: vi.fn(() => options.pointerHit ?? null),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("floating admin placement preview", () => {
  it("follows the mouse on the ground, snapped to the 25 cm grid, and reports the exact placement", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const world = engine({ pointerHit: { x: 3.13, y: 0, z: -7.38 } });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 100, y: 100 });
    ghost.rotate();
    ghost.setScalePermille(1_500);
    ghost.update();
    expect(ghost.root.visible).toBe(true);
    expect(ghost.root.position.toArray()).toEqual([3.25, 0, -7.5]);
    expect(ghost.placementInput()).toEqual({ assetId: "glb_tower", worldXMm: 3_250, worldZMm: -7_500, rotationQuarterTurns: 1, scalePermille: 1_500 });
    ghost.dispose();
  });

  it("hides instead of placing far away when the pointer aims beyond reach", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const ghost = new AdminPlacementGhost(engine({ pointerHit: { x: ADMIN_PLACEMENT_MAX_DISTANCE_M + 5, y: 0, z: 0 } }));
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 1, y: 1 });
    ghost.update();
    expect(ghost.root.visible).toBe(false);
    expect(ghost.placementInput()).toBeNull();
    ghost.dispose();
  });

  // Mouse and touch are distinct contracts: mouse only follows its actual hit;
  // touch has no mouse cursor and intentionally uses the camera aim.
  it("hides on a missing mouse hit but keeps third-person camera placement for touch", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const world = engine({ pointerHit: null });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 200, y: 200 }); // active mouse cursor, no ground hit
    ghost.update();
    expect(ghost.root.visible).toBe(false);
    expect(ghost.placementInput()).toBeNull();
    ghost.setPointer(null); // actual touch path from AdminPlacement.tsx
    ghost.update();
    expect(ghost.root.visible).toBe(true);
    expect(ghost.placementInput()!.worldZMm).toBeLessThan(-1_000);
    ghost.dispose();
  });

  it("rejects a grid-snapped point beyond the 40 m placement limit", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const world = engine({ player: new THREE.Vector3(-0.1, 0, 0), pointerHit: { x: 39.89, y: 0, z: 0 } });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 200, y: 200 });
    ghost.update();
    expect(ghost.root.visible).toBe(false);
    expect(ghost.placementInput()).toBeNull();
    ghost.dispose();
  });

  it("aims past the character with a third-person camera, never at its feet", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const ghost = new AdminPlacementGhost(engine());
    await ghost.setAsset(tower);
    ghost.update();
    const input = ghost.placementInput()!;
    // Camera behind (+z) looking at the player: the preview lands in front (-z), beyond the player.
    expect(input.worldZMm).toBeLessThan(-1_000);
    expect(Math.abs(input.worldXMm)).toBeLessThanOrEqual(250);
    ghost.dispose();
  });

  it("falls back to a point in front of the player when the view does not meet the ground", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const world = engine({ camera: { position: new THREE.Vector3(0, 2, 5), lookAt: new THREE.Vector3(0, 3, -5) } });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.update();
    const input = ghost.placementInput()!;
    expect(Math.hypot(input.worldXMm, input.worldZMm) / 1000).toBeCloseTo(ADMIN_PLACEMENT_FALLBACK_DISTANCE_M, 0);
    expect(input.worldZMm).toBeLessThan(0);
    ghost.dispose();
  });

  it("previews with the same scale and anchor as the persisted projection renders", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const world = engine({ pointerHit: { x: 6, y: 0, z: 4 } });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 1, y: 1 });
    ghost.setScalePermille(2_000);
    ghost.update();
    ghost.root.updateMatrixWorld(true);
    const previewBounds = new THREE.Box3().setFromObject(ghost.root, true);

    const draft = buildPlacementDraft(null, "a".repeat(64), ghost.placementInput()!);
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: world.player, landscape: world.landscape } as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [tower] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{ ...draft, designHash: "c".repeat(64), placements: draft.placements }] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    let holder: THREE.Object3D | null = null;
    projection.root.traverse(node => { if (node.userData.worldVisualTarget?.targetKind === "authored_placement") holder = node; });
    expect(holder).not.toBeNull();
    projection.root.updateMatrixWorld(true);
    const persistedBounds = new THREE.Box3().setFromObject(holder!, true);
    for (const axis of ["x", "y", "z"] as const) {
      expect(persistedBounds.min[axis]).toBeCloseTo(previewBounds.min[axis], 4);
      expect(persistedBounds.max[axis]).toBeCloseTo(previewBounds.max[axis], 4);
    }
    projection.dispose();
    ghost.dispose();
  });

  it("is translucent, never a raycast target and releases its model and materials", async () => {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    const release = vi.spyOn(lease, "releaseGlbTree");
    const world = engine({ pointerHit: { x: 0, y: 0, z: -4 } });
    const ghost = new AdminPlacementGhost(world);
    await ghost.setAsset(tower);
    ghost.setPointer({ x: 1, y: 1 });
    ghost.update();
    const meshes: THREE.Mesh[] = [];
    ghost.root.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
    expect(meshes.every(mesh => (mesh.material as THREE.Material).transparent && (mesh.material as THREE.Material).opacity < 1)).toBe(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 10, -4), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(world.scene, true)).toHaveLength(0);
    const dispose = vi.spyOn(meshes[0]!.material as THREE.Material, "dispose");
    ghost.dispose();
    expect(release).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    expect(world.scene.children).not.toContain(ghost.root);
  });

  it("drops a model that finishes loading after the admin already chose another one", async () => {
    let resolveFirst: (value: ReturnType<typeof box>) => void = () => undefined;
    vi.spyOn(glbManager, "loadStaticLodFamily")
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementation(async () => box());
    const release = vi.spyOn(lease, "releaseGlbTree");
    const ghost = new AdminPlacementGhost(engine());
    const first = ghost.setAsset(tower);
    await ghost.setAsset({ ...tower, assetId: "glb_other" });
    const late = box();
    resolveFirst(late);
    await first;
    expect(release).toHaveBeenCalledWith(late.scene);
    expect(ghost.placementInput()?.assetId).toBe("glb_other");
    ghost.dispose();
  });
});
