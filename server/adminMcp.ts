import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import * as db from "./db";
import {
  AURION_ADMIN_MCP_PATH,
  AURION_ADMIN_MCP_READ_SCOPE,
  bearerChallenge,
  openIdForOidcSubject,
  parseAurionAdminMcpTokenClaims,
  protectedResourceMetadata,
  readAurionAdminMcpSettings,
  type AurionAdminMcpSettings,
} from "./adminMcpProtocol";
import { resolveApprovedGatewayHost } from "./gatewayHost";

type AdminActor = {
  userId: number;
  openId: string;
  role: "admin";
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
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  if (body.issuer !== issuer) throw new Error("OIDC discovery issuer does not match the configured authorization server");
  const value = Object.freeze({ issuer, jwksUri: sameOriginHttps(body.jwks_uri, issuer) });
  discoveryCache.set(issuer, { value, expiresAt: Date.now() + DISCOVERY_TTL_MS });
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
  const claims = parseAurionAdminMcpTokenClaims(payload, settings);
  const openId = openIdForOidcSubject(claims.issuer, claims.subject);
  const user = await db.getUserByOpenId(openId);
  if (!user || user.role !== "admin") throw new Error("Aurion admin role is required");
  return Object.freeze({ userId: user.id, openId, role: "admin" as const });
}

export function adminMcpCapabilities() {
  return Object.freeze({
    protocol: "aurion.admin-mcp.v1",
    tools: Object.freeze([
      Object.freeze({ name: "aurion_admin_get_capabilities", mode: "read", description: "Lists the current safe capabilities and boundaries." }),
      Object.freeze({ name: "aurion_admin_get_world_overview", mode: "read", description: "Reads the confirmed global world descriptor without advancing an epoch." }),
    ]),
    unavailable: Object.freeze([
      "world_delta_write",
      "object_placement",
      "quest_publish",
      "npc_reward_mutation",
      "database_access",
      "shell_access",
      "git_or_vps_access",
    ]),
    chatGptProMode: "read_fetch_only",
    writePath: "No MCP write tool is registered. World changes remain unavailable until a future separately reviewed apply-service and a compatible ChatGPT workspace are approved.",
  });
}

function createAdminMcpServer(actor: AdminActor) {
  const server = new McpServer({ name: "echoes-of-aurion-admin", version: "0.1.0" });
  server.registerTool("aurion_admin_get_capabilities", {
    title: "Read Aurion admin MCP capabilities",
    description: "Read the verified, bounded capabilities and unavailable authority of the Aurion Admin MCP.",
    inputSchema: z.object({}),
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify(adminMcpCapabilities()) }],
    structuredContent: adminMcpCapabilities(),
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
  return server;
}

function sendUnauthorized(response: Response, settings: AurionAdminMcpSettings) {
  response.setHeader("WWW-Authenticate", bearerChallenge(settings));
  response.status(401).json({ error: "aurion_admin_oauth_required", requiredScope: AURION_ADMIN_MCP_READ_SCOPE });
}

/**
 * Dedicated OAuth resource for ChatGPT-compatible Admin MCP clients.
 * It deliberately exposes read-only tools only: ChatGPT Pro supports this mode,
 * while any future mutation requires an independent, receipt-bound service.
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
