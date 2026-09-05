import { z } from "zod";
import { guildCapabilities } from "./guildGovernanceContract";

const id = z.string().min(1).max(128);
const exact = z.string().regex(/^(0|[1-9][0-9]*)$/).max(128);
export const guildGovernanceViewSchema = z.object({
  guildId: id,
  actorUserId: z.number().int().positive(),
  role: z.enum(["founder", "officer", "member", "applicant"]),
  revisionExact: exact,
  kingdom: z.object({
    id,
    name: z.string().min(1).max(128),
    rulerUserId: z.number().int().positive(),
    capitalTerritoryId: id,
    territoryDigest: z.string().regex(/^[a-f0-9]{64}$/),
    revisionExact: exact,
  }).nullable(),
  territories: z.array(z.object({
    territoryId: id,
    worldId: id,
    chunkX: z.number().int().min(-2147483648).max(2147483647),
    chunkZ: z.number().int().min(-2147483648).max(2147483647),
    guildId: id,
    state: z.enum(["active", "contested"]),
  })).max(1000),
  grants: z.array(z.object({
    capability: z.enum(guildCapabilities),
    scopeKind: z.enum(["guild", "territory", "kingdom", "diplomacy", "bank", "building"]),
    scopeId: id,
    status: z.enum(["active", "revoked"]),
  })).max(1000),
}).superRefine((view, ctx) => {
  if (view.territories.some(territory => territory.guildId !== view.guildId))
    ctx.addIssue({ code: "custom", message: "GOVERNANCE_TERRITORY_OWNER_MISMATCH" });
  if (new Set(view.territories.map(territory => territory.territoryId)).size !== view.territories.length)
    ctx.addIssue({ code: "custom", message: "GOVERNANCE_DUPLICATE_TERRITORY" });
});
export type GuildGovernanceView = z.infer<typeof guildGovernanceViewSchema>;

export function ownedGuildGovernance(value: unknown, userId: number, guildId: string): GuildGovernanceView {
  const view = guildGovernanceViewSchema.parse(value);
  if (view.actorUserId !== userId || view.guildId !== guildId) throw Error("GOVERNANCE_OWNER_MISMATCH");
  return view;
}
