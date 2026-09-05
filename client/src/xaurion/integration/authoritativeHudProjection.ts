import { z } from "zod";

const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identity = z.string().min(1).max(128);
export const playerReadbackSchema = z.object({
  capabilities: z.object({ canChooseClass: z.boolean(), classUnlockLevel: natural.positive() }),
  profile: z.object({ userId: natural.positive(), level: natural.positive(), totalXp: natural, aurionPoints: natural, victories: natural, selectedClass: z.enum(["unbound", "vanguard", "seer", "warden"]) }),
  weaponLoadout: z.object({ weaponTrack: z.enum(["blade", "staff", "spear", "focus"]) }).nullish(),
  weaponMasteries: z.array(z.object({ weaponTrack: z.string(), xp: natural, level: natural.positive() })),
  inventory: z.array(z.object({ id: identity, ownerUserId: natural.positive(), baseItemKey: identity, quality: z.string(), itemLevel: natural.positive(), affixes: z.array(z.object({ key: identity, slot: z.enum(["prefix", "suffix"]), stats: z.record(z.string(), z.number().finite()) })) })).max(100),
});
export const questReadbackSchema = z.object({ quests: z.array(z.object({
  key: z.enum(["astral_call", "archive_of_echoes", "ember_key"]), giver: z.enum(["Lyra", "Orun"]), title: z.string(), objective: z.string(),
  requiredLevel: natural.positive(), state: z.enum(["locked", "available", "active", "completed"]), readyToTurnIn: z.boolean(),
})), keys: z.array(z.string()) });
export const worldReadbackSchema = z.object({ globalWorld: z.object({ worldSeed: z.string().min(1), epoch: natural, deterministicHash: z.string().regex(/^fnv1a-[0-9a-f]{8}$/) }) });

export type Readback<T> = Readonly<{ state: "waiting" | "live" | "empty" | "stale" | "error"; data?: T }>;
/** Missing or malformed data never acquires gameplay defaults. Freshness is an explicit query input. */
export function projectReadback<T>(schema: z.ZodType<T>, query: { data?: unknown; isError?: boolean; isStale?: boolean }, empty: (value: T) => boolean = () => false): Readback<T> {
  if (query.data === undefined) return { state: query.isError ? "error" : "waiting" };
  const parsed = schema.safeParse(query.data);
  if (!parsed.success) return { state: "error" };
  if (query.isError || query.isStale) return { state: "stale", data: parsed.data };
  return { state: empty(parsed.data) ? "empty" : "live", data: parsed.data };
}
export function projectPlayerReadback(query: Parameters<typeof projectReadback>[1], userId: number) {
  return projectReadback(playerReadbackSchema.refine(value => value.profile.userId === userId && value.inventory.every(item => item.ownerUserId === userId)), query);
}
export const readbackLabels = { waiting: "Wird geladen", live: "Serverbestätigt", empty: "Keine Einträge", stale: "Veraltet · Aktualisierung ausstehend", error: "Daten nicht verfügbar" } as const;
