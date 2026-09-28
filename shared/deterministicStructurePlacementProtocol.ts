import type { CanonicalWorldGraph } from "./deterministicWorldGraphGrammarProtocol";

export const AURION_STRUCTURE_PLACEMENT_PROTOCOL =
  "aurion.structure-placement.v1" as const;
export const AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION =
  "aurion.structure-placement-compiler.v1" as const;
export const AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION =
  "sha256-counter-placement-stream.v1" as const;
export const STRUCTURE_PLACEMENT_MAX_RULES = 256 as const;
export const STRUCTURE_PLACEMENT_MAX_CANDIDATES = 4_096 as const;
export const STRUCTURE_PLACEMENT_MAX_EXISTING = 4_096 as const;
export const STRUCTURE_PLACEMENT_MAX_FOOTPRINT_AREA_SQ_MM =
  1_000_000_000_000 as const;

export const STRUCTURE_PLACEMENT_KINDS = [
  "settlement",
  "road",
  "ruin",
  "dungeon",
  "poi",
] as const;
export type StructurePlacementKind = (typeof STRUCTURE_PLACEMENT_KINDS)[number];
export type StructurePlacementCoordinate = Readonly<{ x: number; z: number }>;
export type StructurePlacementBounds = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>;

export type StructurePlacementMatcher = Readonly<{
  kind: StructurePlacementKind;
  requiredTags?: readonly string[];
  forbiddenTags?: readonly string[];
}>;

export type StructurePlacementConstraints = Readonly<{
  minSpacingMm: number;
  maxSlopeBps: number;
  requireRoadConnectivity: boolean;
  requireEntranceReachability: boolean;
  allowOverlap?: boolean;
  boundsMm?: StructurePlacementBounds;
  maxFootprintAreaSqMm?: number;
}>;

export type StructurePlacementRule = Readonly<{
  id: string;
  matcher: StructurePlacementMatcher;
  replacement: Readonly<{
    footprintMm: Readonly<{ x: number; z: number }>;
    portIds: readonly string[];
    orientations: readonly number[];
    scaleRangeFixed: Readonly<{ min: number; max: number }>;
  }>;
  priority: number;
  constraints: StructurePlacementConstraints;
}>;

export type StructurePlacementCandidate = Readonly<{
  candidateId: string;
  kind: StructurePlacementKind;
  tags: readonly string[];
  graphNodeId: string;
  positionMm: StructurePlacementCoordinate;
  terrainSlopeBps: number;
  roadReachable: boolean;
  entranceReachable: boolean;
}>;

export type ExistingStructurePlacement = Readonly<{
  placementId: string;
  kind: StructurePlacementKind;
  positionMm: StructurePlacementCoordinate;
  footprintMm: Readonly<{ x: number; z: number }>;
}>;

export type StructurePlacementInput = Readonly<{
  worldId: string;
  worldSeedHash: string;
  worldGenerationRevision: string;
  rulesetHash: string;
  sourceRevision: string;
  graph: Pick<CanonicalWorldGraph, "nodes" | "edges">;
  rules: readonly StructurePlacementRule[];
  candidates: readonly StructurePlacementCandidate[];
  existingPlacements?: readonly ExistingStructurePlacement[];
  maxPlacements?: number;
}>;

export type StructurePlacement = Readonly<{
  placementId: string;
  candidateId: string;
  ruleId: string;
  kind: StructurePlacementKind;
  graphNodeId: string;
  positionMm: StructurePlacementCoordinate;
  footprintMm: Readonly<{ x: number; z: number }>;
  orientationQuarterTurns: number;
  scaleFixed: number;
  portIds: readonly string[];
  placementHash: string;
}>;

export type StructurePlacementGraphUpdate = Readonly<{
  updateId: string;
  placementId: string;
  graphNodeId: string;
  kind: "supports";
  updateHash: string;
}>;

export type StructurePlacementFailureCode =
  | "CANDIDATE_RULE_NOT_MATCHED"
  | "GRAPH_NODE_MISSING"
  | "ROAD_CONNECTIVITY_REQUIRED"
  | "DUNGEON_ENTRANCE_UNREACHABLE"
  | "TERRAIN_SLOPE_EXCEEDED"
  | "PLACEMENT_BOUNDS_EXCEEDED"
  | "FOOTPRINT_BUDGET_EXCEEDED"
  | "PLACEMENT_OVERLAP"
  | "PLACEMENT_SPACING_INSUFFICIENT"
  | "PLACEMENT_BUDGET_EXCEEDED";

export type StructurePlacementRejection = Readonly<{
  candidateId: string;
  ruleId: string | null;
  code: StructurePlacementFailureCode;
  detail: string;
}>;

export type StructurePlacementReceipt = Readonly<{
  schema: "aurion.structure-placement-receipt.v1";
  protocol: typeof AURION_STRUCTURE_PLACEMENT_PROTOCOL;
  compilerVersion: typeof AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION;
  worldId: string;
  worldSeedHash: string;
  worldGenerationRevision: string;
  rulesetHash: string;
  sourceRevision: string;
  inputHash: string;
  resolutionHash: string;
  graphUpdateHash: string;
  acceptedPlacementIds: readonly string[];
  rejectedCandidateIds: readonly string[];
  receiptHash: string;
}>;

export type StructurePlacementResolution = Readonly<{
  protocol: typeof AURION_STRUCTURE_PLACEMENT_PROTOCOL;
  compilerVersion: typeof AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION;
  streamPolicyVersion: typeof AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION;
  inputHash: string;
  placements: readonly StructurePlacement[];
  rejections: readonly StructurePlacementRejection[];
  graphUpdates: readonly StructurePlacementGraphUpdate[];
  receipt: StructurePlacementReceipt;
  resolutionHash: string;
  stats: Readonly<{
    candidatesConsidered: number;
    placementsAccepted: number;
    candidatesRejected: number;
  }>;
}>;
