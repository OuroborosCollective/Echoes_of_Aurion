export const AURION_STRUCTURE_GRAMMAR_PROTOCOL = "aurion.structure-grammar.v1" as const;
export const AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION = "aurion.structure-grammar-compiler.v1" as const;
export const DEFAULT_STRUCTURE_GRAMMAR_MAX_DEPTH = 32 as const;
export const DEFAULT_STRUCTURE_GRAMMAR_MAX_NODES = 4096 as const;
export const DEFAULT_STRUCTURE_GRAMMAR_MIN_SIZE_MM = 10 as const;
export const STRUCTURE_GRAMMAR_SCALE_UNITS = 1000 as const;

export type StructureGrammarCoordinate = Readonly<{ x: number; z: number }>;

export type StructureGrammarPrimitiveKind = "box" | "cylinder" | "wedge";

export type StructureGrammarPrimitive = Readonly<{
  kind: StructureGrammarPrimitiveKind;
  assetKey?: string;
  materialKey?: string;
  sizeMm: Readonly<{ x: number; y: number; z: number }>;
}>;

export type StructureGrammarTransform = Readonly<{
  translateMm?: Readonly<{ x: number; y: number; z: number }>;
  rotateDiscrete?: Readonly<{ x: number; y: number; z: number }>;
  scaleFixed?: Readonly<{ x: number; y: number; z: number }>;
}>;

export type StructureGrammarNode =
  | Readonly<{ kind: "primitive"; primitive: StructureGrammarPrimitive }>
  | Readonly<{ kind: "call"; ruleId: string }>
  | Readonly<{ kind: "repeat"; count: number; stepMm: Readonly<{ x: number; y: number; z: number }>; node: StructureGrammarNode }>
  | Readonly<{ kind: "branch"; choices: readonly Readonly<{ weight: number; node: StructureGrammarNode }>[] }>
  | Readonly<{ kind: "transform"; transform: StructureGrammarTransform; node: StructureGrammarNode }>;

export type StructureGrammarRule = Readonly<{
  id: string;
  body: StructureGrammarNode;
}>;

export type DeterministicStructureGrammar = Readonly<{
  grammarId: string;
  grammarVersion: string;
  rootRuleId: string;
  rules: readonly StructureGrammarRule[];
}>;

export type DeterministicStructureGrammarCompilerInput = Readonly<{
  worldId: string;
  worldSeedHash: string;
  grammar: DeterministicStructureGrammar;
  chunkCoordinate: StructureGrammarCoordinate;
  anchorId: string;
  sourceCausalRoot?: string;
  sourceRevision: string;
  maxDepth?: number;
  maxNodes?: number;
  minSizeMm?: number;
}>;

export type StructuralPrimitive = Readonly<{
  id: string;
  ruleId: string;
  primitive: StructureGrammarPrimitiveKind;
  assetKey?: string;
  materialKey?: string;
  positionMm: Readonly<{ x: number; y: number; z: number }>;
  rotationDiscrete: Readonly<{ x: number; y: number; z: number }>;
  sizeMm: Readonly<{ x: number; y: number; z: number }>;
}>;

export type StructureRecipe = Readonly<{
  protocol: typeof AURION_STRUCTURE_GRAMMAR_PROTOCOL;
  compilerVersion: typeof AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION;
  grammarId: string;
  grammarVersion: string;
  rootRuleId: string;
  worldId: string;
  worldSeedHash: string;
  chunkCoordinate: StructureGrammarCoordinate;
  anchorId: string;
  sourceCausalRoot?: string;
  sourceRevision: string;
  primitives: readonly StructuralPrimitive[];
}>;

export type StructureGrammarCompilation = Readonly<{
  inputHash: string;
  canonicalRecipe: string;
  recipe: StructureRecipe;
  deterministicFingerprint: string;
  dependencies: Readonly<{
    ruleIds: readonly string[];
    assetKeys: readonly string[];
    materialKeys: readonly string[];
  }>;
  stats: Readonly<{
    nodesVisited: number;
    primitivesEmitted: number;
    maxDepthObserved: number;
  }>;
}>;

export type StructureGrammarFailureCode =
  | "INVALID_INPUT"
  | "RULE_NOT_FOUND"
  | "DEPTH_BUDGET_EXCEEDED"
  | "NODE_BUDGET_EXCEEDED"
  | "MIN_SIZE_REACHED"
  | "SAFE_INTEGER_OVERFLOW"
  | "INVALID_GRAMMAR";

export class StructureGrammarCompilationError extends Error {
  public readonly code: StructureGrammarFailureCode;

  public constructor(code: StructureGrammarFailureCode, message: string) {
    super(message);
    this.name = "StructureGrammarCompilationError";
    this.code = code;
  }
}
