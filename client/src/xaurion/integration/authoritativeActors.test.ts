import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DeterministicSimulation } from "@shared/deterministicSimulation";
import { SimulatedRealmPlayers } from "../entities/SimulatedRealmPlayers";

describe("standalone actors excluded from the production projection", () => {
  it("removes all fixture actors and disposes shared materials once, including repeated teardown", () => {
    const scene = new THREE.Scene();
    const actors = new SimulatedRealmPlayers(scene, new DeterministicSimulation("isolated-actor-test", 0));
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    const disposals = [...materials, ...geometries].map(resource => vi.spyOn(resource, "dispose"));
    expect(actors.getPlayers()).toHaveLength(6);
    actors.dispose(); actors.update(0.1); actors.dispose();
    expect(actors.getPlayers()).toEqual([]);
    expect(scene.children).toHaveLength(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });
});
