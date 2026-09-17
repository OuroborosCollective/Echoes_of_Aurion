export interface AurionProvenance {
  commit: string;
  sourceRevision: string;
  dirty: boolean;
  buildTimestamp: string;
  buildInputDigest: string;
  artifactDigest: string;
  runtimeImageDigest: string;
  authority: {
    ruleset: string;
    tickHz: number;
    causalReceipts: boolean;
  };
  rulesets: {
    movement: string;
    combat: string;
    bladeSkills: string;
    mobFsm: string;
    intentContract: string;
    tickContract: string;
  };
  runtimeHash: string;
}

