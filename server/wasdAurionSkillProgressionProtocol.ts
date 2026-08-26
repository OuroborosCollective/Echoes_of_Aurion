import { createHash } from "node:crypto";

/**
 * Readmodel adapter for Wasd's exact ARE skill curve. It performs no persistence
 * and never grants XP; callers must bind its inputs to an already-confirmed Aurion receipt.
 */
export const aurionSkillIds = ["woodcutting", "mining", "fishing", "combat", "crafting"] as const;
export type AurionSkillId = (typeof aurionSkillIds)[number];
export type ExactProgression = { totalXpExact: string; levelExact: string; xpIntoLevelExact: string; xpForNextLevelExact: string; totalXp: number; level: number; numberProjectionExact: boolean };
export type SkillProgressionEvent = { idempotencyKey: string; skillId: AurionSkillId; amountExact: string; source: "npc_kill" | "resource_gather" | "crafting" | "quest_reward"; receiptId: string; resolutionIndex: number };
export type SkillProgressionReadmodel = { playerId: string; skillId: AurionSkillId; progression: ExactProgression; appliedReceiptIds: readonly string[]; receiptHash: string };

const zero = BigInt(0);
const one = BigInt(1);
const two = BigInt(2);
const five = BigInt(5);
const seven = BigInt(7);
const fifty = BigInt(50);
const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
const parseExact = (value: string, field: string) => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${field} must be a canonical non-negative decimal`);
  return BigInt(value);
};
const textCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
function exactPower(base: bigint, exponent: bigint): bigint {
  let result = one;
  let remaining = exponent;
  while (remaining > zero) { result *= base; remaining -= one; }
  return result;
}
function nthRootFloor(value: bigint, degree: bigint): bigint {
  if (value < two) return value;
  let low = zero; let high = one;
  while (exactPower(high, degree) <= value) high *= two;
  while (low + one < high) { const mid = (low + high) / two; if (exactPower(mid, degree) <= value) low = mid; else high = mid; }
  return low;
}
export function xpRequiredForNextSkillLevelExact(levelExact: string): string {
  const level = parseExact(levelExact, "levelExact");
  const safeLevel = level < one ? one : level;
  return nthRootFloor(exactPower(fifty, five) * exactPower(safeLevel, seven), five).toString(10);
}
function project(value: bigint) { return { value: Number(value > maxSafe ? maxSafe : value), exact: value <= maxSafe }; }
function formatState(totalXp: bigint, level: bigint, xpIntoLevel: bigint): ExactProgression {
  const needed = BigInt(xpRequiredForNextSkillLevelExact(level.toString(10)));
  const total = project(totalXp); const levelProjection = project(level);
  return { totalXpExact: totalXp.toString(10), levelExact: level.toString(10), xpIntoLevelExact: xpIntoLevel.toString(10), xpForNextLevelExact: needed.toString(10), totalXp: total.value, level: levelProjection.value, numberProjectionExact: total.exact && levelProjection.exact && needed <= maxSafe };
}
export function advanceExactSkillProgression(current: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact">, amountExact: string): ExactProgression {
  let totalXp = parseExact(current.totalXpExact, "totalXpExact");
  let level = parseExact(current.levelExact, "levelExact");
  let xpIntoLevel = parseExact(current.xpIntoLevelExact, "xpIntoLevelExact");
  let remaining = parseExact(amountExact, "amountExact");
  if (level < one) level = one;
  let needed = BigInt(xpRequiredForNextSkillLevelExact(level.toString(10)));
  if (xpIntoLevel >= needed || xpIntoLevel > totalXp) throw new Error("invalid exact skill progression state");
  while (remaining > zero) {
    needed = BigInt(xpRequiredForNextSkillLevelExact(level.toString(10)));
    const delta = needed - xpIntoLevel;
    if (remaining < delta) { xpIntoLevel += remaining; remaining = zero; }
    else { remaining -= delta; level += one; xpIntoLevel = zero; }
  }
  totalXp += parseExact(amountExact, "amountExact");
  return formatState(totalXp, level, xpIntoLevel);
}
export function resolveSkillProgressionReadmodel(input: { playerId: string; skillId: AurionSkillId; current?: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact">; events: readonly SkillProgressionEvent[] }): SkillProgressionReadmodel {
  if (!input.playerId) throw new Error("playerId is required");
  const seen = new Set<string>();
  let progression = formatState(zero, one, zero);
  if (input.current) progression = formatState(parseExact(input.current.totalXpExact, "totalXpExact"), parseExact(input.current.levelExact, "levelExact"), parseExact(input.current.xpIntoLevelExact, "xpIntoLevelExact"));
  const accepted = input.events.filter(event => event.skillId === input.skillId && Boolean(event.receiptId) && Boolean(event.idempotencyKey) && Number.isSafeInteger(event.resolutionIndex) && event.resolutionIndex >= 0)
    .slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || textCompare(left.receiptId, right.receiptId) || textCompare(left.idempotencyKey, right.idempotencyKey))
    .filter(event => { if (seen.has(event.idempotencyKey)) return false; seen.add(event.idempotencyKey); return true; });
  for (const event of accepted) progression = advanceExactSkillProgression(progression, event.amountExact);
  const receiptIds = accepted.map(event => event.receiptId);
  return { playerId: input.playerId, skillId: input.skillId, progression, appliedReceiptIds: receiptIds, receiptHash: hash(["wasd:skill-progression:v1", input.playerId, input.skillId, ...accepted.map(event => `${event.resolutionIndex}:${event.receiptId}:${event.amountExact}:${event.idempotencyKey}`)]) };
}
