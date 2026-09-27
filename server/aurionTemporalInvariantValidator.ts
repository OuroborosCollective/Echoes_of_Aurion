import {
  evaluateAurionTemporalProperty,
  evaluateAurionTemporalPropertySet,
  normalizeAurionTemporalTrace,
  aurionTemporalTraceHash,
  type AurionTemporalProperty,
  type AurionTemporalPropertyResult,
  type AurionTemporalTrace,
  type AurionTemporalValidationReport,
} from "../shared/aurionTemporalInvariantProtocol";

export {
  evaluateAurionTemporalProperty,
  evaluateAurionTemporalPropertySet,
  normalizeAurionTemporalTrace,
  aurionTemporalTraceHash,
};
export type {
  AurionTemporalProperty,
  AurionTemporalPropertyResult,
  AurionTemporalTrace,
  AurionTemporalValidationReport,
};

/**
 * Deterministic local temporal validation facade.
 *
 * This module performs no I/O, no persistence, no wall-clock access and no
 * provider calls. It validates bounded Aurion-derived traces locally so that
 * Wolfram/CAG remains optional analysis evidence rather than a runtime dependency.
 */
export function validateAurionTemporalTrace(
  trace: AurionTemporalTrace,
  property: AurionTemporalProperty,
): AurionTemporalPropertyResult {
  return evaluateAurionTemporalProperty(trace, property);
}

export function validateAurionTemporalTraceSet(
  trace: AurionTemporalTrace,
  properties: readonly AurionTemporalProperty[],
): AurionTemporalValidationReport {
  return evaluateAurionTemporalPropertySet(trace, properties);
}
