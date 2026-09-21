import { describe, expect, it } from "vitest";
import {
  appendSemanticMemoryGraph,
  querySemanticGraph,
  rebuildRetrievalIndex,
  verifySemanticGraphProvenance,
} from "./wasdSemanticGraphPersistence";

describe("historical semantic graph V1 retirement",()=>{
  it("fails closed for every former V1 authority surface",async()=>{
    const retired=/SEMANTIC_GRAPH_V1_RETIRED_USE_AIM294_V2/;
    await expect(verifySemanticGraphProvenance({} as never,"npc",[])).rejects.toThrow(retired);
    await expect(appendSemanticMemoryGraph({} as never,{} as never,{} as never,null,"0".repeat(64))).rejects.toThrow(retired);
    await expect(rebuildRetrievalIndex({} as never,"npc")).rejects.toThrow(retired);
    await expect(querySemanticGraph({npcId:"npc"})).rejects.toThrow(retired);
  });
});
