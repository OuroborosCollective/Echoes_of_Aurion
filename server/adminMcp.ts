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
  AURION_ADMIN_AUTHORING_WRITE_SCOPE,
  bearerChallenge,
  openIdForOidcSubject,
  parseAurionAdminMcpTokenClaims,
  protectedResourceMetadata,
  readAurionAdminMcpSettings,
  type AurionAdminMcpSettings,
} from "./adminMcpProtocol";
import { resolveApprovedGatewayHost } from "./gatewayHost";
import { resolveGameDevelopmentStudioRuntimeReadback } from "./gameDevelopmentStudioRuntime";
import {
  applyGameDevelopmentStudioLiveAsset,
  gameDevelopmentStudioLiveAssetInputSchema,
  planGameDevelopmentStudioLiveAsset,
} from "./gameDevelopmentStudioProduction";
import {
  applyNamedNpcVisual,
  namedNpcVisualInputSchema,
  planNamedNpcVisual,
} from "./namedNpcVisualAssignment";
import {
  applyDungeonDesign,
  applyWorldDesign,
  planDungeonDesign,
  planWorldDesign,
  readActiveDungeonDesigns,
  readActiveWorldDesign,
} from "./aurionAuthoringPersistence";
import {
  DungeonDesignDraftSchema,
  WorldDesignDraftSchema,
} from "../shared/aurionAuthoringContract";
import { requireWolframCagClient, runAurionWolframCagCanary, wolframCagConfigurationStatus } from "./wolframCag";
import {
  chatGptCausalityStatus,
  chatGptAssuranceStatus,
  chatGptDonorCapability,
  chatGptDonorLedger,
  chatGptRecoveryPlan,
  chatGptReplayRange,
  chatGptRuntimeIdentity,
  chatGptTickExplain,
  chatGptTickReceipt,
  chatGptTickReplay,
} from "./chatgptCausalityBridge";

type AdminActor = {
  userId: number;
  openId: string;
  role: "admin";
  scopes: readonly string[];
};
type OidcDiscovery = { issuer: string; jwksUri: string };

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
  try { return readAurionAdminMcpSettings(process.env); } catch { return null; }
}
function sameOriginHttps(value: unknown, issuer: string): string {
  if (typeof value !== "string") throw new Error("OIDC discovery did not contain jwks_uri");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== new URL(issuer).origin || url.username || url.password || url.hash) throw new Error("OIDC discovery jwks_uri must use the configured issuer origin over HTTPS");
  return url.toString();
}
async function discoverIssuer(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > operationalNow()) return cached.value;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
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
  const { payload } = await jwtVerify(token, jwks, { issuer: settings.authorizationServerUrl, audience: settings.resourceUrl });
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

export function adminMcpCapabilities(scopes: readonly string[] = [], options: Readonly<{ wolframConfigured?: boolean }> = {}) {
  const writable = scopes.includes(AURION_ADMIN_GLB_WRITE_SCOPE);
  const authoringWritable = scopes.includes(AURION_ADMIN_AUTHORING_WRITE_SCOPE);
  const wolframConfigured = options.wolframConfigured === true;
  return Object.freeze({
    protocol: "aurion.admin-mcp.v1",
    consent: Object.freeze({
      defaultAuthority: "read_only" as const,
      gameplayMutation: "aurion_plan_confirm_only" as const,
      assetWriteScope: writable ? AURION_ADMIN_GLB_WRITE_SCOPE : null,
      authoringWriteScope: authoringWritable ? AURION_ADMIN_AUTHORING_WRITE_SCOPE : null,
    }),
    tools: Object.freeze([
      { name: "aurion_admin_get_capabilities", mode: "read", description: "Lists the current safe capabilities and boundaries." },
      { name: "aurion_admin_get_world_overview", mode: "read", description: "Reads the confirmed global world descriptor without advancing an epoch." },
      { name: "aurion_admin_wolfram_status", mode: "read", description: "Reports secret-free Wolfram CAG runtime configuration without making a provider request." },
      { name: "aurion_causality_status", mode: "read", description: "Reads receipt-chain, persistence and replay coverage without mutating gameplay." },
      { name: "aurion_assurance_status", mode: "read", description: "Reads continuous causal-assurance evidence and a non-destructive recovery plan." },
      { name: "aurion_tick_receipt_get", mode: "read", description: "Reads one in-memory or persisted causal tick receipt." },
      { name: "aurion_tick_explain", mode: "read", description: "Explains only evidence actually available for one tick; missing stages remain UNOBSERVABLE." },
      { name: "aurion_tick_replay", mode: "read", description: "Runs a side-effect-free replay and returns VERIFIED, CONTRADICTED or UNPROVABLE." },
      { name: "aurion_replay_range", mode: "read", description: "Runs bounded side-effect-free replay over at most 250 ticks." },
      { name: "aurion_runtime_identity", mode: "read", description: "Reads runtime identity together with OBSERVED/UNVERIFIED provenance states." },
      { name: "aurion_recovery_plan", mode: "read", description: "Returns a reconciled checkpoint candidate with mutationAuthority=none." },
      { name: "aurion_donor_ledger", mode: "read", description: "Reads the WASD/AX1 donor migration ledger." },
      { name: "aurion_donor_capability_explain", mode: "read", description: "Reads one donor capability record without upgrading its evidence status." },
      ...(wolframConfigured ? [
        { name: "aurion_admin_wolfram_compute", mode: "read", description: "Evaluates bounded Wolfram Language code as external evidence only." },
        { name: "aurion_admin_wolfram_hints", mode: "read", description: "Retrieves bounded Wolfram Language hints as external evidence only." },
        { name: "aurion_admin_wolfram_alpha_results", mode: "read", description: "Retrieves bounded Wolfram Alpha results as external evidence only." },
        { name: "aurion_admin_wolfram_alpha_context", mode: "read", description: "Retrieves bounded Wolfram Alpha factual context." },
        { name: "aurion_admin_wolfram_canary", mode: "read", description: "Runs the fixed exact Wolfram CAG computation canary." },
      ] : []),
      ...(writable ? [
        { name: "aurion_admin_glb_plan", mode: "read", description: "Validate supplied GLB bytes and derive the versioned target plan." },
        { name: "aurion_admin_glb_import", mode: "write", description: "Persist one separately authorized visual GLB; no gameplay mutation." },
        { name: "aurion_admin_glb_catalog", mode: "read", description: "Read approved persistent GLB catalog and visual assignments." },
        { name: "aurion_admin_glb_assign", mode: "write", description: "Compare-and-set one visual assignment; no gameplay semantics." },
        { name: "aurion_admin_gds_status", mode: "read", description: "Read the pinned server-side Game Development Studio runtime status." },
        { name: "aurion_admin_gds_plan", mode: "read", description: "Run server-side GDS inspect/validate and return a human-confirmed plan." },
        { name: "aurion_admin_gds_apply", mode: "write", description: "Run GDS package/verify/vendor and ingest verified bytes after exact plan confirmation." },
        { name: "aurion_admin_named_npc_visual_plan", mode: "read", description: "Plan one approved named-NPC visual binding, e.g. npc_lyra." },
        { name: "aurion_admin_named_npc_visual_apply", mode: "write", description: "Apply one named-NPC visual binding after exact plan confirmation." },
      ] : []),
      ...(authoringWritable ? [
        { name: "aurion_admin_world_design_read", mode: "read", description: "Read the active Aurion world-design manifest." },
        { name: "aurion_admin_world_design_plan", mode: "read", description: "Validate and hash one world-design draft." },
        { name: "aurion_admin_world_design_apply", mode: "write", description: "Apply one exact world-design plan after explicit confirmation." },
        { name: "aurion_admin_dungeon_design_read", mode: "read", description: "Read active authored Aurion dungeons." },
        { name: "aurion_admin_dungeon_design_plan", mode: "read", description: "Validate and hash one dungeon-design draft." },
        { name: "aurion_admin_dungeon_design_apply", mode: "write", description: "Publish one exact dungeon-design plan after explicit confirmation." },
        { name: "aurion_quest_draft_propose", mode: "write", description: "Persist a bounded quest draft proposal only; no publish." },
        { name: "aurion_quest_publish_plan", mode: "read", description: "Validate one quest proposal and return its exact publish plan." },
        { name: "aurion_quest_publish", mode: "write", description: "Publish one quest template only for the exact confirmed plan." },
      ] : []),
    ]),
    wolfram: Object.freeze({ configured: wolframConfigured, mutationAuthority: "none" as const }),
    unavailable: Object.freeze(["raw_world_delta_write", "raw_object_placement", "npc_reward_mutation", "causal_rollback", "database_access", "shell_access", "git_or_vps_access"]),
    chatGptProMode: writable || authoringWritable ? "read_evidence_plus_scoped_plan_confirm_writes" : "read_evidence_only",
    writePath: writable || authoringWritable
      ? "Only typed Aurion plan→confirm writes are available. Raw gameplay/database/shell/git/VPS mutations remain unavailable."
      : "Write tools require explicit asset-write and/or authoring-write OAuth scopes.",
  });
}

function createAdminMcpServer(actor: AdminActor) {
  const server = new McpServer({ name: "echoes-of-aurion-admin", version: "0.2.0" });
  const content = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });
  const wolframStatus = wolframCagConfigurationStatus();
  const capabilities = adminMcpCapabilities(actor.scopes, { wolframConfigured: wolframStatus.configured });

  server.registerTool("aurion_admin_get_capabilities", { title: "Read Aurion admin MCP capabilities", description: "Read the bounded capabilities, consent boundary and unavailable authority.", inputSchema: z.object({}) }, async () => content(capabilities));
  server.registerTool("aurion_admin_get_world_overview", { title: "Read confirmed Aurion world overview", description: "Reads the compact global world descriptor without mutation.", inputSchema: z.object({}) }, async () => {
    const overview = await db.getGlobalWorldAdminReadModel();
    return content(Object.freeze({ protocol: "aurion.admin-world-read.v1", actorUserId: actor.userId, source: overview.source, updatedAt: overview.updatedAt, globalWorld: overview.globalWorld, mutation: "none" }));
  });
  server.registerTool("aurion_admin_wolfram_status", { title: "Read Wolfram CAG status", description: "Secret-free configuration status; no provider request.", inputSchema: z.object({}) }, async () => content(wolframCagConfigurationStatus()));

  if (wolframStatus.configured) {
    const wolfram = requireWolframCagClient();
    const boundedText = z.string().min(1).max(20_000);
    server.registerTool("aurion_admin_wolfram_compute", { title: "Evaluate Wolfram Language", description: "External analysis evidence only; no gameplay authority.", inputSchema: z.object({ code: boundedText, timeConstraint: z.number().int().min(1).max(60).optional(), maxChars: z.number().int().min(1).max(20_000).optional() }).strict() }, async input => content(await wolfram.languageCompute(input)));
    server.registerTool("aurion_admin_wolfram_hints", { title: "Retrieve Wolfram Language hints", description: "External evidence only.", inputSchema: z.object({ context: boundedText }).strict() }, async input => content(await wolfram.languageHints(input)));
    server.registerTool("aurion_admin_wolfram_alpha_results", { title: "Retrieve Wolfram Alpha results", description: "External evidence only.", inputSchema: z.object({ input: boundedText }).strict() }, async input => content(await wolfram.alphaResults(input)));
    server.registerTool("aurion_admin_wolfram_alpha_context", { title: "Retrieve Wolfram Alpha context", description: "External factual context only.", inputSchema: z.object({ context: boundedText, count: z.number().int().min(1).max(10).optional() }).strict() }, async input => content(await wolfram.alphaContext(input)));
    server.registerTool("aurion_admin_wolfram_canary", { title: "Run Aurion Wolfram CAG canary", description: "Fixed exact canary before reporting provider evidence.", inputSchema: z.object({}) }, async () => content(await runAurionWolframCagCanary(wolfram)));
  }

  if (actor.scopes.includes(AURION_ADMIN_GLB_WRITE_SCOPE)) {
    const payload = z.string().min(16).max(MAX_GLB_BASE64_CHARS);
    server.registerTool("aurion_admin_glb_plan", { description: "Validate GLB bytes without publishing.", inputSchema: z.object({ contentBase64: payload }) }, async input => content(buildGlbImportPlan(input.contentBase64)));
    server.registerTool("aurion_admin_glb_import", { description: "Import one visual GLB using the exact plan hash; no gameplay mutation.", inputSchema: z.object({ displayName: z.string().trim().min(3).max(120), contentBase64: payload, expectedPlanSha256: z.string().regex(/^[a-f0-9]{64}$/) }) }, async input => content(await glbImportStore().ingest(actor.userId, input)));
    server.registerTool("aurion_admin_glb_catalog", { description: "Read approved GLB catalog and visual assignments.", inputSchema: z.object({}) }, async () => content(await glbImportStore().catalog()));
    server.registerTool("aurion_admin_glb_assign", { description: "Compare-and-set one visual assignment.", inputSchema: z.object({ assetId: z.string().min(8).max(64), targetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), targetKey: z.string().min(2).max(120), expectedActiveAssetId: z.string().min(8).max(64).nullable() }) }, async input => content(await glbImportStore().assign(actor.userId, input)));
    server.registerTool("aurion_admin_gds_status", { title: "Game Development Studio status", description: "Reads the pinned server-side GDS runtime. No provider or gameplay mutation.", inputSchema: z.object({}) }, async () => content(await resolveGameDevelopmentStudioRuntimeReadback()));
    server.registerTool("aurion_admin_gds_plan", { title: "Plan Game Development Studio asset admission", description: "Runs server-side inspect/validate and returns an exact plan; no live write.", inputSchema: gameDevelopmentStudioLiveAssetInputSchema }, async input => content(await planGameDevelopmentStudioLiveAsset(input)));
    server.registerTool("aurion_admin_gds_apply", { title: "Apply Game Development Studio asset admission", description: "Runs package→verify→vendor→Aurion ingest only for the exact confirmed plan.", inputSchema: z.object({
      asset: gameDevelopmentStudioLiveAssetInputSchema,
      expectedPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("APPLY_TO_LIVE_AURION"),
    }).strict() }, async input => content(await applyGameDevelopmentStudioLiveAsset(actor.userId, input.asset, input.expectedPlanSha256)));
    server.registerTool("aurion_admin_named_npc_visual_plan", { title: "Plan named NPC visual binding", description: "Binds no bytes yet; verifies canonical NPC + approved npc-fallback asset and returns exact plan.", inputSchema: namedNpcVisualInputSchema }, async input => content(await planNamedNpcVisual(input)));
    server.registerTool("aurion_admin_named_npc_visual_apply", { title: "Apply named NPC visual binding", description: "Assigns one confirmed character GLB to one canonical Aurion NPC after exact plan confirmation.", inputSchema: z.object({
      binding: namedNpcVisualInputSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("APPLY_NAMED_NPC_VISUAL"),
    }).strict() }, async input => content(await applyNamedNpcVisual(actor.userId, input.binding, input.expectedPlanHash)));
  }


  if (actor.scopes.includes(AURION_ADMIN_AUTHORING_WRITE_SCOPE)) {
    server.registerTool("aurion_admin_world_design_read", { title: "Read active world design", description: "Reads active world-design versions; no mutation.", inputSchema: z.object({}) }, async () => content(await readActiveWorldDesign()));
    server.registerTool("aurion_admin_world_design_plan", { title: "Plan world design", description: "Validates approved GLB placements and returns an exact plan hash.", inputSchema: WorldDesignDraftSchema }, async input => content(await planWorldDesign(input)));
    server.registerTool("aurion_admin_world_design_apply", { title: "Apply world design", description: "Applies only the exact confirmed plan.", inputSchema: z.object({
      draft: WorldDesignDraftSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("APPLY_WORLD_DESIGN"),
    }).strict() }, async input => content(await applyWorldDesign(actor.userId, input.draft, input.expectedPlanHash)));

    server.registerTool("aurion_admin_dungeon_design_read", { title: "Read active authored dungeons", description: "Reads published Aurion dungeon designs; no mutation.", inputSchema: z.object({}) }, async () => content(await readActiveDungeonDesigns()));
    server.registerTool("aurion_admin_dungeon_design_plan", { title: "Plan dungeon design", description: "Validates topology, assets and graph hash; no publish.", inputSchema: DungeonDesignDraftSchema }, async input => content(await planDungeonDesign(input)));
    server.registerTool("aurion_admin_dungeon_design_apply", { title: "Publish dungeon design", description: "Publishes only the exact confirmed dungeon plan.", inputSchema: z.object({
      draft: DungeonDesignDraftSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("PUBLISH_DUNGEON"),
    }).strict() }, async input => content(await applyDungeonDesign(actor.userId, input.draft, input.expectedPlanHash)));
  }

  const questService = new (require("./questCompiler/adminService").AdminQuestStudioService)();
  server.registerTool("aurion_quest_status", { title: "Aurion Quest Compiler Status", description: "Reads compiler version, schema, template-set hash and metrics.", inputSchema: z.object({}) }, async () => content(await questService.getStatus()));
  server.registerTool("aurion_quest_template_list", { title: "List Quest Templates", description: "Lists canonical active quest templates.", inputSchema: z.object({}) }, async () => content(await questService.getTemplates()));
  server.registerTool("aurion_quest_template_get", { title: "Get Quest Template", description: "Reads a quest template by ID/version.", inputSchema: z.object({ templateId: z.string(), version: z.number().int().optional() }) }, async input => {
    const templates = await questService.getTemplates();
    const match = templates.find((template: any) => template.templateId === input.templateId && (!input.version || template.version === input.version));
    if (!match) throw new Error(`Template ${input.templateId} not found`);
    return content(match);
  });
  server.registerTool("aurion_quest_validate", { title: "Validate Quest Template", description: "Fail-closed validation without storing it.", inputSchema: z.object({ templateJson: z.string() }) }, async input => {
    const parsed = JSON.parse(input.templateJson);
    const { AurionQuestTemplateSchema } = require("../shared/aurionQuestContract");
    const { validateQuestGraph } = require("./questCompiler/validator");
    const validation = AurionQuestTemplateSchema.safeParse(parsed);
    return content(validation.success ? validateQuestGraph(validation.data) : { valid: false, errors: validation.error.format() });
  });
  server.registerTool("aurion_quest_instance_explain", { title: "Explain Quest Instance", description: "Reads objective progress and hash chain for a live quest instance.", inputSchema: z.object({ instanceId: z.string() }) }, async input => {
    const instances = await questService.listInstances();
    const instance = instances.find((candidate: any) => candidate.id === input.instanceId);
    if (!instance) throw new Error(`Instance ${input.instanceId} not found`);
    return content(instance);
  });
  server.registerTool("aurion_quest_replay", { title: "Replay Quest Causality", description: "Re-evaluates deterministic quest composition.", inputSchema: z.object({ instanceId: z.string() }) }, async input => content(await questService.replayInstance(input.instanceId)));

  if (actor.scopes.includes(AURION_ADMIN_AUTHORING_WRITE_SCOPE)) {
    server.registerTool("aurion_quest_draft_propose", { title: "Propose Quest Draft", description: "Creates a draft proposal only; it does not publish gameplay truth.", inputSchema: z.object({
      templateId: z.string().min(3).max(96),
      templateVersion: z.number().int().positive(),
      proposedDataJson: z.string().min(2).max(120_000),
    }).strict() }, async input => content(await questService.createDraftProposal({
      authorUserId: actor.userId,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      proposedDataJson: input.proposedDataJson,
    })));
    server.registerTool("aurion_quest_publish_plan", { title: "Plan quest publish", description: "Validates one draft proposal and returns an exact publish plan hash.", inputSchema: z.object({
      proposalId: z.string().min(8).max(128),
    }).strict() }, async input => content(await questService.planPublishProposal(input.proposalId)));
    server.registerTool("aurion_quest_publish", { title: "Publish quest template", description: "Publishes only the exact confirmed quest plan.", inputSchema: z.object({
      proposalId: z.string().min(8).max(128),
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("PUBLISH_QUEST_TEMPLATE"),
    }).strict() }, async input => content(await questService.publishProposal(actor.userId, input.proposalId, input.expectedPlanHash)));
  }

  server.registerTool("aurion_context_inspect_capsule", { title: "Inspect Context Capsule", description: "Reads immutable context-capsule evidence.", inputSchema: z.object({ capsuleId: z.string() }) }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const capsule = await aurionWorldContextService.getCapsule(input.capsuleId);
    if (!capsule) throw new Error(`Capsule ${input.capsuleId} not found`);
    return content(capsule);
  });
  server.registerTool("aurion_context_replay_capsule", { title: "Replay Context Capsule", description: "Re-executes context assembly and reports divergence.", inputSchema: z.object({ capsuleId: z.string() }) }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const capsule = await aurionWorldContextService.getCapsule(input.capsuleId);
    if (!capsule) throw new Error(`Capsule ${input.capsuleId} not found`);
    return content(await aurionWorldContextService.replayCapsule({ capsule, sources: [] }));
  });
  server.registerTool("aurion_context_expand_sources", { title: "Expand Context Sources", description: "Reversibly reads requested canonical sources from a capsule receipt.", inputSchema: z.object({ capsuleId: z.string(), requestedSourceIds: z.array(z.string()), expectedCapsuleHash: z.string() }) }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    return content(await aurionWorldContextService.expandSources(input));
  });
  server.registerTool("aurion_context_get_episode", { title: "Get Structured Episode", description: "Reads an immutable structured historical episode.", inputSchema: z.object({ episodeId: z.string() }) }, async input => {
    const { aurionWorldContextService } = require("./worldContext/service");
    const episode = await aurionWorldContextService.getEpisode(input.episodeId);
    if (!episode) throw new Error(`Episode ${input.episodeId} not found`);
    return content(episode);
  });
  server.registerTool("aurion_context_eval_summary", { title: "World Context Evaluation Summary", description: "Reads the standard context evaluation summary.", inputSchema: z.object({}) }, async () => {
    const { aurionWorldContextService } = require("./worldContext/service");
    return content(await aurionWorldContextService.getEvaluationSummary());
  });

  /* ChatGPT causality integration: read-only, persistence-aware, evidence-status preserving. */
  server.registerTool("aurion_causality_status", { title: "Aurion Causality Status", description: "Reads causal chain, persistence and replay coverage. Never mutates gameplay.", inputSchema: z.object({ zoneId: z.string().min(1).optional() }) }, async input => content(await chatGptCausalityStatus(input.zoneId)));
  server.registerTool("aurion_assurance_status", { title: "Aurion Causal Assurance Status", description: "Reads sealed assurance observations and a recovery plan. It cannot mutate gameplay or execute recovery.", inputSchema: z.object({}) }, async () => content(await chatGptAssuranceStatus()));
  server.registerTool("aurion_tick_receipt_get", { title: "Get Causal Tick Receipt", description: "Reads an in-memory or persisted receipt; missing data is UNPROVABLE.", inputSchema: z.object({ zoneId: z.string().min(1), tick: z.number().int().nonnegative() }) }, async input => content(await chatGptTickReceipt(input.zoneId, input.tick)));
  server.registerTool("aurion_tick_explain", { title: "Explain Causal Tick", description: "Explains only observed receipt/input/state availability; intermediate receipt-v1 stages remain UNOBSERVABLE.", inputSchema: z.object({ zoneId: z.string().min(1), tick: z.number().int().nonnegative() }) }, async input => content(await chatGptTickExplain(input.zoneId, input.tick)));
  server.registerTool("aurion_tick_replay", { title: "Replay Recorded Zone Tick", description: "Side-effect-free replay returning VERIFIED, CONTRADICTED or UNPROVABLE.", inputSchema: z.object({ zoneId: z.string().min(1), tick: z.number().int().nonnegative() }) }, async input => content(await chatGptTickReplay(input.zoneId, input.tick)));
  server.registerTool("aurion_replay_range", { title: "Replay Zone Tick Range", description: "Bounded side-effect-free replay; stops at first non-VERIFIED result.", inputSchema: z.object({ zoneId: z.string().min(1), fromTick: z.number().int().nonnegative(), toTick: z.number().int().nonnegative() }) }, async input => content(await chatGptReplayRange(input.zoneId, input.fromTick, input.toTick)));
  server.registerTool("aurion_runtime_identity", { title: "Read Aurion Runtime Identity", description: "Reads runtime identity together with observation status for every provenance field.", inputSchema: z.object({}) }, async () => content(chatGptRuntimeIdentity()));
  server.registerTool("aurion_recovery_plan", { title: "Read Causal Recovery Plan", description: "Returns a reconciled checkpoint candidate only. mutationAuthority is always none.", inputSchema: z.object({ zoneId: z.string().min(1) }) }, async input => content(await chatGptRecoveryPlan(input.zoneId)));
  server.registerTool("aurion_donor_ledger", { title: "Read Aurion Donor Ledger", description: "Reads WASD/AX1 donor retirement evidence without granting donor authority.", inputSchema: z.object({}) }, async () => content(await chatGptDonorLedger()));
  server.registerTool("aurion_donor_capability_explain", { title: "Explain Donor Capability", description: "Reads one donor capability record; ledger metadata is not automatically upgraded to VERIFIED.", inputSchema: z.object({ capabilityId: z.string().min(1) }) }, async input => content(await chatGptDonorCapability(input.capabilityId)));

  return server;
}

function sendUnauthorized(response: Response, settings: AurionAdminMcpSettings) {
  response.setHeader("WWW-Authenticate", bearerChallenge(settings));
  response.status(401).json({ error: "aurion_admin_oauth_required", requiredScope: AURION_ADMIN_MCP_READ_SCOPE });
}

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
    if (!settings) { response.status(503).json({ error: "aurion_admin_mcp_oauth_not_configured" }); return; }
    response.setHeader("cache-control", "public, max-age=300");
    response.status(200).json(protectedResourceMetadata(settings));
  });

  app.all(AURION_ADMIN_MCP_PATH, async (request: Request, response: Response) => {
    const settings = readSettingsOrNull();
    if (!settings) { response.status(503).json({ error: "aurion_admin_mcp_oauth_not_configured" }); return; }
    const token = bearerToken(request);
    if (!token) { sendUnauthorized(response, settings); return; }
    let actor: AdminActor;
    try { actor = await resolveAdminActor(token, settings); }
    catch (error) {
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
