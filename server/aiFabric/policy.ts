import { z } from "zod";

export const RouteMode = z.enum(["auto", "local", "free", "premium"]);
export type Route = "local" | "free" | "premium";
export const FabricConfigSchema = z.object({
  ledgerPath: z.string().min(1),
  openRouterKey: z.string().default(""),
  whitelist: z.array(z.string().min(1)).max(40).default([]),
  order: z.array(z.enum(["local", "free"])).min(1).max(2).default(["local", "free"]),
  freeDailyLimit: z.number().int().min(1).max(1000).default(50),
  premiumEnabled: z.boolean().default(false),
  premiumApproval: z.string().default(""),
  premiumBudgetEurMicros: z.number().int().min(0).max(2_000_000).default(0),
  // USD per EUR, explicitly approved ceiling; never guess an exchange rate.
  approvedUsdPerEur: z.number().positive().max(10).optional(),
  openCodeUrl: z.string().default(""),
  openCodePassword: z.string().default(""),
  openCodeUsername: z.string().default("opencode"),
  openCodeProvider: z.string().default(""),
  openCodeModel: z.string().default(""),
  openCodeVersion: z.string().default(""),
}).strict();
export type FabricConfig = z.infer<typeof FabricConfigSchema>;
export function fabricConfig(): FabricConfig {
  const e = process.env;
  return FabricConfigSchema.parse({
    ledgerPath: e.AURION_AI_LEDGER_PATH ?? "",
    openRouterKey: e.AURION_AI_OPENROUTER_KEY ?? "",
    whitelist: (e.AURION_AI_MODEL_WHITELIST ?? "").split(",").map(s => s.trim()).filter(Boolean),
    order: (e.AURION_AI_FREE_ORDER ?? "local,free").split(","),
    freeDailyLimit: Number(e.AURION_AI_FREE_DAILY_LIMIT ?? 50),
    premiumEnabled: e.AURION_AI_PREMIUM_ENABLED === "true",
    premiumApproval: e.AURION_AI_PREMIUM_APPROVAL ?? "",
    premiumBudgetEurMicros: Number(e.AURION_AI_PREMIUM_BUDGET_EUR_MICROS ?? 0),
    approvedUsdPerEur: e.AURION_AI_APPROVED_USD_PER_EUR ? Number(e.AURION_AI_APPROVED_USD_PER_EUR) : undefined,
    openCodeUrl: e.AURION_AI_OPENCODE_URL ?? "",
    openCodePassword: e.AURION_AI_OPENCODE_PASSWORD ?? "",
    openCodeUsername: e.AURION_AI_OPENCODE_USERNAME ?? "opencode",
    openCodeProvider: e.AURION_AI_OPENCODE_PROVIDER ?? "",
    openCodeModel: e.AURION_AI_OPENCODE_MODEL ?? "",
    openCodeVersion: e.AURION_AI_OPENCODE_VERSION ?? "",
  });
}
export function premiumLimit(config: FabricConfig): number {
  if (!config.premiumEnabled || !config.premiumApproval || !config.approvedUsdPerEur) return 0;
  return Math.floor(config.premiumBudgetEurMicros * config.approvedUsdPerEur);
}
export function routing(mode: z.infer<typeof RouteMode>, config: FabricConfig): Route[] {
  if (mode === "premium" && premiumLimit(config) === 0) throw Error("PREMIUM_NOT_APPROVED");
  // No automatic paid escalation, even when a pilot budget exists.
  return mode === "auto" ? [...new Set(config.order)] : [mode];
}
export class FabricError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function errorCode(error: unknown): string {
  return error instanceof FabricError ? error.code : "FABRIC_UNAVAILABLE";
}
