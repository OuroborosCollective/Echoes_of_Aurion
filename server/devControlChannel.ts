import { operationalNow } from "../shared/operationalClock";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { Express, Request, Response } from "express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import {
  AURION_DEV_CONTROL_METADATA_PATH,
  AURION_DEV_CONTROL_PATH,
  devControlCapabilities,
  isAllowedDevControlHost,
  isDevControlChannelEnabled,
  isLoopbackRemoteAddress,
  verifyDevControlAuthorization,
} from "./devControlProtocol";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";

const DEV_FIXTURE_ZONE_ID = "observatory_threshold" as const;
const MAX_IDEMPOTENCY_ENTRIES = 256;

type FixtureResult = Readonly<Record<string, unknown>>;

const developmentZone = new AuthoritativeMovementZone(DEV_FIXTURE_ZONE_ID);
const idempotencyResults = new Map<string, { commandHash: string; result: FixtureResult }>();

function rememberIdempotency(key: string, commandHash: string, result: FixtureResult): FixtureResult {
  const existing = idempotencyResults.get(key);
  if (existing) {
    if (existing.commandHash !== commandHash) throw new Error("DEV_CONTROL_IDEMPOTENCY_REUSE_MISMATCH");
    return existing.result;
  }
  if (idempotencyResults.size >= MAX_IDEMPOTENCY_ENTRIES) {
    const oldest = idempotencyResults.keys().next().value;
    if (oldest) idempotencyResults.delete(oldest);
  }
  idempotencyResults.set(key, { commandHash, result });
  return result;
}

function fixtureReadback(operation: string, idempotencyKey: string, selectedEntityIds: readonly string[] = []): FixtureResult {
  const state = developmentZone.getCanonicalZoneState();
  return Object.freeze({
    protocol: "aurion.dev-control-readback.v1",
    operation,
    operationId: canonicalSha256({ operation, idempotencyKey }),
    idempotencyKey,
    zoneId: DEV_FIXTURE_ZONE_ID,
    worldId: state.worldId,
    tick: state.tick,
    stateHash: hashCanonicalZoneState(state),
    mobCount: state.mobs.length,
    selectedEntityIds: Object.freeze([...selectedEntityIds]),
    authoritativeRuntime: "AuthoritativeMovementZone",
    persistenceMutation: "none",
    gameplayAuthority: "isolated_development_fixture_only",
  });
}

export function executeReset(zoneId: string, idempotencyKey: string, confirmation: "CONFIRM_DEV_ZONE_RESET"): FixtureResult {
  if (zoneId !== DEV_FIXTURE_ZONE_ID) throw new Error("DEV_CONTROL_ZONE_NOT_ALLOWED");
  if (confirmation !== "CONFIRM_DEV_ZONE_RESET") throw new Error("DEV_CONTROL_CONFIRMATION_REQUIRED");
  const command = { schema: "aurion.dev-zone-reset-command.v1", operation: "reset", zoneId, idempotencyKey };
  const commandHash = canonicalSha256(command);
  const existing = idempotencyResults.get(idempotencyKey);
  if (existing) {
    if (existing.commandHash !== commandHash) throw new Error("DEV_CONTROL_IDEMPOTENCY_REUSE_MISMATCH");
    return existing.result;
  }
  developmentZone.resetDevelopmentFixture();
  const result = Object.freeze({
    ...fixtureReadback("zone_reset", idempotencyKey),
    commandHash,
    status: "RESET_COMPLETED",
  });
  return rememberIdempotency(idempotencyKey, commandHash, result);
}

export function executeSeed(
  zoneId: string,
  fixtureType: "starter_encounter" | "boss_encounter" | "npc_dialogue_fixture",
  idempotencyKey: string,
): FixtureResult {
  if (zoneId !== DEV_FIXTURE_ZONE_ID) throw new Error("DEV_CONTROL_ZONE_NOT_ALLOWED");
  const command = { schema: "aurion.dev-seed-encounter-command.v1", operation: "seed", zoneId, fixtureType, idempotencyKey };
  const commandHash = canonicalSha256(command);
  const existing = idempotencyResults.get(idempotencyKey);
  if (existing) {
    if (existing.commandHash !== commandHash) throw new Error("DEV_CONTROL_IDEMPOTENCY_REUSE_MISMATCH");
    return existing.result;
  }
  developmentZone.resetDevelopmentFixture();
  const selectedEntityIds = developmentZone.seedDevelopmentEncounter(fixtureType);
  const result = Object.freeze({
    ...fixtureReadback("seed_test_encounter", idempotencyKey, selectedEntityIds),
    commandHash,
    fixtureType,
    status: "SEEDED",
  });
  return rememberIdempotency(idempotencyKey, commandHash, result);
}

export function createDevControlMcpServer() {
  const server = new McpServer({ name: "echoes-of-aurion-dev-control", version: "1.0.0" });
  const content = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  });

  server.registerTool("aurion_dev_inspect_environment", {
    title: "Inspect dev control environment",
    description: "Reads the real local environment boundary without mutating gameplay or persistence.",
    inputSchema: z.object({}),
  }, async () => content({
    protocol: "aurion.dev-environment-evidence.v1",
    nodeEnv: process.env.NODE_ENV ?? "unset",
    channel: "dev/prealpha",
    productionEnabled: false,
    loopbackRequired: true,
    tokenConfigured: Boolean(process.env.AURION_DEV_ADMIN_TOKEN?.trim() || process.env.AURION_DEV_ADMIN_SECRET?.trim()),
    metadataPath: AURION_DEV_CONTROL_METADATA_PATH,
    controlPath: AURION_DEV_CONTROL_PATH,
    operationalTimestamp: operationalNow(),
    truth: "observed_environment_only",
  }));

  server.registerTool("aurion_dev_test_zone_reset", {
    title: "Reset bounded development zone",
    description: "Resets one existing canonical zone implementation inside an isolated development fixture. No global live zone or persistence mutation.",
    inputSchema: z.object({
      zoneId: z.literal(DEV_FIXTURE_ZONE_ID),
      idempotencyKey: z.string().min(16).max(128),
      confirmation: z.literal("CONFIRM_DEV_ZONE_RESET"),
    }).strict(),
  }, async input => content(executeReset(input.zoneId, input.idempotencyKey, input.confirmation)));

  server.registerTool("aurion_dev_seed_test_encounter", {
    title: "Seed bounded test encounter",
    description: "Selects an existing deterministic encounter fixture from the canonical mob runtime. No new content definition or live-state mutation.",
    inputSchema: z.object({
      zoneId: z.literal(DEV_FIXTURE_ZONE_ID),
      fixtureType: z.enum(["starter_encounter", "boss_encounter", "npc_dialogue_fixture"]),
      idempotencyKey: z.string().min(16).max(128),
    }).strict(),
  }, async input => content(executeSeed(input.zoneId, input.fixtureType, input.idempotencyKey)));

  server.registerTool("aurion_dev_get_fixture_readback", {
    title: "Read development fixture state",
    description: "Returns the canonical state hash and selected fixture identity from the isolated development runtime.",
    inputSchema: z.object({}).strict(),
  }, async () => content(fixtureReadback("fixture_readback", "readback")));

  return server;
}

function authorize(request: Request, response: Response): boolean {
  if (!isDevControlChannelEnabled(process.env)) {
    response.status(403).json({ error: "dev_control_channel_disabled_in_production" });
    return false;
  }
  if (!isAllowedDevControlHost(request.headers.host, request.header("x-forwarded-host")) ||
      !isLoopbackRemoteAddress(request.socket.remoteAddress)) {
    response.status(403).json({ error: "dev_control_channel_forbidden_host" });
    return false;
  }
  const auth = verifyDevControlAuthorization(
    request.header("authorization"),
    request.header("x-aurion-dev-token"),
    process.env,
  );
  if (!auth.authorized) {
    response.status(401).json({
      error: "dev_control_authentication_required",
      reason: auth.reason,
    });
    return false;
  }
  return true;
}

export function registerDevControlChannel(app: Express): void {
  app.get(AURION_DEV_CONTROL_METADATA_PATH, (request, response) => {
    if (!authorize(request, response)) return;
    response.setHeader("cache-control", "no-store");
    response.status(200).json(devControlCapabilities());
  });

  app.all(AURION_DEV_CONTROL_PATH, async (request, response) => {
    if (!authorize(request, response)) return;
    try {
      const server = createDevControlMcpServer();
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("[Aurion Dev Control MCP] Request failed", error);
      if (!response.headersSent) response.status(500).json({ error: "dev_control_mcp_request_failed" });
    }
  });
}
