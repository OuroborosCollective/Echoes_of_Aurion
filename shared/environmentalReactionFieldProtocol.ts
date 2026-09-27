/**
 * Aurion Environmental Reaction Field — deterministic derived contract.
 *
 * The field is a projection of already-confirmed world reaction state. It is
 * never a world authority and never mutates gameplay state.
 */
import { canonicalSha256 } from "./aurionCanonicalHash";

export const ENVIRONMENTAL_REACTION_FIELD_VERSION = "aurion.environmental-reaction-field.v1" as const;
export const ENVIRONMENTAL_REACTION_Q16_MAX = 65_536 as const;

export type EnvironmentalReactionField = Readonly<{
  version: typeof ENVIRONMENTAL_REACTION_FIELD_VERSION;
  fieldId: string;
  regionId: string;
  resolutionIndex: number;
  sourceReceiptId: string;
  sourceStateHash: string;
  hazardQ16: number;
  opportunityQ16: number;
  traversalRiskQ16: number;
  resourcePressureQ16: number;
  rulesetVersion: string;
  contentVersion: string;
  fieldHash: string;
}>;

export function environmentalReactionFieldHash(
  field: Omit<EnvironmentalReactionField, "fieldHash">,
): string {
  return canonicalSha256({
    domain: ENVIRONMENTAL_REACTION_FIELD_VERSION,
    version: field.version,
    fieldId: field.fieldId,
    regionId: field.regionId,
    resolutionIndex: field.resolutionIndex,
    sourceReceiptId: field.sourceReceiptId,
    sourceStateHash: field.sourceStateHash,
    hazardQ16: field.hazardQ16,
    opportunityQ16: field.opportunityQ16,
    traversalRiskQ16: field.traversalRiskQ16,
    resourcePressureQ16: field.resourcePressureQ16,
    rulesetVersion: field.rulesetVersion,
    contentVersion: field.contentVersion,
  });
}
