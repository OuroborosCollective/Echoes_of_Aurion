/**
 * Autonomous NPC guild decisions over canonical Aurion persistence.
 *
 * NPCs remain autonomous decision makers. This runtime never owns guild truth:
 * every mutation is causally anchored to a confirmed NPC decision receipt,
 * committed by NpcGuildAuthority, and projected only from confirmed DB state.
 */
import { createHash } from "node:crypto";
import { LIVING_HISTORY_HUBS, type LivingHistoryHubId } from "./livingHistoryLoop.js";
import { buildNpcGuildMutationPlan, deriveNpcGuildId } from "./npcGuildProtocol.js";
import {
  defaultNpcGuildStore,
  type NpcGuildAuthority,
  type NpcGuildSource,
} from "./npcGuildStore.js";
import type {
  NpcGuildOperation,
  NpcGuildReceipt,
  NpcGuildState,
  NpcGuildTradePolicy,
  NpcGuildVote,
} from "@shared/npcGuildContract";

export const NPC_GUILD_RUNTIME_VERSION = "aurion-npc-guild-runtime.v2" as const;

export type NpcGuildDecision = Readonly<{
  npcId: string;
  hubId: LivingHistoryHubId;
  operation: NpcGuildOperation | null;
  guildId: string | null;
  reason: string;
  receiptId: string | null;
  failureCode: string | null;
}>;

export type NpcGuildCycleResult = Readonly<{
  version: typeof NPC_GUILD_RUNTIME_VERSION;
  cycle: number;
  decisions: readonly NpcGuildDecision[];
  guilds: readonly NpcGuildState[];
  receipts: readonly NpcGuildReceipt[];
  activeCount: number;
  totalCount: number;
}>;

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

function shouldFoundGuild(
  npcId: string,
  hubId: LivingHistoryHubId,
  guilds: readonly NpcGuildState[],
  needs: Readonly<{ wealth: number; power: number; status: number }>,
): boolean {
  if (guilds.some(guild => guild.members.some(member => member.npcId === npcId))) return false;
  if (guilds.some(guild => guild.hubId === hubId)) return false;
  return (1 - needs.wealth) + (1 - needs.power) + (1 - needs.status) > 1.2;
}

function shouldJoinGuild(
  npcId: string,
  hubId: LivingHistoryHubId,
  guilds: readonly NpcGuildState[],
  needs: Readonly<{ belonging: number; wealth: number }>,
): NpcGuildState | null {
  if (guilds.some(guild => guild.members.some(member => member.npcId === npcId))) return null;
  const hubGuild = guilds.find(guild => guild.hubId === hubId && guild.members.length < 16);
  if (!hubGuild) return null;
  return (1 - needs.belonging) + (1 - needs.wealth) > 0.8 ? hubGuild : null;
}

function shouldHoldElection(
  guild: NpcGuildState,
  cycle: number,
  leaderNeeds: Readonly<{ safety: number; wealth: number }>,
): boolean {
  return guild.members.length >= 2 &&
    cycle - guild.lastElectionCycle >= 3 &&
    (leaderNeeds.safety < 0.4 || leaderNeeds.wealth < 0.3);
}

function generateElectionVotes(guild: NpcGuildState, cycle: number): readonly NpcGuildVote[] {
  return Object.freeze(guild.members.map(member => {
    const candidates = guild.members.filter(candidate => candidate.npcId !== member.npcId);
    const best = candidates.length ? candidates.reduce((left, right) => {
      const leftScore = parseInt(createHash("sha256").update(left.npcId).digest("hex").slice(0, 8), 16) % 10000;
      const rightScore = parseInt(createHash("sha256").update(right.npcId).digest("hex").slice(0, 8), 16) % 10000;
      return rightScore > leftScore ? right : left;
    }) : member;
    const roleBonus = member.role === "leader" ? 1000 : member.role === "merchant" ? 500 : 0;
    return Object.freeze({
      voterNpcId: member.npcId,
      candidateNpcId: best.npcId,
      weightBps: Math.min(10000, 3000 + roleBonus + (cycle - member.joinedCycle) * 100),
      reason: `reliability_vote:${best.npcId}`,
    });
  }));
}

function determineTradePolicy(
  guild: NpcGuildState,
  memberNeeds: ReadonlyMap<string, Readonly<{ wealth: number; resources: number; safety: number }>>,
): NpcGuildTradePolicy {
  let wealth = 0;
  let resources = 0;
  let safety = 0;
  let count = 0;
  for (const member of guild.members) {
    const needs = memberNeeds.get(member.npcId);
    if (!needs) continue;
    wealth += needs.wealth;
    resources += needs.resources;
    safety += needs.safety;
    count += 1;
  }
  if (!count) return "free_trade";
  wealth /= count;
  resources /= count;
  safety /= count;
  if (safety < 0.3) return "self_sufficient";
  if (resources < 0.3) return "caravan_focused";
  if (wealth < 0.3) return "protectionist";
  return "free_trade";
}

function replaceGuild(guilds: readonly NpcGuildState[], state: NpcGuildState): NpcGuildState[] {
  return [...guilds.filter(guild => guild.guildId !== state.guildId), state]
    .sort((left, right) => left.guildId.localeCompare(right.guildId));
}

export function createNpcGuildRuntime(options: Readonly<{
  enabled?: boolean;
  authority?: NpcGuildAuthority;
}> = {}): NpcGuildRuntime {
  const enabled = options.enabled ?? false;
  const authority = options.authority ?? (enabled ? defaultNpcGuildStore() : null);
  let projectedGuilds: readonly NpcGuildState[] = Object.freeze([]);
  let lastCycle: NpcGuildCycleResult | null = null;

  const executeCycle = async (
    cycle: number,
    npcNeeds: ReadonlyMap<string, Readonly<{
      safety: number;
      resources: number;
      belonging: number;
      status: number;
      wealth: number;
      power: number;
    }>>,
    npcSources: ReadonlyMap<string, NpcGuildSource>,
  ): Promise<NpcGuildCycleResult> => {
    if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error("NPC_GUILD_CYCLE_INVALID");
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
    if (!authority) throw new Error("NPC_GUILD_AUTHORITY_REQUIRED");

    let guilds = [...await authority.readAll()];
    const decisions: NpcGuildDecision[] = [];
    const receipts: NpcGuildReceipt[] = [];
    let activeCount = 0;

    const apply = async (plan: ReturnType<typeof buildNpcGuildMutationPlan>, source: NpcGuildSource) => {
      const confirmed = await authority.apply(plan, cycle, source);
      guilds = replaceGuild(guilds, confirmed.state);
      receipts.push(confirmed.receipt);
      if (!confirmed.replay) activeCount += 1;
      return confirmed;
    };

    for (const hubId of LIVING_HISTORY_HUBS) {
      const npcId = npcIdForHub(hubId);
      const needs = npcNeeds.get(npcId) ?? {
        safety: 0.8, resources: 0.5, belonging: 0.4,
        status: 0.3, wealth: 0.3, power: 0.2,
      };
      const source = npcSources.get(npcId) ?? null;

      try {
        if (shouldFoundGuild(npcId, hubId, guilds, needs)) {
          if (!source) throw new Error("NPC_GUILD_SOURCE_DECISION_REQUIRED");
          const guildId = deriveNpcGuildId(npcId, hubId, cycle);
          const guildName = `Händlergilde ${hubId.replace(/_/g, " ")}`;
          const confirmed = await apply(buildNpcGuildMutationPlan({
            guildId,
            actorNpcId: npcId,
            hubId,
            operation: "found_guild",
            expectedRevision: 0,
            idempotencyKey: `found:${guildId}:${cycle}`,
            payload: { guildName, hubId },
          }), source);
          decisions.push(Object.freeze({
            npcId, hubId, operation: "found_guild", guildId,
            reason: `founded guild: ${guildName}`,
            receiptId: confirmed.receipt.receiptId,
            failureCode: null,
          }));
          continue;
        }

        const targetGuild = shouldJoinGuild(npcId, hubId, guilds, needs);
        if (targetGuild) {
          if (!source) throw new Error("NPC_GUILD_SOURCE_DECISION_REQUIRED");
          const role = needs.wealth < 0.4 ? "trader" : needs.resources < 0.4 ? "prospector" : "merchant";
          const confirmed = await apply(buildNpcGuildMutationPlan({
            guildId: targetGuild.guildId,
            actorNpcId: npcId,
            hubId,
            operation: "join_guild",
            expectedRevision: targetGuild.revision,
            idempotencyKey: `join:${targetGuild.guildId}:${npcId}:${cycle}`,
            payload: { npcId, hubId, role },
          }), source);
          decisions.push(Object.freeze({
            npcId, hubId, operation: "join_guild", guildId: targetGuild.guildId,
            reason: `joined guild: ${targetGuild.name} as ${role}`,
            receiptId: confirmed.receipt.receiptId,
            failureCode: null,
          }));
          continue;
        }

        const memberGuild = guilds.find(guild => guild.members.some(member => member.npcId === npcId));
        if (memberGuild?.leaderNpcId === npcId) {
          if (shouldHoldElection(memberGuild, cycle, needs)) {
            if (!source) throw new Error("NPC_GUILD_SOURCE_DECISION_REQUIRED");
            const votes = generateElectionVotes(memberGuild, cycle);
            const confirmed = await apply(buildNpcGuildMutationPlan({
              guildId: memberGuild.guildId,
              actorNpcId: npcId,
              hubId,
              operation: "elect_leader",
              expectedRevision: memberGuild.revision,
              idempotencyKey: `elect:${memberGuild.guildId}:${cycle}`,
              payload: { votes },
            }), source);
            decisions.push(Object.freeze({
              npcId, hubId, operation: "elect_leader", guildId: memberGuild.guildId,
              reason: `election confirmed: ${String(confirmed.receipt.result.winnerNpcId)}`,
              receiptId: confirmed.receipt.receiptId,
              failureCode: null,
            }));
            continue;
          }

          const memberNeeds = new Map<string, Readonly<{ wealth: number; resources: number; safety: number }>>();
          for (const member of memberGuild.members) {
            const value = npcNeeds.get(member.npcId);
            if (value) memberNeeds.set(member.npcId, {
              wealth: value.wealth,
              resources: value.resources,
              safety: value.safety,
            });
          }
          const policy = determineTradePolicy(memberGuild, memberNeeds);
          if (policy !== memberGuild.tradePolicy) {
            if (!source) throw new Error("NPC_GUILD_SOURCE_DECISION_REQUIRED");
            const confirmed = await apply(buildNpcGuildMutationPlan({
              guildId: memberGuild.guildId,
              actorNpcId: npcId,
              hubId,
              operation: "set_trade_policy",
              expectedRevision: memberGuild.revision,
              idempotencyKey: `policy:${memberGuild.guildId}:${cycle}`,
              payload: { policy },
            }), source);
            decisions.push(Object.freeze({
              npcId, hubId, operation: "set_trade_policy", guildId: memberGuild.guildId,
              reason: `trade policy -> ${policy}`,
              receiptId: confirmed.receipt.receiptId,
              failureCode: null,
            }));
            continue;
          }
        }

        decisions.push(Object.freeze({
          npcId,
          hubId,
          operation: null,
          guildId: memberGuild?.guildId ?? null,
          reason: "no guild action",
          receiptId: null,
          failureCode: null,
        }));
      } catch (error) {
        decisions.push(Object.freeze({
          npcId,
          hubId,
          operation: null,
          guildId: null,
          reason: "error",
          receiptId: null,
          failureCode: failureCode(error),
        }));
      }
    }

    projectedGuilds = Object.freeze([...(await authority.readAll())]);
    const result = Object.freeze({
      version: NPC_GUILD_RUNTIME_VERSION,
      cycle,
      decisions: Object.freeze(decisions),
      guilds: projectedGuilds,
      receipts: Object.freeze(receipts),
      activeCount,
      totalCount: LIVING_HISTORY_HUBS.length,
    }) as NpcGuildCycleResult;
    lastCycle = result;
    return result;
  };

  const readback = (): NpcGuildRuntimeReadback => Object.freeze({
    enabled,
    cycle: lastCycle?.cycle ?? null,
    guildCount: projectedGuilds.length,
    totalMembers: projectedGuilds.reduce((sum, guild) => sum + guild.members.length, 0),
    guilds: projectedGuilds,
    lastCycleResult: lastCycle,
  });

  return Object.freeze({
    enabled,
    executeCycle,
    readback,
    get guilds() { return projectedGuilds; },
  });
}

export interface NpcGuildRuntime {
  readonly enabled: boolean;
  executeCycle(
    cycle: number,
    npcNeeds: ReadonlyMap<string, Readonly<{
      safety: number;
      resources: number;
      belonging: number;
      status: number;
      wealth: number;
      power: number;
    }>>,
    npcSources: ReadonlyMap<string, NpcGuildSource>,
  ): Promise<NpcGuildCycleResult>;
  readback(): NpcGuildRuntimeReadback;
  readonly guilds: readonly NpcGuildState[];
}
