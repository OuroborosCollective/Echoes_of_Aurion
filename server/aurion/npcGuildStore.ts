/**
 * Canonical MariaDB authority for autonomous NPC guilds.
 *
 * NPC autonomy chooses intent; this store alone confirms guild truth through
 * serialized revision checks, causal NPC decision receipts, append-only guild
 * receipts, and post-write readback.
 */
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { isConfiguredDatabaseUrl } from "../db";
import type { NpcGuildMutationPlan, NpcGuildReceipt, NpcGuildState, NpcGuildVote } from "@shared/npcGuildContract";
import {
  applyNpcGuildMutation,
  buildNpcGuildMutationPlan,
  buildNpcGuildReceipt,
  createInitialNpcGuildState,
  npcGuildHash,
  npcGuildStateHash,
  resolveNpcGuildElection,
} from "./npcGuildProtocol.js";

export type NpcGuildSource = Readonly<{ receiptId: string; resolutionIndex: number }>;
export type NpcGuildApplyResult = Readonly<{ receipt: NpcGuildReceipt; state: NpcGuildState; replay: boolean }>;

export interface NpcGuildAuthority {
  readAll(): Promise<readonly NpcGuildState[]>;
  apply(plan: NpcGuildMutationPlan, cycle: number, source: NpcGuildSource): Promise<NpcGuildApplyResult>;
  overview(): Promise<Readonly<{
    guildCount: number;
    totalMembers: number;
    receiptCount: number;
    latestCycle: number | null;
    guilds: readonly NpcGuildState[];
  }>>;
}

type StateRow = RowDataPacket & { guildId: string; revision: number; stateHash: string; stateJson: string };
type MembershipRow = RowDataPacket & { guildId: string; npcId: string; role: string; status: string };
type ReceiptRow = RowDataPacket & {
  receiptId: string;
  guildId: string;
  actorNpcId: string;
  idempotencyKey: string;
  confirmationHash: string;
  sourceDecisionReceiptId: string;
  sourceResolutionIndex: number;
  cycle: number;
  receiptJson: string;
};

function parseState(row: StateRow): NpcGuildState {
  const parsed = JSON.parse(String(row.stateJson)) as NpcGuildState;
  const { stateHash, ...withoutHash } = parsed;
  if (
    parsed.guildId !== row.guildId ||
    parsed.revision !== Number(row.revision) ||
    stateHash !== row.stateHash ||
    npcGuildStateHash(withoutHash) !== stateHash
  ) throw new Error("NPC_GUILD_STATE_READBACK_DRIFT");
  return Object.freeze(parsed);
}

function parseReceipt(row: ReceiptRow): NpcGuildReceipt {
  const parsed = JSON.parse(String(row.receiptJson)) as NpcGuildReceipt;
  if (
    parsed.receiptId !== row.receiptId ||
    parsed.guildId !== row.guildId ||
    parsed.actorNpcId !== row.actorNpcId ||
    parsed.idempotencyKey !== row.idempotencyKey ||
    parsed.confirmationHash !== row.confirmationHash ||
    parsed.sourceDecisionReceiptId !== row.sourceDecisionReceiptId ||
    parsed.sourceResolutionIndex !== Number(row.sourceResolutionIndex) ||
    parsed.cycle !== Number(row.cycle) ||
    npcGuildHash(parsed.result) !== parsed.resultHash
  ) throw new Error("NPC_GUILD_RECEIPT_READBACK_DRIFT");
  return Object.freeze(parsed);
}

async function stateRow(connection: PoolConnection, guildId: string, lock: boolean): Promise<StateRow | null> {
  const [rows] = await connection.query<StateRow[]>(
    `SELECT guildId,revision,stateHash,stateJson FROM aurionNpcGuildStates WHERE guildId=?${lock ? " FOR UPDATE" : ""}`,
    [guildId],
  );
  if (rows.length > 1) throw new Error("NPC_GUILD_STATE_AMBIGUOUS");
  return rows[0] ?? null;
}

async function activeMembership(connection: PoolConnection, npcId: string, lock: boolean): Promise<MembershipRow | null> {
  const [rows] = await connection.query<MembershipRow[]>(
    `SELECT guildId,npcId,role,status FROM aurionNpcGuildMemberships WHERE npcId=? AND status='active' LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [npcId],
  );
  if (rows.length > 1) throw new Error("NPC_GUILD_MULTIPLE_ACTIVE_MEMBERSHIPS");
  return rows[0] ?? null;
}

async function assertLatestSource(connection: PoolConnection, actorNpcId: string, source: NpcGuildSource): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT s.lastResolutionIndex,r.id AS receiptId,r.npcId,r.resolutionIndex FROM aurionNpcStates s INNER JOIN aurionNpcDecisionReceipts r ON r.npcId=s.npcId AND r.resolutionIndex=s.lastResolutionIndex WHERE s.npcId=? AND r.id=? LIMIT 1 FOR UPDATE",
    [actorNpcId, source.receiptId],
  );
  const row = rows[0];
  if (
    !row ||
    String(row.npcId) !== actorNpcId ||
    String(row.receiptId) !== source.receiptId ||
    Number(row.resolutionIndex) !== source.resolutionIndex ||
    Number(row.lastResolutionIndex) !== source.resolutionIndex
  ) throw new Error("NPC_GUILD_SOURCE_NOT_LATEST");
}

function canonicalPlan(plan: NpcGuildMutationPlan): NpcGuildMutationPlan {
  const rebuilt = buildNpcGuildMutationPlan({
    guildId: plan.guildId,
    actorNpcId: plan.actorNpcId,
    hubId: plan.hubId,
    operation: plan.operation,
    expectedRevision: plan.expectedRevision,
    idempotencyKey: plan.idempotencyKey,
    payload: plan.payload,
  });
  if (rebuilt.confirmationHash !== plan.confirmationHash || rebuilt.payloadHash !== plan.payloadHash) {
    throw new Error("NPC_GUILD_PLAN_DRIFT");
  }
  return rebuilt;
}

function verifiedElectionVotes(plan: NpcGuildMutationPlan, state: NpcGuildState): readonly NpcGuildVote[] {
  const votes = plan.payload.votes as readonly NpcGuildVote[];
  const memberIds = new Set(state.members.map(member => member.npcId));
  const voters = new Set<string>();
  for (const vote of votes) {
    if (!memberIds.has(vote.voterNpcId) || !memberIds.has(vote.candidateNpcId)) throw new Error("NPC_GUILD_ELECTION_MEMBER_REQUIRED");
    if (voters.has(vote.voterNpcId)) throw new Error("NPC_GUILD_ELECTION_DUPLICATE_VOTER");
    voters.add(vote.voterNpcId);
  }
  return votes;
}

export class NpcGuildStore implements NpcGuildAuthority {
  constructor(private readonly pool: Pool) {}

  static fromDatabaseUrl(databaseUrl = process.env.DATABASE_URL): NpcGuildStore {
    if (!databaseUrl || !isConfiguredDatabaseUrl(databaseUrl)) throw new Error("DATABASE_URL is required for NPC guild authority");
    return new NpcGuildStore(createPool(databaseUrl));
  }

  async close(): Promise<void> { await this.pool.end(); }

  async readAll(): Promise<readonly NpcGuildState[]> {
    const [rows] = await this.pool.query<StateRow[]>(
      "SELECT guildId,revision,stateHash,stateJson FROM aurionNpcGuildStates ORDER BY guildId",
    );
    return Object.freeze(rows.map(parseState));
  }

  async apply(rawPlan: NpcGuildMutationPlan, cycle: number, source: NpcGuildSource): Promise<NpcGuildApplyResult> {
    if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error("NPC_GUILD_CYCLE_INVALID");
    if (!Number.isSafeInteger(source.resolutionIndex) || source.resolutionIndex < 0) throw new Error("NPC_GUILD_SOURCE_RESOLUTION_INVALID");
    const plan = canonicalPlan(rawPlan);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query<ReceiptRow[]>(
        "SELECT receiptId,guildId,actorNpcId,idempotencyKey,confirmationHash,sourceDecisionReceiptId,sourceResolutionIndex,cycle,receiptJson FROM aurionNpcGuildReceipts WHERE idempotencyKey=? FOR UPDATE",
        [plan.idempotencyKey],
      );
      if (existingRows[0]) {
        const receipt = parseReceipt(existingRows[0]);
        if (
          receipt.confirmationHash !== plan.confirmationHash ||
          receipt.sourceDecisionReceiptId !== source.receiptId ||
          receipt.sourceResolutionIndex !== source.resolutionIndex ||
          receipt.cycle !== cycle
        ) throw new Error("NPC_GUILD_IDEMPOTENCY_CONFLICT");
        const row = await stateRow(connection, receipt.guildId, true);
        if (!row) throw new Error("NPC_GUILD_REPLAY_STATE_REQUIRED");
        const state = parseState(row);
        if (state.revision < receipt.resultingRevision) throw new Error("NPC_GUILD_REPLAY_STATE_BEHIND");
        await connection.commit();
        return Object.freeze({ receipt, state, replay: true });
      }

      await assertLatestSource(connection, plan.actorNpcId, source);

      let next: NpcGuildState;
      let result: Readonly<Record<string, unknown>>;

      if (plan.operation === "found_guild") {
        if (plan.expectedRevision !== 0) throw new Error("NPC_GUILD_FOUND_REVISION_INVALID");
        if (await activeMembership(connection, plan.actorNpcId, true)) throw new Error("NPC_GUILD_ACTOR_ALREADY_MEMBER");
        if (await stateRow(connection, plan.guildId, true)) throw new Error("NPC_GUILD_ALREADY_EXISTS");
        const name = String(plan.payload.guildName);
        const hubId = String(plan.payload.hubId);
        if (hubId !== plan.hubId) throw new Error("NPC_GUILD_HUB_SCOPE_MISMATCH");
        next = createInitialNpcGuildState({ guildId: plan.guildId, name, hubId, founderNpcId: plan.actorNpcId, cycle });
        result = Object.freeze({ guildId: next.guildId, name: next.name, hubId: next.hubId, founderNpcId: plan.actorNpcId });
      } else {
        const row = await stateRow(connection, plan.guildId, true);
        if (!row) throw new Error("NPC_GUILD_NOT_FOUND");
        const current = parseState(row);
        if (current.revision !== plan.expectedRevision) throw new Error("NPC_GUILD_REVISION_CONFLICT");

        if (plan.operation === "join_guild" || plan.operation === "leave_guild") {
          if (String(plan.payload.npcId) !== plan.actorNpcId) throw new Error("NPC_GUILD_ACTOR_SCOPE_MISMATCH");
        } else if (current.leaderNpcId !== plan.actorNpcId) {
          throw new Error("NPC_GUILD_LEADER_REQUIRED");
        }

        if (plan.operation === "join_guild") {
          if (await activeMembership(connection, plan.actorNpcId, true)) throw new Error("NPC_GUILD_ACTOR_ALREADY_MEMBER");
          next = applyNpcGuildMutation(current, plan.operation, plan.payload);
          result = Object.freeze({ npcId: plan.actorNpcId, role: plan.payload.role, memberCount: next.members.length });
        } else if (plan.operation === "leave_guild") {
          const membership = await activeMembership(connection, plan.actorNpcId, true);
          if (!membership || membership.guildId !== plan.guildId) throw new Error("NPC_GUILD_ACTIVE_MEMBERSHIP_REQUIRED");
          next = applyNpcGuildMutation(current, plan.operation, plan.payload);
          result = Object.freeze({ npcId: plan.actorNpcId, memberCount: next.members.length });
        } else if (plan.operation === "elect_leader") {
          const election = resolveNpcGuildElection(verifiedElectionVotes(plan, current), cycle);
          next = applyNpcGuildMutation(current, plan.operation, plan.payload, election);
          result = Object.freeze({ winnerNpcId: election.winnerNpcId, totalVotes: election.totalVotes, electionHash: election.electionHash });
        } else if (plan.operation === "set_trade_policy") {
          next = applyNpcGuildMutation(current, plan.operation, plan.payload);
          result = Object.freeze({ policy: next.tradePolicy });
        } else {
          const targetGuildId = String(plan.payload.targetGuildId);
          if (targetGuildId === plan.guildId || !(await stateRow(connection, targetGuildId, true))) throw new Error("NPC_GUILD_DIPLOMACY_TARGET_REQUIRED");
          next = applyNpcGuildMutation(current, plan.operation, plan.payload);
          result = Object.freeze({ targetGuildId, stance: plan.payload.stance });
        }
      }

      const receipt = buildNpcGuildReceipt({
        plan,
        cycle,
        sourceDecisionReceiptId: source.receiptId,
        sourceResolutionIndex: source.resolutionIndex,
        resultingRevision: next.revision,
        result,
      });
      const stateJson = JSON.stringify(next);

      if (plan.operation === "found_guild") {
        await connection.execute(
          "INSERT INTO aurionNpcGuildStates (guildId,name,hubId,leaderNpcId,tradePolicy,treasuryCopper,foundedCycle,lastElectionCycle,revision,stateHash,stateJson,ruleSetVersion,contentVersion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [next.guildId,next.name,next.hubId,next.leaderNpcId,next.tradePolicy,next.treasuryCopper,next.foundedCycle,next.lastElectionCycle,next.revision,next.stateHash,stateJson,receipt.ruleSetVersion,receipt.contentVersion],
        );
        await connection.execute(
          "INSERT INTO aurionNpcGuildMemberships (membershipId,guildId,npcId,hubId,role,joinedCycle,status,lastReceiptId) VALUES (?,?,?,?, 'leader',?,'active',?)",
          [`ngm_${receipt.receiptId.slice(4)}`,next.guildId,plan.actorNpcId,plan.hubId,cycle,receipt.receiptId],
        );
      } else {
        const [updated] = await connection.execute<ResultSetHeader>(
          "UPDATE aurionNpcGuildStates SET name=?,hubId=?,leaderNpcId=?,tradePolicy=?,treasuryCopper=?,lastElectionCycle=?,revision=?,stateHash=?,stateJson=?,ruleSetVersion=?,contentVersion=? WHERE guildId=? AND revision=?",
          [next.name,next.hubId,next.leaderNpcId,next.tradePolicy,next.treasuryCopper,next.lastElectionCycle,next.revision,next.stateHash,stateJson,receipt.ruleSetVersion,receipt.contentVersion,next.guildId,plan.expectedRevision],
        );
        if (updated.affectedRows !== 1) throw new Error("NPC_GUILD_REVISION_CONFLICT");

        if (plan.operation === "join_guild") {
          const member = next.members.find(value => value.npcId === plan.actorNpcId)!;
          await connection.execute(
            "INSERT INTO aurionNpcGuildMemberships (membershipId,guildId,npcId,hubId,role,joinedCycle,status,lastReceiptId) VALUES (?,?,?,?,?,?,'active',?) ON DUPLICATE KEY UPDATE guildId=VALUES(guildId),hubId=VALUES(hubId),role=VALUES(role),joinedCycle=VALUES(joinedCycle),status='active',lastReceiptId=VALUES(lastReceiptId)",
            [`ngm_${receipt.receiptId.slice(4)}`,next.guildId,member.npcId,member.hubId,member.role,member.joinedCycle,receipt.receiptId],
          );
        } else if (plan.operation === "leave_guild") {
          await connection.execute(
            "UPDATE aurionNpcGuildMemberships SET status='left',lastReceiptId=? WHERE guildId=? AND npcId=? AND status='active'",
            [receipt.receiptId,next.guildId,plan.actorNpcId],
          );
        } else if (plan.operation === "elect_leader") {
          for (const member of next.members) {
            await connection.execute(
              "UPDATE aurionNpcGuildMemberships SET role=?,lastReceiptId=? WHERE guildId=? AND npcId=? AND status='active'",
              [member.role,receipt.receiptId,next.guildId,member.npcId],
            );
          }
        }
      }

      await connection.execute(
        "INSERT INTO aurionNpcGuildReceipts (receiptId,guildId,actorNpcId,operation,cycle,sourceDecisionReceiptId,sourceResolutionIndex,expectedRevision,resultingRevision,idempotencyKey,confirmationHash,requestHash,resultHash,stateHash,resultJson,receiptJson,ruleSetVersion,contentVersion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [receipt.receiptId,receipt.guildId,receipt.actorNpcId,receipt.operation,receipt.cycle,receipt.sourceDecisionReceiptId,receipt.sourceResolutionIndex,receipt.expectedRevision,receipt.resultingRevision,receipt.idempotencyKey,receipt.confirmationHash,receipt.requestHash,receipt.resultHash,next.stateHash,JSON.stringify(receipt.result),JSON.stringify(receipt),receipt.ruleSetVersion,receipt.contentVersion],
      );

      const readbackRow = await stateRow(connection, next.guildId, false);
      if (!readbackRow) throw new Error("NPC_GUILD_STATE_READBACK_REQUIRED");
      const readback = parseState(readbackRow);
      if (readback.stateHash !== next.stateHash || readback.revision !== next.revision) throw new Error("NPC_GUILD_STATE_READBACK_MISMATCH");

      const [receiptRows] = await connection.query<ReceiptRow[]>(
        "SELECT receiptId,guildId,actorNpcId,idempotencyKey,confirmationHash,sourceDecisionReceiptId,sourceResolutionIndex,cycle,receiptJson FROM aurionNpcGuildReceipts WHERE receiptId=?",
        [receipt.receiptId],
      );
      if (!receiptRows[0] || parseReceipt(receiptRows[0]).requestHash !== receipt.requestHash) throw new Error("NPC_GUILD_RECEIPT_READBACK_REQUIRED");

      await connection.commit();
      return Object.freeze({ receipt, state: readback, replay: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async overview() {
    const guilds = await this.readAll();
    const [members] = await this.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionNpcGuildMemberships WHERE status='active'");
    const [receipts] = await this.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count,MAX(cycle) AS latestCycle FROM aurionNpcGuildReceipts");
    return Object.freeze({
      guildCount: guilds.length,
      totalMembers: Number(members[0]?.count ?? 0),
      receiptCount: Number(receipts[0]?.count ?? 0),
      latestCycle: receipts[0]?.latestCycle == null ? null : Number(receipts[0].latestCycle),
      guilds,
    });
  }
}

let singleton: NpcGuildStore | null = null;
export function defaultNpcGuildStore(): NpcGuildStore {
  singleton ??= NpcGuildStore.fromDatabaseUrl();
  return singleton;
}
export async function readNpcGuildOverview() {
  return defaultNpcGuildStore().overview();
}
