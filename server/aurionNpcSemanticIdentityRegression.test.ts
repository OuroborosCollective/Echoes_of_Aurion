import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("terminates when repeated NPC evidence re-seals an unchanged identity node", () => {
  // Bound the child process: a synchronous remap cycle also blocks Vitest's timer.
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import * as npc from "./server/wasdNpcCapsule.ts";
    let memory = npc.createNpcMemoryV4("aim535:identity-regression");
    const receipts = [];
    for (let index = 0; index < 3; index++) {
      const request = npc.normalizeNpcRequest({npcId: memory.npcId, regionId: "observatory_threshold", resolutionIndex: index, needEvents: [], observationIds: ["repeated-observation"], memory: []});
      const snapshot = npc.createNpcLifeSnapshot({...request, needs: npc.resolveNpcNeeds({events: []}), memoryState: npc.advanceNpcMemory(npc.parseNpcMemory("[]", -1), [], index)});
      const raw = npc.encodeNpcLifeReceipt(npc.npcRequestHash(request, npc.NPC_LIFE_RECEIPT_VERSION), snapshot);
      const confirmed = npc.verifyConfirmedNpcDecision(raw, {receiptId: "npc_" + npc.npcHash([npc.NPC_LIFE_RECEIPT_VERSION, memory.npcId, index]).slice(0, 56), npcId: memory.npcId, regionId: request.regionId, resolutionIndex: index, goal: snapshot.decision.goal, decisionHash: snapshot.decision.decisionHash});
      receipts.push(confirmed);
      memory = npc.commitNpcMemoryV4(memory, confirmed).memory;
      const input = {memory, memoryReceipts: receipts};
      const graph = npc.compileNpcSemanticMemoryGraph(input);
      if (graph.graphHash !== npc.compileNpcSemanticMemoryGraph(input).graphHash) throw Error("NONDETERMINISTIC_GRAPH");
      const ids = new Set(graph.nodes.map(node => node.id));
      if (graph.edges.some(edge => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw Error("DANGLING_GRAPH_EDGE");
    }
    process.stdout.write(JSON.stringify({generation: memory.lastResolutionIndex}));
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 5000 });
  expect(JSON.parse(output)).toEqual({ generation: 2 });
});
