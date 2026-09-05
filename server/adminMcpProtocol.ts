import { validEpochMilliseconds } from "../shared/operationalClock";
import { createHash } from "node:crypto";

/**
 * Dedicated resource contract for the ChatGPT-facing administrative MCP.
 * It is intentionally independent from the paired gameplay `/mcp` channel.
 */
export const AURION_ADMIN_MCP_PATH = "/admin-mcp" as const;
export const AURION_ADMIN_MCP_READ_SCOPE = "aurion.admin.read" as const;
export const AURION_ADMIN_GLB_WRITE_SCOPE = "aurion.admin.assets.write" as const;
export const AURION_ADMIN_MCP_SCOPES = [AURION_ADMIN_MCP_READ_SCOPE, AURION_ADMIN_GLB_WRITE_SCOPE] as const;

export type AurionAdminMcpScope = (typeof AURION_ADMIN_MCP_SCOPES)[number];

export type AurionAdminMcpSettings = {
  resourceUrl: string;
  authorizationServerUrl: string;
  protectedResourceMetadataUrl: string;
};

export type AurionAdminMcpTokenClaims = {
  issuer: string;
  subject: string;
  audience: readonly string[];
  scopes: readonly string[];
  expiresAtSeconds: number;
};

function normalizeHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be configured`);
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be a plain HTTPS URL without credentials, query, or fragment`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function parseScopeClaim(value: unknown): readonly string[] {
  const raw = typeof value === "string" ? value.split(/\s+/) : Array.isArray(value) ? value : [];
  const filtered = raw.filter((scope): scope is string => typeof scope === "string" && /^[a-z][a-z0-9._:-]{2,95}$/.test(scope));
  return Object.freeze(Array.from(new Set(filtered)).sort());
}

function parseAudienceClaim(value: unknown): readonly string[] {
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const filtered = raw.filter((audience): audience is string => typeof audience === "string" && audience.length > 0 && audience.length <= 512);
  return Object.freeze(Array.from(new Set(filtered)).sort());
}

/** Reads only the OAuth resource-server settings needed by the administrative MCP. */
export function readAurionAdminMcpSettings(environment: NodeJS.ProcessEnv): AurionAdminMcpSettings {
  const resourceUrl = normalizeHttpsUrl(environment.AURION_ADMIN_MCP_RESOURCE_URL, "AURION_ADMIN_MCP_RESOURCE_URL");
  const authorizationServerUrl = normalizeHttpsUrl(environment.OIDC_ISSUER_URL, "OIDC_ISSUER_URL");
  if (new URL(resourceUrl).pathname !== AURION_ADMIN_MCP_PATH) {
    throw new Error(`AURION_ADMIN_MCP_RESOURCE_URL must end with ${AURION_ADMIN_MCP_PATH}`);
  }
  return Object.freeze({
    resourceUrl,
    authorizationServerUrl,
    protectedResourceMetadataUrl: new URL("/.well-known/oauth-protected-resource", resourceUrl).toString().replace(/\/$/, ""),
  });
}

export function hasAurionAdminMcpReadScope(scopes: readonly string[]): boolean {
  return scopes.includes(AURION_ADMIN_MCP_READ_SCOPE);
}

export function openIdForOidcSubject(issuer: string, subject: string): string {
  const normalizedIssuer = normalizeHttpsUrl(issuer, "OIDC issuer");
  if (!/^[A-Za-z0-9._:@/-]{1,1024}$/.test(subject)) throw new Error("OIDC subject is invalid");
  return createHash("sha256").update(`${normalizedIssuer}\u0000${subject}`, "utf8").digest("hex");
}

/** Validates untrusted verified-JWT payload fields before role resolution in Aurion's database. */
export function parseAurionAdminMcpTokenClaims(value: unknown, settings: AurionAdminMcpSettings, observedAtMs: number): AurionAdminMcpTokenClaims {
  if (!value || typeof value !== "object") throw new Error("Admin MCP token claims must be an object");
  const payload = value as Record<string, unknown>;
  const issuer = normalizeHttpsUrl(payload.iss, "Admin MCP token issuer");
  if (issuer !== settings.authorizationServerUrl) throw new Error("Admin MCP token issuer does not match the configured authorization server");
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  openIdForOidcSubject(issuer, subject);
  const audience = parseAudienceClaim(payload.aud);
  if (!audience.includes(settings.resourceUrl)) throw new Error("Admin MCP token is not bound to this resource server");
  const scopes = parseScopeClaim(payload.scope);
  if (!hasAurionAdminMcpReadScope(scopes)) throw new Error("Admin MCP token lacks the required read scope");
  const expiresAtSeconds = typeof payload.exp === "number" && Number.isSafeInteger(payload.exp) ? payload.exp : 0;
  if (expiresAtSeconds <= Math.floor(validEpochMilliseconds(observedAtMs) / 1000)) throw new Error("Admin MCP token is expired");
  return Object.freeze({ issuer, subject, audience, scopes, expiresAtSeconds });
}

export function protectedResourceMetadata(settings: AurionAdminMcpSettings) {
  return Object.freeze({
    resource: settings.resourceUrl,
    authorization_servers: [settings.authorizationServerUrl],
    scopes_supported: [...AURION_ADMIN_MCP_SCOPES],
    resource_documentation: "https://arelogic.space/docs/aurion-admin-mcp",
  });
}

export function bearerChallenge(settings: AurionAdminMcpSettings): string {
  return `Bearer resource_metadata=${JSON.stringify(settings.protectedResourceMetadataUrl)}, scope=${JSON.stringify(AURION_ADMIN_MCP_READ_SCOPE)}`;
}
