import * as THREE from "three";
import {
  AX1_ECOLOGY_SOURCE_REVISION,
  AX1_INITIAL_RESOURCE_NODES,
  ax1ResourceNodeById,
  type Ax1ResourceNodeDefinition,
} from "@shared/ax1ResourceEcologyProtocol";
import {
  validConfirmedZoneResourceSnapshot,
  type ConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";

type NodeVisual = Readonly<{
  root: THREE.Group;
  definition: Ax1ResourceNodeDefinition;
}>;

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
  value.scale.set(...scale);
  value.castShadow = false;
  value.receiveShadow = true;
  return value;
}

function createVisual(definition: Ax1ResourceNodeDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = `ax1-resource:${definition.id}`;
  root.userData.nodeId = definition.id;
  root.userData.resourceItemId = definition.resourceItemId;
  root.userData.requiredProfession = definition.requiredProfession;
  root.userData.requiredToolCategory = definition.requiredToolCategory;

  const primary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(definition.visualColor),
    roughness: definition.nodeKind === "ore" ? 0.72 : 0.9,
    metalness: definition.nodeKind === "ore" ? 0.18 : 0,
  });

  if (definition.nodeKind === "ore") {
    root.add(
      mesh(new THREE.DodecahedronGeometry(0.7, 0), primary, [0, 0.55, 0], [1.15, 0.8, 1]),
      mesh(new THREE.DodecahedronGeometry(0.52, 0), primary, [-0.58, 0.35, 0.18], [0.8, 0.72, 0.85]),
      mesh(new THREE.DodecahedronGeometry(0.48, 0), primary, [0.57, 0.3, -0.2], [0.72, 0.68, 0.8]),
    );
  } else if (definition.nodeKind === "plant") {
    const stalk = new THREE.MeshStandardMaterial({ color: new THREE.Color("#557a46"), roughness: 1 });
    root.add(
      mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 8), stalk, [0, 0.55, 0]),
      mesh(new THREE.SphereGeometry(0.3, 12, 8), primary, [-0.25, 1.05, 0], [1, 0.75, 1]),
      mesh(new THREE.SphereGeometry(0.28, 12, 8), primary, [0.24, 0.98, 0.08], [1, 0.75, 1]),
      mesh(new THREE.SphereGeometry(0.22, 10, 7), primary, [0.02, 1.2, -0.18], [1, 0.75, 1]),
    );
  } else {
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color("#4f3524"), roughness: 1 });
    const body = mesh(new THREE.SphereGeometry(0.72, 14, 9), primary, [0, 0.42, 0], [1.35, 0.58, 0.72]);
    const limbA = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 8), dark, [-0.5, 0.22, 0.15]);
    const limbB = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 8), dark, [0.45, 0.22, -0.18]);
    limbA.rotation.z = Math.PI / 2.7;
    limbB.rotation.z = -Math.PI / 2.9;
    root.add(body, limbA, limbB);
  }

  return root;
}

function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object as THREE.Mesh).isMesh) return;
    const value = object as THREE.Mesh;
    geometries.add(value.geometry);
    for (const material of Array.isArray(value.material) ? value.material : [value.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/**
 * Presentation-only projection of the confirmed Zone v5 resource readback.
 * It never owns availability, depletion, respawn, rewards, inventory or mastery truth.
 */
export class ResourceNodeProjection {
  readonly root = new THREE.Group();
  private readonly visuals = new Map<string, NodeVisual>();
  private lastRevision = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly terrain: (x: number, z: number) => number,
  ) {
    this.root.name = "ax1-confirmed-resource-nodes";
    scene.add(this.root);
  }

  apply(snapshot: ConfirmedZoneResourceSnapshot, tick: number): void {
    if (this.disposed) return;
    if (!validConfirmedZoneResourceSnapshot(snapshot, tick)) throw new Error("AX1_RESOURCE_SNAPSHOT_INVALID");
    if (snapshot.revision < this.lastRevision) throw new Error("AX1_RESOURCE_REVISION_REGRESSION");
    this.lastRevision = snapshot.revision;

    for (const state of snapshot.nodes) {
      const definition = ax1ResourceNodeById(state.nodeId);
      if (!definition) throw new Error("AX1_RESOURCE_DEFINITION_REQUIRED");
      let visual = this.visuals.get(state.nodeId);
      if (!visual) {
        const root = createVisual(definition);
        this.root.add(root);
        visual = Object.freeze({ root, definition });
        this.visuals.set(state.nodeId, visual);
      }
      const x = definition.xFixed / 1000;
      const z = definition.zFixed / 1000;
      visual.root.position.set(x, this.terrain(x, z) + definition.yFixed / 1000, z);
      visual.root.visible = !state.depleted;
      visual.root.userData.remaining = state.remaining;
      visual.root.userData.depleted = state.depleted;
      visual.root.userData.respawnAtTick = state.respawnAtTick;
      const fullness = definition.capacity === 0 ? 1 : state.remaining / definition.capacity;
      const scale = 0.9 + Math.max(0, Math.min(1, fullness)) * 0.1;
      visual.root.scale.setScalar(scale);
    }
  }

  evidence() {
    let available = 0;
    let depleted = 0;
    for (const visual of this.visuals.values()) {
      if (visual.root.visible) available++;
      else depleted++;
    }
    return Object.freeze({
      sourceRevision: AX1_ECOLOGY_SOURCE_REVISION,
      revision: this.lastRevision,
      nodes: this.visuals.size,
      available,
      depleted,
      expectedNodes: AX1_INITIAL_RESOURCE_NODES.length,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const visual of this.visuals.values()) disposeTree(visual.root);
    this.visuals.clear();
    this.root.removeFromParent();
    this.root.clear();
  }
}
