import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_GLOBAL_WORLD_SCHEMA = "aurion.global.world.v1" as const;

export interface ZoneProofReference {
  zoneId: string;
  tick: number;
  postStateHash: string;
}

export interface GlobalWorldCanonicalState {
  schema: typeof AURION_GLOBAL_WORLD_SCHEMA;
  worldId: string;
  epoch: number;
  zoneProofs: ZoneProofReference[];
  rulesetVersion: string;
}

export function hashGlobalWorldCanonicalState(state: GlobalWorldCanonicalState): string {
  // Sort zone proofs by zoneId for determinism
  const sortedProofs = [...state.zoneProofs].sort((a, b) => 
    a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0
  );
  
  const payload = {
    schema: state.schema,
    worldId: state.worldId,
    epoch: state.epoch,
    zoneProofs: sortedProofs,
    rulesetVersion: state.rulesetVersion,
  };
  
  return canonicalSha256(payload);
}
