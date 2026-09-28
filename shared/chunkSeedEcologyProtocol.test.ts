import { describe, expect, it } from "vitest";
import {
  AURION_CHUNK_SEED_ECOLOGY_PROTOCOL,
  ECOLOGY_GENERATOR_VERSION,
  applyEcologyConsumption,
  applyEcologyRegeneration,
  assertEcologySnapshot,
  chunkSeedEcologyResourceKinds,
  createInitialEcologySnapshot,
  deriveEcologyNodeDefinitions,
  projectEcologySnapshot,
  verifyEcologyDeterminism,
  type ChunkSeedEcologySnapshot,
} from "./chunkSeedEcologyProtocol";

const WORLD_SEED = "aurion-test-seed-545";
const COORDINATE = { x: 3, z: -7 } as const;
const BIOME = "forest" as const;
const SOURCE_REVISION = "a".repeat(40);
const SOURCE_CAUSAL_ROOT = "sha256:" + "b".repeat(64);
const CONFIRMED_CHUNK_HASH = "sha256:" + "c".repeat(64);
const STRUCTURE_OBSERVATION_KEY = "sha256:" + "d".repeat(64);

function makeDefinitions(structureKey: string | null = null) {
  return deriveEcologyNodeDefinitions({
    worldSeed: WORLD_SEED,
    coordinate: COORDINATE,
    biome: BIOME,
    structureObservationKey: structureKey,
  });
}

function makeInitialSnapshot(definitions = makeDefinitions(), season: "spring" | "summer" | "autumn" | "winter" = "summer") {
  return createInitialEcologySnapshot({
    worldId: "world-545",
    chunkCoordinate: COORDINATE,
    epoch: 1,
    sourceRevision: SOURCE_REVISION,
    sourceCausalRoot: SOURCE_CAUSAL_ROOT,
    confirmedChunkHash: CONFIRMED_CHUNK_HASH,
    structureObservationKey: STRUCTURE_OBSERVATION_KEY,
    season,
    definitions,
  });
}

describe("AIM-545 Chunk-Seed Ecology & Resource Renewal", () => {
  describe("deterministic node derivation", () => {
    it("derives the same node definitions for the same seed + coordinate + biome", () => {
      const a = makeDefinitions();
      const b = makeDefinitions();
      expect(a).toEqual(b);
    });

    it("derives different nodes for a different seed", () => {
      const a = makeDefinitions();
      const b = deriveEcologyNodeDefinitions({
        worldSeed: "different-seed",
        coordinate: COORDINATE,
        biome: BIOME,
      });
      expect(a).not.toEqual(b);
    });

    it("derives different nodes for a different coordinate", () => {
      const a = makeDefinitions();
      const b = deriveEcologyNodeDefinitions({
        worldSeed: WORLD_SEED,
        coordinate: { x: 4, z: -7 },
        biome: BIOME,
      });
      expect(a).not.toEqual(b);
    });

    it("produces nodes with stable IDs and valid resource kinds", () => {
      const defs = makeDefinitions();
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) {
        expect(def.nodeId).toMatch(/^eco:-?\d+:-?\d+:\d+$/);
        expect(chunkSeedEcologyResourceKinds).toContain(def.resourceKind);
        expect(def.capacity).toBeGreaterThan(0);
        expect(def.regenerationRateBps).toBeGreaterThanOrEqual(0);
        expect(def.regenerationRateBps).toBeLessThanOrEqual(10_000);
      }
    });

    it("links structure observation key when provided", () => {
      const defs = makeDefinitions(STRUCTURE_OBSERVATION_KEY);
      for (const def of defs) {
        expect(def.structureObservationKey).toBe(STRUCTURE_OBSERVATION_KEY);
      }
    });

    it("sets structure observation key to null when not provided", () => {
      const defs = makeDefinitions(null);
      for (const def of defs) {
        expect(def.structureObservationKey).toBeNull();
      }
    });

    it("changes the ecological resource field when confirmed structure context changes", () => {
      const withoutStructure = makeDefinitions(null);
      const withStructure = makeDefinitions(STRUCTURE_OBSERVATION_KEY);
      expect(withStructure).not.toEqual(withoutStructure);
      expect(withStructure.some((node, index) => node.nodeId !== withoutStructure[index]?.nodeId || node.capacity !== withoutStructure[index]?.capacity)).toBe(true);
    });

    it("rejects malformed structure context and non-integer chunk coordinates", () => {
      expect(() => deriveEcologyNodeDefinitions({ worldSeed: WORLD_SEED, coordinate: { x: 1.5, z: 0 }, biome: BIOME })).toThrow();
      expect(() => deriveEcologyNodeDefinitions({ worldSeed: WORLD_SEED, coordinate: { x: 1_000_001, z: 0 }, biome: BIOME })).toThrow();
      expect(() => deriveEcologyNodeDefinitions({ worldSeed: WORLD_SEED, coordinate: COORDINATE, biome: BIOME, structureObservationKey: "not-a-sha256" })).toThrow();
    });
  });

  describe("initial snapshot", () => {
    it("creates a snapshot with all nodes at full capacity", () => {
      const defs = makeDefinitions();
      const snapshot = makeInitialSnapshot(defs);
      expect(snapshot.protocol).toBe(AURION_CHUNK_SEED_ECOLOGY_PROTOCOL);
      expect(snapshot.generatorVersion).toBe(ECOLOGY_GENERATOR_VERSION);
      expect(snapshot.revision).toBe(1);
      expect(snapshot.nodes.length).toBe(defs.length);
      for (let i = 0; i < defs.length; i++) {
        expect(snapshot.nodes[i].remaining).toBe(defs[i].capacity);
        expect(snapshot.nodes[i].depleted).toBe(false);
        expect(snapshot.nodes[i].lastModifiedTick).toBe(0);
      }
    });

    it("produces a valid canonical hash", () => {
      const snapshot = makeInitialSnapshot();
      expect(() => assertEcologySnapshot(snapshot)).not.toThrow();
    });

    it("rejects duplicate resource node identities", () => {
      const definitions = makeDefinitions();
      expect(() => createInitialEcologySnapshot({
        worldId: "world-545", chunkCoordinate: COORDINATE, epoch: 1, sourceRevision: SOURCE_REVISION,
        sourceCausalRoot: SOURCE_CAUSAL_ROOT, confirmedChunkHash: CONFIRMED_CHUNK_HASH,
        structureObservationKey: STRUCTURE_OBSERVATION_KEY, season: "summer", definitions: [...definitions, definitions[0]],
      })).toThrow("ECOLOGY_NODE_ID_DUPLICATE");
    });

    it("produces identical snapshots for identical inputs", () => {
      const a = makeInitialSnapshot();
      const b = makeInitialSnapshot();
      expect(a).toEqual(b);
      expect(verifyEcologyDeterminism(a, b)).toBe(true);
    });
  });

  describe("consumption", () => {
    it("reduces remaining and increments revision", () => {
      const snapshot = makeInitialSnapshot();
      const firstNode = snapshot.nodes[0];
      const amount = Math.floor(firstNode.remaining / 2);

      const consumed = applyEcologyConsumption(snapshot, {
        nodeId: firstNode.nodeId,
        amount,
        tick: 5,
        causeTag: "forage",
        actorEntityId: "npc-1",
      });

      expect(consumed.revision).toBe(snapshot.revision + 1);
      const updatedNode = consumed.nodes.find(n => n.nodeId === firstNode.nodeId)!;
      expect(updatedNode.remaining).toBe(firstNode.remaining - amount);
      expect(updatedNode.depleted).toBe(false);
      expect(updatedNode.lastModifiedTick).toBe(5);
      expect(() => assertEcologySnapshot(consumed)).not.toThrow();
    });

    it("depletes a node when remaining reaches zero", () => {
      const snapshot = makeInitialSnapshot();
      const firstNode = snapshot.nodes[0];

      const depleted = applyEcologyConsumption(snapshot, {
        nodeId: firstNode.nodeId,
        amount: firstNode.remaining,
        tick: 3,
        causeTag: "mine",
        actorEntityId: "npc-2",
      });

      const depletedNode = depleted.nodes.find(n => n.nodeId === firstNode.nodeId)!;
      expect(depletedNode.remaining).toBe(0);
      expect(depletedNode.depleted).toBe(true);
    });

    it("throws when consuming from a depleted node", () => {
      const snapshot = makeInitialSnapshot();
      const firstNode = snapshot.nodes[0];

      const depleted = applyEcologyConsumption(snapshot, {
        nodeId: firstNode.nodeId,
        amount: firstNode.remaining,
        tick: 1,
        causeTag: "chop",
        actorEntityId: "npc-1",
      });

      expect(() => applyEcologyConsumption(depleted, {
        nodeId: firstNode.nodeId,
        amount: 1,
        tick: 2,
        causeTag: "chop",
        actorEntityId: "npc-1",
      })).toThrow("ECOLOGY_NODE_DEPLETED");
    });

    it("throws when consumption exceeds remaining", () => {
      const snapshot = makeInitialSnapshot();
      const firstNode = snapshot.nodes[0];

      expect(() => applyEcologyConsumption(snapshot, {
        nodeId: firstNode.nodeId,
        amount: firstNode.remaining + 1,
        tick: 1,
        causeTag: "overharvest",
        actorEntityId: "npc-1",
      })).toThrow("ECOLOGY_CONSUMPTION_EXCEEDS_REMAINING");
    });

    it("throws for an unknown node", () => {
      const snapshot = makeInitialSnapshot();
      expect(() => applyEcologyConsumption(snapshot, {
        nodeId: "nonexistent-node",
        amount: 1,
        tick: 1,
        causeTag: "forage",
        actorEntityId: "npc-1",
      })).toThrow("ECOLOGY_NODE_NOT_FOUND");
    });

    it("rejects an action tick that moves backwards for a node", () => {
      const firstNode = makeInitialSnapshot().nodes[0];
      const consumed = applyEcologyConsumption(makeInitialSnapshot(), { nodeId: firstNode.nodeId, amount: 1, tick: 5, causeTag: "forage", actorEntityId: "npc-1" });
      expect(() => applyEcologyConsumption(consumed, { nodeId: firstNode.nodeId, amount: 1, tick: 4, causeTag: "forage", actorEntityId: "npc-1" })).toThrow("ECOLOGY_CONSUMPTION_TICK_BEFORE_NODE");
    });
  });

  describe("regeneration", () => {
    it("regenerates resources up to capacity", () => {
      const defs = makeDefinitions();
      const snapshot = makeInitialSnapshot(defs, "summer");
      const firstDef = defs[0];

      // Consume half the capacity
      const consumed = applyEcologyConsumption(snapshot, {
        nodeId: firstDef.nodeId,
        amount: Math.floor(firstDef.capacity / 2),
        tick: 1,
        causeTag: "forage",
        actorEntityId: "npc-1",
      });

      // Regenerate for tick 2
      const { snapshot: regenerated, results } = applyEcologyRegeneration(consumed, defs, 2);

      const regenResult = results.find(r => r.nodeId === firstDef.nodeId)!;
      expect(regenResult.regenerated).toBeGreaterThan(0);

      const regenNode = regenerated.nodes.find(n => n.nodeId === firstDef.nodeId)!;
      expect(regenNode.remaining).toBeGreaterThan(consumed.nodes.find(n => n.nodeId === firstDef.nodeId)!.remaining);
      expect(regenNode.remaining).toBeLessThanOrEqual(firstDef.capacity);
      expect(() => assertEcologySnapshot(regenerated)).not.toThrow();
    });

    it("does not exceed capacity after multiple regenerations", () => {
      const defs = makeDefinitions();
      let snapshot = makeInitialSnapshot(defs, "summer");

      // Consume some, then regenerate many times
      const firstDef = defs[0];
      snapshot = applyEcologyConsumption(snapshot, {
        nodeId: firstDef.nodeId,
        amount: Math.floor(firstDef.capacity / 2),
        tick: 1,
        causeTag: "forage",
        actorEntityId: "npc-1",
      });

      for (let tick = 2; tick <= 20; tick++) {
        const result = applyEcologyRegeneration(snapshot, defs, tick);
        snapshot = result.snapshot;
      }

      const node = snapshot.nodes.find(n => n.nodeId === firstDef.nodeId)!;
      expect(node.remaining).toBeLessThanOrEqual(firstDef.capacity);
      expect(node.depleted).toBe(false);
    });

    it("applies season multiplier to regeneration", () => {
      const defs = makeDefinitions();
      const firstDef = defs[0];

      // Consume the same amount in two parallel worlds with different seasons
      const consumeAmount = Math.floor(firstDef.capacity / 2);

      const summerSnapshot = applyEcologyConsumption(
        makeInitialSnapshot(defs, "summer"),
        { nodeId: firstDef.nodeId, amount: consumeAmount, tick: 1, causeTag: "forage", actorEntityId: "npc-1" },
      );
      const winterSnapshot = applyEcologyConsumption(
        makeInitialSnapshot(defs, "winter"),
        { nodeId: firstDef.nodeId, amount: consumeAmount, tick: 1, causeTag: "forage", actorEntityId: "npc-1" },
      );

      const summerRegen = applyEcologyRegeneration(summerSnapshot, defs, 2);
      const winterRegen = applyEcologyRegeneration(winterSnapshot, defs, 2);

      const summerResult = summerRegen.results.find(r => r.nodeId === firstDef.nodeId)!;
      const winterResult = winterRegen.results.find(r => r.nodeId === firstDef.nodeId)!;

      // Summer should regenerate more than winter
      expect(summerResult.regenerated).toBeGreaterThan(winterResult.regenerated);
    });

    it("applies overuse penalty when remaining is below threshold", () => {
      const defs = makeDefinitions();
      const firstDef = defs[0];

      // Consume enough to go below 25% threshold
      const overuseThreshold = Math.floor(firstDef.capacity * 0.25);
      const consumeAmount = firstDef.capacity - Math.floor(overuseThreshold / 2);

      const snapshot = applyEcologyConsumption(
        makeInitialSnapshot(defs, "summer"),
        { nodeId: firstDef.nodeId, amount: consumeAmount, tick: 1, causeTag: "overharvest", actorEntityId: "npc-1" },
      );

      const { results } = applyEcologyRegeneration(snapshot, defs, 2);
      const regenResult = results.find(r => r.nodeId === firstDef.nodeId)!;

      // With overuse penalty, regeneration should be halved
      const baseRegen = Math.floor(firstDef.capacity * firstDef.regenerationRateBps / 10_000);
      const seasonalRegen = Math.floor(baseRegen * 100 / 100); // summer = 100
      const expectedWithPenalty = Math.floor(seasonalRegen / 2);

      expect(regenResult.regenerated).toBe(expectedWithPenalty);
    });

    it("regenerates depleted nodes back above zero", () => {
      const defs = makeDefinitions();
      const firstDef = defs[0];

      // Fully deplete
      let snapshot = applyEcologyConsumption(
        makeInitialSnapshot(defs, "spring"),
        { nodeId: firstDef.nodeId, amount: firstDef.capacity, tick: 1, causeTag: "clearcut", actorEntityId: "npc-1" },
      );

      const depletedNode = snapshot.nodes.find(n => n.nodeId === firstDef.nodeId)!;
      expect(depletedNode.depleted).toBe(true);

      // Regenerate — spring has 120% multiplier so should regrow
      const { snapshot: regenerated, results } = applyEcologyRegeneration(snapshot, defs, 2);
      const regenResult = results.find(r => r.nodeId === firstDef.nodeId)!;
      expect(regenResult.regenerated).toBeGreaterThan(0);
      expect(regenResult.wasDepleted).toBe(true);

      const regenNode = regenerated.nodes.find(n => n.nodeId === firstDef.nodeId)!;
      expect(regenNode.remaining).toBeGreaterThan(0);
      expect(regenNode.depleted).toBe(false);
    });

    it("rejects applying regeneration twice to the same epoch tick", () => {
      expect(() => applyEcologyRegeneration(makeInitialSnapshot(), makeDefinitions(), 1)).toThrow("ECOLOGY_REGENERATION_TICK_NOT_ADVANCED");
    });

    it("rejects incomplete or duplicate regeneration definitions", () => {
      const defs = makeDefinitions();
      const snapshot = makeInitialSnapshot(defs);
      expect(() => applyEcologyRegeneration(snapshot, defs.slice(1), 2)).toThrow("ECOLOGY_DEFINITION_SET_MISMATCH");
      expect(() => applyEcologyRegeneration(snapshot, [...defs, defs[0]], 2)).toThrow("ECOLOGY_DEFINITION_SET_MISMATCH");
    });
  });

  describe("determinism and replay", () => {
    it("produces identical ecology for same seed + same state + same actions", () => {
      const defs = makeDefinitions(STRUCTURE_OBSERVATION_KEY);

      // Run A
      let snapshotA = makeInitialSnapshot(defs);
      for (let i = 0; i < defs.length; i++) {
        if (defs[i].capacity >= 20) {
          snapshotA = applyEcologyConsumption(snapshotA, {
            nodeId: defs[i].nodeId,
            amount: 10,
            tick: 1,
            causeTag: "forage",
            actorEntityId: "npc-1",
          });
        }
      }
      const regenA = applyEcologyRegeneration(snapshotA, defs, 2);

      // Run B (identical inputs)
      let snapshotB = makeInitialSnapshot(defs);
      for (let i = 0; i < defs.length; i++) {
        if (defs[i].capacity >= 20) {
          snapshotB = applyEcologyConsumption(snapshotB, {
            nodeId: defs[i].nodeId,
            amount: 10,
            tick: 1,
            causeTag: "forage",
            actorEntityId: "npc-1",
          });
        }
      }
      const regenB = applyEcologyRegeneration(snapshotB, defs, 2);

      expect(regenA.snapshot).toEqual(regenB.snapshot);
      expect(verifyEcologyDeterminism(regenA.snapshot, regenB.snapshot)).toBe(true);
    });

    it("produces different ecology for different actions", () => {
      const defs = makeDefinitions();

      const snapshotA = applyEcologyConsumption(
        makeInitialSnapshot(defs),
        { nodeId: defs[0].nodeId, amount: 5, tick: 1, causeTag: "forage", actorEntityId: "npc-1" },
      );

      const snapshotB = applyEcologyConsumption(
        makeInitialSnapshot(defs),
        { nodeId: defs[0].nodeId, amount: 10, tick: 1, causeTag: "forage", actorEntityId: "npc-1" },
      );

      expect(snapshotA.ecologyHash).not.toBe(snapshotB.ecologyHash);
    });

    it("detects hash tampering", () => {
      const snapshot = makeInitialSnapshot();
      const tampered = { ...snapshot, ecologyHash: "sha256:" + "0".repeat(64) };
      expect(() => assertEcologySnapshot(tampered)).toThrow("ECOLOGY_HASH_MISMATCH");
    });
  });

  describe("projection readmodel", () => {
    it("projects a compact readmodel with summary stats", () => {
      const defs = makeDefinitions();
      let snapshot = makeInitialSnapshot(defs);

      // Deplete one node
      const firstDef = defs[0];
      snapshot = applyEcologyConsumption(snapshot, {
        nodeId: firstDef.nodeId,
        amount: firstDef.capacity,
        tick: 1,
        causeTag: "clearcut",
        actorEntityId: "npc-1",
      });

      const projection = projectEcologySnapshot(snapshot);
      expect(projection.protocol).toBe(AURION_CHUNK_SEED_ECOLOGY_PROTOCOL);
      expect(projection.worldId).toBe("world-545");
      expect(projection.nodeCount).toBe(defs.length);
      expect(projection.depletedCount).toBe(1);
      expect(projection.totalRemaining).toBeLessThan(defs.reduce((s, d) => s + d.capacity, 0));
      expect(projection.structureObservationKey).toBe(STRUCTURE_OBSERVATION_KEY);
      expect(projection.ecologyHash).toBe(snapshot.ecologyHash);
    });
  });

  describe("biome variation", () => {
    it("derives different resource distributions for different biomes", () => {
      const forest = deriveEcologyNodeDefinitions({ worldSeed: WORLD_SEED, coordinate: COORDINATE, biome: "forest" });
      const ashland = deriveEcologyNodeDefinitions({ worldSeed: WORLD_SEED, coordinate: COORDINATE, biome: "ashland" });

      const forestKinds = new Set(forest.map(n => n.resourceKind));
      const ashlandKinds = new Set(ashland.map(n => n.resourceKind));

      // Forest should have wood, ashland should have ore — they differ
      expect(forestKinds).not.toEqual(ashlandKinds);
    });
  });
});
