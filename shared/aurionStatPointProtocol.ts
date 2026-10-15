export const AURION_STAT_WALLET_RULESET = "aurion.stat-points.v1" as const;
export const aurionStatAttributes = ["strength", "agility", "stamina", "intelligence", "perception", "willpower", "treatment", "engineering", "defense"] as const;
export type AurionStatAttribute = typeof aurionStatAttributes[number];
const WEAPONS = new Set(["blade_mastery", "staff_mastery", "spear_mastery", "focus_mastery", "axe_mastery", "mace_mastery", "dagger_mastery", "bow_mastery", "shield_mastery"]);
const exact = (value: string): bigint => {
  if (!/^[1-9][0-9]*$/.test(value) || value.length > 128) throw new Error("AURION_STAT_LEVEL_INVALID");
  return BigInt(value);
};
const exactAmount = (value: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 128) throw new Error("AURION_STAT_AMOUNT_INVALID");
  return BigInt(value);
};
export type StatLevelEvidence = Readonly<{ levelExact: string; sourceReceiptId: string }>;
export type StatMasteryEvidence = StatLevelEvidence & Readonly<{ trackId: string }>;
export type StatAllocation = Readonly<{ key: AurionStatAttribute; amountExact: string; idempotencyKey: string }>;
export type StatWalletInput = Readonly<{ userId: number; character: StatLevelEvidence | null; masteries: readonly StatMasteryEvidence[]; allocations: readonly StatAllocation[] }>;
export function resolveAurionStatWallet(input: StatWalletInput) {
  if (!Number.isSafeInteger(input.userId) || input.userId < 1) throw new Error("AURION_STAT_OWNER_INVALID");
  let earned = 0n;
  if (input.character) {
    if (!input.character.sourceReceiptId) throw new Error("AURION_STAT_CHARACTER_EVIDENCE_MISSING");
    earned += 2n * (exact(input.character.levelExact) - 1n);
  }
  const masteries = new Map<string, bigint>();
  const unconfigured = new Set<string>();
  for (const item of input.masteries) {
    if (!item.trackId || !item.sourceReceiptId) throw new Error("AURION_STAT_MASTERY_EVIDENCE_MISSING");
    const level = exact(item.levelExact);
    if (!WEAPONS.has(item.trackId)) { unconfigured.add(item.trackId); continue; }
    const prior = masteries.get(item.trackId) ?? 1n;
    if (level > prior) masteries.set(item.trackId, level);
  }
  for (const level of masteries.values()) earned += level - 1n;
  const totals = new Map<AurionStatAttribute, bigint>(aurionStatAttributes.map(key => [key, 0n]));
  let spent = 0n;
  const receipts = new Set<string>();
  for (const allocation of input.allocations) {
    if (!(aurionStatAttributes as readonly string[]).includes(allocation.key)) throw new Error("AURION_STAT_ATTRIBUTE_INVALID");
    if (!allocation.idempotencyKey || receipts.has(allocation.idempotencyKey)) throw new Error("AURION_STAT_DUPLICATE_ALLOCATION");
    receipts.add(allocation.idempotencyKey);
    const amount = exactAmount(allocation.amountExact);
    if (amount < 1n) throw new Error("AURION_STAT_AMOUNT_INVALID");
    spent += amount;
    totals.set(allocation.key, totals.get(allocation.key)! + amount);
  }
  if (spent > earned) throw new Error("AURION_STAT_OVERSPEND");
  return Object.freeze({
    ruleSetVersion: AURION_STAT_WALLET_RULESET, userId: input.userId,
    earnedExact: earned.toString(), spentExact: spent.toString(), availableExact: (earned - spent).toString(),
    unconfiguredProgressions: Object.freeze([...unconfigured].sort()),
    attributes: Object.freeze(aurionStatAttributes.map(key => Object.freeze({
      key, baselineExact: (key === "strength" || key === "agility" || key === "intelligence" || key === "defense") ? "10" : "0", allocatedExact: totals.get(key)!.toString(), totalExact: ((key === "strength" || key === "agility" || key === "intelligence" || key === "defense" ? 10n : 0n) + totals.get(key)!).toString(),
    }))),
  });
}
export function confirmAurionStatAllocation(wallet: ReturnType<typeof resolveAurionStatWallet>, key: AurionStatAttribute, idempotencyKey: string): StatAllocation {
  if (!(aurionStatAttributes as readonly string[]).includes(key)) throw new Error("AURION_STAT_ATTRIBUTE_INVALID");
  if (!/^[a-zA-Z0-9:._-]{4,128}$/.test(idempotencyKey)) throw new Error("AURION_STAT_RECEIPT_INVALID");
  if (BigInt(wallet.availableExact) < 1n) throw new Error("AURION_STAT_NO_POINTS");
  return Object.freeze({ key, amountExact: "1", idempotencyKey });
}
