import * as THREE from "three";
import { WORLD_CHUNK_SIZE_MM } from "@shared/worldChunkCoordinates";
import { splitWorldChunkPositionMm, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import { isWorldRoadPositionMm } from "@shared/worldRoadNetwork";
import { touchesStarterCityGround } from "../world/starterCityGround";

/** Road cells are 2 m squares: half a road width, aligned to the 4 m base-chunk tiles. */
export const WORLD_ROAD_CELL_MM = 2_000 as const;
/** Chunks around the player whose roads are drawn (2 => 5 x 5 base chunks). */
export const WORLD_ROAD_VIEW_RADIUS_CHUNKS = 2 as const;
const HEIGHT_REFRESH_SECONDS = 0.5;
const CELLS_PER_CHUNK = WORLD_CHUNK_SIZE_MM / WORLD_ROAD_CELL_MM;

/** The road lies just above the ground; on the flat city floor a thin lift suffices. */
export function worldRoadLiftM(x: number, z: number): number {
  return touchesStarterCityGround(x, z) ? 0.03 : 0.12;
}

/** Min corners (world mm) of every road cell of one base chunk, from the canonical road predicate. */
export function worldRoadCellsForChunk(coordinate: WorldChunkCoordinate): { xMm: number; zMm: number }[] {
  const originX = coordinate.x * WORLD_CHUNK_SIZE_MM - WORLD_CHUNK_SIZE_MM / 2;
  const originZ = coordinate.z * WORLD_CHUNK_SIZE_MM - WORLD_CHUNK_SIZE_MM / 2;
  const cells: { xMm: number; zMm: number }[] = [];
  for (let j = 0; j < CELLS_PER_CHUNK; j++) for (let i = 0; i < CELLS_PER_CHUNK; i++) {
    const xMm = originX + i * WORLD_ROAD_CELL_MM, zMm = originZ + j * WORLD_ROAD_CELL_MM;
    if (isWorldRoadPositionMm(xMm + WORLD_ROAD_CELL_MM / 2, zMm + WORLD_ROAD_CELL_MM / 2)) cells.push({ xMm, zMm });
  }
  return cells;
}

const tint = (xMm: number, zMm: number) => {
  // Deterministic per-vertex shade so the strip reads as trodden ground, not a flat band.
  let h = (Math.imul(xMm | 0, 0x27d4eb2d) ^ Math.imul(zMm | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return 0.86 + ((h >>> 8) & 0xff) / 255 * 0.14;
};

/**
 * Terrain-following road surface of one base chunk, in chunk-local metres.
 * Presentation of the canonical road network only: no road, collision or terrain truth.
 */
export function buildWorldRoadGeometry(coordinate: WorldChunkCoordinate, terrain: (x: number, z: number) => number): THREE.BufferGeometry {
  const centerX = coordinate.x * WORLD_CHUNK_SIZE_MM, centerZ = coordinate.z * WORLD_CHUNK_SIZE_MM;
  const index = new Map<string, number>();
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const vertex = (xMm: number, zMm: number) => {
    const key = `${xMm}:${zMm}`;
    let id = index.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      index.set(key, id);
      const x = xMm / 1000, z = zMm / 1000;
      positions.push((xMm - centerX) / 1000, terrain(x, z) + worldRoadLiftM(x, z), (zMm - centerZ) / 1000);
      const shade = tint(xMm, zMm);
      colors.push(shade, shade, shade);
    }
    return id;
  };
  for (const cell of worldRoadCellsForChunk(coordinate)) {
    const a = vertex(cell.xMm, cell.zMm), b = vertex(cell.xMm, cell.zMm + WORLD_ROAD_CELL_MM);
    const c = vertex(cell.xMm + WORLD_ROAD_CELL_MM, cell.zMm + WORLD_ROAD_CELL_MM), d = vertex(cell.xMm + WORLD_ROAD_CELL_MM, cell.zMm);
    indices.push(a, b, d, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * View-only projection of the canonical Aurion road network (`shared/worldRoadNetwork`)
 * around the player, so that road-bound house lots visibly adjoin a road. The network
 * itself is pure shared geometry; this class neither fetches nor decides anything.
 */
export class WorldRoadProjection {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x8c7b5e, roughness: 1, metalness: 0, vertexColors: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  private center = "";
  private sinceRefresh = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly terrain: (x: number, z: number) => number) {
    this.root.name = "aurion-world-roads";
    scene.add(this.root);
  }

  update(position: { x: number; z: number }, deltaSeconds = 0): void {
    if (this.disposed || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    const c = splitWorldChunkPositionMm({ x: Math.round(position.x * 1000), z: Math.round(position.z * 1000) }).coordinate;
    const key = `${c.x}:${c.z}`;
    if (key !== this.center) {
      this.center = key;
      const desired = new Map<string, WorldChunkCoordinate>();
      for (let z = c.z - WORLD_ROAD_VIEW_RADIUS_CHUNKS; z <= c.z + WORLD_ROAD_VIEW_RADIUS_CHUNKS; z++)
        for (let x = c.x - WORLD_ROAD_VIEW_RADIUS_CHUNKS; x <= c.x + WORLD_ROAD_VIEW_RADIUS_CHUNKS; x++) desired.set(`${x}:${z}`, { x, z });
      for (const [id, mesh] of this.meshes) if (!desired.has(id)) { this.root.remove(mesh); mesh.geometry.dispose(); this.meshes.delete(id); }
      for (const [id, coordinate] of desired) if (!this.meshes.has(id)) this.add(id, coordinate);
      this.sinceRefresh = 0;
    } else if (Number.isFinite(deltaSeconds) && deltaSeconds > 0 && (this.sinceRefresh += deltaSeconds) >= HEIGHT_REFRESH_SECONDS) {
      // Ground chunks stream in after the road strips; follow the ground once it is known.
      this.sinceRefresh = 0;
      for (const mesh of this.meshes.values()) this.refreshHeights(mesh);
    }
    this.root.userData.roadProjection = { chunks: this.meshes.size, center: this.center };
  }

  private add(id: string, coordinate: WorldChunkCoordinate): void {
    const mesh = new THREE.Mesh(buildWorldRoadGeometry(coordinate, this.terrain), this.material);
    mesh.name = `aurion-world-road:${id}`;
    mesh.position.set(coordinate.x * WORLD_CHUNK_SIZE_MM / 1000, 0, coordinate.z * WORLD_CHUNK_SIZE_MM / 1000);
    mesh.receiveShadow = true;
    // Roads are a ground decal: pointer, camera and admin rays pass through to the world below.
    mesh.raycast = () => {};
    this.root.add(mesh);
    this.meshes.set(id, mesh);
  }

  private refreshHeights(mesh: THREE.Mesh): void {
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    let changed = false;
    for (let i = 0; i < position.count; i++) {
      const x = mesh.position.x + position.getX(i), z = mesh.position.z + position.getZ(i);
      const y = Math.fround(this.terrain(x, z) + worldRoadLiftM(x, z));
      if (position.getY(i) !== y) { position.setY(i, y); changed = true; }
    }
    if (!changed) return;
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.meshes.clear();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
