import { describe, expect, it } from "vitest";
import {
  AURION_ADMIN_AUTHORING_WRITE_SCOPE,
  AURION_ADMIN_MCP_READ_SCOPE,
  AURION_ADMIN_GLB_WRITE_SCOPE,
  adminMcpRequiredOAuthScope,
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
const clientId = "74259d44-6a27-4fc4-ae3d-d50b33a028d8";
const applicationRoleEnvironment = {
  ...environment,
  AURION_ADMIN_MCP_AUTH_MODE: "application_roles",
  AURION_ADMIN_MCP_CLIENT_ID: clientId,
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

function validApplicationRoleClaims(overrides: Record<string, unknown> = {}) {
  return validClaims({
    aud: [environment.AURION_ADMIN_MCP_RESOURCE_URL, clientId],
    applicationId: clientId,
    scope: "openid profile offline_access",
    roles: ["aurion_admin_read"],
    ...overrides,
  });
}

describe("adminMcpProtocol", () => {
  it("advertises read, asset-write and authoring-write as separate OAuth scopes", () => {
    const settings = readAurionAdminMcpSettings(environment);
    expect(settings).toEqual({
      resourceUrl: "https://arelogic.space/admin-mcp",
      authorizationServerUrl: "https://id.arelogic.space",
      protectedResourceMetadataUrl: "https://arelogic.space/.well-known/oauth-protected-resource",
    });
    expect(protectedResourceMetadata(settings)).toEqual({
      resource: settings.resourceUrl,
      authorization_servers: [settings.authorizationServerUrl],
      scopes_supported: [
        AURION_ADMIN_MCP_READ_SCOPE,
        AURION_ADMIN_GLB_WRITE_SCOPE,
        AURION_ADMIN_AUTHORING_WRITE_SCOPE,
      ],
      resource_documentation: "https://arelogic.space/docs/aurion-admin-mcp",
    });
    expect(bearerChallenge(settings)).toContain(settings.protectedResourceMetadataUrl);
    expect(bearerChallenge(settings)).toContain(AURION_ADMIN_MCP_READ_SCOPE);
  });

  it("rejects a resource URL outside the isolated admin path", () => {
    expect(() => readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_RESOURCE_URL: "https://arelogic.space/mcp" })).toThrow("/admin-mcp");
    expect(() => readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_RESOURCE_URL: "http://arelogic.space/admin-mcp" })).toThrow("HTTPS");
  });

  it("keeps scoped OAuth as the default even when an application client is configured", () => {
    const settings = readAurionAdminMcpSettings(environment);
    expect(readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_CLIENT_ID: clientId })).toEqual(settings);
    expect(readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_AUTH_MODE: "scoped_oauth" })).toEqual(settings);
    expect(adminMcpRequiredOAuthScope(settings)).toBe(AURION_ADMIN_MCP_READ_SCOPE);
    expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({
      roles: ["aurion_admin_read", "aurion_admin_assets_write", "aurion_admin_authoring_write"],
    }), settings, 1_800_000_000_000)).toThrow("read scope");
  });

  it("rejects unsupported auth modes and missing or invalid dedicated application IDs", () => {
    expect(() => readAurionAdminMcpSettings({ ...environment, AURION_ADMIN_MCP_AUTH_MODE: "roles" })).toThrow("AURION_ADMIN_MCP_AUTH_MODE");
    for (const invalidClientId of [undefined, "", "not-an-application-uuid", "74259d44-6a27-4fc4-ae3d-d50b33a028d8-extra"]) {
      expect(() => readAurionAdminMcpSettings({ ...applicationRoleEnvironment, AURION_ADMIN_MCP_CLIENT_ID: invalidClientId })).toThrow("AURION_ADMIN_MCP_CLIENT_ID");
    }
  });

  it("advertises built-in OAuth consent scopes in explicit application-role mode", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    expect(settings).toEqual({
      resourceUrl: environment.AURION_ADMIN_MCP_RESOURCE_URL,
      authorizationServerUrl: environment.OIDC_ISSUER_URL,
      protectedResourceMetadataUrl: "https://arelogic.space/.well-known/oauth-protected-resource",
      authMode: "application_roles",
      clientId,
    });
    expect(readAurionAdminMcpSettings({ ...applicationRoleEnvironment, AURION_ADMIN_MCP_CLIENT_ID: ` ${clientId.toUpperCase()} ` })).toEqual(settings);
    expect(protectedResourceMetadata(settings).scopes_supported).toEqual(["openid", "profile", "offline_access"]);
    expect(protectedResourceMetadata(settings).aurion_admin_authorization).toEqual({
      mode: "application_roles",
      client_id: clientId,
      roles_supported: ["aurion_admin_read", "aurion_admin_assets_write", "aurion_admin_authoring_write"],
    });
    expect(adminMcpRequiredOAuthScope(settings)).toBe("openid");
    expect(bearerChallenge(settings)).toBe(`Bearer resource_metadata="${settings.protectedResourceMetadataUrl}", scope="openid"`);
  });

  it("accepts a live token and preserves independently granted write scopes", () => {
    const settings = readAurionAdminMcpSettings(environment);
    const claims = parseAurionAdminMcpTokenClaims(validClaims({
      scope: `openid profile ${AURION_ADMIN_MCP_READ_SCOPE} ${AURION_ADMIN_GLB_WRITE_SCOPE} ${AURION_ADMIN_AUTHORING_WRITE_SCOPE}`,
    }), settings, 1_800_000_000_000);
    expect(claims).toMatchObject({
      subject: "fusionauth-user-01",
      audience: [settings.resourceUrl],
    });
    expect(claims.scopes).toEqual([
      AURION_ADMIN_MCP_READ_SCOPE,
      AURION_ADMIN_AUTHORING_WRITE_SCOPE,
      AURION_ADMIN_GLB_WRITE_SCOPE,
      "openid",
      "profile",
    ].sort());
    expect(() => parseAurionAdminMcpTokenClaims(validClaims({ aud: "https://arelogic.space/mcp" }), settings, 1_800_000_000_000)).toThrow("resource server");
    expect(() => parseAurionAdminMcpTokenClaims(validClaims({ scope: "openid profile" }), settings, 1_800_000_000_000)).toThrow("read scope");
  });

  it("expires at the exact recorded second and rejects invalid time evidence", () => {
    const settings = readAurionAdminMcpSettings(environment);
    const expiryMs = 1_800_000_600_000, claims = validClaims({ exp: expiryMs / 1000 });
    expect(parseAurionAdminMcpTokenClaims(claims, settings, expiryMs - 1).expiresAtSeconds).toBe(expiryMs / 1000);
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, expiryMs)).toThrow("expired");
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, Number.NaN)).toThrow("OPERATIONAL_TIME_INVALID");
  });

  it("requires both resource and dedicated client audiences plus the matching application ID", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    const unrelatedClientId = "c3097280-c9a5-496a-953c-8d899e39010d";
    for (const overrides of [
      { aud: environment.AURION_ADMIN_MCP_RESOURCE_URL },
      { aud: clientId },
      { aud: [environment.AURION_ADMIN_MCP_RESOURCE_URL, unrelatedClientId] },
      { applicationId: unrelatedClientId },
      { applicationId: undefined },
      { applicationId: [clientId] },
    ]) {
      expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims(overrides), settings, 1_800_000_000_000)).toThrow();
    }
    expect(parseAurionAdminMcpTokenClaims(validApplicationRoleClaims(), settings, 1_800_000_000_000).audience).toEqual([
      clientId, environment.AURION_ADMIN_MCP_RESOURCE_URL,
    ].sort());
  });

  it("grants read and each write permission only for the corresponding application role", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    for (const [roles, expectedScopes] of [
      [["aurion_admin_read"], [AURION_ADMIN_MCP_READ_SCOPE]],
      [["aurion_admin_read", "aurion_admin_assets_write"], [AURION_ADMIN_MCP_READ_SCOPE, AURION_ADMIN_GLB_WRITE_SCOPE]],
      [["aurion_admin_read", "aurion_admin_authoring_write"], [AURION_ADMIN_MCP_READ_SCOPE, AURION_ADMIN_AUTHORING_WRITE_SCOPE]],
      [["aurion_admin_read", "aurion_admin_assets_write", "aurion_admin_authoring_write", "admin", "unknown", "aurion_admin_read"], [AURION_ADMIN_MCP_READ_SCOPE, AURION_ADMIN_GLB_WRITE_SCOPE, AURION_ADMIN_AUTHORING_WRITE_SCOPE]],
    ] as const) {
      const claims = parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ roles }), settings, 1_800_000_000_000);
      expect(claims.scopes).toEqual([...expectedScopes].sort());
    }
  });

  it("requires the exact read role without implying it from admin or write roles", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    for (const roles of [undefined, [], ["admin"], ["aurion_admin_assets_write"], ["aurion_admin_authoring_write"], "aurion_admin_read", ["aurion_admin_read "], ["Aurion_admin_read"], [{ role: "aurion_admin_read" }]]) {
      expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({
        roles, scope: `openid ${AURION_ADMIN_MCP_READ_SCOPE} ${AURION_ADMIN_GLB_WRITE_SCOPE} ${AURION_ADMIN_AUTHORING_WRITE_SCOPE}`,
      }), settings, 1_800_000_000_000)).toThrow("aurion_admin_read application role");
    }
  });

  it("ignores custom scopes when deriving application-role permissions", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    const claims = parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({
      scope: `openid ${AURION_ADMIN_MCP_READ_SCOPE} ${AURION_ADMIN_GLB_WRITE_SCOPE} ${AURION_ADMIN_AUTHORING_WRITE_SCOPE}`,
      roles: ["aurion_admin_read"],
    }), settings, 1_800_000_000_000);
    expect(claims.scopes).toEqual([AURION_ADMIN_MCP_READ_SCOPE]);
  });

  it("requires openid in supplied scope claims while accepting its absence on access tokens", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    for (const scope of ["profile offline_access", AURION_ADMIN_MCP_READ_SCOPE, "", [], null, 123]) {
      expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ scope }), settings, 1_800_000_000_000)).toThrow("openid scope");
    }
    for (const scope of [undefined, "openid", ["openid", "profile"]]) {
      expect(parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ scope }), settings, 1_800_000_000_000).scopes).toEqual([AURION_ADMIN_MCP_READ_SCOPE]);
    }
  });

  it("preserves issuer, stable subject and exact expiry validation in application-role mode", () => {
    const settings = readAurionAdminMcpSettings(applicationRoleEnvironment);
    expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ iss: "https://id.other.example" }), settings, 1_800_000_000_000)).toThrow("issuer");
    expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ sub: "invalid subject" }), settings, 1_800_000_000_000)).toThrow("subject");
    const expiresAtMs = 1_800_000_600_000;
    const claims = validApplicationRoleClaims({ exp: expiresAtMs / 1000 });
    expect(parseAurionAdminMcpTokenClaims(claims, settings, expiresAtMs - 1).expiresAtSeconds).toBe(expiresAtMs / 1000);
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, expiresAtMs)).toThrow("expired");
    for (const exp of [undefined, "1800000600", Number.NaN, 1_800_000_600.5]) {
      expect(() => parseAurionAdminMcpTokenClaims(validApplicationRoleClaims({ exp }), settings, 1_800_000_000_000)).toThrow("expired");
    }
    expect(() => parseAurionAdminMcpTokenClaims(claims, settings, Number.NaN)).toThrow("OPERATIONAL_TIME_INVALID");
  });

  it("derives a stable Aurion user key from issuer and subject without trusting display claims", () => {
    expect(openIdForOidcSubject("https://id.arelogic.space", "fusionauth-user-01")).toHaveLength(64);
    expect(openIdForOidcSubject("https://id.arelogic.space", "fusionauth-user-01")).not.toBe(openIdForOidcSubject("https://id.other.example", "fusionauth-user-01"));
    expect(() => openIdForOidcSubject("https://id.arelogic.space", "bad subject with spaces")).toThrow("subject");
  });
});
