import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { RemotePublicAppearanceProjection } from "./RemotePublicAppearanceProjection";
import { CONFIRMED_REMOTE_PRESENCES_EVENT } from "./RemotePresenceProjection";
import { glbManager } from "../core/GLBModelManager";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("confirmed public appearance replacement", () => {
  it("retains the old GLB while a replacement fails admission, then replaces it and honors revocation", async () => {
    const scene = new THREE.Scene();
    const engine = { scene, player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 0 } } };
    const appearance = (letter: string) => ({ userId: 7, assetId: `glb_${letter}`, displayName: "Remote", storageUrl: `/api/assets/glb/${letter.repeat(64)}.glb` });
    let appearances = [appearance("a")];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ appearances }) })));
    const load = vi.spyOn(glbManager, "loadModel");
    const model = () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
      return { scene: group, animations: [new THREE.AnimationClip("Idle", 1, [])] };
    };
    load.mockResolvedValueOnce(model());
    const p = new RemotePublicAppearanceProjection(engine as never);
    const presence = (x: number) => window.dispatchEvent(new CustomEvent(CONFIRMED_REMOTE_PRESENCES_EVENT, {
      detail: { presences: [{ userId: 7, entityId: "player:7", position: { x, z: 0 } }] },
    }));
    try {
      presence(1000); await settle(); p.update(.1, 1); await settle(); p.update(.1, 2);
      const original = p.root.children[0]!;
      expect(original.visible).toBe(true);
      appearances = [appearance("b")];
      p.update(.1, 200); await settle();
      load.mockRejectedValueOnce(new Error("GLB_ACTOR_BUDGET"));
      presence(2000); p.update(.1, 201); await settle();
      expect(p.root.children[0]).toBe(original);
      expect(original.visible).toBe(true);
      expect(original.position.x).toBe(2);
      expect(p.evidence().activeSkinnedActors).toBe(1);
      const noIdle = model(); noIdle.animations = [new THREE.AnimationClip("Gesture", 1, [])];
      load.mockResolvedValueOnce(noIdle);
      p.update(.1, 202); await settle();
      expect(original.visible).toBe(true);
      load.mockResolvedValueOnce(model());
      p.update(.1, 203); await settle(); p.update(.1, 204);
      expect(p.root.children).toHaveLength(1);
      expect(p.root.children[0]).not.toBe(original);
      expect(p.root.children[0]!.visible).toBe(true);
      expect(p.evidence().users[0]!.physicalStorageUrl).toBe(appearance("b").storageUrl);
      appearances = [];
      p.update(.1, 400); await settle();
      expect(p.root.children).toHaveLength(0);
    } finally { p.dispose(); }
  });
});
