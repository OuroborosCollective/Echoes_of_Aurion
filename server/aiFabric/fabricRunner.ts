import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { stableCatalogStringify } from "../aurionAx1ContentCatalog";
import { FabricError, RouteMode, errorCode, premiumLimit, routing, type FabricConfig } from "./policy";
import { FabricLedger, type TaskRecord } from "./ledger";
import { OpenCodeProvider, OpenRouterProvider, freeModel, reservationMicros, suitable, type Generation } from "./providers";

export const fabricHash = (value: unknown) => createHash("sha256").update(stableCatalogStringify(value)).digest("hex");

export type FabricProviders = Readonly<{ config: FabricConfig; openRouter: OpenRouterProvider; local: OpenCodeProvider; ledger: FabricLedger }>;
export type FabricFailure = { route: string; code: string; audit?: TaskRecord };

export type FabricDraftRequest<T> = Readonly<{
  prompt: string;
  mode: z.infer<typeof RouteMode>;
  modelId?: string;
  sourceRevision: string;
  promptVersion: string;
  /** Parses and validates the model output; throws (ideally a FabricError) when invalid. */
  validate: (raw: unknown) => T;
}>;

export type FabricDraftResult<T> =
  | { status: "AI_DRAFT"; value: T; model: string; audit: TaskRecord & { atMs: number; actualModel: string }; failures: FabricFailure[] }
  | { status: "UNRESOLVED"; failures: FabricFailure[] };

/**
 * The one LLM routing path of the AI fabric: local OpenCode, then free OpenRouter
 * (explicit premium only with an approved budget, never automatic paid escalation).
 * Every call is reserved and settled in the cost ledger, including invalid output.
 * The result is always an untrusted draft for human review, never world state.
 */
export async function runFabricDraft<T>(providers: FabricProviders, request: FabricDraftRequest<T>): Promise<FabricDraftResult<T>> {
  const { config, openRouter, local, ledger } = providers;
  const bytes = Buffer.byteLength(request.prompt);
  const failures: FabricFailure[] = [];
  for (const route of routing(request.mode, config)) {
    let lastAudit: TaskRecord | undefined;
    let settling = false;
    let modelId = config.openCodeModel;
    let reserve = 0;
    let freeDailyLimit = config.freeDailyLimit;
    let generate: () => Promise<Generation>;
    try {
      if (route === "local") {
        await local.inspect(bytes);
        if (request.modelId && request.modelId !== modelId) throw new FabricError("MODEL_UNAVAILABLE");
        generate = () => local.generate(request.prompt);
      } else {
        if (!config.openRouterKey) throw new FabricError("AUTH_FAILED");
        const account = await openRouter.account();
        if (account.limitRemainingUsd !== null && account.limitRemainingUsd < 0) throw new FabricError("CREDIT_LIMIT");
        freeDailyLimit = Math.min(freeDailyLimit, account.purchasedCreditsVerified ? 1000 : 50);
        const models = await openRouter.models();
        const model = models.filter(m => config.whitelist.includes(m.id) && (!request.modelId || request.modelId === m.id) && suitable(m, bytes)
          && (route === "free" ? freeModel(m) : !freeModel(m)))
          .sort((a, b) => config.whitelist.indexOf(a.id) - config.whitelist.indexOf(b.id))[0];
        if (!model) throw new FabricError("MODEL_UNAVAILABLE");
        modelId = model.id;
        reserve = route === "free" ? 0 : reservationMicros(model, bytes);
        generate = () => openRouter.generate(model, request.prompt);
      }
      const taskId = randomBytes(16).toString("hex"); // Host I/O task, never a simulation identity.
      const record = await ledger.reserve({ taskId, route, model: modelId, reservedMicros: reserve, inputHash: fabricHash(request.prompt), sourceRevision: request.sourceRevision, promptVersion: request.promptVersion }, premiumLimit(config), freeDailyLimit);
      let result: Generation | undefined;
      let outputHash: string | null = null;
      let parsed: T | undefined;
      let failure: string | undefined;
      try {
        result = await generate();
        outputHash = fabricHash(result.content);
        if (result.policyViolation) throw new FabricError("OPENCODE_POLICY_VIOLATION");
        if (result.model !== modelId) throw new FabricError("MODEL_ID_MISMATCH");
        if (route !== "premium" && result.costMicros !== 0) throw new FabricError("ZERO_COST_NOT_CONFIRMED");
        try { parsed = request.validate(JSON.parse(result.content)); }
        catch (error) { throw error instanceof FabricError ? error : new FabricError("INVALID_DRAFT"); }
      } catch (error) { failure = errorCode(error); }
      // Settle cost even for invalid JSON/schema. A failed task is not a free task.
      settling = true;
      const audit = await ledger.finish(taskId, { actualMicros: result?.costMicros ?? null, actualModel: result?.model ?? null, outputHash, provider: result?.provider ?? null,
        tokens: result?.tokens ?? null, validation: failure ?? "SCHEMA_VALID_PREVIEW_ONLY" }, !!failure);
      lastAudit = audit;
      if (failure || parsed === undefined) { settling = false; throw new FabricError(failure ?? "INVALID_DRAFT"); }
      return { status: "AI_DRAFT", value: parsed, model: result!.model, audit: { ...audit, atMs: record.atMs, actualModel: result!.model }, failures };
    } catch (error) {
      if (settling || errorCode(error).startsWith("LEDGER_")) throw error;
      failures.push({ route, code: errorCode(error), ...(lastAudit ? { audit: lastAudit } : {}) });
      // Never retry an ambiguous paid call; local->free is the only default fallback.
      if (route === "premium" || request.mode !== "auto") break;
    }
  }
  return { status: "UNRESOLVED", failures };
}
