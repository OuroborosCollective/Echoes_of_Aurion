import { createHash } from "node:crypto";

/** Pure, receipt-bound Aurion adapters for Wasd social and long-lived world semantics. */
export type RelationshipState = { sourceId: string; targetId: string; value: number; tier: "hostile" | "wary" | "neutral" | "trusted" | "devoted"; receiptHash: string };
export type FamilyRecord = { id: string; parents: readonly string[]; houseId: string; bornResolutionIndex: number; receiptHash: string };
export type AchievementState = { playerId: string; unlocked: readonly string[]; newlyUnlocked: readonly string[]; receiptHash: string };
export type PartyState = { id: string; leaderId: string; members: readonly string[]; receiptHash: string };
export type PartyResolution = { state: "resolved" | "rejected"; reason?: "not_leader" | "party_full" | "target_in_party" | "not_in_party"; party?: PartyState; receiptHash: string };

const MAX_PARTY_SIZE = 4;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clamp = (value: number, lower = -1, upper = 1) => Math.max(lower, Math.min(upper, Math.round(value * 10_000) / 10_000));
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

export function resolveAge(input: { entityId: string; currentAge: number; years: number; receiptId: string; resolutionIndex: number }) {
  if (!input.entityId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Age resolution requires stable identity, receipt and resolution index");
  const currentAge = Math.max(0, Math.floor(input.currentAge));
  const years = Math.max(0, Math.floor(input.years));
  const age = currentAge + years;
  return { entityId: input.entityId, age, receiptHash: hash(["wasd:aging:v1", input.entityId, input.receiptId, String(input.resolutionIndex), String(age)]) };
}

export function resolveRelationship(input: { sourceId: string; targetId: string; currentValue: number; delta: number; receiptId: string }): RelationshipState {
  if (!input.sourceId || !input.targetId || !input.receiptId) throw new Error("Relationship requires stable source, target and receipt");
  const value = clamp(input.currentValue + input.delta);
  const tier: RelationshipState["tier"] = value <= -0.6 ? "hostile" : value <= -0.2 ? "wary" : value < 0.35 ? "neutral" : value < 0.75 ? "trusted" : "devoted";
  return { sourceId: input.sourceId, targetId: input.targetId, value, tier, receiptHash: hash(["wasd:relationship:v1", input.sourceId, input.targetId, input.receiptId, String(value), tier]) };
}

export function resolveFamilyRecord(input: { parents: readonly string[]; houseId: string; resolutionIndex: number; receiptId: string }): FamilyRecord {
  const parents = Array.from(new Set(input.parents.filter(Boolean))).sort(compare);
  if (parents.length === 0 || !input.houseId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Family record requires parents, house, receipt and resolution index");
  const id = `family_${hash(["wasd:family:v1", input.houseId, ...parents, String(input.resolutionIndex), input.receiptId]).slice(0, 24)}`;
  return { id, parents, houseId: input.houseId, bornResolutionIndex: input.resolutionIndex, receiptHash: hash([id, ...parents, input.houseId, String(input.resolutionIndex)]) };
}

export function resolveAchievements(input: { playerId: string; current: readonly string[]; candidates: readonly { id: string; eligible: boolean }[]; receiptId: string }): AchievementState {
  if (!input.playerId || !input.receiptId) throw new Error("Achievement resolution requires player and receipt");
  const before = new Set(input.current.filter(Boolean));
  const newlyUnlocked = input.candidates.filter(candidate => candidate.eligible && candidate.id && !before.has(candidate.id)).map(candidate => candidate.id).sort(compare);
  const unlocked = Array.from(new Set([...Array.from(before), ...newlyUnlocked])).sort(compare);
  return { playerId: input.playerId, unlocked, newlyUnlocked, receiptHash: hash(["wasd:achievements:v1", input.playerId, input.receiptId, ...unlocked]) };
}

function normalizeParty(party: PartyState): PartyState {
  const members = Array.from(new Set(party.members.filter(Boolean))).sort(compare);
  const leaderId = members.includes(party.leaderId) ? party.leaderId : members[0] ?? "";
  return { id: party.id, leaderId, members, receiptHash: hash(["wasd:party:v1", party.id, leaderId, ...members]) };
}

export function resolvePartyAction(input: { action: "create" | "invite" | "leave" | "disband"; actorId: string; targetId?: string; party?: PartyState; receiptId: string; resolutionIndex: number }): PartyResolution {
  if (!input.actorId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Party action requires actor, receipt and resolution index");
  const rejected = (reason: NonNullable<PartyResolution["reason"]>) => ({ state: "rejected" as const, reason, receiptHash: hash(["wasd:party:v1", input.action, input.actorId, input.receiptId, reason]) });
  if (input.action === "create") {
    const party = normalizeParty({ id: `party_${hash([input.actorId, input.receiptId, String(input.resolutionIndex)]).slice(0, 16)}`, leaderId: input.actorId, members: [input.actorId], receiptHash: "" });
    return { state: "resolved", party, receiptHash: hash([party.receiptHash, input.receiptId]) };
  }
  if (!input.party) return rejected("not_in_party");
  const party = normalizeParty(input.party);
  if (!party.members.includes(input.actorId)) return rejected("not_in_party");
  if (input.action === "invite") {
    if (party.leaderId !== input.actorId) return rejected("not_leader");
    if (!input.targetId || party.members.includes(input.targetId)) return rejected("target_in_party");
    if (party.members.length >= MAX_PARTY_SIZE) return rejected("party_full");
    const next = normalizeParty({ ...party, members: [...party.members, input.targetId] });
    return { state: "resolved", party: next, receiptHash: hash([next.receiptHash, input.receiptId]) };
  }
  if (input.action === "disband") {
    if (party.leaderId !== input.actorId) return rejected("not_leader");
    return { state: "resolved", party: undefined, receiptHash: hash([party.receiptHash, input.receiptId, "disband"]) };
  }
  const remaining = party.members.filter(member => member !== input.actorId);
  if (remaining.length === 0) return { state: "resolved", party: undefined, receiptHash: hash([party.receiptHash, input.receiptId, "leave_empty"]) };
  const next = normalizeParty({ ...party, leaderId: party.leaderId === input.actorId ? remaining[0]! : party.leaderId, members: remaining });
  return { state: "resolved", party: next, receiptHash: hash([next.receiptHash, input.receiptId, "leave"]) };
}
