import { describe, expect, it } from "vitest";
import {
  AURION_ADMIN_MCP_READ_SCOPE,
  AURION_ADMIN_GLB_WRITE_SCOPE,
  bearerChallenge,
  openIdForOidcSubject,
  parseAurionAdminMcpTokenClaims,
  protectedResourceMetadata,
  readAurionAdminMcpSettings,
} from "./adminMcpProtocol";

const environment = {
  AURION_ADMIN_MCP_RESOURCE_URL: "https://arelogic.space/admin-mcp",
  OIDC_ISSUER_URL: "https://id.arelogic.space",
};

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://id.arelogic.space",
    sub: "fusionauth-user-01",
    aud: "https://arelogic.space/admin-mcp",
    scope: AURION_ADMIN_MCP_READ_SCOPE,
    exp: Math.floor(1_800_000_000_000 / 1000) + 600,
    ...overrides,
  };
}

describe("adminMcpProtocol", () => {
  it("binds the protected resource and only advertises the current ChatGPT-Pro read scope", () => {
    const settings = readAurionAdminMcpSettings(environment);
    expect(settings).toEqual({
      resourceUrl: "https://arelogic.space/admin-mcp",
      authorizationServerUrl: "https://id.arelogic.space",
      protectedResourceMetadataUrl: "https://arelogic.space/.well-known/oauth-protected-resource",
    });
    expect(protectedResourceMetadata(settings)).toEqual({
      resource: settings.resourceUrl,
      authorization_servers: [settings.authorizationServerUrl],
      scopes_supported: [AURION_ADMIN_MCP_READ_SCOPE, AURION_ADMIN_GLB_WRITE_SCOPE],
      resource_documentation: "https://arelogic.space/docs/aurion-admin-mcp",
    });
    expect(bearerChallenge(settings)).toContain(settings.protectedResourceMetadataUrl);
    expect(bearerChallenge(settings)).toContain(AURION_ADMIN_MCP_READ_SCOPE);
  });

  it("rejects a resource URL outside the isolated admin path", () => {
    expect(() => readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_RESOURCE_URL: "https://arelogic.space/mcp" })).toThrow("/admin-mcp");
    expect(() => readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_RESOURCE_URL: "http://arelogic.space/admin-mcp" })).toThrow("HTTPS");
  });

  it("accepts only a live read-scoped token bound to the exact admin resource", () => {
    const settings = readAurionAdminMcpSettings(environment);
    expect(parseAurionAdminMcpTokenClaims(validClaims({ scope: `openid profile ${AURION_ADMIN_MCP_READ_SCOPE}` }), settings, 1_800_000_000_000)).toMatchObject({
      subject: "fusionauth-user-01",
      audience: [settings.resourceUrl],
      scopes: [AURION_ADMIN_MCP_READ_SCOPE, "openid", "profile"],
    });
    expect(() => parseAurionAdminMcpTokenClaims(validClaims({ aud: "https://arelogic.space/mcp" }), settings, 1_800_000_000_000)).toThrow("resource server");
    expect(() => parseAurionAdminMcpTokenClaims(validClaims({ scope: "openid profile" }), settings, 1_800_000_000_000)).toThrow("read scope");
    expect(() => parseAurionAdminMcpTokenClaims(validClaims({ exp: Math.floor(1_800_000_000_000 / 1000) - 1 }), settings, 1_800_000_000_000)).toThrow("expired");
  });

  it("expires at the exact recorded second and rejects invalid time evidence", () => {
    const settings = readAurionAdminMcpSettings(environment);
    const expiryMs = 1_800_000_600_000, claims = validClaims({ exp: expiryMs / 1000 });
    expect(parseAurionAdminMcpTokenClaims(claims, settings, expiryMs - 1).expiresAtSeconds).toBe(expiryMs / 1000);
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, expiryMs)).toThrow("expired");
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, Number.NaN)).toThrow("OPERATIONAL_TIME_INVALID");
  });

  it("derives a stable Aurion user key from issuer and subject without trusting display claims", () => {
    expect(openIdForOidcSubject("https://id.arelogic.space", "fusionauth-user-01")).toHaveLength(64);
    expect(openIdForOidcSubject("https://id.arelogic.space", "fusionauth-user-01")).not.toBe(openIdForOidcSubject("https://id.other.example", "fusionauth-user-01"));
    expect(() => openIdForOidcSubject("https://id.arelogic.space", "bad subject with spaces")).toThrow("subject");
  });
});
