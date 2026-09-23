import { createServer } from "node:http";
import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAdminMcp } from "./adminMcp";

async function withAdminMcpApp<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  // Model a request after the production host gate without widening the real allowlist for an ephemeral test port.
  app.use((request, _response, next) => {
    request.headers.host = "localhost:3000";
    request.headers["x-forwarded-host"] = "arelogic.space";
    next();
  });
  registerAdminMcp(app);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP test server address");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}


async function withDevControlApp<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerAdminMcp(app);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP test server address");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("adminMcp HTTP resource", () => {
  it("fails closed when the public OAuth resource configuration is absent", async () => {
    vi.stubEnv("AURION_ADMIN_MCP_RESOURCE_URL", "");
    vi.stubEnv("OIDC_ISSUER_URL", "");
    await withAdminMcpApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "aurion_admin_mcp_oauth_not_configured" });
    });
  });

  it("publishes scoped protected-resource metadata and challenges unauthenticated requests", async () => {
    vi.stubEnv("AURION_ADMIN_MCP_RESOURCE_URL", "https://arelogic.space/admin-mcp");
    vi.stubEnv("OIDC_ISSUER_URL", "https://id.arelogic.space");
    await withAdminMcpApp(async baseUrl => {
      const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
      expect(metadata.status).toBe(200);
      await expect(metadata.json()).resolves.toMatchObject({
        resource: "https://arelogic.space/admin-mcp",
        authorization_servers: ["https://id.arelogic.space"],
        scopes_supported: ["aurion.admin.read", "aurion.admin.assets.write", "aurion.admin.authoring.write"],
      });
      const response = await fetch(`${baseUrl}/admin-mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("https://arelogic.space/.well-known/oauth-protected-resource");
      expect(response.headers.get("www-authenticate")).toContain("aurion.admin.read");
    });
  });
});


describe("pre-alpha dev control HTTP boundary", () => {

  it("accepts an authenticated local MCP tools/list request on the real dev endpoint", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_DEV_ADMIN_TOKEN", "0123456789abcdef0123456789abcdef");
    await withDevControlApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/dev/admin-mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer 0123456789abcdef0123456789abcdef",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(1);
      expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "aurion_dev_inspect_environment",
        "aurion_dev_test_zone_reset",
        "aurion_dev_seed_test_encounter",
        "aurion_dev_get_fixture_readback",
      ]);
    } );
  });

  it("requires an explicitly configured dev token even on loopback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_DEV_ADMIN_TOKEN", "");
    await withDevControlApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/.well-known/aurion-dev-control`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: "dev_control_authentication_required",
        reason: "dev_token_not_configured",
      });
    } );
  });

  it("exposes metadata only on authenticated loopback in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_DEV_ADMIN_TOKEN", "0123456789abcdef0123456789abcdef");
    await withDevControlApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/.well-known/aurion-dev-control`, {
        headers: { authorization: "Bearer 0123456789abcdef0123456789abcdef" },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.protocol).toBe("aurion.dev-control.v1");
      expect(body.tools).toEqual([
        { name: "aurion_dev_inspect_environment", mode: "read" },
        { name: "aurion_dev_test_zone_reset", mode: "write" },
        { name: "aurion_dev_seed_test_encounter", mode: "write" },
      ]);
      expect(body.unavailable).toEqual(expect.arrayContaining([
        "raw_sql_execution",
        "raw_shell_execution",
        "git_mutation",
        "vps_access",
      ]));
    } );
  });

  it("rejects a public host even with a valid dev token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_DEV_ADMIN_TOKEN", "0123456789abcdef0123456789abcdef");
    await withDevControlApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/.well-known/aurion-dev-control`, {
        headers: {
          "x-forwarded-host": "arelogic.space",
          authorization: "Bearer 0123456789abcdef0123456789abcdef",
        },
      });
      expect(response.status).toBe(403);
    }, );

  });
});
