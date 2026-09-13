import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { TreeCatalogReplacement } from "./TreeCatalogReplacement";

const sha = "a".repeat(64);
const catalog: GlbRuntimeCatalog = { version: "aurion.glb-import.v1", revision: "b".repeat(64), entries: [{ assetId: "glb_tree_test", sha256: sha, displayName: "World Nature · tree · Oak", purpose: "world-nature", assetType: "arena", subcategory: "tree", storageUrl: `/api/assets/glb/${sha}.glb`, targetKey: null, equipmentSlot: null }] };

function setup(count = 1) {
  const scene = new THREE.Scene();
  const originals: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const tree = new THREE.Group();
    tree.name = `tree-${i}`;
    tree.position.set(i, 0, 0);
    tree.userData.aurionVisualKind = "tree";
    tree.userData.aurionTreeHeightMeters = 7;
    tree.add(new THREE.Mesh(new THREE.BoxGeometry(1, 7, 1), new THREE.MeshStandardMaterial()));
    scene.add(tree); originals.push(tree);
  }
  const engine = { scene, player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 2 } } };
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  mesh.position.y = 1; model.add(mesh);
  return { engine, scene, originals, model, mesh };
}

async function ready(projection: TreeCatalogReplacement) {
  projection.setCatalog(catalog); projection.update(1);
  await Promise.resolve(); await Promise.resolve();
  projection.update(1);
}

describe("approved tree presentation replacement", () => {
  it("replaces tagged trees only after loading and grounds one shared instance at authored height", async () => {
    const s = setup();
    const unrelated = new THREE.Group(); s.scene.add(unrelated);
    let resolve!: (value: { scene: THREE.Group; animations: [] }) => void;
    const p = new TreeCatalogReplacement(s.engine as never, () => new Promise(r => { resolve = r; }));
    p.setCatalog(catalog); p.update(1);
    expect(s.originals[0]!.visible).toBe(true);
    resolve({ scene: s.model, animations: [] }); await Promise.resolve(); p.update(1);
    expect(s.originals[0]!.visible).toBe(false); expect(unrelated.visible).toBe(true);
    const instance = s.scene.getObjectByName("aurion-catalog-tree-replacements") as THREE.InstancedMesh;
    expect(instance.geometry).toBe(s.mesh.geometry);
    const transform = new THREE.Matrix4(); instance.getMatrixAt(0, transform);
    s.mesh.geometry.computeBoundingBox();
    const bounds = s.mesh.geometry.boundingBox!.clone().applyMatrix4(transform);
    expect(bounds.min.y).toBeCloseTo(2); expect(bounds.max.y - bounds.min.y).toBeCloseTo(7);
    expect(p.evidence()).toMatchObject({ replaced: 1, drawCalls: 1, trianglesPerModel: 12, sha256: sha });
    p.dispose(); expect(s.originals[0]!.visible).toBe(true);
  });

  it("caps phone instances and restores the old trees when they leave the near range", async () => {
    const previous = window.innerWidth; Object.defineProperty(window, "innerWidth", { value: 412, configurable: true });
    const s = setup(40); const p = new TreeCatalogReplacement(s.engine as never, async () => ({ scene: s.model, animations: [] }));
    await ready(p);
    expect(p.evidence().replaced).toBe(16);
    expect(s.originals.filter(g => !g.visible)).toHaveLength(16);
    s.engine.player.position.x = 1000; p.update(1);
    expect(p.evidence().replaced).toBe(0); expect(s.originals.every(g => g.visible)).toBe(true);
    p.dispose(); Object.defineProperty(window, "innerWidth", { value: previous, configurable: true });
  });

  it("keeps procedural trees on decode failure and bounds retries", async () => {
    const s = setup(); const load = vi.fn(async () => { throw Error("unavailable"); });
    const p = new TreeCatalogReplacement(s.engine as never, load);
    p.setCatalog(catalog);
    for (let i = 0; i < 10; i++) { p.update(6); await Promise.resolve(); }
    expect(load).toHaveBeenCalledTimes(3); expect(s.originals[0]!.visible).toBe(true);
    expect(p.evidence().replaced).toBe(0); p.dispose();
  });

  it("rejects over-budget assets and unrelated purposes", async () => {
    const s = setup(); s.mesh.geometry = new THREE.SphereGeometry(1, 48, 32);
    const p = new TreeCatalogReplacement(s.engine as never, async () => ({ scene: s.model, animations: [] }));
    await ready(p); expect(s.originals[0]!.visible).toBe(true); expect(p.evidence().failures).toBe(1); p.dispose();
    const load = vi.fn(); const q = new TreeCatalogReplacement(s.engine as never, load);
    q.setCatalog({ ...catalog, entries: [{ ...catalog.entries[0]!, purpose: "equipment" }] }); q.update(1);
    expect(load).not.toHaveBeenCalled(); q.dispose();
  });

  it("restores visuals on revocation and rejects a late completion after disposal", async () => {
    const s = setup(); const p = new TreeCatalogReplacement(s.engine as never, async () => ({ scene: s.model, animations: [] }));
    await ready(p); p.setCatalog({ ...catalog, revision: "c".repeat(64), entries: [] });
    expect(s.originals[0]!.visible).toBe(true); expect(p.evidence().replaced).toBe(0); p.dispose();
    const next = setup(); let resolve!: (value: { scene: THREE.Group; animations: [] }) => void;
    const q = new TreeCatalogReplacement(next.engine as never, () => new Promise(r => { resolve = r; }));
    q.setCatalog(catalog); q.update(1); q.dispose(); resolve({ scene: next.model, animations: [] }); await Promise.resolve();
    expect(next.originals[0]!.visible).toBe(true); expect(next.scene.getObjectByName("aurion-catalog-tree-replacements")).toBeUndefined();
  });
});
