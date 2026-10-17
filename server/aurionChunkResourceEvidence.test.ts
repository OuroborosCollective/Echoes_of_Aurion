import { describe, expect, it } from "vitest";
import { createWorldChunkDelta, generateBaseWorldChunk, materializeWorldChunk } from "../shared/worldChunkProtocol";
import { assessLocalResourceSources, projectChunkResourceEvidence } from "./aurionChunkResourceEvidence";

const worldId = "echoes-of-aurion-global";
const worldSeed = "aurion-region-provenance-regression";
const base = generateBaseWorldChunk({ worldId, worldSeed, coordinate: { x: 0, z: 0 } });

describe("server-owned regional chunk resource evidence", () => {
  it("replays canonical resource-node counts from the actual world generator", () => {
    const one = projectChunkResourceEvidence(materializeWorldChunk(base, []));
    const two = projectChunkResourceEvidence(materializeWorldChunk(generateBaseWorldChunk({ worldId, worldSeed, coordinate: { x: 0, z: 0 } }), []));
    expect(one).toEqual(two);
    expect(one.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.values(one.naturalSourceNodes).reduce((sum, count) => sum + count, 0)).toBe(base.resources.length);
    expect(one.verifiedDeltaIds).toEqual([]);
    expect(Object.keys(one.naturalSourceNodes).sort()).toEqual(["herbs", "ore", "water", "wood"]);
  });

  it("counts a confirmed depletion only once and binds its delta into evidence", () => {
    const node = base.resources[0]!;
    expect(node).toBeDefined();
    const before = projectChunkResourceEvidence(materializeWorldChunk(base, []));
    const delta = createWorldChunkDelta({
      id: "resource-depleted-0001", worldId, coordinate: base.coordinate, baseRevision: base.baseRevision,
      sequence: 1, kind: "resource_depleted", targetId: node.id, actorUserId: 7,
      idempotencyKey: "harvest-verified:0001", payload: { yieldKey: node.yieldKey, resourceKind: node.kind },
    });
    const after = projectChunkResourceEvidence(materializeWorldChunk(base, [delta]));
    expect(after.naturalSourceNodes[node.yieldKey]).toBe(before.naturalSourceNodes[node.yieldKey] - 1);
    expect(after.verifiedDeltaIds).toEqual([delta.id]);
    expect(after.sourceHash).not.toBe(before.sourceHash);
    expect(projectChunkResourceEvidence(materializeWorldChunk(base, [delta]))).toEqual(after);
  });

  it("does not hallucinate refined iron/steel from generic ore or turn zero resources into defaults", () => {
    const oreChunk = Array.from({ length: 64 }, (_, x) => generateBaseWorldChunk({ worldId, worldSeed, coordinate: { x, z: 11 } }))
      .find(chunk => chunk.resources.some(resource => resource.yieldKey === "ore"));
    expect(oreChunk).toBeDefined();
    const source = projectChunkResourceEvidence(materializeWorldChunk(oreChunk!, []));
    expect(assessLocalResourceSources(source, [{ resource: "ore", minSourceNodes: 1 }]).eligible).toBe(true);
    const blocked = assessLocalResourceSources(source, [
      { resource: "iron", minSourceNodes: 1 },
      { resource: "steel", minSourceNodes: 1 },
    ]);
    expect(blocked.eligible).toBe(false);
    expect(blocked.deficits.map(value => value.resource)).toEqual(["iron", "steel"]);
    expect(blocked.deficits.every(value => value.availableNodes === 0)).toBe(true);
    const wiped = materializeWorldChunk(base, base.resources.map((node, index) => createWorldChunkDelta({
      id: `deplete:${index}`, worldId, coordinate: base.coordinate, baseRevision: base.baseRevision,
      sequence: index + 1, kind: "resource_depleted", targetId: node.id, actorUserId: 7,
      idempotencyKey: `harvest:all:${index}`, payload: { yieldKey: node.yieldKey, resourceKind: node.kind },
    })));
    const empty = projectChunkResourceEvidence(wiped);
    expect(Object.values(empty.naturalSourceNodes)).toEqual([0, 0, 0, 0]);
    expect(assessLocalResourceSources(empty, [{ resource: "wood", minSourceNodes: 1 }]).eligible).toBe(false);
  });

  it("rejects a forged visible resource or modified evidence instead of fabricating supply", () => {
    const read = materializeWorldChunk(base, []);
    expect(() => projectChunkResourceEvidence({ ...read, visibleResources: [...read.visibleResources, { ...base.resources[0]!, id: "forged:resource" }] })).toThrow("CHUNK_RESOURCE_VISIBLE_MISMATCH");
    const valid = projectChunkResourceEvidence(read);
    expect(() => assessLocalResourceSources({ ...valid, naturalSourceNodes: { ...valid.naturalSourceNodes, iron: 50 } } as typeof valid, [{ resource: "iron", minSourceNodes: 1 }])).toThrow("CHUNK_RESOURCE_EVIDENCE_INVALID");
    expect(() => assessLocalResourceSources(valid, [{ resource: "wood", minSourceNodes: 0 }])).toThrow("CHUNK_RESOURCE_REQUIREMENT_INVALID");
    expect(() => assessLocalResourceSources(valid, [{ resource: "wood", minSourceNodes: 1 }, { resource: "wood", minSourceNodes: 1 }])).toThrow("CHUNK_RESOURCE_REQUIREMENT_DUPLICATE");
  });
});
