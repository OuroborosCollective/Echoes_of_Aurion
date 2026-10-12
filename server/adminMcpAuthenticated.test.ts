import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PILOT_WOLF_QUEST_TEMPLATE } from "./questCompiler/pilotQuestTemplate";
import { aurionWorldContextService } from "./worldContext/service";
import { buildWorldContextCapsule } from "./worldContext/assembler";
import { hashWorldContextQuery } from "../shared/aurionWorldContextCanonicalHash";

const auth = vi.hoisted(() => ({
  role: "admin",
  scopes: "aurion.admin.read",
  roles: [] as string[],
  applicationId: "",
  audience: ["https://arelogic.space/admin-mcp"],
}));
vi.mock("jose", async importOriginal => ({
  ...await importOriginal<typeof import("jose")>(),
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(async () => ({ payload: {
    iss: "https://admin-mcp-test.example",
    sub: "test-admin",
    aud: auth.audience,
    scope: auth.scopes,
    roles: auth.roles,
    applicationId: auth.applicationId,
    exp: Math.floor(Date.now() / 1000) + 600,
  } })),
}));
vi.mock("./db", async importOriginal => ({
  ...await importOriginal<typeof import("./db")>(),
  getUserByOpenId: vi.fn(async () => ({ id: 7, role: auth.role })),
}));
import { registerAdminMcp } from "./adminMcp";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  auth.role = "admin";
  auth.scopes = "aurion.admin.read";
  auth.roles = [];
  auth.applicationId = "";
  auth.audience = ["https://arelogic.space/admin-mcp"];
});

async function withAuthenticatedMcp(run: (call: (method: string, params?: object) => Promise<Response>) => Promise<void>) {
  vi.stubEnv("AURION_ADMIN_MCP_RESOURCE_URL", "https://arelogic.space/admin-mcp");
  vi.stubEnv("OIDC_ISSUER_URL", "https://admin-mcp-test.example");
  vi.stubEnv("WOLFRAM_CAG_BASE_URL", "");
  const nativeFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).startsWith("https://admin-mcp-test.example/")) {
      return new Response(JSON.stringify({
        issuer: "https://admin-mcp-test.example",
        jwks_uri: "https://admin-mcp-test.example/jwks",
      }), { headers: { "content-type": "application/json" } });
    }
    return nativeFetch(input, init);
  });
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.headers.host = "localhost:3000";
    request.headers["x-forwarded-host"] = "arelogic.space";
    next();
  });
  registerAdminMcp(app);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TCP address required");
  try {
    await run((method, params = {}) => nativeFetch(`http://127.0.0.1:${address.port}/admin-mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token-for-local-regression-only",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("authenticated admin MCP HTTP requests (isolated identity fixtures)", () => {
  it("initializes and lists actual tools with read-only authority", async () => {
    await withAuthenticatedMcp(async call => {
      const initialize = await call("initialize", {
        protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "regression", version: "1" },
      });
      expect(initialize.status).toBe(200);
      expect((await initialize.json()).result.serverInfo.name).toBe("echoes-of-aurion-admin");
      const response = await call("tools/list");
      expect(response.status).toBe(200);
      const names = (await response.json()).result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toContain("aurion_admin_get_capabilities");
      expect(names).toContain("aurion_quest_validate");
      expect(names).not.toContain("aurion_admin_glb_import");
      expect(names).not.toContain("aurion_quest_publish");
    });
  });

  it("validates real quest templates and rejects an unreachable graph", async () => {
    await withAuthenticatedMcp(async call => {
      for (const [template, valid] of [
        [PILOT_WOLF_QUEST_TEMPLATE, true],
        [{ ...PILOT_WOLF_QUEST_TEMPLATE, edges: [] }, false],
      ] as const) {
        const response = await call("tools/call", { name: "aurion_quest_validate", arguments: { templateJson: JSON.stringify(template) } });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.result.isError).not.toBe(true);
        expect(body.result.structuredContent.valid).toBe(valid);
      }
    });
  });

  it("rejects a non-admin and a token without the required read scope", async () => {
    await withAuthenticatedMcp(async call => {
      auth.role = "user";
      expect((await call("tools/list")).status).toBe(401);
      auth.role = "admin";
      auth.scopes = "openid";
      expect((await call("tools/list")).status).toBe(401);
    });
  });

  it("replays the capsule inside the persisted receipt envelope", async () => {
    const queryDraft = {
      schemaVersion: "aurion.world-context-query.v1" as const,
      worldId: "mcp-regression-empty-world", worldRevision: "test", logicalTick: 1,
      actorId: "admin", purpose: "admin_explanation" as const, subjectIds: [],
      policyVersion: "aurion.context-importance.v1",
      budget: { maxEstimatedTokens: 800, maxUtf8Bytes: 6000, tokenizerId: "aurion-default-v1" },
    };
    const { capsule } = await buildWorldContextCapsule(null, {
      ...queryDraft, queryHash: hashWorldContextQuery(queryDraft),
    });
    // The database read is isolated; the canonical capsule builder and replay execute unchanged.
    vi.spyOn(aurionWorldContextService, "getCapsule").mockResolvedValue({
      id: "test-capsule", capsule,
    } as NonNullable<Awaited<ReturnType<typeof aurionWorldContextService.getCapsule>>>);
    await withAuthenticatedMcp(async call => {
      const response = await call("tools/call", {
        name: "aurion_context_replay_capsule", arguments: { capsuleId: "test-capsule" },
      });
      const body = await response.json();
      expect(body.result.isError).not.toBe(true);
      expect(body.result.structuredContent.status).toBe("MATCH");
    });
  });

  it("uses dedicated application roles for actual tool permissions in the free OAuth mode", async () => {
    const clientId = "b811b3a0-b885-4a9d-9fbc-13d7bcaefadb";
    vi.stubEnv("AURION_ADMIN_MCP_AUTH_MODE", "application_roles");
    vi.stubEnv("AURION_ADMIN_MCP_CLIENT_ID", clientId);
    auth.scopes = "openid profile offline_access";
    auth.roles = ["aurion_admin_read"];
    auth.applicationId = clientId;
    auth.audience = ["https://arelogic.space/admin-mcp", clientId];
    await withAuthenticatedMcp(async call => {
      const names = async () => {
        const response = await call("tools/list");
        expect(response.status).toBe(200);
        return (await response.json()).result.tools.map((tool: { name: string }) => tool.name);
      };
      expect(await names()).not.toContain("aurion_admin_glb_import");
      expect(await names()).not.toContain("aurion_quest_publish");
      auth.roles.push("aurion_admin_assets_write", "aurion_admin_authoring_write");
      expect(await names()).toEqual(expect.arrayContaining(["aurion_admin_glb_import", "aurion_quest_publish"]));
      auth.applicationId = "cdb22c5e-57f2-4008-bf88-3197e8b98389";
      expect((await call("tools/list")).status).toBe(401);
      auth.applicationId = clientId;
      auth.roles = ["admin"];
      expect((await call("tools/list")).status).toBe(401);
      auth.roles = ["aurion_admin_read"];
      auth.role = "user";
      expect((await call("tools/list")).status).toBe(401);
    });
  });
});
