import { createServer } from "node:http";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ role: "admin", present: true, expectedOpenId: "" }));
vi.mock("./db", async importOriginal => ({
  ...await importOriginal<typeof import("./db")>(),
  getUserByOpenId: vi.fn(async (openId: string) => fixture.present && openId === fixture.expectedOpenId
    ? { id: 7, role: fixture.role } : null),
}));
import * as db from "./db";
import { registerAdminMcp } from "./adminMcp";
import { openIdForOidcSubject } from "./adminMcpProtocol";

const issuer = "https://supabase-oauth-fixture.example/auth/v1";
const resource = "https://arelogic.space/admin-mcp";
const clientId = "b811b3a0-b885-4a9d-9fbc-13d7bcaefadb";
const subject = "fixture-user-7";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fixture.role = "admin";
  fixture.present = true;
});

describe("Supabase OAuth HTTP boundary (isolated JWKS and DB fixtures)", () => {
  it("verifies signed claims, resource binding, and Aurion admin identity", async () => {
    vi.stubEnv("AURION_ADMIN_MCP_RESOURCE_URL", resource);
    vi.stubEnv("OIDC_ISSUER_URL", issuer);
    vi.stubEnv("AURION_ADMIN_MCP_AUTH_MODE", "supabase_oauth");
    vi.stubEnv("AURION_ADMIN_MCP_CLIENT_ID", clientId);
    vi.stubEnv("WOLFRAM_CAG_BASE_URL", "");
    fixture.expectedOpenId = openIdForOidcSubject(issuer, subject);
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const wrongKey = await generateKeyPair("ES256");
    const jwk = { ...await exportJWK(publicKey), kid: "fixture-key", alg: "ES256", use: "sig" };
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${issuer}/.well-known/openid-configuration`) return Response.json({ issuer, jwks_uri: `${issuer}/jwks` });
      if (url === `${issuer}/jwks`) return Response.json({ keys: [jwk] });
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
    const makeToken = async (changes: Record<string, unknown> = {}, key = privateKey) => {
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: issuer, sub: subject, aud: resource, iat: now, exp: now + 600,
        client_id: clientId, role: "authenticated", is_anonymous: false,
        scope: "openid profile", app_metadata: { aurion_admin_roles: ["aurion_admin_read"] },
        ...changes,
      };
      return new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "fixture-key" }).sign(key);
    };
    const call = (token: string) => nativeFetch(`http://127.0.0.1:${address.port}/admin-mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    try {
      const token = await makeToken();
      let response = await call(token);
      expect(response.status).toBe(200);
      let names = (await response.json()).result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toContain("aurion_admin_get_capabilities");
      expect(names).not.toContain("aurion_admin_glb_import");
      expect(db.getUserByOpenId).toHaveBeenCalledWith(fixture.expectedOpenId);

      vi.mocked(db.getUserByOpenId).mockClear();
      const invalid = [
        await makeToken({}, wrongKey.privateKey),
        await makeToken({ client_id: "wrong-client" }),
        await makeToken({ aud: "other-audience" }),
        await makeToken({ aud: "authenticated" }),
        await makeToken({ is_anonymous: true }),
        await makeToken({ scope: "profile" }),
        await makeToken({ app_metadata: {}, user_metadata: { aurion_admin_roles: ["aurion_admin_read"] } }),
        await makeToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
      ];
      for (const bad of invalid) expect((await call(bad)).status).toBe(401);
      expect(db.getUserByOpenId).not.toHaveBeenCalled();

      fixture.role = "user";
      expect((await call(token)).status).toBe(401);
      fixture.role = "admin";
      fixture.present = false;
      expect((await call(token)).status).toBe(401);
      fixture.present = true;
      const writeToken = await makeToken({ app_metadata: { aurion_admin_roles: ["aurion_admin_read", "aurion_admin_assets_write"] } });
      response = await call(writeToken);
      expect(response.status).toBe(200);
      names = (await response.json()).result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toContain("aurion_admin_glb_import");

      // The same valid bearer must not be reusable against another resource,
      // even when issuer, OAuth client and Aurion identity are shared.
      vi.stubEnv("AURION_ADMIN_MCP_RESOURCE_URL", "https://other-resource.example/admin-mcp");
      expect((await call(token)).status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
