/** Canonical runtime capabilities; a binary default never proves an executed ruleset. */
export const AURION_ZONE_RULESET_VERSION = "aurion.zone.rules.v3";
export const AURION_SUPPORTED_ZONE_RULESETS = Object.freeze([
  "aurion.zone.rules.v2", AURION_ZONE_RULESET_VERSION,
]);
export const AURION_BINARY_AUTHORITY = Object.freeze({
  ruleset: "aurion-zone-v3",
  rulesetScope: "runtime-default",
  defaultRulesetVersion: AURION_ZONE_RULESET_VERSION,
  supportedZoneRulesets: AURION_SUPPORTED_ZONE_RULESETS,
  tickHz: 10,
  causalReceipts: true,
});

export function isSupportedAurionZoneRuleset(value) {
  return typeof value === "string" && AURION_SUPPORTED_ZONE_RULESETS.includes(value);
}

/** Hash/chain validation stays at the caller; every executed receipt must use the certified rules. */
export function requireZoneRulesetEvidence(zoneRulesetVersion, receipts, ...authorities) {
  const fail = () => { throw new Error("GAMEPLAY_RULESET_MISMATCH"); };
  if (!isSupportedAurionZoneRuleset(zoneRulesetVersion)
    || !Array.isArray(receipts) || receipts.length < 1 || receipts.length > 256
    || authorities.length < 1) return fail();
  for (let index = 0; index < receipts.length; index += 1) {
    if (receipts[index]?.rulesetVersion !== zoneRulesetVersion) return fail();
  }
  for (const authority of authorities) {
    if (!authority || authority.ruleset !== AURION_BINARY_AUTHORITY.ruleset
      || authority.rulesetScope !== AURION_BINARY_AUTHORITY.rulesetScope
      || authority.defaultRulesetVersion !== AURION_ZONE_RULESET_VERSION
      || authority.tickHz !== 10 || authority.causalReceipts !== true
      || !Array.isArray(authority.supportedZoneRulesets)
      || authority.supportedZoneRulesets.length !== AURION_SUPPORTED_ZONE_RULESETS.length
      || Array.from(authority.supportedZoneRulesets).some((version, index) => version !== AURION_SUPPORTED_ZONE_RULESETS[index])) return fail();
  }
  return zoneRulesetVersion;
}
