import { z } from "zod";
export const standingTiers = ["EXALTED", "HONORED", "RESPECTED", "NEUTRAL", "DISTRUSTED", "OUTCAST", "HOSTILE"] as const;
/** AX1 d356881 NPCLongTermMemory thresholds, without its prototype +35 reputation. */
export function standingTier(score: number): typeof standingTiers[number] {
  if (!Number.isInteger(score) || score < -100 || score > 100) throw new Error("STANDING_SCORE_INVALID");
  return score >= 80 ? "EXALTED" : score >= 50 ? "HONORED" : score >= 20 ? "RESPECTED" : score >= -10 ? "NEUTRAL" : score >= -40 ? "DISTRUSTED" : score >= -75 ? "OUTCAST" : "HOSTILE";
}
const exact = z.string().regex(/^(0|[1-9][0-9]*)$/).max(128);
export const standingReadbackSchema = z.object({
  userId: z.number().int().positive(),
  entries: z.array(z.object({ kind: z.enum(["npc_relation", "faction"]), id: z.string().min(1).max(96), score: z.number().int().min(-100).max(100), tier: z.enum(standingTiers), sourceCount: z.number().int().min(0).max(4096), xpExact: exact, levelExact: exact }).strict()).max(7),
  social: z.array(z.object({ id: z.string().max(96), xpExact: exact, levelExact: exact, usesExact: exact }).strict()).max(2),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.entries.map(e => `${e.kind}:${e.id}`)).size !== value.entries.length || value.entries.some(e => standingTier(e.score) !== e.tier)) ctx.addIssue({ code: "custom", message: "STANDING_READBACK_INVALID" });
});
export const standingLabels: Record<typeof standingTiers[number], string> = { EXALTED: "Erhaben", HONORED: "Geehrt", RESPECTED: "Respektiert", NEUTRAL: "Neutral", DISTRUSTED: "Misstraut", OUTCAST: "Ausgestoßen", HOSTILE: "Feindselig" };
