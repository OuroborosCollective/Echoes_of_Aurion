export type ProvenanceObservation = "OBSERVED" | "UNVERIFIED" | "UNOBSERVABLE";

export interface AurionProvenance {
  commit: string;
  sourceRevision: string;
  dirty: boolean;
  buildTimestamp: string;
  buildInputDigest: string;
  artifactDigest: string;
  runtimeImageDigest: string;
  observation: {
    sourceRevision: ProvenanceObservation;
    buildInputDigest: ProvenanceObservation;
    artifactDigest: ProvenanceObservation;
    runtimeImageDigest: ProvenanceObservation;
  };
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
