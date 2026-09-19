import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "./db";
import { aurionGlobalWorldStates, playerProfiles, users, weaponLoadouts } from "../drizzle/schema";
import { aurionGroupCoordinator, aurionGroupParties, aurionGroupPlayers, aurionGroupReceipts, aurionGroupTickets } from "../drizzle/groupInstanceSchema";
import { operationalNow } from "../shared/operationalClock";
import { GROUP_RULESET, groupCommandSchema, groupPartySchema, groupPlayerSchema, groupReadmodelSchema, type GroupCommand, type GroupParty, type GroupPlayer, type GroupReadmodel, type GroupTicket, type RosterMember } from "../shared/groupInstanceProtocol";
import { assertGroupRoster, groupCatalog, groupHash, groupQualification, GROUP_LEASE_MS, GROUP_QUEUE_LIMIT, issueGroupTicket, oldestCompleteGroup, resolveGroupExchange, verifyGroupTicket } from "./groupInstanceRules";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { commitGroupCompletionMastery } from "./groupCompletionMastery";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const coordinatorId = "roles-v1";

function runtimeRevision() {
  const revision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase();
  if (!revision || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("GROUP_RUNTIME_REVISION_REQUIRED");
  return revision;
}
function initialPlayer(userId: number): GroupPlayer {
  return { userId, revision: 0, skills: [], status: "idle", queueKey: null, ordinal: 0, role: null, qualificationHash: null, leaseUntilMs: 0, partyId: null, ready: false };
}
function idle(player: GroupPlayer): GroupPlayer {
  return { ...initialPlayer(player.userId), revision: player.revision + 1, skills: player.skills };
}
function parseStored<T>(row: { stateJson: string; stateHash: string }, schema: z.ZodType<T>): T {
  const value = schema.parse(JSON.parse(row.stateJson));
  if (groupHash(value) !== row.stateHash) throw new Error("GROUP_STORED_STATE_CORRUPT");
  return value;
}
async function playerFromRow(row: typeof aurionGroupPlayers.$inferSelect) {
  const player = parseStored(row, groupPlayerSchema);
  if (row.userId !== player.userId || row.status !== player.status || row.queueKey !== player.queueKey || row.partyId !== player.partyId) throw new Error("GROUP_PLAYER_INDEX_CORRUPT");
  return player;
}
async function readPlayer(tx: Transaction, userId: number) {
  const row = (await tx.select().from(aurionGroupPlayers).where(eq(aurionGroupPlayers.userId, userId)))[0];
  return row ? playerFromRow(row) : initialPlayer(userId);
}
async function writePlayer(tx: Transaction, input: GroupPlayer) {
  const player = groupPlayerSchema.parse(input);
  if (player.revision >= 2_000_000_000) throw new Error("GROUP_REVISION_EXHAUSTED");
  const row = { userId: player.userId, status: player.status, queueKey: player.queueKey, partyId: player.partyId, stateJson: stableCatalogStringify(player), stateHash: groupHash(player) };
  await tx.insert(aurionGroupPlayers).values(row).onDuplicateKeyUpdate({ set: row });
}
async function writeParty(tx: Transaction, party: GroupParty) {
  groupPartySchema.parse(party);
  assertGroupRoster(party.roster, party.rosterHash);
  const row = { id: party.id, stateJson: stableCatalogStringify(party), stateHash: groupHash(party) };
  await tx.insert(aurionGroupParties).values(row).onDuplicateKeyUpdate({ set: row });
}
async function readParty(tx: Transaction, id: string) {
  const row = (await tx.select().from(aurionGroupParties).where(eq(aurionGroupParties.id, id)))[0];
  if (!row) throw new Error("GROUP_PARTY_EVIDENCE_MISSING");
  const party = parseStored(row, groupPartySchema);
  assertGroupRoster(party.roster, party.rosterHash);
  if (party.id !== row.id || !party.roster.some(m => m.userId === party.leaderUserId)) throw new Error("GROUP_PARTY_IDENTITY_CORRUPT");
  return party;
}
async function readTicket(tx: Transaction, party: GroupParty): Promise<GroupTicket | null> {
  if (!party.ticketId) return null;
  const row = (await tx.select().from(aurionGroupTickets).where(eq(aurionGroupTickets.id, party.ticketId)))[0];
  if (!row) throw new Error("GROUP_TICKET_EVIDENCE_MISSING");
  const ticket = verifyGroupTicket(JSON.parse(row.ticketJson));
  if (ticket.id !== row.id || ticket.hash !== row.ticketHash || ticket.partyId !== row.partyId || ticket.partyId !== party.id || ticket.rosterHash !== party.rosterHash || ticket.sourceRevision !== row.sourceRevision || ticket.sourceRevision !== party.sourceRevision) throw new Error("GROUP_TICKET_IDENTITY_CORRUPT");
  return ticket;
}
async function qualification(tx: Transaction, player: GroupPlayer, lock = false) {
  const profileQuery = tx.select().from(playerProfiles).where(eq(playerProfiles.userId, player.userId));
  const profile = (await (lock ? profileQuery.for("update") : profileQuery))[0];
  const weaponQuery = tx.select().from(weaponLoadouts).where(eq(weaponLoadouts.userId, player.userId));
  const weapon = (await (lock ? weaponQuery.for("update") : weaponQuery))[0];
  if (!profile) throw new Error("GROUP_PROFILE_REQUIRED");
  return groupQualification({ userId: player.userId, level: profile.level, selectedClass: profile.selectedClass, weaponTrack: weapon?.weaponTrack ?? null, skills: player.skills });
}
async function membersOf(tx: Transaction, party: GroupParty) {
  const rows = await tx.select().from(aurionGroupPlayers).where(eq(aurionGroupPlayers.partyId, party.id));
  const members = await Promise.all(rows.map(playerFromRow));
  if (members.length !== 5 || party.roster.some(r => !members.some(m => m.userId === r.userId && m.role === r.role && m.qualificationHash === r.qualificationHash))) throw new Error("GROUP_MEMBERSHIP_CORRUPT");
  return members;
}
async function validateQualifications(tx: Transaction, party: GroupParty, members: GroupPlayer[]) {
  for (const member of [...members].sort((a, b) => a.userId - b.userId)) {
    const q = await qualification(tx, member, true);
    if (q.hash !== member.qualificationHash || !member.role || !q.roles.includes(member.role)) throw new Error("GROUP_QUALIFICATION_CHANGED_LEAVE_AND_REQUEUE");
  }
  if (party.sourceRevision !== runtimeRevision()) throw new Error("GROUP_RUNTIME_REVISION_CHANGED_LEAVE_AND_REQUEUE");
}
async function readmodel(tx: Transaction, userId: number): Promise<GroupReadmodel> {
  const player = await readPlayer(tx, userId);
  const party = player.partyId ? await readParty(tx, player.partyId) : null;
  const members = party ? await membersOf(tx, party) : [];
  if (party && !party.roster.some(m => m.userId === userId)) throw new Error("GROUP_MEMBERSHIP_REQUIRED");
  return groupReadmodelSchema.parse({ ruleset: GROUP_RULESET, sourceRevision: runtimeRevision(), player, qualification: await qualification(tx, player), catalog: groupCatalog.dungeons.map(d => ({ id: d.id, label: d.label })), party, readyUserIds: members.filter(m => m.ready).map(m => m.userId).sort((a, b) => a - b), enteredUserIds: members.filter(m => m.status === "entered").map(m => m.userId).sort((a, b) => a - b), ticket: party ? await readTicket(tx, party) : null });
}

export async function readGroupForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("GROUP_DATABASE_REQUIRED");
  // One consistent InnoDB snapshot; polling creates neither players nor leases.
  return db.transaction(tx => readmodel(tx, userId));
}

async function match(tx: Transaction, queueKey: string, nowMs: number) {
  const rows = await tx.select().from(aurionGroupPlayers).where(and(eq(aurionGroupPlayers.status, "queued"), eq(aurionGroupPlayers.queueKey, queueKey))).limit(GROUP_QUEUE_LIMIT + 1);
  if (rows.length > GROUP_QUEUE_LIMIT) throw new Error("GROUP_QUEUE_AT_CAPACITY");
  const eligible: Array<GroupPlayer & { role: RosterMember["role"] }> = [];
  for (const row of rows.sort((a, b) => a.userId - b.userId)) {
    const player = await playerFromRow(row);
    const q = await qualification(tx, player, true);
    if (player.leaseUntilMs <= nowMs || player.qualificationHash !== q.hash || !player.role || !q.roles.includes(player.role)) await writePlayer(tx, idle(player));
    else eligible.push({ ...player, role: player.role });
  }
  const chosen = oldestCompleteGroup(eligible);
  if (!chosen.length) return;
  const roster: RosterMember[] = [];
  for (const player of chosen) {
    const user = (await tx.select({ name: users.name }).from(users).where(eq(users.id, player.userId)))[0];
    if (!user) throw new Error("GROUP_AUTHENTICATED_PLAYER_MISSING");
    const q = await qualification(tx, player, true);
    roster.push({ userId: player.userId, name: (user.name ?? `Explorer ${player.userId}`).slice(0, 120), role: player.role, ordinal: player.ordinal, qualificationHash: q.hash, skills: player.skills, weaponTrack: q.weaponTrack as RosterMember["weaponTrack"] });
  }
  const [dungeonId, variant] = queueKey.split(":") as [GroupParty["dungeonId"], GroupParty["variant"]];
  const rosterHash = groupHash(roster);
  const id = groupHash({ ruleset: GROUP_RULESET, queueKey, rosterHash });
  const party: GroupParty = { id, revision: 1, sourceRevision: runtimeRevision(), dungeonId, variant, roster, rosterHash, leaderUserId: roster[0]!.userId, phase: "ready", ticketId: null, instanceRevision: 0, bossIndex: 0, bossHp: 0, health: [], lastActionAtMs: 0 };
  await writeParty(tx, party);
  for (const player of chosen) await writePlayer(tx, { ...player, revision: player.revision + 1, status: "formed", queueKey: null, leaseUntilMs: 0, partyId: id, ready: false });
}

export async function commandGroupForUser(userId: number, raw: GroupCommand) {
  const command = groupCommandSchema.parse(raw);
  const db = await getDb();
  if (!db) throw new Error("GROUP_DATABASE_REQUIRED");
  const sourceRevision = runtimeRevision();
  const requestHash = groupHash({ ruleset: GROUP_RULESET, userId, command });
  return db.transaction(async tx => {
    // First operation acquires the singleton InnoDB row lock, BEFORE any
    // consistent read. Independent workers use the same ordering and snapshot.
    await tx.insert(aurionGroupCoordinator).values({ id: coordinatorId, nextOrdinal: 1 }).onDuplicateKeyUpdate({ set: { id: coordinatorId } });
    const coordinator = (await tx.select().from(aurionGroupCoordinator).where(eq(aurionGroupCoordinator.id, coordinatorId)).for("update"))[0]!;
    const prior = (await tx.select().from(aurionGroupReceipts).where(and(eq(aurionGroupReceipts.userId, userId), eq(aurionGroupReceipts.expectedRevision, command.expectedRevision))))[0];
    if (prior) {
      if (prior.requestHash !== requestHash) throw new Error("GROUP_COMMAND_REPLAY_CONFLICT");
      const result = groupReadmodelSchema.parse(JSON.parse(prior.resultJson));
      if (groupHash(result) !== prior.resultHash || result.player.userId !== userId || prior.id !== groupHash({ userId, expectedRevision: command.expectedRevision, requestHash })) throw new Error("GROUP_RECEIPT_CORRUPT");
      return { applied: false, receiptId: prior.id, resultHash: prior.resultHash, result };
    }
    let player = await readPlayer(tx, userId);
    if (player.revision !== command.expectedRevision) throw new Error("GROUP_STALE_REVISION");
    await qualification(tx, player, true);
    const nowMs = operationalNow();
    const action = command.action;
    if (action.kind === "equip") {
      if (player.partyId) throw new Error("GROUP_LEAVE_BEFORE_SKILL_CHANGE");
      player = { ...idle(player), skills: [...action.skills].sort() };
      await writePlayer(tx, player);
    } else if (action.kind === "join") {
      if (player.status !== "idle" || player.partyId) throw new Error("GROUP_ALREADY_QUEUED_OR_GROUPED");
      const q = await qualification(tx, player, true);
      if (q.hash !== action.qualificationHash || !q.roles.includes(action.role)) throw new Error("GROUP_ROLE_NOT_QUALIFIED");
      if (coordinator.nextOrdinal >= 2_000_000_000) throw new Error("GROUP_QUEUE_ORDINAL_EXHAUSTED");
      const queueKey = `${action.dungeonId}:${action.variant}`;
      player = { ...player, revision: player.revision + 1, status: "queued", queueKey, ordinal: coordinator.nextOrdinal, role: action.role, qualificationHash: q.hash, leaseUntilMs: nowMs + GROUP_LEASE_MS, ready: false };
      await tx.update(aurionGroupCoordinator).set({ nextOrdinal: coordinator.nextOrdinal + 1 }).where(eq(aurionGroupCoordinator.id, coordinatorId));
      await writePlayer(tx, player);
      await match(tx, queueKey, nowMs);
    } else if (action.kind === "cancel" || action.kind === "renew") {
      if (player.status !== "queued" || !player.queueKey) throw new Error("GROUP_QUEUE_REQUIRED");
      const queueKey = player.queueKey;
      const q = await qualification(tx, player, true);
      if (action.kind === "cancel" || player.leaseUntilMs <= nowMs || q.hash !== player.qualificationHash) player = idle(player);
      else player = { ...player, revision: player.revision + 1, leaseUntilMs: nowMs + GROUP_LEASE_MS };
      await writePlayer(tx, player);
      await match(tx, queueKey, nowMs);
    } else {
      if (!player.partyId) throw new Error("GROUP_MEMBERSHIP_REQUIRED");
      let party = await readParty(tx, player.partyId);
      const members = await membersOf(tx, party);
      if (!party.roster.some(member => member.userId === userId)) throw new Error("GROUP_MEMBERSHIP_REQUIRED");
      if (action.kind === "leave") {
        if (action.partyId !== party.id || action.rosterHash !== party.rosterHash) throw new Error("GROUP_ROSTER_CHANGED");
        party = { ...party, phase: "aborted", revision: party.revision + 1 };
        await writeParty(tx, party);
        for (const member of members) await writePlayer(tx, idle(member));
      } else {
        await validateQualifications(tx, party, members);
        if (party.phase === "aborted") throw new Error("GROUP_INSTANCE_ABORTED");
        if (action.kind === "ready") {
          if (party.phase !== "ready" || action.partyId !== party.id || action.rosterHash !== party.rosterHash) throw new Error("GROUP_ROSTER_CHANGED");
          player = { ...player, revision: player.revision + 1, ready: action.ready };
          await writePlayer(tx, player);
          party = { ...party, revision: party.revision + 1 };
          if (members.every(member => member.userId === userId ? action.ready : member.ready)) {
            const worlds = await tx.select().from(aurionGlobalWorldStates).limit(2);
            if (worlds.length !== 1) throw new Error("GROUP_PERSISTED_WORLD_REQUIRED");
            const ticket = issueGroupTicket(party, worlds[0]!);
            await tx.insert(aurionGroupTickets).values({ id: ticket.id, partyId: party.id, sourceRevision, ticketJson: stableCatalogStringify(ticket), ticketHash: ticket.hash });
            party = { ...party, phase: "active", ticketId: ticket.id, bossHp: ticket.bosses[0]!.hp, health: party.roster.map(m => ({ userId: m.userId, hp: ticket.playerMaxHp })) };
          }
          await writeParty(tx, party);
        } else if (action.kind === "enter") {
          const ticket = await readTicket(tx, party);
          if (!ticket || action.ticketId !== ticket.id || action.ticketHash !== ticket.hash || !members.every(m => m.ready)) throw new Error("GROUP_TICKET_NOT_READY");
          await writePlayer(tx, { ...player, revision: player.revision + 1, status: "entered" });
        } else if (action.kind === "exit") {
          if (player.status !== "entered") throw new Error("GROUP_ADMISSION_REQUIRED");
          await writePlayer(tx, { ...player, revision: player.revision + 1, status: "formed" });
        } else {
          const ticket = await readTicket(tx, party);
          if (!ticket || action.ticketId !== ticket.id || action.expectedInstanceRevision !== party.instanceRevision) throw new Error("GROUP_STALE_INSTANCE");
          // Admission rate is operational metadata; outcomes depend only on the
          // frozen ticket, the accepted command and persisted instance revision.
          if (nowMs < party.lastActionAtMs + 1_000) throw new Error("GROUP_ACTION_RATE_LIMITED");
          const priorPhase = party.phase;
          party = resolveGroupExchange(party, ticket, userId, action, members.filter(m => m.status === "entered").map(m => m.userId));
          if (priorPhase === "active" && party.phase === "cleared") await commitGroupCompletionMastery(tx, party, ticket);
          party.lastActionAtMs = nowMs;
          await writeParty(tx, party);
          await writePlayer(tx, { ...player, revision: player.revision + 1 });
        }
      }
    }
    const result = await readmodel(tx, userId);
    const id = groupHash({ userId, expectedRevision: command.expectedRevision, requestHash });
    const resultHash = groupHash(result);
    await tx.insert(aurionGroupReceipts).values({ id, userId, expectedRevision: command.expectedRevision, requestHash, resultJson: stableCatalogStringify(result), resultHash });
    return { applied: true, receiptId: id, resultHash, result };
  });
}