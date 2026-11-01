export const AURION_ZONE_RULESET_VERSION: "aurion.zone.rules.v3";
export const AURION_SUPPORTED_ZONE_RULESETS: readonly ["aurion.zone.rules.v2", "aurion.zone.rules.v3"];
export type SupportedAurionZoneRuleset = typeof AURION_SUPPORTED_ZONE_RULESETS[number];
export const AURION_BINARY_AUTHORITY: Readonly<{
  ruleset: "aurion-zone-v3";
  rulesetScope: "runtime-default";
  defaultRulesetVersion: typeof AURION_ZONE_RULESET_VERSION;
  supportedZoneRulesets: typeof AURION_SUPPORTED_ZONE_RULESETS;
  tickHz: 10;
  causalReceipts: true;
}>;
export function isSupportedAurionZoneRuleset(value: unknown): value is SupportedAurionZoneRuleset;
export function requireZoneRulesetEvidence(zoneRulesetVersion: unknown, receipts: unknown, ...authorities: unknown[]): SupportedAurionZoneRuleset;
