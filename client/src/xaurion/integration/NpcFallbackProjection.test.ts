import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { findProceduralNpcVisual } from "./NpcFallbackProjection";

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
