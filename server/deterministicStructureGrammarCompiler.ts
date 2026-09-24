import { createHash } from "node:crypto";
import {
  AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION,
  AURION_STRUCTURE_GRAMMAR_PROTOCOL,
  DEFAULT_STRUCTURE_GRAMMAR_MAX_DEPTH,
  DEFAULT_STRUCTURE_GRAMMAR_MAX_NODES,
  DEFAULT_STRUCTURE_GRAMMAR_MIN_SIZE_MM,
  STRUCTURE_GRAMMAR_SCALE_UNITS,
  StructureGrammarCompilationError,
  type DeterministicStructureGrammar,
  type DeterministicStructureGrammarCompilerInput,
  type StructureGrammarNode,
  type StructureGrammarRule,
  type StructureGrammarTransform,
  type StructureRecipe,
  type StructuralPrimitive,
  type StructureGrammarCoordinate,
  type StructureGrammarPrimitive,
  type StructureGrammarFailureCode,
  type StructureGrammarCompilation,
} from "@shared/deterministicStructureGrammarProtocol";

type MutableTransform = {
  positionMm: { x: number; y: number; z: number };
  rotationDiscrete: { x: number; y: number; z: number };
  scaleFixed: { x: number; y: number; z: number };
};

const DOMAIN_INPUT = "aurion.structure.input.v1";
const DOMAIN_RECIPE = "aurion.structure.recipe.v1";
const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function fail(code: StructureGrammarFailureCode, message: string): never {
  throw new StructureGrammarCompilationError(code, message);
}

function assertText(value: string | undefined, field: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail("INVALID_INPUT", `${field} must be a trimmed non-empty string`);
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) fail("INVALID_INPUT", `${field} must be a safe integer`);
}

function assertPositiveSafeInteger(value: number, field: string): void {
  assertSafeInteger(value, field);
  if (value <= 0) fail("INVALID_INPUT", `${field} must be positive`);
}

function assertCoordinate(coordinate: StructureGrammarCoordinate): void {
  assertSafeInteger(coordinate.x, "chunkCoordinate.x");
  assertSafeInteger(coordinate.z, "chunkCoordinate.z");
}

function canonicalSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256(domain: string, value: unknown): string {
  return createHash("sha256").update(`${domain}::${canonicalSerialize(value)}`, "utf8").digest("hex");
}

function normalizeQuarterTurns(value: number): number {
  assertSafeInteger(value, "rotateDiscrete");
  return ((value % 4) + 4) % 4;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail("SAFE_INTEGER_OVERFLOW", `${field} exceeds safe integer range`);
  return result;
}

function safeScaled(value: number, scaleFixed: number, field: string): number {
  assertSafeInteger(value, field);
  assertSafeInteger(scaleFixed, `scaleFixed.${field}`);
  if (scaleFixed <= 0) fail("INVALID_GRAMMAR", `scaleFixed.${field} must be positive`);
  const result = (BigInt(value) * BigInt(scaleFixed)) / BigInt(STRUCTURE_GRAMMAR_SCALE_UNITS);
  if (result < -BigInt(SAFE_INTEGER) || result > BigInt(SAFE_INTEGER)) fail("SAFE_INTEGER_OVERFLOW", `${field} exceeds safe integer range after scaling`);
  const number = Number(result);
  if (!Number.isSafeInteger(number)) fail("SAFE_INTEGER_OVERFLOW", `${field} is not a safe integer after scaling`);
  return number;
}

function safeMultiplyInteger(left: number, right: number, field: string): number {
  assertSafeInteger(left, field);
  assertSafeInteger(right, field);
  const result = BigInt(left) * BigInt(right);
  if (result < -BigInt(SAFE_INTEGER) || result > BigInt(SAFE_INTEGER)) fail("SAFE_INTEGER_OVERFLOW", `${field} exceeds safe integer range`);
  return Number(result);
}

function validatePrimitive(primitive: StructureGrammarPrimitive, path: string): void {
  if (!["box", "cylinder", "wedge"].includes(primitive.kind)) fail("INVALID_GRAMMAR", `${path}.primitive.kind is unsupported`);
  for (const axis of ["x", "y", "z"] as const) assertPositiveSafeInteger(primitive.sizeMm[axis], `${path}.primitive.sizeMm.${axis}`);
  if (primitive.assetKey !== undefined) assertText(primitive.assetKey, `${path}.primitive.assetKey`);
  if (primitive.materialKey !== undefined) assertText(primitive.materialKey, `${path}.primitive.materialKey`);
}

function validateTransform(transform: StructureGrammarTransform, path: string): void {
  for (const axis of ["x", "y", "z"] as const) {
    const translate = transform.translateMm?.[axis];
    if (translate !== undefined) assertSafeInteger(translate, `${path}.translateMm.${axis}`);
    const rotate = transform.rotateDiscrete?.[axis];
    if (rotate !== undefined) assertSafeInteger(rotate, `${path}.rotateDiscrete.${axis}`);
    const scale = transform.scaleFixed?.[axis];
    if (scale !== undefined) {
      assertPositiveSafeInteger(scale, `${path}.scaleFixed.${axis}`);
      if (scale > 1_000_000) fail("INVALID_GRAMMAR", `${path}.scaleFixed.${axis} exceeds 1000x bound`);
    }
  }
}

function validateNode(node: StructureGrammarNode, path: string): void {
  if (!node || typeof node !== "object") fail("INVALID_GRAMMAR", `${path} must be an object`);
  if (node.kind === "primitive") {
    validatePrimitive(node.primitive, path);
    return;
  }
  if (node.kind === "call") {
    assertText(node.ruleId, `${path}.ruleId`);
    return;
  }
  if (node.kind === "repeat") {
    assertPositiveSafeInteger(node.count, `${path}.count`);
    assertSafeInteger(node.stepMm.x, `${path}.stepMm.x`);
    assertSafeInteger(node.stepMm.y, `${path}.stepMm.y`);
    assertSafeInteger(node.stepMm.z, `${path}.stepMm.z`);
    validateNode(node.node, `${path}.node`);
    return;
  }
  if (node.kind === "branch") {
    if (node.choices.length === 0) fail("INVALID_GRAMMAR", `${path}.choices must not be empty`);
    let totalWeight = 0n;
    for (let index = 0; index < node.choices.length; index += 1) {
      const choice = node.choices[index]!;
      assertPositiveSafeInteger(choice.weight, `${path}.choices[${index}].weight`);
      totalWeight += BigInt(choice.weight);
      validateNode(choice.node, `${path}.choices[${index}].node`);
    }
    if (totalWeight <= 0n) fail("INVALID_GRAMMAR", `${path}.choices total weight must be positive`);
    return;
  }
  if (node.kind === "transform") {
    validateTransform(node.transform, path);
    validateNode(node.node, `${path}.node`);
    return;
  }
  fail("INVALID_GRAMMAR", `${path}.kind is unsupported`);
}

function validateGrammar(grammar: DeterministicStructureGrammar): Map<string, StructureGrammarRule> {
  assertText(grammar.grammarId, "grammar.grammarId");
  assertText(grammar.grammarVersion, "grammar.grammarVersion");
  assertText(grammar.rootRuleId, "grammar.rootRuleId");
  if (grammar.rules.length === 0) fail("INVALID_GRAMMAR", "grammar.rules must not be empty");

  const rules = new Map<string, StructureGrammarRule>();
  for (let index = 0; index < grammar.rules.length; index += 1) {
    const rule = grammar.rules[index]!;
    assertText(rule.id, `grammar.rules[${index}].id`);
    if (rules.has(rule.id)) fail("INVALID_GRAMMAR", `duplicate rule id: ${rule.id}`);
    validateNode(rule.body, `grammar.rules[${index}].body`);
    rules.set(rule.id, rule);
  }
  if (!rules.has(grammar.rootRuleId)) fail("RULE_NOT_FOUND", `root rule not found: ${grammar.rootRuleId}`);
  for (const rule of rules.values()) validateCalls(rule.body, rules);
  return rules;
}

function canonicalGrammar(grammar: DeterministicStructureGrammar): DeterministicStructureGrammar {
  return {
    ...grammar,
    rules: [...grammar.rules].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  };
}

function validateCalls(node: StructureGrammarNode, rules: ReadonlyMap<string, StructureGrammarRule>): void {
  if (node.kind === "call") {
    if (!rules.has(node.ruleId)) fail("RULE_NOT_FOUND", `referenced rule not found: ${node.ruleId}`);
    return;
  }
  if (node.kind === "repeat" || node.kind === "transform") {
    validateCalls(node.node, rules);
    return;
  }
  if (node.kind === "branch") {
    for (const choice of node.choices) validateCalls(choice.node, rules);
  }
}

function addDependencies(
  ruleIds: Set<string>,
  assetKeys: Set<string>,
  materialKeys: Set<string>,
  ruleId: string,
  primitive: StructureGrammarPrimitive,
): void {
  ruleIds.add(ruleId);
  if (primitive.assetKey) assetKeys.add(primitive.assetKey);
  if (primitive.materialKey) materialKeys.add(primitive.materialKey);
}

function applyTransform(state: MutableTransform, transform: StructureGrammarTransform): MutableTransform {
  const next: MutableTransform = {
    positionMm: { ...state.positionMm },
    rotationDiscrete: { ...state.rotationDiscrete },
    scaleFixed: { ...state.scaleFixed },
  };
  for (const axis of ["x", "y", "z"] as const) {
    const translate = transform.translateMm?.[axis] ?? 0;
    next.positionMm[axis] = safeAdd(next.positionMm[axis], translate, `positionMm.${axis}`);
    next.rotationDiscrete[axis] = normalizeQuarterTurns(next.rotationDiscrete[axis] + (transform.rotateDiscrete?.[axis] ?? 0));
    const scale = transform.scaleFixed?.[axis] ?? STRUCTURE_GRAMMAR_SCALE_UNITS;
    next.scaleFixed[axis] = safeScaled(next.scaleFixed[axis], scale, `scaleFixed.${axis}`);
    if (next.scaleFixed[axis] <= 0) fail("MIN_SIZE_REACHED", `scaleFixed.${axis} reached zero`);
  }
  return next;
}

function expandedSize(primitive: StructureGrammarPrimitive, state: MutableTransform): Readonly<{ x: number; y: number; z: number }> {
  return {
    x: safeScaled(primitive.sizeMm.x, state.scaleFixed.x, "sizeMm.x"),
    y: safeScaled(primitive.sizeMm.y, state.scaleFixed.y, "sizeMm.y"),
    z: safeScaled(primitive.sizeMm.z, state.scaleFixed.z, "sizeMm.z"),
  };
}

function deriveBranchChoice(
  inputHash: string,
  path: string,
  choices: readonly Readonly<{ weight: number; node: StructureGrammarNode }>[],
): number {
  let totalWeight = 0n;
  for (const choice of choices) totalWeight += BigInt(choice.weight);
  const digest = createHash("sha256").update(`${DOMAIN_INPUT}::${inputHash}::branch::${path}`, "utf8").digest();
  const value = BigInt(`0x${digest.toString("hex").slice(0, 16)}`);
  let cursor = value % totalWeight;
  for (let index = 0; index < choices.length; index += 1) {
    const weight = BigInt(choices[index]!.weight);
    if (cursor < weight) return index;
    cursor -= weight;
  }
  return choices.length - 1;
}

export function compileDeterministicStructureGrammar(
  input: DeterministicStructureGrammarCompilerInput,
): StructureGrammarCompilation {
  assertText(input.worldId, "worldId");
  assertText(input.worldSeedHash, "worldSeedHash");
  assertText(input.anchorId, "anchorId");
  assertText(input.sourceRevision, "sourceRevision");
  if (input.sourceCausalRoot !== undefined) assertText(input.sourceCausalRoot, "sourceCausalRoot");
  assertCoordinate(input.chunkCoordinate);

  const maxDepth = input.maxDepth ?? DEFAULT_STRUCTURE_GRAMMAR_MAX_DEPTH;
  const maxNodes = input.maxNodes ?? DEFAULT_STRUCTURE_GRAMMAR_MAX_NODES;
  const minSizeMm = input.minSizeMm ?? DEFAULT_STRUCTURE_GRAMMAR_MIN_SIZE_MM;
  assertPositiveSafeInteger(maxDepth, "maxDepth");
  assertPositiveSafeInteger(maxNodes, "maxNodes");
  assertPositiveSafeInteger(minSizeMm, "minSizeMm");

  const rules = validateGrammar(input.grammar);
  const inputGrammar = canonicalGrammar(input.grammar);
  const inputEnvelope = {
    protocol: AURION_STRUCTURE_GRAMMAR_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION,
    worldId: input.worldId,
    worldSeedHash: input.worldSeedHash,
    grammar: inputGrammar,
    chunkCoordinate: input.chunkCoordinate,
    anchorId: input.anchorId,
    sourceCausalRoot: input.sourceCausalRoot,
    sourceRevision: input.sourceRevision,
    maxDepth,
    maxNodes,
    minSizeMm,
  };
  const inputHash = sha256(DOMAIN_INPUT, inputEnvelope);

  const primitives: StructuralPrimitive[] = [];
  const ruleIds = new Set<string>();
  const assetKeys = new Set<string>();
  const materialKeys = new Set<string>();
  let nodesVisited = 0;
  let maxDepthObserved = 0;

  const visit = (ruleId: string, node: StructureGrammarNode, state: MutableTransform, path: string, depth: number): void => {
    if (depth > maxDepth) fail("DEPTH_BUDGET_EXCEEDED", `grammar depth exceeded at ${path}`);
    if (nodesVisited >= maxNodes) fail("NODE_BUDGET_EXCEEDED", `grammar node budget exceeded at ${path}`);
    nodesVisited += 1;
    maxDepthObserved = Math.max(maxDepthObserved, depth);
    ruleIds.add(ruleId);

    if (node.kind === "primitive") {
      const sizeMm = expandedSize(node.primitive, state);
      if (Math.min(sizeMm.x, sizeMm.y, sizeMm.z) < minSizeMm) fail("MIN_SIZE_REACHED", `primitive at ${path} is smaller than minSizeMm`);
      const primitive: StructuralPrimitive = {
        id: `${path}/primitive`,
        ruleId,
        primitive: node.primitive.kind,
        ...(node.primitive.assetKey ? { assetKey: node.primitive.assetKey } : {}),
        ...(node.primitive.materialKey ? { materialKey: node.primitive.materialKey } : {}),
        positionMm: { ...state.positionMm },
        rotationDiscrete: { ...state.rotationDiscrete },
        sizeMm,
      };
      primitives.push(primitive);
      addDependencies(ruleIds, assetKeys, materialKeys, ruleId, node.primitive);
      return;
    }

    if (node.kind === "call") {
      const called = rules.get(node.ruleId);
      if (!called) fail("RULE_NOT_FOUND", `referenced rule not found: ${node.ruleId}`);
      visit(called.id, called.body, state, `${path}/call:${called.id}`, depth + 1);
      return;
    }

    if (node.kind === "transform") {
      visit(ruleId, node.node, applyTransform(state, node.transform), `${path}/transform`, depth + 1);
      return;
    }

    if (node.kind === "repeat") {
      const offset = {
        x: safeScaled(node.stepMm.x, state.scaleFixed.x, "repeat.stepMm.x"),
        y: safeScaled(node.stepMm.y, state.scaleFixed.y, "repeat.stepMm.y"),
        z: safeScaled(node.stepMm.z, state.scaleFixed.z, "repeat.stepMm.z"),
      };
      for (let index = 0; index < node.count; index += 1) {
        const repeatedState: MutableTransform = {
          positionMm: {
            x: safeAdd(state.positionMm.x, safeMultiplyInteger(offset.x, index, "repeat.offset.x"), "repeat.positionMm.x"),
            y: safeAdd(state.positionMm.y, safeMultiplyInteger(offset.y, index, "repeat.offset.y"), "repeat.positionMm.y"),
            z: safeAdd(state.positionMm.z, safeMultiplyInteger(offset.z, index, "repeat.offset.z"), "repeat.positionMm.z"),
          },
          rotationDiscrete: { ...state.rotationDiscrete },
          scaleFixed: { ...state.scaleFixed },
        };
        visit(ruleId, node.node, repeatedState, `${path}/repeat:${index}`, depth + 1);
      }
      return;
    }

    if (node.kind === "branch") {
      const choiceIndex = deriveBranchChoice(inputHash, path, node.choices);
      visit(ruleId, node.choices[choiceIndex]!.node, state, `${path}/branch:${choiceIndex}`, depth + 1);
      return;
    }

    fail("INVALID_GRAMMAR", `${path} has unsupported node kind`);
  };

  const root = rules.get(input.grammar.rootRuleId)!;
  const initialState: MutableTransform = {
    positionMm: { x: 0, y: 0, z: 0 },
    rotationDiscrete: { x: 0, y: 0, z: 0 },
    scaleFixed: { x: STRUCTURE_GRAMMAR_SCALE_UNITS, y: STRUCTURE_GRAMMAR_SCALE_UNITS, z: STRUCTURE_GRAMMAR_SCALE_UNITS },
  };
  visit(root.id, root.body, initialState, `root:${root.id}`, 0);

  primitives.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const dependencies = Object.freeze({
    ruleIds: Object.freeze(Array.from(ruleIds).sort()),
    assetKeys: Object.freeze(Array.from(assetKeys).sort()),
    materialKeys: Object.freeze(Array.from(materialKeys).sort()),
  });
  const recipe: StructureRecipe = Object.freeze({
    protocol: AURION_STRUCTURE_GRAMMAR_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION,
    grammarId: input.grammar.grammarId,
    grammarVersion: input.grammar.grammarVersion,
    rootRuleId: input.grammar.rootRuleId,
    worldId: input.worldId,
    worldSeedHash: input.worldSeedHash,
    chunkCoordinate: { ...input.chunkCoordinate },
    anchorId: input.anchorId,
    ...(input.sourceCausalRoot ? { sourceCausalRoot: input.sourceCausalRoot } : {}),
    sourceRevision: input.sourceRevision,
    primitives: Object.freeze(primitives),
  });
  const canonicalRecipe = canonicalSerialize(recipe);
  const deterministicFingerprint = sha256(DOMAIN_RECIPE, recipe);

  return Object.freeze({
    inputHash,
    canonicalRecipe,
    recipe,
    deterministicFingerprint,
    dependencies,
    stats: Object.freeze({
      nodesVisited,
      primitivesEmitted: primitives.length,
      maxDepthObserved,
    }),
  });
}
