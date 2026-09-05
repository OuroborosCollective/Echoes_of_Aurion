import { createHash } from "node:crypto";
import { GROUP_RULESET, groupRoles, groupTicketSchema, type GroupParty, type GroupRole, type GroupSkill, type GroupTicket, type RosterMember } from "../shared/groupInstanceProtocol";
import content from "../shared/aurionAx1ContentCatalog.json";
import { validateAurionAx1ContentCatalog, stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { isWeaponTrack } from "./endgameProtocol";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveRegionProgression } from "./aurionRegionProgressionProtocol";
import { resolveDungeonProgression } from "./aurionDungeonProgressionProtocol";
import { resolveExpeditionLayout } from "./wasdAurionExpeditionProtocol";

export const groupCatalog = validateAurionAx1ContentCatalog(content);
export const groupHash = (value: unknown) => createHash("sha256").update(stableCatalogStringify(value)).digest("hex");
export const GROUP_QUEUE_LIMIT = 500;
export const GROUP_LEASE_MS = 90_000;

export function groupQualification(input: { userId: number; level: number; selectedClass: string; weaponTrack: string | null; skills: readonly GroupSkill[] }) {
  if (!Number.isSafeInteger(input.userId) || input.userId < 1 || !Number.isSafeInteger(input.level) || input.level < 1) throw new Error("GROUP_PROFILE_REQUIRED");
  const skills = [...input.skills].sort();
  const roles: GroupRole[] = [];
  // Skills are available from the authenticated level-one profile. Neither a
  // class identity nor a weapon family grants or blocks a healing capability.
  if (skills.includes("guardian_stance")) roles.push("tank");
  if (skills.includes("mending_light")) roles.push("healer");
  if (input.weaponTrack && isWeaponTrack(input.weaponTrack)) roles.push("dps");
  return { hash: groupHash({ ruleset: GROUP_RULESET, ...input, skills }), roles, weaponTrack: input.weaponTrack };
}

/** FIFO within each requested role; no random teammates and no flexible-role duplication. */
export function oldestCompleteGroup<T extends { userId: number; ordinal: number; role: GroupRole }>(entries: readonly T[]): T[] {
  if (entries.length > GROUP_QUEUE_LIMIT || new Set(entries.map(entry => entry.userId)).size !== entries.length || new Set(entries.map(entry => entry.ordinal)).size !== entries.length) throw new Error("GROUP_QUEUE_CORRUPT_OR_OVER_BUDGET");
  if (entries.some(entry => !groupRoles.includes(entry.role) || !Number.isSafeInteger(entry.ordinal) || entry.ordinal < 1)) throw new Error("GROUP_QUEUE_CORRUPT_OR_OVER_BUDGET");
  const sorted = [...entries].sort((a, b) => a.ordinal - b.ordinal);
  const tanks = sorted.filter(entry => entry.role === "tank");
  const healers = sorted.filter(entry => entry.role === "healer");
  const damage = sorted.filter(entry => entry.role === "dps");
  return tanks.length && healers.length && damage.length >= 3 ? [tanks[0]!, healers[0]!, ...damage.slice(0, 3)].sort((a, b) => a.ordinal - b.ordinal) : [];
}

export function assertGroupRoster(roster: readonly RosterMember[], expectedHash: string) {
  if (roster.length !== 5 || new Set(roster.map(m => m.userId)).size !== 5 || groupHash(roster) !== expectedHash || groupRoles.some((role, index) => roster.filter(member => member.role === role).length !== [1, 1, 3][index])) throw new Error("GROUP_ROSTER_CORRUPT");
}

function boundedInteger(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || BigInt(value) > 2_000_000_000n) throw new Error("GROUP_COMBAT_BUDGET_UNREPRESENTABLE");
  return Number(value);
}

export function issueGroupTicket(party: GroupParty, world: { snapshotJson: string; snapshotHash: string }): GroupTicket {
  assertGroupRoster(party.roster, party.rosterHash);
  const stored = JSON.parse(world.snapshotJson);
  const plan = buildGlobalWorldPlan({ worldSeed: stored.worldSeed, epoch: stored.epoch, activePlayerCount: stored.activePlayerCount, highWaterPlayerCount: stored.highWaterPlayerCount });
  if (plan.deterministicHash !== world.snapshotHash || stableCatalogStringify(plan) !== stableCatalogStringify(stored)) throw new Error("GROUP_WORLD_EVIDENCE_CORRUPT");
  const dungeon = groupCatalog.dungeons.find(item => item.id === party.dungeonId);
  if (!dungeon || !plan.sectors.length) throw new Error("GROUP_DUNGEON_UNAVAILABLE");
  const worldSnapshotSha256 = groupHash(plan);
  const seed = groupHash({ ruleset: GROUP_RULESET, partyId: party.id, rosterHash: party.rosterHash, worldHash: world.snapshotHash, worldSnapshotSha256, catalogHash: groupCatalog.catalogSha256 });
  // The portal binds to an actual persisted-world sector. Catalog zone labels
  // are source content, never manufactured global-world snapshots.
  const sector = plan.sectors[Number(BigInt(`0x${groupHash(party.dungeonId)}`) % BigInt(plan.sectors.length))]!;
  // v1 uses a normalized level-one instance budget, not invented earned
  // mastery. All variants enter floor one; advancing floors is a later slice.
  const mastery = { combatLevelExact: "1", gatheringLevelExact: "1", professionLevelExact: "1", socialLevelExact: "1", politicsLevelExact: "1" };
  const region = resolveRegionProgression({ worldSeed: plan.worldSeed, epoch: plan.epoch, resolutionIndex: 0, sector, mastery, partySize: 5 });
  const progression = resolveDungeonProgression({ worldSeed: plan.worldSeed, epoch: plan.epoch, region, variant: party.variant, floorExact: "1", partySize: 5, combatMasteryLevelExact: "1", sourceReceiptDigest: party.rosterHash });
  const layout = resolveExpeditionLayout({ expeditionId: party.id, seed, tier: Math.min(10, Math.max(1, Math.floor(progression.combatBudgetBps / 10_000))), resolutionIndex: 0 });
  const playerMaxHp = boundedInteger(region.archetype.referencePlayerEffectiveHpExact);
  const payload = {
    id: groupHash({ ruleset: GROUP_RULESET, partyId: party.id, seed }), partyId: party.id, rosterHash: party.rosterHash,
    ruleset: GROUP_RULESET, sourceRevision: party.sourceRevision, catalogHash: groupCatalog.catalogSha256,
    worldHash: world.snapshotHash, worldSnapshotSha256, seed, dungeonId: party.dungeonId, label: dungeon.label, variant: party.variant, roster: party.roster,
    regionHash: region.deterministicHash, progressionHash: progression.deterministicHash,
    affixes: progression.affixes.map(affix => affix.key),
    rooms: layout.rooms.map(room => ({ id: room.id, kind: room.kind, position: { x: room.id * 12_000, z: 0 }, hash: room.receiptHash })),
    bosses: dungeon.bosses.map((id, index) => ({ id, hp: boundedInteger(progression.enemyBudget.hpExact) + index * boundedInteger(region.archetype.referencePlayerDpsExact), damage: boundedInteger(progression.enemyBudget.outgoingDamagePerSecondExact) })),
    playerMaxHp, playerDamage: boundedInteger(region.archetype.referencePlayerDpsExact), healAmount: Math.max(1, Math.floor(playerMaxHp / 4)),
    // This integration owns queue, roster, admission and shared instance state.
    // The existing native dungeon/quest reward transactions are not invoked.
    rewardStatus: "not_integrated" as const,
  };
  return groupTicketSchema.parse({ ...payload, hash: groupHash(payload) });
}

export function verifyGroupTicket(input: unknown): GroupTicket {
  const ticket = groupTicketSchema.parse(input);
  const { hash, ...payload } = ticket;
  assertGroupRoster(ticket.roster, ticket.rosterHash);
  if (groupHash(payload) !== hash || ticket.id !== groupHash({ ruleset: GROUP_RULESET, partyId: ticket.partyId, seed: ticket.seed })) throw new Error("GROUP_TICKET_CORRUPT");
  return ticket;
}

/** One accepted intent resolves one exchange. No wall clock enters combat outcomes. */
export function resolveGroupExchange(party: GroupParty, ticket: GroupTicket, actorUserId: number, intent: { kind: "strike" } | { kind: "heal"; targetUserId: number }, admittedUserIds: readonly number[]) {
  if (party.phase !== "active" || party.ticketId !== ticket.id || !admittedUserIds.includes(actorUserId)) throw new Error("GROUP_ADMISSION_REQUIRED");
  const roster = ticket.roster.find(member => member.userId === actorUserId);
  const actor = party.health.find(member => member.userId === actorUserId);
  if (!roster || !actor || actor.hp <= 0) throw new Error("GROUP_LIVING_ACTOR_REQUIRED");
  const next = structuredClone(party);
  if (intent.kind === "heal") {
    if (!roster.skills.includes("mending_light")) throw new Error("GROUP_HEAL_SKILL_REQUIRED");
    const target = next.health.find(member => member.userId === intent.targetUserId);
    if (!target || !admittedUserIds.includes(target.userId) || target.hp <= 0) throw new Error("GROUP_HEAL_TARGET_INVALID");
    if (target.hp >= ticket.playerMaxHp) throw new Error("GROUP_HEAL_TARGET_FULL");
    target.hp = Math.min(ticket.playerMaxHp, target.hp + ticket.healAmount);
  } else {
    if (!roster.weaponTrack) throw new Error("GROUP_WEAPON_REQUIRED");
    next.bossHp = Math.max(0, next.bossHp - ticket.playerDamage);
    if (next.bossHp === 0) {
      next.bossIndex += 1;
      if (next.bossIndex === ticket.bosses.length) next.phase = "cleared";
      else next.bossHp = ticket.bosses[next.bossIndex]!.hp;
    } else {
      const tank = ticket.roster.find(member => member.role === "tank")!;
      const target = next.health.find(member => member.userId === tank.userId && member.hp > 0 && admittedUserIds.includes(member.userId)) ?? next.health.find(member => member.userId === actorUserId)!;
      target.hp = Math.max(0, target.hp - ticket.bosses[next.bossIndex]!.damage);
      if (next.health.every(member => member.hp === 0)) next.phase = "aborted";
    }
  }
  next.instanceRevision += 1;
  next.revision += 1;
  return next;
}
