import { z } from "zod";

export const StandingTierEnum = z.enum([
  "hostile",
  "unfriendly",
  "neutral",
  "friendly",
  "honored",
  "revered",
  "exalted",
]);

export type StandingTier = z.infer<typeof StandingTierEnum>;

export const standingLabels: Record<string, string> = {
  hostile: "Feindselig",
  unfriendly: "Unfreundlich",
  neutral: "Neutral",
  friendly: "Freundlich",
  honored: "Geehrt",
  revered: "Verehrt",
  exalted: "Erhaben",
};

export function standingTier(score: number): StandingTier {
  if (score < 0) return "hostile";
  if (score < 15) return "neutral";
  if (score < 40) return "friendly";
  if (score < 70) return "honored";
  if (score < 90) return "revered";
  return "exalted";
}

export const standingEntrySchema = z.object({
  kind: z.string(),
  id: z.string(),
  score: z.number(),
  tier: z.string(),
  sourceCount: z.number(),
  xpExact: z.string(),
  levelExact: z.number(),
});

export const socialMasterySchema = z.object({
  id: z.string(),
  xpExact: z.string(),
  levelExact: z.number(),
  usesExact: z.string(),
});

export const standingReadbackSchema = z.object({
  userId: z.number(),
  entries: z.array(standingEntrySchema),
  social: z.array(socialMasterySchema),
});

export type StandingReadback = z.infer<typeof standingReadbackSchema>;
