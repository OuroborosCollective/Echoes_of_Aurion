import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AX1_ECOLOGY_SOURCE_REVISION,
  AX1_INITIAL_RESOURCE_NODES,
} from "@shared/ax1ResourceEcologyProtocol";
import {
  ZONE_RESOURCE_CONTRACT_VERSION,
  type ConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";
import { ResourceNodeProjection } from "./ResourceNodeProjection";
import { ORE_OUTCROP_HEIGHT_M, oreOutcropHeightM } from "../world/oreOutcrop";

const snapshot = (revision: number, depletedId?: string): ConfirmedZoneResourceSnapshot => Object.freeze({
  contractVersion: ZONE_RESOURCE_CONTRACT_VERSION,
  contentSourceRevision: AX1_ECOLOGY_SOURCE_REVISION,
  revision,
  nodes: Object.freeze([...AX1_INITIAL_RESOURCE_NODES]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(definition => Object.freeze({
      nodeId: definition.id,
      remaining: definition.id === depletedId ? 0 : definition.capacity,
      depleted: definition.id === depletedId,
      respawnAtTick: definition.id === depletedId ? 610 : null,
    }))),
});

describe("confirmed AX1 resource-node projection", () => {
  it("renders all source-bound nodes at deterministic world coordinates", () => {
    const scene = new THREE.Scene();
    const projection = new ResourceNodeProjection(scene, () => 2.5);
    projection.apply(snapshot(1), 10);

    const root = scene.getObjectByName("ax1-confirmed-resource-nodes") as THREE.Group;
    expect(root.children).toHaveLength(AX1_INITIAL_RESOURCE_NODES.length);
    const copper = root.getObjectByName("ax1-resource:node_copper_1")!;
    expect(copper.visible).toBe(true);
    expect(copper.position.toArray()).toEqual([10, 2.5, -20]);
    expect(copper.userData).toMatchObject({
      nodeId: "node_copper_1",
      resourceItemId: "res_copper_tin_ore",
      requiredProfession: "miner",
      requiredToolCategory: "Pickaxe",
      remaining: 5,
      depleted: false,
    });
    expect(projection.evidence()).toMatchObject({ revision: 1, nodes: 5, available: 5, depleted: 0 });
    projection.dispose();
  });

  it("changes visibility only from a newer confirmed server snapshot", () => {
    const scene = new THREE.Scene();
    const projection = new ResourceNodeProjection(scene, () => 0);
    projection.apply(snapshot(1), 10);
    projection.apply(snapshot(2, "node_copper_1"), 10);

    const copper = scene.getObjectByName("ax1-resource:node_copper_1")!;
    expect(copper.visible).toBe(false);
    expect(copper.userData).toMatchObject({ remaining: 0, depleted: true, respawnAtTick: 610 });
    expect(projection.evidence()).toMatchObject({ revision: 2, available: 4, depleted: 1 });
    expect(() => projection.apply(snapshot(1), 10)).toThrow("AX1_RESOURCE_REVISION_REGRESSION");
    projection.dispose();
  });

  it("sets every ore vein on a rock outcrop that follows the ground and outlasts depletion", () => {
    const scene = new THREE.Scene();
    const ground = (x: number, z: number) => 0.5 + oreOutcropHeightM(x, z);
    const projection = new ResourceNodeProjection(scene, ground);
    projection.apply(snapshot(1), 10);

    const ores = AX1_INITIAL_RESOURCE_NODES.filter(node => node.nodeKind === "ore");
    const outcrops = scene.getObjectByName("ax1-resource-outcrops") as THREE.Group;
    expect(outcrops.children.map(child => child.name).sort()).toEqual(ores.map(node => `ax1-resource-outcrop:${node.id}`).sort());
    expect(projection.evidence()).toMatchObject({ nodes: 5, oreOutcrops: ores.length });
    for (const ore of ores) {
      const vein = scene.getObjectByName(`ax1-resource:${ore.id}`)!;
      const outcrop = outcrops.getObjectByName(`ax1-resource-outcrop:${ore.id}`) as THREE.Mesh;
      const position = outcrop.geometry.getAttribute("position");
      // The vein stands on the crown, a full outcrop height above the surrounding ground.
      expect(vein.position.y).toBeCloseTo(0.5 + ORE_OUTCROP_HEIGHT_M, 6);
      expect(outcrop.position.x).toBe(vein.position.x);
      expect(outcrop.position.z).toBe(vein.position.z);
      let top = -Infinity, bottom = Infinity;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        top = Math.max(top, y); bottom = Math.min(bottom, y);
        const expected = ground(outcrop.position.x + position.getX(i), outcrop.position.z + position.getZ(i));
        // Draped on the ground; only the rim dips below it to hide the seam.
        expect(y).toBeLessThanOrEqual(expected + 0.05);
        expect(y).toBeGreaterThanOrEqual(expected - 0.26);
      }
      expect(top).toBeCloseTo(vein.position.y + 0.04, 5);
      expect(bottom).toBeLessThan(0.5);
      const index = outcrop.geometry.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)));
        expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
      }
    }

    projection.apply(snapshot(2, "node_copper_1"), 10);
    expect(scene.getObjectByName("ax1-resource:node_copper_1")!.visible).toBe(false);
    expect(outcrops.getObjectByName("ax1-resource-outcrop:node_copper_1")!.visible).toBe(true);
    projection.dispose();
    expect(scene.getObjectByName("ax1-resource-outcrops")).toBeUndefined();
  });

  it("fails closed on a snapshot whose AX1 provenance is invalid", () => {
    const scene = new THREE.Scene();
    const projection = new ResourceNodeProjection(scene, () => 0);
    const invalid = { ...snapshot(1), contentSourceRevision: "0".repeat(40) };
    expect(() => projection.apply(invalid as ConfirmedZoneResourceSnapshot, 10)).toThrow("AX1_RESOURCE_SNAPSHOT_INVALID");
    expect(projection.evidence().nodes).toBe(0);
    projection.dispose();
  });

  it("removes its entire presentation tree on disposal", () => {
    const scene = new THREE.Scene();
    const projection = new ResourceNodeProjection(scene, () => 0);
    projection.apply(snapshot(1), 10);
    projection.dispose();
    expect(scene.getObjectByName("ax1-confirmed-resource-nodes")).toBeUndefined();
  });
});
