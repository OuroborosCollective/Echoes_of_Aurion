/**
 * NPC Guild Runtime — Aurion-native.
 *
 * Integrates NPC guild decisions into the concurrent NPC lifecycle. Each NPC
 * autonomously evaluates whether to found a guild, join an existing one, vote
 * in a leadership election, or adjust trade policy and diplomacy — all driven
 * by the NPC's needs, personality, and the current world state.
 *
 * The runtime runs concurrently with the Living History Loop. After all NPCs
 * have acted, guild decisions are resolved and receipts are produced. Guild
 * activity feeds back into the world through trade directives and diplomacy
 * signals that shape the next cycle.
 */

import { createHash } from "node:crypto";
import {
  type LivingHistoryHubId,
  LIVING_HISTORY_HUBS,
} from "./livingHistoryLoop.js";
import {
  applyNpcGuildMutation,
  buildNpcGuildMutationPlan,
  buildNpcGuildReceipt,
  createInitialNpcGuildState,
  deriveNpcGuildId,
  npcGuildHash,
  resolveNpcGuildElection,
} from "./npcGuildProtocol.js";
import type {
  NpcGuildDiplomacyType,
  NpcGuildElectionResult,
  NpcGuildMember,
  NpcGuildMutationPlan,
  NpcGuildOperation,
  NpcGuildReceipt,
  NpcGuildState,
  NpcGuildTradePolicy,
  NpcGuildVote,
} from "@shared/npcGuildContract";

export const NPC_GUILD_RUNTIME_VERSION = "aurion-npc-guild-runtime.v1" as const;

/** Per-NPC guild decision for a single cycle. */
export type NpcGuildDecision = Readonly<{
  npcId: string;
  hubId: LivingHistoryHubId;
  operation: NpcGuildOperation | null;
  guildId: string | null;
  reason: string;
  receiptId: string | null;
  failureCode: string | null;
}>;

/** Result of one NPC guild cycle — all NPCs evaluated concurrently. */
export type NpcGuildCycleResult = Readonly<{
  version: typeof NPC_GUILD_RUNTIME_VERSION;
  cycle: number;
  /** Per-NPC guild decisions. */
  decisions: readonly NpcGuildDecision[];
  /** All guilds known to the runtime after this cycle. */
  guilds: readonly NpcGuildState[];
  /** Receipts produced during this cycle. */
  receipts: readonly NpcGuildReceipt[];
  /** Count of NPCs that performed a guild operation. */
  activeCount: number;
  /** Total NPCs evaluated. */
  totalCount: number;
}>;

/** Readback for the NPC guild runtime. */
export type NpcGuildRuntimeReadback = Readonly<{
  enabled: boolean;
  cycle: number | null;
  guildCount: number;
  totalMembers: number;
  guilds: readonly NpcGuildState[];
  lastCycleResult: NpcGuildCycleResult | null;
}>;

function npcIdForHub(hubId: LivingHistoryHubId): string {
  return `ax1_merchant_${hubId}`;
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  return message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "UNKNOWN";
}

/**
 * Determine whether an NPC should found a guild based on its needs and the
 * current guild landscape. An NPC founds a guild when:
 *   - It has no guild yet
 *   - Its wealth or power need is pressing
 *   - No guild exists in its hub yet
 */
function shouldFoundGuild(
  npcId: string,
  hubId: LivingHistoryHubId,
  existingGuilds: readonly NpcGuildState[],
  needs: Readonly<{ wealth: number; power: number; status: number }>,
): boolean {
  if (existingGuilds.some((g) => g.members.some((m) => m.npcId === npcId))) return false;
  if (existingGuilds.some((g) => g.hubId === hubId)) return false;
  const pressure = (1 - needs.wealth) + (1 - needs.power) + (1 - needs.status);
  return pressure > 1.2;
}

/**
 * Determine whether an NPC should join an existing guild.
 */
function shouldJoinGuild(
  npcId: string,
  hubId: LivingHistoryHubId,
  existingGuilds: readonly NpcGuildState[],
  needs: Readonly<{ belonging: number; wealth: number }>,
): NpcGuildState | null {
  if (existingGuilds.some((g) => g.members.some((m) => m.npcId === npcId))) return null;
  const hubGuild = existingGuilds.find((g) => g.hubId === hubId && g.members.length < 16);
  if (!hubGuild) return null;
  const pressure = (1 - needs.belonging) + (1 - needs.wealth);
  return pressure > 0.8 ? hubGuild : null;
}

/**
 * Determine whether a guild should hold a leadership election.
 * Elections happen when:
 *   - The guild has at least 2 members
 *   - Enough cycles have passed since the last election
 *   - The current leader's performance is degraded (safety need is low)
 */
function shouldHoldElection(
  guild: NpcGuildState,
  cycle: number,
  leaderNeeds: Readonly<{ safety: number; wealth: number }>,
): boolean {
  if (guild.members.length < 2) return false;
  const cyclesSinceElection = cycle - guild.lastElectionCycle;
  if (cyclesSinceElection < 3) return false;
  return leaderNeeds.safety < 0.4 || leaderNeeds.wealth < 0.3;
}

/**
 * Generate votes for a leadership election. Each member votes for the
 * candidate they trust most, weighted by their own needs and the candidate's
 * perceived reliability (derived deterministically from NPC ID hash).
 */
function generateElectionVotes(guild: NpcGuildState, cycle: number): readonly NpcGuildVote[] {
  const votes: NpcGuildVote[] = [];
  for (const member of guild.members) {
    // Each member votes for the candidate with the highest deterministic
    // "reliability" score (derived from NPC ID hash), weighted by membership
    // duration and role.
    const candidates = guild.members.filter((m) => m.npcId !== member.npcId);
    if (candidates.length === 0) {
      // Vote for self if alone
      votes.push(Object.freeze({
        voterNpcId: member.npcId,
        candidateNpcId: member.npcId,
        weightBps: 5000,
        reason: "self_vote",
      }));
      continue;
    }

    // Deterministic reliability: hash NPC ID to get a score
    const bestCandidate = candidates.reduce((best, candidate) => {
      const candidateScore = parseInt(createHash("sha256").update(candidate.npcId).digest("hex").slice(0, 8), 16) % 10000;
      const bestScore = parseInt(createHash("sha256").update(best.npcId).digest("hex").slice(0, 8), 16) % 10000;
      return candidateScore > bestScore ? candidate : best;
    });

    const roleBonus = member.role === "leader" ? 1000 : member.role === "merchant" ? 500 : 0;
    const weightBps = Math.min(10000, 3000 + roleBonus + (cycle - member.joinedCycle) * 100);

    votes.push(Object.freeze({
      voterNpcId: member.npcId,
      candidateNpcId: bestCandidate.npcId,
      weightBps,
      reason: `reliability_vote: ${bestCandidate.npcId}`,
    }));
  }
  return Object.freeze(votes);
}

/**
 * Determine the best trade policy for a guild based on member needs and
 * world state.
 */
function determineTradePolicy(
  guild: NpcGuildState,
  memberNeeds: ReadonlyMap<string, Readonly<{ wealth: number; resources: number; safety: number }>>,
): NpcGuildTradePolicy {
  let avgWealth = 0, avgResources = 0, avgSafety = 0;
  let count = 0;
  for (const member of guild.members) {
    const needs = memberNeeds.get(member.npcId);
    if (needs) {
      avgWealth += needs.wealth;
      avgResources += needs.resources;
      avgSafety += needs.safety;
      count++;
    }
  }
  if (count === 0) return "free_trade";
  avgWealth /= count;
  avgResources /= count;
  avgSafety /= count;

  if (avgSafety < 0.3) return "self_sufficient";
  if (avgResources < 0.3) return "caravan_focused";
  if (avgWealth < 0.3) return "protectionist";
  return "free_trade";
}

/**
 * Create the NPC guild runtime.
 *
 * @param options.enabled - Whether the runtime is active (requires DB connection)
 */
export function createNpcGuildRuntime(options: Readonly<{ enabled?: boolean }> = {}): NpcGuildRuntime {
  const enabled = options.enabled ?? false;
  let guilds: NpcGuildState[] = [];
  let cycleCount = 0;
  let lastCycle: NpcGuildCycleResult | null = null;

  /**
   * Execute one guild cycle for all NPCs concurrently.
   * Each NPC independently evaluates guild opportunities and acts.
   */
  const executeCycle = async (
    cycle: number,
    npcNeeds: ReadonlyMap<string, Readonly<{
      safety: number; resources: number; belonging: number;
      status: number; wealth: number; power: number;
    }>>,
  ): Promise<NpcGuildCycleResult> => {
    if (!enabled) {
      return Object.freeze({
        version: NPC_GUILD_RUNTIME_VERSION,
        cycle,
        decisions: Object.freeze([]),
        guilds: Object.freeze([]),
        receipts: Object.freeze([]),
        activeCount: 0,
        totalCount: LIVING_HISTORY_HUBS.length,
      });
    }

    const decisions: NpcGuildDecision[] = [];
    const receipts: NpcGuildReceipt[] = [];
    let activeCount = 0;

    // Process each NPC's guild decision.
    // NPCs in the same hub may interact through guild membership.
    for (const hubId of LIVING_HISTORY_HUBS) {
      const npcId = npcIdForHub(hubId);
      const needs = npcNeeds.get(npcId) ?? { safety: 0.8, resources: 0.5, belonging: 0.4, status: 0.3, wealth: 0.3, power: 0.2 };

      try {
        // Phase 1: Check if NPC should found a guild
        if (shouldFoundGuild(npcId, hubId, guilds, needs)) {
          const guildId = deriveNpcGuildId(npcId, hubId, cycle);
          const guildName = `Händlergilde ${hubId.replace(/_/g, " ")}`;
          const plan = buildNpcGuildMutationPlan({
            guildId,
            actorNpcId: npcId,
            hubId,
            operation: "found_guild",
            expectedRevision: 0,
            idempotencyKey: `found:${guildId}:${cycle}`,
            payload: { guildName, hubId },
          });
          const guildState = createInitialNpcGuildState({ guildId, name: guildName, hubId, founderNpcId: npcId, cycle });
          const receipt = buildNpcGuildReceipt({
            plan,
            resultingRevision: 1,
            result: { guildId, name: guildName, hubId, founderNpcId: npcId },
          });
          guilds = [...guilds, guildState];
          receipts.push(receipt);
          activeCount++;
          decisions.push(Object.freeze({
            npcId, hubId,
            operation: "found_guild",
            guildId,
            reason: `founded guild: ${guildName}`,
            receiptId: receipt.receiptId,
            failureCode: null,
          }));
          continue;
        }

        // Phase 2: Check if NPC should join an existing guild
        const targetGuild = shouldJoinGuild(npcId, hubId, guilds, needs);
        if (targetGuild) {
          const role = needs.wealth < 0.4 ? "trader" : needs.resources < 0.4 ? "prospector" : "merchant";
          const plan = buildNpcGuildMutationPlan({
            guildId: targetGuild.guildId,
            actorNpcId: npcId,
            hubId,
            operation: "join_guild",
            expectedRevision: targetGuild.revision,
            idempotencyKey: `join:${targetGuild.guildId}:${npcId}:${cycle}`,
            payload: { npcId, hubId, role },
          });
          const updatedGuild = applyNpcGuildMutation(targetGuild, "join_guild", plan.payload);
          const receipt = buildNpcGuildReceipt({
            plan,
            resultingRevision: updatedGuild.revision,
            result: { npcId, role, memberCount: updatedGuild.members.length },
          });
          guilds = guilds.map((g) => g.guildId === targetGuild.guildId ? updatedGuild : g);
          receipts.push(receipt);
          activeCount++;
          decisions.push(Object.freeze({
            npcId, hubId,
            operation: "join_guild",
            guildId: targetGuild.guildId,
            reason: `joined guild: ${targetGuild.name} as ${role}`,
            receiptId: receipt.receiptId,
            failureCode: null,
          }));
          continue;
        }

        // Phase 3: Check if NPC's guild should hold an election
        const memberGuild = guilds.find((g) => g.members.some((m) => m.npcId === npcId));
        if (memberGuild && memberGuild.leaderNpcId === npcId) {
          if (shouldHoldElection(memberGuild, cycle, needs)) {
            const votes = generateElectionVotes(memberGuild, cycle);
            const electionResult = resolveNpcGuildElection(votes, cycle);
            const plan = buildNpcGuildMutationPlan({
              guildId: memberGuild.guildId,
              actorNpcId: npcId,
              hubId,
              operation: "elect_leader",
              expectedRevision: memberGuild.revision,
              idempotencyKey: `elect:${memberGuild.guildId}:${cycle}`,
              payload: { votes },
            });
            const updatedGuild = applyNpcGuildMutation(memberGuild, "elect_leader", plan.payload, electionResult);
            const receipt = buildNpcGuildReceipt({
              plan,
              resultingRevision: updatedGuild.revision,
              result: { winnerNpcId: electionResult.winnerNpcId, totalVotes: electionResult.totalVotes },
            });
            guilds = guilds.map((g) => g.guildId === memberGuild.guildId ? updatedGuild : g);
            receipts.push(receipt);
            activeCount++;
            decisions.push(Object.freeze({
              npcId, hubId,
              operation: "elect_leader",
              guildId: memberGuild.guildId,
              reason: `election: ${electionResult.winnerNpcId} won with ${electionResult.totalVotes} votes`,
              receiptId: receipt.receiptId,
              failureCode: null,
            }));
            continue;
          }

          // Phase 4: Leader adjusts trade policy
          const memberNeedsMap = new Map<string, Readonly<{ wealth: number; resources: number; safety: number }>>();
          for (const m of memberGuild.members) {
            const n = npcNeeds.get(m.npcId);
            if (n) memberNeedsMap.set(m.npcId, { wealth: n.wealth, resources: n.resources, safety: n.safety });
          }
          const newPolicy = determineTradePolicy(memberGuild, memberNeedsMap);
          if (newPolicy !== memberGuild.tradePolicy) {
            const plan = buildNpcGuildMutationPlan({
              guildId: memberGuild.guildId,
              actorNpcId: npcId,
              hubId,
              operation: "set_trade_policy",
              expectedRevision: memberGuild.revision,
              idempotencyKey: `policy:${memberGuild.guildId}:${cycle}`,
              payload: { policy: newPolicy },
            });
            const updatedGuild = applyNpcGuildMutation(memberGuild, "set_trade_policy", plan.payload);
            const receipt = buildNpcGuildReceipt({
              plan,
              resultingRevision: updatedGuild.revision,
              result: { policy: newPolicy },
            });
            guilds = guilds.map((g) => g.guildId === memberGuild.guildId ? updatedGuild : g);
            receipts.push(receipt);
            activeCount++;
            decisions.push(Object.freeze({
              npcId, hubId,
              operation: "set_trade_policy",
              guildId: memberGuild.guildId,
              reason: `trade policy → ${newPolicy}`,
              receiptId: receipt.receiptId,
              failureCode: null,
            }));
            continue;
          }
        }

        // No guild action this cycle
        decisions.push(Object.freeze({
          npcId, hubId,
          operation: null,
          guildId: memberGuild?.guildId ?? null,
          reason: "no guild action",
          receiptId: null,
          failureCode: null,
        }));
      } catch (error) {
        decisions.push(Object.freeze({
          npcId, hubId,
          operation: null,
          guildId: null,
          reason: "error",
          receiptId: null,
          failureCode: failureCode(error),
        }));
      }
    }

    const result: NpcGuildCycleResult = Object.freeze({
      version: NPC_GUILD_RUNTIME_VERSION,
      cycle,
      decisions: Object.freeze(decisions),
      guilds: Object.freeze([...guilds]),
      receipts: Object.freeze(receipts),
      activeCount,
      totalCount: LIVING_HISTORY_HUBS.length,
    });
    lastCycle = result;
    return result;
  };

  const readback = (): NpcGuildRuntimeReadback => Object.freeze({
    enabled,
    cycle: cycleCount > 0 ? cycleCount : null,
    guildCount: guilds.length,
    totalMembers: guilds.reduce((sum, g) => sum + g.members.length, 0),
    guilds: Object.freeze([...guilds]),
    lastCycleResult: lastCycle,
  });

  return Object.freeze({
    enabled,
    executeCycle,
    readback,
    get guilds() { return guilds; },
    advanceCycle() { cycleCount++; },
  });
};

export interface NpcGuildRuntime {
  readonly enabled: boolean;
  executeCycle(
    cycle: number,
    npcNeeds: ReadonlyMap<string, Readonly<{
      safety: number; resources: number; belonging: number;
      status: number; wealth: number; power: number;
    }>>,
  ): Promise<NpcGuildCycleResult>;
  readback(): NpcGuildRuntimeReadback;
  readonly guilds: readonly NpcGuildState[];
  advanceCycle(): void;
}
