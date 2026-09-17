import { operationalNow } from "../shared/operationalClock";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import * as db from "./db";
import { buildGlbImportPlan } from "./glbImportPlan";
import { glbImportStore } from "./glbImportStore";
import { MAX_GLB_BASE64_CHARS } from "./adminProtocol";
import {
  AURION_ADMIN_MCP_PATH,
  AURION_ADMIN_MCP_READ_SCOPE,
  AURION_ADMIN_GLB_WRITE_SCOPE,
  bearerChallenge,
  openIdForOidcSubject,
  parseAurionAdminMcpTokenClaims,
  protectedResourceMetadata,
  readAurionAdminMcpSettings,
  type AurionAdminMcpSettings,
} from "./adminMcpProtocol";
import { resolveApprovedGatewayHost } from "./gatewayHost";
import { requireWolframCagClient, runAurionWolframCagCanary, wolframCagConfigurationStatus } from "./wolframCag";

type AdminActor = {
  userId: number;
  openId: string;
  role: "admin";
  scopes: readonly string[];
};

type OidcDiscovery = {
  issuer: string;
  jwksUri: string;
};

const discoveryCache = new Map<string, { value: OidcDiscovery; expiresAt: number }>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const DISCOVERY_TTL_MS = 10 * 60 * 1_000;
const DISCOVERY_TIMEOUT_MS = 8_000;

function bearerToken(request: Request): string | null {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 20 ? token : null;
}

function readSettingsOrNull(): AurionAdminMcpSettings | null {
  try {
    return readAurionAdminMcpSettings(process.env);
  } catch {
    return null;
  }
}

function sameOriginHttps(value: unknown, issuer: string): string {
  if (typeof value !== "string") throw new Error("OIDC discovery did not contain jwks_uri");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== new URL(issuer).origin || url.username || url.password || url.hash) {
    throw new Error("OIDC discovery jwks_uri must use the configured issuer origin over HTTPS");
  }
  return url.toString();
}

async function discoverIssuer(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > operationalNow()) return cached.value;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  if (body.issuer !== issuer) throw new Error("OIDC discovery issuer does not match the configured authorization server");
  const value = Object.freeze({ issuer, jwksUri: sameOriginHttps(body.jwks_uri, issuer) });
  discoveryCache.set(issuer, { value, expiresAt: operationalNow() + DISCOVERY_TTL_MS });
  return value;
}

async function resolveAdminActor(token: string, settings: AurionAdminMcpSettings): Promise<AdminActor> {
  const discovery = await discoverIssuer(settings.authorizationServerUrl);
  const jwks = jwksCache.get(discovery.jwksUri) ?? createRemoteJWKSet(new URL(discovery.jwksUri));
  jwksCache.set(discovery.jwksUri, jwks);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: settings.authorizationServerUrl,
    audience: settings.resourceUrl,
  });
  const claims = parseAurionAdminMcpTokenClaims(payload, settings, operationalNow());
  const openId = openIdForOidcSubject(claims.issuer, claims.subject);
  const user = await db.getUserByOpenId(openId);
  if (!user || user.role !== "admin") throw new Error("Aurion admin role is required");
  return Object.freeze({ userId: user.id, openId, role: "admin" as const, scopes: claims.scopes });
}

export async function authenticateAdminGlbBearer(request: Request): Promise<{ id: number; role: "admin" }> {
  const settings = readSettingsOrNull();
  const token = bearerToken(request);
  if (!settings || !token) throw new Error("GLB_OAUTH_REQUIRED");
  const actor = await resolveAdminActor(token, settings);
  if (!actor.scopes.includes(AURION_ADMIN_GLB_WRITE_SCOPE)) throw new Error("GLB_WRITE_SCOPE_REQUIRED");
  return { id: actor.userId, role: "admin" };
}

export function adminMcpCapabilities(
  scopes: readonly string[] = [],
  options: Readonly<{ wolframConfigured?: boolean }> = {},
) {
  const writable = scopes.includes(AURION_ADMIN_GLB_WRITE_SCOPE);
  const wolframConfigured = options.wolframConfigured === true;
  return Object.freeze({
    protocol: "aurion.admin-mcp.v1",
    tools: Object.freeze([
      Object.freeze({ name: "aurion_admin_get_capabilities", mode: "read", description: "Lists the current safe capabilities and boundaries." }),
      Object.freeze({ name: "aurion_admin_get_world_overview", mode: "read", description: "Reads the confirmed global world descriptor without advancing an epoch." }),
      Object.freeze({ name: "aurion_admin_wolfram_status", mode: "read", description: "Reports secret-free Wolfram CAG runtime configuration without making a provider request." }),
      Object.freeze({ name: "aurion_causality_status", mode: "read", description: "Reports causality engine status, active ruleset hashes, and receipt chain integrity." }),
      Object.freeze({ name: "aurion_tick_receipt_get", mode: "read", description: "Retrieves a specific causal tick receipt by zone and tick number." }),
      Object.freeze({ name: "aurion_tick_explain", mode: "read", description: "Explains pre-state, intents, transitions, RNG root, and post-state for a recorded tick." }),
      Object.freeze({ name: "aurion_tick_replay", mode: "read", description: "Replays a single recorded zone tick through all 8 verification stages." }),
      Object.freeze({ name: "aurion_replay_range", mode: "read", description: "Replays a range of recorded ticks for a zone to pinpoint any divergence." }),
      Object.freeze({ name: "aurion_runtime_identity", mode: "read", description: "Returns exact source revision, build input digest, artifact digest, and runtime image digest." }),
      Object.freeze({ name: "aurion_donor_ledger", mode: "read", description: "Reads the machine-readable donor migration ledger and capability retirement status." }),
      Object.freeze({ name: "aurion_donor_capability_explain", mode: "read", description: "Explains parity evidence and runtime verification for a specific donor capability." }),
      ...(wolframConfigured ? [
        { name: "aurion_admin_wolfram_compute", mode: "read", description: "Evaluates bounded Wolfram Language code as external evidence only." },
        { name: "aurion_admin_wolfram_hints", mode: "read", description: "Retrieves bounded Wolfram Language hints for an engineering or balancing task." },
        { name: "aurion_admin_wolfram_alpha_results", mode: "read", description: "Retrieves Wolfram Alpha results as external evidence only." },
        { name: "aurion_admin_wolfram_alpha_context", mode: "read", description: "Retrieves bounded Wolfram Alpha factual context." },
        { name: "aurion_admin_wolfram_canary", mode: "read", description: "Runs the fixed exact Wolfram CAG computation canary." },
      ] : []),
      ...(writable ? [
        { name: "aurion_admin_glb_plan", mode: "read", description: "Validate self-contained GLB bytes and derive the versioned target plan." },
        { name: "aurion_admin_glb_import", mode: "write", description: "Persist one admin-authorized GLB and fill only an unoccupied deterministic visual slot." },
        { name: "aurion_admin_glb_catalog", mode: "read", description: "Read approved persistent GLB catalog and active visual assignments." },
        { name: "aurion_admin_glb_assign", mode: "write", description: "Replace one visual assignment only when the expected active asset still matches." },
      ] : []),
    ]),
    wolfram: Object.freeze({ configured: wolframConfigured, mutationAuthority: "none" as const }),
    unavailable: Object.freeze([
      "world_delta_write",
      "object_placement",
      "quest_publish",
      "npc_reward_mutation",
      "database_access",
      "shell_access",
      "git_or_vps_access",
    ]),
    chatGptProMode: writable ? "scoped_asset_import" : "read_fetch_only",
    writePath: writable ? "GLB imports and compare-and-set visual assignments only; no gameplay mutations." : "GLB write tools require aurion.admin.assets.write and a current Aurion admin role. World mutations remain unavailable.",
  });
}

function createAdminMcpServer(actor: AdminActor) {
  const server = new McpServer({ name: "echoes-of-aurion-admin", version: "0.1.0" });
  const content = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  const wolframStatus = wolframCagConfigurationStatus();
  const capabilities = adminMcpCapabilities(actor.scopes, { wolframConfigured: wolframStatus.configured });
  server.registerTool("aurion_admin_get_capabilities", {
    title: "Read Aurion admin MCP capabilities",
    description: "Read the verified, bounded capabilities and unavailable authority of the Aurion Admin MCP.",
    inputSchema: z.object({}),
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify(capabilities) }],
    structuredContent: capabilities,
  }));
  server.registerTool("aurion_admin_get_world_overview", {
    title: "Read the confirmed global Aurion world overview",
    description: "Read the compact global world descriptor. This never writes chunk deltas, advances epochs, grants rewards, or changes gameplay.",
    inputSchema: z.object({}),
  }, async () => {
    const overview = await db.getGlobalWorldAdminReadModel();
    const result = Object.freeze({
      protocol: "aurion.admin-world-read.v1",
      actorUserId: actor.userId,
      source: overview.source,
      updatedAt: overview.updatedAt,
      globalWorld: overview.globalWorld,
      mutation: "none",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  });
  server.registerTool("aurion_admin_wolfram_status", {
    title: "Read Wolfram CAG configuration status",
    description: "Reports whether the server-side Wolfram CAG key is configured. It never returns the key and makes no provider request.",
    inputSchema: z.object({}),
  }, async () => content(wolframCagConfigurationStatus()));
  if (wolframStatus.configured) {
    const wolfram = requireWolframCagClient();
    const boundedText = z.string().min(1).max(20_000);
    server.registerTool("aurion_admin_wolfram_compute", {
      title: "Evaluate Wolfram Language for Aurion analysis",
      description: "Evaluates bounded Wolfram Language code. The result is external analysis evidence and has no gameplay mutation authority.",
      inputSchema: z.object({ code: boundedText, timeConstraint: z.number().int().min(1).max(60).optional(), maxChars: z.number().int().min(1).max(20_000).optional() }).strict(),
    }, async input => content(await wolfram.languageCompute(input)));
    server.registerTool("aurion_admin_wolfram_hints", {
      title: "Retrieve Wolfram Language hints",
      description: "Retrieves Wolfram Language coding recommendations as external evidence only.",
      inputSchema: z.object({ context: boundedText }).strict(),
    }, async input => content(await wolfram.languageHints(input)));
    server.registerTool("aurion_admin_wolfram_alpha_results", {
      title: "Retrieve Wolfram Alpha results",
      description: "Retrieves bounded Wolfram Alpha results. Returned data cannot directly mutate Aurion gameplay state.",
      inputSchema: z.object({ input: boundedText }).strict(),
    }, async input => content(await wolfram.alphaResults(input)));
    server.registerTool("aurion_admin_wolfram_alpha_context", {
      title: "Retrieve Wolfram Alpha context",
      description: "Retrieves bounded Wolfram Alpha factual context as external evidence only.",
      inputSchema: z.object({ context: boundedText, count: z.number().int().min(1).max(10).optional() }).strict(),
    }, async input => content(await wolfram.alphaContext(input)));
    server.registerTool("aurion_admin_wolfram_canary", {
      title: "Run the exact Aurion Wolfram CAG canary",
      description: "Evaluates a fixed exact sum and verifies the expected result before reporting provider evidence.",
      inputSchema: z.object({}),
    }, async () => content(await runAurionWolframCagCanary(wolfram)));
  }
  if (actor.scopes.includes(AURION_ADMIN_GLB_WRITE_SCOPE)) {
    const payload = z.string().min(16).max(MAX_GLB_BASE64_CHARS);
    server.registerTool("aurion_admin_glb_plan", { description: "Validate GLB bytes and return their deterministic import plan without publishing anything.", inputSchema: z.object({ contentBase64: payload }) }, async input => content(buildGlbImportPlan(input.contentBase64)));
    server.registerTool("aurion_admin_glb_import", { description: "Import one supplied GLB into durable Aurion storage. Requires its exact plan hash. Existing occupied targets are reported as conflicts and preserved.", inputSchema: z.object({ displayName: z.string().trim().min(3).max(120), contentBase64: payload, expectedPlanSha256: z.string().regex(/^[a-f0-9]{64}$/) }) }, async input => content(await glbImportStore().ingest(actor.userId, input)));
    server.registerTool("aurion_admin_glb_catalog", { description: "Read the actual approved GLB catalog and visual target assignments.", inputSchema: z.object({}) }, async () => content(await glbImportStore().catalog()));
    server.registerTool("aurion_admin_glb_assign", { description: "Replace a deterministic visual target with an approved asset, bound to the exact current active asset ID.", inputSchema: z.object({ assetId: z.string().min(8).max(64), targetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), targetKey: z.string().min(2).max(120), expectedActiveAssetId: z.string().min(8).max(64).nullable() }) }, async input => content(await glbImportStore().assign(actor.userId, input)));
  }

  // AIM-298 Quest Compiler MCP Tools
  const questService = new (require("./questCompiler/adminService").AdminQuestStudioService)();

  server.registerTool("aurion_quest_status", {
    title: "Aurion Quest Compiler Status",
    description: "Returns version, schema, active template set hash, world state sequence, and instance metrics for the Aurion Quest Compiler.",
    inputSchema: z.object({}),
  }, async () => content(await questService.getStatus()));

  server.registerTool("aurion_quest_template_list", {
    title: "List Quest Templates",
    description: "Lists all active canonical quest templates in the compiler registry.",
    inputSchema: z.object({}),
  }, async () => content(await questService.getTemplates()));

  server.registerTool("aurion_quest_template_get", {
    title: "Get Quest Template",
    description: "Retrieves a specific quest template by ID and optional version.",
    inputSchema: z.object({
      templateId: z.string(),
      version: z.number().int().optional(),
    }),
  }, async input => {
    const tpls = await questService.getTemplates();
    const match = tpls.find((t: any) => t.templateId === input.templateId && (!input.version || t.version === input.version));
    if (!match) throw new Error(`Template ${input.templateId} not found`);
    return content(match);
  });

  server.registerTool("aurion_quest_validate", {
    title: "Validate Quest Template",
    description: "Validates a candidate template schema and fail-closed integrity rules without storing it.",
    inputSchema: z.object({
      templateJson: z.string(),
    }),
  }, async input => {
    const parsed = JSON.parse(input.templateJson);
    const { AurionQuestTemplateSchema } = require("../shared/aurionQuestContract");
    const { validateQuestGraph } = require("./questCompiler/validator");
    const validation = AurionQuestTemplateSchema.safeParse(parsed);
    if (!validation.success) {
      return content({ valid: false, errors: validation.error.format() });
    }
    const graphResult = validateQuestGraph(validation.data);
    return content(graphResult);
  });

  server.registerTool("aurion_quest_instance_explain", {
    title: "Explain Quest Instance",
    description: "Explains current step, bound roles, objective progress, and hash chain for a live quest instance.",
    inputSchema: z.object({
      instanceId: z.string(),
    }),
  }, async input => {
    const instances = await questService.listInstances();
    const inst = instances.find((i: any) => i.id === input.instanceId);
    if (!inst) throw new Error(`Instance ${input.instanceId} not found`);
    return content(inst);
  });

  server.registerTool("aurion_quest_replay", {
    title: "Replay Quest Causality",
    description: "Re-evaluates seed digest, candidate resolution, and graph composition for a quest instance to verify hash equality.",
    inputSchema: z.object({
      instanceId: z.string(),
    }),
  }, async input => content(await questService.replayInstance(input.instanceId)));

  server.registerTool("aurion_quest_draft_propose", {
    title: "Propose Quest Draft",
    description: "Proposes a template draft proposal bound to the expected template set hash without direct mutation.",
    inputSchema: z.object({
      templateId: z.string(),
      templateVersion: z.number().int().positive(),
      proposedDataJson: z.string(),
    }),
  }, async input => content(await questService.createDraftProposal({
    authorUserId: actor.userId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    proposedDataJson: input.proposedDataJson,
  })));

  /* AIM-299 Context Capsule MCP Tools */
  server.registerTool("aurion_context_inspect_capsule", {
    title: "Inspect Context Capsule",
    description: "Inspects an immutable world context capsule receipt, selected/omitted source roots, and token budget.",
    inputSchema: z.object({
      capsuleId: z.string(),
    }),
  }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const capsule = await aurionWorldContextService.getCapsule(input.capsuleId);
    if (!capsule) throw new Error(`Capsule ${input.capsuleId} not found`);
    return content(capsule);
  });

  server.registerTool("aurion_context_replay_capsule", {
    title: "Replay Context Capsule",
    description: "Re-executes the deterministic context capsule assembly pipeline and pinpoints first divergence.",
    inputSchema: z.object({
      capsuleId: z.string(),
    }),
  }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const capsule = await aurionWorldContextService.getCapsule(input.capsuleId);
    if (!capsule) throw new Error(`Capsule ${input.capsuleId} not found`);
    return content(await aurionWorldContextService.replayCapsule({ capsule, sources: [] }));
  });

  server.registerTool("aurion_context_expand_sources", {
    title: "Expand Context Sources",
    description: "Reversibly expands requested canonical sources from an audited context capsule receipt.",
    inputSchema: z.object({
      capsuleId: z.string(),
      requestedSourceIds: z.array(z.string()),
      expectedCapsuleHash: z.string(),
    }),
  }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    return content(await aurionWorldContextService.expandSources(input));
  });

  server.registerTool("aurion_context_get_episode", {
    title: "Get Structured Episode",
    description: "Retrieves an immutable structured historical episode with source root and outcome records.",
    inputSchema: z.object({
      episodeId: z.string(),
    }),
  }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const ep = await aurionWorldContextService.getEpisode(input.episodeId);
    if (!ep) throw new Error(`Episode ${input.episodeId} not found`);
    return content(ep);
  });

  server.registerTool("aurion_context_eval_summary", {
    title: "World Context Evaluation Summary",
    description: "Runs and reads back the standard AIM-299 operational context evaluation benchmark suite.",
    inputSchema: z.object({}),
  }, async () => {
    const { aurionWorldContextService } = require("./worldContext/service");
    return content(await aurionWorldContextService.getEvaluationSummary());
  });

  /* C-Aurion Causality and Determinism MCP Tools */
  server.registerTool("aurion_causality_status", {
    title: "Aurion Causality Engine Status",
    description: "Reports active causality ruleset versions, chain verification results, and tick recorder capacity.",
    inputSchema: z.object({
      zoneId: z.string().optional(),
    }),
  }, async input => {
    const { globalTickRecorder } = require("./causality/tickRecorder");
    const { activeProvenance } = require("./aurionProvenance");
    const chainCheck = globalTickRecorder.verifyReceiptChain(input.zoneId);
    return content({
      status: "ok",
      provenance: activeProvenance,
      chainIntegrity: chainCheck,
      recordedTicksCount: globalTickRecorder.getReceipts(input.zoneId).length,
    });
  });

  server.registerTool("aurion_tick_receipt_get", {
    title: "Get Causal Tick Receipt",
    description: "Retrieves an immutable causal tick receipt for a given zone and tick number.",
    inputSchema: z.object({
      zoneId: z.string(),
      tick: z.number().int().nonnegative(),
    }),
  }, async input => {
    const { globalTickRecorder } = require("./causality/tickRecorder");
    const receipt = globalTickRecorder.getReceipt(input.zoneId, input.tick);
    if (!receipt) throw new Error(`Receipt not found for zone ${input.zoneId} at tick ${input.tick}`);
    return content(receipt);
  });

  server.registerTool("aurion_tick_explain", {
    title: "Explain Causal Tick",
    description: "Explains pre-state hash, ordered intents, state transitions, RNG root, and post-state hash for a recorded tick.",
    inputSchema: z.object({
      zoneId: z.string(),
      tick: z.number().int().nonnegative(),
    }),
  }, async input => {
    const { globalTickRecorder } = require("./causality/tickRecorder");
    const entry = globalTickRecorder.getEntry(input.zoneId, input.tick);
    if (!entry) throw new Error(`Recorded tick entry not found for zone ${input.zoneId} at tick ${input.tick}`);
    return content(entry);
  });

  server.registerTool("aurion_tick_replay", {
    title: "Replay Recorded Zone Tick",
    description: "Replays a recorded zone tick through all 8 verification stages and returns the exact divergence or match verdict.",
    inputSchema: z.object({
      zoneId: z.string(),
      tick: z.number().int().nonnegative(),
    }),
  }, async input => {
    const { globalTickRecorder } = require("./causality/tickRecorder");
    const { replayZoneTick } = require("./causality/replayZoneTick");
    const entry = globalTickRecorder.getEntry(input.zoneId, input.tick);
    if (!entry) throw new Error(`Recorded tick entry not found for zone ${input.zoneId} at tick ${input.tick}`);
    if (!entry.preState) throw new Error(`Pre-state snapshot was not recorded for tick ${input.tick}`);
    const verdict = replayZoneTick({
      preState: entry.preState,
      intents: entry.intents || [],
      expectedReceipt: entry.receipt,
    });
    return content(verdict);
  });

  server.registerTool("aurion_replay_range", {
    title: "Replay Zone Tick Range",
    description: "Replays a sequential range of recorded ticks for a zone to verify end-to-end deterministic progression.",
    inputSchema: z.object({
      zoneId: z.string(),
      fromTick: z.number().int().nonnegative(),
      toTick: z.number().int().nonnegative(),
    }),
  }, async input => {
    const { globalTickRecorder } = require("./causality/tickRecorder");
    const { replayZoneTick } = require("./causality/replayZoneTick");
    const results = [];
    for (let t = input.fromTick; t <= input.toTick; t++) {
      const entry = globalTickRecorder.getEntry(input.zoneId, t);
      if (!entry || !entry.preState) {
        results.push({ tick: t, verdict: { status: "UNPROVABLE", verdict: "UNPROVABLE", reason: `Tick ${t} data unavailable` } });
        break;
      }
      const verdict = replayZoneTick({
        preState: entry.preState,
        intents: entry.intents || [],
        expectedReceipt: entry.receipt,
      });
      results.push({ tick: t, verdict });
      if (verdict.verdict !== "MATCH") break;
    }
    return content({ zoneId: input.zoneId, fromTick: input.fromTick, toTick: input.toTick, results });
  });

  server.registerTool("aurion_runtime_identity", {
    title: "Read Aurion Runtime Identity",
    description: "Returns source revision, build input digest, artifact digest, runtime image digest, and authority parameters.",
    inputSchema: z.object({}),
  }, async () => {
    const { activeProvenance } = require("./aurionProvenance");
    return content({
      sourceRevision: activeProvenance.sourceRevision,
      commit: activeProvenance.commit,
      dirty: activeProvenance.dirty,
      buildInputDigest: activeProvenance.buildInputDigest,
      artifactDigest: activeProvenance.artifactDigest,
      runtimeImageDigest: activeProvenance.runtimeImageDigest,
      authority: activeProvenance.authority,
      rulesets: activeProvenance.rulesets,
      runtimeHash: activeProvenance.runtimeHash,
    });
  });

  server.registerTool("aurion_donor_ledger", {
    title: "Read Aurion Donor Migration Ledger",
    description: "Reads the machine-readable donor migration ledger (WASD and AX1 capability retirement).",
    inputSchema: z.object({}),
  }, async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const ledgerPath = path.resolve(process.cwd(), "architecture/donor-ledger.json");
    if (!fs.existsSync(ledgerPath)) throw new Error("Donor ledger file not found");
    const data = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    return content(data);
  });

  server.registerTool("aurion_donor_capability_explain", {
    title: "Explain Donor Capability Migration Status",
    description: "Explains migration status, parity evidence, and retirement progress for a specific donor capability.",
    inputSchema: z.object({
      capabilityId: z.string(),
    }),
  }, async input => {
    const fs = require("node:fs");
    const path = require("node:path");
    const ledgerPath = path.resolve(process.cwd(), "architecture/donor-ledger.json");
    if (!fs.existsSync(ledgerPath)) throw new Error("Donor ledger file not found");
    const data = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const match = data.capabilities?.find((c: any) => c.id === input.capabilityId);
    if (!match) throw new Error(`Capability ${input.capabilityId} not found in donor ledger`);
    return content(match);
  });

  return server;
}

function sendUnauthorized(response: Response, settings: AurionAdminMcpSettings) {
  response.setHeader("WWW-Authenticate", bearerChallenge(settings));
  response.status(401).json({ error: "aurion_admin_oauth_required", requiredScope: AURION_ADMIN_MCP_READ_SCOPE });
}

/**
 * Dedicated OAuth resource for ChatGPT-compatible Admin MCP clients.
 * Read-only clients retain the existing surface. Asset mutation additionally
 * requires the dedicated write scope and the shared receipt-bound import service.
 */
export function registerAdminMcp(app: Express) {
  app.use(AURION_ADMIN_MCP_PATH, (request, response, next) => {
    const approvedHost = resolveApprovedGatewayHost(request.headers.host, request.header("x-forwarded-host"));
    if (!approvedHost) {
      response.status(403).json({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid Host" }, id: null });
      return;
    }
    response.locals.approvedAdminMcpHost = approvedHost;
    next();
  });

  app.get("/.well-known/oauth-protected-resource", (_request: Request, response: Response) => {
    const settings = readSettingsOrNull();
    if (!settings) {
      response.status(503).json({ error: "aurion_admin_mcp_oauth_not_configured" });
      return;
    }
    response.setHeader("cache-control", "public, max-age=300");
    response.status(200).json(protectedResourceMetadata(settings));
  });

  app.all(AURION_ADMIN_MCP_PATH, async (request: Request, response: Response) => {
    const settings = readSettingsOrNull();
    if (!settings) {
      response.status(503).json({ error: "aurion_admin_mcp_oauth_not_configured" });
      return;
    }
    const token = bearerToken(request);
    if (!token) {
      sendUnauthorized(response, settings);
      return;
    }
    let actor: AdminActor;
    try {
      actor = await resolveAdminActor(token, settings);
    } catch (error) {
      console.warn("[Aurion Admin MCP] OAuth access rejected", error instanceof Error ? error.message : "unknown error");
      sendUnauthorized(response, settings);
      return;
    }
    try {
      const server = createAdminMcpServer(actor);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("[Aurion Admin MCP] Request failed", error);
      if (!response.headersSent) response.status(500).json({ error: "aurion_admin_mcp_request_failed" });
    }
  });
}
