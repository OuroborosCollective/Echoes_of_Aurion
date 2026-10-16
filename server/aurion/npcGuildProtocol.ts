/**
 * NPC Guild Protocol — Aurion-native.
 *
 * Implements the plan → validate → receipt pattern for NPC guild operations.
 * Each operation is deterministic, hash-bound, and produces a canonical receipt.
 *
 * Operations:
 *   - found_guild:     An NPC founds a new guild in its home hub.
 *   - elect_leader:    Guild members vote to elect a new leader.
 *   - join_guild:       An NPC requests to join an existing guild.
 *   - leave_guild:     An NPC leaves its guild.
 *   - set_trade_policy: The leader sets the guild's trade policy.
 *   - set_diplomacy:    The leader sets a diplomacy stance toward another guild.
 */

import { createHash } from "node:crypto";
import {
  AURION_NPC_GUILD_CONTENT_VERSION,
  AURION_NPC_GUILD_RULESET_VERSION,
  NPC_GUILD_MAX_MEMBERS,
  NPC_GUILD_MIN_ELECTION_VOTES,
  npcGuildOperations,
  type NpcGuildDiplomacyType,
  type NpcGuildElectionResult,
  type NpcGuildMember,
  type NpcGuildMutationPlan,
  type NpcGuildOperation,
  type NpcGuildReceipt,
  type NpcGuildRole,
  type NpcGuildState,
  type NpcGuildTradePolicy,
  type NpcGuildVote,
} from "@shared/npcGuildContract";

const safeId = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const safeName = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&-]{1,63}$/u;
const digestPattern = /^[a-f0-9]{64}$/;
const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function stableNpcGuildStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableNpcGuildStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableNpcGuildStringify(record[key])}`).join(",")}}`;
}

export function npcGuildHash(value: unknown): string {
  return createHash("sha256").update(stableNpcGuildStringify(value), "utf8").digest("hex");
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) throw new Error(`${label} must be a canonical id`);
}

function assertName(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeName.test(value.trim())) throw new Error(`${label} must be 2-64 chars, alphanumeric + punctuation`);
}

function assertWhole(value: unknown, label: string, min = 0, max = 2_147_483_647): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be a safe integer in [${min}, ${max}]`);
}

function rejectUnknownKeys(payload: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(payload)) if (!allowed.includes(key)) throw new Error(`unknown field rejected: ${key}`);
}

function freezeRecord(record: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(record);
}

/**
 * Normalise and validate the payload for a given NPC guild operation.
 */
export function normalizeNpcGuildPayload(operation: NpcGuildOperation, raw: unknown): Readonly<Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("npc guild payload must be an object");
  const payload = raw as Record<string, unknown>;

  if (operation === "found_guild") {
    rejectUnknownKeys(payload, ["guildName", "hubId"]);
    assertName(payload.guildName, "guildName");
    assertId(payload.hubId, "hubId");
    return freezeRecord({ guildName: (payload.guildName as string).trim(), hubId: payload.hubId });
  }

  if (operation === "elect_leader") {
    rejectUnknownKeys(payload, ["votes"]);
    if (!Array.isArray(payload.votes) || payload.votes.length < NPC_GUILD_MIN_ELECTION_VOTES) {
      throw new Error(`elect_leader requires at least ${NPC_GUILD_MIN_ELECTION_VOTES} votes`);
    }
    const votes = payload.votes.map((v, i) => {
      if (!v || typeof v !== "object") throw new Error(`votes[${i}] must be an object`);
      const vote = v as Record<string, unknown>;
      assertId(vote.voterNpcId, `votes[${i}].voterNpcId`);
      assertId(vote.candidateNpcId, `votes[${i}].candidateNpcId`);
      assertWhole(vote.weightBps, `votes[${i}].weightBps`, 0, 10000);
      if (typeof vote.reason !== "string" || vote.reason.length > 256) throw new Error(`votes[${i}].reason must be ≤256 chars`);
      return Object.freeze({
        voterNpcId: vote.voterNpcId,
        candidateNpcId: vote.candidateNpcId,
        weightBps: vote.weightBps,
        reason: vote.reason,
      }) as NpcGuildVote;
    });
    return freezeRecord({ votes: Object.freeze(votes) });
  }

  if (operation === "join_guild") {
    rejectUnknownKeys(payload, ["npcId", "hubId", "role"]);
    assertId(payload.npcId, "npcId");
    assertId(payload.hubId, "hubId");
    if (typeof payload.role !== "string" || !["merchant", "trader", "prospector"].includes(payload.role)) {
      throw new Error("role must be merchant, trader, or prospector");
    }
    return freezeRecord({ npcId: payload.npcId, hubId: payload.hubId, role: payload.role });
  }

  if (operation === "leave_guild") {
    rejectUnknownKeys(payload, ["npcId"]);
    assertId(payload.npcId, "npcId");
    return freezeRecord({ npcId: payload.npcId });
  }

  if (operation === "set_trade_policy") {
    rejectUnknownKeys(payload, ["policy"]);
    if (typeof payload.policy !== "string" || !["free_trade", "protectionist", "caravan_focused", "self_sufficient"].includes(payload.policy)) {
      throw new Error("policy must be a valid trade policy");
    }
    return freezeRecord({ policy: payload.policy as NpcGuildTradePolicy });
  }

  if (operation === "set_diplomacy") {
    rejectUnknownKeys(payload, ["targetGuildId", "stance"]);
    assertId(payload.targetGuildId, "targetGuildId");
    if (typeof payload.stance !== "string" || !["alliance", "trade_pact", "neutral", "rivalry"].includes(payload.stance)) {
      throw new Error("stance must be a valid diplomacy type");
    }
    return freezeRecord({ targetGuildId: payload.targetGuildId, stance: payload.stance as NpcGuildDiplomacyType });
  }

  throw new Error("unsupported npc guild operation");
}

/**
 * Build a signed mutation plan for an NPC guild operation.
 */
export function buildNpcGuildMutationPlan(input: Readonly<{
  guildId: string;
  actorNpcId: string;
  hubId: string;
  operation: NpcGuildOperation;
  expectedRevision: number;
  idempotencyKey: string;
  payload: unknown;
}>): NpcGuildMutationPlan {
  assertId(input.guildId, "guildId");
  assertId(input.actorNpcId, "actorNpcId");
  assertId(input.hubId, "hubId");
  assertWhole(input.expectedRevision, "expectedRevision", 0);
  if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.idempotencyKey)) {
    throw new Error("idempotencyKey must be a safe token");
  }
  if (!(npcGuildOperations as readonly string[]).includes(input.operation)) throw new Error("unsupported operation");

  const payload = normalizeNpcGuildPayload(input.operation, input.payload);
  const payloadHash = npcGuildHash(payload);
  const unsigned = {
    schemaVersion: 1 as const,
    guildId: input.guildId,
    actorNpcId: input.actorNpcId,
    hubId: input.hubId,
    operation: input.operation,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    payload,
    payloadHash,
    ruleSetVersion: AURION_NPC_GUILD_RULESET_VERSION,
    contentVersion: AURION_NPC_GUILD_CONTENT_VERSION,
  };
  return Object.freeze({ ...unsigned, confirmationHash: npcGuildHash(unsigned) }) as NpcGuildMutationPlan;
}

/**
 * Build a canonical receipt from a validated plan and its result.
 */
export function buildNpcGuildReceipt(input: Readonly<{
  plan: NpcGuildMutationPlan;
  cycle: number;
  sourceDecisionReceiptId: string;
  sourceResolutionIndex: number;
  resultingRevision: number;
  result: Readonly<Record<string, unknown>>;
}>): NpcGuildReceipt {
  if (!digestPattern.test(input.plan.confirmationHash) || npcGuildHash(input.plan.payload) !== input.plan.payloadHash) {
    throw new Error("npc guild plan digest mismatch");
  }
  assertWhole(input.cycle, "cycle", 0);
  assertId(input.sourceDecisionReceiptId, "sourceDecisionReceiptId");
  assertWhole(input.sourceResolutionIndex, "sourceResolutionIndex", 0);
  assertWhole(input.resultingRevision, "resultingRevision", 0);
  if (input.resultingRevision !== input.plan.expectedRevision + 1) {
    throw new Error("npc guild revision must advance exactly once");
  }
  const requestHash = npcGuildHash({
    plan: input.plan,
    cycle: input.cycle,
    sourceDecisionReceiptId: input.sourceDecisionReceiptId,
    sourceResolutionIndex: input.sourceResolutionIndex,
  });
  const resultHash = npcGuildHash(input.result);
  return Object.freeze({
    receiptId: `ngr_${npcGuildHash([requestHash, resultHash, input.resultingRevision]).slice(0, 48)}`,
    guildId: input.plan.guildId,
    actorNpcId: input.plan.actorNpcId,
    operation: input.plan.operation,
    cycle: input.cycle,
    sourceDecisionReceiptId: input.sourceDecisionReceiptId,
    sourceResolutionIndex: input.sourceResolutionIndex,
    expectedRevision: input.plan.expectedRevision,
    resultingRevision: input.resultingRevision,
    idempotencyKey: input.plan.idempotencyKey,
    confirmationHash: input.plan.confirmationHash,
    requestHash,
    resultHash,
    result: input.result,
    ruleSetVersion: AURION_NPC_GUILD_RULESET_VERSION,
    contentVersion: AURION_NPC_GUILD_CONTENT_VERSION,
  }) as NpcGuildReceipt;
}

/**
 * Resolve a leadership election from a set of votes.
 * The winner is the candidate with the highest total weighted votes.
 * Ties are broken by candidate NPC ID (lexicographically smallest).
 */
export function resolveNpcGuildElection(votes: readonly NpcGuildVote[], cycle: number): NpcGuildElectionResult {
  if (votes.length < NPC_GUILD_MIN_ELECTION_VOTES) throw new Error("insufficient votes for election");

  const tally = new Map<string, number>();
  for (const vote of votes) {
    tally.set(vote.candidateNpcId, (tally.get(vote.candidateNpcId) ?? 0) + vote.weightBps);
  }

  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]));
  const winnerNpcId = sorted[0]![0];
  const electionHash = npcGuildHash({
    cycle,
    votes: votes.slice().sort((a, b) => compareText(a.voterNpcId, b.voterNpcId)),
    winnerNpcId,
  });

  return Object.freeze({
    winnerNpcId,
    totalVotes: votes.length,
    votes: Object.freeze(votes.slice().sort((a, b) => compareText(a.voterNpcId, b.voterNpcId))),
    electionHash,
  }) as NpcGuildElectionResult;
}

/**
 * Compute the state hash for an NPC guild state (excluding the hash itself).
 */
export function npcGuildStateHash(state: Omit<NpcGuildState, "stateHash">): string {
  return npcGuildHash(state);
}

/**
 * Derive a guild ID from the founding NPC and hub.
 */
export function deriveNpcGuildId(founderNpcId: string, hubId: string, cycle: number): string {
  assertId(founderNpcId, "founderNpcId");
  assertId(hubId, "hubId");
  assertWhole(cycle, "cycle", 0);
  return `npcg_${npcGuildHash([founderNpcId, hubId, cycle]).slice(0, 40)}`;
}

/**
 * Apply a founded guild result to create the initial guild state.
 */
export function createInitialNpcGuildState(input: Readonly<{
  guildId: string;
  name: string;
  hubId: string;
  founderNpcId: string;
  cycle: number;
}>): NpcGuildState {
  assertId(input.guildId, "guildId");
  assertName(input.name, "name");
  assertId(input.hubId, "hubId");
  assertId(input.founderNpcId, "founderNpcId");

  const members: readonly NpcGuildMember[] = Object.freeze([
    Object.freeze({
      npcId: input.founderNpcId,
      hubId: input.hubId,
      role: "leader" as NpcGuildRole,
      joinedCycle: input.cycle,
    }),
  ]);

  const stateWithoutHash = {
    guildId: input.guildId,
    name: input.name,
    hubId: input.hubId,
    leaderNpcId: input.founderNpcId,
    members,
    tradePolicy: "free_trade" as NpcGuildTradePolicy,
    treasuryCopper: 0,
    foundedCycle: input.cycle,
    lastElectionCycle: input.cycle,
    diplomacy: Object.freeze([]),
    revision: 1,
  };

  return Object.freeze({ ...stateWithoutHash, stateHash: npcGuildStateHash(stateWithoutHash) }) as NpcGuildState;
}

/**
 * Apply a mutation to a guild state, producing the next state.
 * This is a pure function — it does not mutate the input.
 */
export function applyNpcGuildMutation(
  state: NpcGuildState,
  operation: NpcGuildOperation,
  payload: Readonly<Record<string, unknown>>,
  electionResult?: NpcGuildElectionResult,
): NpcGuildState {
  let next: Omit<NpcGuildState, "stateHash"> = { ...state };

  if (operation === "elect_leader" && electionResult) {
    next = {
      ...next,
      leaderNpcId: electionResult.winnerNpcId,
      lastElectionCycle: state.foundedCycle + state.revision,
      members: Object.freeze(state.members.map((m) =>
        m.npcId === electionResult.winnerNpcId
          ? Object.freeze({ ...m, role: "leader" as NpcGuildRole })
          : m.role === "leader"
            ? Object.freeze({ ...m, role: "merchant" as NpcGuildRole })
            : m,
      )),
    };
  } else if (operation === "join_guild") {
    if (state.members.length >= NPC_GUILD_MAX_MEMBERS) throw new Error("NPC_GUILD_MEMBER_CAPACITY_EXCEEDED");
    const newMember: NpcGuildMember = Object.freeze({
      npcId: payload.npcId as string,
      hubId: payload.hubId as string,
      role: payload.role as NpcGuildRole,
      joinedCycle: state.foundedCycle + state.revision,
    });
    if (state.members.some((m) => m.npcId === newMember.npcId)) throw new Error("NPC_GUILD_ALREADY_MEMBER");
    next = { ...next, members: Object.freeze([...state.members, newMember].sort((a, b) => compareText(a.npcId, b.npcId))) };
  } else if (operation === "leave_guild") {
    const leavingNpcId = payload.npcId as string;
    if (leavingNpcId === state.leaderNpcId) throw new Error("NPC_GUILD_LEADER_CANNOT_LEAVE");
    next = { ...next, members: Object.freeze(state.members.filter((m) => m.npcId !== leavingNpcId)) };
  } else if (operation === "set_trade_policy") {
    next = { ...next, tradePolicy: payload.policy as NpcGuildTradePolicy };
  } else if (operation === "set_diplomacy") {
    const targetGuildId = payload.targetGuildId as string;
    const stance = payload.stance as NpcGuildDiplomacyType;
    const existing = state.diplomacy.filter((d) => d.targetGuildId !== targetGuildId);
    next = {
      ...next,
      diplomacy: Object.freeze([
        ...existing,
        Object.freeze({ targetGuildId, stance, sinceCycle: state.foundedCycle + state.revision }),
      ].sort((a, b) => compareText(a.targetGuildId, b.targetGuildId))),
    };
  }

  next = { ...next, revision: state.revision + 1 };
  return Object.freeze({ ...next, stateHash: npcGuildStateHash(next) }) as NpcGuildState;
}
