import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { findProceduralNpcVisual, NpcFallbackProjection } from "./NpcFallbackProjection";
import { UploadedWorldCatalogProjection } from "./UploadedWorldCatalogProjection";
import { WORLD_VISUAL_OVERRIDE_SCHEMA, WORLD_VISUAL_READBACK_CHANGED_EVENT, WORLD_VISUALS_CHANGED_EVENT } from "@shared/worldVisualOverrideContract";

describe("procedural NPC visual boundary", () => {
  it("selects only the cylinder/head body and leaves the quest marker outside replacement", () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.set(12, 3, -8);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 8), new THREE.MeshStandardMaterial());
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial());
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshBasicMaterial());
    group.add(body, head, marker);
    scene.add(group);

    const result = findProceduralNpcVisual(scene, { x: 12, z: -8 } as any);
    expect(result?.group).toBe(group);
    expect(result?.body).toEqual([body, head]);
    expect(result?.body).not.toContain(marker);
  });

  it("does not mistake unrelated scene geometry for an NPC", () => {
    const scene = new THREE.Scene();
    const structure = new THREE.Group();
    structure.position.set(4, 0, 9);
    structure.add(new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshStandardMaterial()));
    structure.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()));
    scene.add(structure);
    expect(findProceduralNpcVisual(scene, { x: 4, z: 9 } as any)).toBeNull();
  });
});

/**
 * Regression: a visual change after a refresh started must not be dropped by the
 * refreshBusy guard. An older in-flight read must be followed by one fresh read.
 * This is an isolated transport test, not production or gameplay evidence.
 */
describe("admin world-visual refresh ordering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("coalesces changes during an in-flight refresh and projects the newest server readback", async () => {
    const worldId = "aurion-world";
    const oldReadback = {
      schemaVersion: WORLD_VISUAL_OVERRIDE_SCHEMA, worldId, overrides: [],
      revisions: {}, readbackHash: "a".repeat(64),
    };
    const newReadback = {
      schemaVersion: WORLD_VISUAL_OVERRIDE_SCHEMA, worldId,
      overrides: [{ placementRef: "uploaded:0:0:2", targetKind: "uploaded_anchor", assetId: "glb_new_house", revision: 1 }],
      revisions: { "uploaded:0:0:2": 1 }, readbackHash: "b".repeat(64),
    };
    let resolveOld!: (value: Response) => void;
    const pendingOld = new Promise<Response>(resolve => { resolveOld = resolve; });
    const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
    let overrideReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/game/glb-catalog") return response({
        version: "aurion.glb-import.v1", revision: "c".repeat(64), entries: [],
      });
      if (String(input) === "/api/game/world-design") return response({}, false);
      if (String(input) === "/api/game/world-visual-overrides") {
        overrideReads += 1;
        return overrideReads === 1 ? pendingOld : response(newReadback);
      }
      throw new Error("UNEXPECTED_FETCH");
    });
    const projected = vi.spyOn(UploadedWorldCatalogProjection.prototype, "setVisualOverrides");
    // Each *changed* confirmed readback tells the procedural world plan to re-read itself.
    const planReread = vi.fn(); window.addEventListener(WORLD_VISUAL_READBACK_CHANGED_EVENT, planReread);
    const projection = new NpcFallbackProjection({
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 0 } },
      mobManager: { mobs: [] }, npcs: [],
    } as never);
    try {
      await vi.waitFor(() => expect(overrideReads).toBe(1));
      // Both mutations happen while the first read is still in flight.
      window.dispatchEvent(new Event(WORLD_VISUALS_CHANGED_EVENT));
      window.dispatchEvent(new Event(WORLD_VISUALS_CHANGED_EVENT));
      resolveOld(response(oldReadback));
      await vi.waitFor(() => expect(overrideReads).toBe(2));
      await vi.waitFor(() => expect(projected).toHaveBeenLastCalledWith(newReadback));
      expect(overrideReads).toBe(2); // coalesced, not an unbounded refresh loop
      expect(planReread).toHaveBeenCalledTimes(2); // old readback, then the new one
      // The same readback again changes nothing and must not trigger another plan read.
      window.dispatchEvent(new Event(WORLD_VISUALS_CHANGED_EVENT));
      await vi.waitFor(() => expect(overrideReads).toBe(3));
      await vi.waitFor(() => expect(projected).toHaveBeenCalledTimes(3));
      expect(planReread).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(WORLD_VISUAL_READBACK_CHANGED_EVENT, planReread);
      projection.dispose();
    }
  });
});
