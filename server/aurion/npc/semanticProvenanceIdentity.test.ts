import { describe, expect, it } from "vitest";
import * as npc from "../../wasdNpcCapsule";
import { assertNpcSemanticProvenanceIdentity, parseNpcSemanticMemoryGraph, type NpcSemanticProvenanceRef } from "./semanticMemoryGraph";

const ref = (overrides: Partial<NpcSemanticProvenanceRef>): NpcSemanticProvenanceRef => ({
  kind: "decision_receipt", id: "npc_" + "a".repeat(56), hash: "b".repeat(64), logicalIndex: 1,
  sourceRevision: "c".repeat(40), sourceSha256: "d".repeat(64), ...overrides,
});

function compiledGraph() {
  let memory = npc.createNpcMemoryV4("provenance-identity:test");
  const receipts = [];
  for (let index = 0; index < 2; index++) {
    const request = npc.normalizeNpcRequest({ npcId: memory.npcId, regionId: "observatory_threshold", resolutionIndex: index, needEvents: [], observationIds: [`identity-observation-${index}`], memory: [] });
    const snapshot = npc.createNpcLifeSnapshot({ ...request, needs: npc.resolveNpcNeeds({ events: [] }), memoryState: npc.advanceNpcMemory(npc.parseNpcMemory("[]", -1), [], index) });
    const raw = npc.encodeNpcLifeReceipt(npc.npcRequestHash(request, npc.NPC_LIFE_RECEIPT_VERSION), snapshot);
    const confirmed = npc.verifyConfirmedNpcDecision(raw, {
      receiptId: "npc_" + npc.npcHash([npc.NPC_LIFE_RECEIPT_VERSION, memory.npcId, index]).slice(0, 56),
      npcId: memory.npcId, regionId: request.regionId, resolutionIndex: index, observationIds: request.observationIds,
      goal: snapshot.decision.goal, decisionHash: snapshot.decision.decisionHash,
    } as Parameters<typeof npc.verifyConfirmedNpcDecision>[1]);
    receipts.push(confirmed);
    memory = npc.commitNpcMemoryV4(memory, confirmed).memory;
  }
  return npc.compileNpcSemanticMemoryGraph({ memory, memoryReceipts: receipts });
}

describe("NPC semantic graph provenance identity invariant", () => {
  it("accepts one hash per receipt id and distinct kinds, rejects a second hash for the same id", () => {
    expect(() => assertNpcSemanticProvenanceIdentity([ref({}), ref({ logicalIndex: 1 }), ref({ kind: "action_receipt", hash: "e".repeat(64) })])).not.toThrow();
    expect(() => assertNpcSemanticProvenanceIdentity([ref({}), ref({ hash: "f".repeat(64) })])).toThrow("NPC_SEMANTIC_GRAPH_PROVENANCE_HASH_CONFLICT");
  });

  it("rejects a stored graph whose node carries two content hashes for one receipt id", () => {
    const graph = compiledGraph();
    expect(parseNpcSemanticMemoryGraph(JSON.parse(JSON.stringify(graph))).graphHash).toBe(graph.graphHash);
    const tampered = JSON.parse(JSON.stringify(graph));
    const node = tampered.nodes.find((candidate: { provenance: NpcSemanticProvenanceRef[] }) => candidate.provenance.length > 0);
    const original = node.provenance[0];
    const conflicting = { ...original, hash: original.hash === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64) };
    node.provenance = [...node.provenance, conflicting].sort((a: NpcSemanticProvenanceRef, b: NpcSemanticProvenanceRef) =>
      a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
    expect(() => parseNpcSemanticMemoryGraph(tampered)).toThrow("NPC_SEMANTIC_GRAPH_PROVENANCE_HASH_CONFLICT");
  });
});
