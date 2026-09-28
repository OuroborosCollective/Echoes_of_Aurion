import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

export const AIM540_EVIDENCE_SCHEMA = "aurion.loot-crafting-economy-evidence.v1" as const;

export type Aim540EvidenceStatus = "MATCH" | "UNPROVABLE" | "CONTRADICTED";

export type Aim540EvidenceStep = Readonly<{
  kind:string;
  receiptId:string;
  evidenceHash:string;
}>;

export type Aim540EvidenceSummary = Readonly<{
  schema:typeof AIM540_EVIDENCE_SCHEMA;
  worldId:string;
  status:Aim540EvidenceStatus;
  gameplayMutationAuthority:"none";
  steps:readonly Aim540EvidenceStep[];
  unprovable:readonly string[];
  contradictions:readonly string[];
  evidenceHash:string;
}>;

function assertHash(value:string,label:string){
  if(!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`AIM540_${label}_HASH_INVALID`);
}

export function createAim540EvidenceSummary(input:Readonly<{
  worldId:string;
  status:Aim540EvidenceStatus;
  steps:readonly Aim540EvidenceStep[];
  unprovable?:readonly string[];
  contradictions?:readonly string[];
}>):Aim540EvidenceSummary{
  if(!input.worldId.trim()) throw new Error("AIM540_WORLD_ID_REQUIRED");
  if(input.steps.length<1||input.steps.length>64) throw new Error("AIM540_STEP_COUNT_INVALID");
  const steps=[...input.steps].map(step=>{
    if(!step.kind.trim()||!step.receiptId.trim()) throw new Error("AIM540_STEP_ID_INVALID");
    assertHash(step.evidenceHash,"STEP");
    return Object.freeze(step);
  });
  const seen=new Set(steps.map(step=>`${step.kind}:${step.receiptId}`));
  if(seen.size!==steps.length) throw new Error("AIM540_DUPLICATE_STEP");
  const unprovable=[...(input.unprovable??[])].sort();
  const contradictions=[...(input.contradictions??[])].sort();
  if(input.status==="MATCH"&&(unprovable.length||contradictions.length)) throw new Error("AIM540_MATCH_WITH_FAILURES");
  const payload={
    schema:AIM540_EVIDENCE_SCHEMA,
    worldId:input.worldId,
    status:input.status,
    gameplayMutationAuthority:"none" as const,
    steps,
    unprovable,
    contradictions,
  };
  return Object.freeze({...payload,evidenceHash:canonicalSha256(payload)});
}
