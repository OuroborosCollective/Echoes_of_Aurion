import { z } from "zod";

export const GROUP_RULESET = "aurion-groups.v1" as const;
export const groupRoles = ["tank", "healer", "dps"] as const;
export const groupSkills = ["mending_light", "guardian_stance"] as const;
export const groupVariants = ["normal", "elite", "challenge", "endless"] as const;
export const groupDungeonIds = ["dungeon_aschengewoelbe", "dungeon_sonnenspitze", "dungeon_windhain", "dungeon_aethermine"] as const;
export type GroupRole = typeof groupRoles[number];
export type GroupSkill = typeof groupSkills[number];
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const userId = z.number().int().positive();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^[a-f0-9]{40}$/);
export const groupCommandSchema = z.object({
  expectedRevision: revision,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("equip"), skills: z.array(z.enum(groupSkills)).max(2).refine(v => new Set(v).size === v.length) }).strict(),
    z.object({ kind: z.literal("join"), dungeonId: z.enum(groupDungeonIds), variant: z.enum(groupVariants), role: z.enum(groupRoles), qualificationHash: digest }).strict(),
    z.object({ kind: z.literal("renew") }).strict(),
    z.object({ kind: z.literal("cancel") }).strict(),
    z.object({ kind: z.literal("ready"), partyId: digest, rosterHash: digest, ready: z.boolean() }).strict(),
    z.object({ kind: z.literal("enter"), ticketId: digest, ticketHash: digest }).strict(),
    z.object({ kind: z.literal("exit") }).strict(),
    z.object({ kind: z.literal("leave"), partyId: digest, rosterHash: digest }).strict(),
    z.object({ kind: z.literal("strike"), ticketId: digest, expectedInstanceRevision: revision }).strict(),
    z.object({ kind: z.literal("heal"), ticketId: digest, expectedInstanceRevision: revision, targetUserId: userId }).strict(),
  ]),
}).strict();
export type GroupCommand = z.infer<typeof groupCommandSchema>;

export const groupPlayerSchema = z.object({
  userId, revision, skills: z.array(z.enum(groupSkills)).max(2),
  status: z.enum(["idle", "queued", "formed", "entered"]),
  queueKey: z.string().nullable(), ordinal: revision, role: z.enum(groupRoles).nullable(),
  qualificationHash: digest.nullable(), leaseUntilMs: revision,
  partyId: digest.nullable(), ready: z.boolean(),
}).strict();
export type GroupPlayer = z.infer<typeof groupPlayerSchema>;
export const rosterMemberSchema = z.object({
  userId, name: z.string().max(120), role: z.enum(groupRoles), ordinal: revision,
  qualificationHash: digest, skills: z.array(z.enum(groupSkills)).max(2), weaponTrack: z.enum(["blade", "staff", "spear", "focus"]).nullable(),
}).strict();
export type RosterMember = z.infer<typeof rosterMemberSchema>;
const position = z.object({ x: z.number().int(), z: z.number().int() }).strict();
export const groupTicketSchema = z.object({
  id: digest, partyId: digest, rosterHash: digest, ruleset: z.literal(GROUP_RULESET), sourceRevision,
  catalogHash: digest, worldHash: z.string().regex(/^fnv1a-[a-f0-9]{8}$/), worldSnapshotSha256: digest, seed: digest,
  dungeonId: z.enum(groupDungeonIds), label: z.string(), variant: z.enum(groupVariants),
  roster: z.array(rosterMemberSchema).length(5),
  regionHash: digest, progressionHash: digest,
  affixes: z.array(z.string()).max(10),
  rooms: z.array(z.object({ id: revision, kind: z.string(), position, hash: digest }).strict()).min(4).max(9),
  bosses: z.array(z.object({ id: z.string(), hp: z.number().int().positive(), damage: z.number().int().nonnegative() }).strict()).min(2).max(4),
  playerMaxHp: z.number().int().positive(), playerDamage: z.number().int().positive(), healAmount: z.number().int().positive(),
  rewardStatus: z.literal("not_integrated"), hash: digest,
}).strict();
export type GroupTicket = z.infer<typeof groupTicketSchema>;
export const groupPartySchema = z.object({
  id: digest, revision, sourceRevision, dungeonId: z.enum(groupDungeonIds), variant: z.enum(groupVariants),
  roster: z.array(rosterMemberSchema).length(5), rosterHash: digest, leaderUserId: userId,
  phase: z.enum(["ready", "active", "cleared", "aborted"]), ticketId: digest.nullable(),
  instanceRevision: revision, bossIndex: revision, bossHp: revision,
  health: z.array(z.object({ userId, hp: revision }).strict()).max(5),
  lastActionAtMs: revision,
}).strict();
export type GroupParty = z.infer<typeof groupPartySchema>;
export const groupReadmodelSchema = z.object({
  ruleset: z.literal(GROUP_RULESET), sourceRevision, player: groupPlayerSchema,
  qualification: z.object({ hash: digest, roles: z.array(z.enum(groupRoles)).max(3), weaponTrack: z.string().nullable() }).strict(),
  catalog: z.array(z.object({ id: z.enum(groupDungeonIds), label: z.string() }).strict()).length(4),
  party: groupPartySchema.nullable(), readyUserIds: z.array(userId).max(5), enteredUserIds: z.array(userId).max(5),
  ticket: groupTicketSchema.nullable(),
}).strict().superRefine((value, context) => {
  const reject = () => context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent group membership or ticket" });
  const unique = (ids: readonly unknown[]) => new Set(ids).size === ids.length;
  const { player, party, ticket, readyUserIds, enteredUserIds } = value;
  if (!unique(player.skills) || !unique(value.qualification.roles) || !unique(value.catalog.map(d => d.id))) reject();
  if (value.qualification.roles.includes("healer") && !player.skills.includes("mending_light")) reject();
  if (value.qualification.roles.includes("tank") && !player.skills.includes("guardian_stance")) reject();
  if (!party) {
    if (player.partyId || ticket || readyUserIds.length || enteredUserIds.length || player.ready || !["idle", "queued"].includes(player.status)) reject();
    if (player.status === "queued" && (!player.queueKey || !player.role || !player.qualificationHash || player.ordinal === 0)) reject();
    if (player.status === "idle" && (player.queueKey || player.role || player.qualificationHash)) reject();
    return;
  }
  const ids = party.roster.map(member => member.userId);
  const actor = party.roster.find(member => member.userId === player.userId);
  if (player.partyId !== party.id || !actor || !["formed", "entered"].includes(player.status) || player.queueKey) reject();
  if (actor && (actor.role !== player.role || actor.qualificationHash !== player.qualificationHash || JSON.stringify(actor.skills) !== JSON.stringify(player.skills))) reject();
  if (!unique(ids) || !ids.includes(party.leaderUserId) || !unique(party.roster.map(m => m.ordinal))) reject();
  for (const [role, count] of [["tank", 1], ["healer", 1], ["dps", 3]] as const) if (party.roster.filter(m => m.role === role).length !== count) reject();
  if (!unique(readyUserIds) || !unique(enteredUserIds) || [...readyUserIds, ...enteredUserIds].some(id => !ids.includes(id))) reject();
  if (player.ready !== readyUserIds.includes(player.userId) || (player.status === "entered") !== enteredUserIds.includes(player.userId) || enteredUserIds.some(id => !readyUserIds.includes(id))) reject();
  if (ticket) {
    if (ticket.id !== party.ticketId || ticket.partyId !== party.id || ticket.rosterHash !== party.rosterHash || ticket.sourceRevision !== party.sourceRevision || ticket.dungeonId !== party.dungeonId || ticket.variant !== party.variant || JSON.stringify(ticket.roster) !== JSON.stringify(party.roster)) reject();
    if (party.phase === "ready" || readyUserIds.length !== 5 || party.health.length !== 5 || party.bossIndex > ticket.bosses.length) reject();
    if (party.health.some(h => h.hp > ticket.playerMaxHp)) reject();
  } else if (party.ticketId || party.phase !== "ready" || party.health.length || enteredUserIds.length) reject();
  if (!unique(party.health.map(h => h.userId)) || party.health.some(h => !ids.includes(h.userId))) reject();
});
export type GroupReadmodel = z.infer<typeof groupReadmodelSchema>;
