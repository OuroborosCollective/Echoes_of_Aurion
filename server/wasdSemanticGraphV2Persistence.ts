import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import {
  aurionNpcActionEffectReadbacks,
  aurionNpcActionMemoryLinks,
  aurionNpcActionReceipts,
  aurionNpcDecisionReceipts,
  aurionNpcMemoryReceiptsV4,
  aurionNpcStates,
  aurionSemanticGraphEdgesV2,
  aurionSemanticGraphIndexV2,
  aurionSemanticGraphNodesV2,
  aurionSemanticGraphProvenanceV2,
  aurionSemanticGraphReceiptsV2,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  readNpcMultiMemoryForDecision,
  type ConfirmedNpcMultiMemory,
  type NpcTransaction,
} from "./npcMultiMemoryPersistence";
import {
  NPC_SEMANTIC_GRAPH_LIMITS,
  compileNpcSemanticMemoryGraph,
  merchantActionEffectsHash,
  merchantActionReceiptHash,
  npcHash,
  npcMemoryReceiptIds,
  retrieveNpcSemanticMemoryGraph,
  stableCatalogStringify,
  verifyConfirmedNpcDecision,
  verifyNpcSemanticMemoryGraph,
  verifyPerformedActionEvidence,
  type ConfirmedNpcDecision,
  type MerchantActionReceipt,
  type MerchantDecisionRequests,
  type NpcSemanticGraphEdge,
  type NpcSemanticGraphNode,
  type NpcSemanticMemoryGraph,
  type VerifiedPerformedActionEvidence,
} from "./wasdNpcCapsule";

const GRAPH_RECEIPT_VERSION="aurion-semantic-graph-receipt.v2" as const;
const ACTION_READBACK_VERSION="aurion-npc-action-effect-readback.v1" as const;
const ACTION_MEMORY_LINK_VERSION="aurion-npc-action-memory-link.v1" as const;
const visibleNpcs=["lyra","orun","ax1_merchant_observatory_threshold","ax1_merchant_windhollow","ax1_merchant_emberfall","ax1_merchant_cinder_vault"] as const;

type GraphRow=typeof aurionSemanticGraphReceiptsV2.$inferSelect;
type FailurePoint="after_receipt"|"after_node"|"after_edge"|"after_provenance"|"before_readback";

function parseJson<T>(raw:string,code:string):T{
  try{return JSON.parse(raw) as T;}catch{throw new Error(code);}
}
function assertPin():void{
  if(pin.schemaVersion!=="aurion-wasd-npc-pin.v1"||pin.repository!=="OuroborosCollective/Wasd"||
     !/^[a-f0-9]{40}$/.test(pin.sourceRevision)||!/^[a-f0-9]{64}$/.test(pin.sourceSha256)||
     !/^[a-f0-9]{64}$/.test(pin.manifestSha256)) throw new Error("NPC_SEMANTIC_GRAPH_V2_PIN_INVALID");
}
function graphReceiptId(graph:NpcSemanticMemoryGraph):string{
  return `smg2_${npcHash([GRAPH_RECEIPT_VERSION,graph.npcId,graph.generation,graph.graphHash,pin.manifestSha256]).slice(0,59)}`;
}
function graphReceiptCore(input:{
  id:string;graph:NpcSemanticMemoryGraph;memoryReceiptId:string;
}){
  return {
    version:GRAPH_RECEIPT_VERSION,
    id:input.id,
    npcId:input.graph.npcId,
    generation:input.graph.generation,
    graphVersion:input.graph.version,
    retrievalVersion:input.graph.retrievalVersion,
    memoryReceiptId:input.memoryReceiptId,
    sourceRevision:pin.sourceRevision,
    sourceSha256:pin.sourceSha256,
    capsuleManifestSha256:pin.manifestSha256,
    previousGraphHash:input.graph.previousGraphHash,
    graphHash:input.graph.graphHash,
  };
}
function indexId(graphReceiptId:string,nodeId:string):string{
  return `sgi2_${npcHash([graphReceiptId,nodeId]).slice(0,59)}`;
}
function provenanceId(graphReceiptId:string,elementType:"node"|"edge",elementId:string,kind:string,id:string,hash:string):string{
  return `sgp2_${npcHash([graphReceiptId,elementType,elementId,kind,id,hash]).slice(0,59)}`;
}
function nodeRow(graphReceiptId:string,npcId:string,node:NpcSemanticGraphNode){
  return {
    id:node.id,graphReceiptId,npcId,kind:node.kind,semanticKey:node.key,status:node.status,
    validFromIndex:node.validFromIndex,validUntilIndex:node.validUntilIndex,payloadHash:node.payloadHash,
  };
}
function edgeRow(graphReceiptId:string,npcId:string,edge:NpcSemanticGraphEdge){
  return {
    id:edge.id,graphReceiptId,npcId,kind:edge.kind,relationKey:edge.relationKey,
    fromNodeId:edge.fromNodeId,toNodeId:edge.toNodeId,status:edge.status,
    validFromIndex:edge.validFromIndex,validUntilIndex:edge.validUntilIndex,payloadHash:edge.payloadHash,
  };
}
function indexRows(graphReceiptId:string,graph:NpcSemanticMemoryGraph){
  return graph.nodes.map(node=>({
    id:indexId(graphReceiptId,node.id),graphReceiptId,npcId:graph.npcId,nodeId:node.id,
    semanticKey:node.key,kind:node.kind,status:node.status,validFromIndex:node.validFromIndex,
    validUntilIndex:node.validUntilIndex,payloadHash:node.payloadHash,
  })).sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
}
function provenanceRows(graphReceiptId:string,graph:NpcSemanticMemoryGraph){
  const rows:Array<{
    id:string;graphReceiptId:string;elementType:"node"|"edge";elementId:string;provenanceKind:string;
    provenanceId:string;provenanceHash:string;logicalIndex:number;sourceRevision:string;sourceSha256:string;
  }>=[];
  for(const [elementType,elements] of [["node",graph.nodes],["edge",graph.edges]] as const){
    for(const element of elements){
      for(const ref of element.provenance){
        rows.push({
          id:provenanceId(graphReceiptId,elementType,element.id,ref.kind,ref.id,ref.hash),
          graphReceiptId,elementType,elementId:element.id,provenanceKind:ref.kind,provenanceId:ref.id,
          provenanceHash:ref.hash,logicalIndex:ref.logicalIndex,sourceRevision:ref.sourceRevision,sourceSha256:ref.sourceSha256,
        });
      }
    }
  }
  return rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
async function verifiedMemoryReceipts(tx:NpcTransaction,memory:ConfirmedNpcMultiMemory):Promise<readonly ConfirmedNpcDecision[]>{
  const ids=[...npcMemoryReceiptIds(memory.memory)];
  if(!ids.length) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_EVIDENCE_REQUIRED");
  const rows=await tx.select().from(aurionNpcDecisionReceipts)
    .where(and(eq(aurionNpcDecisionReceipts.npcId,memory.row.npcId),inArray(aurionNpcDecisionReceipts.id,ids)))
    .limit(ids.length+1);
  if(rows.length!==ids.length) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_EVIDENCE_INCOMPLETE");
  const verified=rows.map(row=>verifyConfirmedNpcDecision(row.observationIdsJson,{...row,receiptId:row.id}));
  const byId=new Map(verified.map(value=>[value.receiptId,value] as const));
  if(ids.some(id=>!byId.has(id))) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_EVIDENCE_INCOMPLETE");
  return Object.freeze(ids.map(id=>byId.get(id)!));
}
async function confirmedDecisionById(tx:NpcTransaction,id:string):Promise<ConfirmedNpcDecision>{
  const row=(await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.id,id)).limit(1))[0];
  if(!row) throw new Error("NPC_SEMANTIC_GRAPH_V2_DECISION_READBACK_REQUIRED");
  return verifyConfirmedNpcDecision(row.observationIdsJson,{...row,receiptId:row.id});
}
async function verifiedPerformedActions(tx:NpcTransaction,npcId:string,generation:number):Promise<readonly VerifiedPerformedActionEvidence[]>{
  const rows=await tx.select().from(aurionNpcActionReceipts)
    .where(and(eq(aurionNpcActionReceipts.npcId,npcId),lte(aurionNpcActionReceipts.resolutionIndex,generation)))
    .orderBy(asc(aurionNpcActionReceipts.resolutionIndex),asc(aurionNpcActionReceipts.id))
    .limit(NPC_SEMANTIC_GRAPH_LIMITS.performedActions+1);
  if(rows.length>NPC_SEMANTIC_GRAPH_LIMITS.performedActions) throw new Error("NPC_SEMANTIC_GRAPH_V2_ACTION_LIMIT");
  const result:VerifiedPerformedActionEvidence[]=[];
  for(const row of rows){
    if(row.sourceRevision!==pin.sourceRevision||row.sourceSha256!==pin.sourceSha256||row.capsuleManifestSha256!==pin.manifestSha256) throw new Error("NPC_SEMANTIC_GRAPH_V2_ACTION_SOURCE_DRIFT");
    const action=parseJson<MerchantActionReceipt>(row.receiptJson,"NPC_SEMANTIC_GRAPH_V2_ACTION_JSON_INVALID");
    const effects=parseJson<MerchantDecisionRequests>(row.effectSetJson,"NPC_SEMANTIC_GRAPH_V2_EFFECT_JSON_INVALID");
    const {receiptHash:_receiptHash,...unsignedAction}=action;
    if(action.id!==row.id||action.receiptHash!==row.receiptHash||action.effectsHash!==row.effectsHash||
       merchantActionReceiptHash(unsignedAction)!==row.receiptHash||merchantActionEffectsHash(effects)!==row.effectsHash) throw new Error("NPC_SEMANTIC_GRAPH_V2_ACTION_RECEIPT_MISMATCH");
    const readback=(await tx.select().from(aurionNpcActionEffectReadbacks)
      .where(eq(aurionNpcActionEffectReadbacks.actionReceiptId,row.id)).limit(1))[0];
    if(!readback) throw new Error("NPC_SEMANTIC_GRAPH_V2_EFFECT_READBACK_REQUIRED");
    const readbackPayload=parseJson<Record<string,unknown>>(readback.readbackJson,"NPC_SEMANTIC_GRAPH_V2_EFFECT_READBACK_JSON_INVALID");
    if(readback.sourceRevision!==pin.sourceRevision||readback.effectsHash!==row.effectsHash||npcHash(readbackPayload)!==readback.readbackHash||
       readbackPayload.version!==ACTION_READBACK_VERSION||readbackPayload.actionReceiptId!==row.id) throw new Error("NPC_SEMANTIC_GRAPH_V2_EFFECT_READBACK_MISMATCH");
    const link=(await tx.select().from(aurionNpcActionMemoryLinks)
      .where(eq(aurionNpcActionMemoryLinks.actionReceiptId,row.id)).limit(1))[0];
    if(!link) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_LINK_REQUIRED");
    const linkPayload={version:ACTION_MEMORY_LINK_VERSION,actionReceiptId:link.actionReceiptId,effectReadbackId:link.effectReadbackId,memoryReceiptId:link.memoryReceiptId,npcId:link.npcId,resolutionIndex:link.resolutionIndex};
    if(link.effectReadbackId!==readback.id||npcHash(linkPayload)!==link.linkHash) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_LINK_MISMATCH");
    const linkedMemory=(await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.id,link.memoryReceiptId)).limit(1))[0];
    if(!linkedMemory||linkedMemory.npcId!==npcId||linkedMemory.resolutionIndex!==link.resolutionIndex) throw new Error("NPC_SEMANTIC_GRAPH_V2_LINKED_MEMORY_REQUIRED");
    const sourceDecision=await confirmedDecisionById(tx,row.sourceDecisionReceiptId);
    const successorDecision=await confirmedDecisionById(tx,row.successorNpcReceiptId);
    result.push(verifyPerformedActionEvidence({
      sourceDecision,successorDecision,actionReceipt:action,
      effectReadback:{
        id:readback.id,actionReceiptId:readback.actionReceiptId,effectsHash:readback.effectsHash,
        npcReceiptId:readback.npcReceiptId,npcDecisionHash:readback.npcDecisionHash,worldReceiptId:readback.worldReceiptId,
        worldReactionHash:readback.worldReactionHash,polityId:readback.polityId,polityStateHash:readback.polityStateHash,
        marketStateHash:readback.marketStateHash,inventoryStateHash:readback.inventoryStateHash,
        sourceRevision:readback.sourceRevision,readbackHash:readback.readbackHash,
      },
      memoryLink:{
        id:link.id,actionReceiptId:link.actionReceiptId,effectReadbackId:link.effectReadbackId,
        memoryReceiptId:link.memoryReceiptId,npcId:link.npcId,resolutionIndex:link.resolutionIndex,linkHash:link.linkHash,
      },
    }));
  }
  return Object.freeze(result);
}
async function graphEvidence(
  tx:NpcTransaction,
  memory:ConfirmedNpcMultiMemory,
  previousGraph:NpcSemanticMemoryGraph|null,
){
  return Object.freeze({
    memory:memory.memory,
    memoryReceipts:await verifiedMemoryReceipts(tx,memory),
    performedActions:await verifiedPerformedActions(tx,memory.row.npcId,memory.row.resolutionIndex),
    previousGraph,
  });
}
async function memoryForGraphRow(tx:NpcTransaction,row:GraphRow):Promise<ConfirmedNpcMultiMemory>{
  const memoryRow=(await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.id,row.memoryReceiptId)).limit(1))[0];
  if(!memoryRow) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_RECEIPT_REQUIRED");
  const memory=await readNpcMultiMemoryForDecision(tx,memoryRow.sourceDecisionReceiptId);
  if(!memory||memory.row.id!==row.memoryReceiptId||memory.row.resolutionIndex!==row.generation) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_READBACK_MISMATCH");
  return memory;
}
function expectedProvenanceComparable(rows:ReturnType<typeof provenanceRows>){
  return rows.map(({id:_,...row})=>row);
}
async function verifyStoredRows(tx:NpcTransaction,row:GraphRow,graph:NpcSemanticMemoryGraph):Promise<void>{
  const [nodes,edges,provenance,index]=await Promise.all([
    tx.select().from(aurionSemanticGraphNodesV2).where(eq(aurionSemanticGraphNodesV2.graphReceiptId,row.id)).orderBy(asc(aurionSemanticGraphNodesV2.id)),
    tx.select().from(aurionSemanticGraphEdgesV2).where(eq(aurionSemanticGraphEdgesV2.graphReceiptId,row.id)).orderBy(asc(aurionSemanticGraphEdgesV2.id)),
    tx.select().from(aurionSemanticGraphProvenanceV2).where(eq(aurionSemanticGraphProvenanceV2.graphReceiptId,row.id)).orderBy(asc(aurionSemanticGraphProvenanceV2.id)),
    tx.select().from(aurionSemanticGraphIndexV2).where(eq(aurionSemanticGraphIndexV2.graphReceiptId,row.id)).orderBy(asc(aurionSemanticGraphIndexV2.nodeId)),
  ]);
  const expectedNodes=graph.nodes.map(node=>nodeRow(row.id,graph.npcId,node)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const expectedEdges=graph.edges.map(edge=>edgeRow(row.id,graph.npcId,edge)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const expectedProv=provenanceRows(row.id,graph);
  const expectedIndex=indexRows(row.id,graph);
  const stripCreated=<T extends {createdAt?:unknown}>(values:readonly T[])=>values.map(({createdAt:_,...value})=>value);
  if(stableCatalogStringify(stripCreated(nodes))!==stableCatalogStringify(expectedNodes)||
     stableCatalogStringify(stripCreated(edges))!==stableCatalogStringify(expectedEdges)||
     stableCatalogStringify(stripCreated(index))!==stableCatalogStringify(expectedIndex)||
     stableCatalogStringify(expectedProvenanceComparable(stripCreated(provenance) as typeof expectedProv))!==stableCatalogStringify(expectedProvenanceComparable(expectedProv))){
    throw new Error("NPC_SEMANTIC_GRAPH_V2_ROW_READBACK_MISMATCH");
  }
}
async function verifiedGraphFromRow(
  tx:NpcTransaction,
  row:GraphRow,
  seenGraphHashes:ReadonlySet<string>=new Set(),
):Promise<Readonly<{
  row:Readonly<GraphRow>;
  graph:NpcSemanticMemoryGraph;
  memory:ConfirmedNpcMultiMemory;
  evidence:Awaited<ReturnType<typeof graphEvidence>>;
}>>{
  assertPin();
  if(seenGraphHashes.has(row.graphHash)) throw new Error("NPC_SEMANTIC_GRAPH_V2_PREDECESSOR_CYCLE");
  if(row.sourceRevision!==pin.sourceRevision||row.sourceSha256!==pin.sourceSha256||row.capsuleManifestSha256!==pin.manifestSha256) throw new Error("NPC_SEMANTIC_GRAPH_V2_SOURCE_DRIFT");
  const receiptCore={
    version:GRAPH_RECEIPT_VERSION,id:row.id,npcId:row.npcId,generation:row.generation,graphVersion:row.graphVersion,
    retrievalVersion:row.retrievalVersion,memoryReceiptId:row.memoryReceiptId,sourceRevision:row.sourceRevision,
    sourceSha256:row.sourceSha256,capsuleManifestSha256:row.capsuleManifestSha256,previousGraphHash:row.previousGraphHash,graphHash:row.graphHash,
  };
  if(npcHash(receiptCore)!==row.receiptHash) throw new Error("NPC_SEMANTIC_GRAPH_V2_RECEIPT_HASH_MISMATCH");

  const prior=(await tx.select().from(aurionSemanticGraphReceiptsV2)
    .where(and(
      eq(aurionSemanticGraphReceiptsV2.npcId,row.npcId),
      lt(aurionSemanticGraphReceiptsV2.generation,row.generation),
    ))
    .orderBy(desc(aurionSemanticGraphReceiptsV2.generation)).limit(1))[0];

  let previousGraph:NpcSemanticMemoryGraph|null=null;
  if(row.previousGraphHash===null){
    if(prior) throw new Error("NPC_SEMANTIC_GRAPH_V2_PREDECESSOR_GAP");
  }else{
    if(!prior||prior.graphHash!==row.previousGraphHash) throw new Error("NPC_SEMANTIC_GRAPH_V2_PREDECESSOR_MISMATCH");
    const nextSeen=new Set(seenGraphHashes);nextSeen.add(row.graphHash);
    const verifiedPrevious=await verifiedGraphFromRow(tx,prior,nextSeen);
    if(verifiedPrevious.graph.graphHash!==row.previousGraphHash||verifiedPrevious.graph.generation>=row.generation) throw new Error("NPC_SEMANTIC_GRAPH_V2_PREDECESSOR_MISMATCH");
    previousGraph=verifiedPrevious.graph;
  }

  const memory=await memoryForGraphRow(tx,row);
  const evidence=await graphEvidence(tx,memory,previousGraph);
  const graph=verifyNpcSemanticMemoryGraph(row.graphJson,evidence);
  if(graph.npcId!==row.npcId||graph.generation!==row.generation||graph.graphHash!==row.graphHash||
     graph.previousGraphHash!==row.previousGraphHash||
     graph.version!==row.graphVersion||graph.retrievalVersion!==row.retrievalVersion||
     graph.authority.sourceRevision!==row.sourceRevision||graph.authority.sourceSha256!==row.sourceSha256) throw new Error("NPC_SEMANTIC_GRAPH_V2_GRAPH_READBACK_MISMATCH");
  await verifyStoredRows(tx,row,graph);
  return Object.freeze({row:Object.freeze(row),graph,memory,evidence});
}

export async function appendNpcSemanticGraphV2(
  tx:NpcTransaction,
  memory:ConfirmedNpcMultiMemory,
  options:Readonly<{failureInjection?:FailurePoint}>={},
){
  assertPin();
  if(memory.row.sourceRevision!==pin.sourceRevision||memory.row.sourceSha256!==pin.sourceSha256) throw new Error("NPC_SEMANTIC_GRAPH_V2_MEMORY_SOURCE_DRIFT");

  const latest=(await tx.select().from(aurionSemanticGraphReceiptsV2)
    .where(eq(aurionSemanticGraphReceiptsV2.npcId,memory.row.npcId))
    .orderBy(desc(aurionSemanticGraphReceiptsV2.generation)).limit(1))[0];
  if(latest&&latest.generation>memory.row.resolutionIndex) throw new Error("NPC_SEMANTIC_GRAPH_V2_GENERATION_REGRESSION");
  if(latest&&latest.generation===memory.row.resolutionIndex){
    if(latest.memoryReceiptId!==memory.row.id||latest.sourceRevision!==pin.sourceRevision||latest.capsuleManifestSha256!==pin.manifestSha256) throw new Error("NPC_SEMANTIC_GRAPH_V2_CONFLICTING_DUPLICATE");
    return verifiedGraphFromRow(tx,latest);
  }

  const verifiedPrevious=latest?await verifiedGraphFromRow(tx,latest):null;
  const evidence=await graphEvidence(tx,memory,verifiedPrevious?.graph??null);
  const graph=compileNpcSemanticMemoryGraph(evidence);
  if(graph.npcId!==memory.row.npcId||graph.generation!==memory.row.resolutionIndex||graph.memoryHash!==memory.row.memoryHash||
     graph.previousGraphHash!==(verifiedPrevious?.graph.graphHash??null)) throw new Error("NPC_SEMANTIC_GRAPH_V2_SOURCE_GRAPH_MISMATCH");

  const id=graphReceiptId(graph);
  const core=graphReceiptCore({id,graph,memoryReceiptId:memory.row.id});
  const receiptHash=npcHash(core);
  const graphJson=stableCatalogStringify(graph);
  const {version:_receiptVersion,...dbCore}=core;
  await tx.insert(aurionSemanticGraphReceiptsV2).values({...dbCore,graphJson,receiptHash});
  if(options.failureInjection==="after_receipt") throw new Error("AIM294_FORCED_AFTER_GRAPH_RECEIPT");
  for(const [index,node] of graph.nodes.entries()){
    await tx.insert(aurionSemanticGraphNodesV2).values(nodeRow(id,graph.npcId,node));
    if(index===0&&options.failureInjection==="after_node") throw new Error("AIM294_FORCED_AFTER_GRAPH_NODE");
  }
  for(const [index,edge] of graph.edges.entries()){
    await tx.insert(aurionSemanticGraphEdgesV2).values(edgeRow(id,graph.npcId,edge));
    if(index===0&&options.failureInjection==="after_edge") throw new Error("AIM294_FORCED_AFTER_GRAPH_EDGE");
  }
  const prov=provenanceRows(id,graph);
  for(const [index,row] of prov.entries()){
    await tx.insert(aurionSemanticGraphProvenanceV2).values(row);
    if(index===0&&options.failureInjection==="after_provenance") throw new Error("AIM294_FORCED_AFTER_GRAPH_PROVENANCE");
  }
  const idx=indexRows(id,graph);
  if(idx.length) await tx.insert(aurionSemanticGraphIndexV2).values(idx);
  if(options.failureInjection==="before_readback") throw new Error("AIM294_FORCED_BEFORE_GRAPH_READBACK");
  const stored=(await tx.select().from(aurionSemanticGraphReceiptsV2).where(eq(aurionSemanticGraphReceiptsV2.id,id)).limit(1))[0];
  if(!stored||stored.receiptHash!==receiptHash||stored.graphJson!==graphJson) throw new Error("NPC_SEMANTIC_GRAPH_V2_RECEIPT_READBACK_REQUIRED");
  return verifiedGraphFromRow(tx,stored);
}

export async function readVerifiedNpcSemanticGraphV2(tx:NpcTransaction,npcId:string){
  const row=(await tx.select().from(aurionSemanticGraphReceiptsV2).where(eq(aurionSemanticGraphReceiptsV2.npcId,npcId))
    .orderBy(desc(aurionSemanticGraphReceiptsV2.generation)).limit(1))[0];
  return row?verifiedGraphFromRow(tx,row):null;
}

export async function rebuildSemanticGraphIndexV2(tx:NpcTransaction,npcId:string){
  const confirmed=await readVerifiedNpcSemanticGraphV2(tx,npcId);
  if(!confirmed) return null;
  const query={logicalIndex:confirmed.graph.generation,startKeys:[npcId],maxDepth:4,maxCandidates:64,maxResults:32} as const;
  const before=retrieveNpcSemanticMemoryGraph(confirmed.graph,query);
  await tx.delete(aurionSemanticGraphIndexV2).where(eq(aurionSemanticGraphIndexV2.graphReceiptId,confirmed.row.id));
  const rows=indexRows(confirmed.row.id,confirmed.graph);
  if(rows.length) await tx.insert(aurionSemanticGraphIndexV2).values(rows);
  const afterConfirmed=await verifiedGraphFromRow(tx,confirmed.row);
  const after=retrieveNpcSemanticMemoryGraph(afterConfirmed.graph,query);
  if(before.resultHash!==after.resultHash||stableCatalogStringify(before)!==stableCatalogStringify(after)) throw new Error("NPC_SEMANTIC_GRAPH_V2_INDEX_REBUILD_DRIFT");
  return Object.freeze({graphHash:confirmed.graph.graphHash,resultHash:after.resultHash,indexCount:rows.length});
}

function publicSemanticKey(node:NpcSemanticGraphNode):string|null{
  return ["actor","location","goal","procedural_competency","polity","item_resource"].includes(node.kind)?node.key:null;
}
function isActiveAt(status:string,from:number,until:number|null,index:number):boolean{
  return status==="active"&&index>=from&&(until===null||index<until);
}

export async function readConfirmedNpcSemanticGraphPacket(userId:number){
  if(!Number.isSafeInteger(userId)||userId<1) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_OWNER_INVALID");
  const db=await getDb(); if(!db) throw new Error("Game database is not available");
  return db.transaction(async tx=>{
    const states=await tx.select().from(aurionNpcStates).where(inArray(aurionNpcStates.npcId,[...visibleNpcs])).limit(visibleNpcs.length);
    const graphs=[];
    for(const state of states.sort((a,b)=>a.npcId<b.npcId?-1:a.npcId>b.npcId?1:0)){
      if(state.lastResolutionIndex<0) continue;
      const confirmed=await readVerifiedNpcSemanticGraphV2(tx,state.npcId);
      if(!confirmed||confirmed.row.generation!==state.lastResolutionIndex) throw new Error("NPC_SEMANTIC_GRAPH_CURRENT_READBACK_REQUIRED");
      const query={logicalIndex:confirmed.graph.generation,startKeys:[state.npcId],maxDepth:4,maxCandidates:64,maxResults:32} as const;
      const result=retrieveNpcSemanticMemoryGraph(confirmed.graph,query);
      const resultIds=new Set(result.results.map(item=>item.nodeId));
      const nodes=result.results.map(item=>{
        const source=confirmed.graph.nodes.find(node=>node.id===item.nodeId);
        if(!source) throw new Error("NPC_SEMANTIC_GRAPH_RESULT_NODE_MISSING");
        return Object.freeze({nodeId:item.nodeId,kind:item.kind,semanticKey:publicSemanticKey(source),status:"active" as const,depth:item.depth,score:item.score,payloadHash:item.payloadHash});
      });
      const relations=confirmed.graph.edges
        .filter(edge=>resultIds.has(edge.fromNodeId)&&resultIds.has(edge.toNodeId)&&isActiveAt(edge.status,edge.validFromIndex,edge.validUntilIndex,confirmed.graph.generation))
        .sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.fromNodeId<b.fromNodeId?-1:a.fromNodeId>b.fromNodeId?1:a.toNodeId<b.toNodeId?-1:a.toNodeId>b.toNodeId?1:0)
        .slice(0,64)
        .map(edge=>Object.freeze({kind:edge.kind,fromNodeId:edge.fromNodeId,toNodeId:edge.toNodeId,status:"active" as const}));
      const excluded={
        expired:confirmed.graph.nodes.filter(node=>node.status==="expired").length,
        contradicted:confirmed.graph.nodes.filter(node=>node.status==="contradicted").length,
        superseded:confirmed.graph.nodes.filter(node=>node.status==="superseded").length,
      };
      const bounds={maxDepth:4,maxCandidates:64,maxResults:32};
      const publicCore={npcId:state.npcId,generation:confirmed.graph.generation,graphHash:confirmed.graph.graphHash,sourceResultHash:result.resultHash,sourceRevision:confirmed.row.sourceRevision,provenanceStatus:"VERIFIED" as const,bounds,nodes,relations,excluded};
      graphs.push(Object.freeze({...publicCore,resultHash:npcHash(publicCore)}));
    }
    return Object.freeze({userId,format:"aurion-public-npc-semantic-graph.v2" as const,graphs:Object.freeze(graphs)});
  });
}
