import { describe, expect, it } from "vitest";
import { buildDiscoveryGraph, discoveryNodeId, discoveryEdgeId, type DiscoveryDefinitions } from "./discoveryGraphProtocol";

const hash = "sha256:" + "a".repeat(64);
function fixture(count = 3): DiscoveryDefinitions {
  const nodes = Array.from({ length: count }, (_, i) => ({ id: discoveryNodeId("effect", `m${i}`), kind: "effect" as const, canonicalId: `m${i}`, catalogVersion: "fixture.v1", definitionHash: hash }));
  const edges = nodes.slice(1).map((node, i) => {
    const value = { from: nodes[i].id, to: node.id, relation: "AFFECTS" as const, ruleId: `rule:${i}`, ruleVersion: "fixture.v1", ruleHash: hash, preconditions: [] };
    return { ...value, id: discoveryEdgeId(value) };
  });
  return { nodes, edges };
}

describe("Discovery graph contract", () => {
  it("is independent of traversal/insertion order without mutating definitions", () => {
    const canonical = fixture();
    const graph = buildDiscoveryGraph(canonical, canonical);
    expect(buildDiscoveryGraph({ nodes: [...canonical.nodes].reverse(), edges: [...canonical.edges].reverse() }, canonical)).toEqual(graph);
    expect(canonical.nodes[0].canonicalId).toBe("m0");
    expect(graph.topologicalOrder).toEqual(canonical.nodes.map(n => n.id));
    expect(Object.isFrozen(graph.edges[0].preconditions)).toBe(true);
  });
  it("rejects forged identities, unknown references/rules, nulls, extra fields and duplicates", () => {
    const canonical = fixture();
    const cases = [null, { ...canonical, extra: true }, { ...canonical, nodes: [...canonical.nodes, canonical.nodes[0]] },
      { ...canonical, nodes: [{ ...canonical.nodes[0], canonicalId: "other" }] },
      { ...canonical, edges: [{ ...canonical.edges[0], to: "effect:unknown" }] },
      { ...canonical, edges: [{ ...canonical.edges[0], ruleHash: "sha256:" + "b".repeat(64) }] },
      { ...canonical, edges: [...canonical.edges, canonical.edges[0]] }];
    for (const value of cases) expect(() => buildDiscoveryGraph(value, canonical)).toThrow();
  });
  it("rejects cycles and depth overflow even when the catalog itself proposes them", () => {
    const value = fixture();
    const edge = { ...value.edges[0], from: value.nodes[2].id, to: value.nodes[0].id, ruleId: "cycle" };
    value.edges.push({ ...edge, id: discoveryEdgeId(edge) });
    expect(() => buildDiscoveryGraph(value, value)).toThrow("DISCOVERY_DEPENDENCY_CYCLE");
    const deep = fixture(18);
    expect(() => buildDiscoveryGraph(deep, deep)).toThrow("DISCOVERY_DEPTH_EXCEEDED");
  });
  it("rejects unsafe quantities and excessive nodes/fanout", () => {
    const tooMany = fixture(513);
    expect(() => buildDiscoveryGraph(tooMany, tooMany)).toThrow();
    const value = fixture(35);
    value.edges = value.nodes.slice(1).map((node, i) => {
      const edge = { ...value.edges[0], from: value.nodes[0].id, to: node.id, ruleId: `rule:${i}` };
      return { ...edge, id: discoveryEdgeId(edge) };
    });
    expect(() => buildDiscoveryGraph(value, value)).toThrow("DISCOVERY_FANOUT_EXCEEDED");
    const bad = fixture();
    bad.edges[0].preconditions = [{ nodeId: bad.nodes[0].id, predicate: "consumed", quantityExact: "1.5", unit: "item" }] as any;
    expect(() => buildDiscoveryGraph(bad, bad)).toThrow();
  });
  it("rejects prerequisite-only cycles, conflicting conditions and ill-typed canonical relations", () => {
    const cyclic = fixture();
    cyclic.edges[0].preconditions = [{ nodeId: cyclic.nodes[1].id, predicate: "observed", quantityExact: "1", unit: "observation" }];
    cyclic.edges[0].id = discoveryEdgeId(cyclic.edges[0]);
    expect(() => buildDiscoveryGraph(cyclic, cyclic)).toThrow("DISCOVERY_DEPENDENCY_CYCLE");
    const conflict = fixture();
    const condition = { nodeId: conflict.nodes[0].id, predicate: "observed" as const, quantityExact: "1", unit: "observation" as const };
    conflict.edges[0].preconditions = [condition, { ...condition, quantityExact: "2" }];
    conflict.edges[0].id = discoveryEdgeId(conflict.edges[0]);
    expect(() => buildDiscoveryGraph(conflict, conflict)).toThrow("DISCOVERY_PRECONDITION_CONFLICT");
    const wrong = fixture();
    wrong.edges[0].relation = "USED_IN";
    wrong.edges[0].id = discoveryEdgeId(wrong.edges[0]);
    expect(() => buildDiscoveryGraph(wrong, wrong)).toThrow("DISCOVERY_RELATION_TYPE_INVALID");
  });
  it("bounds dense prerequisite evaluation and repeated-edge fanout before traversal", () => {
    const value = fixture(512);
    value.edges = Array.from({ length: 512 }, (_, i) => {
      const edge = { from: value.nodes[i % 256].id, to: value.nodes[256 + i % 256].id, relation: "AFFECTS" as const,
        ruleId: `dense:${i}`, ruleVersion: "fixture.v1", ruleHash: hash,
        preconditions: Array.from({ length: 16 }, (_, j) => ({ nodeId: value.nodes[(i + j) % 256].id,
          predicate: "observed" as const, quantityExact: "1", unit: "observation" as const })) };
      return { ...edge, id: discoveryEdgeId(edge) };
    });
    expect(() => buildDiscoveryGraph(value, value)).toThrow("DISCOVERY_EVALUATION_EXCEEDED");
    const repeated = fixture();
    repeated.edges = Array.from({ length: 33 }, (_, i) => {
      const edge = { ...repeated.edges[0], ruleId: `repeat:${i}` };
      return { ...edge, id: discoveryEdgeId(edge) };
    });
    expect(() => buildDiscoveryGraph(repeated, repeated)).toThrow("DISCOVERY_FANOUT_EXCEEDED");
  });
  it("canonicalizes seeded permutations and invalidates fingerprints on canonical content changes", () => {
    const value = fixture(12);
    const baseline = buildDiscoveryGraph(value, value).fingerprint;
    let seed = 77;
    const shuffle = <T>(entries: T[]) => entries.map(v => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return { v, sort: seed }; }).sort((a, b) => a.sort - b.sort).map(e => e.v);
    for (let i = 0; i < 100; i++) expect(buildDiscoveryGraph({ nodes: shuffle(value.nodes), edges: shuffle(value.edges) }, value).fingerprint).toBe(baseline);
    const changed = fixture(12);
    changed.nodes[0].definitionHash = "sha256:" + "b".repeat(64);
    expect(buildDiscoveryGraph(changed, changed).fingerprint).not.toBe(baseline);
  });
});
