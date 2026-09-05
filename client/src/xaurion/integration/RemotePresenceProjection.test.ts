import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { RemotePresenceProjection } from "./RemotePresenceProjection";

const actor = (userId: number, x = 0) => ({ entityId: `player:${userId}`, userId, position: { x, z: 0 }, lastAcceptedClientSeq: 0 });
describe("confirmed remote player projection", () => {
  it("projects only other confirmed users, updates positions, and removes departed users", () => {
    const scene = new THREE.Scene(); const projection = new RemotePresenceProjection(scene, 1, () => 2);
    projection.apply([actor(2, 3000), actor(1)]);
    expect(projection.mesh.count).toBe(1); expect(projection.presences.map(p => p.userId)).toEqual([2]);
    const matrix = new THREE.Matrix4(); projection.mesh.getMatrixAt(0, matrix); expect(matrix.elements[12]).toBe(3);
    projection.apply([actor(1)]); expect(projection.mesh.count).toBe(0); expect(projection.presences).toEqual([]);
    const geometry = vi.spyOn(projection.mesh.geometry, "dispose"); const material = vi.spyOn(projection.mesh.material as THREE.Material, "dispose");
    projection.dispose(); projection.dispose(); expect(scene.children).toHaveLength(0); expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1);
  });
  it("never applies a partial invalid snapshot or a failed terrain projection", () => {
    const scene = new THREE.Scene(); const projection = new RemotePresenceProjection(scene, 1, x => x === 4 ? Number.NaN : 0);
    projection.apply([actor(1), actor(2, 1000)]);
    const previous = projection.presences;
    for (const invalid of [[actor(2)], [actor(1), actor(2), actor(2)], [actor(1), actor(2, 14501)], [actor(1), actor(2, 4000)]]) expect(() => projection.apply(invalid)).toThrow();
    expect(projection.presences).toBe(previous); expect(projection.mesh.count).toBe(1); projection.dispose();
  });
});
