import type { Express, Request, Response } from "express";
import { guildGovernanceOperations, type GuildGovernanceOperation } from "@shared/guildGovernanceContract";
import { sdk } from "./_core/sdk";
import { GuildGovernanceStore } from "./guildGovernanceStore";

export type GuildGovernanceRouteDependencies = Readonly<{
  authenticate: (request: Request) => Promise<null | { id: number }>;
  store: Pick<GuildGovernanceStore, "plan" | "apply" | "read">;
}>;

let defaultStore: GuildGovernanceStore | null = null;
function store(): GuildGovernanceStore {
  defaultStore ??= GuildGovernanceStore.fromDatabaseUrl();
  return defaultStore;
}
function dependencies(): GuildGovernanceRouteDependencies {
  return {
    authenticate: async request => {
      const user = await sdk.authenticateRequest(request);
      return user ? { id: user.id } : null;
    },
    store: {
      plan: (...args) => store().plan(...args),
      apply: (...args) => store().apply(...args),
      read: (...args) => store().read(...args),
    },
  };
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : "UNKNOWN_GUILD_GOVERNANCE_ERROR";
  if (/AUTH|MEMBERSHIP_REQUIRED|PLAN_NOT_FOUND/.test(message)) return 401;
  if (/CAPABILITY_REQUIRED/.test(message)) return 403;
  if (/CONFLICT|ALREADY|MULTIPLE_ACTIVE|ROLE_DRIFT|EXPIRED/.test(message)) return 409;
  if (/NOT_FOUND/.test(message)) return 404;
  return 400;
}

function fail(response: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "UNKNOWN_GUILD_GOVERNANCE_ERROR";
  response.status(statusFor(error)).json({ success: false, error: message });
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw new Error(`client authority field rejected: ${key}`);
}

export function registerGuildGovernanceRoutes(app: Express, supplied?: GuildGovernanceRouteDependencies): void {
  const deps = supplied ?? dependencies();

  app.get("/api/guild/governance", async (request, response) => {
    try {
      const user = await deps.authenticate(request);
      if (!user) return response.status(401).json({ success: false, error: "AUTHENTICATION_REQUIRED" });
      return response.json({ success: true, governance: await deps.store.read(user.id) });
    } catch (error) { fail(response, error); }
  });

  app.post("/api/guild/governance/plan", async (request, response) => {
    try {
      const user = await deps.authenticate(request);
      if (!user) return response.status(401).json({ success: false, error: "AUTHENTICATION_REQUIRED" });
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("request body must be an object");
      const body = request.body as Record<string, unknown>;
      rejectUnknown(body, ["operation", "expectedRevisionExact", "idempotencyKey", "payload"]);
      if (typeof body.operation !== "string" || !(guildGovernanceOperations as readonly string[]).includes(body.operation)) throw new Error("unsupported governance operation");
      if (typeof body.expectedRevisionExact !== "string" || typeof body.idempotencyKey !== "string") throw new Error("revision and idempotency are required");
      const planned = await deps.store.plan(user.id, {
        operation: body.operation as GuildGovernanceOperation,
        expectedRevisionExact: body.expectedRevisionExact,
        idempotencyKey: body.idempotencyKey,
        payload: body.payload,
      });
      return response.status(planned.replay ? 200 : 201).json({ success: true, ...planned });
    } catch (error) { fail(response, error); }
  });

  app.post("/api/guild/governance/apply", async (request, response) => {
    try {
      const user = await deps.authenticate(request);
      if (!user) return response.status(401).json({ success: false, error: "AUTHENTICATION_REQUIRED" });
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("request body must be an object");
      const body = request.body as Record<string, unknown>;
      rejectUnknown(body, ["confirmationHash"]);
      if (typeof body.confirmationHash !== "string") throw new Error("confirmationHash is required");
      const applied = await deps.store.apply(user.id, body.confirmationHash);
      return response.json({ success: true, ...applied });
    } catch (error) { fail(response, error); }
  });
}
