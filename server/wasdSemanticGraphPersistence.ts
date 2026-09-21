import type { aurionNpcDecisionReceipts } from "../drizzle/schema";
import type { NpcMemoryV4, NpcSemanticFact } from "./wasdNpcCapsule";
import type { NpcTransaction } from "./npcMultiMemoryPersistence";

/**
 * Historical AIM-294 V1 surface.
 *
 * Wave 2 Step 27 retires every V1 write/query path because V1 derived graph hashes,
 * scores and validity semantics inside Aurion. Historical 0044/0046 rows remain
 * readable at the database layer for audit/migration evidence only.
 *
 * Active semantic graph truth lives in wasdSemanticGraphV2Persistence.ts and can
 * only be produced from the revision-bound WASD AIM-294 capsule.
 */
const retired=():never=>{throw new Error("SEMANTIC_GRAPH_V1_RETIRED_USE_AIM294_V2");};

export async function verifySemanticGraphProvenance(
  _tx:NpcTransaction,
  _npcId:string,
  _semanticFacts:readonly NpcSemanticFact[],
):Promise<void>{
  retired();
}
export const validateDecisionProvenance=verifySemanticGraphProvenance;

export type ConfirmedSemanticMemoryGraph=never;

export async function appendSemanticMemoryGraph(
  _tx:NpcTransaction,
  _source:typeof aurionNpcDecisionReceipts.$inferSelect,
  _memory:NpcMemoryV4,
  _previousReceiptId:string|null,
  _previousGraphHash:string,
):Promise<ConfirmedSemanticMemoryGraph>{
  return retired();
}

export async function rebuildRetrievalIndex(_tx:NpcTransaction,_npcId:string):Promise<void>{
  retired();
}

export type SemanticGraphQuery={
  npcId:string;
  subjectId?:string;
  predicate?:string;
  value?:string;
  status?:"active"|"expired"|"conflicted";
  limit?:number;
  cursor?:string;
};
export type SemanticGraphQueryResult={
  nodes:Array<{
    id:string;subjectId:string;predicate:string;value:string;status:string;
    validFromIndex:number;validUntilIndex:number;score:number;
  }>;
  nextCursor:string|null;
};

export async function querySemanticGraph(_query:SemanticGraphQuery):Promise<SemanticGraphQueryResult>{
  return retired();
}
