/**
 * Aurion NPC Utility Planner — Determinism Guard.
 *
 * Automated check that enforces the two non-negotiable determinism rules
 * (Issue #468 §3):
 *
 *  1. All scoring values are strictly integer basis points (BPS).
 *     No float arithmetic may leak into the scoring path.
 *  2. No forbidden time/random functions are used in the planner code path:
 *     Date.now, Math.random, crypto.randomUUID, process.hrtime,
 *     performance.now, new Date().
 *
 * The guard is a pure, side-effect-free validator. It does NOT execute the
 * planner; it inspects the context structure and scans the planner source text
 * for forbidden identifiers.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NPC_UTILITY_BPS_MAX,
  NPC_UTILITY_BPS_MIN,
  NPC_UTILITY_NEED_KEYS,
  type NpcUtilityCandidate,
  type NpcUtilityPlannerContext,
} from "../shared/npcUtilityPlannerProtocol";

// ---------------------------------------------------------------------------
// BPS field list — every numeric field that must be a safe integer in [0, 10000]
// ---------------------------------------------------------------------------

const CANDIDATE_BPS_FIELDS = [
  "needPressureBps",
  "benefitBps",
  "riskBps",
  "costBps",
] as const;

const CONTEXT_BPS_FIELDS = [
  "hungerBps",
  "fatigueBps",
] as const;

// ---------------------------------------------------------------------------
// Forbidden identifiers — any occurrence in the planner source is a violation
// ---------------------------------------------------------------------------

export const FORBIDDEN_IDENTIFIERS = [
  "Date.now",
  "Math.random",
  "crypto.randomUUID",
  "process.hrtime",
  "performance.now",
  "new Date(",
] as const;

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type GuardViolation = Readonly<{
  field: string;
  value: string;
  reason: string;
}>;

export type GuardResult = Readonly<{
  passed: boolean;
  bpsViolations: readonly GuardViolation[];
  forbiddenFunctionViolations: readonly string[];
  checkedFields: number;
}>;

// ---------------------------------------------------------------------------
// BPS validation — ensures every scoring field is a safe integer in range
// ---------------------------------------------------------------------------

function checkBpsValue(value: unknown, field: string, violations: GuardViolation[]): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    violations.push({
      field,
      value: String(value),
      reason: value === undefined ? "missing" : "not a safe integer",
    });
    return;
  }
  if (value < NPC_UTILITY_BPS_MIN || value > NPC_UTILITY_BPS_MAX) {
    violations.push({
      field,
      value: String(value),
      reason: `out of range [${NPC_UTILITY_BPS_MIN}, ${NPC_UTILITY_BPS_MAX}]`,
    });
  }
}

/**
 * Validate that all BPS scoring fields in a planner context are safe integers
 * within the allowed range. Returns the list of violations (empty = valid).
 */
export function validateContextBps(
  context: NpcUtilityPlannerContext,
): readonly GuardViolation[] {
  const violations: GuardViolation[] = [];

  for (const field of CONTEXT_BPS_FIELDS) {
    checkBpsValue((context as Record<string, unknown>)[field], field, violations);
  }

  // Personality bonus values (optional)
  if (context.personalityBonusBps) {
    for (const [key, value] of Object.entries(context.personalityBonusBps)) {
      if (value !== undefined) {
        checkBpsValue(value, `personalityBonusBps.${key}`, violations);
      }
    }
  }

  // Goal persistence bonus (optional)
  if (context.goalPersistenceBonusBps !== undefined) {
    checkBpsValue(context.goalPersistenceBonusBps, "goalPersistenceBonusBps", violations);
  }

  // Candidate BPS fields
  for (const candidate of context.candidates) {
    for (const field of CANDIDATE_BPS_FIELDS) {
      checkBpsValue((candidate as Record<string, unknown>)[field], `candidate.${candidate.id}.${field}`, violations);
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Forbidden function scan — static text scan of the planner source
// ---------------------------------------------------------------------------

/**
 * Strip comments from TypeScript source text so that forbidden-identifier
 * scans only flag actual code usage, not documentation that mentions the
 * forbidden primitives by name (e.g. "No Date.now, Math.random, …").
 */
function stripComments(sourceText: string): string {
  return sourceText
    // Remove block comments /* … */
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Remove line comments // …
    .replace(/\/\/[^\n]*/g, "")
    // Remove string literals that merely mention the identifier in text
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * Scan a source text for forbidden time/random identifiers.
 * Comments and string literals are stripped first so that only actual code
 * usage is flagged.
 * Returns the list of forbidden identifiers found.
 */
export function scanSourceForForbiddenFunctions(
  sourceText: string,
  forbidden: readonly string[] = FORBIDDEN_IDENTIFIERS,
): readonly string[] {
  const codeOnly = stripComments(sourceText);
  const found: string[] = [];
  for (const identifier of forbidden) {
    if (codeOnly.includes(identifier)) {
      found.push(identifier);
    }
  }
  return found;
}

/**
 * Scan the planner implementation source file for forbidden functions.
 * Resolves the path relative to this module.
 */
export function scanPlannerSource(
  plannerFilePath?: string,
): readonly string[] {
  const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "npcUtilityPlanner.ts");
  const sourceText = readFileSync(plannerFilePath ?? defaultPath, "utf-8");
  return scanSourceForForbiddenFunctions(sourceText);
}

// ---------------------------------------------------------------------------
// Combined guard — runs both checks and returns a structured result
// ---------------------------------------------------------------------------

/**
 * Run the full determinism guard: BPS integer validation on the context
 * and forbidden-function scan on the planner source.
 *
 * @param context The planner context to validate.
 * @param plannerSourceText Optional raw source text to scan (defaults to the
 *   planner module file). Useful for tests.
 */
export function runUtilityPlannerGuard(
  context: NpcUtilityPlannerContext,
  plannerSourceText?: string,
): GuardResult {
  const bpsViolations = validateContextBps(context);
  const forbiddenFunctionViolations =
    plannerSourceText !== undefined
      ? scanSourceForForbiddenFunctions(plannerSourceText)
      : scanPlannerSource();

  const checkedFields =
    CONTEXT_BPS_FIELDS.length +
    context.candidates.length * CANDIDATE_BPS_FIELDS.length +
    (context.personalityBonusBps
      ? Object.keys(context.personalityBonusBps).length
      : 0) +
    (context.goalPersistenceBonusBps !== undefined ? 1 : 0);

  return Object.freeze({
    passed: bpsViolations.length === 0 && forbiddenFunctionViolations.length === 0,
    bpsViolations,
    forbiddenFunctionViolations,
    checkedFields,
  });
}
