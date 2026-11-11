import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { isWorldRoadPositionMm, WORLD_ROAD_WIDTH_MM } from "@shared/worldRoadNetwork";
import { WORLD_CHUNK_SIZE_MM } from "@shared/worldChunkCoordinates";
import { buildWorldRoadGeometry, WORLD_ROAD_VIEW_RADIUS_CHUNKS, worldRoadCellsForChunk, worldRoadLiftM, WorldRoadProjection } from "./WorldRoadProjection";

const terrain = (x: number, z: number) => Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.8;

function triangles(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position"), index = geometry.getIndex()!;
  const out: THREE.Vector3[][] = [];
  for (let i = 0; i < index.count; i += 3) out.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k))));
  return out;
}

describe("canonical road network projection", () => {
  it.each([{ x: 0, z: 0 }, { x: 3, z: -2 }, { x: -7, z: 5 }])("draws exactly the road strips of chunk $x:$z", coordinate => {
    const geometry = buildWorldRoadGeometry(coordinate, terrain);
    const centerX = coordinate.x * WORLD_CHUNK_SIZE_MM / 1000, centerZ = coordinate.z * WORLD_CHUNK_SIZE_MM / 1000;
    let area = 0;
    for (const [a, b, c] of triangles(geometry)) {
      const centroid = a.clone().add(b).add(c).divideScalar(3);
      expect(isWorldRoadPositionMm(Math.round((centroid.x + centerX) * 1000), Math.round((centroid.z + centerZ) * 1000))).toBe(true);
      // Faces point up so the strip is lit and visible from above.
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      expect(normal.y).toBeGreaterThan(0);
      area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
      for (const vertex of [a, b, c]) {
        const x = vertex.x + centerX, z = vertex.z + centerZ;
        expect(vertex.y).toBeCloseTo(terrain(x, z) + worldRoadLiftM(x, z), 4);
      }
    }
    // One strip per axis through the whole chunk, minus the shared crossing.
    const chunkM = WORLD_CHUNK_SIZE_MM / 1000, roadM = WORLD_ROAD_WIDTH_MM / 1000;
    expect(area).toBeCloseTo(2 * chunkM * roadM - roadM * roadM, 3);
    expect(worldRoadCellsForChunk(coordinate)).toHaveLength((2 * chunkM * roadM - roadM * roadM) / 4);
    geometry.dispose();
  });

  it("keeps the roads of the chunks around the player and follows the ground once it is known", () => {
    const scene = new THREE.Scene();
    let ground = 0;
    const projection = new WorldRoadProjection(scene, () => ground);
    const side = 2 * WORLD_ROAD_VIEW_RADIUS_CHUNKS + 1;
    projection.update({ x: 1, z: 1 });
    const root = scene.getObjectByName("aurion-world-roads")!;
    expect(root.children).toHaveLength(side * side);
    expect(root.getObjectByName("aurion-world-road:0:0")).toBeDefined();

    projection.update({ x: 64 * 4, z: 1 });
    expect(root.children).toHaveLength(side * side);
    expect(root.getObjectByName("aurion-world-road:0:0")).toBeUndefined();
    expect(root.getObjectByName("aurion-world-road:4:0")).toBeDefined();

    const mesh = root.getObjectByName("aurion-world-road:4:0") as THREE.Mesh;
    const before = mesh.geometry.getAttribute("position").getY(0);
    ground = 3;
    projection.update({ x: 64 * 4, z: 1 }, 1);
    expect(mesh.geometry.getAttribute("position").getY(0)).toBeCloseTo(before + 3, 5);

    // A ground decal: pointer/admin rays pass through to the world below.
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(new THREE.Vector3(258, 50, 1), new THREE.Vector3(0, -1, 0)), hits);
    expect(hits).toHaveLength(0);

    projection.dispose();
    expect(scene.getObjectByName("aurion-world-roads")).toBeUndefined();
  });
});
