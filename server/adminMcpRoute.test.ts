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
        scopes_supported: ["aurion.admin.read", "aurion.admin.assets.write"],
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
