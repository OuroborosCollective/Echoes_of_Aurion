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
