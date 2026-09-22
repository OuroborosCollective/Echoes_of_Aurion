import { z } from "zod";
import { guildBankOperations } from "./guildBankContract";
const exact = z
    .string()
    .regex(/^(0|[1-9][0-9]*)$/)
    .max(128),
  id = z.string().min(1).max(128),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
const resource = z.enum(["wood", "stone", "aether"]),
  version = z.enum(["legacy", "aurion_v2"]);

export const memberActivityStatSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
  role: z.enum(["founder", "officer", "member", "applicant"]),
  contributionPoints: z.number().int(),
  activityCount: z.number().int(),
  bankTransactionsCount: z.number().int(),
});
export type MemberActivityStat = z.infer<typeof memberActivityStatSchema>;

export const activityCategoryStatSchema = z.object({
  category: z.string(),
  label: z.string(),
  points: z.number().int(),
  count: z.number().int(),
});
export type ActivityCategoryStat = z.infer<typeof activityCategoryStatSchema>;

export const resourceAccumulationSummarySchema = z.object({
  wood: exact,
  stone: exact,
  aether: exact,
  treasuryPoints: exact,
  lifetimeWoodDonated: exact,
  lifetimeStoneDonated: exact,
  lifetimeAetherDonated: exact,
  lifetimePointsDeposited: exact,
  totalVaultItems: z.number().int(),
  buildingInvestmentPoints: exact,
});
export type ResourceAccumulationSummary = z.infer<typeof resourceAccumulationSummarySchema>;

export const guildBankDashboardSummarySchema = z.object({
  resources: resourceAccumulationSummarySchema,
  memberStats: z.array(memberActivityStatSchema),
  activityBreakdown: z.array(activityCategoryStatSchema),
  totalActiveMembers: z.number().int(),
  totalGuildContributionPoints: z.number().int(),
  totalBankReceiptsCount: z.number().int(),
});
export type GuildBankDashboardSummary = z.infer<typeof guildBankDashboardSummarySchema>;

export const defaultDashboardSummary: GuildBankDashboardSummary = {
  resources: {
    wood: "0",
    stone: "0",
    aether: "0",
    treasuryPoints: "0",
    lifetimeWoodDonated: "0",
    lifetimeStoneDonated: "0",
    lifetimeAetherDonated: "0",
    lifetimePointsDeposited: "0",
    totalVaultItems: 0,
    buildingInvestmentPoints: "0",
  },
  memberStats: [],
  activityBreakdown: [],
  totalActiveMembers: 0,
  totalGuildContributionPoints: 0,
  totalBankReceiptsCount: 0,
};

export const guildBankViewSchema = z.object({
  guildId: id,
  actorUserId: z.number().int().positive(),
  role: z.enum(["founder", "officer", "member", "applicant"]),
  revisionExact: exact,
  planningRevisionExact: exact,
  playerPointsExact: exact,
  treasuryBalanceExact: exact,
  allowedOperations: z.array(z.enum(guildBankOperations)).max(6),
  heldItems: z
    .array(
      z.object({
        custodyId: id,
        itemRecordVersion: version,
        itemId: id,
        depositorUserId: z.number().int().positive(),
        revisionExact: exact,
      })
    )
    .max(1000),
  availableItems: z
    .array(
      z.object({
        itemRecordVersion: version,
        itemId: id,
        definitionId: id,
        resourceKey: resource.nullable(),
      })
    )
    .max(1000),
  resourceBalancesExact: z.object({ wood: exact, stone: exact, aether: exact }),
  buildingOptions: z
    .array(
      z.object({
        buildingId: id,
        levelExact: exact,
        maximumLevelExact: exact,
        canUpgrade: z.boolean(),
        nextCost: z
          .object({ points: exact, wood: exact, stone: exact, aether: exact })
          .nullable(),
      })
    )
    .max(6),
  dashboardSummary: guildBankDashboardSummarySchema.optional().default(defaultDashboardSummary),
});
export type GuildBankView = z.infer<typeof guildBankViewSchema>;
export const guildBankPlanViewSchema = z.object({
  success: z.literal(true),
  expiresAt: z.string().datetime(),
  replay: z.boolean(),
  plan: z.object({
    schemaVersion: z.literal(1),
    actorUserId: z.number().int().positive(),
    guildId: id,
    operation: z.enum(guildBankOperations),
    expectedRevisionExact: exact,
    idempotencyKey: id,
    confirmationHash: hash,
    payload: z.record(z.string(), z.unknown()),
    ruleSetVersion: z.literal("aurion-guild-bank.v1"),
    contentVersion: z.literal("aurion-guild-bank.d356881.v1"),
  }),
});
export type GuildBankPlanView = z.infer<typeof guildBankPlanViewSchema>["plan"];
