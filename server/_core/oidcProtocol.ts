import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const OIDC_DISCOVERY_TTL_MS = 10 * 60 * 1000;
const OIDC_REQUEST_TIMEOUT_MS = 8_000;

export type OidcSettings = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
};

export type OidcMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

export type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type OidcIdentity = {
  openId: string;
  name: string;
  email: string | null;
  loginMethod: "oidc";
};

type DiscoveryCacheEntry = {
  metadata: OidcMetadata;
  expiresAt: number;
};

const discoveryCache = new Map<string, DiscoveryCacheEntry>();

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be configured`);
  }
  return value.trim();
}

function normalizeHttpsUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error(`${label} must be a plain HTTPS URL without credentials, query, or fragment`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function assertSameOriginHttps(value: unknown, label: string, issuer: string): string {
  const normalized = normalizeHttpsUrl(asNonEmptyString(value, label), label);
  const endpoint = new URL(normalized);
  const issuerOrigin = new URL(issuer).origin;
  if (endpoint.origin !== issuerOrigin) {
    throw new Error(`${label} must use the configured issuer origin`);
  }
  return normalized;
}

export function readOidcSettings(environment: NodeJS.ProcessEnv): OidcSettings {
  const issuerUrl = normalizeHttpsUrl(asNonEmptyString(environment.OIDC_ISSUER_URL, "OIDC_ISSUER_URL"), "OIDC_ISSUER_URL");
  const clientId = asNonEmptyString(environment.OIDC_CLIENT_ID, "OIDC_CLIENT_ID");
  const clientSecret = asNonEmptyString(environment.OIDC_CLIENT_SECRET, "OIDC_CLIENT_SECRET");
  const redirectUri = normalizeHttpsUrl(asNonEmptyString(environment.OIDC_REDIRECT_URI, "OIDC_REDIRECT_URI"), "OIDC_REDIRECT_URI");
  const scope = (environment.OIDC_SCOPE ?? "openid profile email").trim();
  if (!scope.split(/\s+/).includes("openid")) {
    throw new Error("OIDC_SCOPE must include openid");
  }
  return { issuerUrl, clientId, clientSecret, redirectUri, scope };
}

export function isOidcConfigured(environment: NodeJS.ProcessEnv): boolean {
  return ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"]
    .every(key => typeof environment[key] === "string" && environment[key]!.trim().length > 0);
}

export function createOidcTransaction(random: (length: number) => Buffer = randomBytes): OidcTransaction {
  const state = random(32).toString("base64url");
  const nonce = random(32).toString("base64url");
  const codeVerifier = random(48).toString("base64url");
  return { state, nonce, codeVerifier };
}

export function serializeOidcTransaction(transaction: OidcTransaction): string {
  return Buffer.from(JSON.stringify(transaction), "utf8").toString("base64url");
}

export function parseOidcTransaction(value: string | undefined): OidcTransaction | null {
  if (!value || value.length > 2_048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed.state !== "string" || parsed.state.length < 40 ||
      typeof parsed.nonce !== "string" || parsed.nonce.length < 40 ||
      typeof parsed.codeVerifier !== "string" || parsed.codeVerifier.length < 43
    ) {
      return null;
    }
    return { state: parsed.state, nonce: parsed.nonce, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}

export function oidcStateMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export function codeChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function buildAuthorizationUrl(
  settings: OidcSettings,
  metadata: OidcMetadata,
  transaction: OidcTransaction,
): string {
  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("scope", settings.scope);
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("nonce", transaction.nonce);
  url.searchParams.set("code_challenge", codeChallengeFor(transaction.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function parseMetadata(value: unknown, settings: OidcSettings): OidcMetadata {
  if (!value || typeof value !== "object") throw new Error("OIDC discovery response must be an object");
  const response = value as Record<string, unknown>;
  const issuer = normalizeHttpsUrl(asNonEmptyString(response.issuer, "OIDC discovery issuer"), "OIDC discovery issuer");
  if (issuer !== settings.issuerUrl) throw new Error("OIDC discovery issuer does not match OIDC_ISSUER_URL");
  return {
    issuer,
    authorizationEndpoint: assertSameOriginHttps(response.authorization_endpoint, "OIDC authorization_endpoint", issuer),
    tokenEndpoint: assertSameOriginHttps(response.token_endpoint, "OIDC token_endpoint", issuer),
    jwksUri: assertSameOriginHttps(response.jwks_uri, "OIDC jwks_uri", issuer),
  };
}

export async function discoverOidcMetadata(settings: OidcSettings, request: typeof fetch = fetch): Promise<OidcMetadata> {
  const cached = discoveryCache.get(settings.issuerUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const discoveryUrl = `${settings.issuerUrl}/.well-known/openid-configuration`;
  const response = await request(discoveryUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const metadata = parseMetadata(await response.json(), settings);
  discoveryCache.set(settings.issuerUrl, { metadata, expiresAt: Date.now() + OIDC_DISCOVERY_TTL_MS });
  return metadata;
}

export async function exchangeOidcCode(
  settings: OidcSettings,
  metadata: OidcMetadata,
  code: string,
  codeVerifier: string,
  request: typeof fetch = fetch,
): Promise<string> {
  const response = await request(metadata.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`, "utf8").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.redirectUri,
      client_id: settings.clientId,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  if (typeof body.id_token !== "string" || body.id_token.length < 20) {
    throw new Error("OIDC token response did not contain an id_token");
  }
  return body.id_token;
}

function optionalString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

export function identityFromVerifiedIdToken(payload: JWTPayload, issuer: string, expectedNonce: string): OidcIdentity {
  const subject = optionalString(payload.sub, 1_024);
  if (!subject) throw new Error("OIDC id_token did not contain a valid subject");
  if (!oidcStateMatches(expectedNonce, typeof payload.nonce === "string" ? payload.nonce : "")) {
    throw new Error("OIDC id_token nonce did not match the login transaction");
  }
  const openId = createHash("sha256").update(`${issuer}\u0000${subject}`, "utf8").digest("hex");
  const email = optionalString(payload.email, 320);
  const name = optionalString(payload.name, 500)
    ?? optionalString(payload.preferred_username, 500)
    ?? email
    ?? "Aurion-Reisende:r";
  return { openId, name, email, loginMethod: "oidc" };
}

export async function verifyOidcIdToken(
  idToken: string,
  settings: OidcSettings,
  metadata: OidcMetadata,
  expectedNonce: string,
): Promise<OidcIdentity> {
  const keySet = createRemoteJWKSet(new URL(metadata.jwksUri));
  const { payload } = await jwtVerify(idToken, keySet, {
    issuer: metadata.issuer,
    audience: settings.clientId,
  });
  return identityFromVerifiedIdToken(payload, metadata.issuer, expectedNonce);
}

export function clearOidcDiscoveryCache(): void {
  discoveryCache.clear();
}
