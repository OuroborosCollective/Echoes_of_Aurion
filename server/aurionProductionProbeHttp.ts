import type { Express, Request } from "express";
import { rateLimit } from "express-rate-limit";
import { sdk } from "./_core/sdk";
import { productionProbeStore } from "./aurionProductionProbeStore";
import { verifyGithubProbeOidc } from "./aurionProductionProbeOidc";
import {
  AURION_PROBE_ADMIN_READBACK_SCOPE,
  AURION_PROBE_GAMEPLAY_READBACK_SCOPE,
  AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE,
  aurionProbeMutationAuthority,
  type AurionProbeRunIdentity,
} from "./aurionProductionProbeApprovalContract";
import { readNpcGuildOverview } from "./aurion/npcGuildStore";
import { globalZoneRegistry } from "./zoneRuntime";
import { globalAssuranceService } from "./causality/assuranceService";
import { runProductionGameplaySessionReadback } from "./aurionProductionGameplaySession";
import { globalCausalPersistence } from "./causality/persistence";

/** Exact Origin plus non-simple header blocks ambient-cookie CSRF. CORS never grants approval. */
export function requireProbeOwnerOrigin(headers: { origin?: string; contentType?: string; requestedWith?: string; fetchSite?: string }) {
  if (headers.origin !== "https://arelogic.space" || headers.contentType?.split(";")[0].trim() !== "application/json"
    || headers.requestedWith !== "AurionOps" || (headers.fetchSite !== undefined && headers.fetchSite !== "same-origin")) throw new Error("PROBE_OWNER_ORIGIN_REQUIRED");
}
function exactBody(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== keys.sort().join(",")) throw new Error("PROBE_HTTP_INPUT_INVALID");
  return value as Record<string, unknown>;
}
async function owner(req: Request) {
  requireProbeOwnerOrigin({ origin: req.header("origin"), contentType: req.header("content-type"),
    requestedWith: req.header("x-requested-with"), fetchSite: req.header("sec-fetch-site") });
  // Owner confirmation is browser-session only; runner JWTs cannot become admins.
  if (!req.headers.cookie || req.headers.authorization) throw new Error("PROBE_ADMIN_SESSION_REQUIRED");
  const actor = await sdk.authenticateRequest(req);
  if (actor.role !== "admin") throw new Error("PROBE_ADMIN_SESSION_REQUIRED");
  return actor;
}
export function registerProductionProbeRoutes(app: Express, health: () => { revision: string; [key: string]: unknown }) {
  const path = "/api/production-probe";
  app.use(path, rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use(path, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  /** Public only to make the one-time bootstrap fail closed once the table is live. */
  app.get(`${path}/bootstrap-status`, async (_req, res) => {
    try {
      if (!await productionProbeStore().isReady()) throw new Error("PROBE_CONTROL_PLANE_UNAVAILABLE");
      res.json({ recordType: "aurion.production-probe-control-plane", schemaVersion: 1,
        state: "ready", revision: health().revision, mutationAuthority: "none" });
    } catch {
      res.status(503).json({ recordType: "aurion.production-probe-control-plane", schemaVersion: 1,
        state: "unavailable", mutationAuthority: "none" });
    }
  });
  for (const operation of ["approve", "list", "revoke"] as const) app.post(`${path}/${operation}`, async (req, res) => {
    try {
      const actor = await owner(req), store = productionProbeStore();
      if (operation === "approve") {
        const body = exactBody(req.body, ["run", "scope", "purpose", "password", "confirmed"]);
        if (body.confirmed !== true) throw new Error("PROBE_OWNER_CONFIRMATION_REQUIRED");
        const approved = await store.approve(actor.id, body.password as string, body.run, body.scope, body.purpose as string);
        res.json(approved);
      } else if (operation === "list") { exactBody(req.body, []); res.json(await store.list(actor.id)); }
      else { const body = exactBody(req.body, ["approvalId"]); res.json(await store.revoke(actor.id, body.approvalId as string)); }
    } catch { res.status(403).json({ error: "PROBE_OWNER_REQUEST_DENIED" }); }
  });
  app.post(`${path}/execute`, async (req, res) => {
    try {
      const body = exactBody(req.body, ["scope"]);
      // No browser credential is accepted or forwarded by the runner exchange.
      if (req.headers.cookie) throw new Error("PROBE_BROWSER_SESSION_FORBIDDEN");
      const authorization = req.header("authorization");
      if (!authorization?.startsWith("Bearer ")) throw new Error("PROBE_OIDC_REQUIRED");
      const run: AurionProbeRunIdentity = await verifyGithubProbeOidc(authorization.slice(7));
      const before = health();
      const scope = body.scope;
      if ((scope === AURION_PROBE_GAMEPLAY_READBACK_SCOPE || scope === AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE)
        && before.revision !== run.revision) throw new Error("PROBE_RUNTIME_REVISION_MISMATCH");
      const store = productionProbeStore();
      if (scope === AURION_PROBE_ADMIN_READBACK_SCOPE) {
        const receipt = await store.consume(run, scope);
        res.json({ ...receipt, status: "AUTHORIZED", credentialReturned: false }); return;
      }
      if (scope === AURION_PROBE_GAMEPLAY_READBACK_SCOPE) {
        // The read-only path refuses to start a zone. It can only observe
        // canonical authority that was already active before this request.
        const zone = globalZoneRegistry.find("observatory_threshold");
        if (!zone) throw new Error("PROBE_ZONE_NOT_ACTIVE");
        const receipt = await store.consume(run, scope);
        const state = zone.getCanonicalZoneState(), latestReceipt = zone.getLatestReceipt();
        const guilds = await readNpcGuildOverview();
        const after = health();
        if (after.revision !== run.revision) throw new Error("PROBE_RUNTIME_REVISION_MISMATCH");
        res.json({ ...receipt, status: "OBSERVED", credentialReturned: false, mutationAuthority: aurionProbeMutationAuthority(scope), healthBefore: before, health: after,
          zone: { tick: state.tick, receiptHash: latestReceipt?.receiptHash ?? null, playerCount: state.players.length },
          guilds, assurance: globalAssuranceService.latest(), worldJoin: "UNVERIFIED", zoneHandshake: "UNVERIFIED" });
        return;
      }
      if (scope === AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE) {
        const result = await store.withExclusiveGameplayProbeSession(async () => {
          const receipt = await store.consume(run, scope);
          // Starting a zone is a real effect, allowed only after consuming this
          // separately approved scope. It is never reachable from read-only scopes.
          const zone = globalZoneRegistry.get("observatory_threshold");
          const observed = await runProductionGameplaySessionReadback({ zone, expectedRevision: run.revision, health,
            readNpcGuildOverview, sampleAssurance: () => globalAssuranceService.sample(),
            readPersistedTicks: (zoneId, from, to) => globalCausalPersistence.getTicksInRange(zoneId, from, to) });
          return { ...receipt, ...observed, status: "OBSERVED", credentialReturned: false,
            mutationAuthority: aurionProbeMutationAuthority(scope) };
        });
        res.json(result); return;
      }
      throw new Error("PROBE_SCOPE_INVALID");
    } catch { res.status(403).json({ error: "PROBE_EXECUTION_DENIED", credentialReturned: false }); }
  });
}
