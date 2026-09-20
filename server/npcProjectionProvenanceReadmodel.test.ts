import { describe, expect, it } from "vitest";
import {
  decodeOwnedNpcProjectionProvenance,
  projectOwnedNpcProjectionProvenance,
} from "../shared/npcSemanticGraphProvenanceReadmodel";

const node = {
  nodeId: "smn_" + "1".repeat(60), kind: "goal", semanticKey: "trade", status: "active" as const,
  depth: 1, score: 1200, payloadHash: "2".repeat(64),
};
const graph = {
  npcId: "lyra", generation: 8, graphHash: "3".repeat(64), sourceResultHash: "4".repeat(64), resultHash: "5".repeat(64),
  sourceRevision: "6".repeat(40), provenanceStatus: "VERIFIED" as const,
  bounds: { maxDepth: 4, maxCandidates: 64, maxResults: 32 }, nodes: [node], relations: [],
  excluded: { expired: 0, contradicted: 0, superseded: 0 },
};
const source = { userId: 7, format: "aurion-public-npc-semantic-graph.v2" as const, graphs: [graph] };

describe("NPC projection provenance public readmodel", () => {
  it("derives a strict minimal proof only from an owner-verified graph packet", () => {
    const packet = projectOwnedNpcProjectionProvenance(source, 7);
    expect(packet).toEqual({
      userId: 7,
      format: "aurion-public-npc-projection-provenance.v2",
      projections: [{
        npcId: "lyra", generation: 8, graphHash: "3".repeat(64), sourceResultHash: "4".repeat(64),
        semanticGraphResultHash: "5".repeat(64), sourceRevision: "6".repeat(40), provenanceStatus: "VERIFIED",
      }],
    });
    const serialized = JSON.stringify(packet);
    for (const forbidden of ["nodeId", "payloadHash", "receiptId", "provenanceId", "provenanceHash", "actionReceiptId", "effectReadbackId", "memoryReceiptId", "receiptJson"]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it("fails closed for foreign, non-canonical, malformed, or raw-enriched packets", () => {
    const packet = projectOwnedNpcProjectionProvenance(source, 7);
    const projection = packet.projections[0]!;
    for (const changed of [
      { ...packet, userId: 8 },
      { ...packet, projections: [projection, projection] },
      { ...packet, projections: [{ ...projection, provenanceId: "private" }] },
      { ...packet, projections: [{ ...projection, receiptJson: "private" }] },
      { ...packet, projections: [{ ...projection, semanticGraphResultHash: "not-a-hash" }] },
    ]) expect(() => decodeOwnedNpcProjectionProvenance(changed, 7)).toThrow();
  });
});
